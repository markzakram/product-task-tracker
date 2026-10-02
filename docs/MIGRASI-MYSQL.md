# Migrasi Sheets → MySQL — panduan menjalankan

Memindahkan 18 tab spreadsheet ProductTrack v1 ke schema MySQL `produk_base`, **tanpa
mengubah apa pun di aplikasi yang sedang berjalan.** Selama seluruh panduan ini dijalankan,
spreadsheet tetap jadi satu-satunya sumber kebenaran dan tak satu pun selnya tersentuh.

---

## Peta: empat tahap, baru dua yang ada

| Tahap | Isinya | Yang berubah di produksi |
|---|---|---|
| **1** | `CREATE TABLE` di `produk_base` | **nol** — tabelnya kosong |
| **2** | Salin data Sheets → MySQL, cocokkan jumlahnya | **nol** — Sheets tetap sumber kebenaran |
| 3 | Aplikasi membaca dari MySQL | Sheets dipertahankan sebagai cadangan |
| 4 | Sheets dipensiunkan | — |

Panduan ini mencakup **tahap 1 dan 2 saja.** Keduanya bisa dijalankan, diperiksa, dan kalau
perlu diulang dari nol tanpa ada seorang pun pengguna yang merasakan apa-apa. Itu disengaja:
tahap yang bisa dibatalkan tanpa akibat adalah tahap yang boleh dicoba.

---

## Sebelum mulai

Lima hal, semuanya bisa diperiksa sendiri:

1. **Schema `produk_base` sudah dihibahkan IT.** Periksa dengan `SHOW GRANTS FOR
   CURRENT_USER();` — harus ada barisnya. Kalau belum, lihat bagian *Kalau macet* di bawah.
2. **Node 18 ke atas.** `node -v`
3. **Paket `mysql2`** — `npm install mysql2`
4. **Kredensial Google**: env `GOOGLE_SERVICE_ACCOUNT_JSON`, atau berkas `credentials.json`
   di akar repo. Service account-nya cukup punya akses **baca** ke spreadsheet.
5. **`SPREADSHEET_ID` spreadsheet produksi.** Ini satu-satunya nilai yang tak bisa ditebak
   dan tak boleh salah — salah ID berarti membaca spreadsheet yang keliru dan menyadarinya
   terlambat.

### Mengisi env — lewat berkas, bukan diketik di terminal

**Jangan mengetik kata sandi database di PowerShell.** PowerShell menyimpan setiap baris yang
Anda ketik ke berkas teks biasa, dan menyimpannya di sana selamanya:

```
%APPDATA%\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt
```

Periksa sendiri kalau ragu — berkas ini nyata dan sedang aktif di mesin Anda:

```
Get-PSReadLineOption | Select-Object HistorySavePath
```

Sekali `$env:MYSQL_PASSWORD = "..."` diketik, kata sandi itu ada di disk sebagai teks biasa,
di berkas yang tak pernah dilihat siapa pun lagi, sampai bertahun-tahun ke depan.

Pakai berkas `.env` di akar repo. Ia sudah diabaikan git sejak awal:

```bash
cp .env.example .env
```

Lalu buka `.env` dan isi enam baris ini:

| Baris | Isinya |
|---|---|
| `SPREADSHEET_ID` | ID spreadsheet produksi |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | **kosongkan** kalau `credentials.json` sudah ada di akar repo — lihat peringatan di bawah |
| `MYSQL_HOST` | `34.128.116.164` |
| `MYSQL_USER` | `produk_db` |
| `MYSQL_PASSWORD` | dari IT |
| `MYSQL_DATABASE` | `produk_base` |

`.env.example` sudah berisi semuanya lengkap dengan penjelasannya; tinggal diisi.

> **Soal `GOOGLE_SERVICE_ACCOUNT_JSON`.** Baris ini **menang** atas `credentials.json`. Kalau
> ia terisi apa pun, berkas itu tak akan dilihat sama sekali. Jadi kalau Anda memakai
> `credentials.json` di akar repo — dan itu cara yang paling mudah — baris ini harus
> betul-betul **kosong**, bukan sekadar "tidak disentuh".
>
> Dulu `.env.example` mengirim baris ini sudah terisi contoh. Nilainya JSON yang sah dengan
> private key palsu, jadi lolos `JSON.parse` dan baru gagal jauh di dalam OpenSSL dengan
> `error:1E08010C:DECODER routines::unsupported` — pesan yang benar secara teknis dan tak
> menyebut satu pun hal yang berguna. Sekarang contohnya sudah jadi komentar dan nilainya
> dikosongkan, dan `tarik.js` menolak kunci yang terlalu pendek sambil menyebut jalan keluarnya.

Skrip migrasi memuat `.env` sendiri. `vercel dev` memang memuatnya otomatis, tapi
`node scripts/...` tidak — itulah yang dulu membuat bagian ini membingungkan.

Kalau sekali-sekali perlu menimpa satu nilai untuk satu kali jalan, env dari shell tetap
menang atas isi berkas:

```
$env:SPREADSHEET_ID = "id-spreadsheet-staging"
```

Itu aman karena bukan kata sandi.

---

## Langkah 1 — Buat tabelnya

Jalankan `db/produk_base.sql` lewat MySQL Workbench atau phpMyAdmin. Isinya hanya
`CREATE TABLE`; tak ada satu pun baris data.

Sesudahnya, **periksa dua hal** — bukan satu:

```sql
SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA='produk_base' ORDER BY TABLE_NAME;
```

Harus **18 baris**, semua `InnoDB`, semua `utf8mb4_0900_ai_ci`.

```sql
SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='produk_base' AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME, CONSTRAINT_NAME;
```

Harus **9 baris** — delapan kunci asing, tapi `fk_contrib_step` memakai dua kolom sekaligus
jadi muncul dua kali.

Daftar tabel kelihatan di panel Schemas, **kunci asingnya tidak.** Kalau kueri kedua
mengembalikan 0 baris, tabelnya terbuat tapi relasinya tidak — dan itu baru akan meledak
jauh di belakang, saat memuat. Periksa sekarang.

---

## Langkah 2 — Tarik dari spreadsheet

```bash
node scripts/migrasi/tarik.js
```

Hasilnya berkas JSON di `db/dump/`, satu per tabel, plus `ringkasan.json`.

Skrip ini memakai scope `spreadsheets.readonly`. Artinya menulis ke spreadsheet bukan
sekadar tidak dilakukan — secara teknis **mustahil**, karena izinnya memang tak diminta.

Keluarannya kira-kira begini:

```
  users                  12 baris
  options               143 baris
  ...
  tasks                 475 baris
  collab_steps          892 baris  keluhan: 3

  total 3104 baris siap muat, 3 keluhan
```

### Soal tanggal, supaya tak perlu dikhawatirkan

Sheets mengembalikan tanggal sebagai **angka serial**, bukan teks. Konversinya memanggil
`formatDate()` milik `api/_sheets.js` — fungsi yang sama yang dipakai aplikasi setiap hari —
bukan rumus yang ditulis ulang. Rumus itu punya konstanta yang kalau meleset satu hari akan
menggeser seluruh tanggal di sistem tanpa ada yang terlihat salah.

Zona waktu **tidak** digeser. Komponen tanggalnya keluar persis seperti yang tertulis di
spreadsheet.

Satu hal yang diperbaiki saat menarik: sebagian stempel lama tersimpan sebagai bilangan bulat
yang kehilangan titik desimalnya. Di staging, **145 dari 145** nilai `Done At` kolaborasi kena.
Tanpa perbaikan ini semuanya masuk sebagai kosong, dan hitungan kolaborasi selesai jadi nol
selamanya tanpa ada yang terlihat salah.

---

## Langkah 3 — Periksa hasilnya

**Ini langkah yang paling sering dilewati, dan satu-satunya alasan tarik dipisah dari muat.**
Data belum masuk ke mana pun. Semuanya masih bisa dibatalkan dengan menghapus satu folder.

Tiga pemeriksaan:

**a. Jumlahnya masuk akal.** Buka `db/dump/ringkasan.json`. Bandingkan `siapMuat` tiap tabel
dengan jumlah baris yang Anda lihat sendiri di spreadsheet. Selisih besar berarti rentang
bacanya salah, bukan datanya.

**b. Baca keluhannya.** Tiap `db/dump/*.keluhan.txt` menyebut nama sheet dan nomor barisnya,
jadi bisa langsung dibuka:

```
COLLAB_STEPS!418 done_at: bukan stempel waktu, dikosongkan — isi aslinya "selesai"
Main!233 dibuang: kolom task_id kosong
```

**c. Ukur panjangnya.**

```bash
node scripts/migrasi/ukur.js
```

Panjang `VARCHAR` di DDL ditentukan berdasarkan penilaian terhadap isi kolomnya; Sheets tak
punya batas panjang sama sekali. Satu catatan yang luar biasa panjang cukup untuk
menghentikan pemuatan di tengah jalan — sesudah ratusan baris lain terlanjur masuk.

Skrip ini juga menyebut kolom yang sudah terpakai di atas 80% batasnya: belum gagal, tapi akan
gagal pada baris berikutnya yang sedikit lebih panjang.

Kalau ada yang kepanjangan, ia memberi `ALTER TABLE` siap pakai — dengan deklarasi aslinya
disalin dari DDL, jadi kolom yang boleh NULL tetap boleh NULL. **Lebarkan kolomnya, jangan
potong datanya.** Memotong berarti menghilangkan isi yang ditulis orang, dan hilangnya tak
akan pernah ketahuan. Tapi lihat dulu baris aslinya di spreadsheet: nilai yang jauh di luar
kebiasaan kadang bukan data panjang, melainkan sel yang salah isi.

---

## Langkah 4 — Muat ke MySQL

```bash
node scripts/migrasi/muat.js
```

Sumbernya hanya berkas JSON tadi. Spreadsheet tidak disentuh sama sekali di langkah ini.

```
  tersambung ke produk_base di 34.128.116.164

  users                  12 / 12
  packages               41 / 41
  package_items         662 / 664    tolak: 2
  ...

  --- hitungan di database ---
  users                  12
  package_items         662

  3098 baris masuk, 6 ditolak
```

### Penolakan itu hasil, bukan kegagalan

Kunci asing **sengaja dibiarkan menyala.** Godaannya besar untuk mematikannya supaya "semuanya
masuk", tapi justru penolakannya yang berharga: tiap baris yang ditolak adalah kerusakan yang
selama ini ada di spreadsheet tanpa pernah terlihat — setoran yang menunjuk target sudah
dihapus, target kembar ber-ID sama, tanggal yang bukan tanggal.

Mematikan `FOREIGN_KEY_CHECKS` berarti memindahkan kerusakan itu ke tempat baru lalu
menamainya keberhasilan.

Jangan panik melihat angka tolakan. **Enam tolakan dari tiga ribu baris itu hasil yang sehat**,
bukan migrasi yang gagal. Yang perlu dilihat adalah apa isinya.

### Lima tolakan `options` itu sudah diperiksa — biarkan

Tiap kali dijalankan, `options` akan menolak lima baris. Ini **sudah diputuskan dan disetujui**,
bukan sesuatu yang perlu diselidiki ulang:

| Nilai | Muncul di baris |
|---|---|
| `Membuat` | 126, 136 (`membuat`), 144 |
| `Menyusun` | 118, 137 (`menyusun`), 143 |
| `Menyelesaikan` | 141, 142 |

Sheet OPTIONS memang memuat verb yang sama beberapa kali, sebagian hanya beda huruf besar-kecil.
Collation `utf8mb4_0900_ai_ci` buta huruf besar-kecil, jadi MySQL menganggapnya satu nilai dan
menyimpan **kemunculan pertama** — yang kebetulan juga yang ejaannya benar.

Ini perbaikan, bukan kehilangan. Dropdown "Kata Kerja" selama ini menampilkan "Membuat" tiga
kali. Task lama tetap utuh karena `kata_kerja` hanyalah teks, bukan rujukan ke baris OPTIONS.

Selama Sheets masih jadi sumber kebenaran, duplikatnya tetap ada di sana dan lima tolakan ini
akan muncul lagi di setiap tarikan. Itu wajar.

### Yang ditolak vs yang sekadar dikeluhkan

| | Akibatnya | Dicatat di |
|---|---|---|
| Satu sel aneh (tanggal rusak) | selnya dikosongkan, **barisnya tetap masuk** | `*.keluhan.txt` |
| Rujukan menggantung, ID kembar | **barisnya tidak masuk** | `*.tolak.txt` |

Kehilangan satu tanggal bisa diperbaiki; kehilangan seluruh task-nya tidak. Karena itu satu sel
rusak tak pernah menggugurkan barisnya.

Satu pengecualian yang disengaja: **collab yang menunjuk paket tak ada tetap dimuat**, hanya
tautannya yang dilepas dan dicatat. Proses kolaborasi adalah pekerjaan yang berdiri sendiri —
kehilangan tautannya jauh lebih ringan daripada kehilangan prosesnya.

### Penjaganya

`muat.js` **menolak jalan** kalau ada tabel yang sudah berisi. Memuat ke tabel berisi adalah
cara tercepat melipatgandakan data tanpa sadar — persis bug 1.120.0, tapi untuk seluruh
database sekaligus.

---

## Langkah 5 — Cocokkan

`muat.js` sudah membandingkan jumlah yang ia kira masuk dengan `COUNT(*)` sungguhan. Kalau ada
yang tak cocok ia bilang, dan jangan dilanjutkan sebelum itu jelas.

Satu pemeriksaan tambahan yang layak dilakukan sendiri — ambil satu task yang Anda hafal isinya,
dan bandingkan baris demi baris:

```sql
SELECT * FROM produk_base.tasks WHERE task_id = 'TSK-019';
```

Yang dilihat: tanggalnya benar (bukan geser sehari), teks Indonesianya utuh (bukan `â€"`), dan
`lintas_view` cocok dengan kenyataan di aplikasi. Hitungan yang cocok membuktikan **jumlahnya**
benar; hanya mata Anda yang bisa membuktikan **isinya** benar.

---

## Mengulang dari nol

Selama tahap 1–2, mengulang itu murah dan tak ada akibatnya bagi siapa pun:

```bash
node scripts/migrasi/muat.js --ulang
```

`--ulang` **menghapus** isi semua tabel lebih dulu, dalam urutan terbalik supaya kunci asingnya
tak protes. Aman sekarang, karena belum ada aplikasi yang membaca dari MySQL dan belum ada
seorang pun yang menulis ke sana.

Berhenti memakai `--ulang` begitu tahap 3 dimulai.

---

## Kalau macet

| Pesan | Artinya | Lakukan |
|---|---|---|
| `Error 1044 Access denied ... to database` | hibah schema-nya belum ada | minta IT `GRANT ALL PRIVILEGES ON \`nama\`.*`. Server ini menyalakan `partial_revokes`, jadi hibah berpola `produk\_%` **tidak bekerja** — harus nama persisnya |
| `Env SPREADSHEET_ID belum diset.` | env belum diisi | lihat bagian *Sebelum mulai* |
| `Kredensial tak ada.` | tak ada kredensial Google | isi `GOOGLE_SERVICE_ACCOUNT_JSON` atau taruh `credentials.json` di akar repo |
| `Paket mysql2 belum terpasang.` | — | `npm install mysql2` |
| `Tabel belum dibuat: ...` | DDL belum dijalankan | kembali ke Langkah 1 |
| `Tabel ini sudah berisi: ...` | penjaganya bekerja | sengaja. Pakai `--ulang` kalau memang mau mengulang |
| `ETIMEDOUT` / `ECONNREFUSED` | jaringan atau IP belum diizinkan | server ini membatasi IP. Kalau Workbench bisa menyambung tapi skripnya tidak, biasanya jaringannya beda |
| `ER_CON_COUNT_ERROR` | server penuh | `max_connections` 150 dan pernah tersentuh 208. Jalankan di luar jam sibuk; skrip ini hanya memakai satu sambungan |
| `ER_DATA_TOO_LONG` | kolom kurang lebar | harusnya tertangkap `ukur.js` di Langkah 3. Lebarkan kolomnya |
| `ER_BAD_NULL_ERROR` | kolom wajib kosong | biasanya baris jalaran formula: isinya hanya di satu kolom, sisanya hampa. Secara teknis tak kosong, jadi lolos penyaring. Tambahkan `wajib` di `bentuk.js` untuk tabel itu |
| `ER_NO_REFERENCED_ROW_2` | rujukan menggantung | lihat `*.tolak.txt`; ini kerusakan lama di spreadsheet yang baru terlihat. Awas juga string kosong `''` — ia **bukan** NULL, dan kunci asing akan mencarinya sebagai ID sungguhan |
| `ER_DUP_ENTRY` | ID kembar | biasanya sisa bug duplikasi 1.120.0. Lihat `*.tolak.txt` |
| teks jadi `â€"` atau `Ã¨` | database lahir bukan `utf8mb4` | `ALTER DATABASE` di awal `produk_base.sql` memang untuk ini. Jalankan ulang bagian itu, lalu muat ulang dengan `--ulang` |
| sheet tak ada | fitur yang belum pernah dipakai | tidak apa-apa. Skripnya mencatat lalu lanjut |

---

## Yang **tidak** dilakukan panduan ini

Supaya jelas batasnya:

- **Tidak** mengubah satu baris pun kode aplikasi. ProductTrack tetap membaca dan menulis ke
  spreadsheet seperti biasa, selama dan sesudah migrasi.
- **Tidak** menulis apa pun ke spreadsheet. Scope-nya `readonly`.
- **Tidak** menghapus apa pun dari spreadsheet.
- **Tidak** memindahkan Product Knowledge, guru-freelance, atau jadwalMomentum. Masing-masing
  punya schema sendiri dan jadwalnya sendiri.

Artinya kalau migrasinya berantakan, jalan keluarnya adalah menghapus isi `produk_base` dan
melupakannya. Tak ada yang perlu dipulihkan.

---

## Sesudah migrasi berhasil

Data sudah ada di MySQL, aplikasi masih membaca Sheets. Itu keadaan yang stabil dan boleh
didiamkan selama yang diperlukan.

Dua hal yang menunggu di tahap 3:

**Enam tabel dialamatkan lewat nomor baris.** `LINKS`, `NOTES`, `DASHBOARDS`, `CHECKLIST`,
`COMMENTS`, dan `ACTIVITY` di v1 diakses lewat nomor baris spreadsheet — `findLinkByRow(row)`,
`deleteNote(row)`. Nomor baris bergeser setiap kali ada yang dihapus, dan v1 hidup dengan itu
karena tak punya pilihan. Di MySQL mereka punya id sendiri. Ini satu-satunya kelompok perubahan
kode yang **wajib** sebelum aplikasi bisa pindah.

**IP Vercel belum tentu diizinkan.** Fungsi serverless Vercel keluar dari IP yang berubah-ubah,
sementara server MySQL ini membatasi IP. Ini perlu dibicarakan dengan IT **sebelum** menulis
kode tahap 3, bukan sesudahnya — kalau jalan ini tertutup, bentuk tahap 3-nya ikut berubah.

---

## Tahap 3 — mengalihkan aplikasi ke MySQL

Seluruh lapisan data tersambung lewat **satu baris** di `api/rpc.js`:

```js
const backend = require('./_sheets');
```

Jadi peralihannya tidak menyentuh 64 titik panggilan. Yang dibuat adalah `api/_db.js`
yang mengekspor 64 nama yang sama, lalu baris itu memilih berdasarkan env. Membalikkannya
kalau ada masalah juga satu env, bukan deploy ulang yang panik.

### Saklarnya sudah terpasang

```bash
node scripts/banding/siap.js
```

Menjawab satu pertanyaan dengan pasti: **kalau saklarnya ditukar sekarang, apa yang akan
rusak?** Ia membaca daftar aksi langsung dari `api/rpc.js`, mencocokkannya dengan
`api/_db.js`, memeriksa kredensial dan isi database, lalu menjawab SIAP atau BELUM SIAP
beserta daftar fungsi yang kurang. Tidak menulis apa pun.

Daftarnya dibaca dari `rpc.js`, bukan ditulis ulang — daftar salinan akan ketinggalan
begitu ada aksi baru, dan ketinggalannya diam karena pemeriksa tetap bilang "siap".

**Sumber datanya diputuskan di `api/_backend.js`**, satu berkas, dipakai `rpc.js` maupun
`metrics.js`:

```js
const backend = SUMBER === 'mysql' ? require('./_db.js') : require('./_sheets.js');
```

Bawaannya **sengaja** `sheets`. Env yang hilang, salah ketik, atau belum sempat diset di
lingkungan baru jatuh ke perilaku lama — bukan ke backend yang kredensialnya belum tentu
ada. Nilai yang tak dikenal ditolak keras: `mysq1` tidak diam-diam menjalankan Sheets.

### `/api/metrics` nyaris tertinggal

`/api/rpc` bukan satu-satunya yang membaca spreadsheet. `api/metrics.js` juga, dan kalau
hanya `rpc.js` yang dialihkan ia akan terus membaca spreadsheet yang **tak lagi
diperbarui** — lalu menyajikan angka basi ke sistem OKR tanpa satu pun tanda bahwa ada
yang salah. Angka yang salah diam-diam jauh lebih buruk daripada endpoint yang mati,
karena tak ada yang memeriksanya ulang.

Karena itu keduanya kini memutuskan lewat `_backend.js` yang sama; tak mungkin terpisah.

| Endpoint | Sebelum | Sesudah `DATA_SOURCE=mysql` |
|---|---|---|
| `/api/rpc` | spreadsheet | **MySQL** |
| `/api/metrics` | spreadsheet | **MySQL** |
| `/api/mcp` → OKR | sheet OKR terpisah | **tetap sheet OKR** |
| Login Google | OAuth | tetap OAuth |

Sheet OKR milik manager tetap di Google — itu spreadsheet lain, bukan bagian migrasi ini.
`googleapis` juga tetap terpasang karena login Google memakainya untuk memverifikasi token,
bukan untuk membaca sheet.

**Jangan hapus kredensial Google.** `GOOGLE_SERVICE_ACCOUNT_JSON` dan `SPREADSHEET_ID`
masih dibutuhkan sheet OKR, dan selama masa transisi keduanya adalah jalan pulang:
tanpa itu, `DATA_SOURCE=sheets` tak bisa menyelamatkan apa pun.

### Yang hilang saat pindah: riwayat versi

Spreadsheet punya riwayat versi otomatis dari Google — bisa mundur ke keadaan minggu lalu
kapan saja, tanpa menyiapkan apa pun lebih dulu. **MySQL tidak begitu.** Begitu pindah,
tak ada cadangan sampai ada yang membuatnya.

Tanyakan ke IT **sebelum** peralihan, bukan sesudah: apakah `produk_base` masuk jadwal
backup mereka, dan berapa lama disimpan. Kalau tidak, itu harus disiapkan sendiri.

Dan sesudah peralihan, jadikan spreadsheet-nya **hanya-baca** — supaya tak ada yang
menyunting di sana lalu bingung kenapa perubahannya tak muncul.

### Alat banding — kerjakan ini LEBIH DULU, sebelum `_db.js`

```bash
node scripts/banding/jalan.js --rekam    # rekam keluaran Sheets jadi acuan
node scripts/banding/jalan.js            # bandingkan _db.js dengan acuan
```

Beralih tanpa ini berarti bertaruh bahwa 64 terjemahan tak satu pun meleset. Taruhan itu
akan kalah. Karena kedua backend punya tanda tangan fungsi identik, keduanya bisa dipanggil
berdampingan dan hasilnya dibandingkan otomatis dengan data sungguhan.

Ditulis lebih dulu, sebelum satu fungsi pun dipindahkan, supaya tiap fungsi punya ukuran
benar-salahnya sendiri sejak baris pertama — bukan diperiksa belakangan saat semuanya sudah
ditulis dan kesalahannya sudah saling menutupi.

**Kenapa direkam, bukan memanggil keduanya berdampingan tiap kali.** Spreadsheet itu hidup:
selama migrasi kemarin saja `comments` bertambah dari 423 ke 425. Memanggil keduanya
berurutan membuat beda yang muncul bisa jadi cuma orang yang sedang bekerja — beda palsu
yang memakan waktu untuk ditelusuri. Acuan yang beku membandingkan hal yang sama.

Rekam ulang acuannya sesudah `tarik`+`muat` berikutnya. Acuan basi menghasilkan beda palsu,
dan alat banding yang sering salah akan berhenti dipercaya.

### Kemajuan

| Kelompok | Fungsi | Status |
|---|---|---|
| 1 — daftar sederhana | `getUsers` `listPinUsers` `getAllLinks` `getAllDashboards` `getAllNotes` | **cocok** |
| 2 — berstruktur | `getTasks` `getOptions` `getComments` `getChecklist` `getActivityLog` `getNotifications` | **cocok** |
| 3 — bersarang | `getCollabs` `getPackages` `getBootstrapData` `getAllCommentsLite` `getChecklistSummary` | **cocok** |
| 4 — link, catatan, dashboard, folder | 13 fungsi tulis | **cocok, 35 skenario** |
| 4 — sisanya | 37 fungsi tulis | belum |

**27 dari 64 fungsi sudah pindah.** Sisanya: kolaborasi (8), user & PIN (7), task (6),
ceklis (5), paket (4), opsi (4), komentar/notifikasi/setup (3).

### Fungsi tulis dibandingkan dengan cara lain

```bash
node scripts/banding/tulis.js --siapkan   # samakan kedua sisi dari spreadsheet uji
node scripts/banding/tulis.js             # jalankan skenario, bandingkan
```

Fungsi tulis tak bisa dipanggil berdampingan seperti fungsi baca. Menjalankan `saveTask()`
di kedua backend berarti menulis dua kali ke dua tempat — itu bukan perbandingan, melainkan
dua sumber kebenaran yang langsung menyimpang.

Yang dibandingkan dua hal: **nilai kembaliannya** (`{success, message, ...}` yang dipakai
layar) dan **keadaan sesudahnya**, dibaca lewat fungsi baca yang sudah terbukti setara.
Lapisan baca itulah penilainya — karena itu ia dikerjakan lebih dulu; tanpa ia terbukti,
alat ini tak membuktikan apa pun.

**Penjaganya dua lapis, karena alat ini menulis.** Ia menuntut env `SPREADSHEET_ID_UJI`
tersendiri dan **menolak jalan** kalau nilainya sama dengan `SPREADSHEET_ID`. Pakai
spreadsheet staging — lihat [STAGING.md](STAGING.md).

`--siapkan` mengisi MySQL dari spreadsheet uji itu, supaya kedua sisi berangkat dari isi
yang identik; beda yang muncul berarti beda perilaku, bukan beda data awal. **Sesudah
selesai menguji, pulihkan isinya** dengan `tarik` + `muat --ulang` biasa.

Tiap skenario merapikan jejaknya sendiri. Yang dibuat dihapus lagi di langkah terakhir,
karena alat ini dijalankan berulang kali selama penggarapan dan jejak yang menumpuk membuat
jalan berikutnya gagal dengan sebab yang tak ada hubungannya.

### Jebakan `row < 2`

`_sheets.js` menolak pegangan `row < 2`, dan itu benar untuk spreadsheet: baris 1 adalah
judul kolom. Di MySQL pegangannya id `AUTO_INCREMENT`, yang **mulai dari satu**.

Menyalin batas itu membuat baris pertama tiap tabel permanen tak bisa disunting maupun
dihapus — dan diamnya sempurna: tombolnya ada, ditekan, lalu muncul "Baris tidak valid"
tanpa sebab yang masuk akal. Tak ada yang akan menduga penyebabnya sebuah konstanta
pembatas. `_db.js` memakai `peganganSah()` dengan batas `< 1`, dan itu perbedaan yang
disengaja.

### Tiga hal yang tak mungkin sama, dan cara menanganinya

**Stempel waktu disamarkan, bukan dibuang.** `addNote` menulis `nowStamp()`, dan kedua
backend memanggilnya pada detik yang berbeda. Membandingkannya mentah-mentah membuat
skenario catatan selalu gagal; membuangnya akan menyembunyikan kasus yang justru perlu
ketahuan — stempel yang tidak terisi, atau terisi dengan bentuk keliru. Jadi nilainya
diganti penanda `<pola cocok>`. "Keduanya punya stempel yang sah" tetap diperiksa.

**Kuota Sheets menyamar jadi beda.** Fungsi baca di `_sheets.js` sengaja menelan kegagalan
baca menjadi daftar kosong — supaya aplikasi tak gagal terbuka, dan itu keputusan yang
benar di sana. Tapi di alat banding, kehabisan kuota muncul sebagai `panjang beda: 0 vs 9`,
yang terlihat persis seperti bug sungguhan. Skenario yang beda **diulang sekali** sebelum
divonis, dan pengulangannya dilaporkan (`1 lulus setelah diulang`) supaya tak ada yang
menyangka jalannya mulus.

**Beda yang memang disengaja ditandai, bukan disembunyikan.** `bedaSengaja` menuntut alasan
tertulis, dan kalau yang ditandai itu ternyata **sama**, jalannya tetap digagalkan — karena
berarti alasannya sudah tak berlaku dan catatan itu menyesatkan pembaca berikutnya.

### Bug v1 yang ditemukan alat ini: dashboard siluman

`updateDashboard` tak memeriksa keberadaan baris sama sekali. Untuk pegangan yang sudah
basi — halaman lama yang menekan Simpan setelah dashboard-nya dihapus dari tempat lain —
akibatnya berlainan:

| | Yang terjadi |
|---|---|
| Sheets | `valuesUpdate` menulis ke baris itu **apa pun isinya**, termasuk baris di luar data. Muncul dashboard yang tak pernah ditambahkan siapa pun. |
| MySQL | `UPDATE ... WHERE id = ?` tak mengenai apa pun. |

Keduanya mengembalikan `success`, jadi layar tak memberi tanda apa-apa. Terbukti di staging:
baris `[ujibanding] Hantu` betul-betul tercipta di sheet, dan tertinggal sampai dibersihkan.

Perbedaan ini **tidak diperbaiki** — v1 ditiru apa adanya, dan yang di MySQL kebetulan yang
benar. Ditandai `bedaSengaja` supaya tetap terlihat tiap kali alat ini dijalankan.

### Pegangan basi — alasan terkuat memilih id

Salah satu skenario menguji halaman lama yang menekan Hapus untuk link yang sementara itu
sudah dihapus dari tempat lain. Di Sheets ini berbahaya: menghapus baris membuat baris di
bawahnya naik, jadi pegangan basi menunjuk baris yang kini ditempati link **lain**. Yang
menyelamatkan cuma pemeriksaan kepemilikan, dan itu tak menolong kalau penggantinya
kebetulan milik orang yang sama.

Di MySQL id tak pernah dipakai ulang, jadi pegangan basi tak menunjuk apa pun.

**Seluruh fungsi baca selesai.** 24 kasus banding dengan data sungguhan, 0 beda — termasuk
ketiga cabang muat-awal (biasa, Lintas Divisi, magang).

### Yang dipakai bersama, bukan disalin

Tiga bagian `_sheets.js` dipisahkan dari pengambilan datanya supaya `_db.js` memanggil
fungsi yang **sama**, bukan menyalin isinya:

| Fungsi | Kenapa tak boleh disalin |
|---|---|
| `susunBootstrap` | menyaring data magang & tamu Lintas Divisi. Dua salinan yang menyimpang berarti kebocoran, bukan sekadar tampilan keliru |
| `readPackages` (lewat `pre`) | menghitung terpenuhi/menunggu/sisa/status/ringkas berlapis-lapis. Menyimpang di sini berarti ANGKA yang salah, dan angka salah tak tampak sebagai error |
| `loadCollabsRaw` (lewat `preC`/`preS`) | aturan `paketId` hanya diakui kalau berpola `PKG-xxx`, plus hitungan done/total/status |

`_db.js` menyusun baris dari MySQL ke bentuk "baris sheet" lalu menyuapkannya. Itu mekanis
dan bisa diperiksa sekilas; perhitungannya tidak. Ketika Sheets dipensiunkan, fungsi-fungsi
murni itu dipindahkan ke modul bersama dan lapisan perantara ini hilang.

### Lima aturan boolean yang berbeda

Kolom yang semuanya terlihat seperti ya/tidak ternyata ditafsirkan dengan lima aturan yang
berlainan. Memakai satu aturan untuk semuanya akan salah membaca data tanpa ada yang tahu:

| Kolom | Aturan | Kosong berarti |
|---|---|---|
| `OPTIONS.Active` | hanya `TRUE` | tidak aktif |
| `USERS.Active` | apa pun kecuali `false` | **aktif** |
| `CHECKLIST.Done`, `COLLAB_STEPS.Done`, `NOTIFICATIONS.Read` | `true`/`ya`/`yes`/`1`/`x` | belum |
| `COLLAB.Mirror`, `PACKAGES.Mirror`, `Main.Lintas View` | apa pun kecuali `tidak`/`no`/`false`/`0` | tidak |
| `Main.Lintas View` saat dibaca | teks mentah, bukan boolean | — |

Empat di antaranya laten hari ini: tak ada yang pernah mengetik `ya` atau `x` di sana. Satu
pengguna baru dengan sel Active kosong sudah cukup untuk memicunya.

### Jalankan siklusnya rapat-rapat

```bash
node scripts/migrasi/tarik.js && node scripts/migrasi/muat.js --ulang && node scripts/banding/jalan.js --rekam
node scripts/banding/jalan.js
```

Spreadsheet itu hidup. Kalau ada jeda panjang antara `tarik` dan `--rekam`, apa pun yang
ditulis orang di sela itu muncul sebagai beda — dan beda palsu yang terlihat seperti bug
akan memakan waktu untuk ditelusuri sampai ketahuan bukan apa-apa.

**Rekam ulang juga setiap kali aturan pembanding berubah.** Acuan direkam lewat `rapikan()`,
jadi mengubah aturannya membuat acuan lama membandingkan hal yang berbeda. Ini sudah pernah
terjadi: saklar `jagaUrutan` ditambahkan sesudah acuan direkam, tiga fungsi langsung tampak
rusak, dan hampir saja satu kolom ditambahkan ke skema untuk masalah yang tidak ada. Sejak
itu `indeks.json` menyimpan sidik jari aturannya dan alat bandingnya menolak jalan kalau
tak cocok.

### Yang sudah pasti perlu dikerjakan di `_db.js`

**Nomor baris jadi id — tanpa menyentuh frontend.** Ini sempat saya kira menuntut
perubahan di `public/index.html`. Ternyata tidak: frontend memperlakukan `row` sebagai
pegangan buram, hanya meneruskannya balik lewat `deleteNote(n.row)`, `editLink(l.row)`,
`openDashboardModal(d.row)` — tak pernah menghitung atau menampilkannya. Jadi `_db.js`
cukup mengisi `row` dengan id AUTO_INCREMENT.

Pengecualiannya `users` dan `auth_pins`, yang kunci utamanya nama dan tak punya kolom id.
Di sana `row` ternyata memang tak dipakai siapa pun — `saveUser`, `deleteUser`, dan
`renameUser` semuanya menerima nama.

**Nilai bawaan diterapkan saat MEMBACA, bukan saat migrasi.** `_sheets.js` memakai
`|| 'Staff'`, `|| 'Paket'`, `|| 'aktif'` di fungsi bacanya, jadi `_db.js` melakukan hal
yang sama dan database menyimpan apa adanya. Dengan begitu isi database bisa dibandingkan
langsung dengan isi sheet tanpa perlu tahu aturan apa pun.

Satu nilai bawaan sempat benar-benar dikarang: kolom `folder` diisi `Umum`, padahal v1 tak
pernah memberinya bawaan di mana pun. Alat banding yang menangkapnya, pada pemakaian
pertamanya.

**Tipe harus ditiru persis, termasuk yang tidak konsisten.** `getTasks()` mengembalikan
`mirror` sebagai **string**, sedangkan `getCollabs()` mengembalikannya sebagai **boolean** —
padahal di DDL keduanya `BOOLEAN`. `_db.js` harus menirukan ketidakkonsistenan itu, bukan
merapikannya, karena frontend sudah terlanjur bergantung padanya. Merapikan tipe dan
memperbaiki frontend boleh menyusul; mencampurnya dengan peralihan backend tidak.

**Sambungan harus dipakai ulang antar-pemanggilan.** Server ini `max_connections` 150 dengan
62 terpakai dan pernah menyentuh 208. Fungsi serverless yang membuka sambungan baru tiap
request akan menghabiskannya. Simpan pool di lingkup modul supaya ikut hidup selama instance
Vercel masih hangat.

### Urutan beralih

| Langkah | Risiko |
|---|---|
| `_db.js` ditulis fungsi demi fungsi, tiap fungsi lulus alat banding | nol — belum dipakai |
| Deploy dengan `DATA_SOURCE=sheets` | nol — perilaku tak berubah |
| Jeda tulis singkat, umumkan ke tim | — |
| `tarik` + `muat --ulang` terakhir | — |
| `DATA_SOURCE=mysql` | ini saat sungguhannya |
| Sheets dipertahankan sebagai cadangan baca-saja | — |

Jeda tulis itu tak bisa dihindari: selama tarik dan muat berjalan, apa pun yang ditulis ke
spreadsheet tidak akan ikut terbawa.

---

## Berkas terkait

| Berkas | Isi |
|---|---|
| `db/produk_base.sql` | DDL 18 tabel, plus catatan keputusan strukturalnya |
| `.env.example` | contoh isi `.env`, lengkap dengan penjelasan tiap baris |
| `scripts/migrasi/env.js` | memuat `.env` ke `process.env` |
| `scripts/migrasi/bentuk.js` | bentuk 18 tabel + pengubah tipe |
| `scripts/migrasi/tarik.js` | Sheets → `db/dump/*.json` |
| `scripts/migrasi/ukur.js` | periksa panjang nilai terhadap batas kolom |
| `scripts/migrasi/muat.js` | `db/dump/*.json` → MySQL |
| `scripts/banding/daftar.js` | fungsi baca mana yang dibandingkan, dan bagaimana |
| `scripts/banding/jalan.js` | merekam acuan Sheets, lalu membandingkan `_db.js` dengannya |
| `scripts/nonaktifkan-opsi-kembar.js` | menonaktifkan pilihan dropdown kembar lewat kolom Active |
| `test/migrasi.test.js` | 298 assertion, ikut `npm test` |

`db/dump/` **diabaikan git.** Isinya seluruh data produksi, termasuk `pm_notes`.
