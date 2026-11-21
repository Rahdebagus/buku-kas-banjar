import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
export const random=()=>randomBytes(32).toString('base64url');
export function mac(text,key){if(!key||key.length<32)throw Error('Secret belum dikonfigurasi.');return createHmac('sha256',key).update(text).digest('base64url')}
export function seal(value){const body=Buffer.from(JSON.stringify(value)).toString('base64url');return body+'.'+mac(body,process.env.SESSION_SECRET)}
export function cookie(req,name){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)}
export function unpack(value){
 if(!value)return null;const [body,tag]=value.split('.');const sig=mac(body,process.env.SESSION_SECRET);
 if(!tag||Buffer.byteLength(tag)!==sig.length||!timingSafeEqual(Buffer.from(tag),Buffer.from(sig)))return null;
 const data=JSON.parse(Buffer.from(body,'base64url'));return data.exp>Date.now()?data:null;
}
export const setCookie=(name,value,age)=>name+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+age;
