# Buku Kas Banjar — Vercel dan Google Sheets

Aplikasi kas dengan login Google. Pimpinan mengatur saldo awal, membagi dana, menambah divisi, dan memasangkan email pengurus dengan satu divisi. Pengurus melihat kas divisinya dan mencatat pengeluaran menurut kategori. Akun yang belum terdaftar tidak bisa mengakses data.

Versi ini dimulai dengan saldo nol dan daftar divisi kosong. Data pada aplikasi sebelumnya tidak otomatis dipindahkan. Google Sheet adalah buku kas induk. Jangan membagikan Sheet atau akses edit Apps Script kepada pengurus divisi karena file induk berisi semua transaksi. Pengurus cukup mendapat URL aplikasi Vercel.

## 1. Push kode dan buat proyek Vercel

Ekstrak ZIP. Buka terminal di folder yang berisi package.json, lalu buat repository kosong di GitHub dan jalankan perintah berikut. Ganti URL contoh dengan URL repository milik Anda.

```sh
git init
git add .
git commit -m "Buku kas banjar dengan Google Sheets"
git branch -M main
git remote add origin https://github.com/USERNAME/buku-kas-banjar.git
git push -u origin main
```

Di Vercel pilih Add New → Project → import repository → Deploy. Root Directory adalah folder yang berisi vercel.json. Framework Preset adalah Other. Konfigurasi sudah menunjuk ke folder public dan fungsi Node di api. Catat domain produksi tetap, misalnya https://buku-kas-banjar-anda.vercel.app. Gunakan domain yang sama selama konfigurasi.

## 2. Siapkan Google Sheet

1. Buat Google Sheet kosong, beri nama Buku Kas Banjar. Buka Extensions → Apps Script. Ganti isi Code.gs dengan seluruh isi google/Code.gs dari paket.
2. Buat dua secret acak **berbeda**. Jalankan perintah berikut dua kali di terminal. Gunakan hasil pertama sebagai SHEETS_SECRET dan hasil kedua sebagai SESSION_SECRET. Simpan di pengelola kata sandi.
   ```sh
   node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
   ```
3. Di Apps Script → Project Settings → Script Properties, tambahkan OWNER_EMAIL (email akun Google pimpinan) dan SHEETS_SECRET. Salin nilainya persis. Simpan.
4. Pilih fungsi setup di editor, klik Run, lalu izinkan akses ke spreadsheet. Fungsi ini membuat tab BukuKas dan mencatat ID Sheet. Kolom A–H berisi rincian yang bisa dibaca. Kolom I tersembunyi menyimpan data sistem. Lakukan input dan koreksi melalui aplikasi. Mengubah, menghapus, atau mengurutkan ulang baris sumber dapat mengubah riwayat kas.
5. Deploy → New deployment → Web app. Pilih Execute as **Me**, Who has access **Anyone**. Salin Web app URL berakhiran /exec ke SCRIPT_URL. Pengaturan ini memungkinkan server Vercel menghubungi script. Setiap permintaan data tetap memerlukan tanda tangan rahasia dari server. File Sheet tetap privat. Jika akun Workspace memblokir opsi Anyone, administrator perlu mengizinkan deployment ini atau gunakan akun Google yang mengizinkannya.
6. Setelah mengubah Code.gs, buka Deploy → Manage deployments → Edit → New version → Deploy agar URL lama menggunakan kode terbaru.

## 3. Aktifkan login Google

1. Buka Google Cloud Console. Pilih atau buat proyek, lalu buka Google Auth Platform. Lengkapi Branding, email dukungan, dan Audience. Pilih External untuk pengurus yang memakai akun Gmail pribadi. Untuk Testing, tambahkan pimpinan dan pengurus sebagai Test users.
2. Di Clients → Create client → Web application, masukkan Authorized redirect URI **https://DOMAIN-VERCEL-ANDA/api/callback** dengan domain produksi yang tadi dicatat. Simpan Client ID dan Client secret.
3. Login menggunakan cakupan openid dan email. Akses Sheet dilaksanakan Apps Script milik pimpinan.

## 4. Hubungkan Vercel

Di Project → Settings → Environment Variables, isi untuk Production lalu **redeploy**. File .env.example menyediakan templat. Simpan secret hanya pada konfigurasi server.

| Nama | Isi |
| --- | --- |
| APP_ORIGIN | URL produksi, contoh https://buku-kas-banjar-anda.vercel.app |
| GOOGLE_CLIENT_ID | Client ID aplikasi web Google |
| GOOGLE_CLIENT_SECRET | Client secret aplikasi web Google |
| SESSION_SECRET | Secret acak kedua untuk cookie login |
| SCRIPT_URL | Web app URL Apps Script yang berakhiran /exec |
| SHEETS_SECRET | Nilai yang sama persis dengan Script Properties |

## 5. Mulai menggunakan

1. Login dengan email OWNER_EMAIL. Buka Divisi → Atur saldo awal pimpinan. Contoh Rp5.000.000.
2. Di Divisi, pilih Tambah divisi → Upacara. Pilih Bagi saldo → Upacara → Saldo awal → Rp500.000. Pusat kini memegang Rp4.500.000.
3. Buka Divisi → Akses pengurus → Atur akses. Masukkan email Google pengurus, pilih Upacara dan simpan. Satu email terhubung ke satu divisi. Mengatur ulang email yang sama memindahkan aksesnya.
4. Berikan link Vercel kepada pengurus. Setelah masuk, ia hanya menerima data Upacara. Klik Catat pengeluaran → Bensin → Rp50.000. Saldo Upacara kini Rp450.000.
5. Untuk mengecek akses, buka jendela privat dan login dengan email pengurus. Pengurus hanya melihat Dashboard dan Transaksi miliknya. Pimpinan dapat mencabut akses lewat Divisi → Akses pengurus.

## 6. Pembukuan: debit, kredit, dan jurnal

- **Akun:** pimpinan memakai email OWNER_EMAIL. Setiap divisi memakai satu atau beberapa email Google yang didaftarkan di Divisi & akun. Pengurus hanya menerima data divisinya.
- **Jenis transaksi:** Pemasukan (kas didebit), Pengeluaran (kas dikredit), Bagi dana (Kas Pimpinan → kas divisi), dan Pengembalian (kas divisi → Kas Pimpinan). Pengurus dapat mencatat pemasukan dan pengeluaran divisinya sendiri.
- **Jurnal umum:** setiap transaksi tampil sebagai pasangan debit/kredit dengan nomor bukti JU-0001 dan seterusnya. Total debit selalu sama dengan total kredit.
- **Buku kas:** mutasi per akun kas dengan saldo berjalan. Tersedia juga rekap bulanan di dashboard.
- Jurnal dan buku kas dapat diunduh sebagai CSV (terbuka di Excel/Google Sheets) atau dicetak.

## 7. Bukti transaksi di Google Drive

- Saat mencatat transaksi, lampirkan foto nota/kuitansi atau PDF. Bukti juga bisa dilampirkan belakangan lewat tombol **＋ Bukti** di jurnal atau buku kas. Foto otomatis diperkecil di perangkat sebelum diunggah.
- Berkas disimpan di Drive pimpinan dengan struktur `Bukti Kas Banjar/2026/11 November/Divisi Konsumsi/JU-0012 2026-11-20 Pengeluaran Bensin Rp50000.jpg`. Kolom J "Bukti" di tab BukuKas berisi tautannya.
- Untuk memakai folder sendiri, salin ID folder dari URL Drive (`drive.google.com/drive/folders/<ID>`) ke Script Properties dengan nama `DRIVE_FOLDER_ID`. Jika kosong, folder "Bukti Kas Banjar" dibuat otomatis saat `setup` dijalankan.
- Folder Drive tetap privat. Bukti dibuka melalui aplikasi, dan pengurus hanya dapat membuka bukti divisinya.
- Setelah memperbarui Code.gs, jalankan `setup` sekali di editor Apps Script untuk memberi izin akses Google Drive, lalu buat versi deployment baru.

Setiap kali google/Code.gs berubah, salin ulang ke Apps Script lalu Deploy → Manage deployments → Edit → Version: New version → Deploy. Tanpa langkah ini, jenis transaksi baru seperti Pemasukan akan ditolak.

## Pengujian dan pemecahan masalah

Jalankan npm test dengan Node.js 22. Pengujian lokal memakai simulasi layanan Google. Pada deployment Anda, cek login dengan dua akun berbeda dan pastikan transaksi uji muncul di tab BukuKas.

- redirect_uri_mismatch: cocokkan URI callback di Google dengan APP_ORIGIN ditambah /api/callback, termasuk https dan tanpa garis miring tambahan.
- Email belum terdaftar: periksa OWNER_EMAIL atau pemetaan email di Akses pengurus. Pada mode Testing, periksa juga daftar Test users Google.
- Google Sheets belum terhubung: pastikan setup telah selesai, URL memakai /exec, akses web app adalah Anyone, kedua nilai SHEETS_SECRET identik, dan Vercel sudah di-redeploy.
- Jika jaringan terputus saat menyimpan, muat ulang dan periksa riwayat sebelum mengulang. Sistem memproses pembaruan secara bergiliran dan menolak formulir dengan revisi lama.
- Sistem membaca ulang jurnal untuk menghitung saldo. Durasi permintaan akan meningkat ketika jumlah transaksi membesar.

Dokumentasi resmi: [Vercel Functions](https://vercel.com/docs/functions/runtimes/node-js), [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Apps Script Web Apps](https://developers.google.com/apps-script/guides/web).
