// Baris transaksi: [tanggal, jenis, divisi, nominal, kategori, keterangan, dicatat oleh, nomor bukti, ID file bukti di Drive]
// summary() harus identik dengan public/app.js
function summary(s){
 let center=s.opening||0,spent=0,income=0;const balances=new Map(s.divisions.map(d=>[d,0])),cats=new Map(),incomeCats=new Map();
 for(const [,type,div,n,cat] of s.rows){
 let v=balances.get(div)||0;
 if(type==='Alokasi'){center-=n;v+=n}
 if(type==='Pengembalian'){center+=n;v-=n}
 if(type==='Pengeluaran'){spent+=n;cats.set(cat,(cats.get(cat)||0)+n);if(div==='Pimpinan')center-=n;else v-=n}
 if(type==='Pemasukan'){income+=n;incomeCats.set(cat,(incomeCats.get(cat)||0)+n);if(div==='Pimpinan')center+=n;else v+=n}
 if(div!=='Pimpinan')balances.set(div,v)
 } return {center,spent,income,balances,cats,incomeCats};
}
const TX_TYPES=['Pemasukan','Pengeluaran','Alokasi','Pengembalian'];
function apply(s,a){
 const clean=x=>typeof x==='string'?x.trim().slice(0,120):'';
 const div=clean(a.div),n=a.amount,type=a.type;
 if(type==='Divisi'){if(!div||['Pimpinan',...s.divisions].some(d=>d.toLowerCase()===div.toLowerCase()))throw Error('Nama divisi kosong atau sudah digunakan.');s.divisions.push(div);return}
 if(!Number.isSafeInteger(n)||n<0||n>1e14)throw Error('Periksa nominal rupiah.');
 const {center,balances}=summary(s);
 if(type==='Saldo awal'){if(center+n-s.opening<0)throw Error('Saldo awal terlalu kecil untuk transaksi yang sudah tercatat.');s.opening=n;return}
 const ownCash=type==='Pemasukan'||type==='Pengeluaran';
 if(!TX_TYPES.includes(type)||!n||(!s.divisions.includes(div)&&!(div==='Pimpinan'&&ownCash)))throw Error('Periksa jenis transaksi dan divisi.');
 if(type!=='Pemasukan'&&(type==='Alokasi'||div==='Pimpinan'?center:balances.get(div))<n)throw Error('Saldo sumber dana tidak mencukupi.');
 if(!/^\d{4}-\d\d-\d\d$/.test(a.date)||!clean(a.cat))throw Error('Tanggal dan kategori wajib diisi.');
 s.rows.push([a.date,type,div,n,clean(a.cat),clean(a.note),clean(a.by),s.rows.length+1,clean(a.proof)])
}

// ---------- Bukti transaksi di Google Drive ----------
// Struktur: <folder bukti>/<tahun>/<MM Bulan>/<Kas Pimpinan | Divisi X>/JU-0001 ... .jpg
const PROOF_TYPES={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'};
const PROOF_MAX_BYTES=3500000;
const MONTH_NAMES=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
function proofRoot(){
 const props=PropertiesService.getScriptProperties(),id=String(props.getProperty('DRIVE_FOLDER_ID')||'').trim();
 if(id){try{return DriveApp.getFolderById(id)}catch(err){throw Error('Folder DRIVE_FOLDER_ID tidak dapat dibuka. Periksa ID folder di Script Properties.')}}
 const folder=DriveApp.createFolder('Bukti Kas Banjar');
 props.setProperty('DRIVE_FOLDER_ID',folder.getId());
 return folder;
}
function subfolder(parent,name){const it=parent.getFoldersByName(name);return it.hasNext()?it.next():parent.createFolder(name)}
function saveProof(file,row){
 const ext=PROOF_TYPES[file.type];
 if(!ext||typeof file.data!=='string')throw Error('Format bukti harus JPG, PNG, WEBP, atau PDF.');
 let bytes;try{bytes=Utilities.base64Decode(file.data)}catch(err){throw Error('Berkas bukti rusak.')}
 if(!bytes.length||bytes.length>PROOF_MAX_BYTES)throw Error('Ukuran bukti maksimal 3,5 MB.');
 const [date,type,div,n,cat,note,,no]=row,[y,m]=date.split('-');
 const safe=x=>String(x).replace(/[\\/:*?"<>|#%\n\r]+/g,'-').trim().slice(0,60);
 const folder=subfolder(subfolder(subfolder(proofRoot(),y),m+' '+MONTH_NAMES[+m-1]),div==='Pimpinan'?'Kas Pimpinan':'Divisi '+safe(div));
 const code='JU-'+String(no).padStart(4,'0');
 const created=folder.createFile(Utilities.newBlob(bytes,file.type,code+' '+date+' '+type+' '+safe(cat)+' Rp'+n+'.'+ext));
 created.setDescription(code+' · '+type+' · '+(div==='Pimpinan'?'Kas Pimpinan':'Divisi '+div)+' · Rp'+n+(note?' · '+note:''));
 return created.getId();
}

// ---------- Notifikasi Telegram ----------
// Script Properties: TELEGRAM_BOT_TOKEN (dari @BotFather) dan TELEGRAM_CHAT_ID (chat/grup pimpinan).
// Chat tiap divisi diatur dari aplikasi (Divisi & akun) dan hanya menerima saldo divisinya.
const TG_LABEL={Pemasukan:'💰 <b>Pemasukan</b>',Pengeluaran:'💸 <b>Pengeluaran</b>',Alokasi:'🔁 <b>Bagi dana</b>',Pengembalian:'↩️ <b>Pengembalian</b>'};
const rupiah=n=>(n<0?'-':'')+'Rp '+String(Math.abs(Math.round(n||0))).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
const tgEsc=x=>String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const maskEmail=e=>{const [u,d]=String(e||'').split('@');return (u||'').slice(0,2)+'***@'+(d||'')};
const kasName=d=>d==='Pimpinan'?'Kas Pimpinan':'Divisi '+d;
const tglText=d=>{const [y,m,dd]=String(d).split('-');return dd&&m?dd+' '+MONTH_NAMES[+m-1].slice(0,3)+' '+y:''};
const juCode=no=>'JU-'+String(no).padStart(4,'0');
function telegramConfig(){const p=PropertiesService.getScriptProperties();return {token:String(p.getProperty('TELEGRAM_BOT_TOKEN')||'').trim(),main:String(p.getProperty('TELEGRAM_CHAT_ID')||'').trim()}}
// who = nama tampilan pencatat (bukan email)
function notifications(state,a,row,who){
 const {token,main}=telegramConfig();if(!token)return [];
 const s=summary(state),total=s.center+[...s.balances.values()].reduce((x,y)=>x+y,0);
 let head='',detail=[],div=null;
 if(TX_TYPES.includes(a.type)&&row){
 const [date,type,d,n,cat,note,,no,proof]=row;div=d;
 const where=type==='Alokasi'?'Kas Pimpinan → Divisi '+d:type==='Pengembalian'?'Divisi '+d+' → Kas Pimpinan':kasName(d);
 head=TG_LABEL[type]+' · '+tgEsc(where);
 detail=['<b>'+rupiah(n)+'</b> — '+tgEsc(cat)+(note?' ('+tgEsc(note)+')':''),juCode(no)+' · '+tglText(date)+' · oleh '+tgEsc(who)];
 if(proof)detail.push('📎 Bukti terlampir');
 }else if(a.type==='Bukti'&&row){
 div=row[2];head='📎 <b>Bukti dilampirkan</b> · '+tgEsc(kasName(row[2]));
 detail=[juCode(row[7])+' · '+rupiah(row[3])+' — '+tgEsc(row[4]),'oleh '+tgEsc(who)];
 }else if(a.type==='Saldo awal'){head='🏦 <b>Saldo awal diubah</b>';detail=['Saldo awal Kas Pimpinan: <b>'+rupiah(state.opening)+'</b>']}
 else if(a.type==='Divisi'){head='🏷️ <b>Divisi baru</b> · '+tgEsc(a.div)}
 else if(a.type==='Akses'){head='👤 <b>Akun pengurus diperbarui</b>';detail=[tgEsc(a.name||maskEmail(a.email))+' → Divisi '+tgEsc(a.div)]}
 else if(a.type==='Cabut'){head='🚫 <b>Akses pengurus dicabut</b>';detail=[tgEsc(a.name||maskEmail(a.email))]}
 else if(a.type==='Profil'){head='✏️ <b>Nama pimpinan</b> · '+tgEsc(a.name)}
 else if(a.type==='Telegram'){head='🔔 <b>Telegram divisi</b> · '+tgEsc(a.div);detail=[a.chat?'Grup divisi terhubung.':'Grup divisi dilepas.']}
 else return [];
 const out=[];
 if(main)out.push({chat:main,text:[head,...detail,'','<b>Sisa saldo</b>','• Kas Pimpinan: '+rupiah(s.center),...[...s.balances].map(([d,v])=>'• '+tgEsc(d)+': '+rupiah(v)),'<b>Total kas banjar: '+rupiah(total)+'</b>'].join('\n')});
 const own=div&&div!=='Pimpinan'?state.telegram[div]:'';
 if(own&&own!==main)out.push({chat:own,text:[head,...detail,'','<b>Sisa saldo '+tgEsc(kasName(div))+': '+rupiah(s.balances.get(div)||0)+'</b>'].join('\n')});
 if(a.type==='Telegram'&&a.chat&&a.chat!==main)out.push({chat:a.chat,text:'🔔 Grup ini sekarang menerima notifikasi kas <b>Divisi '+tgEsc(a.div)+'</b>.\nSisa saldo: <b>'+rupiah(s.balances.get(a.div)||0)+'</b>'});
 return out;
}
function sendTelegram(list){
 const {token}=telegramConfig();if(!token||!list.length)return [];
 try{
 return UrlFetchApp.fetchAll(list.map(m=>({url:'https://api.telegram.org/bot'+token+'/sendMessage',method:'post',contentType:'application/json',muteHttpExceptions:true,
 payload:JSON.stringify({chat_id:m.chat,text:m.text,parse_mode:'HTML',disable_web_page_preview:true})})));
 }catch(err){console.warn('Telegram gagal: '+err);return []}
}
// Jalankan dari editor Apps Script: menampilkan nama bot dan Chat ID dari pesan terakhir, lalu mengirim pesan uji.
function cekTelegram(){
 const {token,main}=telegramConfig();
 if(!token)throw Error('Isi TELEGRAM_BOT_TOKEN di Script Properties dengan token dari @BotFather.');
 const call=m=>JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/'+m,{muteHttpExceptions:true}).getContentText());
 const me=call('getMe');if(!me.ok)throw Error('Token bot tidak valid: '+me.description);
 Logger.log('Bot terhubung: @'+me.result.username);
 const chats=new Map();
 for(const u of call('getUpdates').result||[]){const c=(u.message||u.edited_message||u.channel_post||u.my_chat_member||{}).chat;if(c)chats.set(String(c.id),(c.title||[c.first_name,c.last_name].filter(Boolean).join(' '))+' ('+c.type+')')}
 if(!chats.size)Logger.log('Belum ada chat. Kirim pesan ke bot, atau tambahkan bot ke grup lalu kirim pesan di grup, kemudian jalankan cekTelegram lagi.');
 for(const [id,name] of chats)Logger.log('Chat ID '+id+'  →  '+name);
 if(main){const [r]=sendTelegram([{chat:main,text:'✅ Bot <b>Buku Kas Banjar</b> terhubung. Notifikasi kas akan dikirim ke chat ini.'}]);Logger.log('Pesan uji ke TELEGRAM_CHAT_ID '+main+': '+(r&&r.getResponseCode()===200?'terkirim':'gagal — '+(r?r.getContentText():'')))}
 else Logger.log('TELEGRAM_CHAT_ID belum diisi. Salin salah satu Chat ID di atas ke Script Properties.');
}

const HEADER=['Waktu pencatatan','Email pencatat','Aktivitas','Divisi','Nominal (Rp)','Kategori','Keterangan','Tanggal transaksi','Data sistem','Bukti'];
function ensureProofHeader(sheet){if(sheet.getRange(1,10).getValue()!=='Bukti')sheet.getRange(1,10).setValue('Bukti').setFontWeight('bold')}
function setup(){
 const lock=LockService.getScriptLock();lock.waitLock(15000);
 try{
 const file=SpreadsheetApp.getActiveSpreadsheet(),props=PropertiesService.getScriptProperties();
 if(!props.getProperty('OWNER_EMAIL')||String(props.getProperty('SHEETS_SECRET')||'').length<32)throw Error('Isi OWNER_EMAIL dan SHEETS_SECRET di Script Properties.');
 let sheet=file.getSheetByName('BukuKas');
 if(!sheet)sheet=file.insertSheet('BukuKas');
 if(sheet.getLastRow()===0){sheet.appendRow(HEADER);sheet.setFrozenRows(1);sheet.getRange('A1:J1').setFontWeight('bold');sheet.hideColumns(9);sheet.autoResizeColumns(1,8)}
 if(sheet.getRange(1,9).getValue()!==HEADER[8])throw Error('Nama BukuKas sudah digunakan oleh tabel lain.');
 ensureProofHeader(sheet);
 props.setProperty('SHEET_ID',file.getId());
 Logger.log('Folder bukti: '+proofRoot().getUrl());
 SpreadsheetApp.flush();
 }finally{lock.releaseLock()}
}
function applyEvent(s,a){
 if(a.type==='Akses'||a.type==='Cabut'){
 const email=String(a.email||'').trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw Error('Periksa email pengurus.');
 if(a.type==='Akses'&&!s.divisions.includes(a.div))throw Error('Pilih divisi yang terdaftar.');
 s.members=s.members.filter(m=>m.email!==email);
 if(a.type==='Akses')s.members.push({email,div:a.div,name:String(a.name||'').trim().slice(0,60)});return;
 }
 if(a.type==='Profil'){
 const name=String(a.name||'').trim().slice(0,60);
 if(!name)throw Error('Isi nama pimpinan.');
 s.ownerName=name;return;
 }
 if(a.type==='Telegram'){
 if(!s.divisions.includes(a.div))throw Error('Pilih divisi yang terdaftar.');
 const chat=String(a.chat||'').trim();
 if(chat&&!/^(-?\d{5,20}|@[A-Za-z0-9_]{5,32})$/.test(chat))throw Error('Chat ID Telegram tidak valid. Contoh: -1001234567890');
 if(chat)s.telegram[a.div]=chat;else delete s.telegram[a.div];
 return;
 }
 if(a.type==='Bukti'){
 const row=s.rows.find(r=>r[7]===Number(a.no));
 if(!row)throw Error('Transaksi tidak ditemukan.');
 if(!a.proof)throw Error('Pilih berkas bukti.');
 row[8]=String(a.proof);return;
 }
 apply(s,a);
}
function reply(status,body){return ContentService.createTextOutput(JSON.stringify({status,body})).setMimeType(ContentService.MimeType.JSON)}
function doPost(e){
 const lock=LockService.getScriptLock();
 try{
 const props=PropertiesService.getScriptProperties(),secret=props.getProperty('SHEETS_SECRET'),owner=String(props.getProperty('OWNER_EMAIL')||'').trim().toLowerCase();
 if(!owner||!secret||secret.length<32)return reply(503,{error:'Konfigurasi belum lengkap.'});
 const {payload,signature}=JSON.parse(e.postData.contents);
 if(typeof payload!=='string'||payload.length>4800000)return reply(400,{error:'Data tidak valid.'});
 const tag=Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload,secret,Utilities.Charset.UTF_8)).replace(/=+$/,'');
 if(tag!==signature)return reply(403,{error:'Akses ditolak.'});
 const {email,time,action}=JSON.parse(payload);
 const file=action&&action.file;
 if(payload.length>6000&&!file)return reply(400,{error:'Data tidak valid.'});
 if(!email||!Number.isFinite(time)||Math.abs(Date.now()-time)>90000)return reply(403,{error:'Permintaan kedaluwarsa.'});
 if(!lock.tryLock(12000))return reply(503,{error:'Kas sedang diperbarui. Coba lagi.'});
 const sheet=SpreadsheetApp.openById(props.getProperty('SHEET_ID')).getSheetByName('BukuKas');
 let rev=sheet.getLastRow()-1;
 const state={opening:0,divisions:[],rows:[],members:[],telegram:{},ownerName:''};
 let outbox=[];
 if(rev>0)for(const [event] of sheet.getRange(2,9,rev,1).getValues())applyEvent(state,JSON.parse(event));
 const admin=email===owner,member=state.members.find(m=>m.email===email);
 if(!admin&&!member)return reply(403,{error:'Email Anda belum terdaftar. Hubungi pimpinan.'});
 // Nama tampilan untuk Telegram dan aplikasi; email hanya disamarkan bila nama belum diisi.
 const displayName=()=>admin?(state.ownerName||'Pimpinan'):(member.name||maskEmail(email));
 const rowOf=no=>state.rows.find(r=>r[7]===Number(no));
 if(action&&action.type==='Lihat bukti'){
 const row=rowOf(action.no);
 if(!row||(!admin&&row[2]!==member.div))return reply(403,{error:'Bukti di luar akses divisi.'});
 if(!row[8])return reply(404,{error:'Transaksi ini belum memiliki bukti.'});
 lock.releaseLock();
 const proof=DriveApp.getFileById(row[8]),blob=proof.getBlob();
 return reply(200,{name:proof.getName(),mime:blob.getContentType(),data:Utilities.base64Encode(blob.getBytes()),url:admin?proof.getUrl():''});
 }
 if(action){
 // Pengurus hanya boleh mencatat pemasukan/pengeluaran dan melampirkan bukti untuk divisinya sendiri.
 let own=false;
 if(!admin&&['Pengeluaran','Pemasukan'].includes(action.type))own=action.div===member.div;
 if(!admin&&action.type==='Bukti'){const target=rowOf(action.no);own=!!target&&target[2]===member.div}
 if(!admin&&!own)return reply(403,{error:'Aksi di luar akses divisi.'});
 if(rev!==action.rev)return reply(409,{error:'Data berubah. Periksa saldo terbaru sebelum menyimpan kembali.'});
 const a={};for(const k of ['type','div','date','cat','note','email','chat','name'])a[k]=String(action[k]||'').trim().slice(0,k==='email'?254:k==='name'?60:120);
 if(a.type!=='Telegram')delete a.chat;
 if(!['Akses','Profil'].includes(a.type))delete a.name;
 if(a.type==='Cabut'){const prev=state.members.find(m=>m.email===a.email.toLowerCase());if(prev&&prev.name)a.name=prev.name}
 a.amount=action.amount;a.by=email;
 if(a.type==='Bukti'){a.no=Number(action.no);delete a.cat;delete a.amount}
 if(['Akses','Cabut'].includes(a.type)&&a.email.toLowerCase()===owner)return reply(400,{error:'Email tersebut adalah akun pimpinan.'});
 if(file){
 if(![...TX_TYPES,'Bukti'].includes(a.type)||typeof file!=='object'||!PROOF_TYPES[file.type]||typeof file.data!=='string')return reply(400,{error:'Format bukti harus JPG, PNG, WEBP, atau PDF.'});
 a.proof='pending';
 }else if(a.type==='Bukti')return reply(400,{error:'Pilih berkas bukti.'});
 try{applyEvent(state,a)}catch(err){return reply(400,{error:err.message})}
 const row=a.type==='Bukti'?rowOf(a.no):TX_TYPES.includes(a.type)?state.rows[state.rows.length-1]:null;
 let link='';
 if(file){
 try{a.proof=saveProof(file,row)}catch(err){return reply(400,{error:'Bukti gagal diunggah: '+err.message})}
 row[8]=a.proof;link='https://drive.google.com/file/d/'+a.proof+'/view';
 }
 const safe=x=>/^[=+@\-]/.test(x)?"'"+x:x;
 const note=a.type==='Bukti'?'Bukti untuk JU-'+String(a.no).padStart(4,'0'):a.type==='Telegram'?'Chat Telegram '+(a.chat||'dilepas'):a.type==='Profil'?'Nama pimpinan: '+a.name:a.type==='Akses'&&a.name?a.email+' ('+a.name+')':(a.note||a.email);
 ensureProofHeader(sheet);
 sheet.appendRow([new Date(),safe(email),safe(a.type),safe(a.type==='Bukti'?row[2]:a.div),a.amount||0,safe(a.cat||''),safe(note),safe(a.type==='Bukti'?row[0]:a.date),JSON.stringify(a),link]);
 SpreadsheetApp.flush();rev++;
 outbox=notifications(state,a,row,displayName());
 }
 // Notifikasi dikirim setelah kunci dilepas; kegagalan Telegram tidak membatalkan transaksi.
 if(outbox.length){if(lock.hasLock())lock.releaseLock();sendTelegram(outbox)}
 const tg=telegramConfig();
 return reply(200,admin?{role:'pimpinan',name:displayName(),state:Object.assign({},state,{telegramMain:!!(tg.token&&tg.main)}),rev}:{role:'divisi',name:displayName(),rev,state:{divisions:[member.div],rows:state.rows.filter(r=>r[2]===member.div)}});
 }catch(err){return reply(503,{error:'Gagal membaca atau menyimpan kas. Muat ulang untuk melihat data terbaru.'})}
 finally{if(lock.hasLock())lock.releaseLock()}
}
