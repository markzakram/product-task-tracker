/* =============================================================================
   tulis.js — alat banding untuk FUNGSI TULIS.

     node scripts/banding/tulis.js --siapkan   samakan kedua sisi dari staging
     node scripts/banding/tulis.js             jalankan skenario, bandingkan

   Fungsi tulis tidak bisa dibandingkan seperti fungsi baca. Memanggil saveTask()
   di kedua backend berarti menulis dua kali ke dua tempat — itu bukan
   perbandingan, melainkan dua sumber kebenaran yang langsung menyimpang.

   Yang dibandingkan di sini dua hal:

     1. NILAI KEMBALIANNYA — {success, message, ...} yang dipakai layar.
     2. KEADAAN SESUDAHNYA — dibaca lewat fungsi baca yang SUDAH terbukti setara
        di jalan.js. Lapisan baca itulah penilainya; tanpa ia lebih dulu terbukti,
        alat ini tak membuktikan apa pun.

   Karena menulis, aturannya lebih ketat daripada jalan.js:

     * Hanya ke spreadsheet UJI, tak pernah ke produksi. Dipaksa lewat env
       terpisah, dan ditolak kalau ID-nya sama.
     * MySQL diisi dari spreadsheet uji yang sama, supaya kedua sisi berangkat
       dari isi yang identik. Beda yang muncul berarti beda perilaku, bukan beda
       data awal.
     * Tiap skenario merapikan jejaknya sendiri.
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { rapikan, beda, samarkan } = require('./daftar.js');
const { SKENARIO } = require('./skenario.js');
require('../migrasi/env.js').muatAtauIngatkan();

const SIAPKAN = process.argv.includes('--siapkan');
const AKAR = path.join(__dirname, '..', '..');

/* ---------------------------------------------------------------------------
   Penjaga. Satu-satunya hal yang betul-betul berbahaya di berkas ini adalah
   menulis ke spreadsheet yang salah, jadi penjaganya dipasang sebelum apa pun
   dimuat — bukan di tengah alur yang bisa terlewati.
   ------------------------------------------------------------------------ */
function sheetUji() {
  const uji = String(process.env.SPREADSHEET_ID_UJI || '').trim();
  const prod = String(process.env.SPREADSHEET_ID || '').trim();

  if (!uji) {
    throw new Error('Env SPREADSHEET_ID_UJI belum diset.'
      + '\n  Alat ini MENULIS, jadi ia menolak memakai SPREADSHEET_ID biasa.'
      + '\n  Isi dengan ID spreadsheet staging — lihat docs/STAGING.md.');
  }
  if (prod && uji === prod) {
    throw new Error('SPREADSHEET_ID_UJI sama dengan SPREADSHEET_ID.'
      + '\n  Alat ini akan membuat dan menghapus baris. Tidak dijalankan ke produksi.'
      + '\n  Pakai spreadsheet staging yang terpisah.');
  }
  return uji;
}

/* ---------------------------------------------------------------------------
   Menyamakan kedua sisi.
   ------------------------------------------------------------------------ */
function siapkan(uji) {
  console.log('  menyamakan kedua sisi dari spreadsheet uji\n');
  /* Dijalankan sebagai proses terpisah dengan SPREADSHEET_ID ditimpa, supaya
     skrip migrasinya dipakai persis seperti yang dijalankan orang — bukan versi
     khusus uji yang bisa berbeda perilakunya. */
  const env = Object.assign({}, process.env, { SPREADSHEET_ID: uji });
  for (const [berkas, args] of [['tarik.js', []], ['muat.js', ['--ulang']]]) {
    const r = spawnSync(process.execPath,
      [path.join(AKAR, 'scripts', 'migrasi', berkas)].concat(args),
      { env, encoding: 'utf8' });
    const ekor = String(r.stdout || '').trim().split('\n').slice(-2).join('\n  ');
    console.log('  ' + berkas + ':\n  ' + ekor + '\n');
    if (r.status !== 0) throw new Error(berkas + ' gagal:\n' + (r.stderr || r.stdout));
  }
  console.log('  Kedua sisi kini berisi hal yang sama. Jalankan tanpa --siapkan.\n');
}

/* ---------------------------------------------------------------------------
   Menjalankan satu skenario di satu backend.
   Tiap backend memakai pegangannya SENDIRI: nomor baris di Sheets, id di MySQL.
   Karena itu argumen tiap langkah disusun dari hasil langkah sebelumnya di
   backend yang sama — bukan disalin antar-backend.
   ------------------------------------------------------------------------ */
async function jalankanSkenario(be, spek) {
  const hasil = [];
  const ctx = {};
  for (const langkah of spek.langkah) {
    const fn = be[langkah.fn] || (be._internals && be._internals[langkah.fn]);
    if (typeof fn !== 'function') return { gagal: 'fungsi ' + langkah.fn + ' tak ada di backend ini' };
    const args = langkah.args(ctx);
    let r;
    try { r = await fn(...args); }
    catch (e) { return { gagal: langkah.fn + ' melempar: ' + e.message }; }
    if (langkah.simpan) langkah.simpan(ctx, r);
    hasil.push({ fn: langkah.fn, nilai: r });
  }
  /* Keadaan sesudahnya, dibaca lewat fungsi baca yang sudah terbukti setara. */
  const sesudah = {};
  for (const nama of spek.periksa) {
    const fn = be[nama] || (be._internals && be._internals[nama]);
    sesudah[nama] = await fn();
  }
  return { hasil, sesudah };
}

async function main() {
  const uji = sheetUji();
  if (SIAPKAN) return siapkan(uji);

  /* _sheets.js membaca SPREADSHEET_ID, jadi ditimpa di proses ini saja. */
  process.env.SPREADSHEET_ID = uji;
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const p = path.join(AKAR, 'credentials.json');
    if (fs.existsSync(p)) process.env.GOOGLE_SERVICE_ACCOUNT_JSON = fs.readFileSync(p, 'utf8');
  }
  const sheets = require('../../api/_sheets.js');
  const db = require('../../api/_db.js');

  console.log('  spreadsheet uji : ' + uji);
  console.log('  database        : ' + process.env.MYSQL_DATABASE);
  console.log('  ' + SKENARIO.length + ' skenario\n');

  let cocok = 0, salah = 0;
  const gagal = [];
  const sengaja = [];
  let diulang = 0;

  for (const spek of SKENARIO) {
    const a = await jalankanSkenario(sheets, spek);
    const b = await jalankanSkenario(db, spek);

    /* Dijalankan di kedua sisi, SELALU — termasuk saat skenarionya gagal di
       tengah. Jejak yang tertinggal mencemari jalan berikutnya, dan gagalnya
       akan muncul di skenario lain yang tak ada hubungannya. */
    if (spek.bersihkan) { try { await spek.bersihkan(sheets); } catch (e) {}
                          try { await spek.bersihkan(db); } catch (e) {} }

    /* Sheets membatasi jumlah permintaan per menit per pengguna. Tanpa jeda,
       sebagian baca gagal lalu DITELAN jadi daftar kosong oleh getAll* — dan
       daftar kosong tak bisa dibedakan dari beda yang sungguhan. */
    await new Promise((r) => setTimeout(r, Number(process.env.BANDING_JEDA_MS || 900)));

    if (a.gagal || b.gagal) {
      salah++; gagal.push({ nama: spek.nama, d: { jalur: '', pesan: a.gagal || b.gagal } });
      console.log('  X  ' + spek.nama.padEnd(34) + (a.gagal || b.gagal));
      continue;
    }

    /* Nilai kembalian dan keadaan sesudahnya dibandingkan dengan pembanding yang
       sama seperti fungsi baca — termasuk membuang nomor baris, yang memang
       berbeda bentuk di kedua sisi. */
    const kiri = rapikan(samarkan({ hasil: a.hasil, sesudah: a.sesudah }, spek.samarkan), null, false);
    const kanan = rapikan(samarkan({ hasil: b.hasil, sesudah: b.sesudah }, spek.samarkan), null, false);
    const d = beda(kiri, kanan, '');

    /* Sebagian beda memang DIHARAPKAN, dan menyembunyikannya sama buruknya
       dengan membiarkannya menggagalkan jalan. Jadi ia dilaporkan tersendiri,
       lengkap dengan alasannya — dan kalau ternyata TIDAK beda, itu justru yang
       dipersoalkan, karena berarti alasannya sudah tak berlaku dan catatan ini
       menyesatkan siapa pun yang membacanya nanti. */
    if (spek.bedaSengaja) {
      if (d) { sengaja.push({ nama: spek.nama, alasan: spek.bedaSengaja, d });
        console.log('  ~  ' + spek.nama.padEnd(34) + 'beda, memang disengaja'); }
      else { salah++; gagal.push({ nama: spek.nama,
        d: { jalur: '', pesan: 'ditandai bedaSengaja tapi ternyata SAMA — alasannya sudah tak berlaku' } });
        console.log('  X  ' + spek.nama.padEnd(34) + 'ditandai beda tapi ternyata sama'); }
      continue;
    }

    if (!d) { cocok++; console.log('  ok ' + spek.nama); continue; }

    /* Diulang SEKALI sebelum dinyatakan beda.

       Sheets membatasi permintaan per menit per pengguna, dan fungsi baca di
       _sheets.js menelan kegagalan baca menjadi DAFTAR KOSONG — lihat komentar
       di getAllNotes dan getChecklistSummary, yang memang disengaja supaya
       aplikasi tak gagal terbuka. Akibatnya di sini: kehabisan kuota menyamar
       jadi "panjang beda: 0 vs 9", yang terlihat persis seperti bug sungguhan.

       Mengulang sekali memisahkan keduanya. Yang beda karena kuota akan lulus di
       percobaan kedua; yang beda sungguhan tetap beda. Pengulangannya ditandai
       di laporan supaya tak ada yang menyangka jalannya mulus. */
    await new Promise((r) => setTimeout(r, 4000));
    const a2 = await jalankanSkenario(sheets, spek);
    const b2 = await jalankanSkenario(db, spek);
    if (spek.bersihkan) { try { await spek.bersihkan(sheets); } catch (e) {}
                          try { await spek.bersihkan(db); } catch (e) {} }
    const d2 = (a2.gagal || b2.gagal) ? { jalur: '', pesan: a2.gagal || b2.gagal }
      : beda(rapikan(samarkan({ hasil: a2.hasil, sesudah: a2.sesudah }, spek.samarkan), null, false),
             rapikan(samarkan({ hasil: b2.hasil, sesudah: b2.sesudah }, spek.samarkan), null, false), '');

    if (!d2) { cocok++; diulang++; console.log('  ok ' + spek.nama + '   (lulus setelah diulang)'); }
    else { salah++; gagal.push({ nama: spek.nama, d: d2 }); console.log('  X  ' + spek.nama.padEnd(34) + d2.pesan); }
  }

  if (gagal.length) {
    console.log('\n  --- beda pertama tiap skenario ---');
    for (const g of gagal) {
      console.log('\n  ' + g.nama);
      console.log('    jalur  : ' + (g.d.jalur || '(akar)'));
      console.log('    masalah: ' + g.d.pesan);
      if ('a' in g.d) {
        console.log('    sheets : ' + JSON.stringify(g.d.a).slice(0, 110));
        console.log('    mysql  : ' + JSON.stringify(g.d.b).slice(0, 110));
      }
    }
  }

  if (sengaja.length) {
    console.log('\n  --- beda yang disengaja ---');
    for (const g of sengaja) {
      console.log('\n  ' + g.nama);
      console.log('    alasan : ' + g.alasan);
      console.log('    beda   : ' + g.d.jalur + ' — ' + g.d.pesan);
    }
  }

  if (db._db && typeof db._db.tutup === 'function') await db._db.tutup();
  console.log('\n  ' + cocok + ' cocok, ' + salah + ' beda'
    + (sengaja.length ? ', ' + sengaja.length + ' beda disengaja' : '')
    + (diulang ? '  (' + diulang + ' lulus setelah diulang)' : ''));
  if (salah) process.exit(1);
}

main().catch((e) => { console.error('\nGAGAL: ' + e.message); process.exit(1); });
