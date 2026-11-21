import {mac,cookie,unpack} from '../auth-utils.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 try{
 const user=unpack(cookie(req,'__Host-kas'));if(!user)return res.status(401).json({error:'Silakan masuk dengan Google.'});
 if(!['GET','POST'].includes(req.method))return res.status(405).end();
 if(req.method==='POST'&&req.headers.origin!==new URL(process.env.APP_ORIGIN).origin)return res.status(403).json({error:'Permintaan ditolak.'});
 const action=req.method==='POST'?req.body:null;
 if(req.method==='POST'&&(!action||typeof action!=='object'||Array.isArray(action)))return res.status(400).json({error:'Formulir tidak valid.'});
 const payload=JSON.stringify({email:user.email,time:Date.now(),action});
 const upstream=await fetch(process.env.SCRIPT_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature:mac(payload,process.env.SHEETS_SECRET)})});
 if(!upstream.ok)throw Error();const result=await upstream.json();
 return res.status(result.status).json(result.body)
 }catch{return res.status(503).json({error:'Google Sheets belum terhubung. Periksa konfigurasi atau coba lagi.'})}
}
