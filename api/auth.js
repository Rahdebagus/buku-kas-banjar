import {createHash} from 'node:crypto';
import {random,seal,cookie,unpack,setCookie} from '../auth-utils.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 try{
 const origin=new URL(process.env.APP_ORIGIN).origin,redirect=origin+'/api/callback';
 const action=req.query.action;
 if(action==='logout'&&req.method==='POST'&&req.headers.origin===origin){
 res.setHeader('Set-Cookie',setCookie('__Host-kas','',0));return res.redirect(303,'/')}
 if(req.method!=='GET')return res.status(405).end();
 if(action==='login'){
 const state=random(),verifier=random();
 res.setHeader('Set-Cookie',setCookie('__Host-oauth',seal({state,verifier,exp:Date.now()+600000}),600));
 const params=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:redirect,response_type:'code',scope:'openid email',prompt:'select_account',state,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')});
 return res.redirect(302,'https://accounts.google.com/o/oauth2/v2/auth?'+params)
 }
 if(action!=='callback')return res.status(404).end();
 const flow=unpack(cookie(req,'__Host-oauth'));if(!flow||flow.state!==req.query.state||!req.query.code)return res.status(400).send('Login kedaluwarsa. Kembali ke halaman utama.');
 const token=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,grant_type:'authorization_code',redirect_uri:redirect,code:req.query.code,code_verifier:flow.verifier})});
 if(!token.ok)throw Error();const {access_token}=await token.json();
 const profile=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+access_token}});
 const user=await profile.json();if(!profile.ok||user.email_verified!==true||!user.email)return res.status(403).send('Gunakan akun Google dengan email terverifikasi.');
 res.setHeader('Set-Cookie',[setCookie('__Host-oauth','',0),setCookie('__Host-kas',seal({email:user.email.toLowerCase(),exp:Date.now()+8*3600000}),28800)]);return res.redirect(303,'/')
 }catch{return res.status(503).send('Login gagal. Periksa konfigurasi Google dan Vercel, lalu coba lagi.')}
}
