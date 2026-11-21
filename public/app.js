'use strict';
// Baris transaksi dari server: [tanggal, jenis, divisi, nominal, kategori, keterangan, dicatat oleh, nomor bukti, ID file bukti]

// Perhitungan saldo — harus identik dengan summary() di google/Code.gs
function summary(s){
 let center=s.opening||0,spent=0,income=0;const balances=new Map(s.divisions.map(d=>[d,0])),cats=new Map(),incomeCats=new Map();
 for(const [,type,div,n,cat] of s.rows){
  let v=balances.get(div)||0;
  if(type==='Alokasi'){center-=n;v+=n}
  if(type==='Pengembalian'){center+=n;v-=n}
  if(type==='Pengeluaran'){spent+=n;cats.set(cat,(cats.get(cat)||0)+n);if(div==='Pimpinan')center-=n;else v-=n}
  if(type==='Pemasukan'){income+=n;incomeCats.set(cat,(incomeCats.get(cat)||0)+n);if(div==='Pimpinan')center+=n;else v+=n}
  if(div!=='Pimpinan')balances.set(div,v)
 }
 return {center,spent,income,balances,cats,incomeCats};
}

// ---------- Utilitas ----------
const $=s=>document.querySelector(s);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rp=n=>(n<0?'− ':'')+'Rp '+Math.abs(Math.round(n||0)).toLocaleString('id-ID');
const num=n=>n?Math.round(n).toLocaleString('id-ID'):'';
const MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const tgl=d=>{if(!d)return '—';const [y,m,dd]=d.split('-');return dd+' '+MONTHS[+m-1].slice(0,3)+' '+y};
const bulan=ym=>{const [y,m]=ym.split('-');return MONTHS[+m-1]+' '+y};
const bukti=no=>no?'JU-'+String(no).padStart(4,'0'):'';
const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Makassar'});
const opts=(list,sel)=>list.map(o=>{const [v,t]=Array.isArray(o)?o:[o,o];return '<option value="'+esc(v)+'"'+(v===sel?' selected':'')+'>'+esc(t)+'</option>'}).join('');
const field=(title,html)=>'<label>'+title+html+'</label>';
const btn=(label,data,cls)=>'<button type="button" class="'+(cls||'')+'" '+(data||'')+'>'+label+'</button>';
const panel=(title,tools,body)=>'<section class="panel"><div class="panelhead"><h2>'+title+'</h2><div class="tools">'+(tools||'')+'</div></div>'+body+'</section>';
const sumOf=(rows,type)=>rows.filter(r=>r[1]===type).reduce((n,r)=>n+r[3],0);

const EXPENSE=['Listrik','Bensin','Konsumsi','Air','Internet','Perlengkapan','Pemeliharaan','Upakara','Lainnya'];
const INCOME=['Iuran warga','Donasi','Punia','Sponsor','Hasil usaha','Bunga bank','Lainnya'];
const ALLOC=['Saldo awal','Tambahan dana','Kas bon','Pinjaman'];
const RETURNS=['Sisa dana','Pelunasan kas bon','Lainnya'];
const TYPES=['Pemasukan','Pengeluaran','Alokasi','Pengembalian'];
const TYPE_LABEL={Pemasukan:'Pemasukan',Pengeluaran:'Pengeluaran',Alokasi:'Bagi dana',Pengembalian:'Pengembalian'};

let role,state,rev,mode,tab=decodeURIComponent(location.hash.slice(1))||'Dashboard',jType='Semua',jMonth='Semua',acc='*';
const CLIP='<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 01-7.8-7.8l9.2-9.2a3.7 3.7 0 015.2 5.2l-9.2 9.2a1.8 1.8 0 01-2.6-2.6l8.5-8.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const isAdmin=()=>role==='pimpinan';
const myDiv=()=>state.divisions[0];
const scope=()=>isAdmin()?'*':myDiv();
const kas=d=>d==='Pimpinan'?'Kas Pimpinan':'Kas '+d;

// ---------- Akuntansi ----------
// Mutasi sebuah transaksi pada satu akun kas: [debit, kredit] atau null jika tidak menyentuh akun itu.
// Akun '*' = seluruh kas banjar; perpindahan antar-kas (bagi dana, pengembalian) saling meniadakan.
function move(r,a){
 const [,t,d,n]=r;
 if(a==='*')return t==='Pemasukan'?[n,0]:t==='Pengeluaran'?[0,n]:null;
 if(t==='Alokasi')return a==='Pimpinan'?[0,n]:d===a?[n,0]:null;
 if(t==='Pengembalian')return a==='Pimpinan'?[n,0]:d===a?[0,n]:null;
 if(d!==a)return null;
 return t==='Pemasukan'?[n,0]:[0,n];
}
// Jurnal berpasangan: [akun debit, akun kredit]
function entry(r){
 const [,t,d,,c]=r;
 if(t==='Pemasukan')return [kas(d),'Pendapatan · '+c];
 if(t==='Pengeluaran')return ['Beban · '+c,kas(d)];
 if(t==='Alokasi')return [kas(d),'Kas Pimpinan'];
 return ['Kas Pimpinan',kas(d)];
}
function describe(r){
 const [,t,d,,c,note]=r;
 let base=c;
 if(t==='Alokasi')base=(isAdmin()?'Bagi dana ke '+d:'Dana dari pimpinan')+' · '+c;
 if(t==='Pengembalian')base=(isAdmin()?'Pengembalian dari '+d:'Dikembalikan ke pimpinan')+' · '+c;
 return note?base+' — '+note:base;
}
// Tombol bukti: lihat jika sudah ada, lampirkan jika belum (pimpinan, atau pengurus untuk divisinya).
const canAttach=r=>isAdmin()||r[2]===myDiv();
function proofBtn(r){
 if(!r||!r[7])return '';
 if(r[8])return '<button type="button" class="clip" data-proof="'+r[7]+'" title="Lihat bukti '+bukti(r[7])+'">'+CLIP+'Bukti</button>';
 return canAttach(r)?'<button type="button" class="clip add" data-attach="'+r[7]+'" title="Lampirkan bukti">＋ Bukti</button>':'';
}
const chrono=()=>state.rows.slice().sort((a,b)=>a[0].localeCompare(b[0])||(a[7]||0)-(b[7]||0));
function ledger(a){
 const out=[];let bal=0;
 if(isAdmin()&&(a==='*'||a==='Pimpinan')&&state.opening){bal=state.opening;out.push({date:'',no:'',desc:'Saldo awal kas pimpinan',d:state.opening,k:0,bal,opening:true})}
 for(const r of chrono()){const m=move(r,a);if(!m)continue;bal+=m[0]-m[1];out.push({date:r[0],no:bukti(r[7]),desc:describe(r),d:m[0],k:m[1],bal,ref:r})}
 return out;
}
function recap(a){
 const map=new Map();
 for(const l of ledger(a)){if(!l.date)continue;const key=l.date.slice(0,7),m=map.get(key)||{d:0,k:0,bal:0};m.d+=l.d;m.k+=l.k;m.bal=l.bal;map.set(key,m)}
 return [...map].reverse();
}
function journalList(){
 let list=chrono();
 if(jType!=='Semua')list=list.filter(r=>r[1]===jType);
 if(jMonth!=='Semua')list=list.filter(r=>r[0].startsWith(jMonth));
 const lines=list.map(r=>({date:r[0],no:bukti(r[7]),desc:describe(r),acct:entry(r),n:r[3],ref:r}));
 if(isAdmin()&&state.opening&&jType==='Semua'&&jMonth==='Semua')lines.unshift({date:'',no:'',desc:'Saldo awal kas pimpinan',acct:['Kas Pimpinan','Modal awal kas'],n:state.opening,opening:true});
 return lines;
}
const months=()=>[...new Set(state.rows.map(r=>r[0].slice(0,7)))].sort().reverse();

// ---------- Tampilan ----------
function bars(items,total,tone){
 if(!items.length)return '<p class="empty">Belum ada data.</p>';
 return items.map(([k,v])=>'<div class="barrow"><div class="line"><span>'+esc(k)+'</span><b>'+rp(v)+'</b></div><div class="bar '+tone+'"><i style="width:'+(total>0?Math.min(100,Math.max(2,100*v/total)):0)+'%"></i></div></div>').join('');
}
function card(label,tag,value,note,cls){
 return '<div class="card '+(cls||'')+'"><div class="k"><span>'+esc(label)+'</span>'+(tag?'<span class="tag '+tag[1]+'">'+tag[0]+'</span>':'')+'</div><strong>'+rp(value)+'</strong><small>'+esc(note)+'</small></div>';
}
function cards(s){
 const divTotal=[...s.balances.values()].reduce((a,b)=>a+b,0);
 if(isAdmin())return '<div class="cards">'
  +card('Total kas banjar',null,s.center+divTotal,'Kas pimpinan '+rp(s.center)+' · Kas divisi '+rp(divTotal),'hero')
  +card('Pemasukan',['Debit','dr'],s.income,'Di luar saldo awal '+rp(state.opening))
  +card('Pengeluaran',['Kredit','cr'],s.spent,'Pimpinan dan seluruh divisi')
  +card('Kas pimpinan',['Siap dibagi','gd'],s.center,s.balances.size+' divisi terdaftar')+'</div>';
 const rows=state.rows;
 return '<div class="cards">'
  +card('Saldo kas '+myDiv(),null,divTotal,'Dana yang dapat digunakan divisi','hero')
  +card('Dana dari pimpinan',['Debit','dr'],sumOf(rows,'Alokasi'),'Pembagian dana diterima')
  +card('Pemasukan divisi',['Debit','dr'],sumOf(rows,'Pemasukan'),'Iuran, donasi, dan lainnya')
  +card('Pengeluaran',['Kredit','cr'],sumOf(rows,'Pengeluaran'),'Dikembalikan ke pimpinan '+rp(sumOf(rows,'Pengembalian')))+'</div>';
}
function txTable(list){
 if(!list.length)return '<p class="empty">Belum ada transaksi.</p>';
 return '<div class="scroll"><table><thead><tr><th>Tanggal</th><th class="hide-sm">No. bukti</th><th>Keterangan</th>'+(isAdmin()?'<th class="hide-sm">Kas</th>':'')+'<th class="hide-sm">Jenis</th><th class="num">Debit</th><th class="num">Kredit</th></tr></thead><tbody>'
  +list.map(r=>{const [d,k]=move(r,r[2])||[0,0];return '<tr><td class="nowrap">'+tgl(r[0])+'</td><td class="mono hide-sm">'+bukti(r[7])+'</td><td>'+esc(describe(r))+' '+proofBtn(r)+'</td>'+(isAdmin()?'<td class="nowrap hide-sm">'+esc(kas(r[2]))+'</td>':'')+'<td class="hide-sm"><span class="pill '+esc(r[1])+'">'+esc(TYPE_LABEL[r[1]]||r[1])+'</span></td><td class="num dr">'+num(d)+'</td><td class="num cr">'+num(k)+'</td></tr>'}).join('')
  +'</tbody></table></div>';
}
function recapPanel(a){
 const rec=recap(a).slice(0,6);
 const body=rec.length?'<div class="scroll"><table><thead><tr><th>Bulan</th><th class="num">Debit</th><th class="num">Kredit</th><th class="num">Saldo akhir</th></tr></thead><tbody>'
  +rec.map(([k,m])=>'<tr><td class="nowrap">'+bulan(k)+'</td><td class="num dr">'+(num(m.d)||'—')+'</td><td class="num cr">'+(num(m.k)||'—')+'</td><td class="num"><b>'+rp(m.bal)+'</b></td></tr>').join('')+'</tbody></table></div>':'<p class="empty">Belum ada transaksi.</p>';
 return panel('Rekap bulanan','<span class="hint">Debit = kas masuk · Kredit = kas keluar</span>',body);
}
function dashboard(){
 const s=summary(state),divTotal=[...s.balances.values()].reduce((a,b)=>a+b,0);
 const expense=panel('Pengeluaran per kategori','',bars([...s.cats].sort((x,y)=>y[1]-x[1]),s.spent,'cr'));
 const income=panel('Pemasukan per kategori','',bars([...s.incomeCats].sort((x,y)=>y[1]-x[1]),s.income,'dr'));
 const recent=panel('Transaksi terakhir',btn('Lihat jurnal','data-tab="Jurnal"','ghost'),txTable(chrono().reverse().slice(0,6)));
 if(isAdmin()){
  const divs=panel('Saldo divisi',btn('Kelola divisi','data-tab="Divisi"','ghost'),bars([...s.balances],divTotal,'gold'));
  return cards(s)+'<div class="split">'+divs+recapPanel('*')+'</div><div class="split">'+expense+income+'</div>'+recent;
 }
 return cards(s)+'<div class="split">'+recapPanel(myDiv())+expense+'</div>'+(s.income?income:'')+recent;
}
function journalView(){
 const lines=journalList(),total=lines.reduce((n,l)=>n+l.n,0);
 const tools='<select id="jtype" class="compact" aria-label="Jenis transaksi">'+opts([['Semua','Semua jenis'],...TYPES.map(t=>[t,TYPE_LABEL[t]])],jType)+'</select>'
  +'<select id="jmonth" class="compact" aria-label="Bulan">'+opts([['Semua','Semua bulan'],...months().map(m=>[m,bulan(m)])],jMonth)+'</select>'
  +btn('Unduh CSV','data-export="jurnal"','ghost')+btn('Cetak','data-print','ghost');
 if(!lines.length)return panel('Jurnal umum',tools,'<p class="empty">Belum ada transaksi untuk filter ini.</p>');
 const body='<div class="scroll"><table class="journal"><thead><tr><th>Tanggal / bukti</th><th>Akun &amp; keterangan</th><th class="num">Debit</th><th class="num">Kredit</th></tr></thead>'
  +lines.map(l=>'<tbody class="entry'+(l.opening?' opening':'')+'"><tr><td rowspan="3" class="nowrap">'+tgl(l.date)+'<div class="mono">'+(l.no||'Saldo awal')+'</div></td><td class="acct">'+esc(l.acct[0])+'</td><td class="num">'+num(l.n)+'</td><td class="num"></td></tr><tr><td class="acct credit">'+esc(l.acct[1])+'</td><td class="num"></td><td class="num">'+num(l.n)+'</td></tr><tr><td class="memo">'+esc(l.desc)+' '+proofBtn(l.ref)+'</td><td></td><td></td></tr></tbody>').join('')
  +'<tfoot><tr><td colspan="2">Jumlah <span class="balanced">Seimbang</span></td><td class="num">'+rp(total)+'</td><td class="num">'+rp(total)+'</td></tr></tfoot></table></div>';
 return panel('Daftar entri',tools,'<p class="hint" style="margin-bottom:12px">Setiap transaksi dicatat dua sisi: akun yang didebit di atas, akun yang dikredit menjorok ke kanan. Total debit selalu sama dengan total kredit.</p>'+body);
}
function ledgerAccounts(){return [['*','Semua kas banjar'],['Pimpinan','Kas Pimpinan'],...state.divisions.map(d=>[d,kas(d)])]}
function ledgerView(){
 if(!isAdmin())acc=myDiv();else if(!ledgerAccounts().some(([v])=>v===acc))acc='*';
 const lines=ledger(acc),d=lines.reduce((n,l)=>n+l.d,0),k=lines.reduce((n,l)=>n+l.k,0);
 const name=ledgerAccounts().find(([v])=>v===acc)[1];
 const tools=(isAdmin()?'<select id="acc" class="compact" aria-label="Akun kas">'+opts(ledgerAccounts(),acc)+'</select>':'')+btn('Unduh CSV','data-export="buku"','ghost')+btn('Cetak','data-print','ghost');
 const strip='<div class="strip"><div class="dr"><span>Total debit (masuk)</span><b>'+rp(d)+'</b></div><div class="cr"><span>Total kredit (keluar)</span><b>'+rp(k)+'</b></div><div><span>Saldo akhir</span><b>'+rp(d-k)+'</b></div></div>';
 const body=lines.length?'<div class="scroll"><table><thead><tr><th>Tanggal</th><th class="hide-sm">No. bukti</th><th>Keterangan</th><th class="num">Debit</th><th class="num">Kredit</th><th class="num">Saldo</th></tr></thead><tbody>'
  +lines.map(l=>'<tr'+(l.opening?' class="opening"':'')+'><td class="nowrap">'+tgl(l.date)+'</td><td class="mono hide-sm">'+(l.no||'—')+'</td><td>'+esc(l.desc)+' '+proofBtn(l.ref)+'</td><td class="num dr">'+num(l.d)+'</td><td class="num cr">'+num(l.k)+'</td><td class="num"><b>'+rp(l.bal)+'</b></td></tr>').join('')+'</tbody></table></div>':'<p class="empty">Belum ada mutasi pada akun ini.</p>';
 const note=acc==='*'?'<p class="hint" style="margin-bottom:12px">Gabungan seluruh kas. Pembagian dana dan pengembalian tidak ditampilkan karena hanya memindahkan uang antar-kas.</p>':'';
 return panel('Buku kas · '+esc(name),tools,note+strip+body);
}
function divisionsView(){
 const s=summary(state);
 const settings=panel('Kas pimpinan','','<div class="kaspim"><div><span class="label">Saldo siap dibagi</span><strong>'+rp(s.center)+'</strong><small>Saldo awal '+rp(state.opening)+'</small></div><div class="actions">'
  +btn('Atur saldo awal','data-mode="Saldo awal"')+btn('＋ Tambah divisi','data-mode="Divisi"','primary')+btn('Catat pengembalian','data-mode="Pengembalian"')+btn('Buku kas','data-ledger="Pimpinan"','ghost')+'</div></div>');
 const grid=state.divisions.map(d=>{
  const members=(state.members||[]).filter(m=>m.div===d);
  return '<article class="divcard"><div class="divtop"><div><span class="label">Divisi</span><h3>'+esc(d)+'</h3></div><strong>'+rp(s.balances.get(d))+'</strong></div>'
   +'<div><span class="label">Akun pengurus</span>'+(members.length?members.map(m=>'<div class="member"><span class="avatar">'+esc(m.email[0].toUpperCase())+'</span><span class="email" title="'+esc(m.email)+'">'+esc(m.email)+'</span><button type="button" class="link danger" data-revoke="'+esc(m.email)+'">Cabut</button></div>').join(''):'<p class="empty">Belum ada akun. Tambahkan email Google pengurus.</p>')+'</div>'
   +'<div class="actions">'+btn('⇄ Bagi dana','data-mode="Alokasi" data-div="'+esc(d)+'"')+btn('＋ Akun','data-mode="Akses" data-div="'+esc(d)+'"')+btn('Buku kas','data-ledger="'+esc(d)+'"','ghost')+'</div></article>';
 }).join('');
 const howto=panel('Cara kerja akun','','<ol class="howto"><li>Tambahkan divisi, lalu klik <b>＋ Akun</b> dan masukkan email Google pengurus divisi tersebut. Satu divisi boleh punya beberapa akun.</li><li>Selama aplikasi Google masih berstatus <i>Testing</i>, daftarkan email yang sama di Google Auth Platform → Audience → Test users.</li><li>Bagikan link aplikasi. Pengurus masuk dengan akun Google-nya dan hanya melihat dashboard, jurnal, dan buku kas divisinya.</li><li>Pengurus dapat mencatat pemasukan dan pengeluaran divisinya. Pembagian dana dan pengembalian hanya dicatat pimpinan.</li></ol>');
 return settings+(grid?'<div class="divgrid">'+grid+'</div>':panel('Divisi','','<p class="empty">Belum ada divisi. Klik <b>＋ Tambah divisi</b> untuk memulai.</p>'))+howto;
}
function render(){
 $('#gate').hidden=true;$('#shell').hidden=false;
 const tabs=isAdmin()?['Dashboard','Jurnal','Buku kas','Divisi']:['Dashboard','Jurnal','Buku kas'];
 if(!tabs.includes(tab))tab='Dashboard';
 history.replaceState(null,'',tab==='Dashboard'?location.pathname:'#'+encodeURIComponent(tab));
 $('nav').innerHTML=tabs.map(t=>'<button type="button" data-tab="'+t+'" class="'+(t===tab?'on':'')+'">'+(t==='Divisi'?'Divisi &amp; akun':t)+'</button>').join('');
 $('#chip').innerHTML='<span class="role">'+(isAdmin()?'Pimpinan':'Pengurus')+'</span>'+esc(isAdmin()?'Kas pimpinan':'Divisi '+myDiv());
 $('#eyebrow').textContent=isAdmin()?'Pimpinan banjar':'Divisi '+myDiv();
 $('#title').textContent={Dashboard:isAdmin()?'Ringkasan kas':'Kas divisi '+myDiv(),Jurnal:'Jurnal umum','Buku kas':'Buku kas',Divisi:'Divisi & akun'}[tab];
 $('#quick').innerHTML=btn('＋ Pemasukan','data-mode="Pemasukan"','gold')+btn('− Pengeluaran','data-mode="Pengeluaran"','primary')+(isAdmin()?btn('⇄ Bagi dana','data-mode="Alokasi"'):'');
 $('#view').innerHTML=tab==='Dashboard'?dashboard():tab==='Jurnal'?journalView():tab==='Buku kas'?ledgerView():divisionsView();
}
function showGate(kind,msg){
 $('#shell').hidden=true;$('#gate').hidden=false;$('nav').replaceChildren();$('#chip').replaceChildren();
 const title={login:'Kas banjar yang rapi, transparan, dan aman.',denied:'Akun belum terdaftar',error:'Kas belum dapat dimuat'}[kind];
 const action={login:'<a class="btn primary big" href="/api/auth?action=login">Masuk dengan Google</a>',denied:btn('Keluar &amp; ganti akun','data-logout','primary big'),error:btn('Coba lagi','data-reload','primary big')}[kind];
 $('#gate').innerHTML='<div class="gatecard"><div class="seal">K</div><span class="eyebrow">Buku Kas Banjar</span><h1>'+title+'</h1><p>'+esc(msg)+'</p>'+action+'</div>';
}

// ---------- Formulir ----------
const FORM={
 Pemasukan:['Catat pemasukan','Kas bertambah: akun kas didebit, akun pendapatan dikredit.'],
 Pengeluaran:['Catat pengeluaran','Kas berkurang: akun beban didebit, akun kas dikredit.'],
 Alokasi:['Bagi dana ke divisi','Dana berpindah dari Kas Pimpinan ke kas divisi.'],
 Pengembalian:['Catat pengembalian','Sisa dana divisi dikembalikan ke Kas Pimpinan.'],
 'Saldo awal':['Atur saldo awal','Saldo Kas Pimpinan sebelum transaksi pertama dicatat.'],
 Divisi:['Tambah divisi','Divisi baru dimulai dengan saldo nol.'],
 Akses:['Tambah akun pengurus','Pengurus masuk dengan akun Google ini dan hanya melihat kas divisinya.'],
 Cabut:['Cabut akses pengurus','Email ini tidak dapat membuka kas lagi.'],
 Bukti:['Lampirkan bukti','Disimpan otomatis ke Google Drive pimpinan, dalam folder per tahun, bulan, dan divisi.']
};
const proofField=required=>field('Bukti transaksi <span class="opt">'+(required?'foto atau PDF':'foto atau PDF · opsional')+'</span>','<input type="file" name="proof" accept="image/*,application/pdf"'+(required?' required':'')+'>')+'<div id="preview" class="preview" hidden></div>';
let attachNo=0;
function openForm(m,div,no){
 mode=m;attachNo=0;let h='';
 if(m==='Bukti'){
  const r=state.rows.find(x=>x[7]===no);if(!r)return toast('Transaksi tidak ditemukan.',true);
  attachNo=no;
  h='<div class="fixed"><span>'+bukti(no)+' · '+tgl(r[0])+'</span>'+rp(r[3])+'</div><p class="hint" style="margin-top:8px">'+esc(describe(r))+'</p>'
   +(r[8]?'<p class="hint">Transaksi ini sudah punya bukti. Berkas baru akan menggantikannya; berkas lama tetap tersimpan di Drive.</p>':'')+proofField(true);
 }
 if(m==='Akses'||m==='Cabut'){
  h=field('Email akun Google','<input type="email" name="email" required autocomplete="off" placeholder="nama@gmail.com"'+(m==='Cabut'?' readonly':'')+'>');
  if(m==='Akses')h+=field('Divisi','<select name="div">'+opts(state.divisions,div)+'</select>');
 }
 if(m==='Divisi')h=field('Nama divisi','<input name="div" required maxlength="80" placeholder="Misalnya Upacara">');
 if(TYPES.includes(m)){
  if(isAdmin()){
   const list=m==='Pemasukan'||m==='Pengeluaran'?[['Pimpinan','Kas Pimpinan'],...state.divisions.map(d=>[d,kas(d)])]:state.divisions;
   const label={Pemasukan:'Masuk ke kas',Pengeluaran:'Dibayar dari kas',Alokasi:'Divisi penerima',Pengembalian:'Dikembalikan oleh divisi'}[m];
   h+=field(label,'<select name="div">'+opts(list,div)+'</select>');
  }else h+='<input type="hidden" name="div" value="'+esc(myDiv())+'"><div class="fixed"><span>Akun kas</span>'+esc(kas(myDiv()))+'</div>';
  const cats={Pemasukan:INCOME,Pengeluaran:EXPENSE,Alokasi:ALLOC,Pengembalian:RETURNS}[m];
  h+=field({Pemasukan:'Sumber pemasukan',Pengeluaran:'Digunakan untuk'}[m]||'Jenis','<select name="cat">'+opts(cats)+'</select>')
   +'<div hidden id="custom">'+field('Nama kategori','<input name="custom" maxlength="80">')+'</div>'
   +'<div class="two">'+field('Tanggal','<input type="date" name="date" required value="'+today()+'">')+field('Nominal (Rp)','<input name="amount" inputmode="numeric" autocomplete="off" required placeholder="0">')+'</div>'
   +'<p class="hint" id="hint"></p>'
   +field('Keterangan (opsional)','<input name="note" maxlength="120" placeholder="Misalnya pembayaran listrik balai banjar">')
   +proofField(false);
 }
 if(m==='Saldo awal')h+=field('Nominal (Rp)','<input name="amount" inputmode="numeric" autocomplete="off" required value="'+(num(state.opening)||'0')+'">');
 $('#ft').textContent=FORM[m][0];$('#fs').textContent=FORM[m][1];
 $('#fields').innerHTML=h;$('.error').textContent='';
 updateHint();$('dialog').showModal();
}
function updateHint(){
 const h=$('#hint');if(!h)return;
 const s=summary(state),div=$('dialog [name=div]')?.value,bal=d=>d==='Pimpinan'?s.center:s.balances.get(d)||0;
 h.textContent=mode==='Alokasi'?'Saldo Kas Pimpinan: '+rp(s.center):mode==='Pengembalian'?'Saldo '+kas(div)+': '+rp(bal(div)):mode==='Pengeluaran'?'Saldo tersedia: '+rp(bal(div)):'Saldo '+kas(div)+' saat ini: '+rp(bal(div));
}

// ---------- Bukti: kompres, unggah, lihat ----------
const PROOF_MAX=2500000; // byte, setelah kompresi; batas aman permintaan Vercel (4,5 MB setelah base64)
const toBase64=blob=>new Promise((ok,fail)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=()=>fail(Error('Berkas bukti tidak dapat dibaca.'));r.readAsDataURL(blob)});
async function prepareProof(file){
 if(!file||!file.size)return null;
 if(file.type.startsWith('image/')){
  try{ // perkecil foto ke maks. 1600 px dan JPEG agar ringan
   const img=await createImageBitmap(file),scale=Math.min(1,1600/Math.max(img.width,img.height));
   const c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);
   const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(img,0,0,c.width,c.height);
   const blob=await new Promise(ok=>c.toBlob(ok,'image/jpeg',0.82));
   if(blob&&blob.size<=PROOF_MAX)return {name:file.name.replace(/\.[^.]*$/,'')+'.jpg',type:'image/jpeg',data:await toBase64(blob)};
  }catch{/* format yang tidak bisa dibaca browser, kirim apa adanya jika didukung */}
 }
 if(!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type))throw Error('Format bukti harus foto (JPG, PNG, WEBP) atau PDF.');
 if(file.size>PROOF_MAX)throw Error('Ukuran bukti maksimal 2,5 MB. Perkecil berkas PDF atau kirim sebagai foto.');
 return {name:file.name,type:file.type,data:await toBase64(file)};
}
let previewUrl='';
function showPreview(input){
 const box=$('#preview'),file=input.files&&input.files[0];
 if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=''}
 if(!box)return;if(!file){box.hidden=true;return}
 box.hidden=false;
 if(file.type.startsWith('image/')){previewUrl=URL.createObjectURL(file);box.innerHTML='<img src="'+previewUrl+'" alt="Pratinjau bukti"><span>'+esc(file.name)+'</span>'}
 else box.innerHTML='<span class="doc">PDF</span><span>'+esc(file.name)+' · '+Math.ceil(file.size/1024).toLocaleString('id-ID')+' KB</span>';
}
let viewerUrl='';
async function openProof(no){
 const v=$('#viewer');
 $('#vt').textContent='Bukti '+bukti(no);
 const r=state.rows.find(x=>x[7]===no);$('#vs').textContent=r?describe(r)+' · '+rp(r[3]):'';
 $('#vbody').innerHTML='<p class="empty">Memuat bukti dari Google Drive…</p>';$('#vlinks').innerHTML='';
 v.showModal();
 try{
  const res=await fetch('/api/kas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'Lihat bukti',no})}),d=await res.json();
  if(!res.ok)throw Error(d.error||'Bukti tidak dapat dibuka.');
  const bytes=Uint8Array.from(atob(d.data),c=>c.charCodeAt(0));
  if(viewerUrl)URL.revokeObjectURL(viewerUrl);
  viewerUrl=URL.createObjectURL(new Blob([bytes],{type:d.mime}));
  $('#vbody').innerHTML=d.mime==='application/pdf'?'<iframe src="'+viewerUrl+'" title="Bukti PDF"></iframe>':'<img src="'+viewerUrl+'" alt="Bukti transaksi">';
  $('#vlinks').innerHTML='<a class="btn" href="'+viewerUrl+'" download="'+esc(d.name)+'">Unduh</a>'+(d.url?'<a class="btn ghost" href="'+esc(d.url)+'" target="_blank" rel="noopener">Buka di Google Drive</a>':'')
   +(r&&canAttach(r)?btn('Ganti bukti','data-attach="'+no+'"','ghost'):'');
 }catch(err){$('#vbody').innerHTML='<p class="error">'+esc(err.message)+'</p>'}
}

let toastTimer;
function toast(msg,bad){const t=$('#toast');t.textContent=msg;t.className='show'+(bad?' bad':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.className=''},3200)}

// ---------- Ekspor ----------
function download(name,rows){
 const cell=v=>{if(typeof v==='number')return String(v);v=String(v??'');if(/^[=+\-@\t\r]/.test(v))v="'"+v;return /[";\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
 const blob=new Blob(['﻿'+rows.map(r=>r.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
// Pimpinan mendapat tautan Drive; pengurus hanya keterangan ada/tidak (folder Drive tetap privat).
const proofCell=r=>!r||!r[8]?'':isAdmin()?'https://drive.google.com/file/d/'+r[8]+'/view':'Ada';
function exportCsv(kind){
 const stamp=today();
 if(kind==='jurnal'){
  const rows=[['Tanggal','No. bukti','Akun','Debit','Kredit','Keterangan','Bukti']];
  for(const l of journalList()){rows.push([l.date,l.no,l.acct[0],l.n,'',l.desc,proofCell(l.ref)]);rows.push([l.date,l.no,l.acct[1],'',l.n,'',''])}
  return download('jurnal-umum-'+stamp+'.csv',rows);
 }
 const rows=[['Tanggal','No. bukti','Keterangan','Debit','Kredit','Saldo','Bukti']];
 for(const l of ledger(acc))rows.push([l.date,l.no,l.desc,l.d||'',l.k||'',l.bal,proofCell(l.ref)]);
 download('buku-kas-'+(acc==='*'?'semua':acc).toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+stamp+'.csv',rows);
}

// ---------- Event ----------
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;const d=b.dataset;
 if(d.tab){tab=d.tab;render();window.scrollTo({top:0,behavior:'smooth'})}
 if(d.mode)openForm(d.mode,d.div);
 if(d.revoke){openForm('Cabut');$('dialog [name=email]').value=d.revoke}
 if(d.ledger){acc=d.ledger;tab='Buku kas';render();window.scrollTo({top:0,behavior:'smooth'})}
 if(d.export)exportCsv(d.export);
 if('print' in d)window.print();
 if('logout' in d)$('#logout').requestSubmit();
 if('reload' in d)load();
 if('sync' in d)refresh(true);
 if(d.proof)openProof(Number(d.proof));
 if(d.attach){$('#viewer').open&&$('#viewer').close();openForm('Bukti',null,Number(d.attach))}
 if(b.id==='close')$('dialog').close();
 if(b.id==='vclose')$('#viewer').close();
});
$('#viewer').addEventListener('close',()=>{if(viewerUrl){URL.revokeObjectURL(viewerUrl);viewerUrl=''}$('#vbody').innerHTML=''});
document.addEventListener('change',e=>{
 const t=e.target;
 if(t.id==='jtype'){jType=t.value;render()}
 if(t.id==='jmonth'){jMonth=t.value;render()}
 if(t.id==='acc'){acc=t.value;render()}
 if(t.name==='cat'&&t.closest('dialog')){const other=t.value==='Lainnya';$('#custom').hidden=!other;$('[name=custom]').required=other}
 if(t.name==='div'&&t.closest('dialog'))updateHint();
 if(t.name==='proof')showPreview(t);
});
document.addEventListener('input',e=>{
 const t=e.target;if(t.name!=='amount')return;
 const v=t.value.replace(/\D/g,'').slice(0,15);t.value=v?Number(v).toLocaleString('id-ID'):'';
});
$('dialog form').addEventListener('submit',async e=>{
 e.preventDefault();
 const input=e.target.querySelector('[name=proof]'),file=input&&input.files&&input.files[0];
 const a=Object.fromEntries(new FormData(e.target));
 delete a.proof;delete a.custom;
 a.type=mode;a.rev=rev;
 if(mode==='Bukti')a.no=attachNo;
 else{
  a.amount=Number(String(a.amount||'').replace(/\D/g,''));
  if(a.cat==='Lainnya')a.cat=e.target.querySelector('[name=custom]').value;
  if(!a.cat)a.cat='Setoran';
 }
 const save=$('#save');save.disabled=true;
 try{
  if(file){save.textContent='Mengunggah bukti…';a.file=await prepareProof(file)}
  else save.textContent='Menyimpan…';
  const res=await fetch('/api/kas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(a)});
  const r=await res.json().catch(()=>({error:res.status===413?'Berkas bukti terlalu besar.':'Gagal menyimpan.'}));
  if(!res.ok){if(res.status===401||res.status===403||res.status===409)await load();throw Error(r.error||'Gagal menyimpan.')}
  gen++;({state,rev,role}=r);render();setLive(true);$('dialog').close();
  toast(mode==='Bukti'?'Bukti tersimpan di Google Drive':'Tersimpan · '+FORM[mode][0].replace(/^(Catat|Atur|Tambah|Cabut) /,'').replace(/^./,c=>c.toUpperCase())+(file?' · bukti diunggah':''));
 }catch(err){$('.error').textContent=err.message}
 finally{save.disabled=false;save.textContent='Simpan'}
});

// ---------- Sinkronisasi otomatis ----------
// Data diambil ulang berkala selama tab terlihat. Saat formulir terbuka, pembaruan ditunda
// agar isian tidak tertimpa; server tetap menolak simpanan dengan revisi lama.
const POLL_MS=20000;
let gen=0,syncing=false,pollTimer=null;
function setLive(ok){
 const el=$('#sync');if(!el)return;
 const time=new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
 el.className='sync '+(ok?'ok':'off');
 el.textContent=ok?'Data langsung · diperbarui '+time:'Koneksi terputus · mencoba lagi';
}
async function refresh(force){
 if(!state||syncing||(!force&&(document.hidden||$('dialog').open)))return;
 syncing=true;const g=gen;
 try{
  const res=await fetch('/api/kas',{cache:'no-store'}),r=await res.json().catch(()=>({}));
  if(g!==gen)return;
  if(res.status===401||res.status===403)return load();
  if(!res.ok)throw Error(r.error);
  if(r.rev!==rev||r.role!==role){
   if($('dialog').open)return; // tunggu formulir ditutup
   ({state,rev,role}=r);gen++;render();toast('Data terbaru dimuat');
  }
  setLive(true);
 }catch{setLive(false)}
 finally{syncing=false}
}
function startPolling(){
 if(pollTimer)return;
 pollTimer=setInterval(refresh,POLL_MS);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
 window.addEventListener('focus',()=>refresh());
 $('dialog').addEventListener('close',()=>refresh());
}

async function load(){
 gen++;
 try{
  const res=await fetch('/api/kas',{cache:'no-store'}),r=await res.json().catch(()=>({}));
  if(res.status===401)return showGate('login','Masuk dengan akun Google yang telah didaftarkan oleh pimpinan. Setiap divisi hanya melihat kasnya sendiri.');
  if(res.status===403){$('#logout').hidden=false;return showGate('denied',r.error||'Email Anda belum terdaftar. Hubungi pimpinan.')}
  if(!res.ok)throw Error(r.error);
  ({state,rev,role}=r);$('#logout').hidden=false;
  if(!isAdmin())acc=myDiv();
  render();setLive(true);startPolling();
 }catch(err){showGate('error',err.message||'Gagal memuat data kas.')}
}
load();
