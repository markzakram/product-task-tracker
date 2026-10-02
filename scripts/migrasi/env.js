/* =============================================================================
   env.js — memuat berkas .env di akar repo ke process.env.

   `vercel dev` memuat .env sendiri, tapi `node scripts/...` tidak. Tanpa ini,
   satu-satunya cara memberi nilai ke skrip migrasi adalah mengetiknya di
   terminal — dan di Windows, PowerShell menyimpan setiap baris yang diketik ke

       %APPDATA%\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt

   sebagai teks biasa, selamanya. Kata sandi database yang diketik sekali di sana
   akan tetap ada berbulan-bulan kemudian, di berkas yang tak pernah dilihat
   siapa pun lagi. Berkas .env setidaknya sudah diabaikan git dan diketahui
   keberadaannya.

   Sengaja tanpa paket pihak ketiga: menambah dependensi untuk 20 baris yang
   bisa ditulis sendiri berarti menambah sesuatu yang harus dipercaya.
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const BERKAS = path.join(__dirname, '..', '..', '.env');

/* `berkas` bisa ditentukan supaya ujinya punya berkas sendiri. Uji yang memakai
   .env sungguhan akan berbeda hasilnya di tiap mesin — dan lebih buruk lagi,
   bisa menimpanya. */
function muat(berkas) {
  const BK = berkas || BERKAS;
  if (!fs.existsSync(BK)) return false;

  for (const baris of fs.readFileSync(BK, 'utf8').split(/\r?\n/)) {
    const t = baris.trim();
    if (!t || t.startsWith('#')) continue;

    const pisah = t.indexOf('=');
    if (pisah < 0) continue;

    const nama = t.slice(0, pisah).trim();
    let nilai = t.slice(pisah + 1).trim();

    /* Kutip pembungkus dibuang, tapi isi di dalamnya dibiarkan apa adanya —
       termasuk \n di GOOGLE_SERVICE_ACCOUNT_JSON, yang memang harus tetap
       berupa dua karakter supaya JSON.parse yang mengubahnya jadi baris baru. */
    const q = nilai[0];
    if ((q === '"' || q === "'") && nilai.length > 1 && nilai[nilai.length - 1] === q) {
      nilai = nilai.slice(1, -1);
    }

    /* Yang sudah diset di shell MENANG. Supaya sekali-sekali bisa menimpa satu
       nilai untuk satu jalan tanpa menyunting berkasnya. */
    if (process.env[nama] === undefined) process.env[nama] = nilai;
  }
  return true;
}

/* Memberi tahu kalau .env tak ada, supaya pesan errornya tidak cuma
   "Env X belum diset" tanpa petunjuk harus mengisinya di mana. */
function muatAtauIngatkan() {
  if (muat()) return;
  console.log('  (berkas .env tak ada di akar repo — nilai diambil dari environment shell)');
  console.log('  Kalau belum menyiapkannya: salin .env.example jadi .env, lalu isi.\n');
}

/* ---------------------------------------------------------------------------
   Penjaga nilai contoh.

   .env dibuat dengan menyalin .env.example, jadi baris yang terlewat diisi tetap
   memegang nilai contohnya — dan nilai contoh itu BERBENTUK SAH. SPREADSHEET_ID
   contoh tetap 41 karakter yang lolos semua pemeriksaan bentuk, lalu gagal di
   Google sebagai "Requested entity was not found" yang tak menyebut sebabnya.

   Membandingkan dengan .env.example menangkap seluruh kelas kesalahan ini sekali
   jalan, termasuk baris yang belum terpikirkan hari ini. Yang dibandingkan hanya
   nama yang diminta pemanggil — nilai seperti TIMEZONE_OFFSET_MINUTES=420 memang
   SEHARUSNYA tetap sama dengan contohnya.
   ------------------------------------------------------------------------ */
const CONTOH = path.join(__dirname, '..', '..', '.env.example');

function nilaiContoh(nama) {
  if (!fs.existsSync(CONTOH)) return null;
  const baris = fs.readFileSync(CONTOH, 'utf8').split(/\r?\n/)
    .find(l => l.startsWith(nama + '='));
  if (!baris) return null;
  const v = baris.slice(nama.length + 1).trim();
  return v || null;                      // contoh kosong tak perlu dijaga
}

function periksaBukanContoh(daftar) {
  const belum = daftar.filter(n => {
    const c = nilaiContoh(n);
    return c !== null && process.env[n] === c;
  });
  if (!belum.length) return;
  throw new Error(
    'Masih memakai nilai contoh dari .env.example: ' + belum.join(', ')
    + '\n  Buka .env dan ganti dengan nilai sungguhan.'
    + '\n  Nilai contoh berbentuk sah, jadi ia lolos sampai jauh lalu gagal dengan pesan'
    + '\n  yang tak menyebut sebabnya — karena itu dihentikan di sini.');
}

module.exports = { muat, muatAtauIngatkan, periksaBukanContoh, nilaiContoh, BERKAS, CONTOH };
