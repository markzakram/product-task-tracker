/* =============================================================================
   siap.js — memeriksa apakah DATA_SOURCE=mysql sudah boleh dinyalakan.

     node scripts/banding/siap.js

   Menjawab satu pertanyaan dengan pasti: kalau saklarnya ditukar sekarang, apa
   yang akan rusak? Jawabannya tidak boleh berupa perkiraan.

   Yang diperiksa:

     1. CAKUPAN FUNGSI. Tiap aksi di HANDLERS milik api/rpc.js memanggil sebuah
        fungsi backend. Yang belum ada di api/_db.js akan GAGAL saat dipanggil —
        dan gagalnya baru terjadi ketika ada orang menekan tombolnya, bukan saat
        deploy. Inilah gerbang utamanya.

     2. ENV. Kredensial MySQL lengkap atau tidak.

     3. DATABASE. Terjangkau, 18 tabel ada, dan isinya tidak kosong.

   Tidak menulis apa pun. Aman dijalankan kapan saja, termasuk dari mesin siapa
   pun yang punya .env.
   ========================================================================== */

const fs = require('fs');
const path = require('path');
require('../migrasi/env.js').muatAtauIngatkan();

const AKAR = path.join(__dirname, '..', '..');

/* Daftar aksinya dibaca dari rpc.js apa adanya, bukan ditulis ulang di sini.
   Daftar yang disalin akan ketinggalan begitu ada aksi baru ditambahkan — dan
   ketinggalannya diam, karena pemeriksa tetap melaporkan "siap". */
function aksiDariRpc() {
  const src = fs.readFileSync(path.join(AKAR, 'api', 'rpc.js'), 'utf8');
  const mulai = src.indexOf('const HANDLERS = {');
  if (mulai < 0) throw new Error('HANDLERS tak ketemu di api/rpc.js');
  const peta = {};
  const re = /(\w+)\s*:\s*\([^)]*\)\s*=>\s*backend\.(\w+)\(/g;
  let m;
  while ((m = re.exec(src.slice(mulai)))) peta[m[1]] = m[2];
  return peta;
}

function tabelDariDDL() {
  const sql = fs.readFileSync(path.join(AKAR, 'db', 'produk_base.sql'), 'utf8');
  return (sql.match(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/g) || [])
    .map((x) => x.replace('CREATE TABLE IF NOT EXISTS ', ''));
}

async function main() {
  let siap = true;
  const kurang = [];

  /* --- 1. Cakupan fungsi ------------------------------------------------ */
  const aksi = aksiDariRpc();
  const db = require('../../api/_db.js');
  const sheets = require('../../api/_sheets.js');

  const namaAksi = Object.keys(aksi);
  for (const a of namaAksi) {
    const fn = aksi[a];
    const adaDb = typeof db[fn] === 'function';
    const adaSheets = typeof sheets[fn] === 'function'
      || (sheets._internals && typeof sheets._internals[fn] === 'function');
    if (!adaDb) { kurang.push({ aksi: a, fn, adaSheets }); siap = false; }
  }

  console.log('=== Cakupan fungsi ===');
  console.log('  aksi di rpc.js        : ' + namaAksi.length);
  console.log('  sudah ada di _db.js   : ' + (namaAksi.length - kurang.length));
  console.log('  BELUM ada             : ' + kurang.length);
  if (kurang.length) {
    /* Dikelompokkan supaya terbaca sebagai pekerjaan, bukan sebagai daftar panjang. */
    const perFungsi = {};
    kurang.forEach((k) => { perFungsi[k.fn] = (perFungsi[k.fn] || []).concat(k.aksi); });
    console.log('\n  Fungsi yang belum dipindahkan (aksi yang akan gagal):');
    Object.keys(perFungsi).sort().forEach((f) => {
      console.log('    ' + f.padEnd(26) + perFungsi[f].join(', '));
    });
  }

  /* --- 2. Env ----------------------------------------------------------- */
  console.log('\n=== Kredensial MySQL ===');
  const perlu = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
  perlu.forEach((k) => {
    const ada = !!process.env[k];
    if (!ada) siap = false;
    /* Nilainya TIDAK dicetak — yang perlu diketahui cuma terisi atau tidak. */
    console.log('  ' + k.padEnd(18) + (ada ? 'terisi' : 'KOSONG'));
  });

  /* --- 3. Database ------------------------------------------------------ */
  console.log('\n=== Database ===');
  try {
    const tabel = tabelDariDDL();
    let total = 0;
    const kosong = [];
    for (const t of tabel) {
      const [r] = await db._db.q('SELECT COUNT(*) AS n FROM `' + t + '`');
      const n = Number(r.n) || 0;
      total += n;
      if (!n) kosong.push(t);
    }
    console.log('  tabel terbaca   : ' + tabel.length + ' dari ' + tabel.length);
    console.log('  total baris     : ' + total);
    console.log('  tabel kosong    : ' + (kosong.length ? kosong.join(', ') : 'tak ada'));
    if (!total) { console.log('  DATABASE KOSONG — jalankan tarik.js lalu muat.js'); siap = false; }
  } catch (e) {
    console.log('  TAK TERJANGKAU: ' + e.message);
    siap = false;
  }

  await db._db.tutup().catch(() => {});

  console.log('\n' + (siap
    ? 'SIAP. DATA_SOURCE=mysql boleh dinyalakan.'
    : 'BELUM SIAP. Perbaiki yang bertanda di atas lebih dulu.'));
  if (!siap) process.exit(1);
}

main().catch((e) => { console.error('\nGAGAL: ' + e.message); process.exit(1); });
