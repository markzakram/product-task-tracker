/* Impor rancangan paket dari sheet "Master Koordinasi Paket" ke spreadsheet tujuan.
   Menulis model sekarang: paket sebagai entitas sendiri (PKG-xxx, 20 kolom) + PACKAGE_ITEMS.
   TIDAK membuat task kolaborasi apa pun — papan Kolaborasi tak tersentuh.

   Pemakaian (uji coba dulu, tidak menulis apa pun):

     TUJUAN_ID=<id-spreadsheet> node scripts/impor-rancangan-produksi.js

   Kalau angkanya sudah cocok, ulangi dengan --apply:

     TUJUAN_ID=<id-spreadsheet> node scripts/impor-rancangan-produksi.js --apply

   Kredensial diambil dari env GOOGLE_SERVICE_ACCOUNT_JSON, atau kalau kosong dari berkas
   credentials.json di akar repo. Service account-nya harus punya akses Editor ke
   spreadsheet tujuan DAN akses baca ke sheet Master.

   PRASYARAT: buka menu Rancangan Paket sekali di aplikasi tujuan lebih dulu, supaya
   keempat sheet paket dibuat aplikasi dengan header yang benar. Skrip ini berhenti dengan
   pesan jelas kalau sheet-nya belum ada — ia sengaja tidak membuat sheet sendiri, biar
   header dan status tersembunyinya selalu berasal dari satu tempat. */
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { uraiSel } = require('./urai-master.js');

const MASTER_ID = '1Hyjz2AsvOwJZXYdL7veeGRhqlQpliJ96C7IczVbOlzs';
const MASTER_TAB = 'Master Koordinasi Paket';
const TUJUAN_ID = process.env.TUJUAN_ID;
const APPLY = process.argv.includes('--apply');
const AKTOR = process.env.AKTOR || 'Nynda (PM)';

// Kolom Area Produk di sheet Master (0-indexed dari A) -> kategori di aplikasi.
const KOLOM = [[12, 'Dibimbing'], [13, 'Latsol'], [14, 'Materi'], [15, 'Tryout'], [16, 'Drilling'], [17, 'Live Class']];
// Kolom teks bebas per kategori di sheet PACKAGES (0-indexed).
const KOL_TEKS = { Dibimbing: 10, Latsol: 11, Materi: 12, Tryout: 13, Drilling: 14, 'Live Class': 15 };

/* Baris mana di sheet Master yang diimpor, dan kolom mana yang jadi TARGET.
   Ditentukan MANUAL, bukan ditebak — isinya campur dan menebaknya pernah menghasilkan
   62 target sampah:
     - Drilling di ASN/Sekdin isinya penjelasan fitur ("Pengguna bebas memilih subtest…"),
     - Materi di ASN isinya kisi-kisi dan judul bab,
     - Live Class isinya jadwal mingguan.
   Semuanya tetap tersimpan sebagai TEKS BEBAS di paketnya, cuma tidak jadi centangan. */
const PETA = {
  60: { nama: 'PCPM BI 41', target: ['Dibimbing', 'Latsol', 'Materi', 'Tryout'] },
  61: { nama: 'Road to CPNS 2026', target: ['Latsol', 'Tryout'] },
  62: { nama: 'Menuju Sekolah Kedinasan', target: ['Latsol', 'Tryout'] },
};
const BARIS_AWAL = 60, BARIS_AKHIR = 62;

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

// Dipakai uji: menyusun baris tanpa menyentuh jaringan sama sekali.
function susun(barisMaster, sudahAda) {
  const namaAda = new Set((sudahAda.paket || []).map(n => t(n).toLowerCase()).filter(Boolean));
  let maksPkg = sudahAda.maksPkg || 0, maksItm = sudahAda.maksItm || 0;
  const rowPkg = [], rowItem = [], dilewati = [];

  barisMaster.forEach((x, i) => {
    const nomorBaris = BARIS_AWAL + i;
    const peta = PETA[nomorBaris];
    if (!peta) return;
    if (namaAda.has(peta.nama.toLowerCase())) { dilewati.push(peta.nama); return; }

    const pid = 'PKG-' + ('00' + (++maksPkg)).slice(-3);
    const kolom = new Array(20).fill('');
    kolom[0] = pid;
    kolom[1] = t(x[0]);            // Platform (APK)
    kolom[4] = peta.nama;          // Nama Paket
    kolom[17] = AKTOR;
    kolom[18] = new Date().toISOString().slice(0, 19).replace('T', ' ');
    // kolom[19] (Mirror) sengaja kosong: tidak otomatis tampil ke Lintas Divisi.

    let urut = 0;
    KOLOM.forEach(([j, kat]) => {
      const isi = t(x[j]);
      if (!isi || isi === '-') return;
      if (peta.target.indexOf(kat) < 0) { kolom[KOL_TEKS[kat]] = isi; return; }
      const u = uraiSel(isi, kat);
      u.target.forEach(it => {
        rowItem.push(['ITM-' + ('000' + (++maksItm)).slice(-4), pid, ++urut,
          it.kategori, it.grup, it.nama, it.target, it.satuan, it.awal, '']);
      });
      if (t(u.bonus)) kolom[KOL_TEKS[kat]] = t(u.bonus);
    });
    rowPkg.push(kolom);
  });
  return { rowPkg, rowItem, dilewati };
}

async function utama() {
  if (!TUJUAN_ID) throw new Error('Set env TUJUAN_ID dulu (ID spreadsheet tujuan).');
  const auth = new google.auth.GoogleAuth({ credentials: kredensial(), scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

  const m = await sheets.spreadsheets.values.get({
    spreadsheetId: MASTER_ID,
    range: `${MASTER_TAB}!A${BARIS_AWAL}:U${BARIS_AKHIR}`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const barisMaster = m.data.values || [];
  const perlu = BARIS_AKHIR - BARIS_AWAL + 1;
  if (barisMaster.length !== perlu) {
    throw new Error(`Baris ${BARIS_AWAL}-${BARIS_AKHIR} tak terbaca lengkap (dapat ${barisMaster.length}, perlu ${perlu}). Sheet Master mungkin bergeser — periksa dulu.`);
  }

  const bacaAman = async (range) => {
    try { const r = await sheets.spreadsheets.values.get({ spreadsheetId: TUJUAN_ID, range }); return r.data.values || []; }
    catch (e) { return null; }
  };
  const pRows = await bacaAman('PACKAGES!A2:T');
  const iRows = await bacaAman('PACKAGE_ITEMS!A2:J');
  console.log('== KEADAAN TUJUAN ==');
  const hitung = (rows, satuan) => rows === null ? 'BELUM ADA' : (rows.filter(r => t(r[0])).length + ' ' + satuan);
  console.log('  PACKAGES      : ' + hitung(pRows, 'paket'));
  console.log('  PACKAGE_ITEMS : ' + hitung(iRows, 'target'));
  if (pRows === null || iRows === null) {
    throw new Error('Sheet paket belum ada di tujuan. Buka menu Rancangan Paket sekali di aplikasinya supaya sheet-nya dibuat, lalu jalankan lagi.');
  }

  let maksPkg = 0, maksItm = 0;
  pRows.forEach(r => { const mm = /^PKG-(\d+)$/.exec(t(r[0])); if (mm) maksPkg = Math.max(maksPkg, Number(mm[1])); });
  iRows.forEach(r => { const mm = /^ITM-(\d+)$/.exec(t(r[0])); if (mm) maksItm = Math.max(maksItm, Number(mm[1])); });

  const { rowPkg, rowItem, dilewati } = susun(barisMaster, {
    paket: pRows.map(r => r[4]), maksPkg, maksItm,
  });

  console.log('\n== YANG AKAN DITULIS ==');
  rowPkg.forEach(r => {
    const n = rowItem.filter(x => x[1] === r[0]).length;
    console.log('  + ' + r[0] + ' | ' + String(r[1]).padEnd(11) + ' | ' + String(r[4]).padEnd(26) + ' | ' + n + ' target');
  });
  dilewati.forEach(n => console.log('  ~ dilewati, nama sudah ada di tujuan: ' + n));
  console.log('  PACKAGES      : ' + rowPkg.length + ' baris');
  console.log('  PACKAGE_ITEMS : ' + rowItem.length + ' baris');
  const perKat = {};
  rowItem.forEach(r => { perKat[r[3]] = (perKat[r[3]] || 0) + 1; });
  console.log('  per kategori  : ' + (Object.keys(perKat).map(k => k + ' ' + perKat[k]).join(', ') || '-'));

  if (!APPLY) { console.log('\n== UJI COBA — tidak ada yang ditulis. Tambahkan --apply untuk menjalankan. =='); return; }
  if (!rowPkg.length) { console.log('\nTak ada yang perlu ditulis.'); return; }

  await sheets.spreadsheets.values.append({
    spreadsheetId: TUJUAN_ID, range: 'PACKAGES!A:T',
    valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: rowPkg } });
  await sheets.spreadsheets.values.append({
    spreadsheetId: TUJUAN_ID, range: 'PACKAGE_ITEMS!A:J',
    valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: rowItem } });
  console.log('\n== SELESAI DITULIS ==');
}

module.exports = { susun, PETA, KOLOM, KOL_TEKS, BARIS_AWAL, BARIS_AKHIR };

if (require.main === module) {
  utama().catch(e => { console.error('GAGAL: ' + (e && e.message ? e.message : e)); process.exit(1); });
}
