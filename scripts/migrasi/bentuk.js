/* =============================================================================
   bentuk.js — satu-satunya tempat yang tahu bentuk data v1.

   Dipakai tarik.js (membaca sheet) dan muat.js (menulis MySQL). Kalau ada kolom
   yang salah, salahnya cukup diperbaiki di satu tempat.

   Pengubah tipenya sengaja MEMANGGIL formatDate() milik api/_sheets.js, bukan
   menulis ulang rumus serial Sheets. Rumus itu punya satu konstanta (25569) yang
   kalau meleset satu hari akan menggeser SELURUH tanggal di sistem tanpa ada yang
   terlihat salah. Menyalinnya berarti punya dua sumber kebenaran yang bisa berbeda.
   ========================================================================== */

const { _internals } = require('../../api/_sheets.js');
const { formatDate } = _internals;

/* Satu-satunya yang memang harus disalin: serialWaras() tidak diekspor.
   Sebagian stempel lama tersimpan sebagai bilangan bulat yang kehilangan titik
   desimalnya (46225.5674... jadi 46225567488...). Tanpa ini, 145 nilai "Done At"
   terbaca sebagai tahun yang mustahil lalu jadi NULL tanpa ada yang tahu. */
function serialWaras(n) {
  if (!(n > 100000)) return n;
  const d = String(Math.trunc(n));
  return Number(d.slice(0, 5) + '.' + d.slice(5));
}

const RE_TGL = /^\d{4}-\d{2}-\d{2}$/;
const RE_STEMPEL = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

/* Pengubah tipe. Masing-masing boleh mencatat keluhan lewat `catat`, dan TETAP
   mengembalikan nilai yang bisa dimuat. Prinsipnya: jangan pernah menggugurkan
   satu baris hanya karena satu selnya aneh — catat, lanjutkan, biar orangnya
   yang memutuskan nanti sambil melihat daftarnya. */
const T = {
  teks: (v) => (v === null || v === undefined ? '' : String(v).trim()),

  angka: (v) => Number(v || 0) || 0,

  bool: (v) => (v === true || String(v == null ? '' : v).trim().toUpperCase() === 'TRUE' ? 1 : 0),

  tgl: (v, catat, di) => {
    if (v === '' || v === null || v === undefined) return null;
    const s = formatDate(v, false);
    if (RE_TGL.test(s)) return s;
    catat(di + ': bukan tanggal, dikosongkan — isi aslinya ' + JSON.stringify(v));
    return null;
  },

  /* isChecked(): dipakai _sheets.js untuk kolom Done ceklis, Done proses, dan Read
     notifikasi. Ia menerima lima bentuk, bukan satu — 'TRUE' saja tidak cukup.
     Kalau ada yang pernah mengetik 'ya' atau 'x' di sheet, T.bool akan membacanya
     sebagai BELUM, dan pekerjaan yang sudah selesai tampak belum dikerjakan. */
  boolDicentang: (v) => {
    const s = (v === null || v === undefined ? '' : String(v)).trim().toLowerCase();
    return (s === 'true' || s === 'ya' || s === 'yes' || s === '1' || s === 'x') ? 1 : 0;
  },

  /* Daftar penyangkal: dipakai kolom Mirror pada collab dan paket. Aturannya
     TERBALIK dari yang lain — apa pun yang BUKAN salah satu kata penyangkal
     dianggap menyala. Jadi 'ya' menyala, dan kebetulan 'TRUE' juga menyala,
     sehingga perbedaannya tak terlihat sampai ada yang mengetik kata lain. */
  boolSangkalan: (v) => {
    const s = (v === null || v === undefined ? '' : String(v)).trim().toLowerCase();
    return ['', 'tidak', 'no', 'false', '0'].includes(s) ? 0 : 1;
  },

  /* Kolom "Active" punya DUA arti berbeda di v1, dan bedanya tak terlihat dari
     nama kolomnya:

       OPTIONS : kosong berarti TIDAK aktif   (r[2] === true || 'TRUE')
       USERS   : kosong berarti AKTIF         (r[2] === '' ? true : r[2] !== 'false')

     Memakai T.bool untuk keduanya akan diam-diam menonaktifkan setiap pengguna
     yang sel Active-nya dibiarkan kosong. Hari ini kebetulan tak ada, jadi
     salahnya tak terlihat — sampai ada satu pengguna baru ditambahkan begitu. */
  boolBawaanYa: (v) => {
    const s = (v === null || v === undefined ? '' : String(v)).trim();
    if (s === '') return 1;
    return s.toLowerCase() === 'false' ? 0 : 1;
  },

  /* Khusus kolom rujukan paket yang BOLEH kosong (collabs.paket_id).

     Dua jebakan sekaligus di sini, dan keduanya hanya terlihat sesudah data
     sungguhan ditarik:

     1. String kosong BUKAN NULL. Kunci asing akan mencari paket ber-ID "" ,
        tak menemukannya, lalu menolak barisnya. Di data sungguhan 24 dari 25
        collab memang kosong kolom ini — semuanya akan gugur.

     2. Kolom J di sheet COLLAB ditambahkan belakangan sebagai "Paket ID".
        Baris-baris lama sudah mengisi kolom itu untuk keperluan lain, jadi
        isinya bisa apa saja — misalnya "Develop Konten (materi/soal)". Itu
        warisan, bukan rujukan. Dilepas, dan dicatat supaya terlihat. */
  idPaket: (v, catat, di) => {
    const s = (v === null || v === undefined ? '' : String(v)).trim();
    if (!s) return null;
    if (/^PKG-\d+$/i.test(s)) return s;
    catat(di + ': bukan ID paket, tautannya dilepas — isi aslinya ' + JSON.stringify(s));
    return null;
  },

  stempel: (v, catat, di) => {
    if (v === '' || v === null || v === undefined) return null;
    /* serialWaras hanya berlaku untuk angka; teks dibiarkan apa adanya. */
    const s = formatDate(typeof v === 'number' ? serialWaras(v) : v, true);
    if (RE_STEMPEL.test(s)) return s + ':00';
    catat(di + ': bukan stempel waktu, dikosongkan — isi aslinya ' + JSON.stringify(v));
    return null;
  },
};

/* -----------------------------------------------------------------------------
   18 tabel, URUT SESUAI URUTAN MUAT. Induk selalu sebelum anaknya, karena kunci
   asing di MySQL ditegakkan saat INSERT, bukan belakangan.

   `rentang` memakai notasi Sheets. Perhatikan `Main` mulai dari B, bukan A:
   kolom A di sheet itu memang tak pernah dipakai v1.
   -------------------------------------------------------------------------- */
const TABEL = [
  { tabel: 'users', sheet: 'USERS', rentang: 'A2:C', wajib: 'nama',
    kolom: [['nama', T.teks], ['peran', T.teks], ['aktif', T.boolBawaanYa]] },

  { tabel: 'options', sheet: 'OPTIONS', rentang: 'A2:E', wajib: 'nilai',
    kolom: [['tipe', T.teks], ['nilai', T.teks], ['aktif', T.bool],
            ['induk', T.teks], ['urutan', T.angka]] },

  { tabel: 'dashboards', sheet: 'DASHBOARDS', rentang: 'A2:D', wajib: 'title',
    kolom: [['title', T.teks], ['deskripsi', T.teks], ['icon', T.teks], ['url', T.teks]] },

  { tabel: 'auth_pins', sheet: 'AUTH', rentang: 'A2:B', wajib: 'user_nama',
    kolom: [['user_nama', T.teks], ['pin_hash', T.teks]] },

  { tabel: 'user_links', sheet: 'LINKS', rentang: 'A2:D', wajib: 'user_nama',
    kolom: [['user_nama', T.teks], ['title', T.teks], ['url', T.teks],
            ['folder', T.teks]] },

  { tabel: 'user_notes', sheet: 'NOTES', rentang: 'A2:E', wajib: 'user_nama',
    kolom: [['user_nama', T.teks], ['title', T.teks], ['body', T.teks],
            ['updated_at', T.stempel], ['folder', T.teks]] },

  { tabel: 'packages', sheet: 'PACKAGES', rentang: 'A2:T', wajib: 'paket_id',
    kolom: [['paket_id', T.teks], ['platform', T.teks], ['marsel_pic', T.teks],
            ['program', T.teks], ['nama_paket', T.teks], ['tagline', T.teks],
            ['benefit', T.teks], ['tanggal', T.teks], ['tujuan', T.teks],
            ['produk_pic', T.teks], ['dibimbing', T.teks], ['latsol', T.teks],
            ['materi', T.teks], ['tryout', T.teks], ['drilling', T.teks],
            ['live_class', T.teks], ['catatan', T.teks], ['updated_by', T.teks],
            ['updated_at', T.stempel], ['mirror', T.boolSangkalan]] },

  { tabel: 'package_items', sheet: 'PACKAGE_ITEMS', rentang: 'A2:J', wajib: 'item_id',
    kolom: [['item_id', T.teks], ['paket_id', T.teks], ['urutan', T.angka],
            ['kategori', T.teks], ['grup', T.teks], ['nama', T.teks],
            ['target', T.angka], ['satuan', T.teks], ['awal', T.angka],
            ['catatan', T.teks]] },

  { tabel: 'package_links', sheet: 'PACKAGE_LINKS', rentang: 'A2:D', wajib: 'paket_id',
    kolom: [['paket_id', T.teks], ['urutan', T.angka], ['label', T.teks], ['url', T.teks]] },

  { tabel: 'package_variants', sheet: 'PACKAGE_VARIANTS', rentang: 'A2:F', wajib: 'paket_id',
    kolom: [['paket_id', T.teks], ['urutan', T.angka], ['masa_aktif', T.teks],
            ['harga_awal', T.angka], ['harga_diskon', T.angka], ['status', T.teks]] },

  { tabel: 'collabs', sheet: 'COLLAB', rentang: 'A2:K', wajib: 'collab_id',
    kolom: [['collab_id', T.teks], ['platform', T.teks], ['title', T.teks],
            ['description', T.teks], ['created_by', T.teks], ['created_at', T.stempel],
            ['deadline', T.tgl], ['tipe', T.teks], ['color', T.teks],
            ['paket_id', T.idPaket], ['mirror', T.boolSangkalan]] },

  { tabel: 'collab_steps', sheet: 'COLLAB_STEPS', rentang: 'A2:K', wajib: 'collab_id',
    kolom: [['collab_id', T.teks], ['urutan', T.angka], ['step', T.teks],
            ['pic', T.teks], ['deadline', T.tgl], ['done', T.boolDicentang],
            ['done_by', T.teks], ['done_at', T.stempel], ['note', T.teks],
            ['stage', T.teks], ['link', T.teks]] },

  { tabel: 'package_contribs', sheet: 'PACKAGE_CONTRIB', rentang: 'A2:F', wajib: 'item_id',
    kolom: [['paket_id', T.teks], ['item_id', T.teks], ['collab_id', T.teks],
            ['step_order', T.angka], ['jumlah', T.angka], ['catatan', T.teks]] },

  /* Main satu-satunya sheet yang judulnya TIDAK di baris 1: CONFIG.HEADER_ROW = 3
     dan FIRST_DATA_ROW = 4. Membaca dari B2 memungut barisan judul sebagai task
     ber-ID harfiah "Task ID" — dan ia lolos semua pemeriksaan bentuk. */
  { tabel: 'tasks', sheet: 'Main', rentang: 'B4:W', wajib: 'task_id',
    kolom: [['task_id', T.teks], ['created_date', T.tgl], ['due_date', T.tgl],
            ['status', T.teks], ['kesulitan', T.teks], ['task_name', T.teks],
            ['stage', T.teks], ['platform', T.teks], ['pic', T.teks],
            ['support', T.teks], ['document', T.teks], ['pic_notes', T.teks],
            ['pm_notes', T.teks], ['divisi_tujuan', T.teks], ['kontak_divisi', T.teks],
            ['kata_kerja', T.teks], ['jumlah', T.teks], ['objek', T.teks],
            ['detail', T.teks], ['dibuat_oleh', T.teks], ['lintas_view', T.teks],
            ['status_by', T.teks]] },

  { tabel: 'checklists', sheet: 'CHECKLIST', rentang: 'A2:G', wajib: 'task_id',
    kolom: [['task_id', T.teks], ['item', T.teks], ['done', T.boolDicentang],
            ['created_by', T.teks], ['checked_by', T.teks],
            ['checked_at', T.stempel], ['link', T.teks]] },

  { tabel: 'comments', sheet: 'COMMENTS', rentang: 'A2:D', wajib: 'task_id',
    kolom: [['dibuat_at', T.stempel], ['task_id', T.teks], ['author', T.teks],
            ['message', T.teks]] },

  /* wajib terjadi_at: catatan aktivitas tanpa waktu bukan catatan aktivitas, dan
     kolomnya pun NOT NULL di DDL. Ini menyaring ribuan baris jalaran formula yang
     hanya berisi angka di satu kolom — tak satu pun punya user atau aksi. */
  { tabel: 'activity_log', sheet: 'ACTIVITY', rentang: 'A2:G', wajib: 'terjadi_at',
    kolom: [['terjadi_at', T.stempel], ['user_nama', T.teks], ['action', T.teks],
            ['task_id', T.teks], ['detail', T.teks], ['status_lama', T.teks],
            ['status_baru', T.teks]] },

  { tabel: 'notifications', sheet: 'NOTIFICATIONS', rentang: 'A2:H', wajib: 'id',
    kolom: [['id', T.teks], ['for_user', T.teks], ['tipe', T.teks], ['ref_id', T.teks],
            ['dari', T.teks], ['teks', T.teks], ['dibuat_at', T.stempel],
            ['dibaca', T.boolDicentang]] },
];

/* Mengubah satu baris sheet jadi satu objek siap-muat. Nomor barisnya ikut dibawa
   supaya keluhan apa pun bisa ditunjuk balik ke baris aslinya di spreadsheet —
   tanpa itu, "ada tanggal rusak" tak bisa ditindaklanjuti siapa pun. */
function petikBaris(spek, baris, nomorBaris, keluhan) {
  const o = {};
  const catat = (pesan) => keluhan.push(spek.sheet + '!' + nomorBaris + ' ' + pesan);
  spek.kolom.forEach(([nama, ubah, bawaan], i) => {
    let nilai = ubah(baris[i], catat, nama);
    if ((nilai === '' || nilai === null) && bawaan !== undefined) nilai = bawaan;
    o[nama] = nilai;
  });
  o.__baris = nomorBaris;
  return o;
}

/* Baris kosong di ekor sheet itu lumrah, bukan kesalahan — tak perlu dikeluhkan. */
function barisKosong(baris) {
  return !baris || baris.every(s => s === '' || s === null || s === undefined);
}

module.exports = { TABEL, T, petikBaris, barisKosong, serialWaras };
