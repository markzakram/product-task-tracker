/*
 * Uji untuk scripts/ — pengurai sel Master dan penyusun baris impor.
 *
 * Skrip impor menulis LANGSUNG ke spreadsheet produksi, jadi bagian yang menentukan isinya
 * harus bisa diuji tanpa menyentuh jaringan sama sekali. susun() sengaja dipisah dari
 * pemanggilan Google supaya bisa dipanggil di sini apa adanya.
 */
const assert = require('assert');
const { uraiSel } = require('../scripts/urai-master.js');
const { susun, PETA, BARIS_AWAL } = require('../scripts/impor-rancangan-produksi.js');
const { petakan } = require('../scripts/migrasi-kesulitan.js');

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log('  ✓ ' + name); passed++; }
function eq(name, a, b) {
  assert.strictEqual(a, b, name + ' — dapat ' + JSON.stringify(a) + ', harusnya ' + JSON.stringify(b));
  console.log('  ✓ ' + name); passed++;
}

console.log('\n=== 1. Pengurai sel Area Produk ===');

const latsol = [
  'PCPM BI 41',
  'Tahap 1',
  ' • Latsol Verbal PCPM BI 41 – 10 Paket',
  ' • Latsol Numeric PCPM BI 41 – 10 Paket + 10 Paket COMING SOON',
  ' Total: 20 Paket',
].join('\n');
const uL = uraiSel(latsol, 'Latsol');
eq('judul sel tidak jadi target', uL.target.length, 2);
eq('grupnya terbaca', uL.target[0].grup, 'Tahap 1');
eq('nama item bersih dari angka', uL.target[0].nama, 'Latsol Verbal PCPM BI 41');
eq('jumlahnya terbaca', uL.target[0].target, 10);
// "10 Paket + 10 Paket COMING SOON" = target 20, yang 10 sudah ada, 10 belum.
eq('COMING SOON menambah TARGET', uL.target[1].target, 20);
eq('yang sudah tersedia tetap 10', uL.target[1].awal, 10);
ok('baris Total: dilewati', !uL.target.some(x => /^total/i.test(x.nama)));

/* Bentuk yang dulu meloloskan ratusan Paket palsu: ringkasan yang katanya bukan "Total:"
   melainkan "Total TWK:", "Total Keseluruhan:". Semua yang diawali "Total" harus dilewati. */
const asn = [
  'TWK 2026',
  'Latsol TWK - Nasionalisme 2026 – 10 Paket',
  'Latsol TWK - Integritas 2026 – 10 Paket',
  '',
  'Total TWK: 50 Paket',
  'Total Keseluruhan: 210 Paket',
].join('\n');
const uA = uraiSel(asn, 'Latsol');
eq('hanya item asli yang tercatat', uA.target.length, 2);
ok('"Total TWK" tidak jadi target', !uA.target.some(x => /total/i.test(x.nama)));
ok('"Total Keseluruhan" tidak jadi target', !uA.target.some(x => /keseluruhan/i.test(x.nama)));
eq('jumlahnya tidak ikut membengkak', uA.target.reduce((a, x) => a + x.target, 0), 20);

// Item tanpa angka tetap dicatat — kalau dibuang, kolom Dibimbing hilang sama sekali.
const dib = ['PCPM BI 41', 'Tahap 1', 'PCPM BI 41 Tahap 1', '', 'Tahap 2 DONE', 'PCPM BI 41 Tahap 2'].join('\n');
const uD = uraiSel(dib, 'Dibimbing');
eq('item tanpa angka tetap dicatat', uD.target.length, 2);
eq('dianggap 1 satuan', uD.target[0].target, 1);
eq('grup tahap 2 terbaca tanpa kata DONE', uD.target[1].grup, 'Tahap 2');

// Blok BONUS jadi teks bebas, bukan target.
const bonus = ['Judul', ' • Barang A – 5 Paket', '', 'BONUS – ANGKATAN LAMA', '• Barang lama – 9 Paket'].join('\n');
const uB = uraiSel(bonus, 'Latsol');
eq('setelah BONUS tidak jadi target', uB.target.length, 1);
ok('isi BONUS disimpan sebagai teks', uB.bonus.indexOf('BONUS') >= 0 && uB.bonus.indexOf('Barang lama') >= 0);

console.log('\n=== 2. Penyusun baris impor ===');

// Baris tiruan berbentuk sama dengan sheet Master: indeks 0 = APK, 12..17 = Area Produk.
function barisPalsu(apk, isi) {
  const r = new Array(21).fill('');
  r[0] = apk;
  Object.keys(isi).forEach(k => { r[k] = isi[k]; });
  return r;
}
const master = [
  barisPalsu('JadiPCPM', { 12: 'PCPM BI 41\nTahap 1\nPCPM BI 41 Tahap 1', 13: 'PCPM BI 41\n • Latsol Verbal – 10 Paket', 17: 'Live Class tersedia Senin-Jumat\nSenin: 2 sesi' }),
  barisPalsu('JadiASN', { 13: 'TWK 2026\nLatsol TWK - Nasionalisme – 10 Paket\nTotal TWK: 50 Paket', 16: '4 Mode Drilling\nPengguna bebas memilih subtest.' }),
  barisPalsu('JadiSEKDIN', { 13: 'TWK 2026\nLatsol TWK - Integritas – 10 Paket' }),
];

const hasil = susun(master, { paket: [], maksPkg: 0, maksItm: 0 });
eq('tiga paket disusun', hasil.rowPkg.length, 3);
eq('tiap baris paket 20 kolom', hasil.rowPkg[0].length, 20);
eq('nomor paket mulai dari PKG-001', hasil.rowPkg[0][0], 'PKG-001');
eq('platform ikut', hasil.rowPkg[0][1], 'JadiPCPM');
eq('nama paket dari PETA', hasil.rowPkg[0][4], PETA[BARIS_AWAL].nama);
eq('kolom Mirror dibiarkan KOSONG', hasil.rowPkg[0][19], '');
ok('pembuatnya dicatat', !!hasil.rowPkg[0][17]);

// Live Class & Drilling bukan kolom target -> isinya jadi teks bebas, tak hilang.
eq('Live Class jadi teks bebas, bukan target', hasil.rowItem.filter(r => r[3] === 'Live Class').length, 0);
ok('isi Live Class tetap tersimpan', String(hasil.rowPkg[0][15]).indexOf('Senin') >= 0);
eq('Drilling jadi teks bebas, bukan target', hasil.rowItem.filter(r => r[3] === 'Drilling').length, 0);
ok('isi Drilling tetap tersimpan', String(hasil.rowPkg[1][14]).indexOf('Mode Drilling') >= 0);

// Ringkasan tidak boleh menyelinap lewat jalur susun().
ok('tak ada target bernama Total', !hasil.rowItem.some(r => /^total/i.test(String(r[5]))));
eq('nomor item berurutan tanpa lompat', hasil.rowItem[0][0], 'ITM-0001');
ok('tiap item menempel ke paketnya', hasil.rowItem.every(r => /^PKG-\d{3}$/.test(r[1])));

// Nomor lanjut dari yang sudah ada — jangan pernah dipakai ulang.
const lanjut = susun(master, { paket: [], maksPkg: 41, maksItm: 671 });
eq('nomor paket lanjut dari yang ada', lanjut.rowPkg[0][0], 'PKG-042');
eq('nomor item lanjut dari yang ada', lanjut.rowItem[0][0], 'ITM-0672');

// Nama yang sudah ada DILEWATI, bukan ditimpa dan bukan digandakan.
const ulang = susun(master, { paket: [PETA[BARIS_AWAL].nama], maksPkg: 41, maksItm: 671 });
eq('paket yang sudah ada dilewati', ulang.rowPkg.length, 2);
eq('dan dilaporkan', ulang.dilewati.length, 1);
ok('yang lain tetap dibuat', ulang.rowPkg.every(r => r[4] !== PETA[BARIS_AWAL].nama));
// Menjalankan dua kali berturut-turut atas tujuan yang sudah terisi = tidak menulis apa pun.
const nihil = susun(master, { paket: hasil.rowPkg.map(r => r[4]), maksPkg: 3, maksItm: 10 });
eq('jalan ulang penuh tak membuat apa pun', nihil.rowPkg.length, 0);
eq('dan tak ada target menggantung', nihil.rowItem.length, 0);


console.log('\n=== 3. Migrasi Prioritas -> Tingkat Kesulitan ===');

/* Empat tingkat urgensi menyusut jadi tiga tingkat kesulitan. Urgent + High digabung.
   Yang tak dikenal DIBIARKAN (null), bukan dipaksa jadi Normal — menebak diam-diam atas
   nilai yang tak terduga justru menghapus informasi tanpa ada yang sadar. */
eq('Urgent jadi Sulit', petakan('Urgent'), 'Sulit');
eq('High juga jadi Sulit', petakan('High'), 'Sulit');
eq('Normal tetap Normal', petakan('Normal'), 'Normal');
eq('Medium ikut jadi Normal', petakan('Medium'), 'Normal');
eq('Low jadi Mudah', petakan('Low'), 'Mudah');
eq('huruf besar-kecil tak jadi soal', petakan('uRgEnT'), 'Sulit');
eq('spasi di ujung dibuang', petakan('  Low  '), 'Mudah');
eq('kosong tetap kosong', petakan(''), '');
// Jalan kedua kali tak mengubah apa-apa — migrasi boleh diulang tanpa merusak.
eq('yang sudah Sulit dibiarkan', petakan('Sulit'), 'Sulit');
eq('yang sudah Mudah dibiarkan', petakan('Mudah'), 'Mudah');
eq('nilai asing TIDAK ditebak', petakan('Penting Sekali'), null);

console.log(`\n✅ Semua ${passed} assertion lulus.`);
