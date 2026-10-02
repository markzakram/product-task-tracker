/* =============================================================================
   jalan.js — menjalankan alat banding Sheets vs MySQL.

     node scripts/banding/jalan.js --rekam    rekam keluaran Sheets jadi acuan
     node scripts/banding/jalan.js            bandingkan api/_db.js dengan acuan

   Kenapa direkam dulu, bukan memanggil kedua backend berdampingan setiap kali:

   * Spreadsheet itu HIDUP. Selama migrasi kemarin saja, comments bertambah dari
     423 ke 425. Memanggil keduanya berurutan berarti beda yang muncul bisa saja
     cuma orang yang sedang bekerja, dan itu beda palsu yang memakan waktu untuk
     ditelusuri. Acuan yang beku membandingkan hal yang sama.
   * Memanggil Sheets tiap kali menulis satu fungsi di _db.js akan menghabiskan
     kuota API, dan lambat.

   Acuannya perlu direkam ULANG tiap kali data berubah banyak atau sesudah
   tarik+muat berikutnya. Ia menyimpan waktu perekamannya sendiri supaya umurnya
   terlihat.
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const { DAFTAR, rapikan, beda, sidikAturan } = require('./daftar.js');
require('../migrasi/env.js').muatAtauIngatkan();

const REKAM = process.argv.includes('--rekam');
const ACUAN = path.join(__dirname, '..', '..', 'db', 'banding');

/* Sheets memerlukan kredensial Google; _db.js memerlukan MySQL. Keduanya tak
   pernah dibutuhkan dalam satu jalan yang sama. */
function backendSheets() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const p = path.join(__dirname, '..', '..', 'credentials.json');
    if (fs.existsSync(p)) process.env.GOOGLE_SERVICE_ACCOUNT_JSON = fs.readFileSync(p, 'utf8');
  }
  return require('../../api/_sheets.js');
}

function backendMysql() {
  const p = path.join(__dirname, '..', '..', 'api', '_db.js');
  if (!fs.existsSync(p)) return null;
  return require(p);
}

/* Sebagian fungsi baca tidak diekspor di tingkat atas _sheets.js — ia pembantu
   internal getBootstrapData. Dicari juga di _internals, supaya alat banding tak
   DIAM-DIAM melewatkannya: fungsi yang tak terbandingkan adalah fungsi yang
   dipindahkan tanpa penilai. */
const ambilFungsi = (be, nama) =>
  (typeof be[nama] === 'function' ? be[nama]
    : (be._internals && typeof be._internals[nama] === 'function' ? be._internals[nama] : null));

const namaKasus = (nama, args) =>
  nama + (args.length ? '(' + args.map((a) => JSON.stringify(a)).join(', ') + ')' : '()');

async function main() {
  if (REKAM) return rekam();
  return banding();
}

/* ---- Merekam acuan dari Sheets ---------------------------------------- */
async function rekam() {
  const be = backendSheets();
  fs.mkdirSync(ACUAN, { recursive: true });
  console.log('  merekam acuan dari Sheets\n');

  let n = 0;
  const indeks = { waktu: new Date().toISOString(), sidik: sidikAturan(), kasus: [] };

  for (const spek of DAFTAR) {
    const semua = spek.argv();
    if (!semua.length) {
      console.log('  ' + spek.nama.padEnd(22) + 'dilewati — tak ada contoh argumen di db/dump/');
      continue;
    }
    for (let i = 0; i < semua.length; i++) {
      const args = semua[i];
      const label = namaKasus(spek.nama, args);
      try {
        const fn = ambilFungsi(be, spek.nama);
        if (!fn) throw new Error('tak ada di backend ini');
        const hasil = rapikan(await fn(...args), spek.kunci, spek.jagaUrutan);
        const berkas = spek.nama + '.' + i + '.json';
        fs.writeFileSync(path.join(ACUAN, berkas), JSON.stringify(hasil, null, 1));
        indeks.kasus.push({ nama: spek.nama, ke: i, args, berkas });
        n++;
        const ukuran = Array.isArray(hasil) ? hasil.length + ' baris' : 'objek';
        console.log('  ' + label.slice(0, 44).padEnd(46) + ukuran);
      } catch (e) {
        console.log('  ' + label.slice(0, 44).padEnd(46) + 'GAGAL: ' + e.message);
      }
    }
  }

  fs.writeFileSync(path.join(ACUAN, 'indeks.json'), JSON.stringify(indeks, null, 2));

  /* Fungsi yang gagal direkam akan hilang begitu saja dari laporan banding — dan
     fungsi yang tak terbandingkan adalah fungsi yang dipindahkan tanpa penilai,
     persis keadaan yang alat ini ada untuk mencegahnya.

     Ini sudah terjadi: getAllCommentsLite dan getChecklistSummary ternyata tidak
     diekspor di tingkat atas _sheets.js, perekamannya gagal, dan laporannya tetap
     mengatakan "0 beda" dengan tenang. */
  const hilang = DAFTAR.map((s) => s.nama).filter((nama) => !indeks.kasus.some((k) => k.nama === nama));
  if (hilang.length) {
    console.log('\n  TAK TEREKAM: ' + hilang.join(', '));
    console.log('  Fungsi ini ada di daftar tapi gagal dipanggil di sisi Sheets.');
    console.log('  Biasanya karena tidak diekspor — periksa module.exports dan _internals.');
    console.log('  Dibiarkan, ia akan lenyap dari laporan banding tanpa ada yang tahu.');
    process.exit(1);
  }

  console.log('\n  ' + n + ' kasus terekam di db/banding/');
  console.log('  Rekam ulang kalau data sudah banyak berubah — acuan basi menghasilkan beda palsu.\n');
}

/* ---- Membandingkan _db.js dengan acuan --------------------------------- */
async function banding() {
  const indeksP = path.join(ACUAN, 'indeks.json');
  if (!fs.existsSync(indeksP)) {
    throw new Error('Acuan belum ada. Jalankan dulu:  node scripts/banding/jalan.js --rekam');
  }
  const indeks = JSON.parse(fs.readFileSync(indeksP, 'utf8'));
  const umurJam = Math.round((Date.now() - new Date(indeks.waktu).getTime()) / 3600000);

  /* Acuan direkam lewat rapikan(). Kalau aturannya berubah sejak itu, acuan lama
     membandingkan hal yang berbeda — dan bedanya menyamar jadi bug di _db.js. */
  if (indeks.sidik !== sidikAturan()) {
    throw new Error('Aturan pembanding berubah sejak acuan direkam.'
      + '\n  Acuan lama tidak sebanding, dan bedanya akan menyamar jadi bug di _db.js.'
      + '\n  Rekam ulang:  node scripts/banding/jalan.js --rekam');
  }
  console.log('  acuan direkam ' + indeks.waktu.slice(0, 16).replace('T', ' ')
    + '  (' + umurJam + ' jam lalu)\n');

  const be = backendMysql();
  if (!be) {
    console.log('  api/_db.js belum ada — belum ada yang bisa dibandingkan.');
    console.log('  ' + indeks.kasus.length + ' kasus menunggu di db/banding/.\n');
    console.log('  Tiap fungsi yang ditulis di _db.js langsung punya ukuran benar-salahnya');
    console.log('  sendiri: jalankan ini lagi, dan yang belum ditulis akan tampil "belum ada".\n');
    return;
  }

  const peta = {};
  DAFTAR.forEach((s) => { peta[s.nama] = s; });

  let cocok = 0, salah = 0, belum = 0;
  const gagal = [];

  for (const k of indeks.kasus) {
    const label = namaKasus(k.nama, k.args);
    const fn = ambilFungsi(be, k.nama);
    if (!fn) { belum++; continue; }

    let dapat;
    try {
      dapat = rapikan(await fn(...k.args), (peta[k.nama] || {}).kunci, (peta[k.nama] || {}).jagaUrutan);
    } catch (e) {
      salah++; gagal.push({ label, d: { jalur: '', pesan: 'melempar: ' + e.message } });
      console.log('  X  ' + label.slice(0, 50).padEnd(52) + 'melempar');
      continue;
    }

    const harap = JSON.parse(fs.readFileSync(path.join(ACUAN, k.berkas), 'utf8'));
    const d = beda(harap, dapat, '');
    if (!d) { cocok++; console.log('  ok ' + label.slice(0, 50)); }
    else { salah++; gagal.push({ label, d }); console.log('  X  ' + label.slice(0, 50).padEnd(52) + d.pesan); }
  }

  if (gagal.length) {
    console.log('\n  --- beda pertama tiap kasus ---');
    for (const g of gagal) {
      console.log('\n  ' + g.label);
      console.log('    jalur  : ' + (g.d.jalur || '(akar)'));
      console.log('    masalah: ' + g.d.pesan);
      if ('a' in g.d) {
        console.log('    sheets : ' + JSON.stringify(g.d.a).slice(0, 110));
        console.log('    mysql  : ' + JSON.stringify(g.d.b).slice(0, 110));
      }
    }
  }

  /* Pool MySQL dibiarkan terbuka akan membuat proses Node menggantung setelah
     laporan tercetak — terlihat seperti alat yang macet, padahal sudah selesai. */
  if (be._db && typeof be._db.tutup === 'function') await be._db.tutup();

  console.log('\n  ' + cocok + ' cocok, ' + salah + ' beda, ' + belum + ' belum ditulis di _db.js');
  if (salah) process.exit(1);
}

main().catch((e) => { console.error('\nGAGAL: ' + e.message); process.exit(1); });
