/* Migrasi "Priority" (Urgent/High/Normal/Low) -> "Tingkat Kesulitan" (Sulit/Normal/Mudah).
   Menyentuh dua tempat: kolom F sheet Main, dan baris bertipe `priority` di sheet OPTIONS.

   WAJIB dijalankan sebelum aplikasi versi baru dipakai. Kalau tidak, task lama menyimpan
   nilai yang tak ada di daftar pilihan — dan `<select>` HTML tak bisa menampilkan nilai
   yang bukan salah satu opsinya, sehingga membuka lalu menyimpan task akan MENGOSONGKAN
   nilainya tanpa peringatan.

   Pemakaian (uji coba dulu, tidak menulis apa pun):

     TUJUAN_ID=<id-spreadsheet> node scripts/migrasi-kesulitan.js

   Kalau angkanya cocok:

     TUJUAN_ID=<id-spreadsheet> node scripts/migrasi-kesulitan.js --apply

   Kredensial dari env GOOGLE_SERVICE_ACCOUNT_JSON, atau credentials.json di akar repo. */
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const TUJUAN_ID = process.env.TUJUAN_ID;
const APPLY = process.argv.includes('--apply');
/* Baris 1-3 sheet Main berisi judul & header; data task mulai baris 4. Angka ini harus
   sepadan dengan CONFIG.FIRST_DATA_ROW di api/_sheets.js — kalau meleset, migrasinya bisa
   menimpa baris header. */
const BARIS_DATA = 4;
const SHEET_TASK = process.env.SHEET_TASK || 'Main';
const SHEET_OPTIONS = process.env.SHEET_OPTIONS || 'OPTIONS';

/* Empat tingkat urgensi menyusut jadi tiga tingkat kesulitan. Urgent dan High digabung
   atas keputusan Ali: bedanya tak pernah jelas dalam pemakaian sehari-hari. */
const PETA = {
  urgent: 'Sulit',
  high: 'Sulit',
  normal: 'Normal',
  medium: 'Normal',
  low: 'Mudah',
};
const BARU = ['Sulit', 'Normal', 'Mudah'];

const t = v => String(v === null || v === undefined ? '' : v).trim();

function kredensial() {
  const dariEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (dariEnv) return JSON.parse(dariEnv);
  const p = path.join(__dirname, '..', 'credentials.json');
  if (!fs.existsSync(p)) {
    throw new Error('Kredensial tak ada. Set env GOOGLE_SERVICE_ACCOUNT_JSON, atau taruh credentials.json di akar repo.');
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Dipakai uji: memetakan satu nilai, tanpa menyentuh jaringan.
function petakan(nilai) {
  const k = t(nilai).toLowerCase();
  if (!k) return '';                       // kosong dibiarkan kosong
  if (BARU.some(b => b.toLowerCase() === k)) return t(nilai);   // sudah bentuk baru
  return PETA[k] || null;                  // null = tak dikenal, jangan disentuh
}

async function utama() {
  if (!TUJUAN_ID) throw new Error('Set env TUJUAN_ID dulu (ID spreadsheet tujuan).');
  const auth = new google.auth.GoogleAuth({ credentials: kredensial(), scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

  // --- kolom F sheet Main ---
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: TUJUAN_ID, range: `${SHEET_TASK}!F${BARIS_DATA}:F` });
  const kolom = r.data.values || [];
  const hitung = {}, takDikenal = {};
  const baris = kolom.map((row, i) => {
    const lama = t((row || [])[0]);
    const baru = petakan(lama);
    if (baru === null) { takDikenal[lama] = (takDikenal[lama] || 0) + 1; return [lama]; }
    if (baru !== lama) hitung[lama + ' -> ' + (baru || '(kosong)')] = (hitung[lama + ' -> ' + (baru || '(kosong)')] || 0) + 1;
    return [baru];
  });
  const berubah = baris.filter((b, i) => t(b[0]) !== t((kolom[i] || [])[0])).length;

  console.log('== KOLOM KESULITAN (' + SHEET_TASK + '!F) ==');
  console.log('  baris terbaca : ' + kolom.length);
  console.log('  akan berubah  : ' + berubah);
  Object.keys(hitung).sort().forEach(k => console.log('    ' + k.padEnd(24) + hitung[k] + ' task'));
  const sisaTak = Object.keys(takDikenal);
  if (sisaTak.length) {
    console.log('  TIDAK DIKENAL, dibiarkan apa adanya — periksa manual:');
    sisaTak.forEach(k => console.log('    ' + (k || '(kosong)').padEnd(24) + takDikenal[k] + ' task'));
  }

  // --- daftar pilihan di OPTIONS ---
  const o = await sheets.spreadsheets.values.get({ spreadsheetId: TUJUAN_ID, range: `${SHEET_OPTIONS}!A2:D` });
  const opsi = o.data.values || [];
  const barisPriority = [];
  opsi.forEach((row, i) => { if (t((row || [])[0]).toLowerCase() === 'priority') barisPriority.push(i); });
  console.log('\n== DAFTAR PILIHAN (' + SHEET_OPTIONS + ') ==');
  console.log('  baris priority sekarang : ' + barisPriority.length
    + (barisPriority.length ? '  -> ' + barisPriority.map(i => t(opsi[i][1])).join(', ') : ''));
  console.log('  akan jadi               : ' + BARU.join(', '));

  if (!APPLY) { console.log('\n== UJI COBA — tidak ada yang ditulis. Tambahkan --apply untuk menjalankan. =='); return; }

  if (berubah) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: TUJUAN_ID, range: `${SHEET_TASK}!F${BARIS_DATA}:F${kolom.length + BARIS_DATA - 1}`,
      valueInputOption: 'RAW', requestBody: { values: baris } });
  }
  /* Baris lama dinonaktifkan lewat kolom Active, bukan dihapus: menghapus baris menggeser
     nomor baris lain di sheet yang sama dan itu mengundang kekacauan sendiri. */
  const upd = barisPriority.map(i => ({
    range: `${SHEET_OPTIONS}!C${i + 2}`, values: [['FALSE']],
  }));
  if (upd.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: TUJUAN_ID, requestBody: { valueInputOption: 'RAW', data: upd } });
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId: TUJUAN_ID, range: `${SHEET_OPTIONS}!A:D`,
    valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: BARU.map(v => ['priority', v, 'TRUE', '']) } });

  console.log('\n== SELESAI DITULIS ==');
}

module.exports = { petakan, PETA, BARU };

if (require.main === module) {
  utama().catch(e => { console.error('GAGAL: ' + (e && e.message ? e.message : e)); process.exit(1); });
}
