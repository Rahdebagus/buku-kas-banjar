function summary(s){
 let center=s.opening,spent=0;const balances=new Map(s.divisions.map(d=>[d,0])),cats=new Map();
 for(const [,type,div,n,cat] of s.rows){
 let v=balances.get(div)||0;
 if(type==='Alokasi'){center-=n;v+=n}
 if(type==='Pengembalian'){center+=n;v-=n}
 if(type==='Pengeluaran'){spent+=n;cats.set(cat,(cats.get(cat)||0)+n);if(div==='Pimpinan')center-=n;else v-=n}
 if(div!=='Pimpinan')balances.set(div,v)
 } return {center,spent,balances,cats};
}
function apply(s,a){
 const clean=x=>typeof x==='string'?x.trim().slice(0,120):'';
 const div=clean(a.div),n=a.amount,type=a.type;
 if(type==='Divisi'){if(!div||['Pimpinan',...s.divisions].some(d=>d.toLowerCase()===div.toLowerCase()))throw Error('Nama divisi kosong atau sudah digunakan.');s.divisions.push(div);return}
 if(!Number.isSafeInteger(n)||n<0||n>1e14)throw Error('Periksa nominal rupiah.');
 const {center,balances}=summary(s);
 if(type==='Saldo awal'){if(center+n-s.opening<0)throw Error('Saldo awal terlalu kecil untuk transaksi yang sudah tercatat.');s.opening=n;return}
 if(!['Pengeluaran','Alokasi','Pengembalian'].includes(type)||!n||(!s.divisions.includes(div)&&!(div==='Pimpinan'&&type==='Pengeluaran')))throw Error('Periksa jenis transaksi dan divisi.');
 if((type==='Alokasi'||div==='Pimpinan'?center:balances.get(div))<n)throw Error('Saldo sumber dana tidak mencukupi.');
 if(!/^\d{4}-\d\d-\d\d$/.test(a.date)||!clean(a.cat))throw Error('Tanggal dan kategori wajib diisi.');
 s.rows.push([a.date,type,div,n,clean(a.cat),clean(a.note)])
}

const HEADER=['Waktu pencatatan','Email pencatat','Aktivitas','Divisi','Nominal (Rp)','Kategori','Keterangan','Tanggal transaksi','Data sistem'];
function setup(){
 const lock=LockService.getScriptLock();lock.waitLock(15000);
 try{
 const file=SpreadsheetApp.getActiveSpreadsheet(),props=PropertiesService.getScriptProperties();
 if(!props.getProperty('OWNER_EMAIL')||String(props.getProperty('SHEETS_SECRET')||'').length<32)throw Error('Isi OWNER_EMAIL dan SHEETS_SECRET di Script Properties.');
 let sheet=file.getSheetByName('BukuKas');
 if(!sheet)sheet=file.insertSheet('BukuKas');
 if(sheet.getLastRow()===0){sheet.appendRow(HEADER);sheet.setFrozenRows(1);sheet.getRange('A1:I1').setFontWeight('bold');sheet.hideColumns(9);sheet.autoResizeColumns(1,8)}
 if(sheet.getRange(1,9).getValue()!==HEADER[8])throw Error('Nama BukuKas sudah digunakan oleh tabel lain.');
 props.setProperty('SHEET_ID',file.getId());SpreadsheetApp.flush();
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
 apply(s,a);
}
function reply(status,body){return ContentService.createTextOutput(JSON.stringify({status,body})).setMimeType(ContentService.MimeType.JSON)}
function doPost(e){
 const lock=LockService.getScriptLock();
 try{
 const props=PropertiesService.getScriptProperties(),secret=props.getProperty('SHEETS_SECRET'),owner=String(props.getProperty('OWNER_EMAIL')||'').trim().toLowerCase();
 if(!owner||!secret||secret.length<32)return reply(503,{error:'Konfigurasi belum lengkap.'});
 const {payload,signature}=JSON.parse(e.postData.contents);
 if(typeof payload!=='string'||payload.length>6000)return reply(400,{error:'Data tidak valid.'});
 const tag=Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload,secret,Utilities.Charset.UTF_8)).replace(/=+$/,'');
 if(tag!==signature)return reply(403,{error:'Akses ditolak.'});
 const {email,time,action}=JSON.parse(payload);
 if(!email||!Number.isFinite(time)||Math.abs(Date.now()-time)>90000)return reply(403,{error:'Permintaan kedaluwarsa.'});
 if(!lock.tryLock(12000))return reply(503,{error:'Kas sedang diperbarui. Coba lagi.'});
 const sheet=SpreadsheetApp.openById(props.getProperty('SHEET_ID')).getSheetByName('BukuKas');
 let rev=sheet.getLastRow()-1;
 const state={opening:0,divisions:[],rows:[],members:[]};
 if(rev>0)for(const [event] of sheet.getRange(2,9,rev,1).getValues())applyEvent(state,JSON.parse(event));
 const admin=email===owner,member=state.members.find(m=>m.email===email);
 if(!admin&&!member)return reply(403,{error:'Email Anda belum terdaftar. Hubungi pimpinan.'});
 if(action){
 if(!admin&&(action.type!=='Pengeluaran'||action.div!==member.div))return reply(403,{error:'Aksi di luar akses divisi.'});
 if(rev!==action.rev)return reply(409,{error:'Data berubah. Periksa saldo terbaru sebelum menyimpan kembali.'});
 const a={};for(const k of ['type','div','date','cat','note','email'])a[k]=String(action[k]||'').trim().slice(0,k==='email'?254:120);
 a.amount=action.amount;
 if(['Akses','Cabut'].includes(a.type)&&a.email.toLowerCase()===owner)return reply(400,{error:'Email tersebut adalah akun pimpinan.'});
 try{applyEvent(state,a)}catch(err){return reply(400,{error:err.message})}
 const safe=x=>/^[=+@\-]/.test(x)?"'"+x:x;
 sheet.appendRow([new Date(),safe(email),safe(a.type),safe(a.div),a.amount||0,safe(a.cat),safe(a.note||a.email),safe(a.date),JSON.stringify(a)]);
 SpreadsheetApp.flush();rev++;
 }
 return reply(200,admin?{role:'pimpinan',state,rev}:{role:'divisi',rev,state:{divisions:[member.div],rows:state.rows.filter(r=>r[2]===member.div)}});
 }catch{return reply(503,{error:'Gagal membaca atau menyimpan kas. Muat ulang untuk melihat data terbaru.'})}
 finally{if(lock.hasLock())lock.releaseLock()}
}
