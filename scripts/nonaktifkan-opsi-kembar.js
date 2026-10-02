/* =============================================================================
   nonaktifkan-opsi-kembar.js — menonaktifkan pilihan dropdown yang kembar.

   Sheet OPTIONS memuat nilai yang sama beberapa kali, sebagian hanya beda huruf
   besar-kecil. Akibatnya dropdown "Kata Kerja" menampilkan "Membuat" tiga kali.

   Yang dilakukan: menulis FALSE ke kolom C (Active) untuk kemunculan KEDUA dan
   seterusnya. Kemunculan pertama dibiarkan.

   Yang TIDAK dilakukan — dan ini disengaja:

   * Tidak menghapus baris. Menghapus menggeser nomor baris, sedangkan aplikasi
     mengalamati OPTIONS lewat nomor baris (reorderOptions, editOption,
     deleteOption). Satu penghapusan di sini bisa membuat penyuntingan berikutnya
     mengenai baris yang salah.
   * Tidak menyentuh kolom selain C.
   * Tidak menyentuh baris yang memang sudah tidak aktif.

   Karena menonaktifkan bersifat berbalik — tinggal tulis TRUE lagi — kesalahan
   di sini murah. Penghapusan tidak.

   Jalankan:
     node scripts/nonaktifkan-opsi-kembar.js              <- pratinjau saja
     node scripts/nonaktifkan-opsi-kembar.js --terapkan   <- betul-betul menulis

   Butuh:
     SPREADSHEET_ID, dan GOOGLE_SERVICE_ACCOUNT_JSON atau credentials.json.
     Service account-nya harus punya akses Editor.
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
require('./migrasi/env.js').muatAtauIngatkan();

const TERAPKAN = process.argv.includes('--terapkan');
const SHEET = 'OPTIONS';
const KOL_AKTIF = 'C';

function kredensial() {
  const dariEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (dariEnv) return JSON.parse(dariEnv);
  const p = path.join(__dirname, '..', 'credentials.json');
  if (!fs.existsSync(p)) throw new Error('Kredensial tak ada. Isi GOOGLE_SERVICE_ACCOUNT_JSON, atau taruh credentials.json di akar repo.');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const aktifnya = (v) => v === true || String(v == null ? '' : v).trim().toUpperCase() === 'TRUE';

async function main() {
  const sid = String(process.env.SPREADSHEET_ID || '').trim();
  if (!sid) throw new Error('Env SPREADSHEET_ID belum diset.');
  require('./migrasi/env.js').periksaBukanContoh(['SPREADSHEET_ID']);

  /* Scope penuh, bukan readonly: skrip ini memang menulis. */
  const auth = new google.auth.GoogleAuth({
    credentials: kredensial(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const api = google.sheets({ version: 'v4', auth: await auth.getClient() });

  const meta = await api.spreadsheets.get({ spreadsheetId: sid, fields: 'properties.title' });
  console.log('  spreadsheet: ' + ((meta.data.properties || {}).title || '(tanpa judul)'));
  console.log('  ' + (TERAPKAN ? 'MODE TULIS — perubahan akan disimpan' : 'pratinjau saja, belum ada yang ditulis') + '\n');

  /* Dibaca SEGAR dari sheet, bukan dari db/dump. Nomor baris di dump bisa sudah
     basi kalau ada yang menambah atau menghapus opsi sesudah tarikan terakhir —
     dan menulis ke nomor baris yang basi berarti menonaktifkan opsi yang salah. */
  const res = await api.spreadsheets.values.get({
    spreadsheetId: sid, range: SHEET + '!A2:E',
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const baris = res.data.values || [];

  const kelompok = new Map();
  baris.forEach((r, i) => {
    const tipe = String((r || [])[0] || '').trim();
    const nilai = String((r || [])[1] || '').trim();
    if (!tipe || !nilai) return;
    /* Kunci disamakan dengan cara MySQL membandingkan: huruf besar-kecil diabaikan.
       Itulah yang membuat "Membuat" dan "membuat" dianggap satu. */
    const kunci = tipe.toLowerCase() + '|' + nilai.toLowerCase();
    if (!kelompok.has(kunci)) kelompok.set(kunci, []);
    kelompok.get(kunci).push({ baris: i + 2, tipe, nilai, aktif: aktifnya((r || [])[2]) });
  });

  const matikan = [];
  for (const [, anggota] of kelompok) {
    if (anggota.length < 2) continue;
    console.log('  ' + anggota[0].tipe + ' :: ' + JSON.stringify(anggota[0].nilai));
    anggota.forEach((a, i) => {
      if (i === 0) { console.log('      baris ' + String(a.baris).padStart(4) + '  ' + JSON.stringify(a.nilai) + '   DIPERTAHANKAN'); return; }
      if (!a.aktif) { console.log('      baris ' + String(a.baris).padStart(4) + '  ' + JSON.stringify(a.nilai) + '   sudah nonaktif, dilewati'); return; }
      console.log('      baris ' + String(a.baris).padStart(4) + '  ' + JSON.stringify(a.nilai) + '   -> dinonaktifkan');
      matikan.push(a);
    });
  }

  if (!matikan.length) {
    console.log('\n  Tak ada yang perlu dinonaktifkan.\n');
    return;
  }

  console.log('\n  ' + matikan.length + ' baris akan dinonaktifkan.');
  if (!TERAPKAN) {
    console.log('  Ini baru pratinjau. Jalankan lagi dengan --terapkan kalau daftarnya sudah benar.\n');
    return;
  }

  await api.spreadsheets.values.batchUpdate({
    spreadsheetId: sid,
    requestBody: {
      valueInputOption: 'RAW',
      data: matikan.map(a => ({ range: SHEET + '!' + KOL_AKTIF + a.baris, values: [['FALSE']] })),
    },
  });

  /* Dibaca ulang untuk memastikan, bukan sekadar percaya pada tiadanya error. */
  const ulang = await api.spreadsheets.values.get({
    spreadsheetId: sid, range: SHEET + '!A2:E', valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const kini = ulang.data.values || [];
  const gagal = matikan.filter(a => aktifnya((kini[a.baris - 2] || [])[2]));

  console.log('\n  ' + (matikan.length - gagal.length) + ' dari ' + matikan.length + ' terkonfirmasi nonaktif.');
  if (gagal.length) console.log('  MASIH AKTIF: baris ' + gagal.map(a => a.baris).join(', '));
  console.log('\n  Untuk membatalkan: tulis TRUE lagi di kolom ' + KOL_AKTIF + ' baris '
    + matikan.map(a => a.baris).join(', ') + '\n');
}

main().catch(e => { console.error('\nGAGAL: ' + e.message); process.exit(1); });
