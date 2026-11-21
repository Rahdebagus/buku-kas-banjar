import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {createHmac} from 'node:crypto';
import {seal,unpack} from '../auth-utils.js';

test('Alokasi, pengeluaran, isolasi divisi, konflik revisi dan pencabutan akses',()=>{
 const events=[],key='x'.repeat(48),boss='boss@example.com',user='staff@example.com';
 const context=vm.createContext({
 LockService:{getScriptLock:()=>({tryLock:()=>true,hasLock:()=>true,releaseLock(){}})},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>({OWNER_EMAIL:boss,SHEETS_SECRET:key,SHEET_ID:'mock'}[k])})},
 Utilities:{Charset:{UTF_8:'UTF-8'},computeHmacSha256Signature:(p,s)=>createHmac('sha256',s).update(p).digest(),base64EncodeWebSafe:b=>b.toString('base64url')},
 SpreadsheetApp:{flush(){},openById:()=>({getSheetByName:()=>({getLastRow:()=>events.length+1,getRange:()=>({getValues:()=>events.map(e=>[e[8]])}),appendRow:r=>events.push(r)})})},
 ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})}
 });
 vm.runInContext(fs.readFileSync(new URL('../google/Code.gs',import.meta.url),'utf8'),context);
 function call(email,action=null,bad=false){const payload=JSON.stringify({email,time:Date.now(),action});return context.doPost({postData:{contents:JSON.stringify({payload,signature:bad?'invalid':createHmac('sha256',key).update(payload).digest('base64url')})}})}
 const add=(email,type,rest={})=>call(email,{rev:events.length,type,...rest});
 assert.equal(call(boss,null,true).status,403);assert.equal(call(user).status,403);
 for(const d of ['Upacara','Konsumsi'])assert.equal(add(boss,'Divisi',{div:d}).status,200);
 assert.equal(add(boss,'Saldo awal',{amount:500000}).status,200);
 const tx={div:'Upacara',date:'2026-11-22',cat:'Saldo awal',amount:100000};
 assert.equal(add(boss,'Alokasi',tx).status,200);assert.equal(add(boss,'Akses',{email:user,div:'Upacara'}).status,200);
 let v=call(user).body.state;assert.deepEqual(v.divisions,['Upacara']);assert.ok(!('opening'in v));assert.ok(!('members'in v));
 assert.equal(add(user,'Pengeluaran',{...tx,div:'Konsumsi'}).status,403);assert.equal(add(user,'Saldo awal',{amount:0}).status,403);
 assert.equal(add(user,'Pengeluaran',{...tx,amount:25000,cat:'Bensin'}).status,200);
 assert.equal(add(user,'Pengeluaran',{...tx,amount:76000}).status,400);assert.equal(add(user,'Pengeluaran',{...tx,rev:1}).status,409);
 const totals=context.summary(call(boss).body.state);assert.equal(totals.center,400000);assert.equal(totals.balances.get('Upacara'),75000);
 assert.equal(add(boss,'Cabut',{email:user}).status,200);assert.equal(call(user).status,403);
});
test('Pemasukan menambah kas, pengurus hanya mencatat di divisinya, dan nomor bukti berurutan',()=>{
 const events=[],key='y'.repeat(48),boss='boss@example.com',user='staff@example.com';
 const context=vm.createContext({
 LockService:{getScriptLock:()=>({tryLock:()=>true,hasLock:()=>true,releaseLock(){}})},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>({OWNER_EMAIL:boss,SHEETS_SECRET:key,SHEET_ID:'mock'}[k])})},
 Utilities:{Charset:{UTF_8:'UTF-8'},computeHmacSha256Signature:(p,s)=>createHmac('sha256',s).update(p).digest(),base64EncodeWebSafe:b=>b.toString('base64url')},
 SpreadsheetApp:{flush(){},openById:()=>({getSheetByName:()=>({getLastRow:()=>events.length+1,getRange:()=>({getValues:()=>events.map(e=>[e[8]])}),appendRow:r=>events.push(r)})})},
 ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})}
 });
 vm.runInContext(fs.readFileSync(new URL('../google/Code.gs',import.meta.url),'utf8'),context);
 const call=(email,action=null)=>{const payload=JSON.stringify({email,time:Date.now(),action});return context.doPost({postData:{contents:JSON.stringify({payload,signature:createHmac('sha256',key).update(payload).digest('base64url')})}})};
 const add=(email,type,rest={})=>call(email,{rev:events.length,type,...rest});
 const day={date:'2026-11-22'};
 for(const d of ['Upacara','Konsumsi'])add(boss,'Divisi',{div:d});
 assert.equal(add(boss,'Pemasukan',{...day,div:'Pimpinan',cat:'Iuran warga',amount:300000}).status,200);
 assert.equal(add(boss,'Alokasi',{...day,div:'Upacara',cat:'Saldo awal',amount:100000}).status,200);
 assert.equal(add(boss,'Akses',{email:user,div:'Upacara'}).status,200);
 assert.equal(add(user,'Pemasukan',{...day,div:'Upacara',cat:'Donasi',amount:50000}).status,200);
 assert.equal(add(user,'Pemasukan',{...day,div:'Konsumsi',cat:'Donasi',amount:50000}).status,403);
 assert.equal(add(user,'Alokasi',{...day,div:'Upacara',cat:'Saldo awal',amount:1}).status,403);
 assert.equal(add(user,'Pengeluaran',{...day,div:'Upacara',cat:'Bensin',amount:150000}).status,200);
 assert.equal(add(boss,'Pemasukan',{...day,div:'Pimpinan',cat:'Iuran warga',amount:0}).status,400);
 const s=call(boss).body.state,t=context.summary(s);
 assert.equal(t.center,200000);assert.equal(t.balances.get('Upacara'),0);assert.equal(t.income,350000);assert.equal(t.spent,150000);
 assert.equal(t.incomeCats.get('Donasi'),50000);
 assert.deepEqual(s.rows.map(r=>r[7]),[1,2,3,4]);
 assert.equal(s.rows[2][6],user);assert.equal(s.rows[0][6],boss);
 const v=call(user).body.state;assert.deepEqual(v.rows.map(r=>r[1]),['Alokasi','Pemasukan','Pengeluaran']);
});
test('Cookie sesi memeriksa tanda tangan dan masa berlaku',()=>{process.env.SESSION_SECRET='a'.repeat(48);const t=seal({email:'a@b.id',exp:Date.now()+10000});assert.equal(unpack(t).email,'a@b.id');assert.equal(unpack(t+'x'),null);assert.equal(unpack(seal({exp:0})),null)});
