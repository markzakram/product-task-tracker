/* =============================================================================
   skenario.js — urutan pemanggilan yang dijalankan alat banding fungsi tulis.

   Tiap skenario adalah rangkaian langkah yang dijalankan TERPISAH di tiap
   backend, lalu nilai kembalian dan keadaan sesudahnya dibandingkan.

   Tiga aturan yang membentuk cara penulisannya:

   1. PEGANGAN TIDAK DISALIN ANTAR-BACKEND. Sheets memberi nomor baris, MySQL
      memberi id AUTO_INCREMENT; keduanya tak akan pernah sama dan memang tak
      perlu sama. Argumen tiap langkah disusun dari hasil langkah SEBELUMNYA di
      backend yang sama, lewat `ctx`.

   2. TIAP SKENARIO MERAPIKAN JEJAKNYA. Yang dibuat harus dihapus lagi. Alat ini
      dijalankan berulang kali selama penggarapan, dan jejak yang menumpuk membuat
      jalan berikutnya membandingkan keadaan yang sudah tidak sama lagi — lalu
      gagal dengan sebab yang tak ada hubungannya.

   3. JALUR GAGAL IKUT DIUJI. Pesan penolakan dibandingkan juga, karena pesan
      itulah yang dibaca orang di layar.
   ========================================================================== */

/* Dipakai di semua skenario supaya jejaknya mudah dikenali kalau ada yang
   tertinggal karena jalan yang terputus di tengah. */
const UJI = 'ujibanding';
const TANDA = '[ujibanding]';

/* Stempel waktu tak mungkin sama di kedua sisi — nowStamp() dipanggil pada detik
   yang berbeda. Disamarkan, bukan dibuang: yang diperiksa tetap "ada stempel
   yang sah", hanya menit persisnya yang tidak. */
const POLA_STEMPEL = { updatedAt: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/ };

/* Mengambil pegangan baris yang baru dibuat dari daftar yang DIKEMBALIKAN fungsi
   tulisnya sendiri — bukan ditebak, dan bukan dibaca ulang. Yang terakhir milik
   penanda uji, karena fungsi tulisnya menambah di belakang. */
function ambilPegangan(medan, cocok) {
  return (ctx, r) => {
    const daftar = (r && r[medan]) || [];
    const milik = daftar.filter(cocok);
    ctx.pegangan = milik.length ? milik[milik.length - 1].row : 0;
  };
}

const punyaUji = (x) => String(x.user || '').toLowerCase() === UJI;
const bertanda = (x) => String(x.title || '').indexOf(TANDA) === 0;

/* Membuang dashboard bertanda uji yang tersisa, di backend mana pun.

   Dibutuhkan skenario yang MEMANG meninggalkan jejak — yang di Sheets membuat
   baris siluman. Tanpa ini, jejaknya terbawa ke jalan berikutnya dan muncul
   sebagai kegagalan di skenario lain yang tak ada hubungannya. Itu sudah terjadi:
   satu jalan meninggalkan dua baris, jalan berikutnya melaporkan sembilan beda. */
/* Skenario folder menyentuh banyak baris sekaligus, jadi jejaknya tak bisa
   dirapikan dengan satu penghapusan per langkah. Dibersihkan borongan. */
async function bersihkanLinkUji(be) {
  const sisa = (await be.getAllLinks()).filter(punyaUji);
  for (const x of sisa.sort((a, b) => b.row - a.row)) await be.deleteUserLink(UJI, x.row);
}
async function bersihkanNoteUji(be) {
  const sisa = (await be.getAllNotes()).filter(punyaUji);
  for (const x of sisa.sort((a, b) => b.row - a.row)) await be.deleteNote(UJI, x.row);
}

async function bersihkanDashboardUji(be) {
  const daftar = await be.getAllDashboards();
  const sisa = daftar.filter(bertanda);
  /* Dari belakang: di Sheets menghapus satu baris menggeser naik yang di bawahnya. */
  for (const d of sisa.sort((a, b) => b.row - a.row)) await be.deleteDashboard(d.row);
}

const SKENARIO = [
  /* ---------------------------------------------------------------- LINK -- */
  {
    nama: 'addUserLink — tambah lalu hapus',
    periksa: ['getAllLinks'],
    langkah: [
      { fn: 'addUserLink', args: () => [UJI, 'Judul Uji', 'https://contoh.invalid/a', 'FolderUji'],
        simpan: ambilPegangan('links', punyaUji) },
      { fn: 'deleteUserLink', args: (ctx) => [UJI, ctx.pegangan] },
    ],
  },
  {
    nama: 'addUserLink — judul kosong memakai URL',
    periksa: ['getAllLinks'],
    langkah: [
      { fn: 'addUserLink', args: () => [UJI, '', 'https://contoh.invalid/b', ''],
        simpan: ambilPegangan('links', punyaUji) },
      { fn: 'deleteUserLink', args: (ctx) => [UJI, ctx.pegangan] },
    ],
  },
  { ditolak: true, nama: 'addUserLink — URL kosong ditolak', periksa: ['getAllLinks'],
    langkah: [{ fn: 'addUserLink', args: () => [UJI, 'Tanpa URL', '', ''] }] },
  { ditolak: true, nama: 'addUserLink — user kosong ditolak', periksa: ['getAllLinks'],
    langkah: [{ fn: 'addUserLink', args: () => ['', 'Judul', 'https://contoh.invalid/c', ''] }] },
  {
    nama: 'updateUserLink — ubah lalu hapus',
    periksa: ['getAllLinks'],
    langkah: [
      { fn: 'addUserLink', args: () => [UJI, 'Sebelum', 'https://contoh.invalid/d', 'A'],
        simpan: ambilPegangan('links', punyaUji) },
      { fn: 'updateUserLink', args: (ctx) => [UJI, ctx.pegangan, 'Sesudah', 'https://contoh.invalid/d2', 'B'] },
      { fn: 'deleteUserLink', args: (ctx) => [UJI, ctx.pegangan] },
    ],
  },
  {
    nama: 'updateUserLink — milik orang lain ditolak',
    periksa: ['getAllLinks'],
    langkah: [
      { fn: 'addUserLink', args: () => [UJI, 'Punya uji', 'https://contoh.invalid/e', ''],
        simpan: ambilPegangan('links', punyaUji) },
      { fn: 'updateUserLink', args: (ctx) => ['oranglain', ctx.pegangan, 'Dibajak', 'https://jahat.invalid', ''] },
      { fn: 'deleteUserLink', args: (ctx) => [UJI, ctx.pegangan] },
    ],
  },
  { ditolak: true, nama: 'deleteUserLink — pegangan tak masuk akal ditolak', periksa: ['getAllLinks'],
    langkah: [
      { fn: 'deleteUserLink', args: () => [UJI, 0] },
      { fn: 'deleteUserLink', args: () => [UJI, -5] },
      { fn: 'deleteUserLink', args: () => [UJI, 'bukan angka'] },
    ] },
  {
    /* Kasus nyata: halaman yang sudah lama terbuka menekan Hapus untuk link yang
       sementara itu sudah dihapus dari tempat lain.

       Di Sheets ini berbahaya. Menghapus baris membuat baris di bawahnya naik,
       jadi pegangan basi menunjuk baris yang kini ditempati link LAIN. Yang
       menyelamatkan cuma pemeriksaan kepemilikan — dan itu tak menolong kalau
       penggantinya kebetulan milik orang yang sama.

       Di MySQL id tak pernah dipakai ulang. Inilah alasan terkuat memilih id
       sebagai pegangan, dan skenario ini menjaga perbedaannya tetap terlihat. */
    nama: 'deleteUserLink — pegangan basi (hapus dua kali)',
    periksa: ['getAllLinks'],
    langkah: [
      { fn: 'addUserLink', args: () => [UJI, 'Sekali pakai', 'https://contoh.invalid/f', ''],
        simpan: ambilPegangan('links', punyaUji) },
      { fn: 'deleteUserLink', args: (ctx) => [UJI, ctx.pegangan] },
      { fn: 'deleteUserLink', args: (ctx) => [UJI, ctx.pegangan] },
    ],
  },

  /* ------------------------------------------------------------- CATATAN -- */
  {
    nama: 'addNote — tambah lalu hapus',
    periksa: ['getAllNotes'], samarkan: POLA_STEMPEL,
    langkah: [
      { fn: 'addNote', args: () => [UJI, 'Judul catatan', 'Isi catatan uji', 'FolderUji'],
        simpan: ambilPegangan('notes', punyaUji) },
      { fn: 'deleteNote', args: (ctx) => [UJI, ctx.pegangan] },
    ],
  },
  {
    /* Judul kosong diganti "(tanpa judul)" — bukan dibiarkan kosong, karena
       daftar catatan menampilkan judulnya dan baris tanpa judul tak bisa diklik. */
    nama: 'addNote — judul kosong jadi (tanpa judul)',
    periksa: ['getAllNotes'], samarkan: POLA_STEMPEL,
    langkah: [
      { fn: 'addNote', args: () => [UJI, '', 'Hanya isi, tanpa judul', ''],
        simpan: ambilPegangan('notes', punyaUji) },
      { fn: 'deleteNote', args: (ctx) => [UJI, ctx.pegangan] },
    ],
  },
  { ditolak: true, nama: 'addNote — judul dan isi kosong ditolak',
    periksa: ['getAllNotes'], samarkan: POLA_STEMPEL,
    langkah: [{ fn: 'addNote', args: () => [UJI, '', '', 'F'] }] },
  { ditolak: true, nama: 'addNote — user kosong ditolak',
    periksa: ['getAllNotes'], samarkan: POLA_STEMPEL,
    langkah: [{ fn: 'addNote', args: () => ['', 'Judul', 'Isi', ''] }] },
  {
    nama: 'updateNote — ubah lalu hapus',
    periksa: ['getAllNotes'], samarkan: POLA_STEMPEL,
    langkah: [
      { fn: 'addNote', args: () => [UJI, 'Sebelum', 'Isi lama', 'A'],
        simpan: ambilPegangan('notes', punyaUji) },
      { fn: 'updateNote', args: (ctx) => [UJI, ctx.pegangan, 'Sesudah', 'Isi baru', 'B'] },
      { fn: 'deleteNote', args: (ctx) => [UJI, ctx.pegangan] },
    ],
  },
  {
    nama: 'updateNote — milik orang lain ditolak',
    periksa: ['getAllNotes'], samarkan: POLA_STEMPEL,
    langkah: [
      { fn: 'addNote', args: () => [UJI, 'Punya uji', 'Isi', ''],
        simpan: ambilPegangan('notes', punyaUji) },
      { fn: 'updateNote', args: (ctx) => ['oranglain', ctx.pegangan, 'Dibajak', 'Diubah', ''] },
      { fn: 'deleteNote', args: (ctx) => [UJI, ctx.pegangan] },
    ],
  },
  {
    nama: 'deleteNote — pegangan basi (hapus dua kali)',
    periksa: ['getAllNotes'], samarkan: POLA_STEMPEL,
    langkah: [
      { fn: 'addNote', args: () => [UJI, 'Sekali pakai', 'Isi', ''],
        simpan: ambilPegangan('notes', punyaUji) },
      { fn: 'deleteNote', args: (ctx) => [UJI, ctx.pegangan] },
      { fn: 'deleteNote', args: (ctx) => [UJI, ctx.pegangan] },
    ],
  },

  /* ----------------------------------------------------------- DASHBOARD -- */
  {
    /* Dashboard tak punya pemilik, jadi penanda uji ditaruh di judulnya. */
    nama: 'addDashboard — tambah lalu hapus',
    periksa: ['getAllDashboards'],
    langkah: [
      { fn: 'addDashboard', args: () => [TANDA + ' Satu', 'Keterangan', 'chart', 'https://contoh.invalid/d1'],
        simpan: ambilPegangan('dashboards', bertanda) },
      { fn: 'deleteDashboard', args: (ctx) => [ctx.pegangan] },
    ],
  },
  {
    nama: 'addDashboard — ikon kosong jadi dashboard',
    periksa: ['getAllDashboards'],
    langkah: [
      { fn: 'addDashboard', args: () => [TANDA + ' Dua', '', '', 'https://contoh.invalid/d2'],
        simpan: ambilPegangan('dashboards', bertanda) },
      { fn: 'deleteDashboard', args: (ctx) => [ctx.pegangan] },
    ],
  },
  { ditolak: true, nama: 'addDashboard — judul kosong ditolak', periksa: ['getAllDashboards'],
    langkah: [{ fn: 'addDashboard', args: () => ['', 'Ket', 'chart', 'https://contoh.invalid/d3'] }] },
  { ditolak: true, nama: 'addDashboard — URL kosong ditolak', periksa: ['getAllDashboards'],
    langkah: [{ fn: 'addDashboard', args: () => [TANDA + ' Tiga', 'Ket', 'chart', ''] }] },
  {
    nama: 'updateDashboard — ubah lalu hapus',
    periksa: ['getAllDashboards'],
    langkah: [
      { fn: 'addDashboard', args: () => [TANDA + ' Empat', 'Lama', 'chart', 'https://contoh.invalid/d4'],
        simpan: ambilPegangan('dashboards', bertanda) },
      { fn: 'updateDashboard', args: (ctx) => [ctx.pegangan, TANDA + ' Empat diubah', 'Baru', 'map', 'https://contoh.invalid/d4b'] },
      { fn: 'deleteDashboard', args: (ctx) => [ctx.pegangan] },
    ],
  },
  { ditolak: true, nama: 'updateDashboard — judul kosong ditolak', periksa: ['getAllDashboards'],
    langkah: [{ fn: 'updateDashboard', args: () => [5, '', 'Ket', 'chart', 'https://contoh.invalid/d5'] }] },
  { ditolak: true, nama: 'deleteDashboard — pegangan tak masuk akal ditolak', periksa: ['getAllDashboards'],
    langkah: [
      { fn: 'deleteDashboard', args: () => [0] },
      { fn: 'deleteDashboard', args: () => [-5] },
      { fn: 'deleteDashboard', args: () => ['bukan angka'] },
    ] },
  {
    /* Skenario ini MEMANG berbeda hasilnya, dan itulah gunanya.

       updateDashboard tak memeriksa keberadaan baris sama sekali — ditiru apa
       adanya dari v1. Tapi akibatnya berlainan untuk pegangan yang sudah basi:

         Sheets : valuesUpdate menulis ke baris itu APA PUN isinya, termasuk
                  baris di luar data. Muncul dashboard siluman yang tak pernah
                  ditambahkan siapa pun.
         MySQL  : UPDATE ... WHERE id = ? tak mengenai apa pun.

       Keduanya mengembalikan success, jadi layar tak memberi tanda apa-apa.
       Perbedaannya hanya terlihat dari keadaan sesudahnya — dan yang di MySQL
       yang benar. Terbukti di staging: baris "[ujibanding] Hantu" betul-betul
       tercipta di sheet. */
    nama: 'updateDashboard — pegangan basi (bikin baris siluman)',
    periksa: ['getAllDashboards'],
    bedaSengaja: 'Sheets menulis dashboard siluman untuk pegangan basi; MySQL tidak. '
      + 'Yang di MySQL yang benar — perbedaan ini tidak diperbaiki agar v1 ditiru apa adanya.',
    bersihkan: bersihkanDashboardUji,
    langkah: [
      { fn: 'addDashboard', args: () => [TANDA + ' Lima', 'Ket', 'chart', 'https://contoh.invalid/d6'],
        simpan: ambilPegangan('dashboards', bertanda) },
      { fn: 'deleteDashboard', args: (ctx) => [ctx.pegangan] },
      { fn: 'updateDashboard', args: (ctx) => [ctx.pegangan, TANDA + ' Hantu', 'Ket', 'chart', 'https://contoh.invalid/hantu'] },
    ],
  },
];

/* ------------------------------------------------------------------ FOLDER -- */
/* Operasi folder menyentuh BANYAK baris sekaligus — yang pertama begitu. Karena
   itu yang diuji bukan cuma hasil akhirnya, tapi juga hitungan `changed`, yang
   muncul di pesan yang dibaca orang ("3 link dipindah ke Umum"). */

const isiFolderLink = [
  { fn: 'addUserLink', args: () => [UJI, 'L1', 'https://contoh.invalid/f1', 'Riset'] },
  { fn: 'addUserLink', args: () => [UJI, 'L2', 'https://contoh.invalid/f2', 'Riset'] },
  /* Huruf kecil, sengaja: _sheets.js mencocokkan folder PEKA huruf besar-kecil
     (`f === oldFolder`), sedangkan collation MySQL buta huruf besar-kecil. Baris
     ini yang akan ketahuan kalau `BINARY` lupa dipasang. */
  { fn: 'addUserLink', args: () => [UJI, 'L3', 'https://contoh.invalid/f3', 'riset'] },
  { fn: 'addUserLink', args: () => [UJI, 'L4', 'https://contoh.invalid/f4', 'Lain'] },
];

const isiFolderNote = [
  { fn: 'addNote', args: () => [UJI, 'N1', 'isi', 'Riset'] },
  { fn: 'addNote', args: () => [UJI, 'N2', 'isi', 'Riset'] },
  { fn: 'addNote', args: () => [UJI, 'N3', 'isi', 'riset'] },
];

SKENARIO.push(
  {
    nama: 'renameUserFolder — hanya yang persis sama huruf besar-kecilnya',
    periksa: ['getAllLinks'], bersihkan: bersihkanLinkUji,
    langkah: isiFolderLink.concat([
      { fn: 'renameUserFolder', args: () => [UJI, 'Riset', 'Riset Baru'] },
    ]),
  },
  {
    /* Nama user TIDAK peka huruf besar-kecil — kebalikan dari nama folder. */
    nama: 'renameUserFolder — nama user tak peka huruf besar-kecil',
    periksa: ['getAllLinks'], bersihkan: bersihkanLinkUji,
    langkah: isiFolderLink.concat([
      { fn: 'renameUserFolder', args: () => [UJI.toUpperCase(), 'Riset', 'Dari Huruf Besar'] },
    ]),
  },
  {
    /* Diganti dengan nama yang SAMA PERSIS. Sheets tetap menghitungnya sebagai
       berubah; affectedRows MySQL akan melaporkan nol kalau hitungannya diambil
       dari hasil UPDATE, bukan dihitung lebih dulu. */
    nama: 'renameUserFolder — nama baru sama dengan yang lama',
    periksa: ['getAllLinks'], bersihkan: bersihkanLinkUji,
    langkah: isiFolderLink.concat([
      { fn: 'renameUserFolder', args: () => [UJI, 'Riset', 'Riset'] },
    ]),
  },
  {
    nama: 'renameUserFolder — folder yang tak ada, changed nol',
    periksa: ['getAllLinks'], bersihkan: bersihkanLinkUji,
    langkah: isiFolderLink.concat([
      { fn: 'renameUserFolder', args: () => [UJI, 'TidakAda', 'Baru'] },
    ]),
  },
  {
    /* Folder dihapus, isinya TIDAK. Link pindah ke akar. */
    nama: 'deleteUserFolder — isinya dipindah, bukan dihapus',
    periksa: ['getAllLinks'], bersihkan: bersihkanLinkUji,
    langkah: isiFolderLink.concat([
      { fn: 'deleteUserFolder', args: () => [UJI, 'Riset'] },
    ]),
  },
  { ditolak: true, nama: 'renameUserFolder — folder baru kosong ditolak', periksa: ['getAllLinks'],
    langkah: [{ fn: 'renameUserFolder', args: () => [UJI, 'Riset', ''] }] },
  { ditolak: true, nama: 'renameUserFolder — user kosong ditolak', periksa: ['getAllLinks'],
    langkah: [{ fn: 'renameUserFolder', args: () => ['', 'Riset', 'Baru'] }] },
  { ditolak: true, nama: 'deleteUserFolder — folder kosong ditolak', periksa: ['getAllLinks'],
    langkah: [{ fn: 'deleteUserFolder', args: () => [UJI, ''] }] },

  {
    nama: 'renameNoteFolder — hanya yang persis sama huruf besar-kecilnya',
    periksa: ['getAllNotes'], samarkan: POLA_STEMPEL, bersihkan: bersihkanNoteUji,
    langkah: isiFolderNote.concat([
      { fn: 'renameNoteFolder', args: () => [UJI, 'Riset', 'Riset Baru'] },
    ]),
  },
  {
    nama: 'deleteNoteFolder — isinya dipindah, bukan dihapus',
    periksa: ['getAllNotes'], samarkan: POLA_STEMPEL, bersihkan: bersihkanNoteUji,
    langkah: isiFolderNote.concat([
      { fn: 'deleteNoteFolder', args: () => [UJI, 'Riset'] },
    ]),
  },
  { ditolak: true, nama: 'renameNoteFolder — folder asal kosong ditolak',
    periksa: ['getAllNotes'], samarkan: POLA_STEMPEL,
    langkah: [{ fn: 'renameNoteFolder', args: () => [UJI, '', 'Baru'] }] },
  { ditolak: true, nama: 'deleteNoteFolder — user kosong ditolak',
    periksa: ['getAllNotes'], samarkan: POLA_STEMPEL,
    langkah: [{ fn: 'deleteNoteFolder', args: () => ['', 'Riset'] }] },
);

/* ------------------------------------------------------- OPSI & KOMENTAR -- */
/* Kelompok ini punya dua kendala yang tak ada di kelompok sebelumnya.

   1. TAK ADA JALAN MENGHAPUS. `deleteOption` hanya menonaktifkan, dan komentar
      tak punya fungsi hapus sama sekali. Jadi baris uji MENUMPUK di spreadsheet
      uji. Itu tidak merusak perbandingan — `--siapkan` menyalin staging ke MySQL
      tiap jalan, sehingga kedua sisi menumpuk hal yang sama — tapi tetap perlu
      disebut, dan nilainya diberi awalan yang mencolok supaya jelas asalnya.

   2. CELAH YANG DISENGAJA: `editOption` untuk tipe tanpa induk mengganti nama
      opsi DI SELURUH TASK. Di sini ia diuji dengan nilai baru yang belum dipakai
      task mana pun, jadi yang terbukti baru mekanismenya — bukan akibatnya pada
      task. Mengujinya dengan nilai sungguhan berarti mengubah ratusan task
      staging massal, dan pembalikannya tak bisa dijamin kalau jalannya terputus.
      Celah ini ditutup saat `saveTask` sudah pindah: nanti task uji bisa dibuat
      sendiri, dipakai, lalu dibuang. */

const OPSI = 'ZZUjiBanding';
const TUGAS_UJI = 'TSK-UJIBANDING';

SKENARIO.push(
  {
    nama: 'saveOption — tambah, nonaktifkan, nyalakan lagi',
    periksa: ['getOptions'],
    langkah: [
      { fn: 'saveOption', args: () => ['platform', OPSI, ''] },
      { fn: 'deleteOption', args: () => ['platform', OPSI, ''] },
      /* Yang sudah ada dinyalakan kembali, bukan ditambah lagi — kalau ditambah,
         dropdown menampilkan nilai yang sama dua kali. */
      { fn: 'saveOption', args: () => ['platform', OPSI, ''] },
      { fn: 'deleteOption', args: () => ['platform', OPSI, ''] },
    ],
  },
  {
    nama: 'saveOption — nilai sama beda huruf besar-kecil dianggap satu',
    periksa: ['getOptions'],
    langkah: [
      { fn: 'saveOption', args: () => ['platform', OPSI, ''] },
      { fn: 'saveOption', args: () => ['platform', OPSI.toLowerCase(), ''] },
      { fn: 'deleteOption', args: () => ['platform', OPSI, ''] },
    ],
  },
  { ditolak: true, nama: 'saveOption — tipe tak dikenal ditolak', periksa: ['getOptions'],
    langkah: [{ fn: 'saveOption', args: () => ['bukantipe', OPSI, ''] }] },
  { ditolak: true, nama: 'saveOption — nilai kosong ditolak', periksa: ['getOptions'],
    langkah: [{ fn: 'saveOption', args: () => ['platform', '', ''] }] },
  { ditolak: true, nama: 'saveOption — verb tanpa induk ditolak', periksa: ['getOptions'],
    langkah: [{ fn: 'saveOption', args: () => ['verb', OPSI, ''] }] },
  {
    /* Verb memakai induk, jadi editOption keluar lebih awal dan TIDAK menyentuh
       task sama sekali — nama task lama sengaja dibiarkan. */
    nama: 'saveOption + editOption — verb dengan induk',
    periksa: ['getOptions'],
    langkah: [
      { fn: 'saveOption', args: () => ['verb', OPSI, 'Kreatif'] },
      { fn: 'editOption', args: () => ['verb', OPSI, OPSI + ' Baru', 'Kreatif'] },
      /* Dikembalikan supaya barisnya dipakai ulang jalan berikutnya, bukan
         ditinggalkan jadi baris baru yang menumpuk. */
      { fn: 'editOption', args: () => ['verb', OPSI + ' Baru', OPSI, 'Kreatif'] },
      { fn: 'deleteOption', args: () => ['verb', OPSI, 'Kreatif'] },
    ],
  },
  {
    /* Tipe tanpa induk: editOption juga mengganti nilainya di seluruh task dan
       mengembalikan `tasks`. Di sini nol task terkena — lihat catatan celah. */
    nama: 'editOption — tipe tanpa induk mengembalikan tasks juga',
    periksa: ['getOptions'],
    langkah: [
      { fn: 'saveOption', args: () => ['platform', OPSI, ''] },
      { fn: 'editOption', args: () => ['platform', OPSI, OPSI + ' Baru', ''] },
      { fn: 'editOption', args: () => ['platform', OPSI + ' Baru', OPSI, ''] },
      { fn: 'deleteOption', args: () => ['platform', OPSI, ''] },
    ],
  },
  { ditolak: true, nama: 'editOption — opsi tak ketemu ditolak', periksa: ['getOptions'],
    langkah: [{ fn: 'editOption', args: () => ['platform', 'TidakAdaSamaSekali', 'Baru', ''] }] },
  { ditolak: true, nama: 'editOption — nilai baru kosong ditolak', periksa: ['getOptions'],
    langkah: [{ fn: 'editOption', args: () => ['platform', OPSI, '', ''] }] },
  { ditolak: true, nama: 'deleteOption — yang tak ada tetap dianggap berhasil', periksa: ['getOptions'],
    langkah: [{ fn: 'deleteOption', args: () => ['platform', 'TidakAdaSamaSekali', ''] }] },

  { ditolak: true, nama: 'reorderOptions — bukan Manager ditolak', periksa: ['getOptions'],
    langkah: [{ fn: 'reorderOptions', args: () => ['platform', ['A', 'B'], 'ujibanding'] }] },
  { ditolak: true, nama: 'reorderOptions — jenis kosong ditolak', periksa: ['getOptions'],
    langkah: [{ fn: 'reorderOptions', args: () => ['', ['A'], 'Nynda (PM)'] }] },

  {
    /* Komentar tak punya fungsi hapus di v1 — tak ada jalan membersihkannya
       lewat antarmuka yang sama. Barisnya menumpuk di spreadsheet uji, dan itu
       dinyatakan di sini supaya terbaca sebagai konsekuensi yang diketahui,
       bukan pembersihan yang kelupaan. Perbandingannya tetap sah karena
       --siapkan menyalin staging ke MySQL tiap jalan: kedua sisi menumpuk
       baris yang sama. */
    menumpuk: 'addComment tak punya pasangan hapus di v1; barisnya tertinggal di sheet uji',
    nama: 'addComment — komentar biasa',
    periksa: [['getComments', TUGAS_UJI], ['getNotifications', UJI]], samarkan: { timestamp: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/ },
    langkah: [
      { fn: 'addComment', args: () => [{ taskId: TUGAS_UJI, author: UJI, message: 'Komentar uji banding' }] },
    ],
  },
  { ditolak: true, nama: 'addComment — pesan kosong ditolak', periksa: [['getComments', TUGAS_UJI]],
    langkah: [{ fn: 'addComment', args: () => [{ taskId: TUGAS_UJI, author: UJI, message: '' }] }] },
  { ditolak: true, nama: 'addComment — tanpa task id ditolak', periksa: [['getComments', TUGAS_UJI]],
    langkah: [{ fn: 'addComment', args: () => [{ taskId: '', author: UJI, message: 'Halo' }] }] },

  {
    /* Menandai sudah dibaca untuk user yang tak punya notifikasi: aman dijalankan
       berulang, dan membuktikan jalur baseName-nya ("Nynda (PM)" -> "nynda"). */
    nama: 'markNotificationsRead — user tanpa notifikasi',
    periksa: [['getNotifications', UJI]],
    langkah: [
      { fn: 'markNotificationsRead', args: () => [UJI, ''] },
      { fn: 'markNotificationsRead', args: () => [UJI, TUGAS_UJI] },
    ],
  },
);

module.exports = { SKENARIO, UJI, TANDA, OPSI, TUGAS_UJI };
