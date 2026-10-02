/**
 * ============================================================
 *  api/_backend.js — SATU tempat yang memutuskan sumber data.
 *
 *  Dipakai api/rpc.js dan api/metrics.js. Keduanya harus menunjuk
 *  sumber yang SAMA; kalau tidak, aplikasi menulis ke MySQL
 *  sementara endpoint metrics terus membaca spreadsheet yang
 *  sudah tak diperbarui — lalu menyajikan angka basi ke sistem
 *  OKR tanpa satu pun tanda bahwa ada yang salah.
 *
 *  Angka yang salah diam-diam jauh lebih buruk daripada endpoint
 *  yang mati, karena tak ada yang memeriksanya ulang.
 *
 *    DATA_SOURCE tak diset, atau 'sheets'  -> Google Spreadsheet
 *    DATA_SOURCE = 'mysql'                 -> MySQL
 *
 *  Bawaannya SENGAJA 'sheets'. Env yang hilang, salah ketik, atau
 *  belum sempat diset di lingkungan baru jatuh ke perilaku lama —
 *  bukan ke backend yang kredensialnya belum tentu ada. Pindah ke
 *  MySQL harus merupakan pilihan yang diketik orang.
 *
 *  Membalikkannya juga satu env, tanpa deploy ulang kode.
 * ============================================================
 */

const SUMBER = String(process.env.DATA_SOURCE || 'sheets').trim().toLowerCase();

if (['sheets', 'mysql'].indexOf(SUMBER) < 0) {
  /* Nilai yang tak dikenal TIDAK dibiarkan jatuh ke bawaan: "mysq1" yang salah
     ketik akan diam-diam menjalankan Sheets, dan orang mengira sudah pindah. */
  throw new Error('DATA_SOURCE hanya boleh "sheets" atau "mysql", bukan "' + SUMBER + '".');
}

const backend = SUMBER === 'mysql' ? require('./_db.js') : require('./_sheets.js');

module.exports = { backend, SUMBER };
