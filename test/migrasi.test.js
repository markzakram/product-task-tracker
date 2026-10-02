/*
 * Uji untuk scripts/migrasi/ — pengubah tipe dan kecocokan bentuk dengan DDL.
 *
 * Migrasi hanya dijalankan sekali, dan kalau salah, salahnya baru ketahuan
 * berbulan-bulan kemudian lewat tanggal yang meleset atau kolom yang kosong.
 * Jadi bagian yang menentukan isinya diuji di sini, tanpa menyentuh jaringan
 * maupun database.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { TABEL, T, petikBaris, barisKosong, serialWaras } = require('../scripts/migrasi/bentuk.js');

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log('  ✓ ' + name); passed++; }
function eq(name, a, b) {
  assert.strictEqual(a, b, name + ' — dapat ' + JSON.stringify(a) + ', harusnya ' + JSON.stringify(b));
  console.log('  ✓ ' + name); passed++;
}

const buang = [];
const catat = (m) => buang.push(m);

console.log('\n=== 1. Serial Sheets -> tanggal ===');
{
  /* Dicocokkan dengan hitungan yang BEBAS dari kode aplikasi: serial 0 di Sheets
     adalah 1899-12-30. Kalau konstanta 25569 di _sheets.js suatu saat tergeser,
     uji ini yang akan menangkapnya — bukan pengguna yang melihat tanggalnya aneh. */
  const acuan = (s) => new Date(Date.UTC(1899, 11, 30) + Math.round(s * 86400000)).toISOString().slice(0, 10);
  [25569, 40000, 45000, 46241].forEach(s => {
    eq('serial ' + s, T.tgl(s, catat, 'x'), acuan(s));
  });
  eq('serial 25569 adalah epoch Unix', T.tgl(25569, catat, 'x'), '1970-01-01');
}

console.log('\n=== 2. Stempel waktu yang titik desimalnya hilang ===');
{
  /* Kerusakan nyata di staging: SELURUH kolom "Done At" kolaborasi, 145 dari 145
     baris, tersimpan sebagai bilangan bulat tanpa titik desimal. Tanpa perbaikan
     ini, migrasi akan mengosongkan semuanya tanpa satu pun pesan — dan hitungan
     kolaborasi selesai akan jadi nol selamanya. */
  const utuh = 46225.5674884259;
  const rusak = 4622556748842590;
  eq('serialWaras mengembalikan titiknya', serialWaras(rusak), utuh);
  eq('serial rusak -> stempel yang sama dengan yang utuh',
    T.stempel(rusak, catat, 'done_at'), T.stempel(utuh, catat, 'done_at'));
  ok('hasilnya stempel MySQL yang sah', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(T.stempel(rusak, catat, 'x')));
  /* Serial yang masih wajar tak boleh ikut "diperbaiki". */
  eq('serial wajar dibiarkan', serialWaras(46241.5), 46241.5);
}

console.log('\n=== 3. Kosong jadi NULL, bukan string kosong ===');
{
  /* MySQL mode ketat menolak '' untuk kolom DATE. Kalau ini meleset, seluruh
     tabel yang punya kolom tanggal akan gagal dimuat di baris pertama. */
  eq('tanggal kosong', T.tgl('', catat, 'x'), null);
  eq('tanggal null', T.tgl(null, catat, 'x'), null);
  eq('stempel kosong', T.stempel('', catat, 'x'), null);
  eq('stempel undefined', T.stempel(undefined, catat, 'x'), null);
}

console.log('\n=== 4. Boolean dan angka ===');
{
  /* Sheets menulis 'TRUE'/'FALSE', tapi `mirror` ditulis 'TRUE' atau KOSONG —
     bukan 'FALSE'. Keduanya harus jadi 0. */
  eq("'TRUE' -> 1", T.bool('TRUE'), 1);
  eq("'true' -> 1", T.bool('true'), 1);
  eq('true -> 1', T.bool(true), 1);
  eq("'FALSE' -> 0", T.bool('FALSE'), 0);
  eq("kosong -> 0", T.bool(''), 0);
  eq('null -> 0', T.bool(null), 0);
  eq('angka kosong -> 0', T.angka(''), 0);
  eq('angka teks -> angka', T.angka('7'), 7);
  eq('angka sampah -> 0', T.angka('abc'), 0);
}

console.log('\n=== 5. Sel aneh dicatat, barisnya tidak dibuang ===');
{
  /* Prinsipnya: satu sel rusak tak boleh menggugurkan seluruh barisnya. Yang
     rusak dikosongkan dan DICATAT dengan nomor barisnya, supaya bisa dibuka
     langsung di spreadsheet. Kehilangan satu tanggal bisa diperbaiki; kehilangan
     seluruh task-nya tidak. */
  const keluhan = [];
  eq('tanggal sampah jadi null', T.tgl('besok', (m) => keluhan.push(m), 'due_date'), null);
  eq('satu keluhan tercatat', keluhan.length, 1);
  ok('keluhannya menyebut kolomnya', keluhan[0].indexOf('due_date') >= 0);
  ok('keluhannya menyebut isi aslinya', keluhan[0].indexOf('besok') >= 0);
}

console.log('\n=== 6. petikBaris dan baris kosong ===');
{
  const spek = TABEL.find(t => t.tabel === 'users');
  const keluhan = [];
  const o = petikBaris(spek, ['Ali', '', 'TRUE'], 7, keluhan);
  eq('nama terbaca', o.nama, 'Ali');

  /* Migrasi menyimpan APA ADANYA, tanpa nilai bawaan. _sheets.js menerapkan
     bawaannya saat MEMBACA (`|| ROLE_DEFAULT`, `|| 'Paket'`, `|| 'aktif'`), dan
     api/_db.js menirukan itu persis. Menuliskannya ke database tidak menambah
     apa pun, tapi membuat isi database berbeda dari isi sheet — dan perbedaan
     itu akan membingungkan siapa pun yang membandingkan keduanya nanti.

     Satu nilai bawaan dulu bahkan dikarang: kolom `folder` diisi 'Umum' padahal
     v1 tak pernah memberinya bawaan di mana pun. Alat banding yang menangkapnya. */
  eq('peran kosong tetap kosong, bawaan bukan urusan migrasi', o.peran, '');
  eq('aktif jadi 1', o.aktif, 1);
  eq('nomor baris ikut dibawa', o.__baris, 7);

  /* Kolom Active yang KOSONG di USERS berarti aktif — kebalikan dari OPTIONS. */
  eq('Active kosong di USERS berarti aktif', petikBaris(spek, ['Budi', '', ''], 8, keluhan).aktif, 1);
  eq('Active "false" berarti tidak aktif', petikBaris(spek, ['Budi', '', 'false'], 9, keluhan).aktif, 0);
  const specOpsi = TABEL.find(t => t.tabel === 'options');
  eq('Active kosong di OPTIONS berarti TIDAK aktif',
    petikBaris(specOpsi, ['verb', 'Membuat', '', '', 0], 5, keluhan).aktif, 0);

  ok('tak ada lagi nilai bawaan tersisa di spek migrasi',
    TABEL.every(t => t.kolom.every(k => k.length === 2)));

  ok('baris kosong dikenali', barisKosong(['', '', '']));
  ok('baris null dikenali', barisKosong(null));
  ok('baris berisi tidak dikenali kosong', !barisKosong(['', 'x', '']));
}

console.log('\n=== 7. Bentuk cocok dengan DDL, kolom demi kolom ===');
{
  /* Inilah uji yang paling berharga di berkas ini. DDL dan skrip migrasi ditulis
     terpisah; satu nama kolom yang meleset akan lolos semua uji lain dan baru
     meledak saat migrasi sungguhan. */
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'produk_base.sql'), 'utf8');
  const ddl = {};
  const re = /CREATE TABLE IF NOT EXISTS ([a-z_]+) \(([\s\S]*?)\n\) ENGINE=InnoDB;/g;
  let m;
  while ((m = re.exec(sql))) {
    ddl[m[1]] = m[2].split('\n')
      .map(l => l.replace(/\/\*[\s\S]*?\*\//g, '').trim())
      .filter(l => /^[a-z_]+\s+(VARCHAR|TEXT|LONGTEXT|INT|BIGINT|SMALLINT|DATE|DATETIME|BOOLEAN)/.test(l))
      .map(l => l.split(/\s+/)[0]);
  }

  eq('DDL punya 18 tabel', Object.keys(ddl).length, 18);
  eq('skrip punya 18 tabel', TABEL.length, 18);

  for (const spek of TABEL) {
    const diDDL = ddl[spek.tabel];
    ok(spek.tabel + ' ada di DDL', !!diDDL);
    const diSkrip = spek.kolom.map(k => k[0]);
    const kurang = diSkrip.filter(k => !diDDL.includes(k));
    /* `id` AUTO_INCREMENT memang tak diisi skrip — itu satu-satunya yang boleh beda. */
    const lebih = diDDL.filter(k => !diSkrip.includes(k) && k !== 'id');
    ok(spek.tabel + ': tak ada kolom karangan', kurang.length === 0);
    ok(spek.tabel + ': tak ada kolom DDL yang terlewat', lebih.length === 0);
  }
}

console.log('\n=== 8. Urutan muat menghormati kunci asing ===');
{
  /* Kalau urutannya tertukar, INSERT akan ditolak kunci asing — dan gagalnya
     baru terjadi setelah menyambung ke database produksi. Lebih baik di sini. */
  const urut = TABEL.map(t => t.tabel);
  const sebelum = (a, b) => urut.indexOf(a) < urut.indexOf(b);
  ok('packages sebelum package_items', sebelum('packages', 'package_items'));
  ok('packages sebelum package_links', sebelum('packages', 'package_links'));
  ok('packages sebelum package_variants', sebelum('packages', 'package_variants'));
  ok('packages sebelum collabs', sebelum('packages', 'collabs'));
  ok('collabs sebelum collab_steps', sebelum('collabs', 'collab_steps'));
  ok('package_items sebelum package_contribs', sebelum('package_items', 'package_contribs'));
  ok('collab_steps sebelum package_contribs', sebelum('collab_steps', 'package_contribs'));
}

console.log('\n=== 9. Rentang baca ===');
{
  const main = TABEL.find(t => t.tabel === 'tasks');
  /* Kolom A sheet Main memang tak terpakai — rowToTask() membaca indeks 0 sebagai
     Task ID, yang ada di kolom B. Rentang yang mulai dari A akan menggeser SEMUA
     kolom satu langkah tanpa error apa pun. */
  eq('Main dibaca mulai dari B, bukan A', main.rentang, 'B4:W');
  eq('tasks punya 22 kolom', main.kolom.length, 22);

  /* Main satu-satunya sheet yang barisan judulnya TIDAK di baris 1:
     CONFIG.HEADER_ROW = 3, FIRST_DATA_ROW = 4. Membaca dari B2 memungut barisan
     judul itu sebagai task ber-ID harfiah "Task ID" — dan ia lolos SEMUA
     pemeriksaan bentuk, karena memang teks yang sah. Ini pernah terjadi. */
  const cfg = fs.readFileSync(path.join(__dirname, '..', 'api', '_sheets.js'), 'utf8');
  ok('aplikasi memang memakai FIRST_DATA_ROW: 4', /FIRST_DATA_ROW:\s*4/.test(cfg));
  ok('dan HEADER_ROW: 3', /HEADER_ROW:\s*3/.test(cfg));
  ok('rentang Main cocok dengan FIRST_DATA_ROW aplikasi', main.rentang.indexOf('B4') === 0);

  ok('sheet selain Main mulai baris 2',
    TABEL.filter(t => t.sheet !== 'Main').every(t => /^[A-Z]+2:/.test(t.rentang)));
}

console.log('\n=== 9b. Rujukan paket yang boleh kosong ===');
{
  /* Dua jebakan yang cuma terlihat sesudah data sungguhan ditarik.

     Pertama: string kosong BUKAN NULL. Kunci asing akan mencari paket ber-ID ""
     lalu menolak barisnya — dan di data sungguhan 24 dari 25 collab memang
     kosong kolom ini, jadi hampir semuanya akan gugur.

     Kedua: kolom "Paket ID" di sheet COLLAB ditambahkan belakangan. Baris lama
     sudah mengisi kolom itu untuk keperluan lain, jadi isinya bisa teks apa saja. */
  const keluhan = [];
  const catat = (m) => keluhan.push(m);

  eq('kosong -> NULL, bukan string kosong', T.idPaket('', catat, 'paket_id'), null);
  eq('spasi saja -> NULL', T.idPaket('   ', catat, 'paket_id'), null);
  eq('null -> NULL', T.idPaket(null, catat, 'paket_id'), null);
  eq('ID yang sah dibiarkan', T.idPaket('PKG-041', catat, 'paket_id'), 'PKG-041');
  eq('spasi di tepi dirapikan', T.idPaket('  PKG-007  ', catat, 'paket_id'), 'PKG-007');
  eq('yang kosong tidak dikeluhkan', keluhan.length, 0);

  /* Nilai warisan sungguhan dari baris COL-011. */
  eq('teks warisan -> NULL',
    T.idPaket('Develop Konten (materi/soal)', catat, 'paket_id'), null);
  eq('dan itu dikeluhkan', keluhan.length, 1);
  ok('keluhannya menyebut isi aslinya', keluhan[0].indexOf('Develop Konten') >= 0);

  const spek = TABEL.find(t => t.tabel === 'collabs');
  const kol = spek.kolom.find(k => k[0] === 'paket_id');
  ok('collabs.paket_id memakai pengubah khusus itu', kol[1] === T.idPaket);

  /* Kolom paket yang WAJIB isi tidak boleh memakai pengubah ini — di sana kosong
     memang berarti barisnya rusak dan pantas ditolak, bukan dilunakkan jadi NULL. */
  ['package_items', 'package_links', 'package_variants'].forEach(t => {
    const s = TABEL.find(x => x.tabel === t);
    const k = s.kolom.find(c => c[0] === 'paket_id');
    ok(t + '.paket_id tetap teks biasa', k[1] === T.teks);
  });
}

console.log('\n=== 10. Pemuat .env ===');
{
  /* GOOGLE_SERVICE_ACCOUNT_JSON ditulis sebagai SATU baris JSON yang di dalamnya
     ada backslash-n untuk private key. Kalau pemuatnya mengubah dua karakter itu
     jadi baris baru sungguhan, JSON.parse gagal dan migrasi berhenti sebelum
     mulai — jadi yang perlu dibuktikan justru apa yang TIDAK diubah. */
  const { muat, BERKAS } = require('../scripts/migrasi/env.js');
  const tmp = path.join(os.tmpdir(), 'uji-env-' + process.pid + '.env');
  const BS = String.fromCharCode(92);

  fs.writeFileSync(tmp, [
    '# komentar diabaikan',
    '',
    'UJI_POLOS=nilai polos',
    'UJI_KUTIP="dibungkus kutip"',
    'UJI_SAMADENGAN=ada=sama=dengan',
    'UJI_JSON={"k":"awal' + BS + 'nakhir"}',
    'UJI_SHELL=dari_berkas',
    'baris tanpa tanda sama dengan',
  ].join('\n'));

  process.env.UJI_SHELL = 'dari_shell';     // sudah ada sebelum muat dipanggil
  ok('berkas terbaca', muat(tmp) === true);

  eq('nilai polos', process.env.UJI_POLOS, 'nilai polos');
  eq('kutip pembungkus dibuang', process.env.UJI_KUTIP, 'dibungkus kutip');
  eq('tanda = di dalam nilai utuh', process.env.UJI_SAMADENGAN, 'ada=sama=dengan');

  /* Inti blok ini. */
  eq('backslash-n tetap dua karakter di env', process.env.UJI_JSON.length, 19);
  eq('baru jadi baris baru sesudah JSON.parse',
    JSON.parse(process.env.UJI_JSON).k, 'awal\nakhir');

  /* Supaya satu nilai bisa ditimpa untuk satu jalan tanpa menyunting berkasnya. */
  eq('nilai dari shell menang atas berkas', process.env.UJI_SHELL, 'dari_shell');

  ok('baris tanpa = dilewati tanpa error', true);
  eq('berkas tak ada -> false, bukan melempar', muat(tmp + '.tidak-ada'), false);

  /* Penjaga: uji ini tak boleh menyentuh .env sungguhan. */
  ok('jalur bawaannya tetap .env di akar repo', BERKAS.endsWith('.env'));
  ok('yang diuji bukan .env sungguhan', tmp !== BERKAS);

  fs.unlinkSync(tmp);
}

console.log('\n=== 11. Penjaga kredensial ===');
{
  /* Kunci cacat harus ditolak di sini, bukan diserahkan ke Google. Kalau lolos,
     yang muncul adalah "error:1E08010C:DECODER routines::unsupported" — pesan
     OpenSSL yang tak menyebut berkas mana, env mana, atau apa yang salah.

     Ini pernah betul-betul terjadi: .env.example disalin jadi .env dan baris
     GOOGLE_SERVICE_ACCOUNT_JSON-nya ikut terbawa. Nilai contohnya JSON yang SAH
     dengan private key palsu, jadi lolos JSON.parse — dan karena env menang atas
     berkas, credentials.json yang sah jadi tak terpakai. */
  const { periksaKunci } = require('../scripts/migrasi/tarik.js');

  const PEM = '-----BEGIN PRIVATE KEY-----\n' + 'A'.repeat(1200) + '\n-----END PRIVATE KEY-----\n';
  const sah = { client_email: 'x@y.iam.gserviceaccount.com', private_key: PEM };
  ok('kunci yang sah diterima', periksaKunci(sah, 'uji') === sah);

  const gagal = (obj) => {
    try { periksaKunci(obj, 'uji'); return null; } catch (e) { return e.message; }
  };

  ok('tanpa client_email ditolak', gagal({ private_key: PEM }) !== null);
  ok('tanpa private_key ditolak', gagal({ client_email: 'a@b.c' }) !== null);
  ok('private_key bukan PEM ditolak',
    gagal({ client_email: 'a@b.c', private_key: 'bukan kunci' }) !== null);

  /* Kasus yang sebenarnya terjadi: nilai contoh dari .env.example. */
  const contoh = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8')
    .split('\n').find(l => l.indexOf('GOOGLE_SERVICE_ACCOUNT_JSON={') >= 0);
  ok('contoh di .env.example masih ada sebagai komentar', !!contoh);
  ok('...dan memang dikomentari, bukan nilai aktif', contoh.trim().startsWith('#'));

  const pesan = gagal(JSON.parse(contoh.slice(contoh.indexOf('{'))));
  ok('kunci contoh ditolak', pesan !== null);
  /* Pesannya harus menyebut JALAN KELUARNYA, bukan cuma menyatakan ada yang salah. */
  ok('pesannya menyebut ini contoh', pesan.indexOf('contoh') >= 0);
  ok('pesannya menyebut apa yang harus dilakukan', pesan.indexOf('Kosongkan') >= 0);
  ok('pesannya menyebut berkas .env', pesan.indexOf('.env') >= 0);
  ok('pesannya menyebut credentials.json', pesan.indexOf('credentials.json') >= 0);
}

console.log('\n=== 12. Penjaga nilai contoh ===');
{
  /* .env dibuat dengan menyalin .env.example, jadi baris yang terlewat diisi tetap
     memegang nilai contohnya — dan nilai contoh itu BERBENTUK SAH. SPREADSHEET_ID
     contoh lolos semua pemeriksaan bentuk lalu gagal di Google sebagai
     "Requested entity was not found", pesan yang tak menyebut sebabnya sama sekali.

     Ini pernah betul-betul terjadi, dua kali berturut-turut dengan baris berbeda.
     Karena itu yang dijaga kelasnya, bukan satu per satu barisnya. */
  const { periksaBukanContoh, nilaiContoh } = require('../scripts/migrasi/env.js');

  const contohId = nilaiContoh('SPREADSHEET_ID');
  ok('nilai contoh SPREADSHEET_ID terbaca dari .env.example', !!contohId);

  const simpan = process.env.SPREADSHEET_ID;
  const gagal = (nama) => {
    try { periksaBukanContoh([nama]); return null; } catch (e) { return e.message; }
  };

  process.env.SPREADSHEET_ID = contohId;
  const pesan = gagal('SPREADSHEET_ID');
  ok('nilai yang sama persis dengan contoh ditolak', pesan !== null);
  ok('pesannya menyebut nama barisnya', pesan.indexOf('SPREADSHEET_ID') >= 0);
  ok('pesannya menyuruh buka .env', pesan.indexOf('.env') >= 0);

  process.env.SPREADSHEET_ID = contohId + 'x';
  eq('nilai yang sudah diganti lolos', gagal('SPREADSHEET_ID'), null);

  /* Baris yang contohnya memang kosong tak perlu dijaga — kosong bukan nilai palsu,
     dan untuk GOOGLE_SERVICE_ACCOUNT_JSON justru kosong yang benar. */
  eq('contoh kosong -> tak ada yang dijaga', nilaiContoh('GOOGLE_SERVICE_ACCOUNT_JSON'), null);
  eq('baris yang tak ada di contoh dilewati', gagal('TIDAK_ADA_DI_CONTOH_SAMA_SEKALI'), null);

  /* Nilai yang memang SEHARUSNYA sama dengan contohnya tidak boleh ikut dijaga —
     penjaga ini hanya berlaku untuk nama yang diminta pemanggilnya. */
  eq('zona waktu bawaan tetap boleh sama', nilaiContoh('TIMEZONE_OFFSET_MINUTES'), '420');

  if (simpan === undefined) delete process.env.SPREADSHEET_ID;
  else process.env.SPREADSHEET_ID = simpan;
}

console.log('\n=== 13. Alat banding Sheets vs MySQL ===');
{
  /* Alat banding yang rusak lebih berbahaya daripada tidak punya alat banding:
     ia memberi keyakinan palsu. Pembanding yang selalu mengembalikan "cocok"
     akan meluluskan 64 fungsi yang salah semua, dan tak ada yang tahu sampai
     data produksi yang memberitahunya.

     Jadi yang diuji di sini bukan cuma "cocok dikenali cocok", tapi terutama
     "beda BENAR-BENAR terdeteksi". */
  const { rapikan, beda, DAFTAR, BUANG_GLOBAL } = require('../scripts/banding/daftar.js');

  /* -- rapikan: membuang nomor baris di kedalaman berapa pun -- */
  const sheets = { id: 'A', row: 7, steps: [{ order: 1, row: 9, name: 'x' }] };
  const bersih = rapikan(sheets, null);
  ok('row dibuang di akar', !('row' in bersih));
  ok('row dibuang di dalam array bersarang', !('row' in bersih.steps[0]));
  eq('isi yang bukan nomor baris dibiarkan', bersih.steps[0].name, 'x');
  ok('rowNumber ikut dibuang', !('rowNumber' in rapikan({ rowNumber: 3, a: 1 }, null)));
  /* `generatedAt` ikut dibuang: ia nowStamp(), berubah tiap panggilan, jadi
     membandingkannya membuat setiap jalan selalu gagal. Yang dibandingkan isi
     muat-awalnya, bukan jam pembuatannya. */
  eq('daftar buangnya persis tiga itu', BUANG_GLOBAL.join(','), 'row,rowNumber,generatedAt');
  ok('generatedAt memang dibuang', !('generatedAt' in rapikan({ generatedAt: 'x', a: 1 }, null)));

  /* -- rapikan: urutan diratakan, karena MySQL tanpa ORDER BY tak menjanjikan apa pun -- */
  const a1 = rapikan([{ id: 'b' }, { id: 'a' }], (x) => x.id);
  const a2 = rapikan([{ id: 'a' }, { id: 'b' }], (x) => x.id);
  eq('urutan berbeda jadi sama', JSON.stringify(a1), JSON.stringify(a2));

  /* Tapi meratakan urutan TIDAK boleh ikut menyembunyikan isi yang berbeda. */
  const b1 = rapikan([{ id: 'a', v: 1 }, { id: 'b', v: 2 }], (x) => x.id);
  const b2 = rapikan([{ id: 'b', v: 2 }, { id: 'a', v: 99 }], (x) => x.id);
  ok('isi berbeda tetap ketahuan meski urutannya diratakan', beda(b1, b2, '') !== null);

  /* -- beda: yang sama harus diam -- */
  eq('objek identik -> null', beda({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] }, ''), null);
  eq('nilai primitif sama -> null', beda('x', 'x', ''), null);

  /* -- beda: tiap jenis ketidakcocokan harus tertangkap -- */
  const macam = [
    ['nilai beda', { a: 1 }, { a: 2 }],
    ['tipe beda', { a: 1 }, { a: '1' }],
    ['null vs angka', { a: null }, { a: 0 }],
    ['kunci hilang di MySQL', { a: 1, b: 2 }, { a: 1 }],
    ['kunci berlebih di MySQL', { a: 1 }, { a: 1, b: 2 }],
    ['panjang array beda', { a: [1, 2] }, { a: [1] }],
    ['isi array beda', { a: [1, 2] }, { a: [1, 3] }],
    ['array vs objek', { a: [] }, { a: {} }],
  ];
  macam.forEach(([label, x, y]) => ok(label + ' terdeteksi', beda(x, y, '') !== null));

  /* Kesalahan yang paling mahal untuk dilacak adalah boolean vs string — dan itu
     BUKAN kemungkinan teoretis: getTasks() mengembalikan mirror sebagai STRING,
     sedangkan getCollabs() mengembalikannya sebagai BOOLEAN, padahal di DDL
     keduanya BOOLEAN. _db.js harus menirukan perbedaan itu, bukan merapikannya. */
  const dBool = beda({ mirror: 'TRUE' }, { mirror: true }, '');
  ok('string "TRUE" vs boolean true terdeteksi', dBool !== null);
  ok('...dan disebut sebagai beda tipe', dBool.pesan.indexOf('tipe beda') >= 0);

  /* -- beda: jalurnya harus bisa ditunjuk -- */
  const d = beda({ a: { b: [{ c: 1 }] } }, { a: { b: [{ c: 2 }] } }, '');
  eq('jalur menunjuk tepat ke tempatnya', d.jalur, 'a.b[0].c');

  /* -- daftar -- */
  ok('ada fungsi baca yang didaftarkan', DAFTAR.length >= 10);
  ok('semua punya nama', DAFTAR.every((s) => typeof s.nama === 'string' && s.nama));
  ok('semua punya argv()', DAFTAR.every((s) => typeof s.argv === 'function'));
  ok('argv() selalu mengembalikan daftar argumen',
    DAFTAR.every((s) => Array.isArray(s.argv()) && s.argv().every(Array.isArray)));

  /* Hanya fungsi baca. Membandingkan fungsi tulis berarti menulis ke dua tempat,
     dan itu bukan perbandingan melainkan dua sumber kebenaran yang menyimpang. */
  ok('tak ada fungsi tulis yang ikut terdaftar',
    DAFTAR.every((s) => /^(get|list)/.test(s.nama)));

  /* Sebagian fungsi baca tidak diekspor di tingkat atas — ia pembantu internal
     getBootstrapData. Alat banding mencarinya juga di _internals, dan uji ini
     harus memeriksa hal yang sama: fungsi yang tak terbandingkan adalah fungsi
     yang dipindahkan tanpa penilai. */
  const sheetsApi = require('../api/_sheets.js');
  const adaDiSheets = (n) =>
    typeof sheetsApi[n] === 'function' || typeof sheetsApi._internals[n] === 'function';
  ok('semua yang didaftarkan bisa dipanggil di sisi Sheets', DAFTAR.every((s) => adaDiSheets(s.nama)));

  /* -- urutan: diratakan secara bawaan, dijaga kalau diminta -- */
  const urutAsli = [{ v: 'b' }, { v: 'a' }];
  eq('tanpa jagaUrutan, urutan diratakan',
    JSON.stringify(rapikan(urutAsli, null, false)), JSON.stringify([{ v: 'a' }, { v: 'b' }]));
  eq('dengan jagaUrutan, urutan dibiarkan',
    JSON.stringify(rapikan(urutAsli, null, true)), JSON.stringify([{ v: 'b' }, { v: 'a' }]));
  ok('jagaUrutan menular ke array bersarang',
    JSON.stringify(rapikan({ a: [{ b: ['z', 'y'] }] }, null, true)).indexOf('"z","y"') > 0);

  /* getOptions mengisi dropdown yang punya fitur seret-urut; urutannya dipilih
     dan dilihat orang, jadi meratakannya menyembunyikan kerusakan paling kasatmata. */
  ['getOptions', 'getActivityLog', 'getNotifications'].forEach((n) => {
    ok(n + ' dibandingkan dengan urutan dijaga',
      DAFTAR.find((s) => s.nama === n).jagaUrutan === true);
  });

  /* -- sidik aturan: acuan direkam lewat rapikan, jadi mengubah aturannya
        membuat acuan lama tak sebanding. Tanpa penjaga ini, bedanya menyamar
        jadi bug di _db.js — dan itu sudah pernah terjadi: tiga fungsi tampak
        rusak, dan hampir saja satu kolom ditambahkan ke skema untuk masalah
        yang tidak ada. -- */
  const { sidikAturan } = require('../scripts/banding/daftar.js');
  const sidik1 = sidikAturan();
  ok('sidik aturan berupa teks', typeof sidik1 === 'string' && sidik1.length > 0);
  eq('dipanggil dua kali hasilnya sama', sidikAturan(), sidik1);
  ok('sidiknya menyebut saklar urutan', sidik1.indexOf(':jaga') >= 0);

  const spekOpsi = DAFTAR.find((s) => s.nama === 'getOptions');
  spekOpsi.jagaUrutan = false;
  ok('mengubah saklar urutan mengubah sidiknya', sidikAturan() !== sidik1);
  spekOpsi.jagaUrutan = true;
  eq('dan kembali sama setelah dipulihkan', sidikAturan(), sidik1);
}

console.log('\n=== 14. Lapisan MySQL (api/_db.js) ===');
{
  /* Bentuk keluarannya diuji oleh alat banding dengan data sungguhan, bukan di
     sini — uji unit tak bisa membuktikan 602 task cocok. Yang dijaga di sini
     adalah aturan yang mudah dilanggar tanpa sadar saat menambah fungsi. */
  const db = require('../api/_db.js');
  const { DAFTAR } = require('../scripts/banding/daftar.js');

  const sudah = DAFTAR.map((s) => s.nama).filter((n) => typeof db[n] === 'function');
  eq('seluruh fungsi baca sudah dipindahkan', sudah.length, DAFTAR.length);

  /* Tiga cabang muat-awal diuji terpisah. Tamu Lintas Divisi dan magang menerima
     data yang SUDAH disaring di server — penyaringannya di sana justru supaya tak
     bisa diintip lewat DevTools — jadi beda di cabang itu berarti kebocoran, bukan
     sekadar tampilan yang keliru. */
  ok('muat-awal diuji bertiga cabang',
    DAFTAR.find((s) => s.nama === 'getBootstrapData').argv().length === 3);
  /* Tiap fungsi yang dipindahkan harus punya penilainya: fungsi baca lewat
     daftar banding, fungsi tulis lewat skenario. Fungsi yang dipindahkan tanpa
     penilai adalah fungsi yang tak ada yang tahu benar atau tidak. */
  const { SKENARIO } = require('../scripts/banding/skenario.js');
  const diUji = new Set(DAFTAR.map((s) => s.nama));
  SKENARIO.forEach((s) => s.langkah.forEach((l) => diUji.add(l.fn)));
  const yatim = Object.keys(db)
    .filter((k) => k !== '_db' && typeof db[k] === 'function')
    .filter((k) => !diUji.has(k));
  ok('tak ada fungsi yang dipindahkan tanpa penilai' + (yatim.length ? ': ' + yatim.join(', ') : ''),
    yatim.length === 0);

  /* Aturan apa pun yang sama harus diambil dari _sheets.js, bukan disalin.
     Dua salinan berarti dua tempat yang harus ikut berubah bersamaan, dan yang
     satu pasti terlupakan. */
  const src = fs.readFileSync(path.join(__dirname, '..', 'api', '_db.js'), 'utf8');
  ok('OPTION_TYPES diambil dari _sheets.js, bukan disalin',
    /OPTION_TYPES[\s\S]{0,120}require\('\.\/_sheets\.js'\)/.test(src));
  ok('isChecked dan baseName juga', src.indexOf('baseName') > 0 && src.indexOf('isChecked') > 0);
  ok('_sheets.js memang mengekspornya',
    ['OPTION_TYPES', 'DEFAULT_OPTIONS', 'baseName', 'isChecked']
      .every((k) => require('../api/_sheets.js')._internals[k] !== undefined));

  /* Pool di lingkup modul, bukan dibuat per pemanggilan: server ini
     max_connections 150 dengan 62 sudah terpakai tim lain. */
  /* Aturan penyaringan magang & tamu tidak disalin ke _db.js — penyusunnya satu,
     dipakai kedua backend. Dua salinan berarti dua tempat yang bisa menyimpang. */
  ok('penyusun muat-awal dipakai bersama, bukan disalin',
    src.indexOf('susunBootstrap') > 0 && src.indexOf('magangVisibleTask') < 0);
  ok('perhitungan paket juga dipakai bersama',
    src.indexOf('readPackages') > 0 && src.indexOf('itemHitung') < 0);

  ok('pool disimpan di lingkup modul', /let _pool = null/.test(src));
  ok('ada cara menutup pool, supaya skrip tak menggantung',
    typeof db._db.tutup === 'function');
  ok('TLS dinyalakan — port 3306 terbuka ke internet', /ssl:/.test(src));
  ok('tanggal dibaca sebagai teks, bukan objek Date', /dateStrings: true/.test(src));
}

console.log('\n=== 15. Alat banding fungsi tulis ===');
{
  const srcTulis = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'banding', 'tulis.js'), 'utf8');
  const { SKENARIO, UJI } = require('../scripts/banding/skenario.js');

  /* Satu-satunya hal yang betul-betul berbahaya di alat ini adalah menulis ke
     spreadsheet yang salah. Penjaganya dua lapis, dan keduanya wajib ada. */
  ok('menuntut SPREADSHEET_ID_UJI tersendiri', srcTulis.indexOf('SPREADSHEET_ID_UJI') > 0);
  ok('menolak kalau sama dengan SPREADSHEET_ID',
    /uji === prod/.test(srcTulis) && srcTulis.indexOf('Tidak dijalankan ke produksi') > 0);
  ok('penjaganya dipanggil sebelum apa pun ditulis',
    srcTulis.indexOf('sheetUji()') < srcTulis.indexOf('siapkan(uji)'));

  ok('ada skenario', SKENARIO.length >= 8);
  ok('semua skenario punya nama', SKENARIO.every((s) => s.nama && s.nama.length > 5));
  ok('semua memeriksa keadaan sesudahnya', SKENARIO.every((s) => (s.periksa || []).length > 0));

  /* Keadaan sesudahnya dinilai lewat fungsi baca yang SUDAH terbukti setara di
     jalan.js. Memakai fungsi yang belum terbukti berarti menilai dengan alat
     yang sendirinya belum tentu benar. */
  const { DAFTAR } = require('../scripts/banding/daftar.js');
  ok('fungsi penilainya semua sudah terbukti di jalan.js',
    SKENARIO.every((s) => (s.periksa || []).every((n) => DAFTAR.some((d) => d.nama === n))));

  /* Pegangan TIDAK boleh ditulis tetap. Sheets memberi nomor baris, MySQL memberi
     id, dan keduanya tak akan pernah sama — angka tetap yang kebetulan benar di
     satu sisi akan menunjuk baris lain di sisi satunya, lalu lulus atau gagal
     karena alasan yang keliru.

     Pengecualiannya skenario penolakan, yang memang menguji pegangan tak masuk
     akal — dan itu ditandai `ditolak` sehingga terbaca sebagai pilihan. */
  SKENARIO.forEach((s) => {
    s.langkah.forEach((l) => {
      if (/^add/.test(l.fn)) return;
      if (s.ditolak) return;
      ok(s.nama.slice(0, 30) + ': pegangan dari ctx',
        String(l.args).indexOf('ctx.pegangan') >= 0);
    });
  });

  /* Yang dibuat harus dihapus lagi, kalau tidak jalan berikutnya membandingkan
     keadaan yang sudah tidak sama dan gagal dengan sebab yang tak berhubungan. */
  SKENARIO.forEach((s) => {
    /* Skenario penolakan tak menciptakan apa pun, jadi tak ada yang perlu
       dirapikan — ditandai eksplisit supaya bedanya terbaca, bukan ditebak. */
    if (s.ditolak) { ok(s.nama.slice(0, 26) + ': penolakan, tak ada jejak', true); return; }
    const tambah = s.langkah.filter((l) => /^add/.test(l.fn)).length;
    const hapus = s.langkah.filter((l) => /^delete/.test(l.fn) && String(l.args).indexOf('ctx.pegangan') >= 0).length;
    /* Skenario yang MEMANG meninggalkan jejak wajib punya pembersihnya sendiri —
       jejak yang terbawa membuat jalan berikutnya gagal dengan sebab yang tak ada
       hubungannya. Itu sudah terjadi: satu jalan meninggalkan dua baris, jalan
       berikutnya melaporkan sembilan beda. */
    ok(s.nama.slice(0, 30) + ': jejaknya dirapikan',
      tambah === 0 || hapus >= 1 || typeof s.bersihkan === 'function');
  });

  eq('nama user uji mudah dikenali kalau ada yang tertinggal', UJI, 'ujibanding');

  /* Beda yang DISENGAJA harus menyebut alasannya, dan alasannya harus cukup
     panjang untuk berarti sesuatu. Tanpa aturan ini, `bedaSengaja: true` akan
     jadi tempat menyapu beda yang tak sempat ditelusuri. */
  SKENARIO.filter((s) => s.bedaSengaja).forEach((s) => {
    ok(s.nama.slice(0, 30) + ': alasan bedanya ditulis',
      typeof s.bedaSengaja === 'string' && s.bedaSengaja.length > 40);
  });

  /* Dan kalau yang ditandai beda ternyata SAMA, alat bandingnya menggagalkan
     jalan — karena berarti alasannya sudah tak berlaku dan catatan itu
     menyesatkan siapa pun yang membacanya nanti. */
  ok('tanda bedaSengaja yang ternyata sama ikut digagalkan',
    srcTulis.indexOf('ditandai bedaSengaja tapi ternyata SAMA') > 0);

  /* Kuota Sheets menyamar jadi beda: fungsi baca di _sheets.js menelan kegagalan
     menjadi daftar kosong, dan "0 vs 9" terlihat persis seperti bug sungguhan.
     Diulang sekali untuk memisahkan keduanya, dan pengulangannya dilaporkan. */
  ok('skenario yang beda diulang sekali sebelum divonis', srcTulis.indexOf('lulus setelah diulang') > 0);
  ok('ada jeda antar-skenario untuk menjaga kuota', srcTulis.indexOf('BANDING_JEDA_MS') > 0);

  /* Stempel waktu disamarkan, bukan dibuang: nowStamp() dipanggil pada detik yang
     berbeda di kedua sisi, tapi "stempelnya tidak terisi" tetap harus ketahuan. */
  const { samarkan } = require('../scripts/banding/daftar.js');
  const pola = { updatedAt: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/ };
  eq('stempel sah jadi penanda', samarkan({ updatedAt: '2026-10-02 03:44' }, pola).updatedAt, '<pola cocok>');
  ok('stempel kosong TETAP ketahuan', samarkan({ updatedAt: '' }, pola).updatedAt.indexOf('TAK COCOK') > 0);
  ok('stempel salah bentuk TETAP ketahuan', samarkan({ updatedAt: 'kemarin' }, pola).updatedAt.indexOf('TAK COCOK') > 0);
  eq('medan lain tak tersentuh', samarkan({ title: 'tetap' }, pola).title, 'tetap');
  ok('skenario catatan memang menyamarkan stempelnya',
    SKENARIO.filter((s) => s.langkah.some((l) => /Note$/.test(l.fn))).every((s) => !!s.samarkan));
}

console.log('\n=== 16. Batas pegangan di _db.js ===');
{
  /* _sheets.js menolak `row < 2` karena baris 1 spreadsheet adalah judul kolom.
     Di MySQL pegangannya id AUTO_INCREMENT, yang MULAI DARI SATU.

     Menyalin `< 2` membuat baris pertama tiap tabel permanen tak bisa disunting
     maupun dihapus — dan diamnya sempurna: tombolnya ada, ditekan, lalu muncul
     "Baris tidak valid" tanpa sebab yang masuk akal. Tak ada yang akan menduga
     penyebabnya ada di konstanta pembatas. */
  const src = fs.readFileSync(path.join(__dirname, '..', 'api', '_db.js'), 'utf8');
  ok('ada fungsi pembatas tersendiri', src.indexOf('function peganganSah') > 0);
  ok('batasnya 1, bukan 2', /n < 1/.test(src));
  /* Komentar dibuang dulu: penjelasan di _db.js menyebut "row < 2" sebagai hal
     yang TIDAK disalin, dan memeriksanya mentah-mentah akan mengenai tulisan
     sendiri. Yang diperiksa kodenya, bukan ceritanya. */
  const kode = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('tak ada lagi batas < 2 yang tersalin di kodenya', !/row < 2|n < 2/.test(kode));

  const sheets = fs.readFileSync(path.join(__dirname, '..', 'api', '_sheets.js'), 'utf8');
  ok('dan _sheets.js memang memakai < 2', /row < 2/.test(sheets));

  /* Fungsi tulis tak boleh memakai parseInt sendiri-sendiri — satu tempat saja
     yang menentukan batasnya, supaya tak ada yang terlewat saat ditambah. */
  const pakai = (src.match(/peganganSah\(/g) || []).length;
  ok('dipakai oleh setiap fungsi yang menerima pegangan', pakai >= 3);
}

console.log('\n' + passed + ' assertion lulus.\n');
