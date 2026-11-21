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
const $=s=>document.querySelector(s), esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),rp=n=>'Rp '+n.toLocaleString('id-ID'),opts=a=>a.map(v=>'<option>'+esc(v)+'</option>').join('');
let role,state,rev,tab='Dashboard',filter='Semua',mode;
const buttons=['Dashboard','Divisi','Transaksi'],cats=['Listrik','Bensin','Konsumsi','Air','Internet','Perlengkapan','Pemeliharaan','Lainnya'];
function render(){
 const admin=role==='pimpinan', division=state.divisions[0];
 $('.account').textContent=admin?'Kas pimpinan':'Divisi '+division;

 const {center,spent,balances,cats:totals}=summary(state),divTotal=[...balances.values()].reduce((a,b)=>a+b,0);
 $('nav').innerHTML=(admin?buttons:buttons.filter(t=>t!=='Divisi')).map(x=>'<button data-tab="'+x+'" class="'+(x===tab?'on':'')+'">'+x+'</button>').join('');
 $('#title').textContent=tab==='Dashboard'? (admin?'Dashboard kas':'Kas Divisi '+division):tab==='Divisi'?'Kas per divisi':'Riwayat transaksi';
 const action=(name,label)=>'<button data-mode="'+name+'">'+label+'</button>';
 const chart=(items,denom,gold)=>items.map(([k,v])=>'<div class="row"><div class="line"><span>'+esc(k)+'</span><b>'+rp(v)+'</b></div><div class="bar '+(gold?'gold':'')+'"><i style="width:'+(denom?100*v/denom:0)+'%"></i></div></div>').join('');
 const panel=(title,extra,body)=>'<section class="panel"><div class="panelhead"><h2>'+title+'</h2>'+extra+'</div>'+body+'</section>';
 const cards='<div class="cards">'+(admin?[['Saldo pimpinan',center,'Saldo awal '+rp(state.opening||0)],['Saldo seluruh divisi',divTotal,balances.size+' divisi'],['Total pengeluaran',spent,'Akumulasi belanja tercatat']]:[['Saldo tersedia',divTotal,division],['Total diterima',state.rows.filter(r=>r[1]==='Alokasi').reduce((n,r)=>n+r[3],0),'Pembagian dana dari pimpinan'],['Total pengeluaran',spent,'Belanja divisi']]).map(([k,v,l])=>'<div class="card"><span>'+k+'</span><strong>'+rp(v)+'</strong><small>'+l+'</small></div>').join('')+'</div>';
 const divpanel=panel('Saldo divisi',action('Alokasi','Bagi saldo'),chart([...balances],divTotal,false));
 const category=panel('Pengeluaran per kategori','',chart([...totals].sort((a,b)=>b[1]-a[1]),spent,true)||'Belum ada pengeluaran.');
 let rows=state.rows.slice().reverse().sort((a,b)=>b[0].localeCompare(a[0]));
 if(tab==='Transaksi'&&filter!=='Semua')rows=rows.filter(r=>r[1]===filter);
 if(tab==='Dashboard')rows=rows.slice(0,5);
 const table=panel(tab==='Dashboard'?'Transaksi terakhir':'Daftar transaksi',tab==='Dashboard'?'<button data-tab="Transaksi">Lihat semua</button>':'<select class="filter" aria-label="Jenis transaksi" id="filter">'+opts(['Semua','Pengeluaran','Alokasi','Pengembalian'])+'</select>','<div class="scroll"><table><thead><tr>'+['Tanggal','Keterangan','Divisi','Jenis','Kategori','Nominal'].map(k=>'<th>'+k+'</th>').join('')+'</tr></thead><tbody>'+rows.map(([date,t,d,n,c,note])=>'<tr><td>'+esc(date.split('-').reverse().join('/'))+'</td><td>'+esc(note||c)+'</td><td>'+esc(d)+'</td><td><span class="pill '+(t==='Pengeluaran'?'expense':'')+'">'+esc(t)+'</span></td><td>'+esc(c)+'</td><td><b>'+rp(n)+'</b></td></tr>').join('')+'</tbody></table></div>'+(rows.length?'':'<p>Belum ada transaksi.</p>'));
 $('#view').innerHTML=tab==='Dashboard'?cards+(admin?'<div class="split">'+divpanel+category+'</div>':'<div style="margin-top:18px">'+category+'</div>')+table:tab==='Transaksi'?table:panel('Pengaturan kas','', '<div class="actions">'+action('Saldo awal','Atur saldo awal pimpinan')+action('Divisi','Tambah divisi')+action('Pengembalian','Catat pengembalian')+'</div>')+divpanel+panel('Akses pengurus',action('Akses','Atur akses'),'<p>Daftarkan email Google pengurus ke satu divisi.</p>'+(state.members||[]).map(m=>'<div class="row line"><span>'+esc(m.email)+' · '+esc(m.div)+'</span><button data-revoke="'+esc(m.email)+'">Cabut akses</button></div>').join(''));
 if($('#filter'))$('#filter').value=filter;
}
document.addEventListener('click',e=>{let b=e.target.closest('button');if(!b)return;if(b.dataset.revoke){openForm('Cabut');$('input[name=email]').value=b.dataset.revoke}if(b.dataset.tab){tab=b.dataset.tab;render()}if(b.dataset.mode)openForm(b.dataset.mode)});
document.addEventListener('change',e=>{if(e.target.id==='filter'){filter=e.target.value;render()}if(e.target.name==='cat')$('#custom')?.toggleAttribute('hidden',e.target.value!=='Lainnya')});
const field=(title,html)=>'<label>'+title+html+'</label>';
function openForm(m){
 mode=m;const isTx=['Pengeluaran','Alokasi','Pengembalian'].includes(m);
 $('#ft').textContent=m==='Saldo awal'?'Atur saldo awal pimpinan':m==='Alokasi'?'Bagi saldo ke divisi':m==='Divisi'?'Tambah divisi':'Catat '+m.toLowerCase();
 let html='';
 if(m==='Akses'||m==='Cabut'){
 $('#ft').textContent=m==='Cabut'?'Cabut akses pengurus':'Atur akses pengurus';
 html=field('Email akun Google','<input type="email" name="email" required '+(m==='Cabut'?'readonly':'')+'>');
 if(m==='Akses')html+=field('Divisi yang dapat diakses','<select name="div">'+opts(state.divisions)+'</select>');
 }
 if(m==='Divisi')html=field('Nama divisi','<input name="div" required maxlength="80">');
 if(isTx){const list=m==='Pengeluaran'&&role==='pimpinan'?[...state.divisions,'Pimpinan']:state.divisions;
 html+=field(m==='Pengeluaran'?'Sumber dana':'Divisi','<select name="div">'+opts(list)+'</select>');
 if(m==='Pengeluaran')html+=field('Digunakan untuk biaya apa?','<select name="cat">'+opts(cats)+'</select>')+'<div hidden id="custom">'+field('Nama kategori lainnya','<input name="custom" maxlength="80">')+'</div>';
 if(m==='Alokasi')html+=field('Jenis pembagian','<select name="cat">'+opts(['Saldo awal','Tambahan dana','Kas bon','Pinjaman'])+'</select>');
 html+=field('Tanggal','<input type="date" name="date" required value="'+new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Makassar'})+'">');
 }
 if(isTx||m==='Saldo awal')html+=field('Nominal (Rp)','<input type="number" step="1" min="'+(m==='Saldo awal'?0:1)+'" name="amount" required value="'+(m==='Saldo awal'?state.opening:'')+'">');
 if(isTx)html+=field('Keterangan (opsional)','<input name="note" maxlength="120" placeholder="Misalnya pembayaran listrik balai banjar">');
 $('#fields').innerHTML=html;$('.error').textContent='';$('dialog').showModal();
}
$('#add').onclick=()=>openForm('Pengeluaran');$('#close').onclick=()=>$('dialog').close();
async function load(){try{const response=await fetch('/api/kas'),r=await response.json();if(response.status===401){document.querySelector('#login').hidden=false;throw Error('Masuk dengan akun Google untuk membuka kas.')}if(response.status===403)document.querySelector("#logout").hidden=false;if(!response.ok)throw Error(r.error);document.querySelector('#logout').hidden=false;({state,rev,role}=r);$('#status').textContent='';$('#add').disabled=false;render()}catch(e){$('#view').replaceChildren();$('nav').replaceChildren();$('#add').disabled=true;$('#status').textContent=e.message||'Gagal memuat data kas.'}}
$('dialog form').onsubmit=async e=>{e.preventDefault();const a=Object.fromEntries(new FormData(e.target));a.type=mode;a.rev=rev;a.amount=Number(a.amount);a.cat=a.cat==='Lainnya'?a.custom:a.cat||'Setoran';$('#save').disabled=true;try{const res=await fetch('/api/kas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(a)}),r=await res.json();if(!res.ok){if(res.status===401||res.status===403||res.status===409)await load();throw Error(r.error)}({state,rev,role}=r);render();$('dialog').close();$('#status').textContent='Perubahan tersimpan.'}catch(e){$('.error').textContent=e.message}finally{$('#save').disabled=false}};
load();
