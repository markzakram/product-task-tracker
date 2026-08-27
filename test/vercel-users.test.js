/**
 * Uji integrasi backend Vercel (api/_sheets.js) untuk sheet USERS & peran.
 * googleapis diganti spreadsheet tiruan in-memory, jadi seluruh jalur nyata diuji:
 * baca/tulis sheet, gerbang izin, bootstrap meta, dan CRUD user.
 *
 * Jalankan: node test/vercel-users.test.js
 */
const assert = require('assert');
const path = require('path');
const Module = require('module');
const origLoad = Module._load;

/* ---------------- Spreadsheet tiruan ---------------- */
const SHEETS = {};                       // { nama: string[][] }  (indeks 0 = baris 1)
function sheet(name) { if (!SHEETS[name]) SHEETS[name] = []; return SHEETS[name]; }
function colIdx(letters) {
  let n = 0;
  for (const ch of String(letters).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
function parseRange(a1) {
  const bang = a1.lastIndexOf('!');
  const name = a1.slice(0, bang);
  const ref = a1.slice(bang + 1).toUpperCase();
  const m = ref.match(/^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/);
  if (!m) throw new Error('range tidak dikenal: ' + a1);
  return {
    name,
    c1: colIdx(m[1]), r1: m[2] ? +m[2] : 1,
    c2: colIdx(m[3] || m[1]), r2: (m[3] ? (m[4] ? +m[4] : 0) : (m[2] ? +m[2] : 0)),
  };
}
function readRange(a1) {
  const p = parseRange(a1);
  const rows = sheet(p.name);
  const end = p.r2 || rows.length;
  const out = [];
  for (let r = p.r1; r <= end; r++) {
    const row = rows[r - 1] || [];
    const slice = [];
    for (let c = p.c1; c <= p.c2; c++) slice.push(row[c] === undefined ? '' : row[c]);
    out.push(slice);
  }
  while (out.length && out[out.length - 1].every(v => v === '' || v === null || v === undefined)) out.pop();
  return out;
}
function writeRange(a1, values) {
  const p = parseRange(a1);
  const rows = sheet(p.name);
  values.forEach((vals, i) => {
    const r = p.r1 + i - 1;
    if (!rows[r]) rows[r] = [];
    vals.forEach((v, j) => { rows[r][p.c1 + j] = v; });
  });
}
function appendRange(a1, values) {
  const p = parseRange(a1);
  const rows = sheet(p.name);
  let last = 0;
  rows.forEach((row, i) => { if (row && row.some(v => v !== '' && v !== undefined && v !== null)) last = i + 1; });
  values.forEach((vals, i) => {
    const r = last + i;
    if (!rows[r]) rows[r] = [];
    vals.forEach((v, j) => { rows[r][p.c1 + j] = v; });
  });
}
function deleteRow(sheetName, rowNumber) { sheet(sheetName).splice(rowNumber - 1, 1); }

const SHEET_IDS = {};
let nextSheetId = 100;
function ensureSheet(name) { if (!(name in SHEET_IDS)) SHEET_IDS[name] = nextSheetId++; sheet(name); }

function fakeSheets() {
  return {
    spreadsheets: {
      get: async () => ({
        data: { sheets: Object.keys(SHEETS).map(t => ({ properties: { sheetId: SHEET_IDS[t], title: t, gridProperties: { rowCount: 1000 } } })) },
      }),
      values: {
        get: async ({ range }) => ({ data: { values: readRange(range) } }),
        batchGet: async ({ ranges }) => ({ data: { valueRanges: ranges.map(r => ({ values: readRange(r) })) } }),
        update: async ({ range, requestBody }) => { writeRange(range, requestBody.values); return {}; },
        append: async ({ range, requestBody }) => { appendRange(range, requestBody.values); return {}; },
        batchUpdate: async ({ requestBody }) => { (requestBody.data || []).forEach(d => writeRange(d.range, d.values)); return {}; },
      },
      batchUpdate: async ({ requestBody }) => {
        (requestBody.requests || []).forEach(req => {
          if (req.addSheet) ensureSheet(req.addSheet.properties.title);
          if (req.deleteDimension) {
            const id = req.deleteDimension.range.sheetId;
            const name = Object.keys(SHEET_IDS).find(k => SHEET_IDS[k] === id);
            if (name) deleteRow(name, req.deleteDimension.range.startIndex + 1);
          }
        });
        return {};
      },
    },
  };
}

Module._load = function (request) {
  if (request === 'googleapis') {
    return { google: { auth: { GoogleAuth: class { getClient() { return {}; } } }, sheets: () => fakeSheets() } };
  }
  return origLoad.apply(this, arguments);
};

process.env.SPREADSHEET_ID = 'x';
process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: 'a@b.c', private_key: 'k' });

const backend = require(path.join(__dirname, '..', 'api', '_sheets.js'));

/* ---------------- Data awal ---------------- */
ensureSheet('Main'); ensureSheet('OPTIONS'); ensureSheet('USERS'); ensureSheet('ACTIVITY'); ensureSheet('DASHBOARDS');
// Dashboard eksternal: dipakai untuk membuktikan magang MENERIMA-nya, bukan menerima nol.
writeRange('DASHBOARDS!A1:D1', [['Nama', 'URL', 'Deskripsi', 'Urutan']]);
writeRange('DASHBOARDS!A2:D3', [
  ['Laporan Konten', 'https://example.com/a', 'Rekap mingguan', '1'],
  ['Rekap Soal', 'https://example.com/b', 'Progres bank soal', '2'],
]);
writeRange('Main!B3:V3', [[
  'Task ID', 'Created Date', 'Due Date', 'Status', 'Priority', 'Task Name', 'Stage', 'Platform',
  'PIC', 'Support', 'Document', 'PIC Notes', 'PM Notes', 'Divisi Tujuan', 'Kontak Divisi',
  'Kata Kerja', 'Jumlah', 'Objek', 'Detail', 'Dibuat Oleh', 'Lintas View']]);
const T = (id, pic, status, sup) => [id, '2026-07-01', '2026-08-01', status, 'Normal', 'Task ' + id, 'QC Konten', 'JadiASN', pic, sup || '', '', '', '', '', '', '', '', '', '', 'Nynda', ''];
writeRange('Main!B4:V7', [
  T('TSK-001', 'Ali', 'In progress'),        // PIC karyawan (Staff)
  T('TSK-002', 'Magang A', 'Review PM', 'Ali'),   // PIC magang, DIDAMPINGI Ali (Support)
  T('TSK-003', 'Magang B', 'In progress', 'Uma'), // PIC magang, didampingi Uma
  T('TSK-004', 'Uma', 'In progress'),
]);
writeRange('USERS!A1:C1', [['Nama', 'Peran', 'Aktif']]);
writeRange('USERS!A2:C8', [
  ['Nynda', 'Manager', 'TRUE'],
  ['Dhea', 'Leader', 'TRUE'],
  ['Ali', 'Staff', 'TRUE'],
  ['Uma', 'Staff', 'TRUE'],
  ['Magang A', 'Magang', 'TRUE'],
  ['Magang B', 'Magang', 'TRUE'],
  ['Bilar', 'Staff', 'FALSE'],
]);

/* ---------------- Assertions ---------------- */
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log('  ✓ ' + name); passed++; }
function eq(name, a, b) {
  assert.strictEqual(a, b, `${name} (got=${JSON.stringify(a)} want=${JSON.stringify(b)})`);
  console.log('  ✓ ' + name); passed++;
}
const fresh = () => backend.invalidateUsers();   // tiap request membuang cache
// Task yang SUDAH Done boleh diubah siapa saja (aturan "tarik balik"), jadi tiap uji
// gerbang Done harus dimulai dari status yang belum Done.
function setStatus(id, st) {
  const rows = readRange('Main!B4:V');
  const i = rows.findIndex(r => r[0] === id);
  if (i >= 0) writeRange(`Main!E${4 + i}`, [[st]]);
}
function resetAll() { ['TSK-001', 'TSK-002', 'TSK-003', 'TSK-004'].forEach(id => setStatus(id, 'In progress')); }

(async () => {
  console.log('Bootstrap mengirim daftar user & peran:');
  fresh();
  const boot = await backend.getBootstrapData({});
  eq('7 user terkirim', boot.meta.users.length, 7);
  eq('daftar peran terkirim', boot.meta.roles.join(','), 'Dev,Manager,Leader,Staff,Magang,Lihat Saja');
  eq('managers dari peran', boot.meta.managers.join(','), 'Nynda');
  eq('approver = Manager + Leader', boot.meta.doneApprovers.join(','), 'Nynda,Dhea');
  ok('user nonaktif tetap terkirim (dgn flag)', boot.meta.users.some(u => u.name === 'Bilar' && u.active === false));
  eq('4 task terbaca', boot.tasks.length, 4);

  console.log('\nGerbang "Done" via quickUpdateField (bergantung PIC):');
  resetAll(); fresh();
  const staffOnMagang = await backend.quickUpdateField('TSK-002', 'status', 'Done', 'Ali');
  eq('Staff pendamping BOLEH menutup task magang', staffOnMagang.success, true);
  // Staff yang TIDAK terlibat di task itu tidak boleh, walau PIC-nya anak magang.
  resetAll(); fresh();
  const staffLuar = await backend.quickUpdateField('TSK-002', 'status', 'Done', 'Uma');
  eq('Staff yg bukan Support TIDAK boleh', staffLuar.success, false);
  resetAll(); fresh();
  const staffOnStaff = await backend.quickUpdateField('TSK-004', 'status', 'Done', 'Ali');
  eq('Staff TIDAK boleh menutup task karyawan', staffOnStaff.success, false);
  resetAll(); fresh();
  const magangSelf = await backend.quickUpdateField('TSK-003', 'status', 'Done', 'Magang B');
  eq('Magang tidak boleh menutup task sendiri', magangSelf.success, false);
  ok('pesannya menjelaskan aturan magang', /anak magang/i.test(magangSelf.message));
  resetAll(); fresh();
  eq('Leader boleh menutup task karyawan', (await backend.quickUpdateField('TSK-004', 'status', 'Done', 'Dhea')).success, true);
  resetAll(); fresh();
  eq('Manager boleh menutup apa pun', (await backend.quickUpdateField('TSK-001', 'status', 'Done', 'Nynda')).success, true);
  // Yang sudah Done boleh ditarik balik siapa saja — aturan lama harus tetap berlaku.
  fresh();
  eq('task Done boleh ditarik balik oleh Staff', (await backend.quickUpdateField('TSK-001', 'status', 'Revisi', 'Ali')).success, true);

  console.log('\nGerbang "Done" via saveTask:');
  resetAll(); fresh();
  const saveByStaffMagang = await backend.saveTask({ id: 'TSK-003', taskName: 'Task TSK-003', pic: 'Magang B', support: ['Uma'], status: 'Done', actor: 'Uma' });
  eq('saveTask: Staff pendamping boleh menutup', saveByStaffMagang.success, true);
  resetAll(); fresh();
  const saveByMagang = await backend.saveTask({ taskName: 'Task baru magang', pic: 'Magang A', status: 'Done', actor: 'Magang A' });
  eq('saveTask: Magang tak boleh membuat task Done', saveByMagang.success, false);

  console.log('\nKelola user — HANYA Dev:');
  fresh();
  eq('Manager tak boleh menambah user', (await backend.saveUser('Anak Magang Baru', 'Magang', true, 'Nynda')).success, false);
  fresh();
  eq('Leader tak boleh menambah user', (await backend.saveUser('Anak Magang Baru', 'Magang', true, 'Dhea')).success, false);
  fresh();
  eq('Staff tak boleh menambah user', (await backend.saveUser('Anak Magang Baru', 'Magang', true, 'Ali')).success, false);
  fresh();
  const added = await backend.saveUser('Anak Magang Baru', 'Magang', true, 'Dev');
  eq('Dev BOLEH menambah user', added.success, true);
  eq('daftar user bertambah', added.users.length, 8);
  ok('user baru berperan Magang', added.users.some(u => u.name === 'Anak Magang Baru' && u.role === 'Magang'));
  ok('user baru masuk dropdown PIC', (added.options.pic || []).includes('Anak Magang Baru'));
  ok('tersimpan ke sheet USERS', readRange('USERS!A2:C').some(r => r[0] === 'Anak Magang Baru' && r[1] === 'Magang'));

  console.log('\nPeran baru langsung berlaku:');
  fresh();
  eq('magang baru belum boleh Done', (await backend.quickUpdateField('TSK-003', 'status', 'Done', 'Anak Magang Baru')).success, false);
  fresh();
  eq('Dev menaikkan jadi Leader', (await backend.saveUser('Anak Magang Baru', 'Leader', true, 'Dev')).success, true);
  resetAll(); fresh();
  eq('setelah jadi Leader boleh Done', (await backend.quickUpdateField('TSK-003', 'status', 'Done', 'Anak Magang Baru')).success, true);

  console.log('\nNonaktif & hapus:');
  fresh();
  eq('Dev menonaktifkan', (await backend.saveUser('Anak Magang Baru', 'Leader', false, 'Dev')).success, true);
  fresh();
  eq('user nonaktif kehilangan hak Done', (await backend.quickUpdateField('TSK-001', 'status', 'Done', 'Anak Magang Baru')).success, false);
  fresh();
  const bootAfter = await backend.getBootstrapData({});
  ok('user nonaktif tak masuk approver', !bootAfter.meta.doneApprovers.includes('Anak Magang Baru'));
  fresh();
  eq('validasi peran tak dikenal', (await backend.saveUser('X', 'Sultan', true, 'Dev')).success, false);
  fresh();
  eq('nama "Dev" ditolak', (await backend.saveUser('Dev', 'Staff', true, 'Dev')).success, false);
  fresh();
  eq('Manager tak boleh menghapus', (await backend.deleteUser('Anak Magang Baru', 'Nynda')).success, false);

  // Karyawan tetap yang MASIH AKTIF dilindungi: namanya melekat di task lama.
  fresh();
  eq('Staff aktif tak bisa dihapus', (await backend.deleteUser('Ali', 'Dev')).success, false);
  fresh();
  const delManager = await backend.deleteUser('Nynda', 'Dev');
  eq('Manager aktif tak bisa dihapus', delManager.success, false);
  ok('pesannya menyuruh nonaktifkan dulu', /Nonaktifkan dulu/.test(delManager.message || ''));
  fresh();
  ok('yang dilindungi tetap ada di sheet', readRange('USERS!A2:C').some(r => r[0] === 'Ali'));

  // Jalan keluar untuk akun duplikat/salah ketik: nonaktifkan dulu, baru boleh dihapus.
  fresh();
  eq('Dev membuat Manager duplikat', (await backend.saveUser('Nyndaa', 'Manager', true, 'Dev')).success, true);
  fresh();
  eq('duplikat yang masih aktif tetap dikunci', (await backend.deleteUser('Nyndaa', 'Dev')).success, false);
  fresh();
  eq('Dev menonaktifkan duplikat', (await backend.saveUser('Nyndaa', 'Manager', false, 'Dev')).success, true);
  fresh();
  const delNonaktif = await backend.deleteUser('Nyndaa', 'Dev');
  eq('Manager NONAKTIF boleh dihapus', delNonaktif.success, true);
  ok('duplikat hilang dari dropdown PIC', !(delNonaktif.options.pic || []).includes('Nyndaa'));
  ok('yang asli TIDAK ikut terhapus', (delNonaktif.users || []).some(u => u.name === 'Nynda'));

  // Magang tak perlu dinonaktifkan dulu.
  fresh();
  eq('Dev menurunkan kembali jadi Magang', (await backend.saveUser('Anak Magang Baru', 'Magang', true, 'Dev')).success, true);
  fresh();
  const del = await backend.deleteUser('Anak Magang Baru', 'Dev');
  eq('Magang aktif langsung boleh dihapus', del.success, true);
  eq('daftar kembali 7 user', del.users.length, 7);
  ok('baris hilang dari sheet USERS', !readRange('USERS!A2:C').some(r => r[0] === 'Anak Magang Baru'));
  // Inti permintaan: benar-benar hilang dari PIC, bukan cuma dari daftar user.
  ok('nama dicabut dari dropdown PIC', !(del.options.pic || []).includes('Anak Magang Baru'));
  ok('nama dicabut dari dropdown Support', !(del.options.support || []).includes('Anak Magang Baru'));
  fresh();
  const optAfter = await backend.getOptions();
  ok('pencabutan bertahan saat dibaca ulang', !(optAfter.pic || []).includes('Anak Magang Baru'));
  fresh();
  eq('"Dev" tidak bisa dihapus', (await backend.deleteUser('Dev', 'Dev')).success, false);
  fresh();
  eq('nama tak dikenal ditolak', (await backend.deleteUser('Hantu', 'Dev')).success, false);

  // Nama yang cuma nyangkut di dropdown (tanpa baris USERS) tetap sah dibersihkan.
  fresh();
  await backend.saveOption('pic', 'Sisa Dropdown', '');
  fresh();
  const delOpt = await backend.deleteUser('Sisa Dropdown', 'Dev');
  eq('nama sisa di dropdown boleh dihapus', delOpt.success, true);
  ok('sisa dropdown benar-benar hilang', !(delOpt.options.pic || []).includes('Sisa Dropdown'));

  console.log('\nLevel MAGANG — server memangkas datanya, bukan menyembunyikan:');
  // Tambah satu task karyawan yang Support-nya anak magang.
  writeRange('Main!B8:V8', [['TSK-005', '2026-07-01', '2026-08-01', 'In progress', 'Normal',
    'Task karyawan dibantu magang', 'QC Konten', 'JadiASN', 'Uma', 'Magang A', '', '', '', '', '', '', '', '', '', 'Nynda', '']]);
  const karyawan = ['Ali', 'Uma', 'Dhea', 'Nynda'];

  fresh();
  const mA = await backend.getBootstrapData({ magangOnly: true, asUser: 'Magang A' });
  ok('flag magangOnly dikirim', mA.magangOnly === true);
  eq('daftar identitas magang', (mA.magangUsers || []).join(','), 'Magang A,Magang B');
  // PERUBAHAN v1.70.0: magang HANYA melihat task miliknya sendiri, tidak lagi task sesama magang.
  ok('hanya task miliknya sendiri', mA.tasks.every(t => t.pic === 'Magang A' || String(t.support||'').split(',').some(x => x.trim() === 'Magang A')));
  ok('task magang LAIN tidak ikut terkirim', !mA.tasks.some(t => t.pic === 'Magang B'));
  ok('task miliknya sendiri tetap ada', mA.tasks.some(t => t.pic === 'Magang A'));
  ok('task karyawan biasa TIDAK terkirim', !mA.tasks.some(t => karyawan.includes(t.pic) && t.id !== 'TSK-005'));
  ok('task karyawan tempat ia Support IKUT terkirim', mA.tasks.some(t => t.id === 'TSK-005'));
  eq('riwayat aktivitas tidak dikirim', mA.activity.length, 0);
  // Dashboard eksternal SENGAJA dibuka utk magang: isinya tautan/laporan, bukan data task.
  const dashKaryawan = (await backend.getBootstrapData({})).dashboards;
  ok('fixture memang punya dashboard (assertion tidak hampa)', dashKaryawan.length === 2);
  eq('magang menerima dashboard yang sama', mA.dashboards.length, dashKaryawan.length);
  ok('isinya benar-benar terkirim', (mA.dashboards || []).some(d => d.title === 'Laporan Konten' && d.url));
  eq('daftar PIN user tidak dikirim', mA.pinUsers.length, 0);
  ok('meta.users hanya berisi magang', (mA.meta.users || []).every(u => String(u.role).toLowerCase() === 'magang'));
  eq('meta.managers dikosongkan', mA.meta.managers.length, 0);

  fresh();
  const mB = await backend.getBootstrapData({ magangOnly: true, asUser: 'Magang B' });
  ok('magang lain TIDAK melihat task Support milik temannya', !mB.tasks.some(t => t.id === 'TSK-005'));
  ok('magang lain juga tak melihat task Magang A', !mB.tasks.some(t => t.pic === 'Magang A'));
  ok('hanya melihat task miliknya sendiri', mB.tasks.every(t => t.pic === 'Magang B'));

  // Percobaan naik hak: mengaku karyawan sambil memakai jalur magang.
  fresh();
  const palsu = await backend.getBootstrapData({ magangOnly: true, asUser: 'Nynda' });
  ok('klaim "Nynda" TIDAK memberi data karyawan', !palsu.tasks.some(t => karyawan.includes(t.pic) && t.id !== 'TSK-005'));
  ok('klaim palsu juga tak menarik task Support orang lain', !palsu.tasks.some(t => t.id === 'TSK-005'));
  fresh();
  const kosong = await backend.getBootstrapData({ magangOnly: true, asUser: '' });
  // Tanpa identitas (cookie belum dipilih) tak ada yang bisa diklaim miliknya -> kosong.
  eq('tanpa identitas: tak ada task sama sekali', kosong.tasks.length, 0);
  ok('daftar identitas tetap dikirim agar bisa memilih', (kosong.magangUsers || []).length >= 2);

  // Bandingkan dengan karyawan biasa.
  fresh();
  const penuh = await backend.getBootstrapData({});
  ok('karyawan tetap menerima semua task', penuh.tasks.length > mA.tasks.length);

  console.log('\nSalin sub-ceklis antar proses kolaborasi:');
  fresh();
  await backend.addChecklistItem('COL-001#1', 'Latsol TWK - Nasionalisme', 'Alya');
  await backend.addChecklistItem('COL-001#1', 'Latsol TIU - Verbal Analogi', 'Alya');
  await backend.addChecklistItem('COL-001#1', 'Latsol TKP - Sosial Budaya', 'Alya');
  fresh();
  await backend.setChecklistDone('COL-001#1', 2, true, 'Alya');    // sumber punya centang
  fresh();
  const src = await backend.getChecklist('COL-001#1');
  eq('sumber 3 item', src.length, 3);
  eq('sumber ada yang tercentang', src.filter(i => i.done).length, 1);
  eq('tujuan mula-mula kosong', (await backend.getChecklist('COL-001#3')).length, 0);
  fresh();
  const cp = await backend.copyChecklist('COL-001#1', ['COL-001#3'], 'Ali');
  eq('salin berhasil', cp.success, true);
  eq('3 item dilaporkan', cp.copied, 3);
  const dst = await backend.getChecklist('COL-001#3');
  eq('tujuan berisi 3 item', dst.length, 3);
  eq('urut & teks sama persis', dst.map(i => i.item).join('|'), src.map(i => i.item).join('|'));
  eq('status centang TIDAK ikut disalin', dst.filter(i => i.done).length, 0);
  fresh();
  eq('sumber tak berubah', (await backend.getChecklist('COL-001#1')).length, 3);
  fresh();
  const cpMulti = await backend.copyChecklist('COL-001#1', ['COL-001#4', 'COL-002#1'], 'Ali');
  eq('dua tujuan sekaligus', cpMulti.targets, 2);
  fresh();
  eq('COL-002#1 ikut terisi', (await backend.getChecklist('COL-002#1')).length, 3);
  fresh();
  eq('tujuan kosong ditolak', (await backend.copyChecklist('COL-001#1', [], 'Ali')).success, false);
  fresh();
  eq('sumber = tujuan diabaikan', (await backend.copyChecklist('COL-001#1', ['COL-001#1'], 'Ali')).success, false);
  fresh();
  const srcKosong = await backend.copyChecklist('COL-009#9', ['COL-001#7'], 'Ali');
  eq('sumber kosong ditolak', srcKosong.success, false);
  ok('pesannya menjelaskan sumber kosong', /kosong/i.test(srcKosong.message));

  console.log('\nTanggal centang, penanggalan ulang, stage opsional, Manager membatalkan:');
  fresh();
  // Proses diuji pada order 2: order 1/3/4/7 sudah dititipi sub-ceklis oleh blok tes salin
  // di atas (collab pertama otomatis ber-id COL-001), jadi order 2 yang masih bersih.
  // Stage melekat pada PROSES, bukan pada kartunya: satu kolaborasi bisa memuat
  // proses ber-stage berbeda-beda, dan sebagian boleh tanpa stage sama sekali.
  const mk = await backend.saveCollab({ title: 'Uji Proses', platform: 'JadiASN',
    steps: [{ order: 1, name: 'Langkah 1', pic: 'Uma', stage: 'Input Soal' },
            { order: 2, name: 'Langkah 2', pic: 'Ali', deadline: '2026-08-01', stage: 'QC Konten' },
            { order: 3, name: 'Langkah 3', pic: 'Uma' }] }, 'Nynda');
  eq('collab dgn stage per proses tersimpan', mk.success, true);
  const stepDua = (cs, id) => cs.find(c => c.id === id).steps.find(s => s.order === 2);
  fresh();
  const col = (await backend.getCollabs()).find(c => c.title === 'Uji Proses');
  eq('stage proses 1 terbaca', col.steps.find(s => s.order === 1).stage, 'Input Soal');
  eq('stage proses 2 terbaca', col.steps.find(s => s.order === 2).stage, 'QC Konten');
  eq('proses tanpa stage = string kosong', col.steps.find(s => s.order === 3).stage, '');
  ok('stage TIDAK lagi di level kartu', col.stage === undefined);
  fresh();
  const mkKosong = await backend.saveCollab({ title: 'Tanpa Stage', platform: 'JadiASN',
    steps: [{ order: 1, name: 'L1', pic: 'Ali' }] }, 'Nynda');
  eq('semua proses tanpa stage tetap boleh', mkKosong.success, true);
  fresh();
  eq('stage kosong terbaca sbg ""', (await backend.getCollabs()).find(c => c.title === 'Tanpa Stage').steps[0].stage, '');

  // Tanggal centang dicatat & dikosongkan saat dibatalkan.
  const SUB = `${col.id}#2`;
  fresh();
  eq('PIC mencentang', (await backend.setCollabStepDone(col.id, 2, true, 'Ali')).success, true);
  fresh();
  const s1 = stepDua(await backend.getCollabs(), col.id);
  ok('doneAt tercatat', /^\d{4}-\d{2}-\d{2}/.test(s1.doneAt));
  eq('doneBy tercatat', s1.doneBy, 'Ali');
  fresh();
  await backend.setCollabStepDone(col.id, 2, false, 'Ali');
  fresh();
  eq('batal centang mengosongkan doneAt', stepDua(await backend.getCollabs(), col.id).doneAt, '');

  // Manager boleh MEMBATALKAN, tapi tidak boleh mencentang milik orang lain.
  fresh();
  await backend.setCollabStepDone(col.id, 2, true, 'Ali');
  fresh();
  eq('Manager boleh membatalkan centang', (await backend.setCollabStepDone(col.id, 2, false, 'Nynda')).success, true);
  fresh();
  const mgrCek = await backend.setCollabStepDone(col.id, 2, true, 'Nynda');
  eq('Manager tak boleh mencentang milik orang lain', mgrCek.success, false);
  ok('pesannya menyebut PIC', /Ali/.test(mgrCek.message));
  fresh();
  const staffBatal = await backend.setCollabStepDone(col.id, 2, false, 'Uma');
  eq('Staff lain tak boleh membatalkan', staffBatal.success, false);
  ok('pesan batal menyebut Manager', /Manager/.test(staffBatal.message));

  // Sub-item susulan dituntaskan -> tanggal proses diperbarui.
  fresh();
  await backend.addChecklistItem(SUB, 'Sub A', 'Ali');
  fresh();
  const subs = await backend.getChecklist(SUB);
  await backend.setChecklistDone(SUB, subs[0].row, true, 'Ali');
  fresh();
  await backend.setCollabStepDone(col.id, 2, true, 'Ali');
  fresh();
  await backend.addChecklistItem(SUB, 'Sub susulan', 'Ali');
  fresh();
  const subs2 = await backend.getChecklist(SUB);
  const barisBaru = subs2.filter(i => !i.done)[0].row;
  const restamp = await backend.setChecklistDone(SUB, barisBaru, true, 'Ali');
  ok('backend menandai penanggalan ulang', restamp.stepRestamped === true);
  ok('collabs ikut dikirim balik', Array.isArray(restamp.collabs));
  ok('doneAt proses terisi', /^\d{4}-\d{2}-\d{2}/.test(stepDua(restamp.collabs, col.id).doneAt));
  // Proses yang belum dicentang tidak ikut ditanggali.
  fresh();
  await backend.setCollabStepDone(col.id, 2, false, 'Ali');
  fresh();
  await backend.setChecklistDone(SUB, barisBaru, false, 'Ali');
  fresh();
  ok('proses belum dicentang tidak ditanggali', !(await backend.setChecklistDone(SUB, barisBaru, true, 'Ali')).stepRestamped);
  fresh();
  ok('ceklis task biasa tidak terpengaruh', !(await backend.setChecklistDone('TSK-001', 2, true, 'Ali')).stepRestamped);

  // Stempel waktu ditulis sebagai teks tapi Sheets menyimpannya sebagai NILAI TANGGAL, jadi
  // saat dibaca (UNFORMATTED_VALUE + SERIAL_NUMBER) yang kembali adalah ANGKA SERIAL.
  // Dibaca mentah, tanggalnya jadi "46241.4166…" — persis bug yang membuat tanggal centang
  // tak muncul di produksi. Spreadsheet tiruan tidak meniru pemaksaan tipe itu, jadi serialnya
  // disuntikkan langsung ke sini.
  fresh();
  await backend.setCollabStepDone(col.id, 2, true, 'Ali');
  fresh();
  const serial = (Date.UTC(2026, 7, 7, 10, 12) - Date.UTC(1899, 11, 30)) / 86400000;
  const barisStep = readRange('COLLAB_STEPS!A2:B').findIndex(r => String(r[0]) === col.id && Number(r[1]) === 2) + 2;
  ok('baris proses ketemu di sheet', barisStep >= 2);
  writeRange(`COLLAB_STEPS!H${barisStep}`, [[serial]]);
  fresh();
  const stepSerial = stepDua(await backend.getCollabs(), col.id);
  eq('serial dibaca jadi tanggal terbaca', String(stepSerial.doneAt).slice(0, 10), '2026-08-07');
  ok('bukan angka mentah', !/^\d+\.\d+/.test(String(stepSerial.doneAt)));
  // Ceklis & catatan memakai jalur baca yang sama.
  fresh();
  const ckRow = (await backend.getChecklist(SUB))[0].row;
  writeRange(`CHECKLIST!F${ckRow}`, [[serial]]);
  fresh();
  eq('checkedAt ceklis juga terbaca', String((await backend.getChecklist(SUB))[0].checkedAt).slice(0, 10), '2026-08-07');

  console.log('\nSub-ceklis ikut pindah saat proses disusun ulang:');
  // Sub-ceklis dikunci ke "COL-xxx#<urutan>" sementara urutan dihitung ulang tiap simpan.
  // Tanpa pemetaan ulang, memindahkan proses membuat sub-ceklisnya menempel ke proses SALAH.
  fresh();
  await backend.saveCollab({ title: 'Uji Urutan', platform: 'JadiASN', steps: [
    { order: 1, name: 'Proses A', pic: 'Ali' },
    { order: 2, name: 'Proses B', pic: 'Uma' },
    { order: 3, name: 'Proses C', pic: 'Dhea' }] }, 'Nynda');
  fresh();
  const RU = (await backend.getCollabs()).find(c => c.title === 'Uji Urutan').id;
  await backend.addChecklistItem(`${RU}#1`, 'sub milik A', 'Ali');
  fresh();
  await backend.addChecklistItem(`${RU}#2`, 'sub milik B', 'Uma');
  fresh();
  await backend.addChecklistItem(`${RU}#3`, 'sub milik C', 'Dhea');
  fresh();
  eq('tiap proses punya 1 sub-item', (await backend.getChecklist(`${RU}#2`)).length, 1);
  fresh();
  await backend.saveCollab({ id: RU, title: 'Uji Urutan', platform: 'JadiASN', steps: [
    { order: 1, name: 'Proses C', pic: 'Dhea', srcOrder: 3 },
    { order: 2, name: 'Proses A', pic: 'Ali', srcOrder: 1 },
    { order: 3, name: 'Proses B', pic: 'Uma', srcOrder: 2 }] }, 'Nynda');
  fresh();
  eq('urutan proses berubah', (await backend.getCollabs()).find(c => c.id === RU).steps.map(s => s.name).join('>'), 'Proses C>Proses A>Proses B');
  fresh();
  eq('sub-ceklis ikut ke posisi 1', (await backend.getChecklist(`${RU}#1`)).map(i => i.item).join(), 'sub milik C');
  fresh();
  eq('sub-ceklis ikut ke posisi 2', (await backend.getChecklist(`${RU}#2`)).map(i => i.item).join(), 'sub milik A');
  fresh();
  eq('sub-ceklis ikut ke posisi 3', (await backend.getChecklist(`${RU}#3`)).map(i => i.item).join(), 'sub milik B');
  // Proses dihapus -> sub-ceklisnya dibuang, tak boleh diwarisi proses baru senomor.
  fresh();
  await backend.saveCollab({ id: RU, title: 'Uji Urutan', platform: 'JadiASN', steps: [
    { order: 1, name: 'Proses C', pic: 'Dhea', srcOrder: 1 },
    { order: 2, name: 'Proses Baru', pic: 'Uma', srcOrder: 0 }] }, 'Nynda');
  fresh();
  eq('sub-ceklis yang bertahan ikut', (await backend.getChecklist(`${RU}#1`)).map(i => i.item).join(), 'sub milik C');
  fresh();
  eq('proses BARU tidak mewarisi sub-ceklis orang lain', (await backend.getChecklist(`${RU}#2`)).length, 0);
  fresh();
  eq('sisa sub-ceklis proses terhapus dibuang', (await backend.getChecklist(`${RU}#3`)).length, 0);

  console.log('\nTag per PERAN di komentar (@staff, @magang, ...):');
  fresh();
  const peranDari = {};
  (await backend.getUsers()).forEach(u => { peranDari[u.name] = String(u.role || '').toLowerCase(); });
  const kenaSiapa = async (msg, author) => {
    const semua = Object.keys(peranDari);
    const before = {};
    for (const u of semua) { fresh(); before[u] = (await backend.getNotifications(u)).length; }
    fresh();
    await backend.addComment({ taskId: 'TSK-001', author: author || 'Nynda', message: msg });
    const hit = [];
    for (const u of semua) { fresh(); if ((await backend.getNotifications(u)).length > before[u]) hit.push(u); }
    return hit.sort();
  };
  const vStaff = await kenaSiapa('@staff tolong cek');
  ok('tag @staff kena lebih dari satu', vStaff.length >= 2);
  ok('semuanya berperan Staff', vStaff.every(n => peranDari[n] === 'staff'));
  ok('penulis tak kena sendiri', vStaff.indexOf('Nynda') < 0);
  const vMagang = await kenaSiapa('@magang mohon diselesaikan');
  ok('tag @magang kena anak magang', vMagang.length >= 2 && vMagang.every(n => peranDari[n] === 'magang'));
  ok('staff tidak ikut kena @magang', !vMagang.some(n => peranDari[n] === 'staff'));
  // Parser Vercel dulu berbasis regex tanpa dukungan nama ber-spasi; kini disamakan dgn GAS.
  eq('nama menang atas peran', (await kenaSiapa('@Magang A cek ini')).join(), 'Magang A');
  eq('@dev bukan tag massal', (await kenaSiapa('@dev tolong lihat')).length, 0);
  const vDua = await kenaSiapa('@staff @magang rapat jam 3');
  ok('dua peran sekaligus', vDua.length > vStaff.length && vDua.every(n => peranDari[n] === 'staff' || peranDari[n] === 'magang'));
  const vSemua = await kenaSiapa('@everyone pengumuman');
  ok('@everyone tetap kena semua', vSemua.length >= vDua.length);

  console.log('\nHapus collab: chat & aktivitasnya ikut dibuang:');
  // Nomor collab dipakai ulang (genCollabId = max+1). Tanpa pembersihan, collab BARU
  // menampilkan percakapan milik collab yang sudah dihapus — persis yang dilaporkan user.
  fresh();
  await backend.saveCollab({ title: 'Punya Chat', platform: 'JadiASN',
    steps: [{ order: 1, name: 'Proses', pic: 'Ali' }] }, 'Nynda');
  fresh();
  const KC = (await backend.getCollabs()).find(c => c.title === 'Punya Chat').id;
  await backend.addComment({ taskId: KC, author: 'Ali', message: 'chat lama' });
  fresh();
  await backend.addComment({ taskId: KC, author: 'Uma', message: 'balasan lama' });
  fresh();
  eq('collab punya 2 komentar', (await backend.getComments(KC)).length, 2);
  fresh();
  ok('ada aktivitas utk collab ini', (await backend.getActivityLog(500)).some(a => a.taskId === KC));
  fresh();
  await backend.deleteCollab(KC, 'Nynda');
  fresh();
  eq('komentar ikut terhapus', (await backend.getComments(KC)).length, 0);
  fresh();
  ok('aktivitasnya ikut dibuang', !(await backend.getActivityLog(500)).some(a => a.taskId === KC));
  fresh();
  await backend.saveCollab({ title: 'Collab Bersih', platform: 'JadiASN',
    steps: [{ order: 1, name: 'Proses', pic: 'Ali' }] }, 'Nynda');
  fresh();
  const CB = (await backend.getCollabs()).find(c => c.title === 'Collab Bersih').id;
  eq('nomor collab dipakai ulang', CB, KC);
  fresh();
  eq('collab baru TIDAK mewarisi chat lama', (await backend.getComments(CB)).length, 0);
  fresh();
  ok('jejak hapus tak nyangkut di feed collab baru',
    !(await backend.getActivityLog(500)).some(a => a.taskId === CB && /Collab Delete/.test(a.action)));
  fresh();
  ok('penghapusan tetap tercatat di log global',
    (await backend.getActivityLog(500)).some(a => /Collab Delete/.test(a.action) && String(a.detail).indexOf(KC) >= 0));

  console.log("\nHapus task: ceklis, chat & aktivitasnya ikut dibuang:");
  // Nomor task dipakai ulang (generateTaskId = max+1). Tanpa pembersihan, task BARU
  // mewarisi ceklis & percakapan milik task yang sudah dihapus.
  fresh();
  const mkT = await backend.saveTask({ taskName: 'Task probe', pic: 'Ali', status: 'Todo', priority: 'Normal', stage: 'QC Konten', platform: 'JadiASN', actor: 'Nynda' });
  const PT = mkT.task.id;
  fresh();
  eq('task baru mulai tanpa ceklis warisan', (await backend.getChecklist(PT)).length, 0);
  fresh();
  await backend.addChecklistItem(PT, 'ceklis probe', 'Nynda', 'https://drive.google.com/P');
  fresh();
  await backend.addComment({ taskId: PT, author: 'Nynda', message: 'chat probe' });
  fresh();
  eq('probe punya 1 ceklis', (await backend.getChecklist(PT)).length, 1);
  fresh();
  eq('probe punya 1 komentar', (await backend.getComments(PT)).length, 1);
  fresh();
  await backend.deleteTask(PT, 'Nynda');
  fresh();
  eq('ceklis ikut terhapus', (await backend.getChecklist(PT)).length, 0);
  fresh();
  eq('komentar ikut terhapus', (await backend.getComments(PT)).length, 0);
  fresh();
  ok('aktivitasnya ikut dibuang', !(await backend.getActivityLog(800)).some(a => a.taskId === PT));
  fresh();
  const mkT2 = await backend.saveTask({ taskName: 'Task baru', pic: 'Ali', status: 'Todo', priority: 'Normal', stage: 'QC Konten', platform: 'JadiASN', actor: 'Nynda' });
  eq('nomor task dipakai ulang', mkT2.task.id, PT);
  fresh();
  eq('task baru TIDAK mewarisi ceklis', (await backend.getChecklist(mkT2.task.id)).length, 0);
  fresh();
  eq('task baru TIDAK mewarisi chat', (await backend.getComments(mkT2.task.id)).length, 0);
  fresh();
  ok('penghapusan tetap tercatat di log global', (await backend.getActivityLog(800)).some(a => /Delete Task/.test(a.action) && String(a.detail).indexOf(PT) >= 0));
  fresh();
  await backend.deleteTask(mkT2.task.id, 'Nynda');

  console.log('\nRiwayat status tercatat di kolom tersendiri (ACTIVITY F & G):');
  fresh();
  const st = await backend.saveTask({ taskName: 'Task riwayat', pic: 'Ali', status: 'Todo', priority: 'Normal', stage: 'QC Konten', platform: 'JadiASN', actor: 'Nynda' });
  const stId = st.task.id;
  // Ambil entri log terbaru untuk task ini.
  const lastFor = async (id) => (await backend.getActivityLog(800)).find(a => a.taskId === id);

  fresh();
  const logCreate = await lastFor(stId);
  eq('task baru: status lama kosong', logCreate.statusFrom, '');
  eq('task baru: status baru tercatat', logCreate.statusTo, 'Todo');

  fresh();
  await backend.quickUpdateField(stId, 'status', 'In progress', 'Ali');
  fresh();
  const logMove = await lastFor(stId);
  eq('perpindahan: status lama', logMove.statusFrom, 'Todo');
  eq('perpindahan: status baru', logMove.statusTo, 'In progress');
  ok('kalimat detail lama tetap ada demi tampilan riwayat', /status/i.test(logMove.detail));

  // Menyetel ulang ke nilai yang sama BUKAN perpindahan. Kalau ini ikut tercatat,
  // penghitung riwayat akan membacanya sebagai kejadian baru pada tanggal itu.
  fresh();
  await backend.quickUpdateField(stId, 'status', 'In progress', 'Ali');
  fresh();
  const logSame = await lastFor(stId);
  eq('setel ulang nilai sama: status lama kosong', logSame.statusFrom, '');
  eq('setel ulang nilai sama: status baru kosong', logSame.statusTo, '');

  // Mengubah field NON-status tak boleh mengisi kolom status sama sekali.
  fresh();
  await backend.quickUpdateField(stId, 'priority', 'Urgent', 'Ali');
  fresh();
  const logOther = await lastFor(stId);
  eq('ubah priority: kolom status tetap kosong', logOther.statusTo, '');

  fresh();
  await backend.quickUpdateField(stId, 'status', 'Done', 'Nynda');
  fresh();
  const logDone = await lastFor(stId);
  eq('penyelesaian tercatat terstruktur', logDone.statusTo, 'Done');
  eq('penyelesaian: dari status sebelumnya', logDone.statusFrom, 'In progress');

  // Header sheet lama (A..E) harus ikut dimigrasi tanpa menyentuh baris data.
  fresh();
  SHEETS['ACTIVITY'][0] = ['Timestamp', 'User', 'Action', 'Task ID', 'Detail'];
  const barisSebelum = SHEETS['ACTIVITY'].length;
  await backend.setupTaskTracker();
  eq('header lama dimigrasi: kolom F', SHEETS['ACTIVITY'][0][5], 'Status Lama');
  eq('header lama dimigrasi: kolom G', SHEETS['ACTIVITY'][0][6], 'Status Baru');
  eq('migrasi tak menambah/mengurangi baris data', SHEETS['ACTIVITY'].length, barisSebelum);

  fresh();
  await backend.deleteTask(stId, 'Nynda');

  console.log('\nTanpa sheet USERS -> kembali ke environment variable:');
  SHEETS['USERS'] = [['Nama', 'Peran', 'Aktif']];   // kosongkan isinya
  fresh();
  const bootEmpty = await backend.getBootstrapData({});
  eq('meta.users kosong', bootEmpty.meta.users.length, 0);
  eq('managers dari env', bootEmpty.meta.managers.join(','), 'Nynda');
  eq('approver dari env', bootEmpty.meta.doneApprovers.join(','), 'Nynda,Dhea,Alya');
  fresh();
  eq('Alya boleh Done lewat env', (await backend.quickUpdateField('TSK-004', 'status', 'Done', 'Alya')).success, true);

  console.log(`\n✅ Semua ${passed} assertion lulus.`);
})().catch(e => { console.error('\n❌ GAGAL:', e && e.stack ? e.stack : e); process.exit(1); });
