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
 if(a.type==='Akses')s.members.push({email,div:a.div});return;
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
 const state={opening:0,divisions:[],rows:[],members:[]};
 if(rev>0)for(const [event] of sheet.getRange(2,9,rev,1).getValues())applyEvent(state,JSON.parse(event));
 const admin=email===owner,member=state.members.find(m=>m.email===email);
 if(!admin&&!member)return reply(403,{error:'Email Anda belum terdaftar. Hubungi pimpinan.'});
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
 const a={};for(const k of ['type','div','date','cat','note','email'])a[k]=String(action[k]||'').trim().slice(0,k==='email'?254:120);
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
 const note=a.type==='Bukti'?'Bukti untuk JU-'+String(a.no).padStart(4,'0'):(a.note||a.email);
 ensureProofHeader(sheet);
 sheet.appendRow([new Date(),safe(email),safe(a.type),safe(a.type==='Bukti'?row[2]:a.div),a.amount||0,safe(a.cat||''),safe(note),safe(a.type==='Bukti'?row[0]:a.date),JSON.stringify(a),link]);
 SpreadsheetApp.flush();rev++;
 }
 return reply(200,admin?{role:'pimpinan',state,rev}:{role:'divisi',rev,state:{divisions:[member.div],rows:state.rows.filter(r=>r[2]===member.div)}});
 }catch(err){return reply(503,{error:'Gagal membaca atau menyimpan kas. Muat ulang untuk melihat data terbaru.'})}
 finally{if(lock.hasLock())lock.releaseLock()}
}
