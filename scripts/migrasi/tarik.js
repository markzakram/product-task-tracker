/* =============================================================================
   tarik.js — TAHAP 1: Spreadsheet -> berkas JSON di db/dump/

   TIDAK menyentuh MySQL sama sekali, dan TIDAK menulis apa pun ke spreadsheet
   (scope-nya sengaja spreadsheets.readonly, jadi menulis mustahil, bukan sekadar
   tidak dilakukan).

   Kenapa dipisah dari tahap muat, bukan satu skrip langsung Sheets -> MySQL:

   1. Hasilnya bisa DIBACA orang sebelum satu baris pun masuk database. Migrasi
      yang tak bisa diperiksa dulu adalah migrasi yang baru ketahuan salahnya
      sesudah terlambat.
   2. Tiap tahap cuma memegang satu kredensial. Tak pernah ada satu proses yang
      sekaligus bisa membaca spreadsheet dan menulis database.
   3. Memuat ulang setelah gagal tak perlu menembak Sheets lagi — kuota API-nya
      tidak habis karena percobaan berulang.

   Jalankan:
     node scripts/migrasi/tarik.js

   Butuh:
     SPREADSHEET_ID                 env, wajib
     GOOGLE_SERVICE_ACCOUNT_JSON    env, atau credentials.json di akar repo
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { TABEL, petikBaris, barisKosong } = require('./bentuk.js');
require('./env.js').muatAtauIngatkan();

const DUMP = path.join(__dirname, '..', '..', 'db', 'dump');

/* Kunci yang cacat ditolak DI SINI, bukan diserahkan ke Google. Kalau diteruskan,
   yang muncul adalah "error:1E08010C:DECODER routines::unsupported" — pesan OpenSSL
   yang benar secara teknis dan tak berguna sama sekali bagi yang membacanya. Ia tak
   menyebut berkas mana, env mana, atau apa yang salah.

   Yang paling sering terjadi: .env.example disalin jadi .env lalu baris
   GOOGLE_SERVICE_ACCOUNT_JSON-nya ikut terbawa apa adanya. Nilai contohnya JSON yang
   sah dengan private key palsu, jadi lolos JSON.parse dan baru gagal jauh di dalam
   OpenSSL. Dan karena env menang atas berkas, credentials.json yang sah pun jadi
   tak terpakai. */
function periksaKunci(obj, asal) {
  const pk = String((obj && obj.private_key) || '');
  const salah = (sebab, saran) => {
    throw new Error('Kredensial dari ' + asal + ' tidak sah: ' + sebab + '\n  ' + saran);
  };
  if (!obj || !obj.client_email) salah('tak ada client_email', 'Pakai berkas JSON service account yang utuh.');
  if (!pk) salah('tak ada private_key', 'Pakai berkas JSON service account yang utuh.');
  if (pk.indexOf('-----BEGIN PRIVATE KEY-----') < 0) {
    salah('private_key bukan PEM', 'Nilainya harus diawali -----BEGIN PRIVATE KEY-----');
  }
  /* Kunci RSA 2048 yang asli sekitar 1700 karakter. Yang jauh lebih pendek pasti
     potongan contoh, bukan kunci sungguhan. */
  if (pk.length < 1000) {
    salah('private_key hanya ' + pk.length + ' karakter — ini contoh, bukan kunci asli',
      'Kosongkan baris GOOGLE_SERVICE_ACCOUNT_JSON di .env supaya credentials.json yang dipakai,\n'
      + '  atau isi dengan JSON service account Anda yang sebenarnya.');
  }
  return obj;
}

function kredensial() {
  const dariEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (dariEnv) {
    let obj;
    try { obj = JSON.parse(dariEnv); }
    catch (e) { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON bukan JSON yang sah: ' + e.message); }
    return periksaKunci(obj, 'env GOOGLE_SERVICE_ACCOUNT_JSON');
  }
  const p = path.join(__dirname, '..', '..', 'credentials.json');
  if (!fs.existsSync(p)) {
    throw new Error('Kredensial tak ada. Set env GOOGLE_SERVICE_ACCOUNT_JSON, atau taruh credentials.json di akar repo.');
  }
  return periksaKunci(JSON.parse(fs.readFileSync(p, 'utf8')), 'credentials.json');
}

async function main() {
  const sid = String(process.env.SPREADSHEET_ID || '').trim();
  if (!sid) throw new Error('Env SPREADSHEET_ID belum diset.');
  require('./env.js').periksaBukanContoh(['SPREADSHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_JSON']);

  const kred = kredensial();
  const auth = new google.auth.GoogleAuth({
    credentials: kred,
    /* readonly, bukan spreadsheets penuh. Skrip ini tak punya urusan menulis,
       jadi kemampuan menulisnya pun tak perlu diberikan. */
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const api = google.sheets({ version: 'v4', auth: await auth.getClient() });

  /* Sentuh spreadsheet-nya sekali sebelum menarik 18 tab. Dua gunanya:

     1. Gagal cepat dengan pesan yang berguna. Google membalas 404 "Requested
        entity was not found" untuk DUA sebab yang sangat berbeda — ID salah, dan
        ID benar tapi belum di-share — karena ia sengaja tak mau membocorkan
        spreadsheet mana yang ada. Pesannya sendiri tak menyebut keduanya.

     2. Menyebut JUDULNYA sebelum menarik apa pun. ID yang salah tapi sah akan
        berjalan mulus sampai selesai, dan Anda baru sadar sesudah 3.000 baris
        dari spreadsheet yang keliru masuk ke database. */
  let judul;
  try {
    const meta = await api.spreadsheets.get({ spreadsheetId: sid, fields: 'properties.title' });
    judul = (meta.data.properties || {}).title || '(tanpa judul)';
  } catch (e) {
    const kode = (e && e.code) || '';
    if (kode === 404 || /not found/i.test(String(e.message))) {
      throw new Error('Spreadsheet tak terjangkau.'
        + '\n  SPREADSHEET_ID : ' + sid
        + '\n  service account: ' + kred.client_email
        + '\n'
        + '\n  Google membalas 404 untuk dua sebab, dan tak membedakannya:'
        + '\n    a. ID-nya salah. Cocokkan dengan URL spreadsheet, bagian antara /d/ dan /edit.'
        + '\n    b. ID-nya benar tapi belum di-share ke service account di atas.'
        + '\n       Buka spreadsheet -> Bagikan -> tempel alamat itu -> Viewer sudah cukup.');
    }
    if (kode === 403) {
      throw new Error('Akses ditolak Google. Biasanya Google Sheets API belum diaktifkan'
        + '\n  untuk project service account ini, atau kuncinya sudah dicabut.'
        + '\n  service account: ' + kred.client_email);
    }
    throw e;
  }

  console.log('  menarik dari: ' + judul);
  console.log('  PERIKSA JUDULNYA. Kalau ini bukan spreadsheet yang Anda maksud, hentikan sekarang.\n');

  fs.mkdirSync(DUMP, { recursive: true });

  /* Buang keluhan dan tolakan dari tarikan sebelumnya. Berkas ini hanya ditulis
     kalau ADA isinya, jadi tarikan baru yang bersih akan meninggalkan berkas lama
     apa adanya — dan berkas itu lalu berbohong tentang keadaan sekarang. Persis
     itu yang terjadi: tasks.keluhan.txt masih melaporkan baris yang sudah lama
     tidak ditarik lagi. Berkas .tolak.txt milik muat.js ikut dibuang, karena
     tarikan baru membuat hasil pemuatan lama tak berlaku lagi. */
  for (const f of fs.readdirSync(DUMP)) {
    if (/\.(keluhan|tolak)\.txt$/.test(f)) fs.unlinkSync(path.join(DUMP, f));
  }

  const ringkasan = { spreadsheet: sid, waktu: new Date().toISOString(), tabel: [] };
  let totalKeluhan = 0;

  for (const spek of TABEL) {
    let nilai = [];
    let adaSheet = true;
    try {
      const res = await api.spreadsheets.values.get({
        spreadsheetId: sid,
        range: spek.sheet + '!' + spek.rentang,
        /* HARUS sama dengan yang dipakai aplikasi. Dengan dua opsi ini, tanggal
           kembali sebagai ANGKA SERIAL — dan itulah yang diharapkan bentuk.js.
           Kalau diganti FORMATTED_VALUE, tanggalnya kembali sebagai teks lokal
           ("7 Agu 2026") dan seluruh konversi tanggal akan gagal diam-diam. */
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'SERIAL_NUMBER',
      });
      nilai = res.data.values || [];
    } catch (e) {
      /* Sheet yang belum pernah dibuat bukan kesalahan — fitur yang belum
         tersentuh memang belum punya tab-nya. Dicatat, lalu lanjut. */
      if (String(e.message || '').indexOf('Unable to parse range') >= 0) adaSheet = false;
      else throw e;
    }

    /* Diturunkan dari rentangnya sendiri. Dipatok 2 akan salah untuk Main, yang
       datanya mulai baris 4 — dan salahnya berupa nomor baris keliru di tiap
       keluhan, yaitu tepat ketika nomor itu paling dibutuhkan. */
    const barisAwal = Number((spek.rentang.match(/^[A-Z]+(d+)/) || [])[1] || 2);
    const keluhan = [];
    const baris = [];
    let kosong = 0;
    let dibuang = 0;

    nilai.forEach((r, i) => {
      const nomorBaris = i + barisAwal;
      if (barisKosong(r)) { kosong++; return; }
      const o = petikBaris(spek, r, nomorBaris, keluhan);
      if (spek.wajib && !o[spek.wajib]) {
        /* Dicatat seluruhnya di hitungan, tapi hanya 20 pertama yang ditulis
           barisnya. Ribuan keluhan yang sama persis mengubur keluhan lain yang
           justru perlu dibaca. */
        dibuang++;
        if (dibuang <= 20) keluhan.push(spek.sheet + '!' + nomorBaris + ' dibuang: kolom ' + spek.wajib + ' kosong');
        return;
      }
      baris.push(o);
    });

    if (dibuang > 20) {
      keluhan.push('(dan ' + (dibuang - 20) + ' baris lain dibuang karena ' + spek.wajib
        + ' kosong — total ' + dibuang + ')');
    }
    fs.writeFileSync(path.join(DUMP, spek.tabel + '.json'),
      JSON.stringify(baris, null, 1));
    if (keluhan.length) {
      fs.writeFileSync(path.join(DUMP, spek.tabel + '.keluhan.txt'), keluhan.join('\n') + '\n');
    }

    totalKeluhan += keluhan.length;
    ringkasan.tabel.push({
      tabel: spek.tabel, sheet: spek.sheet, ada: adaSheet,
      dibacaSheet: nilai.length, kosong, dibuang, siapMuat: baris.length, keluhan: keluhan.length,
    });

    const tanda = !adaSheet ? '  (sheet belum ada)' : keluhan.length ? '  keluhan: ' + keluhan.length : '';
    console.log('  ' + spek.tabel.padEnd(18) + String(baris.length).padStart(6) + ' baris' + tanda);
  }

  fs.writeFileSync(path.join(DUMP, 'ringkasan.json'), JSON.stringify(ringkasan, null, 2));

  const total = ringkasan.tabel.reduce((n, t) => n + t.siapMuat, 0);
  console.log('\n  total ' + total + ' baris siap muat, ' + totalKeluhan + ' keluhan');
  if (totalKeluhan) {
    console.log('  Baca db/dump/*.keluhan.txt sebelum lanjut ke muat.js.');
    console.log('  Tiap keluhan menyebut sheet dan nomor barisnya, jadi bisa dibuka langsung.');
  }
  console.log('  Hasil di db/dump/ — periksa dulu, baru jalankan muat.js.');
}

/* Hanya jalan kalau dipanggil langsung, supaya periksaKunci() bisa diuji tanpa
   ikut menembak spreadsheet. */
if (require.main === module) {
  main().catch(e => { console.error('\nGAGAL: ' + e.message); process.exit(1); });
}

module.exports = { periksaKunci, kredensial };
