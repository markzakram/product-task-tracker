# Changelog — ProductTrack

Format versi: **MAJOR.MINOR.PATCH**
- PATCH naik untuk perbaikan kecil (mis. 1.22.0 → 1.22.1)
- MINOR naik untuk fitur baru (mis. 1.22.0 → 1.23.0)
- MAJOR naik untuk perubahan besar/breaking

Versi terpasang ditampilkan di **sidebar** (samping logo) dan di **Dropdown Master**.
Sumber versi: konstanta `APP_VERSION` di `public/index.html`.

---

## Catatan penomoran (28 Agustus 2026)

Dua rangkaian pekerjaan berjalan paralel di satu working directory dan sempat memakai
nomor yang sama untuk hal berbeda: **1.81.0** dan **1.82.0** masing-masing dipakai baik
oleh garis *Laporan* maupun garis *Paket*.

Saat digabung, nomor **garis Laporan dipertahankan** karena sudah terbit lewat `master`,
dan entri garis Paket digeser ke atasnya:

| Dulu (branch paket) | Sekarang |
|---|---|
| 1.81.0 Master Koordinasi Paket menempel | **1.83.0** |
| 1.82.0 Area Produk jadi daftar deliverable | **1.84.0** |
| 1.82.1 Penanda STAGING | **1.84.1** |
| 1.83.0 Paket jadi entitas sendiri | **1.85.0** |
| 1.85.0 Rancangan Paket | **1.86.0** |

Tak ada entri yang dibuang. Entri `1.80.0 — Tombol "Task Saya"` juga dikembalikan; ia
sempat hilang dari CHANGELOG di `master` karena tertimpa saat commit paralel.

---
## 1.95.2 — Nilai lama tetap utuh walau sudah dicabut dari Dropdown Master

Ali memutuskan data lama dibiarkan apa adanya — tidak dimigrasi. Supaya "dibiarkan" tidak
berubah jadi "terhapus", aplikasinya perlu bisa menampilkan nilai yang sudah tak ada lagi di
daftar pilihan.

Sebabnya mekanis: `<select>` tak bisa menampilkan nilai yang bukan salah satu `<option>`-nya.
Ia jadi **kosong**, dan menyimpan task itu menulis kosong ke sheet — nilai lama hilang tanpa
peringatan, dan orangnya tak akan sadar karena di layar memang tak ada apa-apa untuk dilihat.

Sekarang nilai yang sedang dipakai selalu ikut jadi pilihannya sendiri, ditandai **"(lama)"**
supaya jelas itu peninggalan dan bukan pilihan yang masih berlaku. Begitu diganti ke nilai
baru, opsi lamanya hilang sendiri.

Berlaku di dua tempat: dropdown pada modal task, dan dropdown ringkas di Task List. Polanya
sudah dipakai kolom Status sejak lama lewat `statusOptionsFor(cur, t)`; sekarang field lain
ikut.

**Bukan khusus Tingkat Kesulitan.** Menonaktifkan sebuah stage, platform, atau PIC lewat
Dropdown Master punya akibat yang sama persis, dan sejak sekarang sama-sama aman.

---

## 1.95.1 — Saringan Kesulitan ikut disembunyikan, dan dashboard staff tak lagi bolong

Dua hal yang baru kelihatan setelah 1.95.0 dipakai sungguhan.

**Saringan "Kesulitan" masih tampil untuk yang bukan Manager** — di bilah Task List maupun
di Dashboard. Kolomnya sudah tak ada, pil-nya sudah tak digambar, tapi saringannya tertinggal.
Menyisakan saringan untuk kolom yang tak tampak membuat orang menyaring sesuatu yang tak bisa
mereka baca. Sekarang ikut hilang bersama kolomnya.

**Dashboard staff meninggalkan ruang kosong lebar.** Grid dashboard tiga kolom: *Beban Kerja
per PIC* mengambil dua, *Komposisi Status* satu. Begitu Beban Kerja disembunyikan, Komposisi
tertinggal sendirian di sepertiga layar dengan dua pertiga kosong di sebelahnya. Sekarang ia
melebar penuh saat panel sebelahnya hilang.

Keduanya cacat dari 1.95.0: penjagaannya dipasang pada kolom, pil, kartu KPI, dan grafik —
tapi tidak pada saringan, dan akibat tata letaknya tak diperhitungkan.

---

## 1.95.0 — Priority jadi Tingkat Kesulitan, dan hanya Manager yang melihatnya

Empat tingkat **urgensi** (Urgent, High, Normal, Low) diganti tiga tingkat **kesulitan**:
**Sulit · Normal · Mudah**. Yang diukur sekarang beratnya pekerjaan, bukan seberapa mendesak.

Namanya ikut berganti di seluruh layar: **Tingkat Kesulitan** pada form, dipendekkan jadi
**Kesulitan** di tempat sempit — judul kolom, chip saringan, judul ekspor. "Tingkat" saja
masih menggantung (tingkat apa?), sedangkan "Kesulitan: Sulit" langsung terbaca.

### Hanya Manager

Ini penilaian Manager atas beratnya sebuah tugas, jadi yang lain **tidak melihatnya sama
sekali** — bukan melihat versi terkunci. Kalau ditampilkan terkunci, orang tetap membaca
penilaian atas tugasnya sendiri, dan justru itu yang ingin ditutup.

Yang ikut disembunyikan, karena keduanya dibangun di atas kesulitan dan akan membocorkan
lagi apa yang baru ditutup di tabel:

- kartu KPI **Sulit** (dulu *Urgent/High*), dan
- grafik **Beban Kerja per PIC**, yang dikelompokkan per tingkat kesulitan.

Dijaga di server juga, bukan cuma disembunyikan di layar: `saveTask` dan `quickUpdateField`
sama-sama menolak perubahan dari yang bukan Manager.

### Bagian yang paling rawan, dan penjagaannya

Form staff tidak menampilkan field ini, jadi kiriman mereka membawa kesulitan **kosong**.
Kalau kiriman itu ditulis apa adanya, sekadar **membuka lalu menyimpan** task akan menghapus
penilaian Manager — tanpa siapa pun sadar, karena di layar mereka memang tak ada apa-apa
untuk dilihat.

Karena itu nilai lama **dipertahankan**, bukan ditimpa: kiriman kosong berarti "tidak saya
sentuh", bukan "hapus". Ada assertion khusus yang menguji persis skenario itu.

### Migrasi data — wajib dijalankan lebih dulu

`scripts/migrasi-kesulitan.js` memetakan nilai lama di kolom F sheet Main dan memperbarui
daftar pilihan di OPTIONS:

| Lama | Baru |
|---|---|
| Urgent, High | **Sulit** |
| Normal, Medium | **Normal** |
| Low | **Mudah** |

Urgent dan High digabung atas keputusan Ali — empat tingkat memang harus menyusut jadi tiga,
dan bedanya tak pernah jelas dalam pemakaian sehari-hari.

Tanpa migrasi ini, task lama menyimpan nilai yang tak ada di daftar pilihan, dan `<select>`
HTML tak bisa menampilkan nilai yang bukan salah satu opsinya — sehingga nilainya terhapus
begitu task dibuka lalu disimpan.

Pengamannya: uji coba adalah bawaannya (`--apply` untuk menulis), nilai yang **tak dikenal
dibiarkan apa adanya** dan dilaporkan alih-alih ditebak, baris pilihan lama dinonaktifkan
lewat kolom Active bukan dihapus, dan menjalankannya dua kali tidak merusak apa pun.

### Judul kolom sheet ikut berganti

`Priority` → `Kesulitan` di baris header sheet Main — dikerjakan oleh skrip migrasi.
Perbaikan header bawaan aplikasi hanya jalan lewat **Setup** (aksi manual Dev), jadi kalau
diserahkan ke sana, sheet akan terus tertulis "Priority" di atas nilai Sulit/Normal/Mudah.
Aman: pemetaan kolom memakai **indeks**
(`priority` selalu kolom F), bukan nama header. Kalau ada rumus di spreadsheet yang menunjuk
kolom itu lewat namanya, itu perlu disesuaikan sendiri.

Peta warna grafik sengaja **masih mengenali nilai lama** (Urgent, High, Low) supaya data yang
belum dimigrasi tetap punya warnanya sendiri dan tidak menyamar jadi Normal.

---

## 1.94.1 — Lintas Divisi jadi jendela baca saja, tanpa Komunikasi

Tiga PIN sekarang punya peran yang jelas terpisah:

| PIN | Level | Siapa |
|---|---|---|
| `ACCESS_PIN` | penuh | Divisi Produk |
| `MAGANG_PIN` | magang | anak magang |
| `VIEW_PIN` | lihat saja | **Lintas Divisi** |

Memasukkan PIN Lintas Divisi langsung mendudukkan orangnya sebagai user **Lintas Divisi** —
tak ada pemilihan identitas, dan pemilih user dikunci ke nama itu. Jadi link cukup dibagikan
apa adanya ke divisi lain.

**Menu Komunikasi dicabut untuk mereka.** Sebelumnya sengaja dibiarkan tampil ("boleh kirim
chat"); sekarang divisi lain cukup melihat yang dibagikan, tidak ikut mengobrol. Dicabut
sampai ke jalur datanya, bukan sekadar disembunyikan:

- menu Komunikasi hilang, dan kalau kebetulan sedang di layar itu, dipindahkan;
- kotak komentar di modal task ikut ditutup, jadi komentarnya tak diminta ke server;
- `getComments` dan `addComment` keluar dari jatah tamu;
- **ringkasan chat tak lagi dikirim** dalam muat-awal mereka — kalau hanya disembunyikan di
  layar, percakapan tim tetap sampai ke perangkat divisi lain dan terbaca lewat DevTools.

Magang **tidak** ikut kehilangan Komunikasi: yang dicabut hanya untuk level lihat-saja.


---

## 1.94.0 — Tombol "Task Aktif", dan perbaikan mode tamu yang berputar minta PIN

### Tombol "Task Aktif"

Di samping "Task Saya" kini ada **"Task Aktif"** — menyaring ke task kolaborasi yang
**belum Selesai**, supaya daftar yang sudah rampung tak ikut memenuhi layar saat sedang
ingin fokus.

Saklarnya **berdiri sendiri** dari "Task Saya", jadi keduanya bisa menyala bersamaan:
menekan dua-duanya berarti "task saya yang masih jalan". Tombol Reset ikut mengenalinya.

### Mode tamu tak lagi berputar meminta PIN

PIN tamu **tidak pernah salah** — `login` memang mengembalikan `level: view` dan berhasil.
Yang membuatnya terlihat ditolak terus adalah apa yang terjadi **sesudahnya**: begitu
halaman dimuat, muat-awal memanggil `getPackages`, aksi itu tak ada di jatah level tamu,
server menolaknya dengan kode **`AUTH`** — dan layar depan memperlakukan `AUTH` sebagai
"sesi habis" lalu memunculkan layar PIN lagi. Tamu mengetik PIN yang sudah benar, masuk,
lalu terlempar balik. Berulang.

Diperbaiki di dua lapis:

- **Ditolak karena LEVEL sekarang memakai `403 FORBIDDEN`**, bukan `401 AUTH`. Layar PIN
  hanya muncul kalau PIN-nya memang belum atau salah. Ini menutup seluruh kelas masalahnya,
  bukan hanya satu aksi — aksi baru yang tak masuk jatah tamu tak akan mengulanginya.
- **`getPackages` masuk jatah tamu**, karena Lintas Divisi memang punya menu Rancangan
  Paket. Hasilnya **dipangkas di server** ke yang dibagikan saja: rancangan yang belum
  dibagikan tak pernah sampai ke perangkat mereka, bukan sekadar disembunyikan di browser.

### Tab Kolaborasi untuk Lintas Divisi akhirnya berisi

Ditemukan saat menelusuri yang di atas. Muat-awal untuk tamu **tidak pernah mengirim kunci
`collabs` sama sekali**, jadi tab Kolaborasi yang dibuka di 1.93.0 selalu kosong walau ada
task yang sudah ditandai dibagikan. Sekarang task yang dibagikan ikut dikirim — dan hanya
yang dibagikan.

### api/rpc.js akhirnya punya uji

Gerbang akses adalah berkas paling menentukan soal siapa boleh apa, tapi selama ini
**belum punya satu uji pun** — dan bug ini lahir persis di sana. `test/rpc.test.js` baru
berisi **30 assertion**: pengenalan tiap PIN, jatah tamu, pemangkasan di server, beda
`FORBIDDEN` dan `AUTH`, batasan magang, dan perilaku anti-terkunci saat tak ada PIN
dikonfigurasi sama sekali. Ikut `npm test`.

---

## 1.93.0 — Task kolaborasi bisa dibagikan ke Lintas Divisi

Melengkapi yang sudah berlaku untuk task biasa dan rancangan paket: task kolaborasi kini
bisa ditandai untuk tampil di layar **Lintas Divisi**. Penandanya ada di kartu daftar
sekaligus jadi tombolnya, dan ada juga di dalam modal tasknya.

Kolom baru **K "Mirror"** di sheet `COLLAB`, ditulis lewat aksi tersendiri
(`setCollabMirror`) yang menyentuh **kolom K saja** — persis pola `setCollabPackage` untuk
kolom J. Sengaja tidak lewat `saveCollab`: fungsi itu menulis rentang `A:I`, dan menariknya
sampai K berarti tiap penyimpanan biasa berisiko menimpa kolom yang bukan urusannya. Pola
itulah yang dulu membuat tautan paket hilang sendiri, jadi ada dua assertion khusus
memastikan menyimpan task dan menautkan paket **tidak** mencabut pembagiannya.

### Lintas Divisi sekarang punya tab Kolaborasi

Sebelumnya menu itu disembunyikan sepenuhnya dari mode Lihat Saja. Sekarang dibuka, tapi
isinya **disaring**: hanya task yang memang dibagikan. Disaring di satu tempat
(`filteredCollabs`) yang dipakai seluruh tampilan — grid, kanban, dan hitungannya — jadi
tak ada jalur yang lupa menyaring.

Seluruh tombol ubah tetap tertutup lewat `canManageCollab()`, dan kotak komentar tetap
disembunyikan seperti sebelumnya.

**Paket yang belum dibagikan tak ikut terbuka.** Task yang dibagikan bisa saja tertaut ke
rancangan paket yang belum dibagikan; tanpa penjagaan, membagikan satu task diam-diam ikut
membuka rancangannya. `currentPackage()` kini menahannya.

### Wewenang

Sama dengan mirror **paket**: **Leader & Manager**. Berbeda dari mirror **task biasa** yang
tetap PM/Dev saja — task kolaborasi memang dikelola Leader sehari-hari. Penjaganya ditulis
sebagai fungsi sendiri (`canMirrorCollab`), bukan memakai ulang yang sudah ada: aturannya
kebetulan sama hari ini, tapi menyatukannya berarti melonggarkan yang satu diam-diam
melonggarkan yang lain.

| | Manager | Leader | Staff | Lihat Saja |
|---|---|---|---|---|
| Bagikan task kolaborasi | ✅ | ✅ | — | — |
| Bagikan rancangan paket | ✅ | ✅ | — | — |
| Bagikan task biasa | ✅ | — | — | — |
| Melihat yang dibagikan | ✅ | ✅ | ✅ | ✅ |

---

## 1.92.2 — Penanda tautan di daftar Rancangan Paket

Sekarang ketahuan paket mana yang punya tautan **tanpa membukanya dulu**: kartu di daftar
Rancangan Paket diberi penanda kecil bericon rantai beserta **jumlah** tautannya. Daftar
lengkapnya — label dan alamatnya — terbaca lewat tooltip.

Penandanya **sengaja tidak bisa diklik**. Kartunya sendiri sudah membuka paketnya, dan di
sana tiap tautan punya chipnya masing-masing; membuat penanda ini membuka salah satu tautan
akan sewenang-wenang begitu tautannya lebih dari satu.

Paket tanpa tautan tidak diberi apa-apa — penanda yang muncul di semua kartu tidak
memberi tahu apa pun.

---

## 1.92.1 — Tautan terlihat dan langsung bisa dibuka dari kepala panel

Tautan yang sudah disematkan kini muncul sebagai **chip di kepala Rancangan Paket**, di
baris yang sama dengan hitungan target. Dua gunanya sekaligus: terlihat **bahwa** paket ini
punya tautan tanpa perlu menggulung ke bawah, dan sekali klik langsung terbuka di tab baru.

Chipnya memakai **label** tautan kalau ada; kalau labelnya kosong, dipakai **nama host** —
`drive.google.com` masih memberi tahu orang ini mau ke mana, sedangkan URL penuh terlalu
panjang untuk chip. URL selengkapnya tetap terbaca lewat tooltip.

Tiga hal kecil yang dijaga:

- **Nama host diambil dengan pola, bukan `new URL()`.** Alamat yang belum sempurna akan
  membuat `new URL()` melempar galat dan merontokkan seluruh panel — padahal ini cuma soal
  label. Alamat tak keruan cukup jatuh ke kata "tautan".
- **Klik chip tidak merambat** ke panel di belakangnya, jadi membuka tautan tak ikut
  membuka atau menutup bloknya.
- **Nama panjang dipotong** dan lebarnya dibatasi, supaya satu label panjang tak mendorong
  hitungan target keluar baris.

Yang ditampilkan adalah tautan yang **sudah tersimpan**; baris yang baru diketik muncul di
kepala setelah ditekan Simpan.

---

## 1.92.0 — Tautan pendukung paket: opsional, boleh lebih dari satu

Rancangan paket kini bisa menyematkan tautan — folder akademik, dokumen kisi-kisi, hasil
QC, apa pun yang perlu dijangkau dari situ. **Opsional**, dan **jumlahnya tak dibatasi**.
Tiap tautan punya labelnya sendiri; yang wajib cuma URL-nya, karena itu yang bisa dibuka.

Disimpan di sheet anak baru **`PACKAGE_LINKS`** (Paket ID, Order, Label, URL), mengikuti
pola `PACKAGE_VARIANTS` dan `PACKAGE_ITEMS`. Sheet sendiri, bukan satu kolom berisi banyak
URL — menumpuknya di satu sel akan mengulang persis kesulitan yang membuat kolom Area
Produk sheet Master sulit dibaca mesin. Sheet-nya dibuat otomatis saat pertama dipakai;
tak ada langkah manual.

**URL tanpa skema dirapikan.** Orang menempel `docs.google.com/document/d/...` apa adanya;
tanpa dibereskan, alamat itu dibaca sebagai alamat **relatif** dan tombol Buka justru
memuat ulang aplikasi ini — terlihat seperti tautannya rusak padahal cuma kurang
`https://`. Yang sudah berskema dibiarkan apa adanya, termasuk `http://` untuk alamat
internal.

Wewenangnya sama dengan rancangan: **Leader & Manager** boleh mengubah, yang lain hanya
melihat — tapi tombol **Buka tetap ada untuk semua**, karena melihat tak sama dengan
mengubah.

Empat hal yang dijaga:

- **Menyimpan ulang mengganti seluruh daftar**, bukan menumpuk.
- **Menyimpan target tidak menghapus tautan, dan sebaliknya.** Keduanya hidup di sheet
  berbeda; pola inilah yang dulu membuat setoran jadi yatim.
- **Baris tanpa URL tidak disimpan** — tak ada yang bisa dibuka dari baris kosong.
- **Ikut terhapus bersama paketnya**, jadi tak ada baris menggantung tanpa induk. Ada
  assertion yang memeriksa sheet-nya langsung sesudah paket dihapus.

---

## 1.91.1 — Catatan berlaku per FITUR, bukan per target

Koreksi atas 1.91.0. Catatan di sana dipasang **per baris target** — satu kotak kecil di
tiap "Verbal", "Hitung Cepat", "Pauli". Yang dibutuhkan justru sebaliknya: satu catatan
untuk **seluruh Latsol**, seluruh Materi, seluruh Tryout.

Kolomnya tidak dibuat baru. Sheet `PACKAGES` sudah lama punya satu kolom teks per kategori
(`dibimbing`, `latsol`, `materi`, `tryout`, `drilling`, `liveClass`) — isinya selama ini
tampil di panel terpisah berjudul *"Bonus angkatan lama & catatan"*, jauh dari targetnya.
Sekarang kolom itu **dipindah ke dalam blok kategorinya masing-masing**: catatan Latsol ada
tepat di bawah daftar target Latsol.

Digambar **sekali saja**, bukan di dua tempat — id yang kembar sudah pernah jadi sumber bug
tersendiri di aplikasi ini. Panel lama kini tinggal memuat **Catatan paket**, yang memang
berlaku untuk seluruh paket dan bukan satu fitur.

Empat hal yang dijaga:

- **Tinggi kotaknya mengikuti isi.** Sel bonus di sheet Master bisa puluhan baris; kotak dua
  baris membuatnya praktis tak terbaca. Aturan yang sama dengan panel lama dipakai di sini,
  dibatasi 20 baris supaya satu catatan panjang tak mendorong sisa layar keluar.
- **Kategori yang belum punya target tapi sudah bercatatan tetap ditampilkan** — kalau tidak,
  catatan yang sudah ditulis orang lenyap dari layar tanpa jejak.
- **Terkunci untuk yang tak berhak mengubah Area Produk**, sama seperti sebelum dipindah.
- **Peta kategori→kolom ditulis sekali** (`PKG_KAT_FIELD`) dan dipakai bersama oleh isian
  ini dan penyusun teks salinan untuk sheet Marsel — dulu petanya ditulis dua kali.

Kolom catatan per target dicabut seluruhnya dari layar. Kolom J `PACKAGE_ITEMS` di sheet
dibiarkan apa adanya: tidak dipakai, tidak mengganggu, dan tak perlu migrasi. Enter-turun
sekarang mencakup lima kolom rancangan (grup, nama, target, satuan, awal).

---

## 1.91.0 — Enter turun satu baris, catatan per target, dan pintasan ke sheet Master

### Enter memindah ke kolom yang sama di baris berikutnya

Mengisi rancangan itu pekerjaan **per kolom**, bukan per baris: sepuluh nama target dulu,
baru sepuluh satuannya. Sebelumnya tiap pindah baris harus menekan Tab lima kali atau
meraih mouse — untuk daftar sepanjang Materi PT.KAI itu ratusan ketukan sia-sia.

Sekarang **Enter** di kolom mana pun (grup, nama, target, satuan, awal, catatan) memindahkan
fokus ke kolom **yang sama** di baris di bawahnya, dan isinya langsung diblok supaya
mengetik menimpanya — itu yang diharapkan saat menurunkan angka yang sama berulang kali.

Dua batas yang disengaja:

- **Hanya di dalam kategori yang sama.** Melompat dari baris terakhir Latsol ke baris
  pertama Materi akan mengejutkan, dan orang baru sadar setelah salah ketik.
- **Baris terakhir diam** — tidak membuat baris baru sendiri. Enter yang tak sengaja tidak
  boleh melahirkan target kosong.

Kolom setoran tidak ikut diambil alih; Enter di sana tetap seperti biasa.

### Catatan per target

Kolom **catatan** di ujung kanan tiap baris target, untuk hal yang cuma berlaku pada target
itu — sumber soalnya, siapa yang mereview, atau kenapa jumlahnya segitu.

Menariknya kolom ini **sudah lama ada di sheet** (`PACKAGE_ITEMS` kolom J) dan sudah
dibaca-tulis kedua backend sejak awal; yang tak pernah ada cuma isiannya di layar. Jadi
tidak ada perubahan skema dan tidak ada migrasi — dan sekarang jalur bolak-baliknya
akhirnya diuji sungguhan, termasuk mengosongkannya kembali.

Catatan ikut terbawa saat isi kategori disalin ke kategori lain.

### Pintasan ke sheet Master

Tombol **Sheet Master** di bilah Rancangan Paket, membuka *Master Koordinasi Paket* di tab
baru. Alamatnya disimpan sebagai satu konstanta (`URL_SHEET_MASTER`), jadi kalau sheetnya
pindah hanya satu tempat yang perlu diubah.

---

## 1.90.1 — Leader punya wewenang penuh di Rancangan Paket

Sebelumnya Leader sudah boleh membuat paket, menghapus paket, menautkan task, dan mengatur
setoran — tapi **tidak boleh menyusun targetnya**. Padahal Leader-lah yang menyusun isi
paket sehari-hari, jadi menutup bagian itu cuma memaksa mereka menitip ke Manager untuk
pekerjaan yang memang sudah jadi tanggung jawabnya.

Sekarang Leader bisa menambah, mengubah, dan menghapus target, serta **membagikan
rancangan ke Lintas Divisi**.

### Yang tetap terpisah, dan kenapa

Mirror **task biasa** tetap **PM/Dev saja**. Yang dilonggarkan hanya mirror **paket**.
Karena keduanya konsep yang mirip, penjaganya sengaja dipisah jadi dua fungsi:

| | Penjaga | Siapa |
|---|---|---|
| Mirror task | `canMirror()` | Manager / Dev |
| Mirror paket | `canMirrorPaket()` | Manager / Dev / **Leader** |

Kalau keduanya dibiarkan memakai satu fungsi, melonggarkan yang satu akan diam-diam
melonggarkan yang lain — dan itu jenis perubahan izin yang tak akan ketahuan sampai ada
yang salah melihat data divisi lain. Ada assertion yang mengunci pemisahan itu.

### Batas yang tidak berubah

Staff tetap hanya melihat: ditolak mengubah rancangan, ditolak membagikan, dan penolakannya
diuji **tidak diam-diam mengubah apa pun**. Mode Lihat Saja juga tetap tertutup untuk
keduanya.

| | Manager | Leader | Staff |
|---|---|---|---|
| Susun & ubah target | ✅ | ✅ *(baru)* | — |
| Bagikan paket ke Lintas Divisi | ✅ | ✅ *(baru)* | — |
| Buat & hapus paket | ✅ | ✅ | — |
| Tautkan task, atur setoran | ✅ | ✅ | — |
| Bagikan **task** ke Lintas Divisi | ✅ | — | — |

---

## 1.90.0 — Salin isi antar kategori, penanda Lintas Divisi, dan importer masuk repo

### Isi rancangan bisa disalin antar kategori

Nama target sering berulang: *Verbal*, *Hitung Cepat*, *Bangun Ruang* muncul di **Latsol**,
**Materi**, dan **Tryout** sekaligus. Mengetiknya tiga kali itu pekerjaan sia-sia — dan
rawan salah ketik, yang bikin dua target yang sebenarnya sama terlihat berbeda.

Tiap kategori yang sudah ada isinya kini punya pilihan **"Salin ke…"** di kepalanya.
Yang disalin apa adanya: grup, nama, target, satuan, dan awal — biasanya yang perlu diubah
cuma satuan dan angkanya, dan itu lebih cepat disunting daripada diketik ulang.

Tiga hal yang dijaga:

- **Yang namanya sudah ada di kategori tujuan dilewati**, jadi menyalin dua kali tidak
  melahirkan baris kembar.
- **Setoran tidak ikut.** Setoran menempel pada pekerjaan yang benar-benar terjadi, bukan
  pada nama target.
- **Nomor target dikosongkan** supaya server memberi nomor baru — kalau diwarisi, dua
  kategori akan menunjuk baris target yang sama.

Hasil salinan belum tersimpan sampai **Simpan** ditekan, dan pesannya mengatakan itu.

### Penanda Lintas Divisi di daftar rancangan

Sebelumnya status "sudah dibagikan atau belum" hanya kelihatan setelah paketnya dibuka.
Sekarang ada penandanya langsung di kartu: **chip hijau "Lintas Divisi"** kalau sudah
dibagikan. Manager bisa mengklik penanda itu untuk menyalakan/mematikan tanpa membuka
paketnya — mengikuti pola ikon `cast` pada task biasa. Yang bukan Manager hanya melihat,
dan kalau paketnya belum dibagikan mereka tak melihat apa-apa.

### Importer rancangan masuk repo

`scripts/impor-rancangan-produksi.js` beserta penguraiannya (`scripts/urai-master.js`),
dokumentasi pemakaian (`scripts/README.md`), dan **37 assertion** di `test/impor.test.js`
yang ikut `npm test`. Sebelumnya skrip ini hidup di luar repo — padahal ia menulis langsung
ke spreadsheet produksi, justru yang paling perlu diuji.

Satu perbaikan ikut terbawa ke penguraiannya: baris ringkasan dulu hanya dikenali kalau
berbentuk `Total:` atau `Total=`, sehingga `Total TWK: 50 Paket` dan
`Total Keseluruhan: 210 Paket` lolos jadi target. Di kolom Latsol JadiASN itu berarti 22
item asli senilai 210 Paket ditambah **420 Paket palsu** dari empat baris ringkasan.
Sekarang semua baris yang diawali kata "Total" dilewati.

Pengaman skripnya: uji coba adalah bawaannya (menulis hanya dengan `--apply`), paket yang
namanya sudah ada dilewati bukan ditimpa, nomor `PKG-`/`ITM-` selalu lanjut dari yang
tertinggi, dan kolom Mirror dibiarkan kosong — hasil impor tidak otomatis tampil ke Lintas
Divisi.

---

## 1.89.4 — Penanda STAGING diambil dari environment, bukan ditebak dari alamat

Penanda staging sebelumnya menebak dari hostname: satu daftar host produksi, sisanya
dianggap staging. Niatnya aman, hasilnya justru terbalik.

Satu deployment **produksi** di Vercel punya beberapa alamat sekaligus — alias cabang
(`...-git-master-prod6.vercel.app`) dan URL berhash (`...-q8qggk4g2-prod6.vercel.app`) —
dan **ketiganya menulis ke data produksi yang sama**. Karena hanya `product-task-tracker.vercel.app`
yang terdaftar sebagai produksi, dua alamat lainnya tampil bergaris kuning **STAGING**
padahal datanya asli. Itu sudah membuat orang menyimpulkan URL berhash adalah lingkungan
uji dan berniat memakainya untuk percobaan — tepat kebalikan dari yang penanda itu
seharusnya cegah.

Sekarang sumbernya **environment yang dilaporkan server**. Backend mengirim `VERCEL_ENV`
(`production` / `preview` / `development`) di `meta` saat muat-awal, dan layar menandai
staging hanya kalau nilainya bukan `production`. Env var di Vercel memang melekat pada
Environment, bukan pada URL — jadi inilah satu-satunya sumber yang sepadan dengan
spreadsheet mana yang sedang dibaca.

Hostname tinggal jadi **cadangan**, dipakai hanya selama server belum sempat memberi tahu.
Kalau environment tak diketahui sama sekali (jalan lokal, host lain), nilainya sengaja
bukan `production`: keliru menandai produksi sebagai uji coba cuma bikin malu, sebaliknya
bisa membuat orang mengira data uji itu nyata.

**Penandanya kini bisa dicabut.** Dulu ia hanya bisa dipasang — sekali terpasang oleh
tebakan hostname, ia menempel selamanya walau ternyata keliru. Sekarang logo, warna merek,
tulisan sidebar, garis kuning, dan judul halaman semuanya dikembalikan begitu environment
sebenarnya diketahui.

Apps Script tetap dianggap produksi (pemasangannya manual dan menempel pada satu
spreadsheet), dan bisa ditimpa lewat Script Property `APP_ENV` kalau dipakai sebagai
salinan uji.

---

## 1.89.3 — Satuan "Video + Ebook", dan akhir baris dikunci ke LF

Satuan baru **Video + Ebook** untuk target yang isinya sepasang, bukan dua barang terpisah
yang dihitung sendiri-sendiri. Pilihan satuan jadi enam: Paket, BAB, Sesi, Video, Ebook,
Video + Ebook. Kolom satuannya ikut dilebarkan dari `4.6rem` ke `7rem` — kalau tidak,
tulisannya terpotong dan orang tak tahu sedang memilih apa.

### Akhir baris dikunci ke LF

Ditemukan saat menambahkan satuan di atas: seluruh berkas berubah jadi **CRLF** setelah
checkout, dan satu uji yang sama sekali tak berhubungan langsung gagal. Sebabnya beberapa
uji memakai regex berbatas panjang (`[\s\S]{0,600}`) atas isi `public/index.html`; CRLF
menambah satu karakter per baris sehingga pola yang tadinya muat jadi lewat batas — gagal
tanpa ada satu baris kode pun yang berubah.

Ini kejadian kedua. Ditutup di dua lapis:

- **`.gitattributes`** dengan `* text=auto eol=lf` — working tree tak lagi diubah jadi CRLF
  saat checkout atau merge.
- **Harness ujinya sendiri menyamakan akhir baris** sebelum mencocokkan, jadi uji tak lagi
  bergantung pada hal yang tak ada kaitannya dengan benar-salahnya kode.

Isi repo tidak berubah karenanya — git memang sudah menyimpan LF; yang berubah cuma salinan
di komputer.

---

## 1.89.2 — Percobaan ulang otomatis saat kena kuota Sheets

Kuota baca Google Sheets dihitung **per menit**, dan yang memicunya hampir selalu ledakan
sesaat — beberapa ratus milidetik biasanya sudah cukup untuk lewat. Sekarang panggilan ke
Sheets mencoba ulang sendiri, dua kali, dengan jeda 400 ms lalu 1.100 ms plus sedikit acak
supaya permintaan yang barengan tidak bangun serentak.

Anggarannya sengaja pendek (total di bawah 2 detik) karena fungsi Vercel punya batas waktu
sendiri. Kalau tetap gagal, galatnya dilempar — dan sejak 1.89.0/1.89.1 itu sudah ditangani
dengan benar: layar mempertahankan data terakhir yang benar, bukan menampilkan kosong.

### Yang boleh diulang dibedakan dengan sengaja

Ini bagian yang paling menentukan, karena **mengulang yang salah justru merusak**:

- **Baca** idempoten, jadi aman diulang untuk kuota maupun gangguan sesaat (5xx, koneksi
  putus, "timed out").
- **Tulis hanya diulang saat kena kuota.** Kena kuota berarti permintaannya *ditolak sebelum
  dijalankan*, jadi mengulang aman. Galat jaringan sebaliknya **ambigu**: bisa saja sudah
  terlanjur dijalankan lalu jawabannya yang hilang. Mengulangnya akan menggandakan baris
  pada `append`, atau menghapus dua baris pada `deleteDimension`.
- **Kuota harian tidak diulang** sama sekali — menunggu satu detik tak akan menolong.

Ada uji perilakunya, bukan sekadar bentuk kode: galat disuntikkan ke lapisan tiruan, lalu
dipastikan baca yang kena kuota berhasil di percobaan ketiga, galat permanen tidak diulang,
tulis yang kena kuota diulang **dan barisnya tetap masuk sekali**, sedangkan tulis yang kena
galat ambigu tidak diulang sama sekali dan tak menyisakan baris.

### Hasil nyata

Tiga puluh pembacaan beruntun ke staging — pola yang sebelumnya menembus kuota — kini
**27 berhasil, 3 gagal** dan seluruh data tetap utuh. Perlu jujur soal batasnya: percobaan
ulang menyerap ledakan sesaat, bukan pemakaian yang memang melewati kuota terus-menerus.
Yang berubah untuk kasus itu bukan keberhasilannya, melainkan kejujurannya — dulu diam-diam
mengosongkan data, sekarang berkata gagal.

Lapisan yang sama dipasang di `gas/Code.gs` supaya dua backend tidak melenceng.

---

## 1.89.1 — Gagal baca tak lagi menyamar jadi "memang kosong"

Lanjutan dari 1.89.0, yang menemukan pola berbahaya di jalur baca paket: galat baca sesaat
ditelan lalu dikembalikan sebagai daftar kosong, dan "kosong" tak bisa dibedakan dari
"memang belum ada". Seluruh backend disisir untuk pola yang sama. Tiga tempat diperbaiki,
sisanya dinilai dan sengaja dibiarkan.

### PIN bisa dilewati saat gangguan baca — ini yang paling serius

`verifyPin` membaca daftar PIN, dan bila user tak ada di daftar ia menyimpulkan "user ini
memang belum berPIN" lalu **meloloskannya**. Karena galat baca berubah jadi daftar kosong,
satu gangguan sesaat pada sheet `AUTH` membuat **setiap user berPIN bisa masuk tanpa PIN
sama sekali**. Efek sampingnya juga ada di `setUserPin`: daftar kosong membuat user yang
sudah berPIN dianggap baru, lalu barisnya ditambah ganda dan PIN barunya diam-diam tak
berlaku karena yang terbaca tetap baris lama.

Sekarang tidak tahu berarti **ditolak**. Sheet `AUTH` dipastikan ada lebih dulu supaya gagal
setelah titik itu benar-benar berarti gangguan baca — bukan "AUTH memang belum dibuat",
yang tetap sah diperlakukan sebagai bebas PIN. Ada uji perilakunya: gangguan baca disuntikkan,
lalu dipastikan PIN ditolak dengan alasan yang disebutkan, dan diterima lagi setelah pulih.

### Angka rancangan tak lagi bisa anjlok ke nol

`loadCollabsRaw` membangun indeks proses, dan indeks itulah yang menentukan setoran mana
yang sudah "selesai". Daftar kosong berarti **seluruh angka rancangan jatuh ke nol** seolah
tak ada yang pernah dikerjakan. Sekarang galatnya dilempar; pemanggil di muat-awal sudah
menangkapnya sendiri, jadi aplikasi tetap terbuka.

### Ringkasan progres ceklis

Sama bentuknya, beda obatnya: fungsi ini ikut dipakai saat muat-awal, jadi melempar berarti
seluruh aplikasi gagal terbuka. Yang dipakai `null` = **tak diketahui**, dan layar
mempertahankan ringkasan yang sudah ada. Dua dari tiga pemanggilnya memang sudah menjaga
nilai kosong; yang di muat-awal ikut disesuaikan.

### Yang dinilai dan sengaja dibiarkan

Tujuh tempat lain masih mengembalikan daftar kosong saat gagal baca: notifikasi, riwayat
aktivitas, ringkasan komentar, tautan, dashboard, catatan, dan isi ceklis satu task.
Semuanya daftar untuk ditampilkan, ikut jalur muat-awal, dan tak ada yang menuntun pengguna
menulis ulang data. Melempar di sana justru menukar tampilan yang berkurang dengan aplikasi
yang gagal terbuka. Dibiarkan dengan sadar, bukan terlewat.

### Catatan operasional

Kuota **baca per menit** Google Sheets memang bisa terlampaui — terjadi tiga kali selama
pengujian berturut-turut hari ini. Sebelum rilis ini kejadian itu diam-diam menolkan angka
rancangan; sekarang ia muncul sebagai galat bernama dan layar mempertahankan data lama.
Menambahkan percobaan ulang otomatis saat kena kuota masih terbuka sebagai perbaikan
berikutnya, dan belum dikerjakan di sini.

---

## 1.89.0 — Satu task boleh menyetor berkali-kali ke target yang sama

Kasusnya nyata: target *Latsol Verbal — 20 Paket* digarap satu task yang prosesnya dipecah,
"Pembuatan Verbal 1" dan "Pembuatan Verbal 2", masing-masing 10 Paket. Sebelumnya tiap
target hanya punya **satu** baris setoran per task, dan yang terbaca cuma setoran pertama —
jadi mengisi untuk proses kedua justru menimpa yang pertama.

Sekarang tiap target bisa punya **sebanyak apa pun** baris setoran dari task yang sama, tiap
baris menempel ke prosesnya sendiri dan bisa dihapus. Begitu Proses 1 dicentang, 10 masuk;
Proses 2 dicentang, 10 lagi. Batal centang salah satu hanya menarik **bagiannya**, bukan
seluruhnya. Sudah dibuktikan ujung ke ujung: 0 → 10 → 20 → 10 → 0.

Tak ada perubahan skema dan tak ada migrasi: `PACKAGE_CONTRIB` sejak awal menyimpan tiap
setoran sebagai baris berkunci (Paket, Target, Task, **Proses**), dan kedua backend memang
sudah menerima daftar. Yang membatasi hanya tampilannya.

Tiga hal yang menyertainya:

- **Baris terakhir tak ikut terhapus**, hanya dikosongkan — kalau tidak, tak ada lagi tempat
  mengisi setoran tanpa menekan "+" dulu.
- **Dua setoran ke target dan proses yang sama ditolak** dengan menyebut nama targetnya.
  Keduanya akan terhitung saat satu centang, dan itu hampir pasti salah pilih proses.
- **Lencana jumlah setoran di kolom Proses akhirnya muncul.** Selama ini ia menyaring daftar
  *target* memakai `collabId`/`stepOrder`, padahal kedua kolom itu milik *setoran* — jadi
  angkanya selalu 0 dan lencananya tak pernah tampil sama sekali.

### Gagal baca tak lagi menyamar jadi "belum ada paket"

Ini ditemukan saat pengujian: `readPackages` menelan **setiap** galat baca dan mengembalikan
daftar kosong. Satu gangguan sesaat — kuota Sheets, jaringan — jadi tak bisa dibedakan dari
"memang belum ada paket", dan daftar kosong itu menimpa data yang sudah benar di layar.
Persis gejala yang dulu dilaporkan: *rancangan yang sudah ditautkan tiba-tiba hilang dan
perlu ditautkan ulang*. Perbaikan muat-awal di 1.87.3 menutup satu penyebabnya; ini
penyebab kedua yang berdiri sendiri.

Sekarang galatnya dilempar, layar **mempertahankan data terakhir yang benar**, dan pengguna
diberi tahu bahwa yang tampil mungkin belum terbaru. Jalur tulis tak pernah terdampak:
`savePackage` sudah menolak dengan "Paket tidak ditemukan" alih-alih menambah baris ganda.

---

## 1.88.1 — Hasil QC sebelum naik produksi

Empat temuan dari pemeriksaan menyeluruh atas 1.88.0. Tak ada yang mengubah cara kerja
fiturnya; semuanya menutup celah yang baru kelihatan saat ditelusuri satu per satu.

**Salinan untuk Marsel kini dibawa dalam dua rasa.** Ini temuan terpenting. Sel Latsol
PCPM BI 41 panjangnya belasan baris, dan tempelan **teks polos** berisiko dipecah Sheets
menjadi belasan **baris sheet** — kekacauan yang mendarat langsung di file Marsel yang
dipakai orang. Sekarang papan klip diisi `text/plain` (TSV) **dan** `text/html` (tabel
sungguhan, baris baru jadi `<br>`). Sheets mengutamakan rasa HTML, jadi satu paket tetap
satu baris dengan isi utuh di dalam selnya; TSV tetap disertakan untuk Excel, Notion, atau
editor teks. Jalur cadangan pun ikut membawa kedua rasa lewat event `copy`, bukan cuma
teks polos.

**Tombol "Bagikan ke Lintas Divisi" memakai penjaga yang sama dengan task biasa.**
Sebelumnya syaratnya `isManager(...)` telanjang, sedangkan idiom aplikasi untuk hal yang
sama persis adalah `canMirror()` — yang juga menutup mode tamu dan Lihat Saja. Backend
memang sudah menolak, jadi tak pernah ada data yang bocor; yang salah hanya tombolnya
sempat tampil.

**Lihat Saja tak lagi ditawari "Salin utk Marsel".** Sheet Marsel urusan internal.

**Judul kolom Mirror kini benar-benar terpasang.** Perbaikan header hanya jalan kalau A1
kosong, jadi sheet `PACKAGES` yang sudah telanjur ada — staging maupun produksi nanti —
akan berhenti di 19 judul dan kolom T menganga tanpa nama. Sekarang dicek per **panjang**
header, bukan per sel pertama. Sudah dijalankan di staging: `T1` kosong → `Mirror`.

Diperiksa juga dan memang sudah benar: paritas dua backend untuk kolom T (`rowToPackage`,
`packageToRow`, rentang `A1:T1`/`A2:T`/`A:T`, penjaga izin), baris pendek 19 kolom terbaca
aman sebagai `mirror: false`, tak ada `id` atau nama fungsi kembar, seluruh 144 handler
HTML punya fungsinya, dan duplikat task kolaborasi sudah menolak dengan konfirmasi bila
ada perubahan belum tersimpan.

---

## 1.88.0 — Salin rancangan ke sheet Marsel, duplikat task kolaborasi, bagikan ke Lintas Divisi

Empat hal sekaligus, semuanya berputar di sekitar Rancangan Paket.

**Batal centang kini tercermin di rancangan.** Sebenarnya ini sudah benar sejak awal —
setoran dihitung ulang dari status proses, bukan ditumpuk saat dicentang — tapi belum
pernah diuji secara khusus. Sekarang ada tujuh assertion yang mengunci perilakunya:
centang → setoran masuk, batal centang → setoran **ditarik lagi**, kembali jadi *menunggu*,
kekurangan dihitung ulang, status balik ke `proses`, dan ringkasan paket ikut mundur.
Bolak-balik centang tak menyisakan angka nyasar.

**Tombol "Salin utk Marsel".** Tidak diunduh sebagai berkas Excel — dan itu disengaja.
Tujuannya Google Spreadsheet, jadi menyalin sebagai TSV lalu `Ctrl+V` langsung mendarat
satu sel per kolom: tanpa unduh, tanpa impor, tanpa berkas menumpuk di folder unduhan.
Berkas `.xlsx` justru menambah tiga langkah untuk hasil yang sama.

Teks selnya **dibangun ulang dari target yang hidup**, meniru bentuk sheet asalnya:

    Tahap 1
     • Latsol Verbal PCPM BI 41 – 10 Paket
     • Latsol Numerik PCPM BI 41 – 10 Paket + 10 Paket COMING SOON
     Total: 20 Paket

Yang belum penuh otomatis ditandai `+ N COMING SOON`, persis kebiasaan di sheet Marsel.
Kolomnya mengikuti susunan sheet Master — APK, Dibimbing, Latsol, Materi, Tryout,
Drilling, Live Class, Catatan Produk — jadi bisa ditempel ke barisnya langsung. Sel yang
memuat banyak baris dibungkus petik ganda, kalau tidak Sheets memecahnya jadi banyak
baris. Ada tombol untuk **semua** yang tersaring, dan untuk **yang terpilih saja**.
Peramban yang menolak Clipboard API (mis. iframe Apps Script) jatuh ke cara lama.

**Duplikat task kolaborasi**, seperti copy task biasa. Tombol *Duplikat* di modal task
menyalin platform, tipe, warna, deskripsi, dan seluruh daftar proses lengkap dengan PIC
dan stage-nya. Judulnya diberi awalan `Salinan — ` supaya tak tertukar di daftar.
**Deadline dan centang tidak ikut**: jadwal task lama hampir tak pernah cocok untuk yang
baru, dan mewarisi centang berarti mewarisi pekerjaan yang belum dikerjakan.

**Rancangan bisa dibagikan ke Lintas Divisi**, mengikuti pola task biasa: wewenang
**Manager**, dan yang tak dibagikan tak pernah sampai ke layar Lintas Divisi. Sheet
`PACKAGES` melebar ke kolom **T**.

---

## 1.87.5 — Blok Rancangan bisa dilipat di modal task kolaborasi

Rancangan bisa berpuluh baris — PCPM BI 41 saja punya 27 target. Di modal task kolaborasi
itu mendorong **Proses Beruntun**, yang justru dicari orang di sana, jauh ke bawah.

Blok **Rancangan — target & setoran** kini bisa dilipat seperti blok *Bonus angkatan lama
& catatan*, dan **mulai tertutup** setiap kali sebuah task dibuka.

Tiga hal dijaga supaya melipat tidak berarti menyembunyikan keadaan:

- **Ringkasannya tetap terbaca di kepala** walau tertutup — `20/40 paket · 1 belum penuh`.
- **Isinya tetap ada di DOM**, jadi menyimpan tetap membawa setoran yang sudah diketik
  meski bloknya sedang tertutup.
- Sekali dibuka, **tetap terbuka** selama task itu masih dibuka — mengetik satu angka lalu
  panelnya menutup sendiri akan menyiksa.

Di menu **Rancangan Paket** ia tetap terbentang: di sana daftar target itu memang isinya.

---

## 1.87.4 — Judul kolom pada baris target

Baris rancangan tak punya keterangan kolom, sehingga kolom terakhir tak terbaca maksudnya
dan harus ditebak. Sekarang ada judulnya: **grup · nama target · target · satuan · awal**.

`awal` = jumlah yang **sudah tersedia sebelum ada task apa pun** (warisan angkatan lalu).
Ia langsung dihitung terpenuhi tanpa perlu setoran:

```
terpenuhi = awal + setoran yang prosesnya sudah selesai
kurang    = target − terpenuhi
```

Contoh dari hasil impor: `Latsol Numeric PCPM BI 41` bertarget 20 dengan awal 10 — sheet
menuliskannya `10 Paket + 10 Paket COMING SOON`, jadi yang kurang tinggal 10.

`grup` dan `awal` dua-duanya boleh dikosongkan.

---

## 1.87.3 — Tautan paket tidak lagi hilang sendiri setelah halaman dimuat ulang

Tautan task ke paket disimpan di **kolom J** sheet `COLLAB`. Jalur muat-awal
(`getBootstrapData`) membacanya hanya sampai **kolom I**, jadi setiap kali aplikasi
dimuat ulang seluruh collab kembali tanpa `paketId` — tautannya tampak lenyap dan
harus ditautkan lagi.

Gejalanya menipu karena tautannya **tidak pernah benar-benar hilang**: begitu ada
pemanggilan yang membaca sampai kolom J (menyimpan proses, mencentang, menautkan ulang),
tautannya muncul kembali. Itu sebabnya kadang ada, kadang tidak.

Sekarang muat-awal ikut membaca kolom J, dan ada tiga assertion yang membandingkan
hasilnya langsung dengan `getCollabs()` supaya keduanya tak bisa melenceng lagi.

Sisi Apps Script tidak terpengaruh — bootstrap-nya memang memanggil `getCollabs()`.

---

## 1.87.2 — Setoran task tersimpan, dan centang proses langsung menggerakkan rancangan

### Kenapa setoran selalu ter-reset
Panel Rancangan hidup di **dua modal sekaligus** — modal Paket dan modal Task Kolaborasi —
dan memakai id tetap seperti `#pkgItemBox` dan `#pkg-program`. Selama kotak yang tidak
aktif masih berisi gambar lama, id-nya jadi **ganda**, dan `getElementById` mengambil yang
lebih dulu di DOM: modal Paket.

Akibatnya penyimpanan dari modal Task Kolaborasi membaca kotak yang tersembunyi. Angka
setoran yang baru diketik tak pernah ikut terkirim, lalu panel digambar ulang dari server
dan tampak "kembali ke nol".

Sekarang kotak yang tidak aktif dikosongkan sebelum menggambar, jadi id-nya selalu tunggal.

### Progres rancangan bergerak seketika saat proses dicentang
`setCollabStepDone` hanya mengembalikan `collabs`, jadi `state.packages` jadi basi dan
angka rancangan tak ikut berubah sampai halaman dimuat ulang. Panel kini membaca paketnya
dari **`c.pkg`** — yang selalu segar karena `getCollabs` menghitung ulang setoran dan
statusnya — dan digambar ulang tepat setelah proses dicentang.

Alurnya sekarang utuh, terverifikasi di staging dengan angka nyata:

| | Latsol Verbal | Latsol Numerik | Tryout Tahap 1 |
|---|---|---|---|
| Rancangan (target) | 10 | 10 | 20 |
| Disetor task ini | 5 | 5 | 10 |
| Sebelum dicentang | 0/10 · menunggu 5 | 0/10 · menunggu 5 | 0/20 · menunggu 10 |
| Setelah proses dicentang | — | — | **10/20 · kurang 10** |

---

## 1.87.1 — Field rancangan kelihatan sebagai field, grup pindah ke depan

### Kenapa semuanya tampak putih polos
Kelas `.form-control` di aplikasi ini **bukan CSS** — ia diperluas jadi kelas-kelas
utilitas oleh `injectUtilityClasses()`, yang berjalan **sekali saja saat aplikasi dimuat**.
Panel Rancangan digambar ulang terus-menerus, jadi field-nya tak pernah kebagian border,
latar, maupun `w-full`-nya.

Akibatnya dua hal sekaligus: field tak terbaca sebagai isian, dan kotak teks menyusut ke
lebar bawaan `<textarea>` (~20 karakter) — itu sebabnya catatan menurun sempit alih-alih
mengisi ruang yang ada.

Sekarang panel memakai kelasnya sendiri, dipasang langsung di markup. Field yang bisa
diisi diberi **latar abu tipis + border**, jadi terbaca sebagai isian, bukan teks biasa.

### Grup pindah ke depan, dan ditandai opsional
Urutan kolom jadi **grup → nama target → jumlah → satuan → sudah tersedia**. Placeholder-nya
`grup (ops.)` supaya jelas boleh dikosongkan.

### Blok catatan mengikuti lebar yang ada
Dua kolom mulai breakpoint **lg**, bukan `xl` — modal paket lebarnya 1200px dan tak pernah
mencapai `xl` (1280px), jadi aturan sebelumnya tak pernah aktif. Field panjang tetap
melebar penuh.

---

## 1.87.0 — Area Marsel dilepas, isi Master jadi target, dan hapus banyak sekaligus

### Area Marsel tidak lagi ditampilkan
Divisi Produk hanya mengurus sisi produk. Menaruh field milik tim lain — tagline,
benefit, tujuan belajar, varian & harga — di layar ini cuma melahirkan sumber kebenaran
kedua yang tak ada yang merawat.

Kolomnya **tetap ada di sheet** supaya data hasil impor tidak hilang; ia hanya berhenti
disunting dari aplikasi. Yang tersisa cuma **Program** dan **Nama Paket**: itu identitas
paket, bukan materi jualan — tanpa keduanya paketnya tak punya nama.

### Isi Master Koordinasi jadi target sungguhan
Kolom Dibimbing/Latsol/Materi/Tryout/Live Class sebelumnya cuma menumpuk sebagai teks.
Sekarang diurai jadi **652 target** di 21 paket. Aturannya diturunkan dari bentuk datanya
sendiri, bukan tebakan:

| Baris | Diperlakukan sebagai |
|---|---|
| baris pertama sel (`PCPM BI 41`) | judul sel, dilewati |
| diawali `BONUS` | warisan angkatan lama → tetap teks bebas |
| `Total: N Paket` | dilewati, aplikasi menghitungnya sendiri |
| berbullet (`•` / `-`) | selalu target |
| tanpa bullet, diawali `Tahap`, tanpa jumlah | judul kelompok |
| selain itu | target |

Bullet jadi pembeda karena di kolom Materi ada `• Tahap 1 Seleksi Potensi Dasar (SPD)`
yang jelas item, sementara di Latsol `Tahap 1` polos adalah judul kelompoknya.

**Bawaannya "sudah tersedia".** Sheet Master mendaftar apa yang paketnya *berisi*, bukan
antrean pekerjaan — kalau semuanya masuk sebagai belum-digarap, impor melahirkan 652
pekerjaan palsu yang sebenarnya sudah lama jadi. Satu-satunya penanda tekstual bahwa
sesuatu belum ada adalah **`COMING SOON`**; hanya bagian itu yang tersisa sebagai
kekurangan.

Hasilnya untuk PCPM BI 41: 27 target (Dibimbing 2, Latsol 9, Materi 5, Tryout 3, Live
Class 8), dan tepat **3 di antaranya kurang** — dua Latsol `+10 COMING SOON` dan Tryout
`+5 COMING SOON`. Sama persis dengan sheet-nya.

### Pilih banyak rancangan untuk dihapus
Kotak centang di tiap kartu, bilah aksi yang muncul hanya saat ada yang dipilih, dan
"pilih semua **yang tampil**" — menyapu paket yang sedang tersaring keluar adalah cara
paling gampang menghapus sesuatu yang tak sedang dilihat orang.

Penghapusannya lewat **satu panggilan** `deletePackages`, bukan satu per satu. Ini bukan
kerapian: tiap `deletePackage` memuat ulang seluruh paket + collab, jadi menghapus 20
paket beruntun menembus kuota "read requests per minute" Google dan berhenti di tengah
jalan. Ketahuan saat uji langsung di staging, bukan dari membaca kode.

### Kotak catatan menyesuaikan isinya
Sel Latsol di sheet Master bisa 52 baris; dengan kotak 2 baris isinya praktis tak
terbaca. Tingginya kini mengikuti isi (4–20 baris), bisa ditarik lebih tinggi, dan
bloknya dua kolom di layar lebar dengan field panjang melebar penuh.

---

## 1.86.1 — Tombol buat rancangan + urutan menu mengikuti alur kerja

### Rancangan bisa dibuat dari menunya sendiri
Sebelumnya paket hanya bisa lahir dari dalam task kolaborasi (`+ Paket baru`), padahal
alurnya justru terbalik: **Manager menyusun rancangan dulu, tasknya menyusul.** Kini ada
tombol **+ Rancangan Paket** di menu Rancangan Paket, khusus Leader/Manager.

Platform diambil dari filter yang sedang aktif supaya tak perlu diketik dua kali, dan
paket yang baru dibuat langsung dibuka agar targetnya bisa segera disusun — bukan
dicari lagi di daftar.

### Urutan menu grup Kolaborasi
Dari `Komunikasi → Task Kolaborasi → Rancangan Paket` menjadi:

**Rancangan Paket → Task Kolaborasi → Komunikasi**

Urutannya mengikuti alur kerja sebenarnya: rencana disusun, dikerjakan, baru dibicarakan.

---

## 1.86.0 — Rancangan Paket: target yang dipenuhi banyak task

"Master Koordinasi Paket" berganti nama jadi **Rancangan Paket**, dan isinya berubah
dari daftar deliverable jadi daftar **target** yang disetor sedikit demi sedikit.

### Alurnya sekarang
1. **Manager menyusun rancangan** dulu: `Latsol Verbal PCPM BI 41 — 10 Paket`.
2. Task kolaborasi **menyetor** sebagian: satu task 5 paket, task lain 5 paket.
3. Setoran terhitung begitu **prosesnya dicentang** (atau tasknya Selesai).
4. Penuh → **terpenuhi**. Kurang → **kurang 3**. Lebih → **lebih 2**.

### Ini sudah terjadi, cuma dihitung di kepala orang
10 dari 19 task kolaborasi menuliskan jumlah di judulnya karena tak ada tempat lain:
`COL-009 "PCPM Tahap I 5 Paket TO"` dan `COL-010 "PCPM Tahap 1_TO 15 paket"`.
Sheet Master menuliskan `Tahap 1 – 20 paket`. **5 + 15 = 20** — penjumlahan itu
dikerjakan manual lalu diketik ke sel, dan karena itu bisa basi tanpa ketahuan.

### Kelebihan tidak dibulatkan jadi "terpenuhi"
Target 10 dengan setoran 12 tampil sebagai **lebih 2**, bukan `10/10 done`.
Kelebihan biasanya berarti salah hitung atau setoran dobel — justru itu yang perlu
terlihat.

### "Awal" untuk yang sudah tersedia
Kolom `Awal` menampung jumlah yang sudah ada sebelum task apa pun (warisan angkatan
lalu). Terhitung langsung, tanpa perlu setoran palsu.

### Izin
| Bagian | Siapa |
|---|---|
| Rancangan — daftar target, jumlah, tambah/hapus | **Manager saja** |
| Setoran task | pengelola task itu (Leader/Manager) |
| Sisanya | seperti sebelumnya (PIC area, dst) |

Setoran sengaja tidak dikunci ke Manager: ia properti task, bukan properti rancangan.
Kalau menautkan 5 paket pun harus lewat Manager, tiap task baru jadi menunggu beliau.

### Setoran diganti PER TASK, bukan per paket
Kalau seluruh setoran paket ditulis ulang tiap simpan, dua orang yang membuka paket
sama dari task berbeda akan saling menghapus setoran. Ada tesnya.

### Menghapus task tidak merusak rancangan
Setoran yang prosesnya **sudah selesai** diawetkan sebagai catatan sejarah (Collab ID
dikosongkan, tetap terhitung) — pekerjaannya memang terjadi. Yang belum selesai
dibuang: tak ada yang dihasilkan, jadi tak boleh menghantui angka "menunggu".

### Batas yang perlu diketahui
Sistem menjumlahkan apa yang **dideklarasikan**, bukan apa yang benar-benar jadi. Kalau
dua task sama-sama mengklaim 5 paket yang sama, totalnya tetap 10 dan tak ada yang bisa
mendeteksinya. Ini membuat kesenjangan **terlihat**, bukan membuatnya **benar**.

### Perubahan sheet
| Sheet | Perubahan |
|---|---|
| `PACKAGE_ITEMS` | jadi daftar target: **Item ID**, Paket ID, Order, Kategori, Grup, Nama, **Target**, Satuan, **Awal**, Catatan |
| `PACKAGE_CONTRIB` | **baru** — Paket ID, Item ID, Collab ID, Step Order, Jumlah, Catatan |

Item ID dipertahankan saat rancangan disimpan ulang; kalau tidak, seluruh setoran yang
menunjuknya jadi yatim setiap kali Manager menyentuh rancangannya. Target yang dihapus
membawa serta setorannya.

---

## 1.85.0 — Paket jadi entitas sendiri; satu paket digarap banyak task

Master Koordinasi Paket tidak lagi menempel pada satu task kolaborasi. Ia punya
nomor sendiri (`PKG-001`…) dan hidup lebih lama daripada task yang menggarapnya.

### Kenapa dibongkar
Di data nyata, **PCPM BI 41 digarap enam task kolaborasi** — Tahap I TO, Tahap I
Video & Modul, Tahap II TO, Tahap II Video, penambahan TO & latsol, dan seterusnya.
Model 1:1 memaksa paket itu disalin enam kali lalu melenceng satu per satu, persis
penyakit yang mau diobati.

Yang lebih berbahaya: `deleteCollab` dulu ikut menghapus paketnya. Begitu satu paket
digarap banyak task, menghapus satu batch pekerjaan yang sudah rampung akan
memusnahkan seluruh paket — harga, deliverable, semuanya.

### Relasinya ada di item, bukan di collab
Tiap deliverable menunjuk **(Collab ID, Step Order)** yang menghasilkannya. Dari situ
dua arah terpenuhi sekaligus:

- satu paket menerima deliverable dari **banyak** task
- satu task menyuplai **banyak** paket — nyata: `COL-007 "Jadwal Liveclass bulan
  Agustus"` mencakup JadiASN, JadiBUMN, JadiSekdin, dan JadiPrajurit sekaligus

Kolom `Paket ID` di COLLAB tetap ada, tapi perannya cuma menentukan paket mana yang
tampil di modal task itu — bukan relasinya.

### Menghapus task tidak lagi merusak paket
`deleteCollab` sekarang melepas tautan deliverable-nya saja, **dan mengawetkan
hasilnya**: deliverable yang prosesnya sudah selesai tetap `siap`. Pekerjaannya memang
terjadi; yang hilang cuma catatan tasknya.

### Menu baru: Master Paket
Paket tidak selalu punya task yang menggarapnya — 36 paket hasil impor lahir tanpa
satu pun. Tanpa menu sendiri mereka tak terjangkau. Panel di dalamnya sama persis
dengan yang muncul di modal task kolaborasi.

### Pemilih paket di modal task
Setelah Platform dipilih, muncul pilihan paket yang disaring untuk platform itu, plus
**+ Paket baru**. Membuat paket baru dibatasi Leader/Manager — kalau tidak, daftarnya
cepat penuh duplikat karena tiap orang membuat sendiri alih-alih menautkan yang ada.

### Kolom J di COLLAB dijaga polanya
Sebelum jadi `Paket ID`, kolom itu sempat diisi orang dengan hal lain (ditemukan berisi
nama stage). Hanya nilai berpola `PKG-xxx` yang diakui sebagai tautan; sisanya diabaikan
alih-alih memunculkan paket hantu yang tak pernah ada.

### Perubahan sheet
| Sheet | Perubahan |
|---|---|
| `PACKAGES` | kunci jadi **Paket ID**, dapat kolom **Platform** (A..S) |
| `PACKAGE_VARIANTS` | kunci ikut jadi Paket ID |
| `PACKAGE_ITEMS` | kunci jadi Paket ID; sumbernya jadi **dua kolom**: Collab ID + Step Order (A..J) |
| `COLLAB` | dapat kolom **Paket ID** (J) |

Menyimpan task sengaja berhenti menulis di kolom I — kalau tidak, tautan paketnya
terhapus tiap kali task disimpan.

---

## 1.84.1 — Penanda STAGING supaya tak tertukar dengan aplikasi utama

Preview Vercel memakai kode yang sama persis dengan produksi, jadi satu-satunya
pembeda yang tersedia di browser adalah alamatnya. Sekarang alamat di luar daftar
host produksi otomatis menampilkan:

- logo sidebar berubah **amber**, bukan indigo
- tulisan **"STAGING · Divisi Produk"** menggantikan "Divisi Produk"
- garis amber tipis di tepi atas layar — tetap terlihat walau sidebar disembunyikan
- judul tab browser diawali `[STAGING]`

Daftar host produksi ditulis eksplisit dan **sisanya dianggap staging**. Arah gagalnya
sengaja begitu: keliru menandai produksi sebagai staging cuma bikin malu, sebaliknya
bisa membuat orang mengira data uji coba itu nyata.

Apps Script tidak ikut ditandai — deployment-nya dipasang manual, bukan preview.

---

## 1.84.0 — Area Produk jadi daftar deliverable yang terhubung ke proses

Kolom Area Produk berhenti jadi blok teks. Tiap deliverable kini satu baris tersendiri
dengan nama, jumlah, satuan, dan **proses yang menghasilkannya**.

### Kenapa
Di sheet Master, status tiap item hanya hidup sebagai **warna**: hitam berarti produksi
baru yang sedang digarap, abu-abu berarti bonus angkatan lama yang sudah tersedia.
Pembedaan sepenting itu tak bisa dihitung, disaring, atau dilaporkan — dan tak bisa
dipulihkan impor apa pun. Baris `Total: 40 Paket` pun diketik tangan.

### Satu proses boleh menghasilkan banyak deliverable
Penunjuknya ada di sisi **item**, bukan di sisi proses. Satu proses seperti
*"Generate 10 paket latsol (Numerik & digit symbol)"* menaungi dua item terpisah, dan
mencentang proses itu sekali membuat keduanya jadi `siap` bersamaan.

| Keadaan item | Statusnya dari mana |
|---|---|
| Ditautkan ke sebuah proses | **ikut proses itu** — tak bisa diketik manual |
| Tanpa proses (produksi angkatan lalu) | status tersimpannya sendiri (`siap` / `belum`) |

Status `siap` yang dikirim klien untuk item bertaut proses **diabaikan server**. Kalau
tidak, orang bisa menyatakan deliverable siap tanpa prosesnya pernah dikerjakan.

### Subtotal dihitung, tidak diketik
Tiap kategori menampilkan `siap / total` dari itemnya. Header panel menampilkan
ringkasan seluruh paket. Tak ada lagi angka total yang bisa basi tanpa ketahuan.

### Tata letak
Di dalam modal task kolaborasi, panel Master dibagi dua: **kiri** cermin ringkas Proses
Beruntun (dengan angka berapa deliverable menunggu tiap proses), **kanan** daftar
deliverable per kategori. Bukan view baru — dua daftar itu tidak sejajar (satu proses
bisa menghasilkan item di beberapa kategori sekaligus), dan mengisi deliverable serta
mencentang proses dikerjakan orang yang sama dalam satu duduk.

### Bonus angkatan lama tetap teks bebas
Ratusan paket warisan yang sudah jadi, tak pernah menahan apa pun. Menstrukturkannya
cuma menambah ratusan baris yang harus diketik tanpa ada yang dipantau. Field lama
Dibimbing/Latsol/Materi/Tryout/Drilling/Live Class kini berperan sebagai blok bonus
& catatan itu, dan bisa dilipat.

### Area Marsel jadi rujukan
Sesuai batas kerja Divisi Produk. Field dan varian harganya tetap tersimpan dan bisa
diubah Manager/Leader, tapi dilipat sebagai rujukan — bukan sumber kebenaran kedua
untuk tim yang tidak memakai ProductTrack.

### Tautan yang putus tidak dihapus diam-diam
Kalau proses yang ditunjuk sebuah item dihapus dari Proses Beruntun, nomornya tetap
terbawa dan ditandai (`link_off`, dan dropdown-nya menampilkan *"(proses sudah
dihapus)"*). Tanpa ini, dropdown jatuh ke "tanpa proses" dan tautan yang rusak itu
terhapus pada penyimpanan berikutnya — kerusakannya hilang, bukan diperbaiki.

### Sheet baru
`PACKAGE_ITEMS` (A..I), berkunci **Collab ID**, dibuat otomatis saat pertama dipakai.
`deleteCollab` ikut membuangnya — sama seperti sub-ceklis (1.64.0), komentar (1.69.1),
task (1.74.1), dan paket (1.81.0), supaya collab bernomor bekas tidak mewarisinya.

---

## 1.83.0 — Master Koordinasi Paket menempel pada Task Kolaborasi

Isi sheet **Master Koordinasi Paket** sekarang hidup di dalam task kolaborasi yang
menghasilkannya. Tidak ada tab baru: satu task kolaborasi = satu paket.

### Di kartu Task Kolaborasi
Pita amber baru di antara judul dan progress bar: jumlah varian, rentang harga
diskon, dan berapa dari 13 field master yang sudah terisi. Di bawahnya dua pil
gate — **Input Fitur** dan **QC VOC**.

Kartu yang belum punya data paket sama sekali **tidak** menampilkan pita ini, jadi
task kolaborasi yang memang bukan paket tetap terlihat seperti sebelumnya.

### Di modal detail
Panel **Master Koordinasi Paket** disisipkan tepat di atas Proses Beruntun, dibagi
dua area berpemilik — meniru pita `AREA MARSEL` / `AREA PRODUK` di sheet aslinya:

| Area | Field | PIC |
|---|---|---|
| Marsel | Program, Nama Paket, Tagline, Benefit × Fitur, Tanggal Rilis, Tujuan Belajar | ditunjuk Manager/Leader |
| Produk | Dibimbing, Latsol, Materi, Tryout, Drilling, Live Class, Catatan Produk | ditunjuk Manager/Leader |

Tabel **Varian** menyimpan masa aktif + harga awal + harga diskon; potongannya
dihitung, tidak diketik. Menyimpan varian **mengganti** seluruh daftarnya.

### Aturan hak ubah
- Manager & Leader boleh mengubah kedua sisi.
- PIC sebuah area hanya boleh mengubah sisinya sendiri — dan **tidak bisa mengoper
  PIC-nya ke orang lain**; penunjukan PIC hanya lewat Manager/Leader.
- Varian & harga ikut **Area Marsel**, sejalan dengan sheet aslinya yang menaruh
  kolom Masa Aktif dan Harga di band Marsel.
- Field yang bukan milik Anda tetap terlihat, tapi tampil terkunci — bukan tampak
  bisa diisi lalu ditolak saat disimpan.

### Dua gate berhenti jadi sel yang diketik
`Input Fitur` dan `QC VOC` di sheet adalah kolom T dan U, yang isinya sudah
telanjur bercampur empat kosakata (`TRUE`, `FALSE`, `done`, kosong). Di sini
keduanya **proses biasa** di Proses Beruntun — status pilnya dibaca dari sana,
lengkap dengan nama pengerja dan tanggalnya. Kalau prosesnya belum dibuat, pilnya
menyebutkan itu apa adanya alih-alih menebak.

### Sheet baru
`PACKAGES` (A..R) dan `PACKAGE_VARIANTS` (A..F), keduanya berkunci **Collab ID**
dan dibuat otomatis saat pertama dipakai.

Karena berkunci Collab ID, `deleteCollab` sekarang ikut membuang baris paket dan
variannya. Tanpa itu, collab baru yang memakai ulang nomor bekas (`genCollabId` =
max + 1) akan mewarisi harga dan isi paket milik collab yang sudah dihapus —
keluarga bug yang sama dengan sub-ceklis (1.64.0), komentar (1.69.1), dan task
(1.74.1). Ada tesnya sekarang.

Paket ikut dibawa `getCollabs`, bukan lewat panggilan terpisah, sehingga setiap
jalur yang menyegarkan daftar kolaborasi otomatis menyegarkan paketnya juga.

---

## 1.82.0 — Satuan baris Laporan: satu PROSES, bukan satu kolaborasi

Lanjutan 1.81.0. Di sana kerja kolaborasi sudah masuk Laporan, tapi satuannya
salah: semua proses milik satu orang di satu kolaborasi dilebur jadi **satu**
baris (`collabPseudo`, yang memang dirancang untuk kartu Kanban).

### Apa yang hilang karena peleburan
Baris leburan hanya mengambil `stage` dan `deadline` dari **proses pertama yang
belum selesai**. Dua akibatnya nyata:

- **Stage proses lain lenyap.** Ali pegang proses #1 "Develop Soal" (selesai) dan
  proses #4 "Finalisasi" (belum) di kolaborasi yang sama → rekap Per Stage hanya
  melihat "Finalisasi". Pekerjaan di "Develop Soal" seolah tak pernah ada.
- **Telat di urutan belakang tak terhitung.** Kalau proses yang lewat tenggat ada
  di belakang antrean sementara proses terdepan masih aman, barisnya tidak pernah
  ditandai overdue.

### Sekarang
`allCollabStepRows()` menghasilkan satu baris per **(proses × pemilik proses)**,
ber-id `COL-xxx#N` — pola id yang sama dengan sub-ceklis proses di backend.
Tiap baris memakai stage, deadline, dan tanggal centangnya sendiri:

| | Model lama (1.81.0) | Sekarang (1.82.0) |
| --- | --- | --- |
| Satuan | kolaborasi × orang | **proses × orang** |
| Stage | proses pertama yang belum selesai | milik proses itu |
| Deadline | idem | milik proses itu |
| Status | gabungan semua prosesnya | `Done` / `In progress` bila handoff sudah sampai / `Todo` |
| Selesai minggu ini | seluruh proses orang itu harus tuntas | tiap proses dihitung sendiri |

Angka "Aktif / Selesai / Overdue" otomatis naik dibanding 1.81.0 karena satuannya
lebih halus — bukan pekerjaan baru, melainkan pekerjaan yang dulu tersembunyi di
balik peleburan.

### Yang TIDAK berubah
Kanban dan Task List tetap memakai `collabPseudo` (satu kartu per kolaborasi per
orang). Di sana peleburan justru benar: satu kartu = satu task yang bisa diklik.

### Rincian lain
- `stepOwners()` dipisah jadi fungsi sendiri — pemecah PIC peran (`@Magang`) jadi
  anggota aktifnya. Dipakai bersama oleh rekap se-tim dan baris proses.
- Cakupan aktivitas kini memuat **id proses dan id kolaborasinya**. Tanpa itu
  komentar kolaborasi (dicatat atas nama `COL-xxx`) dianggap di luar cakupan dan
  hilang dari KPI "Komentar minggu ini".
- Drill-down PIC & CSV menyebut nomor prosesnya (`proses 4: Finalisasi`,
  `#4 Finalisasi`), menggantikan progres `2/3 proses` yang tak lagi bermakna.

### Berkas
| Berkas | Perubahan |
| --- | --- |
| `public/index.html` (& salinan `gas/Index.html`) | seluruh perubahan di atas |
| `test/gas.test.js` | 12 assertion baru, 2 disesuaikan (767 → 777) |

---

## 1.81.0 — Laporan manager ikut menghitung task kolaborasi

Laporan hanya membaca `state.tasks`. Task kolaborasi disimpan di sheet lain
(`COLLAB` + `COLLAB_STEPS`) dan tak pernah masuk ke sana, jadi seluruh kerja
kolaborasi — yang di beberapa pekan justru bagian terbesarnya — tak terlihat sama
sekali di rekap manager. Angka "Aktif", "Overdue", dan "Selesai minggu ini"
melaporkan sebagian pekerjaan sebagai kalau itu seluruhnya.

### Satu baris per (kolaborasi × PIC proses)
Laporan memakai "pseudo-task" yang sudah dipakai Kanban & Task List
(`collabPseudo`): pekerjaan **satu orang** pada satu task kolaborasi jadi satu
baris, dengan status diturunkan dari proses miliknya. Jadi kolom Per PIC tetap
berarti "beban orang itu", bukan "jumlah task kolaborasi".

Konsekuensinya jumlah baris bukan lagi jumlah task — label di laporan & CSV
diubah dari "Total task" jadi **"Total baris"**, dengan pecahan "Dari task
kolaborasi" di bawahnya.

### Tombol Sumber: Semua · Task · Kolaborasi
Menambah baris kolaborasi mengubah arti angka yang selama ini dibaca manager.
Tombol Sumber membuat keduanya bisa dibandingkan, dan tetap bisa dikembalikan ke
"Task biasa saja" persis seperti laporan sebelum versi ini. Bawaannya **Semua**.

Opsi PIC & Stage sengaja dibaca dari **seluruh** sumber, bukan dari sumber yang
sedang dipilih — kalau tidak, memilih "Kolaborasi saja" membuat PIC yang sedang
tersaring lenyap dari dropdown dan filternya tak bisa dilepas lagi.

### "Selesai minggu ini" untuk kolaborasi
Task biasa meninggalkan jejak `Status: … → Done` di log aktivitas; kolaborasi
tidak — yang tercatat cuma `Collab Step Done`. Kelarnya kini dibaca dari **tanggal
centang proses terakhir** milik orang itu (`doneAt`), lalu dijumlahkan dengan
hitungan task biasa. Baris `COL-…` juga dikeluarkan dari pencarian jejak
"→ Done" supaya tak terhitung dua kali.

### Perbaikan: proses ber-PIC peran tak lagi hilang
`allCollabTasks()` mengumpulkan PIC proses apa adanya. Untuk proses milik bersama
satu peran (`@Magang`), nama itu **tak pernah** cocok dengan `stepBelongsTo` —
`hasRole('@Magang','magang')` selalu salah — sehingga prosesnya menguap dari rekap
se-tim. Sekarang PIC peran dipecah dulu jadi anggotanya yang aktif. Ini juga
memperbaiki Kanban & Task List, bukan cuma Laporan.

### Rincian lain
- Kolom **Kolab** di tabel Per PIC: berapa banyak beban orang itu yang datang dari
  kolaborasi.
- Drill-down PIC: baris kolaborasi diberi lencana `KOLAB`, menampilkan nama proses
  + progres (`2/3 proses`), dan membuka **modal kolaborasi**, bukan modal task.
- Ekspor CSV: baris `Sumber`, pecahan `Dari task kolaborasi`, kolom `Kolaborasi` di
  Per PIC, serta kolom `Jenis` & `Proses` pada daftar detail.

### Berkas
| Berkas | Perubahan |
| --- | --- |
| `public/index.html` (& salinan `gas/Index.html`) | seluruh perubahan di atas |
| `test/gas.test.js` | 13 assertion baru |

---

## 1.80.0 — Tombol "Task Saya" di Task Kolaborasi

Tombol filter **"Giliran Saya"** diganti menjadi **"Task Saya"**.

### Bedanya
| | Dulu ("Giliran Saya") | Sekarang ("Task Saya") |
|---|---|---|
| Yang tampil | kolaborasi yang prosesnya **sudah tiba giliran** Anda | **semua** kolaborasi yang punya proses ber-PIC Anda |
| Proses yang masih menunggu orang sebelumnya | tersembunyi | ikut tampil |
| Kolaborasi yang sudah Selesai | tersembunyi | ikut tampil |

Dulu tombol itu menjawab "apa yang harus saya kerjakan **sekarang**". Sekarang ia
menjawab "kolaborasi apa saja yang **melibatkan saya**" — termasuk yang antreannya
belum sampai dan yang sudah rampung.

### Yang tidak berubah
- Spanduk merah **"Giliran Anda: N proses siap dikerjakan"** tetap ada di atas daftar.
- Lencana angka di menu Task Kolaborasi tetap menghitung giliran, bukan total task.
- Kartu yang jadi giliran Anda tetap naik ke urutan teratas, juga saat filter ini menyala.
- Filter lain (tipe, platform, PIC, status, pencarian) tetap bisa digabungkan.

PIC berbentuk peran ikut dikenali: seorang magang tetap melihat proses ber-PIC
`@Magang` sebagai tasknya, sama seperti di bagian lain aplikasi.

Warna aktif tombol dipindah dari merah ke indigo — merah dipakai untuk nada
mendesak ("giliran"), sedangkan ini sekadar filter cakupan.

---

## 1.79.0 — MCP server: Claude di device manager bisa ditanyai langsung

Bagian terakhir dari rangkaian. `api/mcp.js` menyatukan dua sumber — metrik task
tracker dan sheet OKR — jadi satu MCP server, sehingga manager bisa bertanya
dengan bahasa biasa alih-alih menjalankan perintah dari terminal.

Tak ada perubahan tampilan aplikasi. Tim tidak akan melihat bedanya.

### Kenapa server, bukan program yang dipasang di perangkat

Protokolnya lewat Streamable HTTP, jadi device manapun cukup menempelkan URL.
Tak ada yang perlu diinstal di perangkat manager, tak ada kredensial Google yang
turun ke sana, dan perbaikan cukup di-deploy sekali untuk semua device.

### Batas kemampuannya

| Terhadap | Kemampuan | Ditegakkan oleh |
|---|---|---|
| Task tracker | baca saja | Hanya lewat `runQuery()` — tak ada jalur tulis |
| Sheet OKR | baca saja | Scope `spreadsheets.readonly` |
| Catatan pribadi | tak terjangkau | `metrics.js` hanya menyentuh `Main` & `ACTIVITY` |

Baris kedua bukan sekadar niat baik: scope `readonly` ditegakkan Google, jadi
salah kode sekalipun tak bisa merusak sheet OKR manager. Konsekuensinya manager
tetap menyunting OKR-nya langsung di Google Sheets — pilihan sadar untuk versi
pertama.

Tokennya sama dengan endpoint metrics, jadi mencabut satu baris di
`METRICS_TOKENS` menutup dua-duanya sekaligus.

### Delapan tool

Enam untuk task — `task_summary`, `task_throughput`, `task_ontime`,
`task_workload`, `task_aging`, `task_list` — dan dua untuk OKR: `okr_list` dan
`okr_progress`.

`okr_progress` adalah intinya: menjalankan kolom `Query`/`Ambil` tiap Key Result
ke data task, lalu membandingkan hasilnya terhadap baseline dan target. Tiap KR
ditandai `auto`, `manual`, atau `error` — KR yang memang diukur di luar task
tracker dilaporkan apa adanya sebagai tak berangka, **bukan dikarang jadi nol**.

### Caveats dibawa sampai ke percakapan

Deskripsi tiap tool memuat instruksi agar Claude selalu menyampaikan `caveats`
bersama angkanya, dan `initialize` mengulang instruksi yang sama di tingkat
server. Jadi yang sampai ke manager bukan "55,7%" telanjang, melainkan 55,7%
beserta catatan bahwa 163 task Done tak terhitung karena tanggal selesainya tak
diketahui.

### Perubahan di metrics.js

Inti perhitungan dipisah jadi `runQuery()`, terlepas dari lapisan HTTP-nya.
Dengan begitu `api/mcp.js` memakainya langsung tanpa server memanggil dirinya
sendiri lewat jaringan — yang cuma menambah latensi dan satu titik gagal baru.
Perilaku endpoint HTTP tidak berubah sama sekali.

### Setup

Satu variabel baru: `OKR_SHEET_ID` (dan opsional `OKR_SHEET_TAB`, default `OKR`).
Tanpa itu tool `task_*` tetap jalan normal; hanya `okr_*` yang gagal, dengan
pesan yang menyebutkan apa yang kurang.

Panduan lengkap: `docs/MCP.md`.

---

## 1.78.1 — Kerangka sheet OKR: templat, jembatan ke metrics, dan pemeriksanya

Tidak ada kode aplikasi yang berubah. Isinya templat, dokumentasi, dan satu alat
bantu di folder `okr/` — tak dipanggil dari `api/` dan tak ikut ter-deploy.

Sistem OKR sengaja berdiri **di luar** task tracker: spreadsheet sendiri, milik
manager, tak menyentuh data operasional tim. Yang menyambungkan keduanya hanya
endpoint metrics.

### Templat sheet OKR

`okr/template.csv`, tinggal diimpor ke Google Sheets. Dua belas kolom, dan dua di
antaranya jadi jembatan ke angka nyata:

| Kolom | Isi |
|---|---|
| `Query` | Querystring endpoint metrics, mis. `view=ontime&stage=QC&from=…&to=…` |
| `Ambil` | Jalur nilai di jawaban, mis. `data.on_time_rate` |

Dipisah jadi dua kolom supaya tak ada penerjemahan yang bisa salah diam-diam.

Dua kolom lain yang gampang dianggap sepele tapi menentukan: `Arah` (`naik`/`turun`
— menentukan apakah target itu batas bawah atau batas atas) dan `Baseline` (tanpa
ini, "55% menuju 90%" tak bermakna karena tak diketahui berangkat dari mana).

Baseline di templat diisi dari **data asli** yang diukur 27 Agustus 2026, bukan
angka karangan.

Satu baris contoh sengaja dibiarkan tanpa `Query` — menandakan bahwa tidak semua
Key Result harus terukur dari task tracker. Memaksakannya justru membuat tujuan
dipangkas agar muat ke alat ukurnya.

### Pemeriksa jembatan

```bash
METRICS_TOKEN=<token> npm run okr:check -- --sheet <ID_SHEET_OKR>
```

Query yang salah ketik tidak memunculkan error apa pun di spreadsheet — dia diam
sampai berbulan-bulan kemudian ada yang mempertanyakan angkanya. Pemeriksa ini
menjalankan tiap `Query` ke endpoint dan melaporkan hasilnya, menangkap view yang
salah ketik, jalur `Ambil` yang tak ada, baris setengah terisi, format tanggal
keliru, serta baseline atau arah yang kosong.

Catatan keterbatasan dari endpoint ditampilkan **menempel pada KR-nya**, bukan
dikumpulkan jadi satu daftar — tiap KR menyaring data yang berbeda, jadi "69%
punya Due Date" pada satu KR dan "82%" pada KR lain sama-sama benar. Digabung,
keduanya malah terbaca seperti saling bertentangan.

Panduan lengkap: `docs/OKR.md`.

---

## 1.78.0 — Fondasi data untuk sistem OKR: endpoint metrics & riwayat status terstruktur

Dua tambahan di sisi backend. Tidak ada satu pun perubahan tampilan — tim tidak
akan melihat bedanya. Keduanya menyiapkan jalan supaya sistem OKR bisa membaca
angka dari task tracker ini tanpa boleh mengubah apa pun di dalamnya.

### Endpoint `api/metrics.js` — pintu baca-saja untuk sistem luar

Sistem OKR sebaiknya tidak membaca kolom spreadsheet langsung. Task tracker ini
berubah cepat, dan setiap perubahan struktur akan menggeser angka di sisi sana
tanpa ada yang sadar. Endpoint ini jadi **kontrak**: isi dalam boleh berubah,
bentuk jawabannya dijaga tetap.

Enam view — `summary`, `throughput`, `ontime`, `workload`, `aging`, `tasks` —
dengan penyaring `from`/`to`/`stage`/`platform`/`pic`/`status`/`priority`/`q`.

Tiga hal yang menjaganya aman:

| Jaminan | Cara ditegakkan |
|---|---|
| Tak bisa menulis | Hanya melayani `GET`; metode lain ditolak sebelum data dibaca |
| Tak menyentuh data pribadi | Hanya memakai `getTasks()` & `getActivityLog()`. Sheet `NOTES`, `COMMENTS`, `LINKS`, `USERS`, `AUTH`, `CHECKLIST`, `COLLAB`, `NOTIFICATIONS` tidak pernah dibuka |
| Akses dicabut per orang | Token terdaftar satu-satu lewat env `METRICS_TOKENS` berformat `nama:token` |

Jaminan kedua diuji otomatis: tesnya membaca ulang kode sumber `metrics.js` dan
gagal kalau ada panggilan ke luar dua fungsi itu.

Yang membedakannya dari sekadar "ambil data": setiap jawaban membawa `coverage`,
`excluded`, dan `caveats` — seberapa lengkap data di balik angkanya. Contohnya
`ontime` melaporkan sendiri bahwa 163 task Done gugur dari hitungan karena tanggal
selesainya tak diketahui, alih-alih diam-diam menghilangkannya.

Panduan lengkap: `docs/METRICS.md`.

### Riwayat status kini punya kolomnya sendiri

Sampai 1.77.x, perpindahan status hanya tersimpan sebagai kalimat di kolom Detail
`ACTIVITY`:

```
Mengedit 5 Video materi • Status: Done • PIC: Dhea
```

Siapa pun yang ingin menghitung "berapa task selesai bulan lalu" harus menebak
pola dari kalimat itu. Jalan, tapi rapuh — sekali format kalimatnya berubah,
seluruh angka riwayat ikut bergeser tanpa satu pun error muncul.

Sekarang ada dua kolom baru:

| Kolom | Isi |
|---|---|
| `F` — Status Lama | Status sebelum berpindah; kosong pada task yang baru dibuat |
| `G` — Status Baru | Status setelah berpindah |

Diisi **hanya saat status benar-benar berpindah**. Menyunting judul, tenggat, atau
prioritas tidak menyentuh kolom ini. Begitu juga menyetel ulang status ke nilai
yang sama — kalau itu ikut tercatat, task yang sebenarnya kelar bulan lalu akan
terbaca sebagai kelar hari ini.

Kalimat lama di kolom Detail tetap ditulis seperti biasa, jadi tampilan riwayat di
aplikasi tidak berubah dan baris lama tetap sebanding dengan baris baru.

Tidak ada tambahan baca ke Google: jalur "Done" memang sudah membaca baris itu
untuk gerbang izin, dan sekarang satu pembacaan melayani dua keperluan.

### Yang perlu dilakukan sekali

Klik **Setup** di mode Dev untuk menambahkan label kolom `Status Lama` dan
`Status Baru`. Aman diulang dan tidak menyentuh baris data — hanya barisnya header.
Pencatatannya sendiri sudah jalan begitu versi ini terpasang, dengan atau tanpa
labelnya.

### Batasnya: hanya berlaku ke depan

Baris lama tetap kosong selamanya dan terus dibaca lewat penebakan teks. Yang
membaik hanya kejadian baru. Endpoint metrics melaporkan kemajuannya lewat
`status_logging` — saat pertama aktif isinya `structured: 0`, lalu naik sendiri
seiring tim bekerja.

Sampai rasionya cukup tinggi: **kondisi hari ini bisa dipercaya, tren antar
periode belum.**

---

## 1.77.1 — Item ceklis lama yang jejak pembuatnya rusak tak lagi terkunci

Setelah 1.77.0 terpasang, PIC yang jelas-jelas membuat sendiri item ceklisnya
tetap tidak melihat tombol hapus. Penyebabnya data lama, bukan aturan izinnya.

### Apa yang rusak
Sampai 1.76.x, fungsi `setChecklistDone` menulis rentang `C:F` sekaligus saat item
dicentang — dan kolom **D (`Created By`)** ikut tertimpa teks item. Bug itu sudah
ditutup di 1.77.0, tapi baris yang **terlanjur** dicentang sebelum itu jejaknya
sudah hilang: kolom D berisi nama item, bukan nama pembuat. Karena 1.77.0 mulai
memakai kolom D sebagai dasar izin, item-item lama itu jadi "milik" nama yang
tidak pernah ada, dan pembuat aslinya ikut terkunci.

### Perbaikannya
Kerusakannya punya tanda yang pasti: **kolom D sama persis dengan kolom B**
(nama pembuat tidak mungkin identik dengan teks itemnya). Baris seperti itu kini
dibaca sebagai **pembuat tidak diketahui**, bukan dianggap milik siapa pun.

Kalau pembuatnya tidak diketahui, izin hapus jatuh ke hak ubah ceklis task itu —
yakni **PIC / Support task, Leader, dan Manager**. Orang di luar itu tetap ditolak.

Berlaku di tiga tempat sekaligus supaya tak ada celah: pembacaan `getChecklist`,
jalur `deleteChecklistItem` di backend, dan tampilan tombol di frontend.

Tidak ada penulisan ke spreadsheet dan tidak ada migrasi data — murni cara membaca.
Item yang dibuat mulai 1.77.0 menyimpan pembuatnya dengan benar, jadi ini hanya
menyangkut baris lama.

---

## 1.77.0 — Tombol simpan di kanan + hapus item Ceklis Pengerjaan

### "Simpan catatan" & "Simpan link" jadi tombol di kanan
Sebelumnya keduanya tautan teks kecil di kiri — mudah terlewat dan tak terbaca sebagai aksi.
Kini tombol indigo bertulisan putih dengan ikon, rata **kanan** di panel prosesnya.

### Menghapus item Ceklis Pengerjaan
Sebelumnya **hanya Manager**. Sekarang boleh dilakukan oleh:

| Siapa | Boleh menghapus |
|---|---|
| **Pembuat item** | item buatannya sendiri |
| **Leader** | item siapa pun |
| **Manager / Dev** | item siapa pun |
| Orang lain | tidak — pesannya menyebut siapa pembuatnya |

Izinnya dinilai **per item**, bukan sekali untuk seluruh daftar, karena bergantung pada siapa
yang membuatnya. Tombol hapus hanya muncul pada baris yang memang boleh dihapus, dan ada
konfirmasi sebelum menghapus. Ditegakkan di **kedua backend**, bukan sekadar menyembunyikan
tombolnya.

### Bug lama yang tersingkap: mencentang menghapus jejak pembuat
Aturan baru di atas sempat tak berfungsi, dan penyebabnya bukan aturannya.
`setChecklistDone` menulis rentang **C:F** sekaligus dengan isi
`[done, item, checkedBy, checkedAt]` — padahal **kolom D adalah `Created By`**. Jadi setiap
kali item dicentang, nama pembuatnya **tertimpa oleh teks item itu sendiri**.

Selama ini tak terasa karena `createdBy` tidak dipakai untuk apa pun. Begitu dipakai sebagai
dasar izin, kerusakannya langsung terlihat. Sekarang penulisannya dipisah: kolom C untuk
status centang, kolom E:F untuk pencentang & waktunya — **kolom D tidak pernah disentuh**.

Ditambahkan tes yang memastikan `createdBy` bertahan setelah item dicentang.

---

## 1.76.2 — Perbaikan: menu notifikasi tenggelam di bawah kartu task

Membuka lonceng notifikasi menampilkan menunya **di belakang** kartu task, jadi isinya
tertutup dan tak bisa diklik.

### Sebabnya bukan z-index menunya
Menu sudah `z-[60]`. Masalahnya di induknya: `<header>` memakai **`backdrop-blur`**, dan
properti itu membuat **stacking context baru**. Akibatnya z-index menu hanya berlaku *di
dalam* header — sementara header sendiri tak punya z-index dan berada sebelum `<section>`
konten, sehingga seluruh isinya (menu termasuk) tenggelam di bawah kartu.

Menaikkan `z-[60]` jadi berapa pun tidak akan menolong; yang perlu z-index adalah headernya.

### Perbaikannya
`<header>` diberi `relative z-[70]` — tetap **di bawah modal** (`z-[90]` ke atas) supaya
dialog masih menutupi header seperti sebelumnya.

Dibuktikan dengan `elementFromPoint` di tiga titik dalam menu: sesudah perbaikan semuanya
mengembalikan `notifMenu`; begitu stacking context header dicabut, yang teratas kembali
menjadi elemen kartu. Modal juga diperiksa masih menutupi header.

Menu melayang lain di aplikasi ini hanya satu — menu mention di dalam modal kolaborasi — dan
itu aman karena modalnya sudah punya stacking context sendiri.

---

## 1.76.1 — QC: angka filter & ekspor tak sejalan dengan baris yang tampil

Audit lanjutan setelah 1.76.0. Dua ketidakcocokan ditemukan — keduanya lahir karena baris
kolaborasi disisipkan ke tampilan, tapi penghitung dan pengekspornya belum ikut menyesuaikan.

### 1. Pil filter menghitung task saja
`applyQuickFilterCount()` memakai `scopedTasks()` — task saja. Padahal Task List & Kanban
menampilkan task **+ baris kolaborasi**. Jadi pil bertuliskan *"Semua 6"* sementara tabelnya
memperlihatkan **25** baris.

Hitungannya kini menyertakan baris kolaborasi **pada view yang memang menampilkannya**.
Timeline & Calendar tidak menyisipkan collab, jadi angkanya tetap task saja — diperiksa
lewat `viewIncludesCollab()`, bukan diseragamkan buta.

Terverifikasi: Task List *"Semua 25"* = 25 baris tampil; Timeline *"Semua 6"*.

### 2. Ekspor CSV mengabaikan filter cepat pada baris kolaborasi
Filter **Tugas Saya / Overdue / Due ≤3 hari** dan **fokus deadline** menyaring baris task,
tapi baris kolaborasi tetap lengkap — satu berkas memuat dua cakupan berbeda.

Sekarang keduanya disaring sama. Terverifikasi:

| Filter | Task | Kolaborasi |
|---|---|---|
| Semua | 6 | 26 |
| Tugas Saya | 0 | **4** (bukan 26) |
| Overdue | 3 | **3** (bukan 26) |

### Yang diperiksa dan ternyata SEHAT
- **Dashboard & grafik** memakai sumber terpisah (`dashTasks()`) yang tidak menyertakan
  baris kolaborasi — jadi satu kolaborasi dengan 9 PIC **tidak** menggandakan hitungan beban
  kerja. Ini sengaja diperiksa karena 1.76.0 membuat satu kolaborasi menghasilkan banyak baris.
- **Pemilihan banyak (multi-select) di Kanban** — `isSelectable()` memang menolak baris
  kolaborasi, jadi ID kembar antar-baris tidak bisa mengacaukan pilihan.
- Cakupan pseudo-task collab dipisah jadi `collabScopedTasks()` supaya tampilan, hitungan,
  dan ekspor menarik dari **satu** sumber — tidak bisa lagi melenceng sendiri-sendiri.

---

## 1.76.0 — Proses kolaborasi tiap orang ikut muncul di daftar task

Task List & Kanban sebenarnya sudah menyisipkan pekerjaan kolaborasi — tapi **hanya milik
yang sedang login**. Akibatnya Manager melihat ratusan task tim, namun **nol** proses
kolaborasi milik orang lain, seolah kerja kolaborasi tidak pernah ada di daftar.

Sekarang cakupannya mengikuti hak pandang:

| Pengguna | Proses kolaborasi yang muncul |
|---|---|
| Manager / Leader / Dev | **seluruh tim** — 19 baris dari 9 orang berbeda |
| Manager + **Fokus PIC** | menyempit ke orang itu saja |
| Staff | prosesnya sendiri |

Baris kolaborasi kini menyebut **pemiliknya**: *"Proses Andika: Syuting pengenalan"* untuk
milik orang lain, dan tetap *"Proses Anda"* bila memang milik yang sedang melihat.

### Celah yang ikut ketahuan: PIC berupa peran tak pernah muncul
`myCollabTasks()` mencocokkan PIC dengan `same(s.pic, me)`. Sejak PIC boleh berupa peran
(`@Magang`, 1.67.0), proses **milik bersama tidak pernah muncul** di daftar task anggotanya —
mereka hanya bisa menemukannya lewat tab Task Kolaborasi.

Pencocokannya kini lewat `stepBelongsTo()` yang memahami PIC peran, dan `stepIsMine()`
menjadi turunannya supaya satu aturan dipakai bersama. Terverifikasi: anak magang yang
sebelumnya mendapat **0** baris kini mendapat proses milik bersamanya.

Pseudo-task collab juga kini membawa **stage** dan **link hasil** prosesnya, jadi kolom Stage
di Task List tidak lagi kosong untuk baris kolaborasi.

---

## 1.75.0 — Export CSV ikut memuat Task Kolaborasi

Tombol **CSV** di Task List dulu hanya mengekspor task biasa, jadi seluruh pekerjaan di Task
Kolaborasi tak pernah ikut terunduh. Sekarang keduanya masuk ke satu berkas.

### Satu baris per PROSES, bukan per kartu
Unit kerja yang sebenarnya adalah **prosesnya** — punya PIC, deadline, status, catatan, dan
link hasilnya sendiri. Mengekspor per-kartu justru menyembunyikan siapa mengerjakan apa.

Kolom baru **Sumber** membedakan `Task` dari `Kolaborasi`, dan kolomnya dipetakan ke kolom
task yang setara supaya satu berkas bisa dibaca sekaligus:

| Kolom | Isi untuk baris Kolaborasi |
|---|---|
| Task ID | `COL-009#11` |
| Task Name | `PCPM Tahap I — QC Ali` |
| Due Date | deadline proses, atau deadline project bila prosesnya tak punya |
| Status | `Done` / `Belum` |
| Document / Link | link hasil proses |
| PIC Notes | catatan proses |
| PM Notes | deskripsi kolaborasi |

Ditambahkan juga **Diselesaikan Oleh** dan **Diselesaikan Pada** — untuk baris task diisi
dari jejak pengubah status (1.67.0), untuk baris kolaborasi dari pencentang prosesnya.

### Filter Task List ikut dihormati
Filter yang punya padanan diterapkan juga ke baris kolaborasi: **PIC** (termasuk PIC berupa
peran seperti `@Magang`), **Stage**, **Platform**, **Status**, dan **rentang Due Date**.
Filter tanpa padanan — mis. **Priority**, yang memang tidak ada pada proses — sengaja
diabaikan daripada dipaksakan.

Cakupannya **sama persis dengan yang sudah terlihat di tab Task Kolaborasi** — tidak lebih
ketat, tidak lebih longgar. Percobaan pertama saya justru lebih ketat (hanya collab tempat
orang itu ikut serta); itu tak cocok dengan tampilan aplikasi, jadi dikembalikan.

Setelah mengunduh, muncul keterangan jumlahnya: *"6 task + 26 proses kolaborasi diunduh."*

---

## 1.74.1 — QC: task dihapus meninggalkan ceklis & chat yang diwarisi task baru

Audit menyeluruh terhadap kelas bug yang sama dengan sub-ceklis kolaborasi: **data yang
dikunci ke ID turunan yang bisa dipakai ulang**. Satu kasus lagi ditemukan, kali ini lebih
berdampak karena mengenai task biasa.

### Yang rusak
`deleteTask` hanya menghapus barisnya di sheet **Main**. Ceklis, komentar, notifikasi, dan
riwayat aktivitasnya ditinggalkan — sementara `generateTaskId` = nomor tertinggi + 1, jadi
menghapus task bernomor tertinggi membuat task **berikutnya memakai ulang nomor itu** dan
langsung mewarisi semuanya.

Terlihat gamblang saat diprobe: task baru dibuat, diberi 1 ceklis + 1 komentar, lalu dihapus —
sisanya **1 ceklis dan 3 komentar** (dua di antaranya sudah warisan dari task sebelumnya yang
juga pernah memakai nomor itu). Task berikutnya mewarisi seluruhnya.

### Perbaikannya
`deleteTask` kini membuang semua baris yang merujuk task tersebut di `CHECKLIST`,
`COMMENTS`, `NOTIFICATIONS`, dan `ACTIVITY` — memakai ulang helper pembersih yang sudah
dipakai `deleteCollab` (namanya dinetralkan jadi `purgeRowsForRef` karena kini melayani
keduanya). Jejak penghapusannya sendiri dicatat **tanpa Task ID** agar tidak nyangkut di task
bernomor sama; log global tetap lengkap.

### Yang diperiksa dan ternyata SEHAT
- **Susun ulang proses kolaborasi** — sub-ceklis, catatan, dan link hasil semuanya ikut
  berpindah bersama prosesnya; posisi yang ditinggalkan tidak mewarisi milik orang lain.
  (Ditambahkan tes khusus untuk catatan & link, sebelumnya hanya sub-ceklis yang diuji.)
- **Menyisipkan proses baru di atas / di tengah** — kasus yang berbeda dari sekadar menukar
  urutan, karena SEMUA proses di bawahnya bergeser turun. Diuji terpisah: proses baru mulai
  benar-benar kosong, sementara sub-ceklis, catatan, dan link tiap proses lama ikut turun
  mengikuti posisinya. Diperiksa sampai ke UI: menambah proses lalu menaikkannya — baik lewat
  tombol panah maupun seret — mengirim `srcOrder: 0` untuk yang baru dan mempertahankan
  asal-usul yang lama, persis yang dibutuhkan pemetaan ulang di server.
- **Hapus proses / hapus collab** — sudah membersihkan sejak 1.69.x.
- **Hapus user** — rujukan diperbarui/dibersihkan sejak 1.67.0.
- **Operasi berbasis nomor baris** pada ceklis, Link Saya, dan Catatan Saya — semuanya
  memverifikasi kepemilikan baris sebelum menulis atau menghapus.
- `deleteChecklistItem`, `deleteUserLink`, `deleteNote`, `deleteDashboard` memang hanya
  menghapus barisnya sendiri — benar, karena tak ada data lain yang merujuknya.

### Dua catatan yang TIDAK diperbaiki (sengaja)
1. **Nomor baris usang saat dua orang menyunting ceklis task yang sama.** Server memastikan
   baris itu milik task yang benar, tapi belum memastikan itu *item* yang sama. Bila rekan
   menghapus satu item sementara layar Anda belum disegarkan, centang bisa mengenai item
   tetangganya. Perlu penambahan verifikasi teks item pada tiga aksi — dampaknya sempit
   (butuh penyuntingan bersamaan) dan tidak permanen, jadi saya laporkan dulu, bukan
   diam-diam diubah.
2. **Nama user dipakai sebagai kunci.** Menghapus user lalu menambah orang baru dengan nama
   persis sama membuat task, link, dan catatan lama menempel padanya. Itu konsekuensi wajar
   dari sistem berbasis nama, bukan cacat — tapi layak diingat saat mengganti angkatan magang.

---

## 1.74.0 — Lampiran link di Ceklis Pengerjaan task

Lampiran hasil yang di 1.73.0 baru ada di Task Kolaborasi kini tersedia juga di **Ceklis
Pengerjaan** pada modal Edit Task — memakai aksi backend yang sama, jadi tak ada jalur baru
yang perlu dijaga terpisah.

- Kolom **"link (ops.)"** di samping input "Tambah langkah / output yang diharapkan…" —
  langsung terlampir saat item dibuat.
- Tombol 🔗 di tiap item untuk memasang, mengubah, atau mencabut belakangan.
- Item yang punya lampiran menampilkan ikon tautan siap-klik (tab baru).

Tetap **opsional**: item tanpa link berfungsi persis seperti sebelumnya.

### Yang ikut dijaga
- **Task baru** (belum punya ID) menampung linknya dulu bersama itemnya, lalu mengirimnya
  setelah task tersimpan — sama seperti perlakuan item ceklisnya sendiri. Tombol 🔗 sengaja
  baru muncul setelah task tersimpan, karena barisnya belum ada di sheet.
- **Duplikat task** ikut membawa lampiran tiap item.
- **Mencentang tidak menghapus lampiran** — diuji terpisah untuk ceklis task, bukan hanya
  sub-ceklis kolaborasi.

---

## 1.73.1 — Perbaikan: PIC tak punya tombol simpan untuk prosesnya sendiri

Link hasil per **proses** yang ditambahkan di 1.73.0 hanya bisa diisi lewat mode **Edit** —
dan Edit khusus Manager/Leader. Akibatnya orang yang benar-benar mengerjakan prosesnya tidak
punya cara menautkan hasilnya; di layarnya bahkan tak ada tombol **Simpan** sama sekali.

Sekarang panel tiap proses punya kolom **Link Hasil (opsional)** dengan tombol **Simpan
link**-nya sendiri, persis pola *Catatan Proses / Simpan catatan* yang sudah ada. Izinnya pun
disamakan: **PIC proses itu** atau manager. Proses milik orang lain tetap terlihat, tapi
kolomnya terkunci.

Menyusun ulang, mengganti nama, PIC, deadline, dan stage proses **tetap khusus Manager/Leader** —
yang dibuka hanya menautkan hasil pekerjaan sendiri.

### Satu pintu, supaya tidak saling menimpa
Kolom link di editor proses (mode Edit) **dicabut**, jadi panel proses adalah satu-satunya
tempat mengisinya. Kalau dibiarkan ada di dua tempat, manager yang menekan Simpan dengan
tampilan lama akan menimpa link yang baru saja diisi PIC-nya — persis kelas bug yang sama
dengan catatan proses dulu.

Sebagai pengaman keduanya, `saveCollab` kini **mempertahankan link lama** bila payload-nya
tidak menyebut link sama sekali (perlakuan yang sama seperti catatan). Diuji: manager
menyimpan collab tanpa menyebut link, link PIC-nya tetap utuh.

---

## 1.73.0 — Tautan: kolom Dokumen jadi link + lampiran hasil di proses & sub-ceklis

### Kolom Dokumen langsung jadi tautan
Isi kolom **Dokumen** dulu hanya teks. Sekarang begitu isinya alamat web, muncul tautan
siap-klik di bawah input — **tanpa perlu menyimpan dulu** — dan ikon tautan kecil ikut
tampil di baris Task List, jadi bisa dibuka tanpa membuka modal. Semua tautan terbuka di
**tab baru** dengan `rel="noopener noreferrer"`.

Pendeteksinya sengaja konservatif: `https://…`, `www.…`, dan `domain/path` dijadikan
tautan; teks biasa seperti *"draft di meja PM"* tetap tampil apa adanya. Skema berbahaya
(`javascript:`, `data:`) **tidak pernah** lolos — diuji langsung.

### Lampiran hasil di Proses Beruntun & sub-ceklis
Dua tempat baru untuk menautkan hasil pengerjaan, keduanya **opsional**:

- **Proses** — kolom *"Link hasil (ops.)"* di baris editor proses, di samping deadline.
  Tersimpan di `COLLAB_STEPS` kolom **K**.
- **Sub-ceklis** — kolom link kecil di sebelah input "Tambah sub-item", plus tombol 🔗 di
  tiap baris untuk memasang/mengubah/mencabut belakangan. Tersimpan di `CHECKLIST`
  kolom **G**.

Yang sudah punya lampiran menampilkan ikon tautan siap-klik. Mengosongkan isian = lampiran
dicabut, jadi satu tombol menangani ketiga aksi.

Dua hal yang dijaga dan diuji: **mencentang tidak menghapus lampiran** (kolom link tak ikut
ditulis saat centang), dan **menyalin sub-ceklis ke proses lain ikut membawa lampirannya**.

Kolom baru ditambahkan otomatis saat sheet pertama kali diakses; baris lama terbaca kosong.

---

## 1.72.0 — "Done" task magang: hanya pendampingnya + tab Kerjaan Magang dicabut

### Aturannya diikat ke hubungan Support, bukan ke peran
Sebelumnya **Staff mana pun** boleh menutup task yang PIC-nya anak magang, walau tak terlibat
sama sekali. Sekarang hanya karyawan yang **terdaftar sebagai Support** di task itu:

| Task | Ali (Staff) | Uma (Staff) | Wildan (Magang) | Manager |
|---|---|---|---|---|
| PIC Wildan · Support **Ali** | **✓ Done** | ✗ | ✗ | ✓ |
| PIC Wildan · Support **Uma** | ✗ | **✓ Done** | ✗ | ✓ |
| PIC **Ali** · Support Wildan | ✗ (maks Review PM) | ✗ | ✗ | ✓ |
| PIC **@Magang** · Support Ali | **✓ Done** | ✗ | ✗ | ✓ |

Task milik sendiri tetap **maksimal Review PM** — termasuk bila anak magang jadi Support di
situ. Task tetap muncul di daftar siapa pun yang jadi Support, seperti biasa.

Ditegakkan di **kedua backend** (`canApproveDone` kini menerima daftar Support task) dan di
tampilan, bukan hanya menyembunyikan tombol.

### Tab "Kerjaan Magang" dicabut
Tab itu lahir dari salah tafsir saya: yang diminta adalah aturan **siapa yang boleh
mem-Done-kan**, bukan halaman terpisah. Ia juga bertabrakan dengan 1.70.0 — memperlihatkan
seluruh kerjaan magang kepada Staff yang tidak terlibat, padahal aturannya kini "hanya task
milik sendiri". Nav, halaman, dan fungsinya dihapus tanpa sisa; Manager & Leader tetap
melihat semua task magang lewat tampilan biasa.

---

## 1.71.0 — Mode Dev: "Lihat sebagai" jadi pratinjau sungguhan

**Fokus PIC** di mode Dev dulu hanya **menyaring daftar task**. Hak, tab, tombol, dan
lencana tetap milik Dev — jadi yang terlihat bukan layar user itu, melainkan layar Dev
dengan daftar yang dipersempit. Sekarang seluruh tampilan dirender **sebagai orang itu**.

Terukur pada satu skenario yang sama:

| | Dev | Lihat sebagai Wildan (Magang) |
|---|---|---|
| Task terlihat | 5 | **3** (miliknya + bersama + tempat ia Support) |
| Panel Kelola User | ada | **tidak ada** |
| Boleh set Done | ya | **tidak** |
| `isDev()` | true | **false** |

### Dua pengertian "Dev" yang harus dipisah
`isDev()` dulu membaca `state.currentUser`, jadi berpindah identitas untuk pratinjau akan
mencabut hak Dev — dan Anda **terkunci di dalam pratinjau**. Kini dipisah: `isDevReal()`
untuk identitas asli (masuk/keluar pratinjau), `isDev()` untuk hak yang **berlaku** — false
selama pratinjau, supaya panel dan tombol khusus Dev ikut tersembunyi. Itulah yang membuat
tampilannya benar-benar sama.

### Pratinjau tidak boleh berubah jadi tindakan
Tombol sengaja **tetap tampil** agar tampilannya jujur, tapi setiap aksi tulis dicegat di
satu pintu yang membungkus **kedua jalur** (Apps Script native & API Vercel) — bukan
disembunyikan per tombol. Tanpa ini, Dev bisa tak sengaja mencentang atau menutup task
**atas nama** orang yang sedang ia intip. Aksi baca tetap berjalan normal.

Spanduk kuning **"Melihat sebagai … — Kembali jadi Dev"** ditaruh di bawah header, terpisah
dari sidebar: saat menyamar jadi Staff/Magang, kotak Fokus PIC ikut tersembunyi, jadi tombol
keluarnya harus punya rumah sendiri. Berpindah identitas lewat Mode User juga otomatis
mengakhiri pratinjau.

Untuk **Manager**, Fokus PIC tetap berarti menyaring papan seperti sebelumnya.

> **Catatan jujur:** ini pratinjau **tampilan**, bukan sekat keamanan. Data mentahnya tetap
> ada di browser karena Dev memang berhak menerimanya; yang dirender ulang adalah cakupan
> dan hak. Untuk menguji pemangkasan di sisi server, pakai PIN-nya langsung (mis. `MAGANG_PIN`).

---

## 1.70.0 — Magang hanya melihat task miliknya sendiri

Sejak 1.57.0 anak magang saling melihat task sesama magang. Dalam pemakaian nyata itu
menyesatkan: memberi satu task ke Wildan membuat task yang sama ikut muncul di layar tiga
anak magang lain, seolah mereka juga mengerjakannya.

Sekarang aturannya **sama dengan karyawan**: yang muncul hanya task tempat ia menjadi **PIC
atau Support**. Cabang khusus magang di `scopedTasks()` dihapus — semua peran memakai
penyaring kepemilikan yang sama.

**Task ber-PIC peran (`@Magang`) tetap milik bersama** dan terlihat oleh semua anak magang —
itu memang gunanya, dan tetap jadi cara memberi satu pekerjaan ke seluruh anak magang
sekaligus. Yang berubah hanya task yang PIC-nya satu orang.

Ditegakkan di server juga (`magangVisibleTask` kini murni berbasis kepemilikan), bukan cuma
disaring di tampilan. Efek sampingnya: selama identitas magang belum dipilih (cookie masih
kosong), tak ada task yang dikirim sama sekali — daftar nama untuk memilih identitas tetap
dikirim, jadi alurnya tidak buntu.

---

## 1.69.1 — Perbaikan: chat & aktivitas collab lama menempel ke collab baru

Menghapus Task Kolaborasi lalu membuat yang baru membuat **komentar collab lama muncul di
collab baru**. Akar sebabnya sama dengan sub-ceklis di 1.69.0: nomor collab **dipakai ulang**
(`genCollabId` = max + 1), sementara `deleteCollab` hanya membuang baris `COLLAB` dan
`COLLAB_STEPS`. Komentar, notifikasi, dan riwayat aktivitas yang memakai id itu sebagai kunci
ditinggalkan — lalu diadopsi collab berikutnya yang kebetulan bernomor sama.

Sekarang `deleteCollab` membuang semua baris yang merujuk collab tersebut — `COMMENTS`,
`NOTIFICATIONS`, dan `ACTIVITY`, termasuk yang berkunci proses (`COL-016#2`).

Jejak penghapusannya sendiri dicatat **tanpa Task ID** (nomornya dipindah ke kolom detail),
supaya baris *"Collab Delete"* tidak ikut nyangkut di feed collab bernomor sama. Log global
tetap mencatatnya lengkap.

> **Membersihkan data yang sudah terlanjur:** perbaikan ini mencegah kejadian berikutnya,
> tapi sisa percakapan yang sudah menempel tidak hilang sendiri. Cara termudah: **hapus**
> collab yang tercemar itu sekali lagi setelah versi ini terpasang — penghapusannya kini ikut
> menyapu semua sisa dengan nomor tersebut — lalu buat ulang.

---

## 1.69.0 — PIC peran juga berlaku di Task Kolaborasi

Grup **"Milik bersama (satu peran)"** kini ada juga di dropdown PIC tiap **proses** pada Task
Kolaborasi. Memilih *Semua Magang* membuat proses itu dikerjakan bersama semua anak magang.

Bukan hanya dropdown-nya — yang ikut paham:
- **Izin mencentang** (`canCheckStep` di kedua backend): siapa pun berperan itu boleh; peran
  lain ditolak. Manager tetap boleh **membatalkan** centang, tapi tidak mencentangnya.
- **Penanda "Giliran Anda"**: kini memakai `stepIsMine()`, jadi proses milik bersama muncul
  sebagai giliran bagi semua yang berperan itu.
- **Tampilan**: `@Magang` dibaca sebagai **"Semua Magang"** di kartu, baris proses, dan panel
  salin sub-ceklis — bukan token mentah.

### Bug lama yang ikut ketahuan
Tes fitur ini gagal dengan pesan janggal *"Selesaikan dulu semua sub-ceklis proses ini
(0/1)"* pada proses yang baru dibuat. Sebabnya: `deleteCollab` membuang baris `COLLAB` dan
`COLLAB_STEPS`, **tapi tidak sub-ceklisnya**. Karena nomor collab dipakai ulang
(`genCollabId` = max + 1), menghapus collab bernomor tertinggi membuat collab **berikutnya**
mewarisi sub-ceklis milik pendahulunya — terkunci oleh ceklis yang tak pernah ia buat.

Sekarang `deleteCollab` ikut membuang sub-ceklis collab tersebut. Ini bug lama yang tidak
berhubungan dengan fitur PIC peran; ia kebetulan tersingkap karena tesnya membuat lalu
menghapus collab berkali-kali.

---

## 1.68.0 — Stage jadi opsional (jatuh ke "Umum")

Stage sebelumnya **wajib** — menyimpan tanpa memilihnya ditolak dengan *"Pilih Stage dulu."*
Padahal tidak semua task punya tahapan khusus. Sekarang boleh dikosongkan: pilihan
teratasnya berbunyi **"(Umum — tanpa stage khusus)"**, dan saat disimpan task itu masuk
stage **"Umum"**.

Disimpan sebagai `"Umum"`, bukan sel kosong, supaya task tersebut tetap punya rumah di
laporan, filter, dan pengelompokan per stage — sel kosong hanya menghasilkan kelompok tanpa
nama yang membingungkan. `"Umum"` juga selalu tersedia di daftar pilihan, jadi bisa dipilih
sengaja dan task lama yang sudah memakainya tidak kehilangan pilihannya saat disunting.

Aturan lain tidak berubah: bila stage yang dipilih **punya daftar kata kerja**, kata kerjanya
tetap wajib — rumus nama task masih utuh.

---

## 1.67.0 — PIC boleh berupa PERAN (task milik bersama) + ganti nama user

### Task milik bersama satu peran
Dropdown PIC kini punya grup teratas **"Milik bersama (satu peran)"**: *Semua Magang
(2 orang)*, *Semua Staff (6 orang)*, dan seterusnya. Memilihnya membuat **satu task** yang
dimiliki bersama semua orang berperan itu — muncul di daftar mereka, bisa mereka kerjakan,
dan mengikuti aturan peran tersebut (mis. task `@Magang` boleh ditutup Staff, tidak boleh
ditutup anak magang itu sendiri).

Disimpan sebagai `@Magang` di kolom PIC. Awalan `@` dipakai supaya tidak pernah bentrok
dengan orang yang kebetulan bernama "Magang", dan tetap terbaca jelas saat sheet dibuka
manual. `Dev` dan `Lihat Saja` tidak bisa jadi PIC bersama, dan peran tanpa anggota tidak
ditawarkan. **Support tetap perorangan** — yang dibagikan hanya tanggung jawab utamanya.

### Jejak siapa yang mengubah status
Karena satu status kini dipakai beramai-ramai, tanpa jejak tidak ada cara tahu siapa yang
menggerakkannya. Kolom baru **`Status By`** (Main kolom **W**) mencatat *"Nama • tanggal
jam"* setiap kali status berubah, dan ditampilkan di bawah pilihan Status pada modal task.

Yang dicatat hanya **perubahan status** — menyunting judul, prioritas, atau deadline tidak
ikut mengubah keterangan itu. Berlaku untuk semua task, bukan hanya yang milik bersama.

### Ganti nama user
Tombol pensil di **Kelola User** untuk membetulkan salah ketik. Nama dipakai sebagai
**kunci** di banyak tempat, jadi mengganti baris `USERS` saja akan membuat task, proses
kolaborasi, link, catatan, dan PIN orang itu jadi yatim. Karena itu semua rujukan ikut
diperbarui dalam satu operasi — PIC & Support di task, PIC proses kolaborasi, `LINKS`,
`NOTES`, `AUTH`, `NOTIFICATIONS`, serta dropdown PIC & Support — lalu jumlah yang tersentuh
dilaporkan balik ("*12 rujukan ikut diperbarui*").

Hanya **Dev**. Nama kosong, sama persis, `"Dev"`, dan bentrok dengan user lain ditolak.
Bila yang diganti adalah identitas yang sedang dipakai, identitas itu ikut berpindah supaya
tidak menjadi user hantu.

---

## 1.66.0 — Dropdown PIC & Support dikelompokkan per peran

Saat memberi task, dropdown PIC hanya berisi nama tanpa keterangan apa pun — tidak ada cara
tahu seseorang itu anak magang atau karyawan tetap, padahal aturan **Done** dan
visibilitas task keduanya berbeda. Sekarang nama dikelompokkan dengan `<optgroup>`:

```
Manager      → Nynda (PM)
Leader       → Dhea, Alya
Staff        → Ali, Uma, Andika, Kiki, Bilar, Arifah
Magang       → Wildan, Nadia
Belum diatur → (nama yang belum diberi peran)
```

Urutan grup mengikuti daftar `ROLES` aplikasi, sama seperti tabel Kelola User. Nama yang
belum berperan dikumpulkan di grup terakhir supaya kelihatan dan bisa segera diatur Dev.

Berlaku di **PIC task**, **Support**, dan **PIC proses** pada Task Kolaborasi. Bila sheet
`USERS` belum diisi, dropdown kembali ke daftar datar seperti semula — bukan error.

### Catatan soal visibilitas task magang
Anak magang memang **saling melihat task sesama magang** — itu rancangan sejak 1.57.0,
bukan kebocoran: `scopedTasks()` memberi mereka task sendiri **atau** task milik magang mana
pun, dan server (`magangVisibleTask`) menyetujuinya. Yang tidak mereka lihat adalah task
karyawan, kecuali task tempat mereka sendiri menjadi Support.

---

## 1.65.0 — Tag per peran: @manager, @leader, @staff, @magang

Selain `@Nama` dan `@everyone`, komentar kini bisa men-tag **satu peran sekaligus**.
`@staff` menotifikasi semua user aktif berperan Staff, `@magang` semua anak magang, dan
seterusnya. Berguna saat pengumuman hanya relevan untuk sebagian tim.

- **Nama selalu menang atas peran.** `@Staff Soal` hanya mengenai orangnya; `@staff` saja
  yang berarti perannya. Pencocokan memakai nama terpanjang lebih dulu.
- **`Dev` dan `Lihat Saja` sengaja bukan tag peran** — yang pertama akun teknis, yang kedua
  tamu baca-saja.
- **Peran tanpa anggota tidak ditawarkan** di daftar saran `@`. Menawarkan `@magang` saat
  belum ada anak magang hanya memancing tag yang tak mengenai siapa pun.
- Daftar saran menampilkan jumlah orangnya (*"staff — 6 orang berperan ini"*), dan tag peran
  disorot warna berbeda (teal) dari tag nama (indigo) supaya jelas ini mengenai banyak orang.
- Penulis tidak pernah menotifikasi dirinya sendiri.

### Dua perbaikan yang ikut terbawa

**Parser mention Vercel disamakan dengan Apps Script.** Sisi Vercel masih memakai regex lama
yang tidak mengenal nama ber-spasi — `@Staff Data` bisa salah sasaran ke `Staff Soal`. Kini
memakai pemindaian nama-terpanjang-dulu yang sama.

**Nama diambil dari dropdown PIC + baris `USERS`, bukan PIC saja.** Ketahuan lewat tes: nama
yang belum masuk dropdown gagal dicocokkan lalu **jatuh ke tag peran** — `@Magang A` berubah
jadi `@magang` dan menotifikasi seluruh anak magang. Sekarang nama selalu menang.

> **Perubahan perilaku:** `@Staff` dulu tidak mengenai siapa pun (dianggap ambigu antara
> "Staff Soal"/"Staff Data"/"Staff QC"). Sekarang itu tag peran. Hanya berdampak bila ada
> user yang namanya persis sama dengan nama peran.

---

## 1.64.2 — Perbaikan: isian proses hilang sebelum sempat disimpan

Dua bug terpisah membuat perubahan di Task Kolaborasi lenyap. Keduanya bekerja diam-diam:
tidak ada pesan error, isian hanya kembali seperti semula.

### 1. "Selesai edit" membuang semua isian
`collabToggleEdit()` keluar dari mode Edit **tanpa membaca isian** lebih dulu. Sesudah itu
`saveCollabFromModal()` menganggap tidak ada perubahan proses dan mengirim data lama dari
server. Jadi alur yang wajar — isi stage → klik "Selesai edit" → klik "Simpan" — membuang
seluruh isian. Yang terlihat oleh pengguna: stage yang baru diatur "kereset sendiri".

Sekarang keluar mode Edit **membaca isian dulu** dan menandainya belum-tersimpan. Selama
tanda itu aktif, daftar proses menampilkan rancangan tersebut (bukan data lama) beserta
spanduk kuning *"Perubahan proses belum disimpan — klik Simpan"*. Centang dan sub-ceklis
pada baris rancangan dimatikan sementara, karena nomor urutnya belum pasti sampai disimpan.

### 2. Menyimpan dari mode baca menghapus semua stage
Saat menyimpan tanpa masuk mode Edit (mis. cuma mengganti judul), proses dipetakan ulang
dari data server — tapi pemetaannya **tidak menyertakan `stage`**. Akibatnya setiap kali ada
yang menyimpan perubahan kecil, seluruh stage proses terhapus. Bug ini terbawa sejak stage
dipindah ke level proses di 1.63.0.

Tanda belum-tersimpan direset saat modal dibuka, ditutup, dan setelah penyimpanan berhasil.

---

## 1.64.1 — Pemilih identitas: susunan kartu jadi seimbang

Grid pemilih identitas dipatok `sm:grid-cols-3`, jadi **4 nama tampil 3+1** — terlihat
pincang. Sekarang jumlah kolomnya menyesuaikan banyaknya pilihan supaya baris terakhir
sepenuh mungkin:

| Nama | Kolom | Susunan |
|---|---|---|
| 1–3 | sebanyak namanya | 1 baris |
| **4** | **2** | **2+2** |
| 5 | 3 | 3+2 |
| 6 | 3 | 3+3 |
| 7 | 4 | 4+3 |
| 8 | 4 | 4+4 |

Di layar sempit (<640 px) dibatasi 2 kolom supaya kartunya tidak terhimpit.

Jumlah kolom dipasang sebagai **inline style**, bukan class Tailwind yang dirangkai saat
berjalan — class semacam itu tidak ikut ter-generate pada build tanpa CDN (versi Apps
Script), jadi susunannya akan gagal diam-diam di sana.

Berlaku juga untuk pemilih identitas karyawan, bukan hanya magang.

---

## 1.64.0 — Perbaikan: sub-ceklis tidak ikut saat proses disusun ulang

Menyusun ulang proses di Task Kolaborasi membuat **sub-ceklisnya tertinggal** dan menempel
ke proses yang salah. Ini merusak data, bukan sekadar tampilan.

### Sebabnya
Sub-ceklis disimpan di sheet `CHECKLIST` dengan kunci **`COL-xxx#<urutan>`**, sedangkan
urutan proses **dihitung ulang** tiap kali disimpan (`order = i + 1`). Status centang,
pencentang, tanggal, dan catatan sudah ikut berpindah lewat `srcOrder` — tapi baris
`CHECKLIST` tidak pernah dipetakan ulang. Jadi memindahkan proses C ke posisi 1 membuat
sub-ceklis milik A yang muncul di sana.

### Perbaikannya
`saveCollab` kini memetakan ulang kunci sub-ceklis mengikuti perpindahan prosesnya. Semua
nilai baru dihitung dari nilai **lama** sebelum satu pun ditulis, jadi pertukaran urutan
(mis. 2 ↔ 3) tidak saling menimpa.

Proses yang **dihapus**: sub-ceklisnya ikut dibuang. Kalau dibiarkan menggantung, proses
baru yang kebetulan menempati nomor itu akan mewarisi sub-ceklis milik orang lain — persis
kelas bug yang sama, hanya muncul belakangan.

Berlaku di kedua backend (`api/_sheets.js` dan `gas/Code.gs`), dengan tes yang lebih dulu
memperlihatkan bug-nya sebelum diperbaiki.

> **Perlu dicek:** kalau Anda sudah pernah menyusun ulang proses sebelum versi ini, sebagian
> sub-ceklis mungkin sudah menempel di proses yang keliru. Perbaikan ini mencegah kejadian
> berikutnya, tapi tidak bisa menebak pasangan yang benar dari data yang sudah tertukar —
> silakan periksa kolaborasi yang pernah diurutkan ulang.

---

## 1.63.2 — Modal Task Kolaborasi diperlebar + teks panjang tak lagi terpotong

Modal "Kelola Task Kolaborasi" memuat dua panel sekaligus — form & Proses Beruntun di kiri,
Komentar & Aktivitas di kanan — jadi `max-w-5xl` (1024 px) terlalu sempit. Sekarang
**1600 px**: panel kiri 960 px, panel kanan 640 px (dari 1024 → naik 576 px).

Selain lebar, ada sebab kedua yang membuat isi "tidak terlihat": gelembung komentar di panel
ini memakai `inline-block` **tanpa** pematah kata, sehingga teks panjang tanpa spasi (mis.
tautan Google Drive) terpotong begitu saja — berbeda dari gelembung chat di Komunikasi yang
sudah punya `break-words`. Ditambahkan `whitespace-pre-wrap`, `break-words`, dan
`overflow-wrap: anywhere`, jadi URL panjang membungkus rapi dan terbaca sampai akhir.

---

## 1.63.1 — Urutan Kanban: "Revisi" sebelum "Review PM"

Kolom Kanban kini berurutan **Todo → In progress → Revisi → Review PM → Done → Hold**,
mengikuti alur kerja sebenarnya: hasil revisi dikembalikan dulu, baru naik ke review PM.

Urutan itu ternyata ditulis **terpisah di tiga tempat** — kolom Kanban, tombol pindah-status
pada mode "Pilih Banyak", dan legenda warna Timeline/Calendar — dan sudah mulai melenceng
(`Done`/`Hold` tertukar di daftar tombol). Ketiganya sekarang memakai satu konstanta
`STATUS_ORDER` lewat `statusRank()`, jadi tidak bisa lagi berbeda satu sama lain. Status di
luar daftar tetap jatuh ke paling kanan.

Urutannya diatur di kode, bukan dari urutan baris sheet `OPTIONS` — menambah atau menyusun
ulang opsi status di spreadsheet tidak akan mengacaukannya.

---

## 1.63.0 — Stage pindah ke tiap proses + menu samping bisa disembunyikan

### Stage melekat pada PROSES, bukan pada kartunya
Di 1.62.0 stage salah tempat: ada satu di kepala kartu. Sekarang **tiap proses di "Proses
Beruntun" punya stage-nya sendiri** — satu kolaborasi bisa memuat proses ber-stage berbeda
(mis. proses 1 *Input Soal*, proses 8 *QC Konten*), dan sebagian boleh tanpa stage.

Pemilihnya ada di baris proses saat mode **Edit**, di antara PIC dan deadline. Di mode baca,
stage tampil sebagai lencana biru di sebelah nama PIC. Pilihan **(tanpa stage)** selalu
tersedia, memakai daftar stage yang sama dengan task biasa. Stage lama yang sudah tak ada
di dropdown tetap ditawarkan supaya tidak terhapus diam-diam saat disimpan ulang.

Kolom `Stage` kini di sheet **`COLLAB_STEPS` kolom J** (bukan lagi `COLLAB`). Baris lama
tanpa kolom itu tetap terbaca sebagai kosong. Stage di level kartu dicabut seluruhnya —
dua tempat untuk hal yang sama hanya membingungkan.

### Menu samping bisa disembunyikan
Tombol baru di kiri judul halaman menyembunyikan menu samping supaya area task jauh lebih
lebar — terukur **1180 → 1440 px pada layar 1440** (bertambah 260 px). Paling terasa di
Kanban dan Task List. Pilihannya diingat, jadi tak perlu diulang tiap buka.

Sidebar disembunyikan lewat class, bukan dihapus dari DOM, supaya semua tombol nav, badge
notifikasi, dan kotak Mode User di dalamnya tetap hidup. Grafik digambar ulang setelah
lebarnya berubah karena Chart.js & Gantt mengukur lebar induknya saat dibuat.

---

## 1.62.1 — Perbaikan: tanggal centang tidak muncul di Vercel

Tanggal centang yang ditambahkan di 1.62.0 tidak pernah tampil di produksi. Penyebabnya
bukan di penampilnya, tapi di pembacaan data.

Stempel waktu **ditulis** sebagai teks (`"2026-08-07 10:00:00"`), tapi Sheets menerimanya
dengan `valueInputOption: USER_ENTERED` sehingga dikenali sebagai **nilai tanggal**. Saat
dibaca lagi dengan `UNFORMATTED_VALUE` + `SERIAL_NUMBER`, yang kembali adalah **angka
serial** (`46241.4166…`), bukan teks yang tadi ditulis. `api/_sheets.js` membacanya mentah
lewat `String(r[7])`, jadi nilainya bukan tanggal — penampilnya menolak dan hasilnya kosong.
Nama pencentang tetap muncul karena itu memang teks biasa.

Sisi Apps Script sudah benar sejak dulu (`stampStr_`); yang tertinggal hanya sisi Vercel.
Ditambahkan `stampStr()` sebagai padanannya, dipasang pada **lima** pembacaan yang bernasib
sama: `doneAt` proses, `checkedAt` ceklis, `createdAt` kolaborasi, `createdAt` notifikasi,
dan `updatedAt` catatan. Komentar & log aktivitas sudah aman karena memakai `formatDate()`.

**Kenapa tes tidak menangkapnya:** spreadsheet tiruan di tes menyimpan apa adanya, tidak
meniru pemaksaan tipe Sheets, jadi seluruh jalur ini terlihat sehat. Ditambahkan tes yang
menyuntikkan angka serial langsung ke sheet dan menuntut hasil bacanya berupa tanggal
terbaca — kelas bug ini tidak akan lolos lagi.

---

## 1.62.0 — Tanggal centang, stage opsional, & Manager boleh membatalkan centang

### Tanggal centang, bukan cuma deadline
Baris proses dulu hanya memuat deadline, jadi tak ada cara tahu sebuah proses selesai
lebih cepat atau lewat tenggat. Sekarang tanggal pencentangan ikut tampil dengan
putusannya: **✔ 2026-08-04 (tepat waktu)** hijau, atau **✔ 2026-08-07 (telat)** merah.
Tanpa deadline, tanggalnya tetap ditampilkan tanpa putusan.

Datanya (`doneAt`) sebenarnya **sudah lama tersimpan** — hanya tidak pernah ditampilkan.
Begitu pula permintaan "uncheck lalu centang lagi harus memperbarui tanggal": itu memang
sudah berlaku sejak dulu (`setCollabStepDone` menulis `nowStamp()` tiap kali dicentang dan
mengosongkannya saat dibatalkan), cuma tak terlihat.

### Penanggalan ulang saat sub-ceklis tuntas
Proses bersub-ceklis baru benar-benar rampung ketika sub-ceklisnya tuntas. Jadi bila
sub-item **ditambahkan setelah** prosesnya dicentang (sub jadi 5/6), lalu item terakhir itu
dicentang, tanggal selesai prosesnya ikut diperbarui — tanpa perlu buka-tutup centang utama.
Hanya berlaku untuk proses yang **sudah** dicentang; yang belum tetap butuh tindakan PIC-nya,
karena mencentang adalah klaim bahwa pekerjaan selesai.

### Manager boleh membatalkan centang
Mencentang = mengklaim pekerjaan selesai → tetap khusus PIC proses (+ Dev). **Membatalkan**
centang adalah koreksi, bukan klaim — jadi Manager boleh, supaya salah centang tidak
menyandera proses berikutnya sampai orangnya sempat membetulkan sendiri. Leader dan Staff
lain tetap tidak bisa. Ditegakkan di server, bukan cuma disembunyikan tombolnya.

### Stage opsional di Task Kolaborasi
Kolom **Stage** baru di sheet `COLLAB` (kolom J), memakai daftar stage yang sama dengan task
biasa plus pilihan **(Tanpa stage)**. Boleh dikosongkan. Tampil sebagai lencana biru di
kartu, di samping tipe dan platform. Sheet lama tanpa kolom J tetap terbaca (stage = `''`),
dan stage lama yang sudah tak ada di dropdown tetap ditawarkan supaya tidak hilang saat
disimpan ulang.

---

## 1.61.0 — Salin sub-ceklis ke proses lain

Saat satu proses menyusun daftar panjang (mis. Alya "Generate" dengan 23 sub-item), proses
berikutnya sering mengerjakan daftar yang **sama persis** — Ali meng-QC 23 item itu juga.
Sebelumnya harus diketik ulang satu per satu: boros, dan rawan isinya jadi beda.

### Cara pakai
Di kepala sub-ceklis muncul **"Salin ke proses lain"** (hanya bila sudah ada isinya).
Panelnya mendaftar semua proses lain di kolaborasi itu lengkap dengan **PIC**-nya, bisa
dicentang lebih dari satu, lalu **Salin**.

### Keputusan rancangan
- **Status centang tidak ikut disalin.** Item masuk dalam keadaan kosong — pekerjaan di
  proses tujuan memang belum dikerjakan. Ini ditulis juga di panelnya.
- **Menambah, bukan menimpa.** Tujuan yang sudah berisi diberi tanda *"sudah ada N"*
  sebelum tombol ditekan, supaya tidak dobel tanpa disadari.
- **Satu kali tulis, bukan N panggilan.** Aksi baru `copyChecklist(fromId, toIds, actor)`
  menulis semua baris sekaligus. Menyalin 23 item ke 2 proses = 1 permintaan, bukan 46 —
  jauh lebih cepat dan tak bisa putus separuh jalan.
- Izinnya mengikuti `addChecklistItem` yang sudah ada: sub-ceklis kolaborasi memang
  fleksibel. Mode lihat-saja tetap tertutup lewat allowlist `GUEST_ACTIONS` di
  `api/rpc.js` dan `stepChecklistEditable()` di UI.

Tersedia di kedua backend (`api/_sheets.js` dan `gas/Code.gs`).

---

## 1.60.0 — Penanda "Giliran Anda" dibuat benar-benar terlihat

### Tiga lapis penanda
Sebelumnya cuma teks merah 11px di antara belasan baris proses — praktis tenggelam.
Sekarang tiga lapis, dari yang paling menarik perhatian ke paling halus:

1. **Pita solid di puncak kartu** — latar rose penuh lebar, teks putih tebal kapital,
   ikon lonceng berdenyut. Menyebut **proses mana** yang menunggu (mis. *"QC Ali"*), atau
   *"3 proses menunggu"* bila lebih dari satu — jadi langsung tahu harus mengerjakan apa
   tanpa membuka kartunya.
2. **Baris prosesnya disorot** — latar rose tipis, huruf tebal, ikon `play_circle` lebih
   besar. Sebelumnya cuma titik merah kecil yang hilang di antara 12 baris.
3. **Kartunya diberi cincin** rose + bayangan, supaya menonjol di antara grid kartu.

**Kartu bergiliran juga dinaikkan ke urutan teratas.** Ini yang paling menentukan: di data
nyata kartu bergiliran bisa berada di bawah kartu yang sudah **Selesai**, jadi sebagus apa
pun pitanya tetap harus di-scroll dulu. Urutan sekarang: giliran Anda → masih jalan →
Selesai, dengan urutan asli terjaga di dalam tiap kelompok.

---

## 1.59.0 — Hapus user benar-benar mencabut dari PIC + tabel diurutkan per peran

### Hapus yang sungguh menghapus
Sebelumnya `deleteUser` hanya membuang baris di sheet `USERS`. Namanya **tetap ada di
dropdown PIC & Support**, jadi anak magang yang sudah selesai masih bisa dipilih sebagai
PIC task baru. Sekarang penghapusan sekalian mencabutnya dari kedua dropdown.

### Karyawan tetap: pengaman dua langkah
`Manager`, `Leader`, dan `Staff` yang **masih aktif tidak bisa dihapus** — namanya melekat
di task lama, jadi mencabutnya dari dropdown akan meninggalkan task yang PIC-nya tak bisa
dipilih lagi. Di tabel mereka diberi ikon gembok, bukan tombol hapus.

**Nonaktifkan dulu, baru tombol hapusnya muncul.** Dua langkah ini mencegah penghapusan
tak sengaja, tapi tetap memberi jalan keluar untuk akun duplikat atau salah ketik — kasus
nyata: dua akun Manager untuk orang yang sama. Untuk karyawan yang sekadar keluar, cukup
berhenti di Nonaktif: haknya dicabut, riwayatnya utuh.

Penjagaan ini ada di **server** (`api/_sheets.js` dan `gas/Code.gs`), bukan cuma di
tampilan — menembak `deleteUser` langsung pun ditolak.

Yang boleh langsung dihapus tanpa dinonaktifkan: **Magang**, **Lihat Saja**, dan nama yang
belum berperan. `Dev` dan diri sendiri selalu ditolak.

Nama yang cuma nyangkut di dropdown tanpa baris `USERS` juga sah dibersihkan lewat
tombol hapus — sebelumnya ditolak dengan "User tidak ditemukan".

### Urutan tabel mengikuti hierarki peran
Manager → Leader → Staff → Magang → Lihat Saja, memakai daftar `ROLES` aplikasi sendiri
supaya legenda dan tabel selalu sejalan. Yang **belum diatur tetap di paling atas** karena
merekalah yang butuh tindakan; sesama peran diurutkan menurut abjad.

### Mode magang: kotak identitas tampil lagi
Di v1.57.0 kotak **Mode User** disembunyikan sepenuhnya untuk anak magang. Akibatnya
mereka tidak punya penanda sedang masuk sebagai siapa. Sekarang kotaknya **tetap tampil**
— yang dimatikan hanya cara menggantinya: dropdown terkunci (`disabled`, diberi efek
redup), tombol **"Ganti identitas"** disembunyikan, dan ditambahkan keterangan kecil
*"Identitas terkunci untuk akun magang."*

Penguncian sesungguhnya tetap di tempatnya: `requestUserSwitch` menolak, identitas
dibaca dari cookie, dan server hanya mengirim data lingkungan magang.

### Dashboard eksternal dibuka untuk magang
`getBootstrapData` level magang tadinya mengirim `dashboards: []`. Sekarang dikirim penuh
— isinya tautan laporan, bukan data task, jadi tidak ada yang bocor. Tab **Dashboard
Eksternal** memang sudah tampil untuk magang, cuma isinya selalu kosong.

### Akibat perubahan v1.58.0 yang harus dicabut
`knownPeople()` tidak lagi memungut nama dari PIC/Support **task lama**. Kalau dibiarkan,
user yang baru dihapus akan muncul lagi sebagai "Belum diatur" selama task lamanya masih
ada — penghapusannya jadi terasa gagal. Sumbernya kini baris `USERS` + dropdown PIC &
Support saja. Konsekuensinya: nama yang ada di task lama tapi sudah tidak ada di dropdown
maupun `USERS` tidak lagi muncul di panel — dan itu memang yang diinginkan.

---

## 1.58.0 — Kelola User memuat SEMUA nama, bukan cuma yang tercatat di sheet

### Ada hak yang hilang diam-diam
Panel **Kelola User & Peran** hanya menampilkan baris yang sudah ada di sheet `USERS`.
Padahal `roleOf()` mengembalikan peran **kosong** untuk nama yang tidak tercatat di situ —
jadi begitu sheet `USERS` mulai diisi (walau baru 2 orang), semua nama lain yang dipakai
di task otomatis kehilangan seluruh haknya: tak bisa set Done, tak masuk daftar approver,
tak punya wewenang apa pun. Dan karena mereka tidak muncul di panel mana pun, Dev tidak
punya cara memperbaikinya selain menyunting sheet secara manual.

Terbukti di data produksi: `Nynda` berperan `""` dan `isManager('Nynda')` bernilai `false`.

### Yang berubah
- **`knownPeople()`** — mengumpulkan semua nama yang dikenal sistem: baris `USERS` +
  dropdown PIC + PIC/Support yang benar-benar dipakai di task. Duplikat beda kapital/spasi
  digabung, nama kosong dan `Dev` dibuang.
- **`userAdminRows()`** — menggabungkan yang terdaftar dan yang belum, menaruh yang
  **belum diatur di paling atas** karena merekalah yang butuh tindakan. Urutannya stabil,
  jadi indeks baris tidak pernah meleset ke orang lain.
- Baris yang belum terdaftar diberi lencana **"Belum diatur"**, latar amber, dan opsi
  **"— belum diatur —"** yang terpilih. Memilih peran = sekaligus mendaftarkan orangnya.
- Spanduk peringatan menyebut **berapa orang** yang haknya masih kosong.
- Tombol **hapus** dan **nonaktifkan** disembunyikan *dan* dijaga di handler untuk baris
  yang belum terdaftar — bukan cuma disembunyikan di tampilan.
- `changeUserRole` / `toggleUserActive` / `removeUser` kini membaca daftar gabungan yang
  sama; sebelumnya mereka mengindeks `state.users` sehingga akan menunjuk orang yang salah.

### Catatan
Murni perubahan frontend — `saveUser` di backend sudah menerima nama baru apa adanya,
jadi tidak ada perubahan di `api/` maupun `gas/Code.gs`.

---

## 1.57.0 — PIN khusus anak magang + tab "Kerjaan Magang" untuk karyawan

### Masalahnya lebih dalam dari sekadar dropdown
Sebelum ini, siapa pun yang tahu `ACCESS_PIN` mendapat level penuh, dan `getBootstrapData`
mengirim **seluruh task, komentar, link, dan catatan** ke browser. Identitas hanyalah pilihan
di dropdown yang tak pernah diverifikasi server. Artinya menyembunyikan switcher **tidak
mengamankan apa pun** — data tim tetap ada di respons jaringan.

### PIN magang: dipangkas DI SERVER
- Env baru **`MAGANG_PIN`**. Masuk dengan PIN itu → level `magang`.
- `getBootstrapData` untuk level ini **hanya mengirim**: task milik anak magang, plus task
  karyawan tempat magang itu terdaftar sebagai PIC/Support. Riwayat aktivitas, dashboard
  eksternal, daftar PIN, link & catatan orang lain **tidak dikirim sama sekali**.
- Aksi administratif diblokir di gerbang (kelola user, kelola opsi, hapus task, setup, dll).
- Header `x-user` (identitas yang diklaim browser) **hanya bisa mempersempit**, tak pernah
  menaikkan hak: backend memastikan nama itu memang ber-peran Magang. Mengaku "Nynda" lewat
  jalur magang tetap hanya menerima data magang.

### Identitas magang terkunci
- Setelah PIN magang, muncul pemilihan **hanya dari daftar magang** yang disiapkan Dev.
- Pilihannya disimpan di **cookie** (`tt_magang_user`, 180 hari) dan **tidak bisa diganti
  dari dalam aplikasi** — kotak "Mode User" disembunyikan, `requestUserSwitch` menolak.
  Ganti orang berarti reset cookie / login ulang.

### Tab "Kerjaan Magang" untuk karyawan
- View baru (pola seperti Lintas Divisi) berisi task anak magang, **dikelompokkan per orang**
  lengkap dengan hitungan selesai & overdue, dan badge overdue di sidebar.
- Karyawan bisa membuka & **menutup (Done)** task magang langsung dari sini.
- Konsekuensinya: **kerjaan magang tidak lagi tercampur** ke daftar & KPI task karyawan —
  dashboard mereka kembali bersih. Sebelumnya Staff melihat task magang menyatu di listnya.
- Magang tetap bisa jadi **Support di task karyawan** dan ikut **Task Kolaborasi**.

### Perbaikan
- `populateUserSelect()` dulu memaksa identitas ke salah satu opsi PIC yang tersedia. Karena
  nama magang belum tentu ada di daftar itu, identitas magang terlempar balik ke user lain.
  Kini mode magang punya jalur terkunci sendiri, seperti mode berbagi Lintas Divisi.

### Pengujian
- `test/vercel-users.test.js` → **55 assertion** (+16): pemangkasan data level magang,
  task Support ikut terkirim hanya ke magang yang bersangkutan, dan **dua uji percobaan
  naik hak** (mengaku Manager/Staff lewat jalur magang tetap ditolak).
- `test/gas.test.js` → **288 assertion** (+9): kunci cookie, switcher tersembunyi, penolakan
  ganti user, header `x-user`, tab Kerjaan Magang, dan pemisahan dari daftar karyawan.
- `npm test` → **115 + 55 + 288 = 458 assertion**.
- Diverifikasi end-to-end melawan backend Vercel asli: dengan PIN magang server mengirim
  **6 task, semuanya PIC magang** (0 task karyawan, 0 activity, 0 dashboard); klaim "Nynda"
  maupun "Ali" tetap 6 task yang sama; UI mengunci identitas ke cookie, lencana "Magang",
  tanpa opsi Done. Sisi karyawan: daftar utama Ali 3 task (bersih), tab Kerjaan Magang berisi
  2 blok anak magang / 6 task, dan Staff berhasil menutup task magang ke Done.

---

## 1.56.0 — Leader melihat task miliknya saja (wewenangnya tetap penuh)
Sebelumnya Leader ikut melihat **semua task tim** seperti Manager di Dashboard, Kanban,
List, Timeline, dan Calendar — v1.54.0 baru mempersempitnya di tab Komunikasi saja.

- **`canSeeAllTasks()` kini hanya Manager & Dev.** Leader turun ke cakupan personal:
  hanya task yang ia **PIC atau Support**-nya, sama seperti Staff.
- **Wewenang Leader TIDAK berubah** — masih boleh **menutup (Done) task siapa pun** dan
  **menyusun Task Kolaborasi**, termasuk mencentang prosesnya sendiri. Yang berubah hanya
  jangkauan lihat, bukan haknya.
- **`commScopedTasks()` dihapus.** Setelah Leader dipersempit, aturan Komunikasi jadi sama
  persis dengan view lain — mempertahankan dua fungsi berbeda hanya mengundang keduanya
  berbeda diam-diam. Komunikasi & badge notifikasi kembali memakai `scopedTasks()`.
- Legenda peran di panel Kelola User diperbarui: Leader kini tertulis *"Task miliknya saja •
  boleh set Done task siapa pun • boleh menyusun Task Kolaborasi"*.

### Pengujian
- `test/gas.test.js` → **279 assertion**; bagian 16c ditulis ulang: memastikan
  `canSeeAllTasks` hanya Manager, tak ada lagi cakupan Komunikasi terpisah, **dan** dua
  assertion penjaga bahwa wewenang Done & kolaborasi Leader tetap ada.
- Diverifikasi di **kedua konfigurasi**:
  - *Vercel/env var* — Dhea 8 task, Alya 9 (persis PIC/Support-nya), Nynda 30; lencana
    Leader; opsi "Done" tetap ada di dropdown & tombol Done Kanban aktif; Dhea berhasil
    membuat, mencentang, dan menghapus Task Kolaborasi.
  - *sheet USERS* — Dhea 3, Alya 6, Manager/Dev 24, Staff 9 (miliknya + task magang),
    Magang 6; Done & kolaborasi Leader tetap jalan.
  - Per-tampilan konsisten: Dashboard, Kanban, List, dan Komunikasi menunjukkan angka
    yang sama untuk tiap peran. Nol error konsol.

---

## 1.55.0 — Kelola user & peran kini ada juga di versi Vercel
Sebelumnya sheet `USERS` + peran (Manager/Leader/Staff/Magang) hanya ada di paket Apps Script,
jadi panel **Kelola User** tak pernah muncul di app Vercel yang dipakai tim sehari-hari.
Sekarang di-port ke `api/_sheets.js` + `api/rpc.js`.

- **Sheet `USERS`** (Nama · Peran · Aktif) jadi sumber peran, dibaca **dalam batch bootstrap
  yang sudah ada** — jadi tidak menambah kuota baca Google Sheets sama sekali.
- **Fungsi peran tetap SINKRON.** Alih-alih membuat semuanya `async` (yang akan membongkar
  seluruh pemanggil dan 78 tes produksi), daftar user dimuat sekali per request ke cache,
  lalu fungsi peran membacanya. `rpc.js` membuang cache di awal tiap request supaya
  perubahan peran langsung berlaku, tidak menunggu cold start instance serverless.
- **Cadangan environment variable dipertahankan**: selama sheet `USERS` kosong/absen,
  peran diambil dari `MANAGERS` / `DONE_APPROVERS` / `COLLAB_MANAGERS` persis seperti dulu.
  Instalasi yang belum menjalankan setup tidak berubah perilakunya sama sekali.
- Ikut ter-port: **izin "Done" berbasis PIC** (Staff boleh menutup task anak magang, tapi
  bukan task karyawan lain), **kelola user hanya oleh Dev**, dan aturan visibilitas Magang.
- Action baru di RPC: `getUsers`, `saveUser`, `deleteUser`.

### Pengujian
- `test/logic.test.js` → **115 assertion** (+37): pengenalan peran, izin Done bergantung PIC,
  user nonaktif kehilangan hak, kelola-user hanya Dev, dan kembalinya ke cadangan env var.
- **`test/vercel-users.test.js` (baru) → 39 assertion**: uji integrasi backend Vercel dengan
  googleapis diganti spreadsheet tiruan — jalur nyata baca/tulis sheet, bootstrap meta,
  gerbang Done lewat `quickUpdateField` & `saveTask`, CRUD user, dan fallback env var.
- `npm test` kini menjalankan tiga suite: **115 + 39 + 277 = 431 assertion**.
- Diverifikasi end-to-end di UI melawan backend Vercel asli: Dev melihat panel Kelola User
  (5 peran bisa dipilih), Manager melihat keterangan saja, menambah "Magang Agustus"
  langsung masuk dropdown PIC & pemilih identitas, task untuknya hanya terlihat sesama
  magang + semua Staff, magang ditolak saat mem-Done-kan task sendiri, dan Staff berhasil
  menutupnya. Lencana peran: Manager/Leader/Staff/Magang/Dev tampil benar.

---

## 1.54.0 — Komunikasi jadi kotak masuk pribadi + notifikasi hilang saat dibaca

### Cakupan tab Komunikasi
- **Leader tidak lagi melihat semua percakapan** seperti Manager. Di tab Komunikasi,
  Leader hanya melihat task yang ia **PIC atau Support**-nya. Di view lain (Dashboard,
  Kanban, List, Timeline, Calendar) Leader tetap melihat semua task seperti sebelumnya —
  yang berubah hanya inbox chat-nya.
- **Manager/Dev tetap bisa memantau semua** percakapan.
- Ditambahkan `commScopedTasks()` yang dipakai daftar Komunikasi **dan** perhitungan badge.

### Notifikasi benar-benar hilang setelah dibaca
- **Akar masalahnya sama**: badge komentar dihitung dari `scopedTasks()`, sehingga bagi
  Manager/Leader ia menghitung percakapan di task siapa pun — termasuk yang tak pernah
  mereka buka. Angkanya jadi seolah tak pernah habis. Sekarang dihitung dari
  `commScopedTasks()`, jadi hanya percakapan miliknya sendiri.
- **Lonceng notifikasi: membuka menunya = menandai terbaca.** Sebelumnya notifikasi hanya
  hilang bila diklik satu per satu atau lewat "Tandai semua dibaca", sehingga badge sering
  menetap. Penanda dikirim ke server tanpa merender ulang daftarnya, supaya penanda "baru"
  tetap terlihat selama menu masih terbuka.
- **Notifikasi mention pada task biasa kini bisa diklik** — langsung membuka percakapan
  task itu di tab Komunikasi (sebelumnya hanya notifikasi kolaborasi yang bisa dibuka).
- Perbandingan penulis komentar dibuat toleran (`same()`), supaya komentar sendiri tak
  pernah terhitung "belum dibaca" karena beda kapital/spasi.

### Pengujian
- `test/gas.test.js` → **277 assertion** (+11 untuk perubahan ini).
- Diverifikasi lewat simulator `google.script.run`: Leader Konten melihat 54 task di view
  lain tapi hanya **9** di Komunikasi (persis yang ia PIC/Support-nya), Leader Sistem 8,
  Manager tetap 54, Staff 12, Magang 4. Badge komentar 1 → **0** begitu chat dibuka;
  badge lonceng 2 → **0** begitu menu dibuka, dan **tetap 0 setelah dimuat ulang dari
  server** (jadi benar-benar tersimpan, bukan sekadar hilang di layar). Klik notifikasi
  mention membuka chat task yang tepat. Nol error konsol.

### Data dummy
- `data-dummy/*.xlsx` dan `csv/` diregenerasi mengikuti v1.53.0 — kini **12 user / 54 task**
  termasuk 2 Magang dan 4 task milik magang.

### Perbaikan lencana peran
- Di deployment **Vercel** (tanpa sheet `USERS`, peran dari env var), lencana "MODE USER"
  salah menulis **Staff** untuk Leader — padahal haknya Leader. Sekarang label diturunkan
  dari hak yang benar-benar berlaku, jadi tertulis **Leader**.
- Diverifikasi pada konfigurasi Vercel (bootstrap tanpa `meta.users`): Nynda → Manager /
  30 percakapan, Dhea → Leader / **8**, Alya → Leader / **9** (persis task yang ia
  PIC/Support-nya), Ali → Staff / 4. Di view lain Dhea & Alya tetap melihat 30 task.

---

## 1.53.0 — Peran "Magang" + izin Done berbasis PIC + perbaikan PIN Dev
Menyiapkan anak magang ikut memakai tracker tanpa melihat pekerjaan tim inti.

### Peran baru: Magang
Daftar peran jadi **Dev · Manager · Leader · Staff · Magang · Lihat Saja**, dipilih Dev
saat menambah user.

| Peran | Task yang terlihat | Set "Done" |
|---|---|---|
| Dev / Manager / Leader | semua | task siapa pun |
| **Staff** | miliknya **+ semua task magang** | **hanya task magang** |
| **Magang** | **hanya task sesama magang** | — |

- **Magang hanya melihat task sesama magang** (termasuk miliknya). Pekerjaan karyawan tidak
  muncul di Dashboard, Kanban, List, Timeline, maupun Calendar mereka.
- **Staff melihat semua task magang** di samping task miliknya — supaya bisa membimbing.
- **Izin "Done" sekarang ditentukan oleh SIAPA PIC task-nya**, bukan hanya peran si penekan
  tombol: Staff boleh menutup task milik magang (pembimbing menyetujui hasil kerjanya), tapi
  tetap tidak boleh menutup task karyawan lain. Magang tak bisa mem-Done-kan apa pun,
  termasuk task miliknya sendiri.
- Ditegakkan **di server** (`canApproveDone_(actor, taskPic)` dipakai `saveTask` &
  `quickUpdateField`), bukan hanya disembunyikan di UI.
- Frontend: `canSetDoneFor(task)` menggantikan `canSetDone()` di seluruh titik keputusan —
  dropdown status inline, form task, dan pindah-massal Kanban. Pada pindah-massal, izin
  dinilai **per task**: yang boleh diproses, yang tidak dilewati dengan pemberitahuan
  jumlahnya; tombol "Done" hanya nonaktif bila tak satu pun task terpilih boleh ditutup.

### Perbaikan PIN Mode Dev
- **Penyebab "PIN salah padahal sudah diisi": pesannya menyesatkan.** Frontend selalu
  menampilkan "PIN salah", padahal server mengirim alasan sebenarnya — biasanya
  *"DEV_PIN belum diset"* karena tombol **Save script properties** di Project Settings
  terlewat. Sekarang pesan dari server yang ditampilkan.
- **Menu baru** di spreadsheet: **⚡ ProductTrack → Atur PIN Mode Dev** (langsung tersimpan,
  tanpa masuk Project Settings) dan **Cek status PIN Mode Dev**.

### Data dummy
- Ditambah **2 user Magang** (Magang Konten, Magang Data) dan **4 task milik magang** —
  di-*append* agar Task ID lama tidak bergeser. Total kini **12 user / 54 task**.

### Pengujian
- `test/gas.test.js` +18 assertion untuk peran Magang: Staff boleh mem-Done-kan task magang,
  Staff ditolak pada task karyawan, magang ditolak pada task sendiri & sesama magang,
  Leader/Manager tetap bebas, penegakan lewat `saveTask` maupun `quickUpdateField`, dan
  magang tak masuk daftar approver.

---

## 1.52.0 — Kelola user dikunci ke mode Dev (Manager tidak bisa)
Menyiapkan onboarding anggota baru (mis. anak magang) dengan kontrol akses satu pintu.

- **Menambah/mengubah/menonaktifkan/menghapus user sekarang HANYA bisa dari mode Dev.**
  Sebelumnya Manager juga bisa. Alasannya: pemberian akses dan kenaikan hak tidak boleh
  bisa dilakukan tanpa sepengetahuan pemilik sistem, dan Manager tak boleh punya jalan
  untuk menaikkan hak siapa pun — termasuk dirinya.
  - Ditegakkan **di backend** (`canManageUsers_` → hanya `dev`), jadi bukan sekadar
    menyembunyikan tombol. Percobaan dari Manager/Leader/Staff ditolak server.
  - Aturan lama "hanya Dev boleh memberi peran Dev/Manager" jadi tidak perlu lagi dan
    **dihapus** (`ROLES_DEV_ONLY`) — sekarang seluruh pengelolaan user memang milik Dev.
- **Manager yang membuka Pengaturan** melihat keterangan singkat: pengelolaan user ada di
  mode Dev, dan alternatifnya mengisi sheet `USERS` langsung — bukan sekadar menemukan
  fiturnya hilang tanpa penjelasan. Leader/Staff tidak melihat apa pun soal ini.
- Panel Kelola User diberi label **MODE DEV**, dan peran **"Dev" tak bisa dipilih** untuk
  baris user (Dev adalah mode ber-PIN, bukan anggota daftar).
- Nama **"Dev"** ditolak sebagai nama user biasa.

### Perbaikan
- **User baru kini langsung muncul di semua pemilih.** Sebelumnya hanya dropdown PIC/Support
  & pemilih identitas yang tersegarkan; **Fokus PIC** dan **form Tambah Task** baru ikut
  setelah muat ulang. Sekarang `populateManagerFocus()` dan `populateModalDropdowns()`
  ikut dipanggil.

### Pengujian
- `test/gas.test.js` → **253 assertion**. Bagian kelola user ditulis ulang mengikuti alur
  onboarding magang: Manager/Leader/Staff ditolak di setiap operasi, Dev berhasil, naik-turun
  peran langsung berlaku, nonaktif mencabut hak tanpa menghilangkan task, plus 7 assertion
  UI (panel Dev-only, keterangan untuk Manager, label MODE DEV).
- Diverifikasi lewat simulator `google.script.run`: sebagai Dev panel muncul; sebagai Manager
  panel hilang & keterangan tampil; sebagai Leader/Staff tak ada apa pun. Alur penuh diuji —
  tambah "Magang", muncul di 3 dropdown, diberi task, magang hanya melihat task itu,
  percobaannya menambah user ditolak, lalu dinonaktifkan & dihapus.

---

## 1.51.1 — Perbaikan: layar "Memuat…" menggantung saat deploy di Apps Script
Dilaporkan dari deployment Apps Script sungguhan: halaman ter-render (KPI, grafik, pengingat
semua muncul) tapi overlay **"Memuat task tracker…" tidak pernah hilang**; pada muat ulang lain
halamannya tampil polos tanpa gaya sama sekali.

**Sebabnya bukan kompleksitas project**, melainkan rapuhnya penanganan library CDN:

- `afterLoad()` menyembunyikan overlay di **baris terakhir**. Kalau ada satu langkah di
  tengahnya melempar error, overlay tak pernah ditutup — padahal semua yang sudah ter-render
  tetap terlihat. Persis gejala yang dilaporkan.
- `renderCharts()` menyentuh `Chart.defaults` **tanpa memeriksa** Chart.js sudah termuat.
  Bila CDN diblokir/lambat (jaringan kantor, sekolah, ISP), ini melempar `ReferenceError`
  dan mematikan seluruh sisa `afterLoad()`.

Perbaikan:

- **`afterLoad()` kini memakai `try/finally`** — layar "Memuat…" dijamin tertutup apa pun yang
  terjadi, dan pesan errornya ditampilkan sebagai notifikasi (bukan diam-diam).
- **`renderCharts()` menjaga `Chart`**; kotak grafik menampilkan penjelasan bila Chart.js gagal
  dimuat. (`Gantt`, `FullCalendar`, dan `Sortable` sudah dijaga sebelumnya.)
- **Deteksi library yang gagal dimuat** (`missingLibs()`) + notifikasi sekali yang menyebut
  jumlahnya, supaya penyebabnya jelas alih-alih halaman rusak tanpa keterangan.
- **Semua akses `localStorage` lewat pembungkus aman `LS`** — di iframe Apps Script,
  `localStorage` bisa melempar `SecurityError` saat cookie pihak ketiga diblokir, dan akses
  di inisialisasi `state` dulu bisa mematikan seluruh script sebelum apa pun ter-render.

Hasilnya: dengan **semua CDN diblokir**, aplikasi tetap memuat 50 task, KPI terisi, dan
14 tab bisa dibuka tanpa error — hanya tampilannya polos dan grafiknya diganti pesan.

### Pengujian
- Simulator baru menjalankan frontend lewat **`google.script.run` tiruan** (jalur Apps Script
  sungguhan, bukan `fetch`) — jalur yang sebelumnya tak pernah diuji dan menjadi celah bug ini.
- `test/gas.test.js` +12 assertion ketahanan (try/finally, penjagaan tiap library, `.hide` tak
  bergantung Tailwind, pembungkus `localStorage`). Total **239 assertion**.

---

## 1.51.0 — Peran user (Manager/Leader/Staff) + file data dummy siap impor
Persiapan agar paket `gas/` bisa **dipublikasikan/dijual** apa adanya.

### Sistem peran & kelola user (versi Apps Script)
- Sheet baru **`USERS`** (Nama · Peran · Aktif) jadi sumber peran, menggantikan
  pengaturan lewat environment variable yang harus disentuh developer.
- Lima peran dengan hak berjenjang:

  | Peran | Lihat semua task | Set "Done" | Setup kolaborasi | Task lintas divisi | Kelola user |
  |---|:--:|:--:|:--:|:--:|:--:|
  | Dev | ✅ | ✅ | ✅ | ✅ | ✅ (termasuk beri peran Dev/Manager) |
  | Manager | ✅ | ✅ | ✅ | ✅ | ✅ (kecuali beri peran Dev/Manager) |
  | Leader | ✅ | ✅ | ✅ | — | — |
  | Staff | hanya miliknya | — | — | — | — |
  | Lihat Saja | terbatas | — | — | — | — |

- Panel baru **Pengaturan → Kelola User & Peran**: tambah user, ubah peran, aktif/nonaktif,
  hapus — lengkap dengan legenda hak tiap peran. User baru **otomatis masuk dropdown
  PIC & Support**, jadi langsung bisa diberi task.
- Pengamanan ditegakkan **di server**, bukan cuma di tampilan: hanya Dev yang boleh
  mengangkat Dev/Manager (mencegah user menaikkan haknya sendiri), Manager tak boleh
  mengubah/menghapus user ber-peran Manager/Dev, dan tak seorang pun bisa menghapus
  akunnya sendiri. User nonaktif langsung kehilangan hak, task lamanya tetap utuh.
- Frontend menurunkan hak dari `state.users`; kalau backend tak mengirim `meta.users`
  (versi Vercel), semuanya **otomatis kembali ke perilaku lama** dan panel Kelola User
  disembunyikan — jadi instalasi lama tidak berubah sama sekali.

### Siap publikasi
- **Tidak ada PIN bawaan lagi.** `DEV_PIN` kosong secara default di kedua versi, dan
  mode Dev menolak PIN apa pun (termasuk kosong) sampai property/env itu diisi sendiri.
  Nilai bawaan `'3108'` yang sebelumnya tertanam di `api/_sheets.js` **dihapus**.
- **Nama contoh diganti generik**: Manager, Leader Konten, Leader Sistem, Staff Materi,
  Staff Soal, Staff QC, Staff Input, Staff Data, Staff Liveclass — tidak ada lagi nama
  orang asli di dalam produk.

### File data dummy siap pakai — `gas/data-dummy/`
- **`ProductTrack-Data-Dummy.xlsx`** — 1 file berisi 13 sheet (header Main tetap di baris 3,
  tanggal tersimpan sebagai tanggal asli, sheet internal sudah tersembunyi). Unggah ke
  Drive → buka dengan Google Sheets → langsung jalan.
- **`csv/`** — satu CSV per sheet untuk impor terpisah.
- **`README.md`** — rincian isi tiap sheet, daftar peran, dan kondisi demo yang disiapkan.

### Perbaikan
- **`@mention` untuk nama ber-spasi.** Parser lama berhenti di spasi, jadi `@Staff Data`
  bisa salah menotifikasi `Staff Soal` — masalah yang sama akan muncul untuk nama asli
  seperti "Budi Santoso". Sekarang nama **terpanjang** dicocokkan lebih dulu, di backend
  maupun pada penyorotan teks di UI. Tag ambigu (`@Staff` saja) tidak menotifikasi siapa pun.

### Pengujian
- `test/gas.test.js` bertambah jadi **227 assertion**, termasuk 7 uji mention nama ber-spasi
  dan ±30 uji peran/kelola user (batas kenaikan peran, nonaktif, hapus, hak per peran).
- `npm test` = 78 + 227 = **305 assertion**.

---

## 1.50.0 — Paket Google Apps Script siap jual + data dummy lengkap
Folder baru **`gas/`** berisi versi ProductTrack yang berjalan **100% di dalam Google**
(Spreadsheet = database, Apps Script = server, Web App = aplikasi). Tidak perlu hosting,
service account, atau kartu kredit — pembeli cukup menyalin satu spreadsheet.

- **`gas/Code.gs`** — backend lengkap, port dari `api/_sheets.js` ke `SpreadsheetApp`:
  seluruh fitur ikut (task, ceklis, task kolaborasi + sub-ceklis, komentar, mention
  `@user`/`@everyone`, notifikasi giliran, link & catatan per-user, dashboard lain,
  PIN per-user, gerbang Done, mode lihat-saja).
  - Bebas dari **kuota baca 60/menit** yang membatasi versi Vercel — SpreadsheetApp
    tidak memakai kuota Sheets API itu.
  - **LockService** pada `saveTask` supaya dua orang menyimpan bersamaan tak saling menimpa baris.
  - Notifikasi **handoff giliran** kini dibuat otomatis saat sebuah proses collab dicentang.
- **`gas/Seed.gs`** — menu "⚡ ProductTrack" + generator data dummy: **50 task, 6 task
  kolaborasi (26 proses), 33 item ceklis, 20 komentar, 34 aktivitas, 9 notifikasi,
  13 link, 9 catatan, 3 dashboard**. Semua tanggal **relatif hari ini**, sehingga demo
  selalu punya task overdue, jatuh tempo hari ini, dan yang akan datang.
  - Sheet "mesin" (`ACTIVITY`, `COMMENTS`, `CHECKLIST`, `COLLAB`, `COLLAB_STEPS`,
    `NOTIFICATIONS`, `AUTH`, `LINKS`, `DASHBOARDS`, `NOTES`) otomatis **disembunyikan**;
    hanya `Main` & `OPTIONS` yang terlihat.
- **`gas/README.md`** — panduan pasang 3 langkah, konfigurasi Script Properties, kuota, dan troubleshooting.

### Perbaikan yang ikut kena ke versi Vercel
- **Link berbagi `?view=lintas` kini juga jalan di Apps Script.** Halaman Apps Script
  berjalan di dalam iframe tanpa query string aslinya, jadi `doGet` menyuntikkan mode ke
  `window.__TT_VIEW` dan `detectViewLock()` membacanya sebagai cadangan (tetap kompatibel
  dengan versi Vercel yang membaca query string).
- **Stempel waktu tidak lagi tampil kacau.** Kolom Created At / Done At / Checked At /
  UpdatedAt dulu dibaca mentah, sehingga bisa muncul sebagai angka serial atau teks
  `"Mon Jul 28 2026 ..."`. Sekarang dirapikan lewat `stampStr_()`.
- **`formatDate_` memakai getter waktu lokal** untuk nilai bertipe Date — memakai getter
  UTC membuat tanggal mundur 1 hari di GMT+7.

### Pengujian
- Test suite baru **`test/gas.test.js`**: menjalankan `Code.gs` + `Seed.gs` sungguhan di
  Node dengan `SpreadsheetApp` tiruan yang meniru perilaku asli Sheets (string→Date,
  `TRUE`→boolean), lalu memverifikasi seed, bootstrap, ketepatan tanggal, gerbang Done,
  kunci sub-ceklis, mode tamu, PIN, dan `doGet`. **179 assertion.**
- `npm test` kini menjalankan kedua suite (78 + 179 = **257 assertion**).

---

## 1.49.0 — Collab: main-ceklis proses terkunci sampai sub-ceklis tuntas
- Di **Proses Beruntun**, checkbox utama sebuah proses **tidak bisa dicentang** selama masih ada **sub-ceklis** yang belum selesai.
  - Checkbox utama tampil **nonaktif** dengan tooltip "Selesaikan semua sub-ceklis dulu (X/Y)".
  - Badge sub-ceklis di baris proses berubah jadi **gembok (amber)** saat belum tuntas, dan **centang hijau** begitu semua sub-ceklis selesai — saat itu checkbox utama otomatis terbuka.
  - Membatalkan centang (undo) **selalu** boleh, meski sub-ceklis belum lengkap (mis. data lama yang terlanjur ter-Done).
  - Proses **tanpa** sub-ceklis tetap bisa dicentang seperti biasa.
- Aturan ini ditegakkan **di frontend dan backend**: `setCollabStepDone` menolak penandaan selesai bila sub-ceklis proses itu belum tuntas (`Selesaikan dulu semua sub-ceklis proses ini (X/Y)`), jadi tak bisa di-bypass lewat ringkasan yang kedaluwarsa.

---

## 1.48.0 — Kanban pilih banyak: perbaikan scroll + "pilih semua per kolom"
- **Perbaikan bug scroll**: memilih kartu setelah men-scroll ke bawah tidak lagi melompat balik ke atas. Toggle satu kartu kini memperbarui **hanya kartu itu** (tanpa membangun ulang board), dan semua render ulang lain (pilih semua, batal, pindah massal) **mempertahankan posisi scroll** tiap kolom.
- **Pilih semua per kolom**: di header tiap kolom (saat mode Pilih Banyak aktif) ada tombol centang:
  - Kosong → **pilih semua** kartu yang bisa dipilih di kolom itu.
  - Terisi/`N/total` → menampilkan berapa yang terpilih; klik saat semua terpilih = **batalkan semua** di kolom itu.
  - Ikon **indeterminate** saat hanya sebagian terpilih.
- Alur yang jadi cepat: klik **pilih semua** di kolom (mis. Review PM), lalu **uncheck** beberapa yang ingin dipertahankan, lalu pindahkan sisanya sekaligus — tak perlu mencentang satu per satu saat yang dipindah jauh lebih banyak dari yang ditahan.

---

## 1.47.0 — Kanban: pilih banyak kartu & pindah status sekaligus
- Tombol **Pilih Banyak** di atas board Kanban. Saat aktif:
  - Tiap kartu (task biasa) muncul **checkbox** di pojok; klik kartu = pilih/batal (bukan buka detail).
  - Bar aksi menampilkan **"N dipilih → pindahkan ke:"** dengan tombol cepat tiap status (Todo, In progress, Review PM, Revisi, Hold, Done) + **Batal pilih**.
  - **Drag salah satu kartu terpilih → semua yang terpilih ikut pindah** ke kolom tujuan sekaligus.
- Kasus utama: manager memindahkan banyak task **Review PM → Done** dalam sekali klik, tak perlu satu per satu.
- **Gerbang "Done" tetap dihormati**: user yang bukan Done-approver melihat tombol Done dalam keadaan nonaktif (dengan alasan di tooltip); percobaan pindah massal ke Done diblokir dan pilihan tetap dipertahankan agar bisa diarahkan ke status lain.
- Kartu **Task Kolaborasi** tidak bisa dipilih (statusnya turunan dari proses, bukan diset manual) — kliknya tetap membuka collab.
- Task yang sudah berada di status tujuan otomatis dilewati; perpindahan dikirim **berurutan** ke backend untuk menghindari tabrakan tulis di spreadsheet, lalu satu notifikasi ringkasan ("N task dipindahkan ke X").

---

## 1.46.0 — Filter Dashboard & Laporan + drill-down per PIC
### Dashboard — filter baru (tersedia untuk SEMUA user, manager maupun user biasa)
- **Rentang tanggal**: pilih dasar tanggalnya lewat toggle **Deadline / Dibuat**, lalu preset **Semua · Hari ini · 7 hari · 30 hari · Bulan ini**, atau isi tanggal dari–sampai sendiri (otomatis jadi mode custom).
  - Arah window ikut field: **Deadline** melihat ke **depan** (hari ini → +7/+30), **Dibuat** melihat ke **belakang** (−7/−30 → hari ini).
- **Beban Kerja**: multi-select PIC. Opsinya diambil dari task yang memang terlihat user itu (bukan master list), jadi tetap relevan buat user biasa.
- **Status** dan **Prioritas**: multi-select.
- Semua filter menyetir **seluruh dashboard sekaligus** — KPI, chart Beban Kerja per PIC, Komposisi Status, Deadline Kritis, Update Terakhir, dan Stage Paling Padat.
- Ada penghitung `X dari Y task • <rentang>` dan tombol **Reset** yang muncul saat ada filter aktif.

### Laporan — filter + interaktif
- **Filter rentang tanggal** (toggle Deadline/Dibuat + preset + custom), **filter PIC**, dan **filter Stage**.
- **Klik baris PIC → panel detail** yang menampilkan **stage apa saja yang dikerjakan user itu**, lengkap dengan bar proporsi, hitungan **aktif / selesai / overdue** per stage, dan **daftar task**-nya (klik task → buka modal task). Klik baris yang sama lagi untuk menutup.
- **Klik baris Stage** → langsung jadi filter stage (toggle), ditandai centang.
- KPI berbasis waktu otomatis ganti label: **"mgg ini"** saat rentang = Semua (perilaku lama, 7 hari terakhir tetap dipertahankan) → **"rentang"** begitu rentang diisi.
- **Export CSV** ikut membawa rentang yang dipakai, dan bila ada PIC yang sedang dibuka, ditambahkan sheet detail **stage + daftar task PIC tersebut**.

### Perbaikan
- `todayStr()` sekarang memakai **tanggal lokal**, bukan `toISOString()` — sebelumnya di UTC+7 tanggalnya mundur 1 hari kalau diakses sebelum jam 07.00 (memengaruhi penanda "telat" dan tanggal dibuat default).

---

## 1.45.0 — Task collab muncul di view task biasa (Hari Ini, List, Kanban)
- Task kolaborasi tempat Anda jadi **PIC salah satu proses** kini **ikut muncul** di **Hari Ini**, **Task List**, dan **Kanban Status** — bukan cuma di tab Task Kolaborasi.
- Ditandai jelas dengan **badge "Kolaborasi"** (ikon alur, aksen warna kartu) sehingga beda dari task biasa.
- Menampilkan **proses Anda + deadline step Anda** dan **deadline project**.
- **Diklik → langsung buka modal Task Kolaborasi** terkait.
- Di **Kanban**, kolomnya dipetakan dari step Anda: belum giliran → Todo, giliran Anda → In progress, semua step Anda selesai → Done. Kartu collab tak bisa di-drag (statusnya dari proses, bukan manual).
- Tidak mengubah Dashboard, Timeline, Calendar (tetap task biasa saja).

## 1.44.0 — Task Kolaborasi: atur ulang urutan proses (drag & tombol)
- Di mode **Edit** proses beruntun, urutan proses kini bisa **diseret (drag pakai handle ⠿)** dan diatur lewat **tombol naik/turun**.
- **Status "done" & catatan tiap proses ikut berpindah** bersama prosesnya saat urutan diubah (tidak mengikuti posisi) — dijaga lewat penanda urutan asal (`srcOrder`) sehingga progres tak tertukar.

## 1.43.2 — Warna kartu collab: tetap aksen samping + tambah Cokelat & Navy
- Warna kartu Task Kolaborasi tetap berupa **aksen garis di sisi kiri** kartu (opsi seluruh-kartu dibatalkan sesuai preferensi).
- Tambah 2 preset warna: **Navy** & **Cokelat** (total 12 warna + "tanpa warna").

## 1.43.0 — Task Kolaborasi: Alya & Dhea bisa setup, filter platform, warna kartu
- **Alya & Dhea kini bisa membuat/mengubah Task Kolaborasi** (setup alur) tanpa jadi manager penuh — konsep terpisah lewat env baru **`COLLAB_MANAGERS`** (default `Nynda,Dhea,Alya`). Manager & Dev otomatis ikut.
- **Filter Platform** ditambahkan di tab Task Kolaborasi (melengkapi filter Tipe/PIC/Status/Giliran Saya/cari).
- **Warna kartu yang bisa diatur**: pemilih warna (10 preset + "tanpa warna") di modal; kartu di **Grid & Kanban** menampilkan aksen warna di sisi kiri. Kolom baru `Color` di sheet COLLAB (otomatis).

## 1.42.0 — Sub-ceklis collab jadi fleksibel (siapa pun bisa menambah)
- **Sub-ceklis per proses** kini bisa **ditambah/dicentang/dihapus oleh siapa pun** (bukan hanya PIC proses/manager) — untuk gotong-royong antar-PIC. Mode lihat-saja tetap tak bisa.
- Tidak mengubah: **centang proses utama** tetap hanya oleh PIC proses tsb, dan **ceklis task biasa** tetap dengan aturan lamanya (PIC/Support tambah/centang, hapus manager).

## 1.41.0 — Task Kolaborasi: fix progres kartu, deadline di kartu, filter
- **Fix**: progres di kartu (mis. 0/9) tak ikut ter-update setelah mencentang proses di modal — kini kartu grid/kanban **segera menyegarkan** progres saat proses dicentang & saat modal ditutup.
- **Deadline di kartu**: deadline project kini tampil di kartu (grid & kanban), dengan flag **"telat"** merah bila lewat.
- **Filter tab Task Kolaborasi**: kotak **cari** (judul/PIC/proses/tipe), plus filter **Tipe**, **PIC**, **Status** (Aktif/Selesai), dan toggle **"Giliran Saya"**. Berlaku di tampilan Grid & Kanban; ada penghitung "X dari Y" + tombol Reset.

## 1.40.0 — Hemat kuota Google Sheets (perbaiki error "Read requests per minute")
- **Penyebab**: app membaca Spreadsheet satu-per-satu; `getBootstrapData` melakukan ~11 pembacaan sekaligus, dan auto-refresh tiap pindah tab mengulanginya → menabrak batas Google (60 read/menit per service account).
- **Perbaikan**:
  - **`getBootstrapData` kini 1 batch** (`values.batchGet`) → dari ~11 read jadi **±2 read** (1 metadata + 1 batch). Bila batch gagal (mis. sheet belum ada), otomatis fallback ke baca satu-satu (tidak error).
  - **`getCollabs` di-batch** (COLLAB + COLLAB_STEPS) → dari 2 read jadi **1**. Dipakai di banyak tempat (modal, refresh, tiap simpan/centang collab).
  - **Auto-refresh dibuat hemat**: throttle **5 dtk → 20 dtk**, dan **dilewati saat tab tak terlihat** (`document.hidden`).
  - **`ensure*Sheet` di-memo per-instance** (collab, checklist, comments, notif): tak baca ulang header pada tiap tulis; reset otomatis tiap cold start.
- Total: pembacaan berulang turun **~10–16×**. Error kuota semestinya hilang di pemakaian normal.

## 1.39.0 — Task Kolaborasi: Kanban per-tipe task
- Tab Task Kolaborasi kini punya **toggle Grid ↔ Kanban**. Kanban mengelompokkan task berdasarkan **tipe** (bukan status): **Course · Tryout/Latsol · Liveclass · Drilling · Journey**, plus kolom **"Tanpa Tipe"**.
- **Seret kartu antar kolom** untuk mengubah tipe task (manager/Dev saja) — mirip Kanban Status.
- Field **Tipe Task** baru di modal (opsional); ditampilkan sebagai chip ungu di kartu.
- Kolom baru **`Type`** di sheet COLLAB (dibuat/ditambah otomatis).

## 1.38.0 — Task Kolaborasi: perbaikan modal panjang + tombol Simpan manager
- **Modal tak lagi "jebol" saat proses banyak**: kartu modal kini dibatasi tinggi layar; kolom kiri (proses) & kanan (komentar) scroll di dalam, footer (Tutup/Simpan/Hapus) tetap menempel di bawah. Sebelumnya proses yang panjang meluber ke bawah footer.
- **Tombol Simpan selalu tersedia untuk manager** — bisa langsung ganti judul/platform/deskripsi/deadline lalu Simpan tanpa harus masuk mode "Edit" dulu. Menyimpan di mode baca mempertahankan proses & progres yang ada (hanya field kepala yang diperbarui).

## 1.37.0 — Task Kolaborasi: platform bisa lebih dari 1
- Pilihan **Platform** di Task Kolaborasi kini **multi-select** (Ctrl/Cmd untuk pilih beberapa) — sama seperti task biasa. Disimpan dipisah koma; di kartu tampil sebagai beberapa chip terpisah.

## 1.36.0 — Tag @everyone + log aktivitas khusus manager
- **`@everyone`** (alias `@semua` / `@all`) di komentar Task Kolaborasi → menotifikasi **semua user** sekaligus (kecuali penulis & mode lihat-saja). Muncul di autocomplete (ikon grup) & tersorot di feed.
- **Log aktivitas** (centang proses, buat/ubah, handoff) kini **hanya tampil untuk manager/Dev**; user biasa cukup melihat **komentar** saja. Judul panel ikut menyesuaikan ("Komentar" vs "Komentar & Aktivitas").
- Baris **"Comment: …"** di log dibuang (duplikat dengan kartu komentar) — feed jadi lebih bersih.

## 1.35.0 — Task Kolaborasi: notes proses, tag @user, sub-ceklis, auto-refresh, deadline project
- **Layout modal 2 kolom**: alur proses + sub-ceklis di kiri, **Komentar & Aktivitas di panel kanan** (seperti referensi), bukan lagi di bawah.
- **Catatan per proses (PIC note)**: tiap proses punya field catatan — mis. minta tambahan deadline. Diisi oleh PIC proses itu atau manager.
- **Tag @user di komentar**: ketik `@` → autocomplete nama; user yang di-tag dapat **notifikasi lonceng** di header (badge angka + daftar; klik → buka collab & tandai terbaca). Mention disorot di feed.
- **Sub-ceklis per proses** (2 tingkat: daftar proses = ceklis utama, tiap proses punya sub-ceklis pengerjaan). Yang bisa menambah/mencentang/menghapus sub-item: **PIC proses itu + manager/Dev**. Disimpan via sheet CHECKLIST (id `COL-xxx#N`).
- **Deadline project keseluruhan** — selain deadline tiap proses, ada 1 deadline untuk seluruh task (flag telat).
- **Auto-refresh** dari Spreadsheet **saat pindah tab** (throttle 5 detik, dilewati saat ada modal terbuka) — progres & notifikasi tag terbaru langsung terlihat.
- Sheet baru **`NOTIFICATIONS`**; kolom baru: `Deadline` (COLLAB), `Note` (COLLAB_STEPS) — dibuat/ditambah otomatis.

## 1.34.0 — Task Kolaborasi (alur proses beruntun antar-PIC)
- Tab baru **"Task Kolaborasi"** (grup Kolaborasi): task dengan **rangkaian proses berurutan**, tiap proses punya **PIC & deadline sendiri** (mis. *"5 Paket TO dan Latsol"* → Alya: kurikulum → Dhika: soal → Uma: QC).
- **Dibuat manager/Dev saja**, ringkas — cukup **platform + judul + daftar proses**; tidak terikat rumus stage/verb/objek task normal, dan **tidak dihitung** di Dashboard/Kanban task biasa.
- **Hanya PIC proses** (atau Dev) yang bisa mencentang prosesnya — ditegakkan di UI **dan** server. Urutan fleksibel (tak dikunci), tapi dipakai untuk logika giliran.
- **Notifikasi dalam-app**: badge angka di tab + banner "Giliran Anda" + highlight kartu. Giliran = proses milik Anda yang belum selesai & proses sebelumnya sudah selesai (handoff sampai ke Anda).
- **Progres X/N + bar**, flag **overdue per proses**, dan panel **Komentar & Aktivitas** (komentar via sheet COMMENTS + log handoff dari ACTIVITY).
- Manager bisa **edit struktur** (tambah/hapus/ubah proses & PIC & deadline) lewat tombol "Edit"; status centang proses lama dipertahankan saat struktur diedit.
- Penyimpanan: sheet baru **`COLLAB`** + **`COLLAB_STEPS`**, dibuat otomatis. Mode lihat-saja tidak melihat tab ini.

## 1.33.0 — Duplikat task (pakai task lama sebagai template)
- Tombol **Duplikat** untuk membuat task baru dari task yang mirip (mis. beda judul saja) tanpa mengisi ulang dari nol. Ada di **footer modal task** dan sebagai **ikon salin di kartu Kanban** (muncul saat hover di desktop, selalu tampil di HP).
- Hasil duplikat adalah **task baru dengan Task ID sendiri** — dihitung terpisah, bukan menimpa/berbagi dengan task asal. Yang diambil hanya isian template-nya.
- **Reset cerdas**: yang disalin = Stage, Kata Kerja, Objek, Jumlah, Detail, Platform, PIC, Support, Priority, Document, PM Notes. Yang di-reset = Status→Todo, Due Date & PIC Notes dikosongkan, Created Date→hari ini, Task ID baru.
- **Ceklis ikut tersalin** (semua item, dalam keadaan belum tercentang) sehingga template langkah kerja terbawa; dikirim ke server setelah task duplikat disimpan.
- Duplikat dari **modal** memakai nilai form saat itu (perubahan yang belum disimpan ikut tersalin, tidak hilang). Task **lintas divisi** hanya bisa diduplikat manager/Dev.

## 1.32.0 — Ceklis pengerjaan per task (PM menyusun, PIC mencentang)
- Tiap task kini punya **Ceklis Pengerjaan** di modal task (di antara detail & chat): PM menuliskan **langkah / output yang diharapkan**, PIC **mencentangnya** sambil mengerjakan. Melengkapi fitur chat yang sudah ada.
- **Hak akses**: PM/Dev **dan** PIC/Support task itu bisa **menambah** & **mencentang**; **hanya PM/Dev yang bisa menghapus** item (item dari PM tak bisa dihilangkan PIC). Ditegakkan di UI **dan** server.
- **Indikator progres**: bar + hitungan `2/4` di modal, plus **chip progres di kartu Kanban** (berubah hijau bila semua tercentang).
- Saat **membuat task baru** (belum ada ID), item ceklis ditampung dulu lalu otomatis dikirim setelah task tersimpan — jadi PM bisa langsung menyusun ceklis sambil membuat tugas.
- Ceklis **tidak memblokir** perpindahan status (mis. ke "Review PM") — murni panduan & indikator.
- Penyimpanan: sheet baru **`CHECKLIST`** (`Task ID | Item | Done | Created By | Checked By | Checked At`), dibuat otomatis. Mode lihat-saja (Lintas) tidak melihat ceklis.

## 1.31.0 — Done approver (Nynda, Dhea, Alya) + tab dikelompokkan
- **Siapa yang boleh set "Done"** kini: **Nynda, Dhea, Alya** (+ Dev). Sebelumnya hanya manager.
- Izin Done dibuat **terpisah dari hak manager**: Dhea & Alya **tetap Member** (hanya lihat task sendiri, tak bisa task lintas divisi / Laporan / Fokus PIC) — mereka **hanya** dapat tambahan wewenang menutup task ke "Done".
- Daftar approver bisa diubah lewat env baru **`DONE_APPROVERS`** (default `Nynda,Dhea,Alya`). Manager (`MANAGERS`) & Dev otomatis ikut boleh. Pesan penolakan menyebut nama approver secara otomatis.
- **Sidebar dikelompokkan** jadi 5 grup berjudul: **Ringkasan** (Hari Ini, Dashboard, Dashboard Lain) · **Task** (Kanban, Task List, Timeline, Calendar) · **Kolaborasi** (Komunikasi) · **Ruang Saya** (Link Saya, Catatan Saya) · **Manajer** (Laporan, Riwayat Aktivitas, Dropdown Master).
- Judul grup **otomatis ikut sembunyi** bila semua tab di dalamnya tak berlaku untuk peran itu (mis. grup "Manajer" tak muncul untuk Member, "Ruang Saya" tak muncul di mode lihat-saja).

## 1.30.0 — Mode Dev tersembunyi (trigger rahasia)
- Opsi **"Dev"** kini **disembunyikan** dari halaman pilih identitas dan dropdown **Mode User** — supaya bisa dites sebagai user biasa. Tidak ada lagi tombol Dev yang terlihat.
- Masuk Mode Dev lewat **trigger rahasia**: **tekan-tahan logo ProductTrack ~2 detik** (di sidebar) → muncul prompt **PIN Dev**. Jalan di desktop maupun HP (di HP: buka menu/sidebar dulu).
- **Tetap butuh kredensial**: PIN Dev diatur via env `DEV_PIN` (nilai tak ditulis di sini), diverifikasi di server — berlaku walau PIN per-user sudah di-set. Login **email dev** (Google) tetap langsung jadi Dev tanpa PIN.
- **Selalu tersembunyi**: setelah pindah dari Dev ke user biasa, harus ulangi trigger + PIN untuk kembali ke Dev. Saat sedang aktif sebagai Dev, mode-nya tetap tampil di switcher agar jelas.
- Dev = super-user testing: melihat semua task & bisa semua aksi (termasuk menetapkan "Done").

## 1.29.0 — Status "Done" hanya untuk manager
- Status **"Done"** kini **hanya bisa ditetapkan oleh manager (Nynda) / Dev**. User biasa (PIC lain) maksimal memindahkan task sampai **"Review PM"** — dari situ manager yang memutuskan Done.
- Opsi "Done" **disembunyikan** dari dropdown status (tabel List & modal task) untuk non-manager, kecuali task-nya memang sudah Done. Mencoba men-drag kartu ke kolom **Done** di Kanban akan ditolak dengan pesan dan kartu kembali ke posisi semula.
- Task yang **sudah** Done tetap **boleh ditarik balik** oleh user biasa (mis. ke Revisi/In progress) — yang dilarang hanya aksi *menetapkan* Done.
- Ditegakkan **dua lapis**: UI (`public/index.html`) dan **backend** (`api/_sheets.js` pada `saveTask` & `quickUpdateField`) sehingga tak bisa diakali lewat request langsung. Daftar manager mengikuti env `MANAGERS` (default `Nynda`).

## 1.28.1 — Perbaikan: PIN identitas selalu diminta
- Fix: di halaman "Masuk sebagai siapa?", memilih identitas yang **kebetulan sama dengan default** (mis. Nynda saat baru reset) tak lagi melewati PIN per-user. Sekarang PIN identitas **selalu** diminta bila di-set (Nynda, Dev, dll.), apa pun default-nya.

## 1.28.0 — Halaman pilih identitas (login PIN)
- Setelah masuk pakai **PIN akses penuh** (env `ACCESS_PIN`), muncul halaman **"Masuk sebagai siapa?"** dulu — tidak langsung jatuh ke mode Manager. Pilih identitas (PIC / Dev), baru masuk dashboard. Pilihan diingat; ada tombol **"Ganti identitas"** di kotak Mode User untuk memilih ulang.
- Menghormati PIN per-user yang sudah ada (kalau identitas terkunci PIN, tetap diminta). **Admin (login Google)** dan **mode lihat-saja** (env `VIEW_PIN`) tidak menampilkan halaman ini — mereka sudah teridentifikasi.

## 1.27.0 — Login Google (OAuth) untuk admin
- Ganti kotak "email admin" (yang bisa dipalsukan) dengan tombol **Masuk dengan Google**. Google memverifikasi email ASLI; backend cek tanda tangan token + daftar email admin, lalu menerbitkan **sesi ber-tanda-tangan (HMAC)** 30 hari. Email admin kini **tidak lagi dipercaya dari header mentah** — hanya dari sesi terverifikasi.
- Nynda & administrator: klik Masuk dengan Google → **langsung akses penuh tanpa PIN**, dan **bisa ganti mode user** (bug "terkunci" saat login email diperbaiki — admin diperlakukan bebas seperti Dev).
- PIN diatur via env: **`ACCESS_PIN`** (akses penuh) & **`VIEW_PIN`** (lihat-saja) untuk yang bukan admin.
- Env baru di Vercel: `GOOGLE_CLIENT_ID` (dari Google Cloud) + `SESSION_SECRET` (teks acak). Bila keduanya kosong, tombol Google tak muncul (app tetap jalan dengan PIN).

## 1.26.0 — Gerbang PIN ganda + auto-login admin
- Gerbang kini **memblokir total** (tak ada isi yang terlihat) sampai lolos salah satu: **PIN penuh** (env `ACCESS_PIN`), **PIN lihat-saja** (env `VIEW_PIN`), atau **email admin terdaftar** (`administrator@officecerebrum.com` / `nyndaramadhanti@cerebrum.id`) yang **langsung masuk tanpa PIN**.
- Popup PIN muncul dari awal untuk selain admin — **PIN saja, tanpa input email**. PIN penuh → kelola task; PIN lihat → mode Lintas (lihat-saja + chat).
- Email admin bisa ditambah/ubah via env `AUTHORIZED_EMAILS` (default sudah berisi dua email di atas). PIN tersimpan di perangkat agar tak perlu ketik ulang.
- Catatan keamanan: karena belum ada login Google, "email admin" dikenali dari yang diketik/diingat perangkat (bisa dipalsukan) — PIN tetap gerbang utama.

## 1.25.0 — Gerbang PIN + fallback lihat-saja
- Akses penuh kini butuh **PIN 6 digit** (di-set lewat env `ACCESS_PIN` di Vercel — bukan di kode, jadi tidak bocor di repo publik). Tanpa/salah PIN, siapa pun yang membuka app otomatis masuk **mode lihat-saja (Lintas)**: hanya melihat task eksternal + yang di-mirror, boleh chat, tidak bisa edit.
- Server hanya mengirim **data terbatas** ke tamu (bukan semua task), dan menolak semua aksi tulis tanpa PIN — jadi link app boleh tetap publik/terhubung GitHub tanpa risiko orang awam mengubah data.
- Tombol **"Masuk penuh (PIN)"** di sidebar untuk tamu; gerbang login diubah jadi input PIN (email opsional untuk memilih mode). Kompatibel mundur dengan `APP_PASSWORD` lama.

## 1.24.1 — Legend warna di Timeline & Calendar
- Tambah keterangan warna (status) di **Timeline** dan **Calendar** agar semua user (termasuk Lintas Divisi) paham arti tiap warna bar/acara. Hanya menampilkan status yang sedang tampil.

## 1.24.0 — Folder untuk Catatan Saya
- Catatan Saya kini punya **folder + pencarian** (sama seperti Link Saya): kelompokkan per folder, cari cepat, ubah nama/hapus folder (catatan pindah ke Umum), pindahkan catatan antar folder.

## 1.23.0 — Hari Ini, Catatan Saya, Laporan
- **Hari Ini**: layar fokus harian pribadi (overdue, jatuh tempo hari ini, sedang dikerjakan, due ≤3 hari).
- **Catatan Saya**: catatan pribadi per user (sheet NOTES) — tambah/edit/hapus.
- **Laporan** (manager/Dev): digest mingguan (ringkasan + per PIC + per stage) dengan **Export CSV** & Print/PDF.

## 1.22.0 — Versi aplikasi
- Tampilkan nomor versi app di sidebar & Dropdown Master.
- Tambah CHANGELOG ini (riwayat versi dari awal).

## 1.21.0 — Peran PIC vs Support
- Bedakan warna task saat jadi **PIC** (indigo) vs hanya **Support** (amber) di chart beban kerja & di Komunikasi, plus chip "Support" di Kanban/Task List.

## 1.20.1 — Perbaikan icon picker
- Ganti ikon dashboard ke set klasik yang pasti termuat (tidak meluber jadi teks).

## 1.20.0 — Kelola dashboard + objek fleksibel
- Dashboard Lain bisa dikelola **manager + Dev** (bukan Dev saja), pilih ikon dari picker (bukan ketik).
- Objek saat input task jadi **opsional** dan bisa **diketik bebas** (tidak terbatas pilihan).

## 1.19.0 — Mirror ke Lintas Divisi
- PM/Dev bisa memilih task internal tertentu untuk **di-mirror** ke view Lintas Divisi (ikon cast).

## 1.18.0 — Template rumus bawaan
- Dropdown Kata Kerja & Objek langsung terisi dari template bawaan (jalan tanpa perlu "Isi dari template").

## 1.17.0 — Rumus nama task + pembuat
- Nama task tersusun otomatis: **Stage → Kata Kerja → Objek** (+ Jumlah & Detail opsional).
- Tampilkan **"Dari: <user>"** (pembuat task) di kartu, popup, dan visual.

## 1.16.0 — Kategori & Subkategori (bertingkat)
- Kategori → Subkategori bertingkat + tombol isi dari template (kemudian disempurnakan jadi rumus di 1.17.0).

## 1.15.0 — Dashboard Lain (CRUD) + diagnostik
- Tambah/edit/hapus dashboard eksternal (awalnya Dev) tersimpan di sheet DASHBOARDS.
- Diagnostik untuk view `?view=lintas`.

## 1.14.0 — Task Lintas Divisi
- Tipe task **Internal/Eksternal**, kolom **Divisi Tujuan** + **Kontak Divisi**; buat/edit task lintas divisi khusus PM/Dev.

## 1.13.0 — Mode Lintas Divisi (lihat-saja) + link berbagi
- View-only untuk divisi lain + link berbagi `?view=lintas` (switcher terkunci) + Komunikasi tetap bisa chat.
- Link Saya: ubah nama folder, hapus folder (link pindah ke Umum), pindahkan link.

## 1.12.0 — Link Saya: folder & pencarian
- Kelompokkan link per folder + kotak pencarian.

## 1.11.0 — Link Saya
- Penyimpanan link pribadi per mode user (tersimpan di sheet LINKS).

## 1.10.0 — Dashboard Lain
- Tab dashboard eksternal + tombol menuju dashboard (mis. Monitoring Liveclass).

## 1.9.0 — Lintas Divisi & divisi
- Mode user "Lintas Divisi" + divisi IT, Marketing, Sales.

## 1.8.0 — Chart beban kerja
- Member: 4 bar per prioritas. Manager: stacked per prioritas (tanpa "Tanpa Data").

## 1.7.0 — Kontrol akses & PIN
- Dropdown Master khusus manager; mode **Dev** (PIN); PIN per user (set/hapus); edit opsi dropdown.

## 1.6.0 — Logika deadline + status Revisi
- Review PM/Hold/Done tidak dihitung telat; tambah status **Revisi**.

## 1.5.0 — Penyempurnaan Komunikasi
- Tidak auto-buka chat, penanda belum dibaca, komentar terbaru di atas, Enter=kirim / Shift+Enter=baris baru, Esc=tutup, default kosong.

## 1.4.0 — Perbaikan peran & notifikasi
- Deteksi manager "Nynda (PM)"; notifikasi dari sheet COMMENTS; Kanban muat tanpa scroll; kunci mode lewat email; email dev akses penuh.

## 1.3.0 — Revisi UI & filter
- Platform multi-select; urutan kolom Kanban; notif komentar ke PIC; mapping email→mode user; Task List wrap; fix dropdown dark-mode; filter fokus deadline.

## 1.2.0 — Fitur inti
- Login/auth, notifikasi komentar, perbaikan mobile/UX, UI chat-bubble, filter Komunikasi.

## 1.1.0 — Adaptasi struktur sheet
- Menyesuaikan layout sheet (Main, header baris 3, 13 kolom) + generate Task ID yang kosong.

## 1.0.0 — Rilis awal (Vercel)
- Port dari Apps Script ke Vercel dengan Google Spreadsheet sebagai database; README & tombol Setup.
