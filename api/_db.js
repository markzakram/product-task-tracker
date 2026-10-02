/**
 * ============================================================
 *  api/_db.js — lapisan data MySQL, pengganti ./_sheets.js
 *
 *  Tanda tangan fungsinya IDENTIK dengan _sheets.js, sehingga
 *  api/rpc.js cukup mengganti satu baris require-nya. 64 titik
 *  panggilan tidak tersentuh.
 *
 *  ATURAN YANG TIDAK BOLEH DILANGGAR DI BERKAS INI
 *
 *  Tirukan keluaran _sheets.js PERSIS, termasuk yang terlihat
 *  salah. Frontend sudah terlanjur bergantung pada bentuknya.
 *  Contohnya nyata: getTasks() mengembalikan `mirror` sebagai
 *  STRING, getCollabs() mengembalikannya sebagai BOOLEAN,
 *  padahal di DDL keduanya BOOLEAN. Merapikannya di sini akan
 *  memecahkan frontend tanpa ada yang tahu sebabnya.
 *
 *  Merapikan tipe dan memperbaiki frontend boleh menyusul —
 *  sebagai pekerjaan tersendiri, dengan ujinya sendiri. Yang
 *  tidak boleh adalah mencampurnya dengan peralihan backend,
 *  karena saat ada yang rusak tak ada yang tahu mana sebabnya.
 *
 *  Penilainya bukan pembacaan mata:
 *      node scripts/banding/jalan.js
 *
 *  Status: kelompok pertama (5 dari 64 fungsi baca).
 * ============================================================
 */

const mysql = require('mysql2/promise');

/* ------------------------------------------------------------------ */
/* Sambungan                                                           */
/* ------------------------------------------------------------------ */

/* Pool disimpan di lingkup MODUL, bukan dibuat per pemanggilan. Instance
   serverless Vercel hidup beberapa saat setelah request selesai, jadi pool di
   sini ikut dipakai ulang oleh request berikutnya yang kebetulan mendarat di
   instance yang sama.

   Ini bukan sekadar soal kecepatan. Server ini `max_connections` 150 dengan 62
   sudah terpakai tim lain, dan pernah menyentuh 208 — artinya batasnya memang
   pernah tertabrak. Membuka sambungan baru tiap request akan menghabiskannya,
   dan yang pertama gagal belum tentu aplikasi ini. */
let _pool = null;

function pool() {
  if (_pool) return _pool;
  for (const k of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']) {
    if (!process.env[k]) throw new Error('Env ' + k + ' belum diset.');
  }
  _pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    /* Kecil, dan disengaja. Satu instance tak perlu banyak sambungan serentak;
       yang dibutuhkan adalah BANYAK instance masing-masing memakai sedikit. */
    connectionLimit: Number(process.env.MYSQL_POOL || 2),
    waitForConnections: true,
    enableKeepAlive: true,
    /* Servernya diakses lewat IP publik dan `require_secure_transport` mati,
       artinya tanpa baris ini kata sandi melintas terbuka. rejectUnauthorized
       false berarti terenkripsi tapi identitas server tak diverifikasi — isi
       MYSQL_CA kalau IT sudah memberi berkas CA-nya. */
    ssl: process.env.MYSQL_CA
      ? { ca: require('fs').readFileSync(process.env.MYSQL_CA) }
      : { rejectUnauthorized: false },
    /* Tanggal dikembalikan sebagai teks, bukan objek Date. Objek Date akan
       digeser ke zona waktu proses — dan proses Vercel berjalan di UTC,
       sedangkan seluruh data ini ditulis dalam waktu WIB. */
    dateStrings: true,
    charset: 'utf8mb4_0900_ai_ci',
  });
  return _pool;
}

async function q(sql, args) {
  const [baris] = await pool().query(sql, args || []);
  return baris;
}

/* ------------------------------------------------------------------ */
/* Penyelaras bentuk                                                   */
/* ------------------------------------------------------------------ */

const teks = (v) => (v === null || v === undefined ? '' : String(v));

/* _sheets.js memakai stampStr(), yang menghasilkan "YYYY-MM-DD HH:MM" — TANPA
   detik — dan "" untuk yang kosong. MySQL mengembalikan "YYYY-MM-DD HH:MM:SS".
   Dua karakter beda, dan frontend menampilkannya apa adanya. */
const stempel = (v) => (v ? String(v).slice(0, 16) : '');

/* Kolom `row` di keluaran _sheets.js adalah nomor baris spreadsheet, dan di sini
   diisi id AUTO_INCREMENT.

   Ini bukan akal-akalan. Frontend memperlakukan nilai itu sebagai pegangan buram:
   ia hanya meneruskannya balik — deleteNote(n.row), editLink(l.row) — tanpa
   pernah menghitung atau menampilkannya. Jadi nilainya boleh apa saja asalkan
   backend menerima kembali hal yang sama.

   Id MySQL malah lebih baik daripada nomor baris: ia tak pernah bergeser ketika
   ada yang dihapus, sedangkan nomor baris bergeser — dan itu persis sebab
   penyuntingan bisa mengenai baris yang salah. */
const pegangan = (id) => Number(id);

/* ------------------------------------------------------------------ */
/* Kelompok 1 — daftar sederhana, tanpa struktur bersarang             */
/* ------------------------------------------------------------------ */

/* Catatan soal argumen `pre`: di _sheets.js ia berisi baris yang sudah diambil
   lebih dulu oleh getBootstrapData, supaya sheet yang sama tak dibaca dua kali.
   Di MySQL penghematan itu tak berlaku — satu kueri berindeks jauh lebih murah
   daripada satu panggilan API Sheets. Argumennya tetap diterima supaya tanda
   tangannya cocok, lalu diabaikan. */

/* `users` tidak punya kolom id: kunci utamanya `nama`, karena seluruh data lain
   menunjuk orang lewat NAMANYA, bukan id. Itu kenyataan v1 dan tidak diubah.

   Akibatnya `row` di sini tak bisa diisi id. Dan ternyata memang tak perlu:
   tak satu pun tempat di frontend membaca `u.row`, dan saveUser/deleteUser/
   renameUser semuanya menerima NAMA, bukan nomor baris. Jadi kolom itu sisa
   masa lalu. Diisi nomor urut supaya bentuknya tetap sama; kalau suatu saat ada
   yang betul-betul memakainya, pakailah `name`. */
async function getUsers() {
  const baris = await q(
    'SELECT nama, peran, aktif FROM users ORDER BY nama');
  return baris
    .map((r, i) => ({
      row: i + 2,
      name: teks(r.nama).trim(),
      /* Bawaan diterapkan DI SINI, persis seperti _sheets.js (|| ROLE_DEFAULT),
         bukan saat migrasi. Database menyimpan apa yang ada di sheet; lapisan
         baca yang menambahkan bawaannya. Dengan begitu isi database bisa
         dibandingkan langsung dengan isi sheet tanpa perlu tahu aturan apa pun. */
      role: teks(r.peran).trim() || 'Staff',
      active: !!r.aktif,
    }))
    .filter((u) => u.name);
}

async function listPinUsers(/* pre */) {
  /* auth_pins pun tanpa id — kunci utamanya user_nama. */
  const baris = await q('SELECT user_nama FROM auth_pins ORDER BY user_nama');
  return baris.map((r) => teks(r.user_nama).trim()).filter(Boolean);
}

async function getAllLinks(/* pre */) {
  const baris = await q(
    'SELECT id, user_nama, title, url, folder FROM user_links ORDER BY id');
  return baris
    .map((r) => ({
      row: pegangan(r.id),
      user: teks(r.user_nama).trim(),
      title: teks(r.title).trim(),
      url: teks(r.url).trim(),
      folder: teks(r.folder).trim(),
    }))
    /* Penyaring yang sama dengan _sheets.js. Baris yang di sana tak pernah
       muncul tak boleh tiba-tiba muncul di sini hanya karena ia terlanjur
       ikut termigrasi. */
    .filter((l) => l.user && l.url);
}

async function getAllDashboards(/* pre */) {
  const baris = await q(
    'SELECT id, title, deskripsi, icon, url FROM dashboards ORDER BY id');
  return baris
    .map((r) => ({
      row: pegangan(r.id),
      title: teks(r.title).trim(),
      desc: teks(r.deskripsi).trim(),
      icon: teks(r.icon).trim(),
      url: teks(r.url).trim(),
    }))
    .filter((d) => d.title || d.url);
}

async function getAllNotes(/* pre */) {
  const baris = await q(
    'SELECT id, user_nama, title, body, updated_at, folder FROM user_notes ORDER BY id');
  return baris
    .map((r) => ({
      row: pegangan(r.id),
      user: teks(r.user_nama).trim(),
      title: teks(r.title).trim(),
      body: teks(r.body).trim(),
      updatedAt: stempel(r.updated_at),
      folder: teks(r.folder).trim(),
    }))
    .filter((n) => n.user && (n.title || n.body));
}

/* ------------------------------------------------------------------ */
/* Kelompok 2 — daftar berstruktur                                     */
/* ------------------------------------------------------------------ */

/* Aturan yang sama tidak ditulis dua kali: isChecked, baseName, OPTION_TYPES,
   dan DEFAULT_OPTIONS diambil dari _sheets.js. Menyalinnya ke sini berarti dua
   tempat yang harus ikut berubah bersamaan, dan yang satu pasti terlupakan. */
const { OPTION_TYPES, DEFAULT_OPTIONS, baseName, isChecked } = require('./_sheets.js')._internals;

async function getTasks(/* pre */) {
  const baris = await q(
    'SELECT task_id, created_date, due_date, status, kesulitan, task_name, stage, platform,'
    + ' pic, support, document, pic_notes, pm_notes, divisi_tujuan, kontak_divisi, kata_kerja,'
    + ' jumlah, objek, detail, dibuat_oleh, lintas_view, status_by'
    + ' FROM tasks ORDER BY task_id');
  return baris
    .map((r, i) => {
      const createdDate = teks(r.created_date);
      return {
        /* Sisa masa lalu, seperti users.row: frontend tak pernah membacanya dan
           saveTask/quickUpdateField/quickUpdateDates semuanya memakai taskId. */
        rowNumber: i + 4,
        id: teks(r.task_id).trim(),
        createdDate,
        dueDate: teks(r.due_date),
        status: teks(r.status).trim(),
        /* `priority` adalah nama JS untuk kolom Kesulitan — tingkat kesulitan,
           bukan urgensi. Namanya menyesatkan tapi frontend memakainya. */
        priority: teks(r.kesulitan).trim(),
        taskName: teks(r.task_name).trim(),
        stage: teks(r.stage).trim(),
        platform: teks(r.platform).trim(),
        pic: teks(r.pic).trim(),
        support: teks(r.support).trim(),
        document: teks(r.document).trim(),
        picNotes: teks(r.pic_notes).trim(),
        pmNotes: teks(r.pm_notes).trim(),
        divisiTujuan: teks(r.divisi_tujuan).trim(),
        kontakDivisi: teks(r.kontak_divisi).trim(),
        verb: teks(r.kata_kerja).trim(),
        jumlah: teks(r.jumlah).trim(),
        objek: teks(r.objek).trim(),
        detail: teks(r.detail).trim(),
        createdBy: teks(r.dibuat_oleh).trim(),
        /* STRING, bukan boolean — rowToTask mengembalikan sel mentahnya apa adanya.
           getCollabs mengembalikan mirror sebagai BOOLEAN untuk kolom yang sama
           bentuknya. Ketidakkonsistenan itu ditiru, bukan dirapikan: frontend
           sudah terlanjur bergantung pada keduanya. */
        mirror: teks(r.lintas_view).trim(),
        statusBy: teks(r.status_by).trim(),
        /* Medan maya — tak ada kolomnya di sheet, disediakan agar UI lama jalan. */
        startDate: createdDate,
        approvalGate: '',
        lastUpdate: '',
      };
    })
    .filter((t) => t.id || t.taskName);
}

async function getOptions(/* pre */) {
  /* Urutannya ditiru persis dari readOptionsRaw: sort((order) || (row)), dengan
     order 0 ATAU KOSONG diperlakukan sebagai PALING BELAKANG, bukan paling depan
     (`Number(r[4]) || MAX_SAFE_INTEGER`). Baris lama memang belum punya Order,
     dan maksudnya supaya ia tetap di tempatnya sampai benar-benar digeser.

     `urutan = 0` dievaluasi jadi 1/0, jadi yang ber-order menyusul lebih dulu.
     `id` menggantikan nomor baris: ia diberikan menurut urutan sisip, yang
     mengikuti urutan sheet. */
  const baris = await q(
    'SELECT tipe, nilai, induk FROM options WHERE aktif = 1'
    + ' ORDER BY (urutan = 0) ASC, urutan ASC, id ASC');

  const options = {};
  OPTION_TYPES.forEach((t) => { options[t] = []; });
  const verbMap = {};
  const objekMap = {};

  baris.forEach((r) => {
    const tipe = teks(r.tipe).trim();
    const nilai = teks(r.nilai).trim();
    const induk = teks(r.induk).trim();
    if (!tipe || !nilai) return;
    if (!options[tipe]) options[tipe] = [];
    if (!options[tipe].includes(nilai)) options[tipe].push(nilai);
    if (tipe === 'verb' && induk) {
      verbMap[induk] = verbMap[induk] || [];
      if (!verbMap[induk].includes(nilai)) verbMap[induk].push(nilai);
    }
    if (tipe === 'object' && induk) {
      objekMap[induk] = objekMap[induk] || [];
      if (!objekMap[induk].includes(nilai)) objekMap[induk].push(nilai);
    }
  });

  OPTION_TYPES.forEach((t) => {
    if (!options[t] || !options[t].length) options[t] = DEFAULT_OPTIONS[t] || [];
  });
  options.verbMap = verbMap;
  options.objekMap = objekMap;
  return options;
}

async function getComments(taskId) {
  const baris = await q(
    'SELECT dibuat_at, task_id, author, message FROM comments WHERE task_id = ? ORDER BY id',
    [String(taskId || '')]);
  return baris.map((r) => ({
    timestamp: stempel(r.dibuat_at),
    taskId: teks(r.task_id),
    author: teks(r.author),
    message: teks(r.message),
  }));
}

async function getChecklist(taskId) {
  const baris = await q(
    'SELECT id, task_id, item, done, created_by, checked_by, checked_at, link'
    + ' FROM checklists WHERE task_id = ? ORDER BY id',
    [String(taskId || '').trim()]);
  return baris
    .map((r) => {
      const item = teks(r.item).trim();
      const dibuat = teks(r.created_by).trim();
      return {
        row: pegangan(r.id),
        taskId: teks(r.task_id).trim(),
        item,
        done: !!r.done,
        /* Baris lama bisa punya kolom pembuat yang tertimpa TEKS ITEM — sebelum
           1.77.0, mencentang item menulis isinya ke sana. Tandanya pasti (sama
           persis dengan item), dan dibaca sebagai "pembuat tak diketahui" bukan
           ditebak jadi nama orang. Menebak pemilik lebih berbahaya daripada
           mengaku tidak tahu, karena izin menghapus bergantung padanya.
           Ini bukan kemungkinan teoretis: CHECKLIST!156 memang begitu. */
        createdBy: dibuat && dibuat === item ? '' : dibuat,
        checkedBy: teks(r.checked_by).trim(),
        checkedAt: stempel(r.checked_at),
        link: teks(r.link).trim(),
      };
    })
    .filter((c) => c.taskId === String(taskId || '').trim() && c.item);
}

async function getActivityLog(limit /*, pre */) {
  const max = Number(limit) > 0 ? Number(limit) : 200;
  /* _sheets membaca SELURUH sheet, membalik, lalu memotong. Di sini pembalikan
     dan pemotongan dikerjakan database — hasilnya sama, kerjanya jauh lebih
     sedikit. Yang dibalik adalah urutan SISIP (id), bukan stempel waktunya:
     itulah yang dilakukan reverse() atas urutan baris sheet, dan keduanya bisa
     berbeda kalau ada stempel yang janggal. */
  const baris = await q(
    'SELECT terjadi_at, user_nama, action, task_id, detail, status_lama, status_baru'
    + ' FROM activity_log ORDER BY id DESC LIMIT ?', [max]);
  return baris
    .map((r) => ({
      timestamp: stempel(r.terjadi_at),
      user: teks(r.user_nama),
      action: teks(r.action),
      taskId: teks(r.task_id),
      detail: teks(r.detail),
      statusFrom: teks(r.status_lama),
      statusTo: teks(r.status_baru),
    }))
    .filter((r) => r.timestamp || r.user);
}

async function getNotifications(user) {
  const u = baseName(user);
  if (!u) return [];
  /* baseName membuang imbuhan dalam kurung lalu mengecilkan huruf: "Nynda (PM)"
     cocok dengan "nynda". Karena itu penyaringannya tak bisa diserahkan ke SQL
     apa adanya — dikerjakan di sini dengan fungsi yang sama persis. */
  const baris = await q(
    'SELECT id, for_user, tipe, ref_id, dari, teks, dibuat_at, dibaca'
    + ' FROM notifications ORDER BY id DESC');
  return baris
    .map((r, i) => ({
      row: i + 2,
      id: teks(r.id),
      forUser: teks(r.for_user),
      type: teks(r.tipe),
      refId: teks(r.ref_id),
      from: teks(r.dari),
      text: teks(r.teks),
      createdAt: stempel(r.dibuat_at),
      read: !!r.dibaca,
    }))
    .filter((n) => baseName(n.forUser) === u);
}

/* Dipakai getBootstrapData: ringkasan, bukan isi penuh. */

async function getAllCommentsLite(/* pre */) {
  const baris = await q('SELECT dibuat_at, task_id, author FROM comments ORDER BY id');
  return baris
    .map((r) => ({
      timestamp: stempel(r.dibuat_at),
      taskId: teks(r.task_id),
      author: teks(r.author),
    }))
    .filter((c) => c.taskId);
}

async function getChecklistSummary(/* pre */) {
  /* Dihitung database, bukan dengan menarik 926 baris lalu menjumlahkannya di sini.
     Penyaringnya sama persis dengan _sheets.js: baris tanpa task atau tanpa teks
     item tidak dihitung sama sekali — bukan dihitung sebagai belum selesai. */
  const baris = await q(
    "SELECT task_id, COUNT(*) AS total, SUM(done) AS done FROM checklists"
    + " WHERE TRIM(task_id) <> '' AND TRIM(item) <> '' GROUP BY task_id");
  const out = {};
  baris.forEach((r) => {
    out[teks(r.task_id).trim()] = { done: Number(r.done) || 0, total: Number(r.total) || 0 };
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Kelompok 3 — bersarang                                              */
/* ------------------------------------------------------------------ */

/* Di sini pendekatannya BERBEDA dari dua kelompok sebelumnya, dan itu disengaja.
   Alih-alih menulis ulang pemetaannya, baris dari MySQL disusun kembali menjadi
   bentuk "baris sheet" lalu disuapkan ke loadCollabsRaw() dan readPackages()
   yang sudah ada.

   Alasannya: yang rumit di sini bukan pemetaan kolomnya, melainkan perhitungan
   turunannya — terpenuhi, menunggu, sisa, lebih, status, ringkas, filled,
   collabIds, plus aturan "setoran tanpa collab dihitung selesai" dan penanda
   `hilang` untuk sumber yang lenyap. Semuanya JS murni tanpa sentuhan Sheets,
   berlapis-lapis, dan saling bergantung. Menulis ulang itu berarti mengundang
   persis penyimpangan yang alat banding ini ada untuk menangkapnya — tapi
   penyimpangan dalam ANGKA, yang tak akan terlihat sebagai error di layar.

   Yang disusun di sini cuma urutan kolom dan bentuk nilainya. Itu mekanis dan
   bisa diperiksa sekilas.

   Catatan untuk nanti: ketika Sheets dipensiunkan, fungsi-fungsi murni itu
   dipindahkan ke modul bersama, dan baris perantara ini hilang. Sampai saat itu,
   satu sumber kebenaran lebih berharga daripada lapisan yang bersih. */
const { loadCollabsRaw, readPackages, buildStepIndex } = require('./_sheets.js')._internals;

/* Bentuk nilai disamakan dengan yang dikembalikan Sheets, bukan dengan yang
   dikembalikan MySQL — karena pemetanya menafsirkan bentuk Sheets. */
const sTeks = (v) => (v === null || v === undefined ? '' : String(v));
const sTgl = (v) => (v ? String(v) : '');                 // DATE  -> 'YYYY-MM-DD'
const sStempel = (v) => (v ? String(v).slice(0, 16) : ''); // DATETIME tanpa detik
/* 'TRUE' / '' — dibaca benar oleh isChecked() maupun oleh daftar penyangkal
   mirror (`['', 'tidak', 'no', 'false', '0']`), yang keduanya dipakai pemeta. */
const sBool = (v) => (v ? 'TRUE' : '');

async function barisKolaborasi() {
  const [c, s] = await Promise.all([
    q('SELECT collab_id, platform, title, description, created_by, created_at,'
      + ' deadline, tipe, color, paket_id, mirror FROM collabs ORDER BY collab_id'),
    q('SELECT collab_id, urutan, step, pic, deadline, done, done_by, done_at,'
      + ' note, stage, link FROM collab_steps ORDER BY collab_id, urutan'),
  ]);
  return {
    crows: c.map((r) => [
      sTeks(r.collab_id), sTeks(r.platform), sTeks(r.title), sTeks(r.description),
      sTeks(r.created_by), sStempel(r.created_at), sTgl(r.deadline), sTeks(r.tipe),
      sTeks(r.color), sTeks(r.paket_id), sBool(r.mirror),
    ]),
    srows: s.map((r) => [
      sTeks(r.collab_id), Number(r.urutan), sTeks(r.step), sTeks(r.pic),
      sTgl(r.deadline), sBool(r.done), sTeks(r.done_by), sStempel(r.done_at),
      sTeks(r.note), sTeks(r.stage), sTeks(r.link),
    ]),
  };
}

async function barisPaket() {
  const [p, v, i, k, l] = await Promise.all([
    q('SELECT paket_id, platform, marsel_pic, program, nama_paket, tagline, benefit,'
      + ' tanggal, tujuan, produk_pic, dibimbing, latsol, materi, tryout, drilling,'
      + ' live_class, catatan, updated_by, updated_at, mirror FROM packages ORDER BY paket_id'),
    q('SELECT paket_id, urutan, masa_aktif, harga_awal, harga_diskon, status'
      + ' FROM package_variants ORDER BY paket_id, urutan'),
    q('SELECT item_id, paket_id, urutan, kategori, grup, nama, target, satuan, awal, catatan'
      + ' FROM package_items ORDER BY paket_id, urutan, item_id'),
    q('SELECT paket_id, item_id, collab_id, step_order, jumlah, catatan'
      + ' FROM package_contribs ORDER BY item_id, collab_id, step_order'),
    q('SELECT paket_id, urutan, label, url FROM package_links ORDER BY paket_id, urutan'),
  ]);
  return {
    prows: p.map((r) => [
      sTeks(r.paket_id), sTeks(r.platform), sTeks(r.marsel_pic), sTeks(r.program),
      sTeks(r.nama_paket), sTeks(r.tagline), sTeks(r.benefit),
      /* `tanggal` memang TEKS BEBAS di v1 ("Agustus 2026"), bukan tanggal. */
      sTeks(r.tanggal),
      sTeks(r.tujuan), sTeks(r.produk_pic), sTeks(r.dibimbing), sTeks(r.latsol),
      sTeks(r.materi), sTeks(r.tryout), sTeks(r.drilling), sTeks(r.live_class),
      sTeks(r.catatan), sTeks(r.updated_by), sStempel(r.updated_at), sBool(r.mirror),
    ]),
    vrows: v.map((r) => [
      sTeks(r.paket_id), Number(r.urutan), sTeks(r.masa_aktif),
      Number(r.harga_awal), Number(r.harga_diskon), sTeks(r.status),
    ]),
    irows: i.map((r) => [
      sTeks(r.item_id), sTeks(r.paket_id), Number(r.urutan), sTeks(r.kategori),
      sTeks(r.grup), sTeks(r.nama), Number(r.target), sTeks(r.satuan),
      Number(r.awal), sTeks(r.catatan),
    ]),
    crows: k.map((r) => [
      sTeks(r.paket_id), sTeks(r.item_id), sTeks(r.collab_id),
      Number(r.step_order), Number(r.jumlah), sTeks(r.catatan),
    ]),
    lrows: l.map((r) => [
      sTeks(r.paket_id), Number(r.urutan), sTeks(r.label), sTeks(r.url),
    ]),
  };
}

async function getCollabs(/* preC, preS */) {
  const { crows, srows } = await barisKolaborasi();
  const collabs = await loadCollabsRaw(crows, srows);
  let pkgs = {};
  try { pkgs = await readPackages(buildStepIndex(collabs), await barisPaket()); }
  catch (e) { pkgs = {}; }
  collabs.forEach((c) => { c.pkg = c.paketId ? (pkgs[c.paketId] || null) : null; });
  return collabs;
}

async function getPackages() {
  const { crows, srows } = await barisKolaborasi();
  const collabs = await loadCollabsRaw(crows, srows);
  const semua = await readPackages(buildStepIndex(collabs), await barisPaket());
  return Object.values(semua).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/* ------------------------------------------------------------------ */
/* Muat-awal                                                           */
/* ------------------------------------------------------------------ */

const { susunBootstrap, setUsersFromRows } = require('./_sheets.js')._internals;

async function getBootstrapData(opts) {
  /* _users adalah keadaan modul di _sheets.js, dan BANYAK yang bergantung padanya:
     isMagangActor, getManagers, getDoneApprovers, getCollabManagers — semuanya
     dipakai penyusun di bawah. Kalau tidak diisi lebih dulu, penyaringan magang
     dan daftar manager jatuh ke kosong, dan kosong di sini artinya salah orang
     melihat data yang salah. Jadi diisi dari MySQL sebelum apa pun disusun. */
  const uRows = await q('SELECT nama, peran, aktif FROM users ORDER BY nama');
  setUsersFromRows(uRows.map((r) => [
    teks(r.nama), teks(r.peran), r.aktif ? 'TRUE' : 'FALSE',
  ]));

  const [tasks, options, activity, commentsSummary, pinUsers, links,
    dashboards, notes, checklistSummary, collabs, users] = await Promise.all([
    getTasks(),
    getOptions(),
    getActivityLog(200),
    getAllCommentsLite(),
    listPinUsers(),
    getAllLinks(),
    getAllDashboards(),
    getAllNotes(),
    getChecklistSummary(),
    /* Sama seperti _sheets: kegagalan di sini tak boleh menggagalkan muat-awal. */
    getCollabs().catch(() => []),
    getUsers(),
  ]);

  /* Penyusunnya SATU, dipakai kedua backend. Dua cabangnya menentukan data siapa
     sampai ke perangkat siapa — magang hanya menerima task lingkungannya, tamu
     Lintas Divisi hanya yang sengaja dibagikan — dan menyalinnya ke sini berarti
     dua tempat yang bisa menyimpang. Menyimpang di sana artinya kebocoran. */
  return susunBootstrap(opts, {
    tasks, options, activity, commentsSummary, pinUsers, links, dashboards, notes,
    checklistSummary, collabs, users,
  });
}

/* ------------------------------------------------------------------ */
/* Fungsi tulis — kelompok 4                                           */
/* ------------------------------------------------------------------ */

/* BATAS NOMOR PEGANGAN. _sheets.js menolak `row < 2` karena di spreadsheet baris 1
   adalah judul kolom, jadi data paling awal ada di baris 2. Di MySQL pegangannya
   id AUTO_INCREMENT, yang mulai dari SATU.

   Menyalin `< 2` ke sini membuat baris pertama tiap tabel permanen tak bisa
   disunting maupun dihapus — dan diamnya sempurna: tombolnya ada, ditekan, lalu
   muncul "Baris tidak valid" tanpa sebab yang masuk akal. Jadi batasnya di sini
   `< 1`, dan itu memang perbedaan yang disengaja. */
function peganganSah(row) {
  const n = parseInt(row, 10);
  return (!n || n < 1) ? 0 : n;
}

async function addUserLink(user, title, url, folder) {
  user = teks(user).trim();
  title = teks(title).trim();
  url = teks(url).trim();
  folder = teks(folder).trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  if (!url) return { success: false, message: 'URL wajib diisi.' };
  await q('INSERT INTO user_links (user_nama, title, url, folder) VALUES (?, ?, ?, ?)',
    [user, title || url, url, folder]);
  return { success: true, message: 'Link ditambahkan.', links: await getAllLinks() };
}

async function updateUserLink(user, row, title, url, folder) {
  user = teks(user).trim();
  const id = peganganSah(row);
  title = teks(title).trim();
  url = teks(url).trim();
  folder = teks(folder).trim();
  if (!id) return { success: false, message: 'Baris tidak valid.' };
  if (!url) return { success: false, message: 'URL wajib diisi.' };
  /* Pemeriksaan kepemilikan ditiru persis, termasuk sifatnya yang mengabaikan
     huruf besar-kecil. Baris yang tak ada menghasilkan pemilik kosong, lalu
     ditolak dengan pesan yang sama — sama seperti di Sheets. */
  const cur = await q('SELECT user_nama FROM user_links WHERE id = ?', [id]);
  const owner = teks(cur[0] && cur[0].user_nama).trim();
  if (owner.toLowerCase() !== user.toLowerCase()) return { success: false, message: 'Bukan link Anda.' };
  await q('UPDATE user_links SET title = ?, url = ?, folder = ? WHERE id = ?',
    [title || url, url, folder, id]);
  return { success: true, message: 'Link diperbarui.', links: await getAllLinks() };
}

async function deleteUserLink(user, row) {
  user = teks(user).trim();
  const id = peganganSah(row);
  if (!id) return { success: false, message: 'Baris tidak valid.' };
  const cur = await q('SELECT user_nama FROM user_links WHERE id = ?', [id]);
  const owner = teks(cur[0] && cur[0].user_nama).trim();
  if (owner.toLowerCase() !== user.toLowerCase()) return { success: false, message: 'Bukan link Anda.' };
  await q('DELETE FROM user_links WHERE id = ?', [id]);
  return { success: true, message: 'Link dihapus.', links: await getAllLinks() };
}

/* Stempel waktu memakai nowStamp() yang SAMA, supaya formatnya dan pergeseran
   zona waktunya (TIMEZONE_OFFSET_MINUTES) persis sama dengan sisi Sheets.
   Menulis ulang rumus waktu berarti dua sumber kebenaran untuk "sekarang". */
const { nowStamp } = require('./_sheets.js')._internals;

async function addNote(user, title, body, folder) {
  user = teks(user).trim();
  title = teks(title).trim();
  body = teks(body).trim();
  folder = teks(folder).trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  if (!title && !body) return { success: false, message: 'Catatan tidak boleh kosong.' };
  await q('INSERT INTO user_notes (user_nama, title, body, updated_at, folder) VALUES (?, ?, ?, ?, ?)',
    [user, title || '(tanpa judul)', body, nowStamp(), folder]);
  return { success: true, message: 'Catatan ditambahkan.', notes: await getAllNotes() };
}

async function updateNote(user, row, title, body, folder) {
  user = teks(user).trim();
  const id = peganganSah(row);
  title = teks(title).trim();
  body = teks(body).trim();
  folder = teks(folder).trim();
  if (!id) return { success: false, message: 'Baris tidak valid.' };
  if (!title && !body) return { success: false, message: 'Catatan tidak boleh kosong.' };
  const cur = await q('SELECT user_nama FROM user_notes WHERE id = ?', [id]);
  const owner = teks(cur[0] && cur[0].user_nama).trim();
  if (owner.toLowerCase() !== user.toLowerCase()) return { success: false, message: 'Bukan catatan Anda.' };
  await q('UPDATE user_notes SET title = ?, body = ?, updated_at = ?, folder = ? WHERE id = ?',
    [title || '(tanpa judul)', body, nowStamp(), folder, id]);
  return { success: true, message: 'Catatan diperbarui.', notes: await getAllNotes() };
}

async function deleteNote(user, row) {
  user = teks(user).trim();
  const id = peganganSah(row);
  if (!id) return { success: false, message: 'Baris tidak valid.' };
  const cur = await q('SELECT user_nama FROM user_notes WHERE id = ?', [id]);
  const owner = teks(cur[0] && cur[0].user_nama).trim();
  if (owner.toLowerCase() !== user.toLowerCase()) return { success: false, message: 'Bukan catatan Anda.' };
  await q('DELETE FROM user_notes WHERE id = ?', [id]);
  return { success: true, message: 'Catatan dihapus.', notes: await getAllNotes() };
}

async function addDashboard(title, desc, icon, url) {
  title = teks(title).trim();
  desc = teks(desc).trim();
  icon = teks(icon).trim() || 'dashboard';
  url = teks(url).trim();
  if (!title) return { success: false, message: 'Judul dashboard wajib diisi.' };
  if (!url) return { success: false, message: 'URL dashboard wajib diisi.' };
  await q('INSERT INTO dashboards (title, deskripsi, icon, url) VALUES (?, ?, ?, ?)',
    [title, desc, icon, url]);
  return { success: true, message: 'Dashboard ditambahkan.', dashboards: await getAllDashboards() };
}

/* Tanpa pemeriksaan kepemilikan MAUPUN keberadaan — ditiru apa adanya dari
   _sheets.js. Tapi akibatnya berbeda untuk pegangan yang sudah basi:

     Sheets : valuesUpdate menulis ke baris itu APA PUN isinya. Baris di luar
              data pun ditulisi, sehingga muncul dashboard siluman di tengah
              sheet yang tak pernah ditambahkan siapa pun.
     MySQL  : UPDATE ... WHERE id = ? tak mengenai apa pun, dan tak terjadi
              apa-apa.

   Keduanya mengembalikan success. Perbedaannya hanya terlihat dari keadaan
   sesudahnya — dan yang di sini yang benar. */
async function updateDashboard(row, title, desc, icon, url) {
  const id = peganganSah(row);
  title = teks(title).trim();
  desc = teks(desc).trim();
  icon = teks(icon).trim() || 'dashboard';
  url = teks(url).trim();
  if (!id) return { success: false, message: 'Baris tidak valid.' };
  if (!title) return { success: false, message: 'Judul dashboard wajib diisi.' };
  if (!url) return { success: false, message: 'URL dashboard wajib diisi.' };
  await q('UPDATE dashboards SET title = ?, deskripsi = ?, icon = ?, url = ? WHERE id = ?',
    [title, desc, icon, url, id]);
  return { success: true, message: 'Dashboard diperbarui.', dashboards: await getAllDashboards() };
}

async function deleteDashboard(row) {
  const id = peganganSah(row);
  if (!id) return { success: false, message: 'Baris tidak valid.' };
  await q('DELETE FROM dashboards WHERE id = ?', [id]);
  return { success: true, message: 'Dashboard dihapus.', dashboards: await getAllDashboards() };
}

/* Operasi folder — menyentuh banyak baris sekaligus.

   Dua hal yang gampang meleset di sini, dan keduanya diam:

   1. NAMA FOLDER PEKA HURUF BESAR-KECIL, NAMA USER TIDAK. _sheets.js memakai
      `u.toLowerCase() === user.toLowerCase()` untuk user tapi `f === oldFolder`
      untuk folder. Collation database ini (utf8mb4_0900_ai_ci) buta huruf
      besar-kecil untuk KEDUANYA, jadi tanpa `BINARY` folder "Riset" dan "riset"
      akan ikut tergabung — dan penggabungan itu tak bisa dibatalkan.

   2. `changed` MENGHITUNG YANG COCOK, BUKAN YANG BERUBAH. affectedRows MySQL
      hanya menghitung baris yang nilainya betul-betul berganti, jadi mengganti
      nama folder dengan nama yang sama persis akan melaporkan 0 — sedangkan
      Sheets melaporkan jumlah penuhnya. Karena itu dihitung lebih dulu dengan
      SELECT, bukan diambil dari hasil UPDATE. */
async function _folderMassal(tabel, medanDaftar, pembaca, user, folderLama, folderBaru) {
  const [semua] = await q('SELECT COUNT(*) AS n FROM `' + tabel + '`');
  /* Tabel yang benar-benar kosong mengembalikan daftar KOSONG, bukan daftar
     lengkap — ditiru dari _sheets.js, yang keluar lebih awal sebelum membaca. */
  if (!Number(semua.n)) return { success: true, changed: 0, [medanDaftar]: [] };

  const sql = ' FROM `' + tabel + '` WHERE user_nama = ? AND BINARY folder = ?';
  const [hitung] = await q('SELECT COUNT(*) AS n' + sql, [user, folderLama]);
  const changed = Number(hitung.n) || 0;
  if (changed > 0) {
    await q('UPDATE `' + tabel + '` SET folder = ? WHERE user_nama = ? AND BINARY folder = ?',
      [folderBaru, user, folderLama]);
  }
  return { success: true, changed, [medanDaftar]: await pembaca() };
}

const _folderLink = (u, a, b) => _folderMassal('user_links', 'links', getAllLinks, u, a, b);
const _folderNote = (u, a, b) => _folderMassal('user_notes', 'notes', getAllNotes, u, a, b);

async function renameUserFolder(user, oldFolder, newFolder) {
  user = teks(user).trim();
  oldFolder = teks(oldFolder).trim();
  newFolder = teks(newFolder).trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  if (!oldFolder) return { success: false, message: 'Folder asal tidak valid.' };
  if (!newFolder) return { success: false, message: 'Nama folder baru wajib diisi.' };
  const res = await _folderLink(user, oldFolder, newFolder);
  return Object.assign({}, res, {
    message: 'Folder "' + oldFolder + '" diganti jadi "' + newFolder + '" (' + res.changed + ' link).' });
}

async function deleteUserFolder(user, folder) {
  user = teks(user).trim();
  folder = teks(folder).trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  if (!folder) return { success: false, message: 'Folder tidak valid.' };
  /* Link TIDAK dihapus — hanya dipindah ke akar. Menghapus folder yang berisi
     tak boleh berarti menghapus isinya. */
  const res = await _folderLink(user, folder, '');
  return Object.assign({}, res, {
    message: 'Folder "' + folder + '" dihapus. ' + res.changed + ' link dipindah ke Umum (tidak terhapus).' });
}

async function renameNoteFolder(user, oldFolder, newFolder) {
  user = teks(user).trim();
  oldFolder = teks(oldFolder).trim();
  newFolder = teks(newFolder).trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  if (!oldFolder) return { success: false, message: 'Folder asal tidak valid.' };
  if (!newFolder) return { success: false, message: 'Nama folder baru wajib diisi.' };
  const res = await _folderNote(user, oldFolder, newFolder);
  return Object.assign({}, res, {
    message: 'Folder "' + oldFolder + '" diganti jadi "' + newFolder + '" (' + res.changed + ' catatan).' });
}

async function deleteNoteFolder(user, folder) {
  user = teks(user).trim();
  folder = teks(folder).trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  if (!folder) return { success: false, message: 'Folder tidak valid.' };
  const res = await _folderNote(user, folder, '');
  return Object.assign({}, res, {
    message: 'Folder "' + folder + '" dihapus. ' + res.changed + ' catatan dipindah ke Umum.' });
}

/* ------------------------------------------------------------------ */
/* Penulis internal — dipakai hampir semua fungsi tulis                 */
/* ------------------------------------------------------------------ */

const { susunMention, isManagerActor, USES_PARENT_DB } = (function () {
  const i = require('./_sheets.js')._internals;
  /* USES_PARENT tidak diekspor; isinya tetap dan pendek, tapi menyalinnya berarti
     dua tempat yang harus ikut berubah. Diturunkan dari perilaku _sheets.js:
     hanya verb dan object yang memakai kolom induk. */
  return { susunMention: i.susunMention, isManagerActor: i.isManagerActor,
    USES_PARENT_DB: ['verb', 'object'] };
}());

/* _users adalah keadaan modul di _sheets.js, dan isManagerActor, getManagers,
   serta susunMention semuanya membacanya. Harus diisi dari MySQL sebelum dipakai
   — kalau tidak, pemeriksaan peran jatuh ke kosong dan menolak semua orang. */
async function muatUsers() {
  const baris = await q('SELECT nama, peran, aktif FROM users ORDER BY nama');
  setUsersFromRows(baris.map((r) => [teks(r.nama), teks(r.peran), r.aktif ? 'TRUE' : 'FALSE']));
}

/* Pencatatan tak boleh menggagalkan operasi utamanya — sama seperti di _sheets.js.
   Riwayat yang hilang satu baris jauh lebih ringan daripada task yang gagal
   tersimpan karena pencatatannya bermasalah. */
async function logActivity(user, action, taskId, detail, statusFrom, statusTo) {
  try {
    await q('INSERT INTO activity_log (terjadi_at, user_nama, action, task_id, detail, status_lama, status_baru)'
      + ' VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nowStamp(), teks(user) || 'Unknown', teks(action), teks(taskId),
        teks(detail), teks(statusFrom), teks(statusTo)]);
  } catch (e) { /* sengaja ditelan */ }
}

async function addNotification(forUser, type, refId, from, text) {
  if (!teks(forUser).trim()) return;
  /* Bentuk id-nya ditiru persis: 'N' + epoch + '-' + acak. Bukan AUTO_INCREMENT,
     karena id ini sudah terlanjur jadi kunci utama di tabelnya. */
  const id = 'N' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
  await q('INSERT INTO notifications (id, for_user, tipe, ref_id, dari, teks, dibuat_at, dibaca)'
    + ' VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
    [id, teks(forUser), teks(type), teks(refId), teks(from), teks(text), nowStamp()]);
}

async function createMentionNotifications(refId, author, message) {
  let pics = [];
  try { pics = (await getOptions()).pic || []; } catch (e) { pics = []; }
  try { await muatUsers(); } catch (e) { /* peran tak wajib */ }
  /* Penentu SIAPA yang ditag dipakai bersama, bukan disalin: menyimpang di sana
     berarti orang yang salah membaca percakapan yang bukan haknya, atau orang
     yang benar tak pernah tahu ia ditag. */
  const m = susunMention(author, message, pics);
  if (!m) return;
  for (const t of m.targets) await addNotification(t, 'mention', refId, author, m.text);
}

/* ------------------------------------------------------------------ */
/* Opsi dropdown                                                       */
/* ------------------------------------------------------------------ */

/* Pencocokan opsi di _sheets.js tidak seragam, dan ketidakseragamannya ditiru:

     tipe   : `r.type === type`                    PEKA huruf besar-kecil
     nilai  : `r.value.toLowerCase() === ...`      buta
     induk  : `r.parent.toLowerCase() === ...`     buta

   Collation database ini buta untuk ketiganya, jadi `tipe` butuh BINARY. Tanpa
   itu, menyimpan opsi bertipe "Status" akan menimpa yang bertipe "status". */
async function _cariOpsi(type, value, parent) {
  const pakaiInduk = USES_PARENT_DB.indexOf(type) >= 0;
  const sql = 'SELECT id FROM options WHERE BINARY tipe = ? AND nilai = ?'
    + (pakaiInduk ? ' AND induk = ?' : '') + ' ORDER BY id LIMIT 1';
  const args = pakaiInduk ? [type, value, parent] : [type, value];
  const baris = await q(sql, args);
  return baris.length ? Number(baris[0].id) : 0;
}

async function saveOption(type, value, parent) {
  type = teks(type).trim();
  value = teks(value).trim();
  parent = teks(parent).trim();
  if (OPTION_TYPES.indexOf(type) < 0) return { success: false, message: 'Tipe opsi tidak valid.' };
  if (!value) return { success: false, message: 'Nilai opsi tidak boleh kosong.' };
  if (USES_PARENT_DB.indexOf(type) >= 0 && !parent) {
    return { success: false, message: 'Opsi ini wajib punya induk (parent).' };
  }
  const id = await _cariOpsi(type, value, parent);
  if (id) {
    /* Yang sudah ada dinyalakan kembali, bukan ditambah lagi — menambah akan
       membuat dua baris bernilai sama yang tampil dua kali di dropdown. */
    await q('UPDATE options SET aktif = 1, induk = ? WHERE id = ?', [parent, id]);
  } else {
    await q('INSERT INTO options (tipe, nilai, aktif, induk, urutan) VALUES (?, ?, 1, ?, 0)',
      [type, value, parent]);
  }
  return { success: true, message: 'Opsi berhasil disimpan.', options: await getOptions() };
}

async function deleteOption(type, value, parent) {
  type = teks(type).trim();
  value = teks(value).trim();
  parent = teks(parent).trim();
  if (OPTION_TYPES.indexOf(type) < 0) return { success: false, message: 'Tipe opsi tidak valid.' };
  const id = await _cariOpsi(type, value, parent);
  /* Dinonaktifkan, bukan dihapus: task lama masih menyimpan nilainya sebagai teks,
     dan menghapus barisnya akan membuat nilai itu tak dikenali lagi di layar.
     Yang tak ketemu pun tetap dianggap berhasil — ditiru apa adanya. */
  if (id) await q('UPDATE options SET aktif = 0 WHERE id = ?', [id]);
  return { success: true, message: 'Opsi berhasil dinonaktifkan.', options: await getOptions() };
}

/* Tipe opsi yang namanya ikut tertulis di task. Mengganti nama opsi berarti
   mengganti nilainya di seluruh task, kalau tidak task lama menunjuk pilihan
   yang sudah tak ada di dropdown. `division` dan `object` tak punya kolomnya. */
const KOLOM_TASK_OPSI = {
  status: 'status', priority: 'kesulitan', stage: 'stage',
  platform: 'platform', pic: 'pic', support: 'support',
};

async function editOption(type, oldValue, newValue, parent) {
  type = teks(type).trim();
  oldValue = teks(oldValue).trim();
  newValue = teks(newValue).trim();
  parent = teks(parent).trim();
  if (OPTION_TYPES.indexOf(type) < 0) return { success: false, message: 'Tipe opsi tidak valid.' };
  if (!oldValue || !newValue) return { success: false, message: 'Nilai lama/baru tidak boleh kosong.' };
  const id = await _cariOpsi(type, oldValue, parent);
  if (!id) return { success: false, message: 'Opsi tidak ditemukan.' };

  /* Nama baru bisa SUDAH dipakai baris lain — termasuk baris yang sudah
     dinonaktifkan. Kasusnya nyata: "Hold" dinonaktifkan, lalu kemudian "Pause"
     diganti namanya jadi "Hold".

     Di Sheets itu lolos begitu saja dan menghasilkan dua baris bernilai sama;
     getOptions menyaring yang nonaktif dan membuang kembar, jadi di layar tetap
     terlihat satu. Di sini kunci unik (tipe, nilai) menolaknya, dan tanpa
     penanganan ini yang sampai ke layar adalah galat SQL mentah — 500, bukan
     pesan yang bisa dimengerti.

     Yang terlihat dibuat sama: baris yang bentrok dibuang, baris yang sedang
     diganti nama yang bertahan beserta urutannya. Bedanya hanya di penyimpanan
     — v1 menyisakan baris mati yang tak pernah tampil di mana pun. */
  const bentrok = await q(
    'SELECT id FROM options WHERE BINARY tipe = ? AND nilai = ? AND id <> ?',
    [type, newValue, id]);
  for (const b of bentrok) await q('DELETE FROM options WHERE id = ?', [b.id]);

  await q('UPDATE options SET nilai = ? WHERE id = ?', [newValue, id]);

  if (USES_PARENT_DB.indexOf(type) >= 0) {
    /* Kata kerja / objek: cukup ganti nama opsinya. Nama task lama memang TIDAK
       diubah otomatis — itu keputusan v1, bukan kelalaian. */
    return { success: true, message: '"' + oldValue + '" diubah menjadi "' + newValue + '".',
      options: await getOptions() };
  }

  const kol = KOLOM_TASK_OPSI[type];
  if (kol === 'support') {
    /* Support berisi BEBERAPA nama dipisah koma, jadi tak bisa diganti borongan.
       Tiap baris dibaca, bagiannya dicocokkan satu per satu, lalu disusun ulang
       dengan pemisah ", " — sama persis seperti _sheets.js. */
    const baris = await q('SELECT task_id, support FROM tasks WHERE support <> \'\'');
    for (const r of baris) {
      const bagian = teks(r.support).split(',').map((x) => x.trim()).filter(Boolean);
      if (!bagian.some((p) => p.toLowerCase() === oldValue.toLowerCase())) continue;
      const baru = bagian.map((p) => (p.toLowerCase() === oldValue.toLowerCase() ? newValue : p)).join(', ');
      await q('UPDATE tasks SET support = ? WHERE task_id = ?', [baru, r.task_id]);
    }
  } else if (kol) {
    /* Collation buta huruf besar-kecil, sama seperti `cur.toLowerCase() === ...`. */
    await q('UPDATE tasks SET `' + kol + '` = ? WHERE `' + kol + '` = ?', [newValue, oldValue]);
  }

  return { success: true, message: '"' + oldValue + '" diubah menjadi "' + newValue + '".',
    options: await getOptions(), tasks: await getTasks() };
}

async function reorderOptions(type, values, actor) {
  type = teks(type).trim();
  if (!type) return { success: false, message: 'Jenis dropdown tidak disebut.' };
  await muatUsers();
  if (!isManagerActor(actor)) {
    return { success: false, message: 'Hanya Manager yang bisa mengatur urutan dropdown.' };
  }
  /* Di sini tipe dicocokkan BUTA huruf besar-kecil — kebalikan dari _cariOpsi.
     Ketidakseragaman itu ada di v1 dan ditiru, bukan dirapikan. */
  const milik = await q(
    'SELECT id, nilai FROM options WHERE aktif = 1 AND tipe = ?'
    + ' ORDER BY (urutan = 0) ASC, urutan ASC, id ASC', [type]);

  const urut = (values || []).map((v) => teks(v).trim()).filter(Boolean);
  const data = [];
  const sudah = new Set();
  urut.forEach((v, i) => {
    /* Kembar yang sama-sama aktif diberi nomor SAMA supaya tetap berdampingan. */
    milik.forEach((r) => {
      if (sudah.has(r.id) || teks(r.nilai).toLowerCase() !== v.toLowerCase()) return;
      sudah.add(r.id);
      data.push([Number(r.id), i + 1]);
    });
  });
  /* Yang tak disebut ditaruh sesudahnya, bukan dibiarkan ber-urutan nol — kalau
     tidak, ia melompat ke belakang semua pada pengurutan berikutnya dan urutannya
     terlihat berubah sendiri. */
  let n = urut.length;
  milik.forEach((r) => { if (!sudah.has(r.id)) data.push([Number(r.id), ++n]); });

  if (!data.length) return { success: false, message: 'Tak ada pilihan yang cocok untuk diurutkan.' };
  for (const [id, nomor] of data) await q('UPDATE options SET urutan = ? WHERE id = ?', [nomor, id]);
  await logActivity(actor, 'Option Reorder', '', 'Urutan dropdown ' + type + ' diubah');
  return { success: true, message: 'Urutan dropdown disimpan.', options: await getOptions() };
}

/* ------------------------------------------------------------------ */
/* Komentar & notifikasi                                               */
/* ------------------------------------------------------------------ */

async function addComment(payload) {
  const taskId = teks(payload && payload.taskId).trim();
  const author = teks((payload && payload.author) || 'Unknown').trim();
  const message = teks(payload && payload.message).trim();
  if (!taskId) return { success: false, message: 'Task ID tidak valid.' };
  if (!message) return { success: false, message: 'Komentar tidak boleh kosong.' };

  await q('INSERT INTO comments (dibuat_at, task_id, author, message) VALUES (?, ?, ?, ?)',
    [nowStamp(), taskId, author, message]);
  await logActivity(author, 'Comment', taskId,
    message.length > 120 ? message.slice(0, 117) + '...' : message);
  await createMentionNotifications(taskId, author, message).catch(() => {});
  return { success: true, message: 'Komentar berhasil ditambahkan.', comments: await getComments(taskId) };
}

async function markNotificationsRead(user, refId) {
  const u = baseName(user);
  const ref = teks(refId).trim();
  /* baseName membuang imbuhan dalam kurung lalu mengecilkan huruf ("Nynda (PM)"
     cocok dengan "nynda"), jadi penyaringannya tak bisa diserahkan ke SQL. Dibaca
     dulu, dicocokkan di sini dengan fungsi yang sama, baru ditandai. */
  const baris = await q('SELECT id, for_user, ref_id, dibaca FROM notifications WHERE dibaca = 0');
  const sasaran = baris
    .filter((r) => baseName(r.for_user) === u && (!ref || teks(r.ref_id).trim() === ref))
    .map((r) => r.id);
  if (sasaran.length) {
    await q('UPDATE notifications SET dibaca = 1 WHERE id IN (?)', [sasaran]);
  }
  return { success: true, notifications: await getNotifications(user) };
}

/* Dipakai alat banding dan skrip, bukan oleh rpc.js. Tanpa ini proses Node
   menggantung menunggu pool yang masih terbuka. */
async function tutup() {
  if (_pool) { await _pool.end(); _pool = null; }
}

module.exports = {
  getUsers, listPinUsers, getAllLinks, getAllDashboards, getAllNotes,
  getTasks, getOptions, getComments, getChecklist, getActivityLog, getNotifications,
  getCollabs, getPackages,
  getAllCommentsLite, getChecklistSummary,
  getBootstrapData,
  addUserLink, updateUserLink, deleteUserLink,
  addNote, updateNote, deleteNote,
  addDashboard, updateDashboard, deleteDashboard,
  renameUserFolder, deleteUserFolder, renameNoteFolder, deleteNoteFolder,
  saveOption, editOption, deleteOption, reorderOptions,
  addComment, markNotificationsRead,
  _db: { pool, q, tutup, teks, stempel, pegangan },
};
