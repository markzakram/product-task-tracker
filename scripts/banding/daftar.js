/* =============================================================================
   daftar.js — fungsi baca mana yang dibandingkan, dan bagaimana membandingkannya.

   Tahap 3 memindahkan 64 fungsi dari Sheets ke MySQL. Beralih tanpa alat banding
   berarti bertaruh bahwa 64 terjemahan itu tak satu pun meleset — dan taruhan itu
   akan kalah. Karena kedua backend punya tanda tangan fungsi yang identik,
   keduanya bisa dipanggil berdampingan dan hasilnya dibandingkan otomatis, dengan
   data sungguhan.

   Yang dibandingkan hanya fungsi BACA. Fungsi tulis diuji belakangan dengan cara
   lain: menulis ke dua tempat sekaligus bukan perbandingan, melainkan dua sumber
   kebenaran yang akan menyimpang.
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const DUMP = path.join(__dirname, '..', '..', 'db', 'dump');

/* Contoh argumen diambil dari hasil tarikan, bukan dikarang. Fungsi seperti
   getComments(taskId) tak ada gunanya dibandingkan dengan id yang tak punya
   komentar — yang dibandingkan jadi dua daftar kosong, dan itu selalu "cocok". */
function contoh(berkas, ambil, berapa) {
  const p = path.join(DUMP, berkas + '.json');
  if (!fs.existsSync(p)) return [];
  const baris = JSON.parse(fs.readFileSync(p, 'utf8'));
  const lihat = new Set();
  const hasil = [];
  for (const o of baris) {
    const v = ambil(o);
    if (!v || lihat.has(v)) continue;
    lihat.add(v);
    hasil.push(v);
    if (hasil.length >= (berapa || 3)) break;
  }
  return hasil;
}

/* Kunci yang HARUS dibuang sebelum membandingkan.

   `row` dan `rowNumber` adalah nomor baris spreadsheet. Ia mustahil ada di
   MySQL, dan memang tak seharusnya ada: nomor baris bergeser tiap kali sesuatu
   dihapus. Justru karena frontend memakainya, memindahkannya ke id adalah
   pekerjaan wajib tahap 3 — bukan sesuatu yang ditiru di sisi MySQL. */
/* `generatedAt` adalah nowStamp() — berubah tiap panggilan, jadi membandingkannya
   berarti setiap jalan selalu gagal. Yang dibandingkan isinya, bukan jamnya. */
const BUANG_GLOBAL = ['row', 'rowNumber', 'generatedAt'];

const DAFTAR = [
  { nama: 'getUsers', argv: () => [[]], kunci: (x) => x.name },
  /* Urutan dropdown dipilih orang lewat fitur seret-urut, jadi dibandingkan apa adanya. */
  { nama: 'getOptions', argv: () => [[]], jagaUrutan: true },
  { nama: 'getAllDashboards', argv: () => [[]], kunci: (x) => x.url },
  { nama: 'getAllLinks', argv: () => [[]], kunci: (x) => [x.user, x.title, x.url].join('|') },
  { nama: 'getAllNotes', argv: () => [[]], kunci: (x) => [x.user, x.title].join('|') },
  { nama: 'listPinUsers', argv: () => [[]] },
  { nama: 'getAllCommentsLite', argv: () => [[]], kunci: (x) => [x.timestamp, x.taskId, x.author].join('|') },
  { nama: 'getChecklistSummary', argv: () => [[]] },

  /* Inilah yang betul-betul dipanggil aplikasi saat membuka. Tiga cabangnya diuji
     terpisah: tamu Lintas Divisi dan magang menerima data yang SUDAH disaring di
     server, jadi beda di sini berarti kebocoran, bukan sekadar tampilan keliru. */
  { nama: 'getBootstrapData', argv: () => [[{}], [{ viewOnly: true }], [{ magangOnly: true }]] },
  { nama: 'getPackages', argv: () => [[]], kunci: (x) => x.id },
  { nama: 'getCollabs', argv: () => [[]], kunci: (x) => x.id },
  { nama: 'getTasks', argv: () => [[]], kunci: (x) => x.id },

  /* Dibatasi 200 karena itu yang dipakai bootstrap. Membandingkan 3.534 baris
     riwayat tak menambah keyakinan apa pun atas yang 200. */
  /* Riwayat dibalik jadi terbaru-dulu lalu dipotong 200. Kalau urutannya diratakan,
     "200 terbaru" vs "200 tersembunyi mana saja" jadi tak terbedakan. */
  { nama: 'getActivityLog', argv: () => [[200]], jagaUrutan: true },

  { nama: 'getComments', argv: () => contoh('comments', (o) => o.task_id, 3).map((id) => [id]) },
  { nama: 'getChecklist', argv: () => contoh('checklists', (o) => o.task_id, 3).map((id) => [id]) },
  /* Juga dibalik: terbaru dulu. */
  { nama: 'getNotifications', argv: () => contoh('notifications', (o) => o.for_user, 3).map((u) => [u]), jagaUrutan: true },
];

/* ---------------------------------------------------------------------------
   Normalisasi. Dua hasil boleh berbeda dalam hal yang tak berarti — urutan baris
   dan nomor baris spreadsheet — tapi tidak boleh berbeda isinya.

   Urutan sengaja diratakan, bukan dibandingkan. MySQL tanpa ORDER BY tak
   menjanjikan urutan apa pun, jadi urutan yang kebetulan sama hari ini bisa
   berubah besok tanpa ada yang berubah. Kalau suatu fungsi memang BERGANTUNG
   pada urutan, itu harus ditegakkan ORDER BY di _db.js dan diuji tersendiri —
   bukan diandalkan dari kebetulan.
   ------------------------------------------------------------------------ */
function rapikan(v, kunci, jagaUrutan) {
  if (Array.isArray(v)) {
    const isi = v.map((x) => rapikan(x, null, jagaUrutan));
    /* Sebagian fungsi URUTANNYA BERMAKNA. getOptions mengisi dropdown yang punya
       fitur seret-untuk-mengurutkan: urutan itu dipilih orang dan dilihat orang,
       jadi meratakannya akan menyembunyikan kerusakan yang paling kelihatan.
       Untuk yang begitu, urutan dibandingkan apa adanya dan _db.js wajib
       menegakkannya lewat ORDER BY, bukan mengandalkan kebetulan. */
    if (jagaUrutan) return isi;
    return kunci
      ? isi.slice().sort((a, b) => String(kunci(a)).localeCompare(String(kunci(b))))
      : isi.slice().sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) {
      if (BUANG_GLOBAL.indexOf(k) >= 0) continue;
      o[k] = rapikan(v[k], null, jagaUrutan);
    }
    return o;
  }
  return v;
}

/* Beda PERTAMA yang ditemukan, lengkap dengan jalurnya. Satu beda yang bisa
   ditunjuk tempatnya lebih berguna daripada dua objek besar berdampingan. */
function beda(a, b, jalur) {
  jalur = jalur || '';
  if (a === b) return null;

  const ta = a === null ? 'null' : Array.isArray(a) ? 'array' : typeof a;
  const tb = b === null ? 'null' : Array.isArray(b) ? 'array' : typeof b;
  if (ta !== tb) return { jalur, pesan: 'tipe beda: ' + ta + ' vs ' + tb, a, b };

  if (ta === 'array') {
    if (a.length !== b.length) return { jalur, pesan: 'panjang beda: ' + a.length + ' vs ' + b.length };
    for (let i = 0; i < a.length; i++) {
      const d = beda(a[i], b[i], jalur + '[' + i + ']');
      if (d) return d;
    }
    return null;
  }

  if (ta === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    const hilang = ka.filter((k) => kb.indexOf(k) < 0);
    const lebih = kb.filter((k) => ka.indexOf(k) < 0);
    if (hilang.length) return { jalur, pesan: 'tak ada di MySQL: ' + hilang.join(', ') };
    if (lebih.length) return { jalur, pesan: 'hanya ada di MySQL: ' + lebih.join(', ') };
    for (const k of ka) {
      const d = beda(a[k], b[k], jalur ? jalur + '.' + k : k);
      if (d) return d;
    }
    return null;
  }

  return { jalur, pesan: 'nilai beda', a, b };
}

/* Menyamarkan nilai yang MEMANG tak mungkin sama, tanpa berhenti memeriksanya.

   Contohnya `updatedAt`: addNote menulis nowStamp(), dan kedua backend
   memanggilnya pada detik yang berbeda. Membandingkannya mentah-mentah membuat
   skenario catatan selalu gagal.

   Tapi MEMBUANGNYA juga salah — itu akan ikut menyembunyikan kasus yang justru
   perlu ketahuan: stempel yang tidak terisi sama sekali, atau terisi dengan
   bentuk yang keliru. Jadi nilainya diganti penanda yang menyatakan apakah ia
   cocok polanya. "Keduanya punya stempel yang sah" tetap diperiksa; hanya menit
   persisnya yang tidak. */
function samarkan(v, aturan, kunci) {
  if (!aturan) return v;
  if (Array.isArray(v)) return v.map((x) => samarkan(x, aturan, null));
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = samarkan(v[k], aturan, k);
    return o;
  }
  if (kunci && aturan[kunci]) {
    const s = v === null || v === undefined ? '' : String(v);
    return aturan[kunci].test(s) ? '<pola cocok>' : '<POLA TAK COCOK: ' + JSON.stringify(s) + '>';
  }
  return v;
}

/* Sidik jari ATURAN pembandingnya, bukan datanya.

   Acuan direkam lewat rapikan(), jadi mengubah aturan rapikan membuat acuan lama
   tak sebanding dengan keluaran baru — dan bedanya muncul sebagai "beda nilai"
   yang terlihat persis seperti bug sungguhan di _db.js.

   Ini bukan kekhawatiran teoretis: saklar jagaUrutan ditambahkan setelah acuan
   direkam, dan tiga fungsi langsung tampak rusak. Hampir saja satu kolom
   ditambahkan ke skema untuk memperbaiki masalah yang tidak ada. */
function sidikAturan() {
  return JSON.stringify({
    buang: BUANG_GLOBAL,
    urut: DAFTAR.map((s) => s.nama + (s.jagaUrutan ? ":jaga" : "")).sort(),
  });
}

module.exports = { DAFTAR, BUANG_GLOBAL, rapikan, beda, contoh, sidikAturan, samarkan };
