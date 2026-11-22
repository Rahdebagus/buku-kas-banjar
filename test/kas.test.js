import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {createHmac} from 'node:crypto';
import {seal,unpack} from '../auth-utils.js';

const boss='boss@example.com',user='staff@example.com';
// Simulasi Apps Script: Sheet, Properties, Lock, dan Drive dalam memori.
function makeScript(key,extraProps={}){
 const events=[],props={OWNER_EMAIL:boss,SHEETS_SECRET:key,SHEET_ID:'mock',...extraProps},drive={folders:[],files:new Map()},sent=[];
 function folder(name,parent){
  const f={name,parent,children:[],getId:()=>'folder-'+name,getUrl:()=>'https://drive/'+name,
   getFoldersByName:n=>{const hit=f.children.filter(c=>c.name===n);return {hasNext:()=>hit.length>0,next:()=>hit.shift()}},
   createFolder:n=>{const c=folder(n,f);f.children.push(c);return c},
   createFile:blob=>{const id='file'+(drive.files.size+1),file={id,folder:f,blob,getId:()=>id,getName:()=>blob.name,getUrl:()=>'https://drive.google.com/file/d/'+id+'/view',getBlob:()=>({getContentType:()=>blob.type,getBytes:()=>blob.bytes}),setDescription(d){file.description=d}};drive.files.set(id,file);return file}};
  drive.folders.push(f);return f;
 }
 const context=vm.createContext({
  LockService:{getScriptLock:()=>({tryLock:()=>true,hasLock:()=>true,releaseLock(){}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>{props[k]=v}})},
  Utilities:{Charset:{UTF_8:'UTF-8'},computeHmacSha256Signature:(p,s)=>createHmac('sha256',s).update(p).digest(),base64EncodeWebSafe:b=>b.toString('base64url'),
   base64Decode:s=>[...Buffer.from(s,'base64')],base64Encode:b=>Buffer.from(b).toString('base64'),newBlob:(bytes,type,name)=>({bytes,type,name})},
  UrlFetchApp:{fetchAll:reqs=>{for(const r of reqs)sent.push({url:r.url,...JSON.parse(r.payload)});return reqs.map(()=>({getResponseCode:()=>200}))}},
  console:{warn(){}},
  DriveApp:{createFolder:n=>folder(n,null),getFolderById:id=>drive.folders.find(f=>f.getId()===id),getFileById:id=>drive.files.get(id)},
  SpreadsheetApp:{flush(){},openById:()=>({getSheetByName:()=>({getLastRow:()=>events.length+1,getRange:()=>({getValues:()=>events.map(e=>[e[8]]),getValue:()=>'Bukti',setValue(){return this},setFontWeight(){}}),appendRow:r=>events.push(r)})})},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})}
 });
 vm.runInContext(fs.readFileSync(new URL('../google/Code.gs',import.meta.url),'utf8'),context);
 function call(email,action=null,bad=false){const payload=JSON.stringify({email,time:Date.now(),action});return context.doPost({postData:{contents:JSON.stringify({payload,signature:bad?'invalid':createHmac('sha256',key).update(payload).digest('base64url')})}})}
 const add=(email,type,rest={})=>call(email,{rev:events.length,type,...rest});
 return {context,events,props,drive,sent,call,add};
}

test('Alokasi, pengeluaran, isolasi divisi, konflik revisi dan pencabutan akses',()=>{
 const {context,events,call,add}=makeScript('x'.repeat(48));
 assert.equal(call(boss,null,true).status,403);assert.equal(call(user).status,403);
 for(const d of ['Upacara','Konsumsi'])assert.equal(add(boss,'Divisi',{div:d}).status,200);
 assert.equal(add(boss,'Saldo awal',{amount:500000}).status,200);
 const tx={div:'Upacara',date:'2026-11-22',cat:'Saldo awal',amount:100000};
 assert.equal(add(boss,'Alokasi',tx).status,200);assert.equal(add(boss,'Akses',{email:user,div:'Upacara'}).status,200);
 let v=call(user).body.state;assert.deepEqual(v.divisions,['Upacara']);assert.ok(!('opening'in v));assert.ok(!('members'in v));
 assert.equal(add(user,'Pengeluaran',{...tx,div:'Konsumsi'}).status,403);assert.equal(add(user,'Saldo awal',{amount:0}).status,403);
 assert.equal(add(user,'Pengeluaran',{...tx,amount:25000,cat:'Bensin'}).status,200);
 assert.equal(add(user,'Pengeluaran',{...tx,amount:76000}).status,400);assert.equal(call(user,{...tx,type:'Pengeluaran',rev:1}).status,409);
 const totals=context.summary(call(boss).body.state);assert.equal(totals.center,400000);assert.equal(totals.balances.get('Upacara'),75000);
 assert.equal(add(boss,'Cabut',{email:user}).status,200);assert.equal(call(user).status,403);
 assert.equal(events.length,7);
});

test('Pemasukan menambah kas, pengurus hanya mencatat di divisinya, dan nomor bukti berurutan',()=>{
 const {context,call,add}=makeScript('y'.repeat(48));
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

test('Bukti diunggah ke Drive per tahun/bulan/divisi, dapat dilampirkan belakangan, dan dibatasi per divisi',()=>{
 const {events,props,drive,call,add}=makeScript('z'.repeat(48));
 const jpg={type:'image/jpeg',name:'nota.jpg',data:Buffer.from('foto-nota').toString('base64')};
 for(const d of ['Upacara','Konsumsi'])add(boss,'Divisi',{div:d});
 add(boss,'Pemasukan',{date:'2026-11-05',div:'Pimpinan',cat:'Punia',amount:500000});
 add(boss,'Alokasi',{date:'2026-11-06',div:'Upacara',cat:'Saldo awal',amount:200000});
 add(boss,'Alokasi',{date:'2026-11-06',div:'Konsumsi',cat:'Saldo awal',amount:100000});
 add(boss,'Akses',{email:user,div:'Upacara'});
 // Pengeluaran dengan bukti langsung
 const r1=add(user,'Pengeluaran',{date:'2026-11-20',div:'Upacara',cat:'Bensin',amount:50000,file:jpg});
 assert.equal(r1.status,200);
 const row=r1.body.state.rows.find(r=>r[7]===4);assert.match(row[8],/^file\d+$/);
 const saved=drive.files.get(row[8]);
 assert.equal(Buffer.from(saved.blob.bytes).toString(),'foto-nota');
 assert.equal(saved.getName(),'JU-0004 2026-11-20 Pengeluaran Bensin Rp50000.jpg');
 assert.deepEqual([saved.folder.name,saved.folder.parent.name,saved.folder.parent.parent.name,saved.folder.parent.parent.parent.name],['Divisi Upacara','11 November','2026','Bukti Kas Banjar']);
 assert.equal(props.DRIVE_FOLDER_ID,'folder-Bukti Kas Banjar');
 assert.equal(events.at(-1)[9],'https://drive.google.com/file/d/'+row[8]+'/view');
 assert.ok(!events.at(-1)[8].includes('foto-nota')&&!events.at(-1)[8].includes(jpg.data),'isi berkas tidak boleh masuk Sheet');
 // Bukti menyusul untuk transaksi lama milik pimpinan; folder yang sama dipakai ulang
 assert.equal(add(user,'Bukti',{no:1,file:jpg}).status,403);
 assert.equal(add(boss,'Bukti',{no:1}).status,400);
 const r2=add(boss,'Bukti',{no:1,file:{...jpg,type:'application/pdf',name:'punia.pdf'}});assert.equal(r2.status,200);
 const pdf=drive.files.get(r2.body.state.rows[0][8]);assert.equal(pdf.folder.name,'Kas Pimpinan');assert.match(pdf.getName(),/^JU-0001 .*\.pdf$/);
 assert.equal(drive.folders.filter(f=>f.name==='2026').length,1);
 // Format ditolak
 assert.equal(add(boss,'Bukti',{no:2,file:{...jpg,type:'text/html'}}).status,400);
 // Lihat bukti: pengurus hanya divisinya
 const seen=call(user,{type:'Lihat bukti',no:4});assert.equal(seen.status,200);assert.equal(Buffer.from(seen.body.data,'base64').toString(),'foto-nota');assert.equal(seen.body.url,'');
 assert.equal(call(user,{type:'Lihat bukti',no:1}).status,403);
 assert.equal(call(user,{type:'Lihat bukti',no:3}).status,403);
 assert.equal(call(boss,{type:'Lihat bukti',no:2}).status,404);
 assert.match(call(boss,{type:'Lihat bukti',no:1}).body.url,/drive\.google\.com/);
 // Riwayat diputar ulang dengan benar setelah reload
 const again=call(boss).body.state;assert.equal(again.rows[0][8],pdf.id);assert.equal(again.rows[3][8],row[8]);
});

test('Telegram: grup pimpinan menerima semua saldo, grup divisi hanya saldonya sendiri',()=>{
 const {sent,call,add,events}=makeScript('t'.repeat(48),{TELEGRAM_BOT_TOKEN:'123:ABC',TELEGRAM_CHAT_ID:'-1001111111111'});
 for(const d of ['Upacara','Konsumsi'])add(boss,'Divisi',{div:d});
 add(boss,'Saldo awal',{amount:1000000});
 add(boss,'Alokasi',{date:'2026-11-06',div:'Upacara',cat:'Saldo awal',amount:200000});
 add(boss,'Alokasi',{date:'2026-11-06',div:'Konsumsi',cat:'Saldo awal',amount:150000});
 add(boss,'Akses',{email:user,div:'Upacara'});
 assert.ok(sent.every(m=>m.chat_id==='-1001111111111'&&m.url==='https://api.telegram.org/bot123:ABC/sendMessage'),'sebelum grup divisi diatur, hanya grup pimpinan');
 assert.match(sent.find(m=>m.text.includes('Akun pengurus')).text,/st\*\*\*@example\.com/);
 // Pengurus tidak boleh mengatur grup; chat ID harus valid
 assert.equal(add(user,'Telegram',{div:'Upacara',chat:'-1002222222222'}).status,403);
 assert.equal(add(boss,'Telegram',{div:'Upacara',chat:'bukan-angka'}).status,400);
 sent.length=0;
 assert.equal(add(boss,'Telegram',{div:'Upacara',chat:'-1002222222222'}).status,200);
 assert.deepEqual(sent.map(m=>m.chat_id).sort(),['-1001111111111','-1002222222222']);
 sent.length=0;
 assert.equal(add(user,'Pengeluaran',{date:'2026-11-21',div:'Upacara',cat:'Bensin',note:'Motor <kirim>',amount:50000}).status,200);
 const toBoss=sent.find(m=>m.chat_id==='-1001111111111'),toDiv=sent.find(m=>m.chat_id==='-1002222222222');
 assert.equal(sent.length,2);assert.equal(toBoss.parse_mode,'HTML');
 assert.match(toBoss.text,/💸 <b>Pengeluaran<\/b> · Divisi Upacara/);
 assert.match(toBoss.text,/Rp 50\.000/);assert.match(toBoss.text,/Motor &lt;kirim&gt;/);
 assert.match(toBoss.text,/Kas Pimpinan: Rp 650\.000/);assert.match(toBoss.text,/Upacara: Rp 150\.000/);assert.match(toBoss.text,/Konsumsi: Rp 150\.000/);
 assert.match(toBoss.text,/Total kas banjar: Rp 950\.000/);
 assert.match(toDiv.text,/Sisa saldo Divisi Upacara: Rp 150\.000/);
 assert.ok(!toDiv.text.includes('Konsumsi')&&!toDiv.text.includes('Kas Pimpinan:'),'grup divisi tidak melihat saldo divisi lain');
 // Transaksi divisi lain tidak dikirim ke grup Upacara
 sent.length=0;add(boss,'Pengeluaran',{date:'2026-11-21',div:'Konsumsi',cat:'Air',amount:10000});
 assert.deepEqual(sent.map(m=>m.chat_id),['-1001111111111']);
 // Pengurus tidak menerima pengaturan Telegram; pimpinan menerima status
 assert.ok(!('telegram' in call(user).body.state));
 const st=call(boss).body.state;assert.equal(st.telegram.Upacara,'-1002222222222');assert.equal(st.telegramMain,true);
 // Melepas grup divisi
 sent.length=0;add(boss,'Telegram',{div:'Upacara',chat:''});assert.ok(!('Upacara' in call(boss).body.state.telegram));
 assert.ok(events.every(e=>!String(e[8]).includes('123:ABC')),'token tidak pernah masuk Sheet');
});
test('Nama tampilan menggantikan email di Telegram dan aplikasi',()=>{
 const {sent,call,add}=makeScript('n'.repeat(48),{TELEGRAM_BOT_TOKEN:'123:ABC',TELEGRAM_CHAT_ID:'-1001111111111'});
 add(boss,'Divisi',{div:'Upacara'});
 add(boss,'Alokasi',{date:'2026-11-06',div:'Upacara',cat:'Saldo awal',amount:0});
 add(boss,'Pemasukan',{date:'2026-11-06',div:'Pimpinan',cat:'Punia',amount:500000});
 assert.match(sent.at(-1).text,/oleh Pimpinan/,'nama bawaan pimpinan');
 assert.equal(add(boss,'Profil',{name:'Ketua MTB'}).status,200);
 assert.equal(add(boss,'Profil',{name:'  '}).status,400);
 assert.equal(add(boss,'Akses',{email:user,div:'Upacara',name:'Made Upacara'}).status,200);
 assert.match(sent.at(-1).text,/Made Upacara → Divisi Upacara/);
 assert.equal(add(user,'Profil',{name:'Saya Ketua'}).status,403,'pengurus tidak boleh mengubah nama pimpinan');
 sent.length=0;
 add(boss,'Alokasi',{date:'2026-11-07',div:'Upacara',cat:'Tambahan dana',amount:100000});
 assert.match(sent[0].text,/oleh Ketua MTB/);
 sent.length=0;
 assert.equal(add(user,'Pengeluaran',{date:'2026-11-08',div:'Upacara',cat:'Bensin',amount:20000}).status,200);
 assert.match(sent[0].text,/oleh Made Upacara/);
 assert.ok(sent.every(m=>!m.text.includes('@example.com')&&!m.text.includes('***')),'email tidak tampil sama sekali');
 // Respons aplikasi membawa nama
 assert.equal(call(user).body.name,'Made Upacara');assert.equal(call(boss).body.name,'Ketua MTB');
 assert.equal(call(boss).body.state.members[0].name,'Made Upacara');
 // Ubah nama lewat Akses ulang, lalu cabut memakai nama
 add(boss,'Akses',{email:user,div:'Upacara',name:'Bli Made'});assert.equal(call(user).body.name,'Bli Made');
 sent.length=0;add(boss,'Cabut',{email:user});assert.match(sent[0].text,/dicabut[\s\S]*Bli Made/);
});
test('Pimpinan tambahan berakses penuh, tetapi akun pimpinan hanya diatur pimpinan utama',()=>{
 const {context,sent,call,add}=makeScript('p'.repeat(48),{TELEGRAM_BOT_TOKEN:'123:ABC',TELEGRAM_CHAT_ID:'-1001111111111'});
 const vice='vice@example.com',other='other@example.com',day={date:'2026-11-22'};
 add(boss,'Divisi',{div:'Upacara'});add(boss,'Saldo awal',{amount:500000});
 assert.equal(add(user,'Akses',{email:vice,div:'Pimpinan',name:'X'}).status,403,'pengurus tidak dapat mengangkat pimpinan');
 assert.equal(add(boss,'Akses',{email:vice,div:'Pimpinan',name:'Wakil'}).status,200);
 assert.match(sent.at(-1).text,/Akun pimpinan[\s\S]*Wakil → Pimpinan/);
 let r=call(vice).body;assert.equal(r.role,'pimpinan');assert.equal(r.name,'Wakil');assert.equal(r.state.isMain,false);assert.equal(r.state.opening,500000);
 assert.equal(call(boss).body.state.isMain,true);
 // Akses penuh atas kas, divisi, dan pengurus
 assert.equal(add(vice,'Alokasi',{...day,div:'Upacara',cat:'Saldo awal',amount:100000}).status,200);
 assert.match(sent.at(-1).text,/oleh Wakil/);
 assert.equal(add(vice,'Pemasukan',{...day,div:'Pimpinan',cat:'Punia',amount:50000}).status,200);
 assert.equal(add(vice,'Divisi',{div:'Konsumsi'}).status,200);
 assert.equal(add(vice,'Akses',{email:user,div:'Upacara',name:'Made'}).status,200);
 assert.equal(add(vice,'Saldo awal',{amount:600000}).status,200);
 assert.equal(context.summary(call(boss).body.state).center,550000);
 // Batasan: akun pimpinan dan nama pimpinan utama
 assert.equal(add(vice,'Akses',{email:other,div:'Pimpinan',name:'Lain'}).status,403);
 assert.equal(add(vice,'Cabut',{email:vice}).status,403);
 assert.equal(add(vice,'Akses',{email:vice,div:'Upacara',name:'Wakil'}).status,403,'tidak dapat memindahkan pimpinan ke divisi');
 assert.equal(add(vice,'Profil',{name:'Ketua baru'}).status,403);
 assert.equal(add(vice,'Cabut',{email:boss}).status,400);
 // Pimpinan utama mencabut pimpinan tambahan
 assert.equal(add(boss,'Cabut',{email:vice}).status,200);assert.equal(call(vice).status,403);
});
test('Tanpa token Telegram, transaksi tetap berjalan tanpa notifikasi',()=>{
 const {sent,add}=makeScript('u'.repeat(48));
 add(boss,'Divisi',{div:'Upacara'});
 assert.equal(add(boss,'Pemasukan',{date:'2026-11-21',div:'Pimpinan',cat:'Punia',amount:1000}).status,200);
 assert.equal(sent.length,0);
});
test('Cookie sesi memeriksa tanda tangan dan masa berlaku',()=>{process.env.SESSION_SECRET='a'.repeat(48);const t=seal({email:'a@b.id',exp:Date.now()+10000});assert.equal(unpack(t).email,'a@b.id');assert.equal(unpack(t+'x'),null);assert.equal(unpack(seal({exp:0})),null)});
