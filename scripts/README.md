# scripts/

Perkakas sekali-jalan yang **bukan** bagian dari aplikasi. Tidak pernah dipanggil saat
aplikasi berjalan; dijalankan manual dari terminal.

| Berkas | Guna |
|---|---|
| `urai-master.js` | Mengurai sel Area Produk sheet Master jadi daftar target. Diuji di `test/impor.test.js`. |
| `impor-rancangan-produksi.js` | Membuat paket + targetnya di spreadsheet tujuan dari sheet Master. |
| `nonaktifkan-opsi-kembar.js` | Menonaktifkan pilihan dropdown kembar. Pratinjau dulu; `--terapkan` untuk menulis. |
| `banding/daftar.js` | Daftar fungsi baca + pembanding. Diuji di `test/migrasi.test.js`. |
| `banding/jalan.js` | `--rekam` merekam acuan Sheets; tanpa itu membandingkan `api/_db.js`. |
| `migrasi/env.js` | Memuat `.env` akar repo ke `process.env` (`node` tak melakukannya sendiri). |
| `migrasi/bentuk.js` | Bentuk 18 tabel v1 + pengubah tipe. Diuji di `test/migrasi.test.js`. |
| `migrasi/tarik.js` | Spreadsheet -> `db/dump/*.json`. Hanya baca. |
| `migrasi/ukur.js` | Membandingkan hasil tarikan dengan batas panjang kolom di DDL. |
| `migrasi/muat.js` | `db/dump/*.json` -> MySQL. Tak menyentuh spreadsheet. |

---

## Impor rancangan paket

Mengambil **baris 60–62** sheet *Master Koordinasi Paket* (PCPM, ASN, Sekdin) dan
membuatnya sebagai paket di spreadsheet tujuan. **Tidak** membuat task kolaborasi apa pun —
papan Kolaborasi tidak tersentuh.

### Sebelum menjalankan

1. Aplikasi di lingkungan tujuan sudah versi ≥ 1.83 (punya menu **Rancangan Paket**).
2. **Buka menu Rancangan Paket sekali** di sana, supaya keempat sheet paket dibuat aplikasi
   dengan header yang benar. Skrip ini sengaja tidak membuat sheet sendiri — header dan
   status tersembunyinya harus selalu berasal dari satu tempat. Kalau belum ada, skrip
   berhenti dan memberi tahu.
3. Service account punya akses **Editor** ke spreadsheet tujuan, dan akses **baca** ke sheet
   Master. Kredensialnya dari env `GOOGLE_SERVICE_ACCOUNT_JSON`, atau `credentials.json` di
   akar repo (berkas itu tidak ikut git).

### Jalankan

Uji coba dulu — **tidak menulis apa pun**, hanya menampilkan apa yang akan dibuat:

```bash
TUJUAN_ID=<id-spreadsheet-tujuan> node scripts/impor-rancangan-produksi.js
```

Kalau angkanya sudah cocok, ulangi dengan `--apply`:

```bash
TUJUAN_ID=<id-spreadsheet-tujuan> node scripts/impor-rancangan-produksi.js --apply
```

`AKTOR` bisa diisi kalau pembuatnya ingin dicatat atas nama lain (bawaan: `Nynda (PM)`).

### Yang diharapkan keluar

Di spreadsheet yang belum punya paket sama sekali:

```
+ PKG-001 | JadiPCPM    | PCPM BI 41                 | 19 target
+ PKG-002 | JadiASN     | Road to CPNS 2026          | 38 target
+ PKG-003 | JadiSEKDIN  | Menuju Sekolah Kedinasan   | 25 target
```

### Aman dijalankan berulang

- Paket yang **namanya sudah ada** di tujuan dilewati, bukan ditimpa dan bukan digandakan.
- Nomor `PKG-` dan `ITM-` selalu lanjut dari yang tertinggi di tujuan.
- Kolom **Mirror** dibiarkan kosong: paket hasil impor tidak otomatis tampil ke Lintas Divisi.
- Uji coba adalah bawaannya; menulis hanya kalau diberi `--apply`.

### Kenapa kolomnya dipilih manual

Isi Area Produk tidak seragam. Latsol dan Tryout memang daftar deliverable, tapi Drilling
berisi penjelasan fitur, Materi berisi kisi-kisi, dan Live Class berisi jadwal mingguan.
Menebaknya pernah menghasilkan **62 target sampah** — tiap kalimat penjelasan jadi satu
"target 1 Paket". Karena itu kolom mana yang jadi target ditulis eksplisit di konstanta
`PETA`. Kolom yang tidak jadi target **tidak dibuang**: isinya masuk ke kolom teks bebas
paket itu, jadi tetap terbaca orang.

Kalau sheet Master berubah bentuk atau barisnya bergeser, sesuaikan `PETA` dan
`BARIS_AWAL`/`BARIS_AKHIR`, lalu jalankan uji cobanya lebih dulu.

---

## Migrasi Sheets -> MySQL

Memindahkan 18 tab spreadsheet ke schema `produk_base` (DDL-nya di `db/produk_base.sql`).
Dua tahap terpisah, dengan berkas JSON di antaranya.

```bash
node scripts/migrasi/tarik.js     # Sheets -> db/dump/*.json
node scripts/migrasi/ukur.js      # panjang nilai vs batas kolom
# periksa db/dump/ dulu, terutama berkas *.keluhan.txt
node scripts/migrasi/muat.js      # db/dump/*.json -> MySQL
```

Panduan langkah demi langkah, lengkap dengan pemeriksaan dan daftar masalah yang mungkin
muncul: **[../docs/MIGRASI-MYSQL.md](../docs/MIGRASI-MYSQL.md)**

### Kenapa dua tahap, bukan satu

Satu skrip langsung Sheets ke MySQL lebih pendek, tapi membuat tiga hal mustahil:

1. **Memeriksa sebelum menulis.** Berkas JSON di antaranya bisa dibuka siapa saja sebelum
   satu baris pun masuk database. Migrasi yang tak bisa diperiksa lebih dulu adalah migrasi
   yang baru ketahuan salahnya sesudah terlambat.
2. **Memisahkan kredensial.** `tarik.js` hanya memegang kredensial Google (dengan scope
   `spreadsheets.readonly`, jadi menulis ke sheet mustahil, bukan sekadar tidak dilakukan).
   `muat.js` hanya memegang kredensial MySQL. Tak pernah ada satu proses yang bisa keduanya.
3. **Mengulang tanpa menembak Sheets lagi.** Muat yang gagal di tengah bisa diulang dari
   berkas, tanpa menghabiskan kuota API.

### Env yang dibutuhkan

| Tahap | Env |
|---|---|
| tarik | `SPREADSHEET_ID`, dan `GOOGLE_SERVICE_ACCOUNT_JSON` atau `credentials.json` di akar repo |
| muat | `MYSQL_HOST` `MYSQL_PORT` `MYSQL_USER` `MYSQL_PASSWORD` `MYSQL_DATABASE`, opsional `MYSQL_CA` |

`muat.js` butuh paket `mysql2` (`npm install mysql2`). Sambungannya memakai TLS. Tanpa
`MYSQL_CA`, lalu lintasnya terenkripsi tapi identitas server **tidak** diverifikasi — cukup
untuk menutup penyadapan pasif di jalur publik, tidak cukup untuk menangkal orang-di-tengah.
Minta berkas CA ke IT kalau itu diperlukan.

### Penolakan itu hasil, bukan kegagalan

Kunci asing sengaja dibiarkan menyala saat memuat. Godaannya besar untuk mematikannya supaya
"semuanya masuk", tapi justru penolakannya yang berharga: tiap baris yang ditolak adalah
kerusakan yang selama ini ada di spreadsheet tanpa pernah terlihat — setoran yang menunjuk
target yang sudah dihapus, target kembar ber-ID sama, tanggal yang bukan tanggal.
Mematikan `FOREIGN_KEY_CHECKS` berarti memindahkan kerusakan itu ke tempat baru lalu
menamainya keberhasilan.

Yang ditolak ditulis ke `db/dump/<tabel>.tolak.txt`, lengkap dengan nama sheet dan nomor
barisnya supaya bisa langsung dibuka. Yang sekadar aneh — satu sel tanggal rusak, misalnya —
**tidak** menggugurkan barisnya: selnya dikosongkan dan dicatat di `*.keluhan.txt`.
Kehilangan satu tanggal bisa diperbaiki; kehilangan seluruh task-nya tidak.

Satu pengecualian yang disengaja: collab yang menunjuk paket tak ada **tetap dimuat**, hanya
tautannya yang dilepas. Proses kolaborasi adalah pekerjaan yang berdiri sendiri.

### Penjaga

`muat.js` menolak jalan kalau ada tabel yang sudah berisi — memuat ke tabel berisi adalah
cara tercepat melipatgandakan data tanpa sadar, persis bug 1.120.0 tapi untuk seluruh
database. Untuk mengulang dari nol, jalankan dengan `--ulang` (isinya dihapus lebih dulu).

`db/dump/` **diabaikan git**. Isinya seluruh data produksi, termasuk `pm_notes`.

### Yang masih harus dikerjakan sesudah migrasi

Aplikasi belum membaca dari MySQL. Yang menuntut perubahan kode sudah ditulis di bagian
catatan `db/produk_base.sql`: enam tabel di v1 dialamatkan lewat **nomor baris** spreadsheet
(`findLinkByRow`, `deleteNote`, dan sejenisnya), dan di MySQL mereka punya id sendiri.
