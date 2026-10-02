/* =============================================================================
   muat.js — TAHAP 2: berkas JSON di db/dump/ -> MySQL

   TIDAK menyentuh spreadsheet sama sekali. Sumbernya hanya berkas yang sudah
   ditarik dan sudah bisa Anda baca.

   Kunci asing SENGAJA dibiarkan menyala. Godaannya besar untuk mematikannya
   supaya "semua masuk", tapi justru penolakannya yang berharga: tiap baris yang
   ditolak adalah kerusakan yang selama ini ada di spreadsheet tanpa terlihat.
   Mematikan FOREIGN_KEY_CHECKS berarti memindahkan kerusakan itu ke tempat baru
   dan menamainya keberhasilan.

   Jalankan:
     node scripts/migrasi/muat.js
     node scripts/migrasi/muat.js --ulang     (kosongkan dulu, lalu muat lagi)

   Butuh:
     MYSQL_HOST  MYSQL_PORT  MYSQL_USER  MYSQL_PASSWORD  MYSQL_DATABASE
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const { TABEL } = require('./bentuk.js');
require('./env.js').muatAtauIngatkan();

const DUMP = path.join(__dirname, '..', '..', 'db', 'dump');
const ULANG = process.argv.includes('--ulang');
const SEKALI_MUAT = 500;

let mysql;
try {
  mysql = require('mysql2/promise');
} catch (e) {
  console.error('Paket mysql2 belum terpasang. Jalankan dulu:\n\n    npm install mysql2\n');
  process.exit(1);
}

/* Kunci alami tiap tabel. Dipakai untuk menangkap baris kembar SEBELUM MySQL
   menolaknya, supaya pesannya menyebut sebabnya ("ITM-0662 muncul dua kali")
   dan bukan ER_DUP_ENTRY yang tak memberi tahu siapa pun apa-apa.
   Tabel yang id-nya AUTO_INCREMENT tak punya kunci alami: baris kembar di sana
   memang sah (dua komentar yang sama persis itu mungkin saja). */
const KUNCI = {
  users: ['nama'],
  options: ['tipe', 'nilai'],
  auth_pins: ['user_nama'],
  packages: ['paket_id'],
  package_items: ['item_id'],
  package_links: ['paket_id', 'urutan'],
  package_variants: ['paket_id', 'urutan'],
  collabs: ['collab_id'],
  collab_steps: ['collab_id', 'urutan'],
  package_contribs: ['item_id', 'collab_id', 'step_order'],
  tasks: ['task_id'],
  notifications: ['id'],
};

async function main() {
  for (const k of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']) {
    if (!process.env[k]) throw new Error('Env ' + k + ' belum diset.');
  }

  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    /* Servernya diakses lewat IP publik, jadi tanpa ini kata sandi dan seluruh
       isi task melintas sebagai teks terbuka. rejectUnauthorized:false berarti
       lalu lintasnya TERENKRIPSI tapi identitas servernya TIDAK diverifikasi —
       cukup untuk menutup penyadapan pasif, tidak cukup untuk menangkal
       orang-di-tengah. Untuk verifikasi penuh, minta berkas CA ke IT lalu isi
       MYSQL_CA. */
    ssl: process.env.MYSQL_CA
      ? { ca: fs.readFileSync(process.env.MYSQL_CA) }
      : { rejectUnauthorized: false },
    dateStrings: true,
    multipleStatements: false,
  });

  console.log('  tersambung ke ' + process.env.MYSQL_DATABASE + ' di ' + process.env.MYSQL_HOST + '\n');

  /* --- Pemeriksaan awal: semua tabel harus ada DAN kosong ------------------
     Memuat ke tabel yang sudah berisi adalah cara tercepat melipatgandakan
     data tanpa sadar — persis bug 1.120.0, tapi untuk seluruh database. */
  const [adaTabel] = await db.query(
    'SELECT TABLE_NAME AS t, TABLE_ROWS AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
    [process.env.MYSQL_DATABASE]);
  const punya = new Set(adaTabel.map(r => r.t));
  const hilang = TABEL.map(s => s.tabel).filter(t => !punya.has(t));
  if (hilang.length) throw new Error('Tabel belum dibuat: ' + hilang.join(', ') + '\n  Jalankan db/produk_base.sql dulu.');

  const berisi = [];
  for (const spek of TABEL) {
    const [[r]] = await db.query('SELECT COUNT(*) AS n FROM `' + spek.tabel + '`');
    if (r.n > 0) berisi.push(spek.tabel + ' (' + r.n + ')');
  }
  if (berisi.length && !ULANG) {
    throw new Error('Tabel ini sudah berisi: ' + berisi.join(', ')
      + '\n  Muat ulang akan menggandakan isinya. Kalau memang mau mengulang dari nol,'
      + '\n  jalankan dengan --ulang (isinya akan DIHAPUS lebih dulu).');
  }
  if (berisi.length && ULANG) {
    console.log('  --ulang: mengosongkan ' + berisi.length + ' tabel...');
    /* Terbalik dari urutan muat: anak dulu, induk belakangan. */
    for (const spek of [...TABEL].reverse()) await db.query('DELETE FROM `' + spek.tabel + '`');
    console.log('');
  }

  /* --- Muat per tabel ---------------------------------------------------- */
  const sudahAda = {};                       // tabel -> Set kunci yang sudah masuk
  const laporan = [];
  let adaTolakan = 0;

  for (const spek of TABEL) {
    const berkas = path.join(DUMP, spek.tabel + '.json');
    if (!fs.existsSync(berkas)) throw new Error('Berkas ' + berkas + ' tak ada. Jalankan tarik.js dulu.');
    const semua = JSON.parse(fs.readFileSync(berkas, 'utf8'));

    const tolak = [];
    const siap = [];
    const kunciTabel = KUNCI[spek.tabel];
    const terlihat = new Set();

    for (const o of semua) {
      const noBaris = o.__baris;
      const buang = (alasan) => tolak.push(spek.sheet + '!' + noBaris + '  ' + alasan);

      // 1. Baris kembar menurut kunci alaminya
      if (kunciTabel) {
        const k = kunciTabel.map(c => String(o[c])).join('|');
        if (terlihat.has(k)) { buang('kembar: ' + k + ' sudah ada di baris sebelumnya'); continue; }
        terlihat.add(k);
      }

      // 2. Rujukan yang menggantung
      if (spek.tabel === 'package_items' && !sudahAda.packages.has(o.paket_id)) {
        buang('paket ' + o.paket_id + ' tidak ada'); continue;
      }
      if ((spek.tabel === 'package_links' || spek.tabel === 'package_variants')
          && !sudahAda.packages.has(o.paket_id)) {
        buang('paket ' + o.paket_id + ' tidak ada'); continue;
      }
      if (spek.tabel === 'collab_steps' && !sudahAda.collabs.has(o.collab_id)) {
        buang('collab ' + o.collab_id + ' tidak ada'); continue;
      }
      if (spek.tabel === 'package_contribs') {
        if (!sudahAda.package_items.has(o.item_id)) { buang('target ' + o.item_id + ' tidak ada'); continue; }
        if (!sudahAda.collab_steps.has(o.collab_id + '|' + o.step_order)) {
          buang('proses ' + o.collab_id + ' langkah ' + o.step_order + ' tidak ada'); continue;
        }
        if (!sudahAda.packages.has(o.paket_id)) { buang('paket ' + o.paket_id + ' tidak ada'); continue; }
      }
      /* collabs.paket_id menggantung TIDAK membuang collab-nya. Proses kolaborasi
         adalah pekerjaan yang berdiri sendiri; kehilangan tautan ke paket jauh
         lebih ringan daripada kehilangan prosesnya. Dikosongkan, lalu dicatat. */
      if (spek.tabel === 'collabs' && o.paket_id && !sudahAda.packages.has(o.paket_id)) {
        tolak.push(spek.sheet + '!' + noBaris + '  (tetap dimuat) tautan ke paket '
          + o.paket_id + ' dilepas karena paketnya tidak ada');
        o.paket_id = null;
      }

      siap.push(o);
    }

    // 3. Sisipkan, berombongan
    const kolom = spek.kolom.map(k => k[0]);
    const sql = 'INSERT INTO `' + spek.tabel + '` (`' + kolom.join('`,`') + '`) VALUES ?';
    /* Satu tempat saja yang menyusun nilainya, dipakai jalur rombongan MAUPUN
       jalur satu-per-satu. Kalau keduanya menyusun sendiri-sendiri, perbedaan di
       antaranya hanya muncul pada baris yang kebetulan gagal — persis baris yang
       paling sulit ditelusuri. */
    const nilaiBaris = (o) => kolom.map(c => (o[c] === '' && c.endsWith('_at') ? null : o[c]));
    let masuk = 0;
    for (let i = 0; i < siap.length; i += SEKALI_MUAT) {
      const potongan = siap.slice(i, i + SEKALI_MUAT);
      try {
        await db.query(sql, [potongan.map(nilaiBaris)]);
        masuk += potongan.length;
      } catch (e) {
        /* Satu baris buruk tak boleh menjatuhkan 499 baris lain, dan kita perlu
           tahu baris MANA. Jadi rombongan yang gagal diulang satu per satu. */
        for (const o of potongan) {
          try {
            await db.query(sql, [[nilaiBaris(o)]]);
            masuk++;
          } catch (e2) {
            tolak.push(spek.sheet + '!' + o.__baris + '  ditolak MySQL: ' + e2.code + ' ' + e2.sqlMessage);
          }
        }
      }
    }

    // 4. Catat kunci yang benar-benar masuk, untuk dipakai tabel berikutnya
    if (kunciTabel) {
      sudahAda[spek.tabel] = new Set(siap.map(o => kunciTabel.map(c => String(o[c])).join('|')));
    }

    if (tolak.length) {
      fs.writeFileSync(path.join(DUMP, spek.tabel + '.tolak.txt'), tolak.join('\n') + '\n');
      adaTolakan += tolak.length;
    }
    laporan.push({ tabel: spek.tabel, dari: semua.length, masuk, tolak: tolak.length });
    console.log('  ' + spek.tabel.padEnd(18) + String(masuk).padStart(6) + ' / ' + String(semua.length).padEnd(6)
      + (tolak.length ? '  tolak: ' + tolak.length : ''));
  }

  /* --- Cocokkan jumlahnya dengan yang betul-betul ada di tabel ------------- */
  console.log('\n  --- hitungan di database ---');
  let beda = 0;
  for (const l of laporan) {
    const [[r]] = await db.query('SELECT COUNT(*) AS n FROM `' + l.tabel + '`');
    const cocok = r.n === l.masuk;
    if (!cocok) beda++;
    console.log('  ' + l.tabel.padEnd(18) + String(r.n).padStart(6) + (cocok ? '' : '   TIDAK COCOK, harusnya ' + l.masuk));
  }

  const total = laporan.reduce((n, l) => n + l.masuk, 0);
  console.log('\n  ' + total + ' baris masuk, ' + adaTolakan + ' ditolak');
  if (adaTolakan) console.log('  Baca db/dump/*.tolak.txt — tiap baris menyebut sheet dan nomornya.');
  if (beda) console.log('  ADA ' + beda + ' TABEL YANG JUMLAHNYA TIDAK COCOK. Jangan lanjut sebelum ini jelas.');

  await db.end();
}

main().catch(e => { console.error('\nGAGAL: ' + e.message); process.exit(1); });
