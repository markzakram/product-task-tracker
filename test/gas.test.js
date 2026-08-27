/**
 * Harness uji untuk gas/Code.gs + gas/Seed.gs.
 * Menjalankan kode Apps Script di Node dengan SpreadsheetApp tiruan yang meniru
 * perilaku asli Sheets — termasuk konversi otomatis string -> Date / TRUE -> boolean,
 * karena justru di situ bug tanggal & centang biasanya muncul.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const GAS_DIR = path.join(__dirname, '..', 'gas');

/* ---------------- Spreadsheet tiruan ---------------- */

// Meniru parsing Sheets: "2026-07-28" jadi Date, "TRUE" jadi boolean, "120" jadi number.
function coerce(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s = String(v);
  if (s === '') return '';
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  if (/^(TRUE|FALSE)$/i.test(s)) return s.toUpperCase() === 'TRUE';
  if (/^-?\d+(\.\d+)?$/.test(s) && s.length < 15) return Number(s);
  return s;
}

function displayOf(v) {
  if (v instanceof Date) {
    const p = n => String(n).padStart(2, '0');
    const base = `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    return (v.getHours() || v.getMinutes()) ? `${base} ${p(v.getHours())}:${p(v.getMinutes())}` : base;
  }
  if (v === true) return 'TRUE';
  if (v === false) return 'FALSE';
  return String(v === null || v === undefined ? '' : v);
}

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet; this.row = row; this.col = col;
    this.numRows = numRows; this.numCols = numCols;
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const row = [];
      for (let c = 0; c < this.numCols; c++) row.push(this.sheet._get(this.row + r, this.col + c));
      out.push(row);
    }
    return out;
  }
  getDisplayValues() { return this.getValues().map(r => r.map(displayOf)); }
  setValues(vals) {
    if (vals.length !== this.numRows) throw new Error(`setValues rows mismatch: got ${vals.length} want ${this.numRows}`);
    for (let r = 0; r < this.numRows; r++) {
      if (vals[r].length !== this.numCols) throw new Error(`setValues cols mismatch row ${r}: got ${vals[r].length} want ${this.numCols}`);
      for (let c = 0; c < this.numCols; c++) this.sheet._set(this.row + r, this.col + c, coerce(vals[r][c]));
    }
    return this;
  }
  setValue(v) { this.sheet._set(this.row, this.col, coerce(v)); return this; }
  clearContent() {
    for (let r = 0; r < this.numRows; r++)
      for (let c = 0; c < this.numCols; c++) this.sheet._set(this.row + r, this.col + c, '');
    return this;
  }
  setDataValidation() { return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
  setFontSize() { return this; }
  setVerticalAlignment() { return this; }
  setNumberFormat() { return this; }
}

class FakeSheet {
  constructor(name) {
    this.name = name; this.cells = new Map();
    this.maxRows = 1000; this.maxCols = 26; this.hidden = false;
  }
  _key(r, c) { return r + ':' + c; }
  _get(r, c) { const v = this.cells.get(this._key(r, c)); return v === undefined ? '' : v; }
  _set(r, c, v) {
    if (v === '' || v === null || v === undefined) this.cells.delete(this._key(r, c));
    else this.cells.set(this._key(r, c), v);
  }
  getName() { return this.name; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  getLastRow() {
    let last = 0;
    for (const k of this.cells.keys()) { const r = +k.split(':')[0]; if (r > last) last = r; }
    return last;
  }
  getLastColumn() {
    let last = 0;
    for (const k of this.cells.keys()) { const c = +k.split(':')[1]; if (c > last) last = c; }
    return last;
  }
  getRange(row, col, numRows, numCols) {
    if (numRows === undefined) { numRows = 1; numCols = 1; }
    if (numCols === undefined) numCols = 1;
    if (row < 1 || col < 1) throw new Error(`getRange out of bounds: row=${row} col=${col}`);
    if (row + numRows - 1 > this.maxRows) throw new Error(`getRange exceeds maxRows on ${this.name}: need ${row + numRows - 1}, have ${this.maxRows}`);
    if (col + numCols - 1 > this.maxCols) throw new Error(`getRange exceeds maxCols on ${this.name}: need ${col + numCols - 1}, have ${this.maxCols}`);
    return new FakeRange(this, row, col, numRows, numCols);
  }
  insertRowsAfter(after, n) { this.maxRows += n; return this; }
  insertColumnsAfter(after, n) { this.maxCols += n; return this; }
  deleteRow(rowNumber) {
    const next = new Map();
    for (const [k, v] of this.cells.entries()) {
      const [r, c] = k.split(':').map(Number);
      if (r === rowNumber) continue;
      next.set((r > rowNumber ? r - 1 : r) + ':' + c, v);
    }
    this.cells = next; this.maxRows -= 1; return this;
  }
  hideSheet() { this.hidden = true; return this; }
  showSheet() { this.hidden = false; return this; }
  isSheetHidden() { return this.hidden; }
  setFrozenRows() { return this; }
  setColumnWidth() { return this; }
}

class FakeSpreadsheet {
  constructor() { this.sheets = []; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new FakeSheet(n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets.slice(); }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/FAKE/edit'; }
  toast() {}
}

/* ---------------- Layanan Apps Script tiruan ---------------- */

const SS = new FakeSpreadsheet();
SS.insertSheet('Main'); // bound script selalu punya minimal 1 sheet

const crypto = require('crypto');
const sandbox = {
  SpreadsheetApp: {
    getActiveSpreadsheet: () => SS,
    openById: () => SS,
    flush: () => {},
    newDataValidation: () => {
      const b = { requireValueInList: () => b, setAllowInvalid: () => b, build: () => ({}) };
      return b;
    },
    getUi: () => { throw new Error('getUi tidak tersedia di harness'); }
  },
  Utilities: {
    formatDate: (d, tz, fmt) => {
      const p = n => String(n).padStart(2, '0');
      return fmt
        .replace('yyyy', d.getFullYear())
        .replace('MM', p(d.getMonth() + 1))
        .replace('dd', p(d.getDate()))
        .replace('HH', p(d.getHours()))
        .replace('mm', p(d.getMinutes()))
        .replace('ss', p(d.getSeconds()));
    },
    computeDigest: (alg, str) => {
      const buf = crypto.createHash('sha256').update(str, 'utf8').digest();
      return Array.from(buf).map(b => (b > 127 ? b - 256 : b)); // GAS mengembalikan byte bertanda
    },
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' }
  },
  Session: { getScriptTimeZone: () => 'Asia/Jakarta' },
  PropertiesService: { getScriptProperties: () => ({ getProperties: () => ({}) }) },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  Logger: { log: () => {} },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/FAKE/exec' }) },
  HtmlService: {
    createHtmlOutputFromFile: () => ({
      getContent: () => fs.readFileSync(path.join(GAS_DIR, 'Index.html'), 'utf8')
    }),
    createHtmlOutput: (html) => {
      const o = { _html: html, setTitle: () => o, addMetaTag: () => o, setXFrameOptionsMode: () => o };
      return o;
    },
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' }
  },
  console
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const code = fs.readFileSync(path.join(GAS_DIR, 'Code.gs'), 'utf8');
const seed = fs.readFileSync(path.join(GAS_DIR, 'Seed.gs'), 'utf8');
vm.runInContext(code, sandbox, { filename: 'Code.gs' });
vm.runInContext(seed, sandbox, { filename: 'Seed.gs' });

/* ---------------- Assertions ---------------- */

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log('  ✓ ' + name); passed++; }
function eq(name, a, b) {
  assert.strictEqual(a, b, `${name} (got=${JSON.stringify(a)} want=${JSON.stringify(b)})`);
  console.log('  ✓ ' + name); passed++;
}
const run = expr => vm.runInContext(expr, sandbox);
const call = (fn, ...args) => {
  sandbox.__args = args;
  return vm.runInContext(`${fn}.apply(null, __args)`, sandbox);
};

const iso = off => {
  const d = new Date(); d.setDate(d.getDate() + off);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

console.log('\n=== 1. Seed data dummy ===');
const seedRes = call('seedDummyData');
ok('seedDummyData sukses', seedRes && seedRes.success === true);
eq('54 task ter-seed', seedRes.counts.task, 54);
eq('6 task kolaborasi ter-seed', seedRes.counts.collab, 6);
ok('ceklis ter-seed (>30)', seedRes.counts.checklist > 30);
ok('komentar ter-seed (>15)', seedRes.counts.comment > 15);
ok('aktivitas ter-seed (>30)', seedRes.counts.activity > 30);
ok('notifikasi ter-seed', seedRes.counts.notif > 5);
ok('link ter-seed', seedRes.counts.link > 10);
ok('catatan ter-seed', seedRes.counts.note > 5);

console.log('\n=== 2. Sheet & penyembunyian ===');
const names = SS.getSheets().map(s => s.name);
['Main', 'OPTIONS', 'COMMENTS', 'ACTIVITY', 'CHECKLIST', 'COLLAB', 'COLLAB_STEPS',
 'NOTIFICATIONS', 'AUTH', 'LINKS', 'DASHBOARDS', 'NOTES'].forEach(n =>
  ok('sheet ' + n + ' ada', names.indexOf(n) >= 0));
ok('Main TERLIHAT', SS.getSheetByName('Main').isSheetHidden() === false);
ok('OPTIONS TERLIHAT', SS.getSheetByName('OPTIONS').isSheetHidden() === false);
['ACTIVITY', 'COMMENTS', 'CHECKLIST', 'COLLAB', 'COLLAB_STEPS', 'NOTIFICATIONS', 'AUTH', 'LINKS', 'DASHBOARDS', 'NOTES']
  .forEach(n => ok('sheet ' + n + ' TERSEMBUNYI', SS.getSheetByName(n).isSheetHidden() === true));

console.log('\n=== 3. Bootstrap (yang dibaca frontend) ===');
const boot = call('getBootstrapData');
eq('bootstrap: 54 task', boot.tasks.length, 54);
eq('bootstrap: 6 collab', boot.collabs.length, 6);
ok('bootstrap: options.status lengkap', boot.options.status.length >= 6);
ok('bootstrap: options.pic lengkap', boot.options.pic.length >= 9);
ok('bootstrap: verbMap terisi (rumus nama task)', Object.keys(boot.options.verbMap).length > 5);
ok('bootstrap: objekMap terisi', Object.keys(boot.options.objekMap).length > 5);
eq('bootstrap: managers default', boot.meta.managers.join(','), 'Manager');
eq('bootstrap: doneApprovers = Manager + Leader', boot.meta.doneApprovers.join(','), 'Manager,Leader Konten,Leader Sistem');
eq('bootstrap: 12 user terdaftar', boot.meta.users.length, 12);
eq('bootstrap: daftar peran', boot.meta.roles.join(','), 'Dev,Manager,Leader,Staff,Magang,Lihat Saja');
ok('bootstrap: activity terbaru di atas', boot.activity.length > 30);
ok('bootstrap: checklistSummary terisi', Object.keys(boot.checklistSummary).length >= 10);
ok('bootstrap: links terisi', boot.links.length > 10);
ok('bootstrap: notes terisi', boot.notes.length > 5);
ok('bootstrap: dashboards terisi', boot.dashboards.length === 3);

console.log('\n=== 4. Ketepatan TANGGAL (titik rawan geser 1 hari) ===');
const t1 = boot.tasks[0];
eq('TSK-001 id', t1.id, 'TSK-001');
eq('TSK-001 createdDate = hari-52', t1.createdDate, iso(-52));
eq('TSK-001 dueDate = hari-40', t1.dueDate, iso(-40));
eq('TSK-001 startDate = createdDate (virtual)', t1.startDate, t1.createdDate);
const dueToday = boot.tasks.filter(t => t.dueDate === iso(0));
ok('ada task jatuh tempo HARI INI', dueToday.length >= 2);
const overdue = boot.tasks.filter(t => t.dueDate < iso(0) && ['Todo', 'In progress', 'Revisi'].indexOf(t.status) >= 0);
ok('ada task OVERDUE (status aktif)', overdue.length >= 4);
const soon = boot.tasks.filter(t => t.dueDate > iso(0) && t.dueDate <= iso(3));
ok('ada task due <= 3 hari', soon.length >= 3);

console.log('\n=== 5. Cakupan fitur di data dummy ===');
const statuses = {}; boot.tasks.forEach(t => statuses[t.status] = (statuses[t.status] || 0) + 1);
['Done', 'In progress', 'Todo', 'Review PM', 'Revisi', 'Hold'].forEach(s =>
  ok('status "' + s + '" ada (' + statuses[s] + ')', statuses[s] > 0));
const prios = {}; boot.tasks.forEach(t => prios[t.priority] = (prios[t.priority] || 0) + 1);
['Urgent', 'High', 'Normal', 'Low'].forEach(p => ok('priority "' + p + '" ada', prios[p] > 0));
const stages = new Set(boot.tasks.map(t => t.stage));
eq('10 stage terpakai', stages.size, 10);
const pics = new Set(boot.tasks.map(t => t.pic));
ok('>=11 PIC terpakai', pics.size >= 11);
ok('ada task lintas divisi (Divisi Tujuan)', boot.tasks.filter(t => t.divisiTujuan).length === 3);
ok('task lintas divisi punya kontak', boot.tasks.filter(t => t.divisiTujuan && t.kontakDivisi).length === 3);
ok('ada task di-mirror ke Lintas Divisi', boot.tasks.filter(t => t.mirror === 'Ya').length === 3);
ok('ada task dgn support', boot.tasks.filter(t => t.support).length >= 15);
ok('ada task dgn rumus nama (verb+objek)', boot.tasks.filter(t => t.verb && t.objek).length >= 25);
ok('ada task dgn catatan PIC', boot.tasks.filter(t => t.picNotes).length >= 10);
ok('ada task dgn catatan PM', boot.tasks.filter(t => t.pmNotes).length >= 10);
ok('semua task punya createdBy', boot.tasks.every(t => !!t.createdBy));

console.log('\n=== 6. Task kolaborasi ===');
const byId = {}; boot.collabs.forEach(c => byId[c.id] = c);
eq('COL-001 judul', byId['COL-001'].title, '5 Paket Tryout & Latsol SNBT 2026');
eq('COL-001 platform multi', byId['COL-001'].platform, 'Cerebrum, JadiASN');
eq('COL-001 tipe', byId['COL-001'].type, 'Tryout/Latsol');
eq('COL-001 warna (Navy)', byId['COL-001'].color, '#1e3a8a');
eq('COL-001 deadline project', byId['COL-001'].deadline, iso(18));
eq('COL-001 punya 5 proses', byId['COL-001'].steps.length, 5);
eq('COL-001 progres 1/5', byId['COL-001'].done + '/' + byId['COL-001'].total, '1/5');
eq('COL-001 status Aktif', byId['COL-001'].status, 'Aktif');
eq('COL-001 proses 1 selesai oleh Leader Konten', byId['COL-001'].steps[0].doneBy, 'Leader Konten');
eq('COL-001 proses 2 PIC Staff Soal', byId['COL-001'].steps[1].pic, 'Staff Soal');
eq('COL-001 proses 2 deadline', byId['COL-001'].steps[1].deadline, iso(2));
ok('COL-001 proses 2 punya catatan', byId['COL-001'].steps[1].note.length > 10);
eq('COL-003 SELESAI (semua proses)', byId['COL-003'].status, 'Selesai');
eq('COL-005 tanpa warna', byId['COL-005'].color, '');
eq('COL-006 TANPA TIPE (kolom "Tanpa Tipe")', byId['COL-006'].type, '');
const types = new Set(boot.collabs.map(c => c.type));
['Course', 'Tryout/Latsol', 'Liveclass', 'Drilling', 'Journey', ''].forEach(t =>
  ok('tipe collab "' + (t || '(kosong)') + '" ada', types.has(t)));
ok('urutan proses rapi 1..n', boot.collabs.every(c => c.steps.every((s, i) => s.order === i + 1)));
ok('doneAt rapi (bukan teks kacau)', boot.collabs.every(c =>
  c.steps.every(s => !s.done || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s.doneAt))));
ok('createdAt collab rapi', boot.collabs.every(c => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(c.createdAt)));

console.log('\n=== 7. Sub-ceklis & aturan kunci main-ceklis ===');
const subLocked = call('getChecklist', 'COL-001#2');
eq('COL-001#2 punya 5 sub-item', subLocked.length, 5);
eq('COL-001#2 baru 2 selesai', subLocked.filter(i => i.done).length, 2);
const subReady = call('getChecklist', 'COL-002#4');
eq('COL-002#4 punya 4 sub-item', subReady.length, 4);
eq('COL-002#4 SEMUA selesai', subReady.filter(i => i.done).length, 4);
// Aturan v1.49: main-ceklis terkunci selama sub-ceklis belum tuntas.
const lockTry = call('setCollabStepDone', 'COL-001', 2, true, 'Staff Soal');
eq('centang proses TERKUNCI (sub 2/5)', lockTry.success, false);
ok('pesan menyebut sisa sub-ceklis', /sub-ceklis/i.test(lockTry.message) && /2\/5/.test(lockTry.message));
const okTry = call('setCollabStepDone', 'COL-002', 4, true, 'Staff QC');
eq('centang proses BOLEH (sub 4/4)', okTry.success, true);
// Proses tanpa sub-ceklis tetap bebas dicentang.
const noSub = call('setCollabStepDone', 'COL-005', 2, true, 'Leader Sistem');
eq('proses tanpa sub-ceklis bebas dicentang', noSub.success, true);
// Undo selalu boleh walau sub belum tuntas.
const undo = call('setCollabStepDone', 'COL-004', 1, false, 'Leader Konten');
eq('batal centang selalu boleh', undo.success, true);
// PIC lain ditolak.
const wrongPic = call('setCollabStepDone', 'COL-001', 3, true, 'Staff Soal');
eq('PIC lain ditolak', wrongPic.success, false);
ok('pesan sebut PIC yang berhak', /Staff QC/.test(wrongPic.message));

console.log('\n=== 7b. Salin sub-ceklis ke proses lain ===');
// Kasus nyata: satu orang menyusun daftar panjang, proses berikutnya meng-QC daftar sama.
const sumberAwal = call('getChecklist', 'COL-001#2');          // 5 item, 2 tercentang
eq('sumber punya 5 item (2 tercentang)', sumberAwal.length, 5);
eq('tujuan COL-001#4 mula-mula kosong', call('getChecklist', 'COL-001#4').length, 0);
const salin = call('copyChecklist', 'COL-001#2', ['COL-001#4'], 'Leader Konten');
eq('salin berhasil', salin.success, true);
eq('jumlah yang disalin dilaporkan', salin.copied, 5);
eq('jumlah proses tujuan dilaporkan', salin.targets, 1);
const hasil = call('getChecklist', 'COL-001#4');
eq('tujuan kini berisi 5 item', hasil.length, 5);
eq('teksnya sama persis', hasil.map(i => i.item).join('|'), sumberAwal.map(i => i.item).join('|'));
// Status centang TIDAK ikut: pekerjaan di proses tujuan memang belum dikerjakan.
eq('semua item masuk BELUM tercentang', hasil.filter(i => i.done).length, 0);
eq('sumber tidak berubah', call('getChecklist', 'COL-001#2').length, 5);
eq('centang sumber tetap 2', call('getChecklist', 'COL-001#2').filter(i => i.done).length, 2);

// Beberapa tujuan sekaligus, satu kali tulis.
const banyak = call('copyChecklist', 'COL-001#2', ['COL-001#5', 'COL-002#1'], 'Leader Konten');
eq('salin ke 2 proses sekaligus', banyak.success, true);
eq('dilaporkan 2 tujuan', banyak.targets, 2);
eq('COL-001#5 terisi', call('getChecklist', 'COL-001#5').length, 5);
eq('COL-002#1 terisi', call('getChecklist', 'COL-002#1').length, 5);

// Menyalin MENAMBAH, bukan menimpa — sengaja, dan panelnya memberi tahu "sudah ada N".
call('copyChecklist', 'COL-001#2', ['COL-001#4'], 'Leader Konten');
eq('salin kedua menambah, bukan menimpa', call('getChecklist', 'COL-001#4').length, 10);

// Penjagaan.
eq('tujuan kosong ditolak', call('copyChecklist', 'COL-001#2', [], 'Leader Konten').success, false);
eq('sumber = tujuan diabaikan', call('copyChecklist', 'COL-001#2', ['COL-001#2'], 'Leader Konten').success, false);
const kosong = call('copyChecklist', 'COL-003#1', ['COL-001#6'], 'Leader Konten');
eq('sumber kosong ditolak', kosong.success, false);
ok('pesannya menjelaskan sumber kosong', /kosong/i.test(kosong.message));
// Sub-ceklis kolaborasi memang SENGAJA fleksibel di server — canEditChecklist_() untuk id
// "COL-xxx#N" mengembalikan true untuk siapa pun yang bernama, sama seperti addChecklistItem.
// Gerbang mode lihat-saja ada di lapis lain: allowlist GUEST_ACTIONS di api/rpc.js (level
// "view" hanya boleh getBootstrapData/getComments/addComment) + stepChecklistEditable() di UI.
eq('konsisten dgn addChecklistItem: server fleksibel', call('copyChecklist', 'COL-001#2', ['COL-001#6'], 'Siapa Saja').success, true);
eq('ringkasan ceklis ikut diperbarui', typeof salin.checklistSummary, 'object');

console.log('\n=== 7c. Tanggal centang, penanggalan ulang, & Manager boleh membatalkan ===');
// Tanggal centang: dicatat tiap kali dicentang, dikosongkan saat dibatalkan.
const stepAwal = call('getCollabs').find(c => c.id === 'COL-005').steps.find(s => s.order === 2);
ok('proses yang dicentang punya doneAt', !!stepAwal.doneAt);
ok('doneAt berformat tanggal rapi', /^\d{4}-\d{2}-\d{2}/.test(stepAwal.doneAt));
call('setCollabStepDone', 'COL-005', 2, false, 'Leader Sistem');
const stepUndo = call('getCollabs').find(c => c.id === 'COL-005').steps.find(s => s.order === 2);
eq('batal centang mengosongkan doneAt', stepUndo.doneAt, '');
eq('batal centang mengosongkan doneBy', stepUndo.doneBy, '');
call('setCollabStepDone', 'COL-005', 2, true, 'Leader Sistem');
const stepUlang = call('getCollabs').find(c => c.id === 'COL-005').steps.find(s => s.order === 2);
ok('centang ulang mengisi doneAt lagi', /^\d{4}-\d{2}-\d{2}/.test(stepUlang.doneAt));
eq('centang ulang mencatat pencentangnya', stepUlang.doneBy, 'Leader Sistem');

// Penanggalan ulang: sub-item ditambahkan SETELAH proses dicentang, lalu dituntaskan.
const cek = call('getChecklist', 'COL-002#4');                   // 4/4 selesai
eq('COL-002#4 sub-ceklis tuntas', cek.filter(i => i.done).length, 4);
call('setCollabStepDone', 'COL-002', 4, true, 'Staff QC');
const sebelum = call('getCollabs').find(c => c.id === 'COL-002').steps.find(s => s.order === 4);
ok('proses tercentang', sebelum.done);
call('addChecklistItem', 'COL-002#4', 'Item susulan', 'Staff QC');
const belum = call('getChecklist', 'COL-002#4');
eq('sub jadi 4/5 (ada yang belum)', belum.filter(i => !i.done).length, 1);
const barisBaru = belum.filter(i => !i.done)[0].row;
const tuntas = call('setChecklistDone', 'COL-002#4', barisBaru, true, 'Staff QC');
eq('item susulan dicentang', tuntas.success, true);
ok('backend menandai penanggalan ulang', tuntas.stepRestamped === true);
ok('collabs ikut dikirim balik', Array.isArray(tuntas.collabs));
const sesudah = tuntas.collabs.find(c => c.id === 'COL-002').steps.find(s => s.order === 4);
ok('doneAt proses diperbarui', /^\d{4}-\d{2}-\d{2}/.test(sesudah.doneAt));
eq('prosesnya tetap tercentang', sesudah.done, true);
// Proses yang BELUM dicentang tidak ikut ditandai — mencentang tetap tindakan PIC-nya.
call('setCollabStepDone', 'COL-002', 4, false, 'Staff QC');
const tanpa = call('setChecklistDone', 'COL-002#4', barisBaru, false, 'Staff QC');
const tanpa2 = call('setChecklistDone', 'COL-002#4', barisBaru, true, 'Staff QC');
ok('proses belum dicentang tidak ditanggali', !tanpa2.stepRestamped);
ok('sub-ceklis biasa (task non-collab) aman', !call('setChecklistDone', 'TSK-001', 2, true, 'Manager').stepRestamped);

// Manager boleh MEMBATALKAN centang, tapi tidak boleh mencentang milik orang lain.
call('setCollabStepDone', 'COL-005', 2, true, 'Leader Sistem');
const mgrUndo = call('setCollabStepDone', 'COL-005', 2, false, 'Manager');
eq('Manager BOLEH membatalkan centang', mgrUndo.success, true);
const mgrCheck = call('setCollabStepDone', 'COL-005', 2, true, 'Manager');
eq('Manager TIDAK boleh mencentang milik orang lain', mgrCheck.success, false);
ok('pesannya menyebut PIC yang berhak', /Leader Sistem/.test(mgrCheck.message));
const staffUndo = call('setCollabStepDone', 'COL-001', 1, false, 'Staff Soal');
eq('Staff tetap tak boleh membatalkan punya orang lain', staffUndo.success, false);
ok('pesan batal menyebut Manager', /Manager/.test(staffUndo.message));

console.log('\n=== 7d. Stage OPSIONAL per PROSES (bukan per kartu) ===');
// Satu kolaborasi bisa memuat proses ber-stage berbeda; sebagian boleh tanpa stage.
const colStage = call('saveCollab', { title: 'Uji Stage', platform: 'JadiASN',
  steps: [{ order: 1, name: 'Langkah 1', pic: 'Staff Soal', stage: 'QC Konten' },
          { order: 2, name: 'Langkah 2', pic: 'Staff QC', stage: 'Input Soal' },
          { order: 3, name: 'Langkah 3', pic: 'Staff Soal' }] }, 'Manager');
eq('simpan dgn stage per proses berhasil', colStage.success, true);
const dgnStage = call('getCollabs').find(c => c.title === 'Uji Stage');
eq('stage proses 1 tersimpan', dgnStage.steps.find(s => s.order === 1).stage, 'QC Konten');
eq('stage proses 2 berbeda & tersimpan', dgnStage.steps.find(s => s.order === 2).stage, 'Input Soal');
eq('proses tanpa stage = string kosong', dgnStage.steps.find(s => s.order === 3).stage, '');
ok('stage TIDAK lagi di level kartu', dgnStage.stage === undefined);
// Proses lama (di-seed sebelum kolom J ada) tetap terbaca.
eq('proses lama tanpa kolom stage aman', call('getCollabs').find(c => c.id === 'COL-001').steps[0].stage, '');
const ubah = call('saveCollab', { id: dgnStage.id, title: 'Uji Stage', platform: 'JadiASN',
  steps: [{ order: 1, name: 'Langkah 1', pic: 'Staff Soal', stage: '' }] }, 'Manager');
eq('stage boleh dikosongkan lagi', ubah.success, true);
eq('stage kembali kosong', call('getCollabs').find(c => c.title === 'Uji Stage').steps[0].stage, '');
ok('header sheet COLLAB_STEPS memuat Stage', SS.getSheetByName('COLLAB_STEPS').getRange(1, 10, 1, 1).getValues()[0][0] === 'Stage');
ok('header sheet COLLAB TIDAK lagi punya Stage', SS.getSheetByName('COLLAB').getRange(1, 10, 1, 1).getValues()[0][0] !== 'Stage');
call('deleteCollab', dgnStage.id, 'Manager');

console.log('\n=== 7e. Sub-ceklis ikut pindah saat proses disusun ulang ===');
// Sub-ceklis dikunci ke "COL-xxx#<urutan>", sedangkan urutan dihitung ulang tiap simpan.
// Tanpa pemetaan ulang, memindahkan proses membuat sub-ceklisnya tertinggal di nomor lama
// dan menempel ke proses yang SALAH — inilah yang dilaporkan user.
const ru = call('saveCollab', { title: 'Uji Urutan', platform: 'JadiASN', steps: [
  { order: 1, name: 'Proses A', pic: 'Staff Soal' },
  { order: 2, name: 'Proses B', pic: 'Staff QC' },
  { order: 3, name: 'Proses C', pic: 'Staff Data' }] }, 'Manager');
eq('collab uji dibuat', ru.success, true);
const RU = call('getCollabs').find(c => c.title === 'Uji Urutan').id;
call('addChecklistItem', RU + '#1', 'sub milik A', 'Staff Soal');
call('addChecklistItem', RU + '#2', 'sub milik B', 'Staff QC');
call('addChecklistItem', RU + '#3', 'sub milik C', 'Staff Data');
eq('tiap proses punya 1 sub-item', call('getChecklist', RU + '#2').length, 1);

// Susun ulang: C naik ke posisi 1, A ke 2, B ke 3. srcOrder menandai asalnya.
call('saveCollab', { id: RU, title: 'Uji Urutan', platform: 'JadiASN', steps: [
  { order: 1, name: 'Proses C', pic: 'Staff Data', srcOrder: 3 },
  { order: 2, name: 'Proses A', pic: 'Staff Soal', srcOrder: 1 },
  { order: 3, name: 'Proses B', pic: 'Staff QC', srcOrder: 2 }] }, 'Manager');
const su = call('getCollabs').find(c => c.id === RU);
eq('urutan proses berubah', su.steps.map(s => s.name).join('>'), 'Proses C>Proses A>Proses B');
eq('sub-ceklis ikut ke posisi 1', call('getChecklist', RU + '#1').map(i => i.item).join(), 'sub milik C');
eq('sub-ceklis ikut ke posisi 2', call('getChecklist', RU + '#2').map(i => i.item).join(), 'sub milik A');
eq('sub-ceklis ikut ke posisi 3', call('getChecklist', RU + '#3').map(i => i.item).join(), 'sub milik B');
// Catatan & link HASIL milik proses harus ikut berpindah juga, bukan cuma sub-ceklisnya.
call('setCollabStepNote', RU, 1, 'catatan milik C', 'Staff Data');
call('setCollabStepLink', RU, 1, 'https://drive.google.com/MILIK-C', 'Staff Data');
call('saveCollab', { id: RU, title: 'Uji Urutan', platform: 'JadiASN', steps: [
  { order: 1, name: 'Proses A', pic: 'Staff Soal', srcOrder: 2 },
  { order: 2, name: 'Proses C', pic: 'Staff Data', srcOrder: 1 },
  { order: 3, name: 'Proses B', pic: 'Staff QC', srcOrder: 3 }] }, 'Manager');
const geser = call('getCollabs').find(function(c){ return c.id === RU; }).steps;
eq('Proses C pindah ke posisi 2', geser[1].name, 'Proses C');
eq('catatan ikut berpindah', geser[1].note, 'catatan milik C');
eq('link hasil ikut berpindah', geser[1].link, 'https://drive.google.com/MILIK-C');
eq('posisi 1 tidak mewarisi catatan orang lain', geser[0].note, '');
eq('posisi 1 tidak mewarisi link orang lain', geser[0].link, '');
eq('sub-ceklis pun ikut ke posisi 2', call('getChecklist', RU + '#2').map(function(x){return x.item;}).join(), 'sub milik C');
// Kembalikan susunan seperti sebelum blok ini, supaya pemeriksaan berikutnya tetap sahih.
call('saveCollab', { id: RU, title: 'Uji Urutan', platform: 'JadiASN', steps: [
  { order: 1, name: 'Proses C', pic: 'Staff Data', srcOrder: 2 },
  { order: 2, name: 'Proses A', pic: 'Staff Soal', srcOrder: 1 },
  { order: 3, name: 'Proses B', pic: 'Staff QC', srcOrder: 3 }] }, 'Manager');
eq('susunan dikembalikan', call('getChecklist', RU + '#1').map(function(x){return x.item;}).join(), 'sub milik C');



// Proses dihapus: sub-ceklisnya ikut dibuang, tak boleh diwarisi proses baru di nomor itu.
call('saveCollab', { id: RU, title: 'Uji Urutan', platform: 'JadiASN', steps: [
  { order: 1, name: 'Proses C', pic: 'Staff Data', srcOrder: 1 },
  { order: 2, name: 'Proses Baru', pic: 'Staff QC', srcOrder: 0 }] }, 'Manager');
eq('proses tersisa 2', call('getCollabs').find(c => c.id === RU).steps.length, 2);
eq('sub-ceklis proses bertahan ikut', call('getChecklist', RU + '#1').map(i => i.item).join(), 'sub milik C');
eq('proses BARU tidak mewarisi sub-ceklis orang lain', call('getChecklist', RU + '#2').length, 0);
eq('sisa sub-ceklis proses terhapus dibuang', call('getChecklist', RU + '#3').length, 0);
// Menghapus collab harus ikut membuang sub-ceklisnya. Nomor collab dipakai ulang
// (genCollabId_ = max+1), jadi kalau menggantung, collab BARU mewarisi sub-ceklis
// milik collab yang sudah dihapus — ditemukan lewat tes, bukan kebetulan.
call('addChecklistItem', RU + '#1', 'sisa yg harus ikut terhapus', 'Staff Data');
ok('collab uji punya sub-ceklis sebelum dihapus', call('getChecklist', RU + '#1').length >= 1);
call('deleteCollab', RU, 'Manager');
eq('sub-ceklis ikut terhapus bersama collab', call('getChecklist', RU + '#1').length, 0);
const daurUlang = call('saveCollab', { title: 'Pemakai Nomor Bekas', platform: 'JadiASN',
  steps: [{ order: 1, name: 'Proses baru', pic: 'Staff Soal' }] }, 'Manager');
const DU = call('getCollabs').find(c => c.title === 'Pemakai Nomor Bekas').id;
eq('nomor collab memang dipakai ulang', DU, RU);
eq('collab baru TIDAK mewarisi sub-ceklis lama', call('getChecklist', DU + '#1').length, 0);
call('deleteCollab', DU, 'Manager');

// Kasus yang dilaporkan user: komentar collab lama muncul di collab baru bernomor sama.
const kc = call('saveCollab', { title: 'Punya Chat', platform: 'JadiASN',
  steps: [{ order: 1, name: 'Proses', pic: 'Staff Soal' }] }, 'Manager');
const KC = call('getCollabs').find(c => c.title === 'Punya Chat').id;
call('addComment', { taskId: KC, author: 'Staff Soal', message: 'halo ini chat lama @Staff Data' });
call('addComment', { taskId: KC, author: 'Staff Data', message: 'balasan lama' });
eq('collab punya 2 komentar', call('getComments', KC).length, 2);
ok('ada aktivitas tercatat utk collab ini', call('getActivityLog', 500).some(a => a.taskId === KC));
call('deleteCollab', KC, 'Manager');
eq('komentar ikut terhapus', call('getComments', KC).length, 0);
ok('aktivitas collab itu ikut dibuang', !call('getActivityLog', 500).some(a => a.taskId === KC));
// Collab BARU dgn nomor bekas harus benar-benar bersih.
call('saveCollab', { title: 'Collab Bersih', platform: 'JadiASN',
  steps: [{ order: 1, name: 'Proses', pic: 'Staff Soal' }] }, 'Manager');
const CB = call('getCollabs').find(c => c.title === 'Collab Bersih').id;
eq('nomornya memang dipakai ulang lagi', CB, KC);
eq('collab baru TIDAK mewarisi chat lama', call('getComments', CB).length, 0);
ok('jejak "Collab Delete" tak nyangkut di feed-nya', !call('getActivityLog', 500).some(a => a.taskId === CB && /Collab Delete/.test(a.action)));
ok('penghapusan tetap tercatat di log global', call('getActivityLog', 500).some(a => /Collab Delete/.test(a.action) && String(a.detail).indexOf(KC) >= 0));
call('deleteCollab', CB, 'Manager');

console.log("\n=== 7e-2. Sisip proses BARU di atas: semua turun, sub-ceklis ikut ===");
// Berbeda dari 7e (menukar urutan): di sini SEMUA proses bergeser turun satu langkah.
// Kalau kunci sub-ceklis tak ikut dipetakan, sub milik A akan mendarat di proses BARU.
const sp = call('saveCollab', { title: 'Uji Sisip', platform: 'JadiASN', steps: [
  { order: 1, name: 'Proses A', pic: 'Staff Soal' },
  { order: 2, name: 'Proses B', pic: 'Staff QC' },
  { order: 3, name: 'Proses C', pic: 'Staff Data' }] }, 'Manager');
eq('collab uji sisip dibuat', sp.success, true);
const SP = call('getCollabs').find(function(c){ return c.title === 'Uji Sisip'; }).id;
call('addChecklistItem', SP + '#1', 'sub A', 'Staff Soal');
call('addChecklistItem', SP + '#2', 'sub B', 'Staff QC');
call('addChecklistItem', SP + '#3', 'sub C', 'Staff Data');
call('setCollabStepNote', SP, 2, 'catatan B', 'Staff QC');
call('setCollabStepLink', SP, 2, 'https://drive.google.com/LINK-B', 'Staff QC');
// Sisipkan proses baru di posisi 1 -> A,B,C turun jadi 2,3,4.
call('saveCollab', { id: SP, title: 'Uji Sisip', platform: 'JadiASN', steps: [
  { order: 1, name: 'Proses BARU', pic: 'Manager', srcOrder: 0 },
  { order: 2, name: 'Proses A', pic: 'Staff Soal', srcOrder: 1 },
  { order: 3, name: 'Proses B', pic: 'Staff QC', srcOrder: 2 },
  { order: 4, name: 'Proses C', pic: 'Staff Data', srcOrder: 3 }] }, 'Manager');
const stS = call('getCollabs').find(function(c){ return c.id === SP; }).steps;
eq('urutan bergeser turun', stS.map(function(s){ return s.name; }).join('>'), 'Proses BARU>Proses A>Proses B>Proses C');
eq('proses BARU tidak mewarisi sub-ceklis', call('getChecklist', SP + '#1').length, 0);
eq('sub A ikut turun ke #2', call('getChecklist', SP + '#2').map(function(x){return x.item;}).join(), 'sub A');
eq('sub B ikut turun ke #3', call('getChecklist', SP + '#3').map(function(x){return x.item;}).join(), 'sub B');
eq('sub C ikut turun ke #4', call('getChecklist', SP + '#4').map(function(x){return x.item;}).join(), 'sub C');
eq('catatan B ikut prosesnya', stS[2].note, 'catatan B');
eq('link hasil B ikut prosesnya', stS[2].link, 'https://drive.google.com/LINK-B');
eq('proses BARU tanpa catatan warisan', stS[0].note, '');
eq('proses BARU tanpa link warisan', stS[0].link, '');
// Sisip di TENGAH juga: A tetap #1, BARU2 masuk #2, sisanya turun.
call('saveCollab', { id: SP, title: 'Uji Sisip', platform: 'JadiASN', steps: [
  { order: 1, name: 'Proses BARU', pic: 'Manager', srcOrder: 1 },
  { order: 2, name: 'Proses BARU2', pic: 'Manager', srcOrder: 0 },
  { order: 3, name: 'Proses A', pic: 'Staff Soal', srcOrder: 2 },
  { order: 4, name: 'Proses B', pic: 'Staff QC', srcOrder: 3 },
  { order: 5, name: 'Proses C', pic: 'Staff Data', srcOrder: 4 }] }, 'Manager');
eq('sisip di tengah: BARU2 bersih', call('getChecklist', SP + '#2').length, 0);
eq('sisip di tengah: sub A di #3', call('getChecklist', SP + '#3').map(function(x){return x.item;}).join(), 'sub A');
eq('sisip di tengah: sub C di #5', call('getChecklist', SP + '#5').map(function(x){return x.item;}).join(), 'sub C');
call('deleteCollab', SP, 'Manager');

console.log('\n=== 7f. Proses kolaborasi ber-PIC PERAN (milik bersama) ===');
const kb = call('saveCollab', { title: 'Kolaborasi Bersama', platform: 'JadiASN', steps: [
  { order: 1, name: 'Kerjakan bareng', pic: '@Magang' },
  { order: 2, name: 'QC oleh staff', pic: '@Staff' }] }, 'Manager');
eq('collab ber-PIC peran tersimpan', kb.success, true);
const KB = call('getCollabs').find(c => c.title === 'Kolaborasi Bersama').id;
eq('PIC proses tersimpan sbg peran', call('getCollabs').find(c => c.id === KB).steps[0].pic, '@Magang');
// Siapa pun berperan itu boleh mencentang; yang bukan, ditolak.
eq('Magang Konten boleh centang proses magang', call('setCollabStepDone', KB, 1, true, 'Magang Konten').success, true);
eq('Magang Data juga boleh (milik bersama)', call('setCollabStepDone', KB, 1, false, 'Magang Data').success, true);
const tolak = call('setCollabStepDone', KB, 1, true, 'Staff Soal');
eq('Staff ditolak di proses magang', tolak.success, false);
eq('Staff boleh centang proses staff', call('setCollabStepDone', KB, 2, true, 'Staff Soal').success, true);
eq('Staff lain juga boleh', call('setCollabStepDone', KB, 2, false, 'Staff Data').success, true);
// Manager tetap boleh MEMBATALKAN, tapi tidak mencentang milik peran lain.
call('setCollabStepDone', KB, 1, true, 'Magang Konten');
eq('Manager boleh batalkan centang', call('setCollabStepDone', KB, 1, false, 'Manager').success, true);
eq('Manager tak boleh mencentangnya', call('setCollabStepDone', KB, 1, true, 'Manager').success, false);
call('deleteCollab', KB, 'Manager');

console.log("\n=== 7g. Lampiran link: proses & sub-ceklis ===");
// Proses beruntun boleh membawa tautan hasil (opsional).
const lk = call('saveCollab', { title: 'Uji Link', platform: 'JadiASN',
  steps: [{ order: 1, name: 'Kerjakan', pic: 'Staff Soal', link: 'https://drive.google.com/folders/abc' },
          { order: 2, name: 'Tanpa link', pic: 'Staff Data' }] }, 'Manager');
eq('collab dgn link proses tersimpan', lk.success, true);
const LK = call('getCollabs').find(c => c.title === 'Uji Link').id;
const stepsLK = call('getCollabs').find(c => c.id === LK).steps;
eq('link proses tersimpan', stepsLK[0].link, 'https://drive.google.com/folders/abc');
eq('proses tanpa link = string kosong', stepsLK[1].link, '');

call('addChecklistItem', LK + '#1', 'Rekap hasil', 'Staff Soal', 'https://docs.google.com/d/xyz');
call('addChecklistItem', LK + '#1', 'Tanpa lampiran', 'Staff Soal');
const subLK = call('getChecklist', LK + '#1');
eq('sub-item pertama punya link', subLK[0].link, 'https://docs.google.com/d/xyz');
eq('sub-item kedua tanpa link', subLK[1].link, '');
eq('lampiran bisa dipasang belakangan', call('setChecklistLink', LK + '#1', subLK[1].row, 'https://drive.google.com/x', 'Staff Soal').success, true);
eq('tersimpan', call('getChecklist', LK + '#1')[1].link, 'https://drive.google.com/x');
call('setChecklistLink', LK + '#1', subLK[1].row, '', 'Staff Soal');
eq('dikosongkan = lampiran dicabut', call('getChecklist', LK + '#1')[1].link, '');
// Mencentang TIDAK boleh menghapus lampiran (kolom G tak ikut ditulis).
call('setChecklistDone', LK + '#1', subLK[0].row, true, 'Staff Soal');
eq('centang tak menghapus lampiran', call('getChecklist', LK + '#1')[0].link, 'https://docs.google.com/d/xyz');
// Menyalin sub-ceklis ikut membawa lampirannya.
call('copyChecklist', LK + '#1', [LK + '#2'], 'Staff Soal');
eq('salin membawa lampiran', call('getChecklist', LK + '#2')[0].link, 'https://docs.google.com/d/xyz');
eq('link terlalu panjang ditolak', call('setChecklistLink', LK + '#1', subLK[0].row, new Array(502).join('x'), 'Staff Soal').success, false);
ok('header CHECKLIST punya kolom Link', SS.getSheetByName('CHECKLIST').getRange(1, 7, 1, 1).getValues()[0][0] === 'Link');
ok('header COLLAB_STEPS punya kolom Link', SS.getSheetByName('COLLAB_STEPS').getRange(1, 11, 1, 1).getValues()[0][0] === 'Link');
// PIC proses harus bisa menautkan hasilnya SENDIRI, tanpa menunggu manager membuka Edit.
eq('PIC proses boleh isi link hasil', call('setCollabStepLink', LK, 2, 'https://drive.google.com/PIC', 'Staff Data').success, true);
eq('tersimpan', call('getCollabs').find(c => c.id === LK).steps[1].link, 'https://drive.google.com/PIC');
eq('Manager juga boleh', call('setCollabStepLink', LK, 2, 'https://drive.google.com/MGR', 'Manager').success, true);
const tolakLink = call('setCollabStepLink', LK, 2, 'https://x.com/a', 'Staff Soal');
eq('orang lain ditolak', tolakLink.success, false);
ok('pesannya menyebut PIC yang berhak', /Staff Data/.test(tolakLink.message));
eq('link proses terlalu panjang ditolak', call('setCollabStepLink', LK, 2, new Array(502).join('x'), 'Manager').success, false);
eq('dikosongkan = link dicabut', call('setCollabStepLink', LK, 2, '', 'Manager').success, true);
eq('benar-benar kosong', call('getCollabs').find(c => c.id === LK).steps[1].link, '');
// Manager menyimpan collab TANPA menyebut link -> link yang sudah ada tidak boleh hilang.
call('setCollabStepLink', LK, 1, 'https://drive.google.com/TETAP', 'Manager');
call('saveCollab', { id: LK, title: 'Uji Link', platform: 'JadiASN', steps: [
  { order: 1, name: 'Kerjakan', pic: 'Staff Soal', srcOrder: 1 },
  { order: 2, name: 'Tanpa link', pic: 'Staff Data', srcOrder: 2 }] }, 'Manager');
eq('simpan tanpa sebut link tak menimpanya', call('getCollabs').find(c => c.id === LK).steps[0].link, 'https://drive.google.com/TETAP');

call('deleteCollab', LK, 'Manager');

console.log('\n=== 8. Gerbang status "Done" ===');
const denied = call('quickUpdateField', 'TSK-028', 'status', 'Done', 'Staff Soal');
eq('Staff Soal TIDAK boleh set Done', denied.success, false);
ok('pesan Done menyebut approver', /Manager, Leader Konten, Leader Sistem/.test(denied.message));
const allowedD = call('quickUpdateField', 'TSK-028', 'status', 'Done', 'Leader Konten');
eq('Leader BOLEH set Done', allowedD.success, true);
eq('status tersimpan = Done', allowedD.task.status, 'Done');
const allowedN = call('quickUpdateField', 'TSK-029', 'status', 'Done', 'Manager');
eq('Manager (manager) boleh set Done', allowedN.success, true);
const pull = call('quickUpdateField', 'TSK-028', 'status', 'Revisi', 'Staff Soal');
eq('menarik balik dari Done boleh siapa saja', pull.success, true);
const saveDenied = call('saveTask', { id: 'TSK-030', taskName: 'Coba Done via form', status: 'Done', actor: 'Staff QC' });
eq('saveTask ke Done oleh non-approver ditolak', saveDenied.success, false);

console.log('\n=== 9. Tulis data: task baru, ceklis, komentar ===');
const before = call('getTasks').length;
const created = call('saveTask', {
  taskName: 'Task uji dari aplikasi', status: 'Todo', priority: 'High', stage: 'RnD',
  platform: 'Cerebrum', pic: 'Staff Data', support: ['Staff QC', 'Staff Input'], dueDate: iso(5), actor: 'Manager'
});
eq('saveTask sukses', created.success, true);
eq('ID baru berurutan TSK-055', created.task.id, 'TSK-055');
eq('total task bertambah', call('getTasks').length, before + 1);
eq('support array -> teks', created.task.support, 'Staff QC, Staff Input');
eq('dueDate tersimpan benar', created.task.dueDate, iso(5));
eq('createdBy = actor', created.task.createdBy, 'Manager');
eq('createdDate = hari ini', created.task.createdDate, iso(0));

const addCk = call('addChecklistItem', 'TSK-055', 'Item ceklis uji', 'Staff Data');
eq('tambah ceklis oleh PIC sukses', addCk.success, true);
eq('ceklis TSK-055 = 1 item', addCk.checklist.length, 1);
const ckRow = addCk.checklist[0].row;
const setCk = call('setChecklistDone', 'TSK-055', ckRow, true, 'Staff Data');
eq('centang ceklis sukses', setCk.success, true);
eq('item tercentang', setCk.checklist[0].done, true);
eq('checkedBy tercatat', setCk.checklist[0].checkedBy, 'Staff Data');
ok('checkedAt rapi', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(setCk.checklist[0].checkedAt));
const ckOutsider = call('addChecklistItem', 'TSK-055', 'Item dari orang luar', 'Leader Sistem');
eq('non-PIC tidak boleh tambah ceklis task', ckOutsider.success, false);
// v1.77.0: yang boleh menghapus item = pembuatnya, Leader, atau Manager.
// Mencentang TIDAK boleh menghapus jejak pembuat (dulu kolom D tertimpa teks item).
eq('createdBy bertahan setelah dicentang', call('getChecklist', 'TSK-055')[0].createdBy, 'Staff Data');
const delOrangLain = call('deleteChecklistItem', 'TSK-055', ckRow, 'Staff Soal');
eq('bukan pembuat & bukan Leader/Manager: DITOLAK', delOrangLain.success, false);
ok('pesannya menyebut pembuatnya', /Staff Data/.test(delOrangLain.message));
const delByPic = call('deleteChecklistItem', 'TSK-055', ckRow, 'Staff Data');
eq('pembuat item BOLEH menghapusnya', delByPic.success, true);
// Leader & Manager tetap boleh menghapus item buatan siapa pun.
const ck2 = call('addChecklistItem', 'TSK-055', 'Item kedua', 'Staff Data');
eq('Leader boleh hapus item orang lain', call('deleteChecklistItem', 'TSK-055', ck2.checklist[ck2.checklist.length-1].row, 'Leader Sistem').success, true);
const ck3 = call('addChecklistItem', 'TSK-055', 'Item ketiga', 'Staff Data');
const delByPm = call('deleteChecklistItem', 'TSK-055', ck3.checklist[ck3.checklist.length-1].row, 'Manager');
eq('PM boleh hapus item ceklis task', delByPm.success, true);

// Data LAMA yang rusak: sebelum 1.77.0, mencentang menimpa kolom D dgn teks item.
// Tiru persis keadaan itu, lalu pastikan PIC tidak terkunci dari item buatannya sendiri.
const ckLama = call('addChecklistItem', 'TSK-055', 'Item lama tercentang', 'Staff Data');
const rowLama = ckLama.checklist[ckLama.checklist.length-1].row;
SS.getSheetByName('CHECKLIST').getRange(rowLama, 4).setValue('Item lama tercentang'); // kolom D tertimpa
eq('kolom D rusak dibaca sbg pembuat tak diketahui',
  call('getChecklist', 'TSK-055').filter(function(x){return x.row===rowLama;})[0].createdBy, '');
eq('orang luar tetap DITOLAK', call('deleteChecklistItem', 'TSK-055', rowLama, 'Staff Soal').success, false);
eq('PIC task boleh hapus item lama itu', call('deleteChecklistItem', 'TSK-055', rowLama, 'Staff Data').success, true);

const cm = call('addComment', { taskId: 'TSK-055', author: 'Manager', message: 'Halo @Staff Data tolong cek ini ya' });
eq('tambah komentar sukses', cm.success, true);
eq('komentar tersimpan', cm.comments.length, 1);
ok('timestamp komentar rapi', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(cm.comments[0].timestamp));
const noti = call('getNotifications', 'Staff Data');
ok('mention @Staff Data menghasilkan notifikasi', noti.some(n => /men-tag Anda/.test(n.text) && n.refId === 'TSK-055'));
const cmAll = call('addComment', { taskId: 'TSK-055', author: 'Manager', message: '@everyone rapat jam 3' });
eq('komentar @everyone sukses', cmAll.success, true);
const notiUma = call('getNotifications', 'Staff QC');
ok('@everyone menotifikasi user lain', notiUma.some(n => /men-tag semua/.test(n.text)));
const notiSelf = call('getNotifications', 'Manager');
ok('penulis tidak menotifikasi dirinya sendiri', !notiSelf.some(n => n.refId === 'TSK-055' && /men-tag semua/.test(n.text)));

// Lampiran link juga berlaku di Ceklis Pengerjaan task biasa (bukan hanya sub-ceklis collab).
const CKT = 'TSK-001';
call('addChecklistItem', CKT, 'Rekap hasil riset', 'Manager', 'https://drive.google.com/TASK-1');
const ckt = call('getChecklist', CKT);
const ckLast = ckt[ckt.length - 1];
eq('item ceklis task menyimpan link', ckLast.link, 'https://drive.google.com/TASK-1');
eq('link ceklis task bisa diubah', call('setChecklistLink', CKT, ckLast.row, 'https://drive.google.com/TASK-2', 'Manager').success, true);
eq('perubahannya tersimpan', call('getChecklist', CKT).filter(function(x){return x.row===ckLast.row;})[0].link, 'https://drive.google.com/TASK-2');
call('setChecklistDone', CKT, ckLast.row, true, 'Manager');
eq('centang tak menghapus lampiran task', call('getChecklist', CKT).filter(function(x){return x.row===ckLast.row;})[0].link, 'https://drive.google.com/TASK-2');
eq('dikosongkan = lampiran dicabut', call('setChecklistLink', CKT, ckLast.row, '', 'Manager').success, true);
eq('benar-benar kosong', call('getChecklist', CKT).filter(function(x){return x.row===ckLast.row;})[0].link, '');
call('deleteChecklistItem', CKT, ckLast.row, 'Manager');

console.log('\n=== 10. Hapus task & baca ulang ===');
const delRes = call('deleteTask', 'TSK-055', 'Manager');
eq('hapus task sukses', delRes.success, true);
eq('jumlah task kembali', delRes.tasks.length, before);
ok('TSK-055 hilang', !delRes.tasks.some(t => t.id === 'TSK-055'));
ok('task lain tidak ikut tergeser', delRes.tasks[0].id === 'TSK-001' && delRes.tasks[9].id === 'TSK-010');

console.log("\n=== 10b. Task dihapus: ceklis & chat-nya ikut dibuang ===");
// Nomor task dipakai ulang (generateTaskId_ = max+1). Tanpa pembersihan, task BARU
// mewarisi ceklis & percakapan milik task yang sudah dihapus — kelas bug yang sama
// dengan sub-ceklis collab, tapi di sisi task biasa.
const pr = call('saveTask', { taskName: 'Task probe', pic: 'Staff Soal', status: 'Todo', priority: 'Normal', stage: 'QC Konten', platform: 'JadiASN', actor: 'Manager' });
const PR = pr.task.id;
eq('task baru mulai TANPA ceklis warisan', call('getChecklist', PR).length, 0);
eq('task baru mulai TANPA chat warisan', call('getComments', PR).length, 0);
call('addChecklistItem', PR, 'ceklis milik task probe', 'Manager', 'https://drive.google.com/PROBE');
call('addComment', { taskId: PR, author: 'Manager', message: 'chat milik task probe' });
eq('probe punya 1 ceklis', call('getChecklist', PR).length, 1);
eq('probe punya 1 komentar', call('getComments', PR).length, 1);
ok('ada aktivitas utk task ini', call('getActivityLog', 800).some(function(a){ return a.taskId === PR; }));
call('deleteTask', PR, 'Manager');
eq('ceklis ikut terhapus', call('getChecklist', PR).length, 0);
eq('komentar ikut terhapus', call('getComments', PR).length, 0);
ok('aktivitasnya ikut dibuang', !call('getActivityLog', 800).some(function(a){ return a.taskId === PR; }));
const pr2 = call('saveTask', { taskName: 'Task baru', pic: 'Staff Soal', status: 'Todo', priority: 'Normal', stage: 'QC Konten', platform: 'JadiASN', actor: 'Manager' });
eq('nomor task memang dipakai ulang', pr2.task.id, PR);
eq('task baru TIDAK mewarisi ceklis', call('getChecklist', pr2.task.id).length, 0);
eq('task baru TIDAK mewarisi chat', call('getComments', pr2.task.id).length, 0);
ok('jejak hapus tak nyangkut di task bernomor sama', !call('getActivityLog', 800).some(function(a){ return a.taskId === pr2.task.id && /Delete Task/.test(a.action); }));
ok('penghapusan tetap tercatat di log global', call('getActivityLog', 800).some(function(a){ return /Delete Task/.test(a.action) && String(a.detail).indexOf(PR) >= 0; }));
call('deleteTask', pr2.task.id, 'Manager');

console.log('\n=== 11. Mode lihat-saja (Lintas Divisi) ===');
const guest = call('getBootstrapData', { viewOnly: true });
eq('tamu hanya lihat task lintas/mirror', guest.tasks.length, 6);
ok('tamu: semua task punya divisiTujuan atau mirror',
  guest.tasks.every(t => t.divisiTujuan || t.mirror === 'Ya'));
eq('tamu: tanpa activity', guest.activity.length, 0);
eq('tamu: tanpa catatan', guest.notes.length, 0);
eq('tamu: tanpa link', guest.links.length, 0);
eq('tamu: flag viewOnly', guest.viewOnly, true);
ok('tamu: dashboards tetap ada', guest.dashboards.length === 3);

console.log('\n=== 12. PIN per-user (hash) ===');
const setPin = call('setUserPin', 'Staff Data', '1234');
eq('set PIN sukses', setPin.success, true);
eq('PIN benar diterima', call('verifyPin', 'Staff Data', '1234').ok, true);
eq('PIN salah ditolak', call('verifyPin', 'Staff Data', '9999').ok, false);
eq('user tanpa PIN bebas masuk', call('verifyPin', 'Staff QC', '').noPin, true);
eq('PIN wajib 4 digit', call('setUserPin', 'Staff Data', '12').success, false);
ok('AUTH tersembunyi', SS.getSheetByName('AUTH').isSheetHidden() === true);
const authRows = SS.getSheetByName('AUTH').getRange(2, 1, 1, 2).getValues();
ok('AUTH menyimpan HASH, bukan PIN mentah',
  String(authRows[0][1]).length === 64 && String(authRows[0][1]).indexOf('1234') < 0);
eq('hapus PIN sukses', call('deleteUserPin', 'Staff Data').removed, true);

console.log('\n=== 13. Laporan mingguan punya angka (bukan nol) ===');
const act = boot.activity;
const weekAgo = iso(-7);
const doneEvents = act.filter(a => /→\s*done/i.test(a.detail) && a.timestamp.slice(0, 10) >= weekAgo);
ok('ada event "→ Done" dalam 7 hari terakhir', doneEvents.length >= 3);
const commentEvents = act.filter(a => a.action.toLowerCase() === 'comment' && a.timestamp.slice(0, 10) >= weekAgo);
ok('ada event komentar dalam 7 hari terakhir', commentEvents.length >= 8);
ok('semua timestamp aktivitas rapi', act.every(a => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(a.timestamp)));

console.log('\n=== 14. Link & catatan per-user ===');
const links = call('getAllLinks');
ok('link punya folder', links.filter(l => l.folder).length >= 8);
ok('link milik >=4 user', new Set(links.map(l => l.user)).size >= 4);
const notes = call('getAllNotes');
ok('catatan milik >=4 user', new Set(notes.map(n => n.user)).size >= 4);
ok('updatedAt catatan rapi', notes.every(n => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(n.updatedAt)));
const rn = call('renameUserFolder', 'Staff Data', 'Dashboard', 'Analytics');
eq('rename folder link sukses', rn.success, true);
eq('2 link Staff Data ikut berganti folder', rn.changed, 2);
ok('folder lama hilang', !call('getAllLinks').some(l => l.user === 'Staff Data' && l.folder === 'Dashboard'));
ok('folder baru terpasang', call('getAllLinks').filter(l => l.user === 'Staff Data' && l.folder === 'Analytics').length === 2);
ok('link user lain tidak tersentuh', call('getAllLinks').filter(l => l.user === 'Manager' && l.folder === 'Kerja').length === 2);
const df = call('deleteUserFolder', 'Staff Data', 'Analytics');
eq('hapus folder = link dipindah ke Umum (tidak terhapus)', df.changed, 2);
ok('link Staff Data tetap ada setelah folder dihapus', call('getAllLinks').filter(l => l.user === 'Staff Data').length === 3);

console.log('\n=== 14b. Mention nama ber-spasi (tidak boleh salah sasaran) ===');
const mentionOf = (msg, author) => {
  const before = {};
  ['Staff Data', 'Staff Soal', 'Staff QC', 'Leader Konten', 'Manager'].forEach(u => before[u] = call('getNotifications', u).length);
  call('addComment', { taskId: 'TSK-001', author: author || 'Manager', message: msg });
  const hit = [];
  Object.keys(before).forEach(u => { if (call('getNotifications', u).length > before[u]) hit.push(u); });
  return hit.sort();
};
eq('@Staff Data hanya kena Staff Data', mentionOf('cek ini @Staff Data ya').join('|'), 'Staff Data');
eq('@Staff Soal hanya kena Staff Soal', mentionOf('tolong @Staff Soal').join('|'), 'Staff Soal');
eq('@Leader Konten kena Leader Konten', mentionOf('@Leader Konten mohon review').join('|'), 'Leader Konten');
eq('dua tag sekaligus', mentionOf('@Staff QC dan @Staff Data tolong').join('|'), 'Staff Data|Staff QC');
// PERUBAHAN PERILAKU (v1.65.0): "@Staff" dulu tak mengenai siapa pun karena ambigu antara
// "Staff Soal"/"Staff Data"/"Staff QC". Sekarang itu TAG PERAN — mengenai semua yang berperan
// Staff. Nama lengkap ber-spasi tetap menang karena lebih spesifik (diuji di bagian 14c).
eq('@Staff kini tag peran, bukan lagi ambigu', mentionOf('halo @Staff tolong cek').join('|'), 'Staff Data|Staff QC|Staff Soal');
ok('@everyone kena banyak orang', mentionOf('@everyone rapat sore').length >= 4);
eq('penulis tak menotifikasi dirinya', mentionOf('@Staff Data catat ya', 'Staff Data').join('|'), '');

console.log('\n=== 14c. Tag per PERAN (@staff, @magang, ...) ===');
const peranDari = {};
call('getUsers').forEach(u => { peranDari[u.name] = String(u.role || '').toLowerCase(); });
const kenaSiapa = (msg, author) => {
  const semua = Object.keys(peranDari);
  const before = {};
  semua.forEach(u => before[u] = call('getNotifications', u).length);
  call('addComment', { taskId: 'TSK-001', author: author || 'Manager', message: msg });
  return semua.filter(u => call('getNotifications', u).length > before[u]).sort();
};

const kenaStaff = kenaSiapa('@staff tolong cek semua');
ok('tag @staff mengenai lebih dari satu orang', kenaStaff.length >= 2);
ok('semuanya benar berperan Staff', kenaStaff.every(n => peranDari[n] === 'staff'));
ok('penulis tak menotifikasi dirinya', kenaStaff.indexOf('Manager') < 0);

const kenaMagang = kenaSiapa('@magang mohon diselesaikan');
ok('tag @magang mengenai anak magang', kenaMagang.length >= 2);
ok('hanya yang berperan Magang', kenaMagang.every(n => peranDari[n] === 'magang'));
ok('tak ada staff yang ikut kena @magang', kenaMagang.indexOf('Staff Soal') < 0);

// Nama lebih spesifik daripada peran: "@Staff Soal" hanya mengenai orangnya.
eq('nama ber-spasi menang atas peran', kenaSiapa('@Staff Soal cek ini').join(), 'Staff Soal');
// Akun teknis & tamu baca-saja tidak boleh jadi tag massal.
eq('@dev bukan tag peran massal', kenaSiapa('@dev tolong lihat').length, 0);

const kenaLeader = kenaSiapa('@leader diskusi dulu', 'Leader Konten');
ok('tag @leader kena leader lain', kenaLeader.length >= 1);
ok('semuanya berperan Leader', kenaLeader.every(n => peranDari[n] === 'leader'));
ok('penulis (Leader Konten) tak kena sendiri', kenaLeader.indexOf('Leader Konten') < 0);

// Dua peran sekaligus dalam satu komentar.
const kenaDua = kenaSiapa('@staff @magang rapat jam 3');
ok('dua peran sekaligus terkumpul', kenaDua.length > kenaStaff.length);
ok('isinya gabungan staff + magang', kenaDua.every(n => peranDari[n] === 'staff' || peranDari[n] === 'magang'));
// Peran + nama pribadi bisa dicampur.
const kenaCampur = kenaSiapa('@magang dan @Leader Konten tolong sinkron');
ok('campuran peran & nama', kenaCampur.indexOf('Leader Konten') >= 0 && kenaCampur.some(n => peranDari[n] === 'magang'));

console.log('\n=== 14d. PIC berupa PERAN (task milik bersama) + jejak pengubah status ===');
const brs = call('saveTask', { taskName: 'Latsol bareng magang', pic: '@Magang', support: ['Staff Soal'], status: 'Todo',
  priority: 'Normal', stage: 'QC Konten', platform: 'JadiASN', actor: 'Manager' });
eq('task milik bersama tersimpan', brs.success, true);
const BRS = brs.task.id;
eq('PIC tersimpan sbg peran', call('getTasks').filter(t => t.id === BRS)[0].pic, '@Magang');
// Semua anak magang memilikinya; karyawan lain tidak.
const tBrs = call('getTasks').filter(t => t.id === BRS)[0];
ok('Magang Konten memiliki task ini', call('ownsTaskActor_', tBrs, 'Magang Konten'));
ok('Magang Data juga memilikinya', call('ownsTaskActor_', tBrs, 'Magang Data'));
ok('Staff Soal memilikinya sbg Support', call('ownsTaskActor_', tBrs, 'Staff Soal'));
ok('Staff lain yg tak terlibat TIDAK memilikinya', !call('ownsTaskActor_', tBrs, 'Staff Data'));
// Aturan Done ikut aturan magang: Staff boleh menutup, magang tidak.
ok('dikenali sbg task magang', call('isMagangActor_', '@Magang'));
eq('Magang tak boleh menutup task bersama', call('quickUpdateField', BRS, 'status', 'Done', 'Magang Konten').success, false);
eq('Staff yg bukan Support tak boleh menutup', call('quickUpdateField', BRS, 'status', 'Done', 'Staff Data').success, false);
const tutup = call('quickUpdateField', BRS, 'status', 'Done', 'Staff Soal');
eq('Staff pendamping boleh menutup task bersama', tutup.success, true);

// Jejak pengubah status.
const setelah = call('getTasks').filter(t => t.id === BRS)[0];
ok('tercatat siapa pengubah status', /^Staff Soal • \d{4}-\d{2}-\d{2}/.test(setelah.statusBy));
call('quickUpdateField', BRS, 'status', 'Revisi', 'Manager');
const ubah2 = call('getTasks').filter(t => t.id === BRS)[0];
ok('catatan ikut berganti ke pengubah terakhir', /^Manager • /.test(ubah2.statusBy));
// Menyunting field lain TIDAK boleh mengubah catatan itu.
call('quickUpdateField', BRS, 'priority', 'High', 'Leader Konten');
eq('ubah prioritas tak menyentuh catatan status', call('getTasks').filter(t => t.id === BRS)[0].statusBy, ubah2.statusBy);
call('saveTask', { id: BRS, taskName: 'Judul diganti', pic: '@Magang', status: 'Revisi',
  priority: 'High', stage: 'QC Konten', platform: 'JadiASN', actor: 'Manager' });
eq('simpan tanpa ganti status juga tak menyentuh', call('getTasks').filter(t => t.id === BRS)[0].statusBy, ubah2.statusBy);
// "@Dev" tidak sah sebagai PIC bersama.
eq('@Dev bukan PIC peran', call('rolePicOf_', '@Dev'), '');
eq('nama biasa bukan PIC peran', call('rolePicOf_', 'Magang Konten'), '');
call('deleteTask', BRS, 'Manager');

console.log('\n=== 15. Peran user (Dev / Manager / Leader / Staff) ===');
const users = call('getUsers');
eq('12 user ter-seed', users.length, 12);
ok('semua user aktif', users.every(u => u.active === true));
const roleMap = {}; users.forEach(u => roleMap[u.name] = u.role);
eq('Manager berperan Manager', roleMap['Manager'], 'Manager');
eq('Leader Konten berperan Leader', roleMap['Leader Konten'], 'Leader');
eq('Leader Sistem berperan Leader', roleMap['Leader Sistem'], 'Leader');
eq('Staff Soal berperan Staff', roleMap['Staff Soal'], 'Staff');
eq('Magang Konten berperan Magang', roleMap['Magang Konten'], 'Magang');
eq('Magang Data berperan Magang', roleMap['Magang Data'], 'Magang');
eq('Lintas Divisi berperan Lihat Saja', roleMap['Lintas Divisi'], 'Lihat Saja');
ok('TIDAK ada nama orang asli di daftar user',
  !users.some(u => /nynda|alya|dhea|andika|arifah|bilar|kiki/i.test(u.name)));
// Hak per peran.
eq('Manager boleh setup kolaborasi', call('saveCollab', { title: 'Uji Manager', steps: [{ name: 'a', pic: 'Staff QC' }] }, 'Manager').success, true);
eq('Leader boleh setup kolaborasi', call('saveCollab', { title: 'Uji Leader', steps: [{ name: 'a', pic: 'Staff QC' }] }, 'Leader Sistem').success, true);
eq('Staff TIDAK boleh setup kolaborasi', call('saveCollab', { title: 'Uji Staff', steps: [{ name: 'a', pic: 'Staff QC' }] }, 'Staff Soal').success, false);
eq('Staff TIDAK boleh set Done', call('quickUpdateField', 'TSK-030', 'status', 'Done', 'Staff QC').success, false);
eq('Leader Sistem boleh set Done', call('quickUpdateField', 'TSK-030', 'status', 'Done', 'Leader Sistem').success, true);

console.log('\n=== 15b. Peran Magang: visibilitas & Done berbasis PIC ===');
const T = call('getTasks');
const picOf = id => (T.filter(t => t.id === id)[0] || {}).pic;
const magangTasks = T.filter(t => /^Magang /.test(t.pic)).map(t => t.id);
ok('ada 4 task milik magang', magangTasks.length === 4);

// Gerbang Done di server, dinilai per PIC task.
const tMagang = magangTasks[0];                                   // PIC = Magang Konten
const tKaryawan = T.filter(t => t.pic === 'Staff Soal' && t.status !== 'Done')[0].id;
// Staff BOLEH menutup task magang — inti permintaan.
// v1.72.0: hanya karyawan yang MENDAMPINGI (Support) di task itu yang boleh menutupnya.
// tMagang di data dummy ber-Support 'Staff QC', jadi ia pendampingnya; 'Staff Data' bukan.
eq('Staff yg tak terlibat TIDAK boleh', call('quickUpdateField', tMagang, 'status', 'Done', 'Staff Data').success, false);
const staffDoneMagang = call('quickUpdateField', tMagang, 'status', 'Done', 'Staff QC');
eq('Staff pendamping BOLEH mem-Done-kan task magang', staffDoneMagang.success, true);
// ...tapi TIDAK task karyawan lain.
const staffDoneKaryawan = call('quickUpdateField', tKaryawan, 'status', 'Done', 'Staff QC');
eq('Staff TIDAK boleh mem-Done-kan task karyawan', staffDoneKaryawan.success, false);
// Magang tak boleh menutup apa pun, termasuk task sesama magang & miliknya sendiri.
const magangDoneSendiri = call('quickUpdateField', magangTasks[1], 'status', 'Done', 'Magang Konten');
eq('Magang TIDAK boleh mem-Done-kan task sendiri', magangDoneSendiri.success, false);
ok('pesannya menjelaskan aturan magang', /anak magang/i.test(magangDoneSendiri.message));
eq('Magang TIDAK boleh mem-Done-kan task sesama magang',
  call('quickUpdateField', magangTasks[2], 'status', 'Done', 'Magang Data').success, false);
// Leader & Manager tetap bisa apa pun.
eq('Leader boleh mem-Done-kan task magang', call('quickUpdateField', magangTasks[1], 'status', 'Done', 'Leader Konten').success, true);
eq('Manager boleh mem-Done-kan task karyawan', call('quickUpdateField', tKaryawan, 'status', 'Done', 'Manager').success, true);
// Lewat saveTask (form) juga ditegakkan.
const saveMagangByStaff = call('saveTask', { id: magangTasks[2], taskName: 'Rekap data pendaftar mingguan', pic: 'Magang Data', support: ['Staff Data'], status: 'Done', actor: 'Staff Data' });
eq('saveTask: Staff pendamping boleh menutup', saveMagangByStaff.success, true);
const saveKaryawanByStaff = call('saveTask', { id: 'TSK-020', taskName: 'x', pic: 'Leader Sistem', status: 'Done', actor: 'Staff QC' });
eq('saveTask: Staff tak boleh menutup task karyawan', saveKaryawanByStaff.success, false);
// Magang tidak masuk daftar approver umum.
ok('magang bukan Done-approver', call('getBootstrapData').meta.doneApprovers.every(a => !/^Magang /.test(a)));

console.log('\n=== 16. Kelola user: HANYA Dev (Manager pun tidak boleh) ===');
// Semua peran selain Dev harus ditolak — termasuk Manager.
eq('Staff TIDAK boleh menambah user', call('saveUser', 'Staff Desain', 'Staff', true, 'Staff Soal').success, false);
eq('Leader TIDAK boleh menambah user', call('saveUser', 'Staff Desain', 'Staff', true, 'Leader Konten').success, false);
const addByMgr = call('saveUser', 'Staff Desain', 'Staff', true, 'Manager');
eq('Manager TIDAK boleh menambah user', addByMgr.success, false);
ok('pesannya mengarahkan ke mode Dev', /mode Dev/i.test(addByMgr.message) && /USERS/.test(addByMgr.message));
eq('daftar user tak berubah', call('getUsers').length, 12);

// Dev — satu-satunya yang boleh.
const addByDev = call('saveUser', 'Anak Magang', 'Staff', true, 'Dev');
eq('Dev BOLEH menambah user', addByDev.success, true);
eq('user baru masuk daftar', addByDev.users.length, 13);
ok('user baru otomatis masuk dropdown PIC', (addByDev.options.pic || []).indexOf('Anak Magang') >= 0);
ok('user baru otomatis masuk dropdown Support', (addByDev.options.support || []).indexOf('Anak Magang') >= 0);
eq('user baru berperan Staff', call('getUsers').filter(u => u.name === 'Anak Magang')[0].role, 'Staff');
eq('magang baru belum boleh set Done', call('quickUpdateField', 'TSK-031', 'status', 'Done', 'Anak Magang').success, false);

// Naik/turun peran hanya dari Dev, dan langsung berlaku.
eq('Manager TIDAK boleh mengubah peran', call('saveUser', 'Anak Magang', 'Leader', true, 'Manager').success, false);
eq('Dev boleh menaikkan jadi Leader', call('saveUser', 'Anak Magang', 'Leader', true, 'Dev').success, true);
eq('naik peran langsung berlaku', call('quickUpdateField', 'TSK-031', 'status', 'Done', 'Anak Magang').success, true);
eq('Dev boleh mengangkat Manager', call('saveUser', 'Anak Magang', 'Manager', true, 'Dev').success, true);
eq('peran tersimpan jadi Manager', call('getUsers').filter(u => u.name === 'Anak Magang')[0].role, 'Manager');
eq('Manager baru pun tak bisa kelola user', call('saveUser', 'Orang Lain', 'Staff', true, 'Anak Magang').success, false);
eq('Dev boleh menurunkan lagi', call('saveUser', 'Anak Magang', 'Staff', true, 'Dev').success, true);

// Nonaktif: dipakai saat magang selesai — hak hilang, task lamanya tetap.
eq('Manager TIDAK boleh menonaktifkan', call('saveUser', 'Anak Magang', 'Staff', false, 'Manager').success, false);
eq('Dev boleh menonaktifkan', call('saveUser', 'Anak Magang', 'Leader', false, 'Dev').success, true);
eq('user nonaktif kehilangan hak Done', call('quickUpdateField', 'TSK-032', 'status', 'Done', 'Anak Magang').success, false);
ok('user nonaktif tak masuk daftar approver', call('getBootstrapData').meta.doneApprovers.indexOf('Anak Magang') < 0);

// Validasi.
eq('peran tidak valid ditolak', call('saveUser', 'Staff X', 'Sultan', true, 'Dev').success, false);
eq('nama kosong ditolak', call('saveUser', '', 'Staff', true, 'Dev').success, false);
eq('nama "Dev" tak boleh dipakai sebagai user', call('saveUser', 'Dev', 'Staff', true, 'Dev').success, false);
eq('tidak bisa menghapus diri sendiri', call('deleteUser', 'Dev', 'Dev').success, false);

// Hapus: hanya Dev.
eq('Staff tidak boleh menghapus user', call('deleteUser', 'Anak Magang', 'Staff Soal').success, false);
eq('Manager tidak boleh menghapus user', call('deleteUser', 'Anak Magang', 'Manager').success, false);

// Karyawan tetap yang MASIH AKTIF dilindungi: namanya melekat di task lama, jadi
// mencabutnya dari dropdown PIC akan meninggalkan task yang PIC-nya tak bisa dipilih lagi.
const delAktif = call('deleteUser', 'Staff Soal', 'Dev');
eq('Staff aktif TIDAK bisa dihapus', delAktif.success, false);
ok('pesannya menyuruh nonaktifkan dulu', /Nonaktifkan dulu/.test(delAktif.message || ''));
eq('Manager aktif pun tak bisa dihapus', call('deleteUser', 'Manager', 'Dev').success, false);
ok('yang dilindungi tetap terdaftar', call('getUsers').some(u => u.name === 'Staff Soal'));

// Jalan keluar untuk akun duplikat/salah ketik: "Anak Magang" berperan Leader TAPI
// sudah dinonaktifkan di atas — pengaman dua langkah, jadi sekarang boleh dihapus.
const delUser = call('deleteUser', 'Anak Magang', 'Dev');
eq('karyawan tetap NONAKTIF boleh dihapus', delUser.success, true);
eq('daftar kembali 12 user', delUser.users.length, 12);
// Magang aktif tak perlu dinonaktifkan dulu.
call('saveUser', 'Magang Sementara', 'Magang', true, 'Dev');
eq('Magang aktif langsung boleh dihapus', call('deleteUser', 'Magang Sementara', 'Dev').success, true);
// Inti permintaan: benar-benar hilang dari PIC, bukan cuma dari daftar user.
ok('nama dicabut dari dropdown PIC', (delUser.options.pic || []).indexOf('Anak Magang') < 0);
ok('nama dicabut dari dropdown Support', (delUser.options.support || []).indexOf('Anak Magang') < 0);
ok('pencabutan bertahan saat dibaca ulang', (call('getOptions').pic || []).indexOf('Anak Magang') < 0);
eq('"Dev" tidak bisa dihapus', call('deleteUser', 'Dev', 'Manager Lain').success, false);

// Nama yang cuma nyangkut di dropdown (tanpa baris USERS) tetap sah dibersihkan.
call('saveOption', 'pic', 'Sisa Dropdown', '');
const delSisa = call('deleteUser', 'Sisa Dropdown', 'Dev');
eq('nama sisa di dropdown boleh dihapus', delSisa.success, true);
ok('sisa dropdown benar-benar hilang', (delSisa.options.pic || []).indexOf('Sisa Dropdown') < 0);
eq('nama tak dikenal ditolak', call('deleteUser', 'Hantu', 'Dev').success, false);

console.log('\n=== 16a-2. Ganti nama user (rujukan ikut berpindah) ===');
const baseName_g = v => String(v || '').trim().toLowerCase().replace(/\s*\(.*\)\s*$/, '').trim();
// Siapkan jejak: task sbg PIC, task sbg Support, proses kolaborasi, link, catatan.
call('saveTask', { taskName: 'Task milik Staff Soal', pic: 'Staff Soal', support: ['Staff Data'], status: 'Todo',
  priority: 'Normal', stage: 'QC Konten', platform: 'JadiASN', actor: 'Manager' });
const sblmPic = call('getTasks').filter(t => baseName_g(t.pic) === 'staff soal').length;
ok('Staff Soal punya task sbg PIC', sblmPic >= 1);
const sblmSup = call('getTasks').filter(t => String(t.support || '').split(',').some(s => baseName_g(s) === 'staff data')).length;
ok('Staff Data ada di Support task', sblmSup >= 1);

eq('Manager tak boleh ganti nama', call('renameUser', 'Staff Soal', 'Staff Soalx', 'Manager').success, false);
eq('nama kosong ditolak', call('renameUser', 'Staff Soal', '', 'Dev').success, false);
eq('nama sama ditolak', call('renameUser', 'Staff Soal', 'Staff Soal', 'Dev').success, false);
eq('"Dev" tak boleh dipakai', call('renameUser', 'Staff Soal', 'Dev', 'Dev').success, false);
eq('bentrok nama lain ditolak', call('renameUser', 'Staff Soal', 'Staff Data', 'Dev').success, false);
eq('user tak dikenal ditolak', call('renameUser', 'Hantu', 'Baru', 'Dev').success, false);

const ren = call('renameUser', 'Staff Soal', 'Staf Soal Baru', 'Dev');
eq('Dev boleh mengganti nama', ren.success, true);
ok('jumlah rujukan dilaporkan', ren.renamed >= 1);
eq('nama lama hilang dari daftar user', call('getUsers').filter(u => u.name === 'Staff Soal').length, 0);
eq('nama baru ada di daftar user', call('getUsers').filter(u => u.name === 'Staf Soal Baru').length, 1);
eq('perannya tidak berubah', call('getUsers').filter(u => u.name === 'Staf Soal Baru')[0].role, 'Staff');
// Inti fiturnya: task tidak boleh jadi yatim.
eq('task PIC ikut berpindah', call('getTasks').filter(t => t.pic === 'Staf Soal Baru').length, sblmPic);
eq('tak ada lagi task ber-PIC nama lama', call('getTasks').filter(t => t.pic === 'Staff Soal').length, 0);
// Dropdown ikut diganti supaya nama lama tak bisa dipilih lagi.
ok('nama baru masuk dropdown PIC', (call('getOptions').pic || []).indexOf('Staf Soal Baru') >= 0);
ok('nama lama keluar dari dropdown PIC', (call('getOptions').pic || []).indexOf('Staff Soal') < 0);
// Kembalikan supaya bagian tes berikutnya tetap memakai nama asli.
call('renameUser', 'Staf Soal Baru', 'Staff Soal', 'Dev');
eq('bisa dikembalikan lagi', call('getUsers').filter(u => u.name === 'Staff Soal').length, 1);

console.log('\n=== 16b. UI: panel Kelola User terkunci ke mode Dev ===');
const uiHtml = call('doGet', {})._html;
ok('canManageUsers() memakai isDev()', /function canManageUsers\(\)\{[^}]*isDev\(\)/.test(uiHtml));
ok('canManageUsers() TIDAK memakai isManager()', !/function canManageUsers\(\)\{[^}]*isManager\(/.test(uiHtml));
ok('ada keterangan untuk Manager (userAdminHint)', /id="userAdminHint"/.test(uiHtml));
ok('keterangan menyebut sheet USERS sebagai jalan lain', /userAdminHint[\s\S]{0,700}sheet <b>USERS<\/b>/.test(uiHtml));
ok('panel diberi label MODE DEV', /MODE DEV<\/span>/.test(uiHtml));
ok('peran "Dev" tak bisa dipilih untuk baris user', /assignableRoles\(\)\{[\s\S]{0,200}!=='dev'/.test(uiHtml));
ok('legenda Manager tak lagi menyebut kelola user', /'Manager':'[^']*kelola dropdown/.test(uiHtml));

console.log('\n=== 16c. Komunikasi: cakupan Leader & notifikasi terbaca ===');
const commHtml = call('doGet', {})._html;
// Chat = kotak masuk pribadi. Leader TIDAK ikut melihat semua percakapan.
// Hanya Manager/Dev yang melihat semua task. Leader punya WEWENANG penuh (Done, kolaborasi)
// tapi daftar task-nya sebatas yang ia PIC/Support-nya — sama seperti Staff.
ok('canSeeAllTasks hanya Manager', /function canSeeAllTasks\(user\)\{ return isManager\(user\); \}/.test(commHtml));
ok('Leader TIDAK lagi ikut lihat-semua', !/canSeeAllTasks\(user\)\{ return isManager\(user\) \|\| isLeader\(user\)/.test(commHtml));
ok('scopedTasks memakai canSeeAllTasks', /function scopedTasks\(\)[\s\S]{0,400}?canSeeAllTasks\(state\.currentUser\)/.test(commHtml));
ok('daftar Komunikasi memakai cakupan yang sama', /const arr=scopedTasks\(\)/.test(commHtml));
ok('badge unread dihitung dari scopedTasks', /function totalUnreadTasks\(\)[\s\S]{0,300}?new Set\(scopedTasks\(\)/.test(commHtml));
ok('tak ada lagi cakupan Komunikasi terpisah', !/function commScopedTasks\(\)/.test(commHtml));
// Mode magang: identitas terkunci di cookie, switcher hilang, dan ada tab khusus untuk karyawan.
ok('ada pembungkus cookie identitas magang', /function magangIdentity\(\)\{ return getCookie\('tt_magang_user'\)/.test(commHtml));
ok('pilih identitas magang mengunci ke cookie', /function chooseIdentity\(name\)\{[\s\S]{0,400}?state\.magangMode[\s\S]{0,300}?setCookie\('tt_magang_user'/.test(commHtml));
ok('identitas magang tak bisa dipindah otomatis', /function populateUserSelect\(\)\{[\s\S]{0,600}?state\.magangMode\)\{[\s\S]{0,300}?select\.disabled=true/.test(commHtml));
ok('ganti user ditolak di mode magang', /function requestUserSwitch\(value\)\{[\s\S]{0,300}?state\.magangMode\)\{[\s\S]{0,150}?terkunci/.test(commHtml));
// Kotak Mode User TETAP tampil utk magang (biar tahu masuk sebagai siapa); yang dimatikan
// hanya cara menggantinya — dropdown terkunci + tombol "Ganti identitas" disembunyikan.
ok('kotak Mode User TETAP tampil utk magang', /state\.magangMode\)\{[\s\S]{0,600}?modeUserBox'\); if\(box\) box\.classList\.remove\('hide'\)/.test(commHtml));
ok('applyRoleUI tak lagi menyembunyikannya', !/modeUserBox'\); if\(modeBox\) modeBox\.classList\.toggle\('hide',!!state\.lockView\|\|guest\|\|!!state\.magangMode\)/.test(commHtml));
ok('tombol "Ganti identitas" disembunyikan utk magang', /state\.magangMode\)\{[\s\S]{0,800}?switchIdentityBtn'\); if\(btn\) btn\.classList\.add\('hide'\)/.test(commHtml));
ok('ada keterangan identitas terkunci', /id="magangLockNote"/.test(commHtml) && /Identitas terkunci untuk akun magang/.test(commHtml));
ok('dropdown identitas magang tetap mati', /state\.magangMode\)\{[\s\S]{0,500}?select\.disabled=true/.test(commHtml));
ok('identitas dikirim ke server sbg x-user', /'x-user': magangIdentity\(\)/.test(commHtml));
// v1.72.0: tab "Kerjaan Magang" DICABUT. Salah tafsir permintaan — yang diminta adalah
// aturan siapa yang boleh mem-Done-kan, bukan tab terpisah. Tab itu juga bertabrakan dgn
// v1.70.0 (karyawan hanya melihat task miliknya): ia memperlihatkan semua kerjaan magang
// kepada Staff yang tidak terlibat sama sekali.
ok('tab Kerjaan Magang sudah dicabut', !/id="nav-magang"/.test(commHtml) && !/function renderMagangView\(\)/.test(commHtml));
ok('tak ada sisa fungsi/pemanggilnya', !/updateMagangNavBadge|canSeeMagangView|magangContent/.test(commHtml));
// Gantinya: Staff boleh menutup task magang HANYA bila ia Support di task itu.
ok('Staff harus jadi Support utk menutup task magang', /if\(isStaff\(me\)\) return !task \|\| \(isMagangTask\(task\) && supportNames\(task\)\.some\(s=>same\(s,me\)\)\)/.test(commHtml));
ok('alasannya dicatat di kode', /hanya oleh karyawan yang mendampingi di task itu/.test(commHtml));
ok('kerjaan magang tak lagi tercampur ke daftar karyawan', !/isMagang\(me\) \|\| isStaff\(me\)\) return state\.tasks\.filter/.test(commHtml));
// v1.70.0: magang HANYA melihat task miliknya sendiri — sesama magang tak saling melihat.
ok('tak ada lagi cabang khusus magang di scopedTasks', !/if\(isMagang\(me\)\) return state\.tasks\.filter/.test(commHtml));
ok('semua peran memakai penyaring kepemilikan yang sama', /function scopedTasks\(\)[\s\S]{0,900}?return state\.tasks\.filter\(t=>ownsTask\(t,me\)\);/.test(commHtml));
ok('alasannya dicatat di kode', /Sesama magang tidak lagi saling melihat/.test(commHtml));
ok('PIC peran tetap milik bersama', /Task ber-PIC peran \("@Magang"\) TETAP terlihat oleh semuanya/.test(commHtml));

// Wewenang Leader HARUS tetap.
ok('Leader tetap boleh set Done', /function canSetDoneFor\(task\)\{[\s\S]{0,400}?isLeader\(me\)\) return true/.test(commHtml));
ok('Leader tetap boleh menyusun Task Kolaborasi', /function canManageCollab\(\)\{[\s\S]{0,300}?isLeader\(state\.currentUser\)\) return true/.test(commHtml));
// Lonceng: dibuka = terbaca, badge habis.
ok('buka lonceng menandai terbaca', /toggleNotifMenu[\s\S]{0,400}?markNotifsReadSilently\(\)/.test(commHtml));
ok('ada penanda-terbaca tanpa render ulang', /function markNotifsReadSilently\(\)/.test(commHtml));
ok('penanda-terbaca memanggil markNotificationsRead', /markNotifsReadSilently\(\)\{[\s\S]{0,400}?markNotificationsRead\(state\.currentUser, ''\)/.test(commHtml));
ok('notifikasi komentar task membuka chat-nya', /function openNotif\(refId\)[\s\S]{0,1500}?selectCommunicationTask\(t\.id\)/.test(commHtml));
ok('komentar sendiri tak dihitung belum-dibaca (toleran)', /!same\(c\.user, state\.currentUser\)/.test(commHtml));

console.log('\n=== 16d. Penanda "Giliran Anda" pada kartu kolaborasi ===');
// Dulu cuma teks merah 11px di antara belasan baris proses — praktis tak terlihat.
ok('teks kecil lama sudah dibuang', !/mt-1\.5 text-\[11px\] font-semibold text-rose-600 flex items-center gap-1"><span class="material-icons-round text-\[13px\]">notifications_active<\/span>Giliran Anda/.test(commHtml));
// Lapis 1: pita solid penuh-lebar di puncak kartu.
ok('ada pita giliran', /const turnRibbon = mineTurn \?/.test(commHtml));
ok('pita berlatar solid rose + teks putih', /turnRibbon[\s\S]{0,300}?bg-rose-500 dark:bg-rose-600[\s\S]{0,60}?text-white/.test(commHtml));
ok('pita memakai huruf tebal & kapital', /turnRibbon[\s\S]{0,500}?font-bold uppercase tracking-wide/.test(commHtml));
ok('ikon pita berdenyut', /turnRibbon[\s\S]{0,400}?notifications_active<\/span>/.test(commHtml) && /animate-pulse/.test(commHtml));
ok('pita menyebut proses mana yang menunggu', /myTurns\.length>1\?`\$\{myTurns\.length\} proses menunggu`:myTurns\[0\]\.name/.test(commHtml));
ok('pita dipasang di puncak kartu', /hover:ring-indigo-200 transition">\s*\$\{turnRibbon\}/.test(commHtml));
// Lapis 2: baris proses yang jadi giliran ikut disorot.
ok('baris giliran diberi latar', /const box=turn\?'bg-rose-50 dark:bg-rose-900\/25/.test(commHtml));
ok('baris giliran ditebalkan', /const txt=s\.done\?[\s\S]{0,80}?turn\?'text-rose-700 dark:text-rose-200 font-semibold'/.test(commHtml));
ok('ikon baris giliran diperbesar', /turn\?'text-\[16px\]':'text-\[14px\]'/.test(commHtml));
// Lapis 3: kartunya sendiri diberi cincin.
ok('kartu bergiliran diberi cincin', /mineTurn\?'border-rose-300 dark:border-rose-800 ring-2 ring-rose-200/.test(commHtml));
// Penentu terpenting: kartu bergiliran tak boleh terkubur di bawah kartu Selesai.
ok('ada peringkat urutan kartu', /function collabRank\(c\)/.test(commHtml));
ok('giliran Anda peringkat teratas', /function collabRank\(c\)[\s\S]{0,200}?isMyTurnStep\(c,s\)\)\) return 0/.test(commHtml));
ok('yang Selesai jatuh ke bawah', /function collabRank\(c\)[\s\S]{0,250}?c\.status==='Selesai' \? 2 : 1/.test(commHtml));
ok('filteredCollabs mengurutkan', /arr\.sort\(\(a,b\)=>collabRank\(a\)-collabRank\(b\)\)/.test(commHtml));

console.log('\n=== 16d-1. UI: tanggal centang, stage opsional, Manager membatalkan ===');
// Tanggal centang tampil di baris proses, lengkap dgn putusan tepat waktu / telat.
ok('ada penampil tanggal centang', /function stepDoneStamp\(s\)/.test(commHtml));
ok('dipasang di baris proses', /\$\{stepDoneStamp\(s\)\}/.test(commHtml));
ok('membandingkan doneAt dgn deadline proses', /const telat = tgl > s\.deadline/.test(commHtml));
ok('menandai telat & tepat waktu', /telat\?'\(telat\)':'\(tepat waktu\)'/.test(commHtml));
ok('tanpa deadline tetap tampilkan tanggalnya', /if\(!s\.deadline\) return/.test(commHtml));
ok('doneAt kacau tidak dirender', /if\(!\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(tgl\)\) return ''/.test(commHtml));
// Stage OPSIONAL — melekat pada PROSES, bukan pada kartunya.
ok('stage TIDAK lagi di kepala kartu', !/id="collabStage"/.test(commHtml));
ok('ada pemilih stage per proses', /class="cs-stage/.test(commHtml));
ok('memakai pembangun opsi stage', /\$\{collabStageOptions\(s\.stage\)\}/.test(commHtml));
ok('ada pilihan tanpa stage', /\(tanpa stage\)/.test(commHtml));
ok('memakai daftar stage task biasa', /function collabStageOptions\(sel\)[\s\S]{0,300}?state\.options&&state\.options\.stage\)\|\|\[\]/.test(commHtml));
ok('stage lama di luar dropdown tetap ditawarkan', /\(!v\|\|daftar\.includes\(v\)\)\?daftar:daftar\.concat\(\[v\]\)/.test(commHtml));
ok('stage ikut dibaca dari baris proses', /stage:\(row\.querySelector\('\.cs-stage'\)\|\|\{\}\)\.value\|\|''/.test(commHtml));
ok('draft proses baru menyertakan stage & link', /{name:'',pic:'',deadline:'',stage:'',link:'',srcOrder:0}/.test(commHtml));
ok('stage tampil di baris proses', /s\.stage\?`<span[^`]*?Stage">\$\{escapeHtml\(s\.stage\)\}/.test(commHtml));
// Manager boleh membatalkan centang.
ok('Manager boleh batalkan centang di klien', /if\(s && s\.done && isManager\(state\.currentUser\)\) return true/.test(commHtml));
ok('mencentang tetap khusus PIC', /return !!s && same\(s\.pic, state\.currentUser\)/.test(commHtml));

// Urutan status: "Revisi" SEBELUM "Review PM" (alur kerjanya memang begitu),
// dan satu sumber dipakai bersama supaya kolom Kanban, tombol pindah, dan legenda
// Timeline/Calendar tidak melenceng satu sama lain.
ok('ada satu daftar urutan status', /const STATUS_ORDER = \['Tanpa Status', 'Todo', 'In progress', 'Revisi', 'Review PM', 'Done', 'Hold'\]/.test(commHtml));
ok('Revisi diurutkan sebelum Review PM', (() => {
  const m = commHtml.match(/const STATUS_ORDER = \[([^\]]+)\]/);
  if (!m) return false;
  const arr = m[1].split(',').map(x => x.trim().replace(/^'|'$/g, ''));
  return arr.indexOf('Revisi') < arr.indexOf('Review PM');
})());
ok('ada pemeringkat status bersama', /function statusRank\(s\)/.test(commHtml));
ok('status tak dikenal jatuh ke paling kanan', /return i<0 \? 99 : i/.test(commHtml));
ok('kolom Kanban memakai peringkat itu', /statuses\.sort\(\(a,b\)=>statusRank\(a\)-statusRank\(b\)\)/.test(commHtml));
ok('tombol pindah-status memakainya juga', /const KO=STATUS_ORDER\.filter\(s=>!same\(s,'Tanpa Status'\)\)/.test(commHtml));
ok('legenda Timeline/Calendar memakainya juga', /present\.sort\(\(a,b\)=>statusRank\(a\)-statusRank\(b\)\)/.test(commHtml));
ok('tak ada lagi daftar urutan yang terduplikat', !/KANBAN_ORDER=|const ORDER=\['Tanpa Status'/.test(commHtml));

// Modal kolaborasi memuat dua panel sekaligus, jadi 1024px (max-w-5xl) terlalu sempit.
ok('modal kolaborasi diperlebar', /id="collabModal"[\s\S]{0,400}?max-w-\[1600px\]/.test(commHtml));
ok('tidak lagi memakai max-w-5xl', !/id="collabModal"[\s\S]{0,400}?max-w-5xl/.test(commHtml));
// Teks panjang tanpa spasi (mis. URL Drive) dulu terpotong di gelembung komentar.
ok('gelembung komentar mematahkan kata', /rounded-lg px-3 py-1\.5 mt-0\.5 inline-block max-w-full whitespace-pre-wrap break-words \[overflow-wrap:anywhere\]/.test(commHtml));

// Mode Dev: "Lihat sebagai" — tampilan dirender sebagai user itu, bukan sekadar disaring.
ok('identitas Dev asli dipisah dari hak berlaku', /function isDevReal\(\)[\s\S]{0,200}?function isDev\(\)\{ return !state\.previewAs && isDevReal\(\); \}/.test(commHtml));
ok('ada state pratinjau', /previewAs: '', _realUser: ''/.test(commHtml));
ok('Fokus PIC di mode Dev masuk pratinjau', /function setManagerFocus\(pic\)\{[\s\S]{0,260}?if\(isDevReal\(\)\)\{[\s\S]{0,140}?enterPreviewAs\(pic\)/.test(commHtml));
ok('pratinjau mengganti identitas render', /function enterPreviewAs\(name\)[\s\S]{0,320}?state\.currentUser=name;/.test(commHtml));
ok('identitas asli disimpan utk keluar', /if\(!state\._realUser\) state\._realUser=state\.currentUser;/.test(commHtml));
ok('keluar mengembalikan identitas asli', /function exitPreview\(\)[\s\S]{0,220}?state\.currentUser=state\._realUser\|\|state\.currentUser;/.test(commHtml));
ok('ada spanduk pratinjau', /id="previewBar"/.test(commHtml));
ok('spanduk punya tombol keluar', /onclick="exitPreview\(\)"/.test(commHtml));
ok('spanduk terpisah dari sidebar', /id="previewBar"[\s\S]{0,900}?Kembali jadi Dev/.test(commHtml));
// Pengaman: selama pratinjau tak boleh ada tindakan atas nama orang yang diintip.
ok('ada daftar aksi yang boleh saat pratinjau', /const PREVIEW_BOLEH = \{ getBootstrapData:1/.test(commHtml));
ok('aksi tulis dicegat', /if\(state\.previewAs && !PREVIEW_BOLEH\[name\]\)\{/.test(commHtml));
ok('pencegatan membungkus KEDUA jalur', /const GAS = guardPreview\(GAS_NATIVE \|\| makeRunner\(\)\);/.test(commHtml));
ok('kotak fokus disembunyikan selama pratinjau', /fBox\.classList\.toggle\('hide', \(!mgr && !isDevReal\(\)\) \|\| vo \|\| !!state\.previewAs\)/.test(commHtml));
ok('label kotak berubah di mode Dev', /fLbl\.textContent = isDevReal\(\) \? 'Lihat sebagai' : 'Fokus PIC'/.test(commHtml));
ok('ganti identitas keluar dari pratinjau', /function setCurrentUser\(user\)\{if\(state\.previewAs\)\{state\.previewAs='';state\._realUser='';/.test(commHtml));

// Export CSV ikut menyertakan proses Task Kolaborasi.
ok('ada pembangun baris CSV collab', commHtml.indexOf("function collabExportRows(){") >= 0);
ok('satu baris per PROSES, bukan per kartu', commHtml.indexOf("out.push(['Kolaborasi', c.id+'#'+st.order,") >= 0);
ok('ada kolom penanda sumber', commHtml.indexOf("const headers=['Sumber','Task ID'") >= 0);
ok('baris task diberi label Task', commHtml.indexOf("rows.map(t=>['Task',t.id,") >= 0);
ok('baris collab digabung ke berkas yang sama', commHtml.indexOf("[headers,...data,...collab]") >= 0);
ok('cakupannya sama dgn tampilan aplikasi', commHtml.indexOf("const terlihat=(state.collabs||[]);") >= 0);
ok('filter PIC ikut diterapkan ke collab', commHtml.indexOf("if(f.pic&&f.pic.length && !f.pic.some(v=>{") >= 0);
ok('PIC berupa peran ikut dicocokkan', commHtml.indexOf("const rp=rolePicOf(st.pic); return rp ? hasRole(v, String(rp).toLowerCase()) : same(st.pic,v);") >= 0);
ok('filter rentang due ikut diterapkan', commHtml.indexOf("if(f.dueStart && !(due && due>=f.dueStart)) return;") >= 0);
ok('deadline proses jatuh ke deadline project bila kosong', commHtml.indexOf("const due=st.deadline||c.deadline||'';") >= 0);
ok('link & catatan proses ikut terekspor', commHtml.indexOf("st.link||'', st.note||'', c.description||''") >= 0);
ok('pengguna diberi tahu jumlah barisnya', commHtml.indexOf("' proses kolaborasi diunduh.'") >= 0);

// Tautan: kolom Dokumen task + lampiran hasil di proses & sub-ceklis.
ok('ada pengubah teks jadi tautan', commHtml.indexOf("function asUrl(v){") >= 0);
ok('hanya http/https yang jadi tautan', commHtml.indexOf("new RegExp('^https?://','i').test(t)") >= 0);
ok('skema lain tidak pernah lolos', !/asUrl[sS]{0,400}?javascript/i.test(commHtml));
ok('tautan dibuka di tab baru & aman', commHtml.indexOf("target=\"_blank\" rel=\"noopener noreferrer\"") >= 0);
ok('klik tautan tak ikut membuka modal', commHtml.indexOf("onclick=\"event.stopPropagation()\"") >= 0);
ok('kolom Dokumen punya pratinjau tautan', commHtml.indexOf("id=\"fieldDocPreview\"") >= 0);
ok('pratinjau diperbarui saat mengetik', commHtml.indexOf("oninput=\"renderDocPreview()\"") >= 0);
ok('baris Task List punya ikon dokumen', commHtml.indexOf("linkIcon(t.document,'Buka dokumen task ini')") >= 0);
ok('link proses TIDAK lagi di editor manager', commHtml.indexOf('class="cs-link') < 0);
ok('panel proses jadi satu-satunya pintu link', commHtml.indexOf("id=\"collab-steplink-${s.order}\"") >= 0);
ok('ada tombol Simpan link per proses', commHtml.indexOf("onclick=\"saveCollabStepLink(${s.order})\"") >= 0);
ok('izinnya sama dgn catatan proses (PIC boleh)', commHtml.indexOf("${editNote?`<div class=\"mt-1.5 flex justify-end\"><button type=\"button\" onclick=\"saveCollabStepLink(") >= 0);
// Hapus item Ceklis Pengerjaan: pembuatnya, Leader, atau Manager.
ok('izin hapus dinilai PER-ITEM', commHtml.indexOf("function canDeleteChecklistItem(c){") >= 0);
ok('pembuat item termasuk yang boleh', commHtml.indexOf("return same(pembuat, state.currentUser);") >= 0);
// Item lama bisa kehilangan jejak pembuatnya — jangan sampai terkunci selamanya.
ok('pembuat tak diketahui -> jatuh ke hak ubah ceklis', commHtml.indexOf("if(!pembuat) return canEditChecklist();") >= 0);
ok('Leader ikut boleh', commHtml.indexOf("if(isManager(state.currentUser) || isLeader(state.currentUser)) return true;") >= 0);
ok('tombol hapus muncul per item', commHtml.indexOf("${(isNew||canDeleteChecklistItem(c))?`<button type=\"button\" onclick=\"removeChecklist(") >= 0);
ok('tak ada lagi izin hapus tunggal utk seluruh daftar', !/const editable=canEditChecklist(), removable=/.test(commHtml));
ok('penghapusan dikonfirmasi dulu', commHtml.indexOf("if(!confirm('Hapus item \"'+((it&&it.item)||'')+'\" dari ceklis?')) return;") >= 0);

// Simpan catatan & link berupa TOMBOL di kanan, bukan tautan teks di kiri.
ok('Simpan catatan jadi tombol kanan', commHtml.indexOf("${editNote?`<div class=\"mt-1.5 flex justify-end\"><button type=\"button\" onclick=\"saveCollabStepNote(") >= 0);
ok('keduanya bergaya tombol', commHtml.indexOf("rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold shadow-sm") >= 0);
ok('tak ada lagi tautan teks hover:underline utk simpan', !/onclick="saveCollabStep(Note|Link)(${s.order})" class="mt-1 text-[11px] font-semibold text-indigo-600 hover:underline"/.test(commHtml));
ok('aksi setCollabStepLink terdaftar', commHtml.indexOf("'setCollabStepNote','setCollabStepLink'") >= 0);
ok('baris proses menampilkan tautannya', commHtml.indexOf("s.link?linkIcon(s.link,'Buka hasil proses ini'):''") >= 0);
ok('sub-item bisa dilampiri link', commHtml.indexOf("function promptSubLink(order, row){") >= 0);
ok('tambah sub-item menyertakan link opsional', commHtml.indexOf("id=\"collab-subck-link-${order}\"") >= 0);
ok('link ikut dikirim saat menambah sub-item', commHtml.indexOf("addChecklistItem(collabStepTaskId(order), text, state.currentUser, url)") >= 0);
ok('sub-item menampilkan tautannya', commHtml.indexOf("it.link?linkIcon(it.link,'Buka hasil sub-item ini'):''") >= 0);
// Ceklis Pengerjaan (task biasa) juga bisa dilampiri link — memakai aksi yang sama.
ok('ceklis task punya input link opsional', commHtml.indexOf("id=\"checklistLinkInput\"") >= 0);
ok('item ceklis task menampilkan tautannya', commHtml.indexOf("c.link?linkIcon(c.link,'Buka hasil item ini'):''") >= 0);
ok('ada tombol lampirkan di item ceklis task', commHtml.indexOf("promptChecklistLink('${escapeAttr(key)}')") >= 0);
ok('tombol lampirkan hanya utk task tersimpan', commHtml.indexOf("${(editable&&!isNew)?`<button type=\"button\" onclick=\"promptChecklistLink(") >= 0);
ok('link ikut dikirim saat menambah item', commHtml.indexOf("addChecklistItem(id, text, state.currentUser, url)") >= 0);
ok('item task BARU menampung linknya dulu', commHtml.indexOf("{item:text,done:false,link:url}") >= 0);
ok('item tertunda mengirim linknya setelah task tersimpan', commHtml.indexOf("addChecklistItem(taskId, it.item, state.currentUser, it.link || '')") >= 0);
ok('duplikat task ikut membawa link ceklis', commHtml.indexOf("map(x=>({item:x.item,done:false,link:x.link||''}))") >= 0);


// Stage OPSIONAL: boleh dikosongkan, jatuh ke "Umum".
ok('ada stage bawaan Umum', /const STAGE_UMUM='Umum';/.test(commHtml));
ok('tak lagi memblokir simpan tanpa stage', !/showToast\('Pilih Stage dulu\.', false\)/.test(commHtml));
ok('stage kosong disimpan sbg Umum', /stage:\(getVal\('fieldStage'\)\.trim\(\)\|\|STAGE_UMUM\)/.test(commHtml));
ok('placeholder menjelaskan artinya', /\(Umum — tanpa stage khusus\)/.test(commHtml));
ok('"Umum" selalu ada di daftar pilihan', /if\(!out\.some\(x=>x\.toLowerCase\(\)===STAGE_UMUM\.toLowerCase\(\)\)\) out\.push\(STAGE_UMUM\)/.test(commHtml));
ok('kata kerja tetap wajib bila stage-nya punya', /if\(verbsFor\(_stage\)\.length && !_verb\)\{ showToast\('Pilih Kata Kerja\.'/.test(commHtml));

// Dropdown PIC & Support dikelompokkan per peran.
ok('ada pembangun opsi per peran', /function picOptionsHtml\(values, selected, opsiPeran\)/.test(commHtml));
ok('memakai optgroup berlabel peran', /<optgroup label="\$\{escapeAttr\(r\)\}">/.test(commHtml));
ok('urutan grup mengikuti daftar ROLES', /const urutan=\(state\.roles\|\|\[\]\)\.filter\(r=>!same\(r,'Dev'\)\)/.test(commHtml));
ok('yang belum berperan dikumpulkan sendiri', /<optgroup label="Belum diatur">/.test(commHtml));
ok('tanpa sheet USERS kembali ke daftar datar', /if\(!usersConfigured\(\)\) return daftar\.map\(opt\)\.join\(''\)/.test(commHtml));
ok('PIC task memakai pengelompokan itu', /picSel\.innerHTML=picOptionsHtml\(state\.options\.pic, lama\|\|state\.currentUser, true\)/.test(commHtml));
// PIC berupa peran: task milik bersama + jejak siapa yang mengubah status.
ok('ada pengenal PIC peran', /function rolePicOf\(pic\)/.test(commHtml));
ok('grup "milik bersama" ditawarkan di PIC', /Milik bersama \(satu peran\)/.test(commHtml));
ok('Dev & Lihat Saja tak bisa jadi PIC bersama', /!same\(r,'Dev'\) && !same\(r,'Lihat Saja'\) && roleTagCount/.test(commHtml));
ok('peran kosong tidak ditawarkan', /roleTagCount\(String\(r\)\.toLowerCase\(\)\)>0/.test(commHtml));
ok('kepemilikan mengenali PIC peran', /function ownsTask\(t,user\)\{[\s\S]{0,200}?hasRole\(user, String\(rp\)\.toLowerCase\(\)\)/.test(commHtml));
ok('task magang bersama ikut terhitung', /same\(rolePicOf\(p\),'Magang'\) \|\| isMagang\(p\)/.test(commHtml));
ok('lencana PIC mengenali peran', /function isPicOf\(t,user\)\{ const rp=rolePicOf/.test(commHtml));
ok('PIC peran lama tetap ditawarkan saat disunting', /rolePicOf\(selected\) && out\.indexOf/.test(commHtml));
ok('ada tempat menampilkan pengubah status', /id="fieldStatusBy"/.test(commHtml));
ok('teksnya menyebut siapa pengubahnya', /Status diubah oleh/.test(commHtml));
ok('Support memakai pengelompokan itu', /support\.innerHTML = picOptionsHtml\(state\.options\.support \|\| state\.options\.pic, ''\)/.test(commHtml));
ok('PIC proses kolaborasi ikut dikelompokkan', /function collabPicOptions\(sel\)\{ return '<option value="">\(pilih PIC\)<\/option>'\+picOptionsHtml\(state\.options\.pic, sel, true\)/.test(commHtml));
// Proses kolaborasi juga boleh ber-PIC peran (milik bersama).
ok('ada penentu proses "milik saya"', /function stepIsMine\(s\)/.test(commHtml));
ok('kepemilikan proses memahami PIC peran', commHtml.indexOf("function stepBelongsTo(s, user){") >= 0 && commHtml.indexOf("hasRole(user, String(rp).toLowerCase())") >= 0);
ok('stepIsMine kini turunan stepBelongsTo', commHtml.indexOf("function stepIsMine(s){ return stepBelongsTo(s, state.currentUser); }") >= 0);
// Proses collab tiap user ikut muncul di daftar/kanban, bukan cuma milik yang sedang login.
ok('ada pembangun pseudo-task per orang', commHtml.indexOf("function collabPseudo(c, user){") >= 0);
ok('ada pengumpul proses SELURUH tim', commHtml.indexOf("function allCollabTasks(){") >= 0);
ok('yang boleh lihat semua dapat proses semua orang', commHtml.indexOf("return canSeeAllTasks(state.currentUser) ? allCollabTasks() : myCollabTasks(state.currentUser);") >= 0);
ok('Fokus PIC menyempitkan ke orang itu', commHtml.indexOf("if(fokus) return myCollabTasks(fokus);") >= 0);
ok('cakupan collab jadi fungsi tersendiri', commHtml.indexOf("function collabScopedTasks(){") >= 0);
// Hitungan pil filter harus cocok dgn baris yang benar-benar tampil.
ok('hitungan pil ikut menyertakan baris collab', commHtml.indexOf("scopedTasks().concat(viewIncludesCollab()?collabScopedTasks():[])") >= 0);
ok('hanya Kanban & List yang menyisipkan collab', commHtml.indexOf("function viewIncludesCollab(){ return state.activeView==='kanban' || state.activeView==='list'; }") >= 0);
// Ekspor CSV: cakupan collab harus sama dgn task, termasuk filter cepat.
ok('ekspor collab hormati filter cepat', commHtml.indexOf("if(state.quickFilter==='mine' && !stepBelongsTo(st, state.currentUser)) return;") >= 0);
ok('ekspor collab hormati fokus deadline', commHtml.indexOf("if(state.deadlineFocus && !(telat || (!st.done && sisa===0))) return;") >= 0);
ok('pseudo-task menyimpan pemilik prosesnya', commHtml.indexOf("_stepOwner:user") >= 0);
ok('label bukan selalu "Proses Anda"', commHtml.indexOf("same(t._stepOwner,state.currentUser)?'Anda':(stepPicLabel(t._stepOwner)||t.pic||'—')") >= 0);
ok('stage & link proses ikut ke pseudo-task', commHtml.indexOf("stage:(myStep&&myStep.stage)||'', dueDate:(myStep&&myStep.deadline)||c.deadline||''") >= 0);
ok('giliran memakai stepIsMine', /if\(!stepIsMine\(s\)\) return false;/.test(commHtml));
ok('izin centang proses memahami peran', /function canCheckStepClient\(s\)\{[\s\S]{0,320}?const rp=rolePicOf\(s&&s\.pic\);/.test(commHtml));
ok('PIC peran ditampilkan ramah', /function stepPicLabel\(pic\)\{ return rolePicLabel\(pic\) \|\| String\(pic\|\|'—'\); \}/.test(commHtml));
ok('label dipakai di baris proses', /\$\{escapeHtml\(stepPicLabel\(s\.pic\)\)\}/.test(commHtml));
ok('pilihan lama tetap terpilih', /same\(v,selected\)\?'selected':''/.test(commHtml));

// Tag per peran di komentar.
ok('ada daftar tag peran', /const MENTION_ROLE_TAGS = \['manager', 'leader', 'staff', 'magang'\]/.test(commHtml));
ok('Dev & Lihat Saja tidak jadi tag peran', !/MENTION_ROLE_TAGS = \[[^\]]*'dev'/.test(commHtml) && !/MENTION_ROLE_TAGS = \[[^\]]*'lihat saja'/.test(commHtml));
ok('tag peran ikut disorot', /for\(const rl of MENTION_ROLE_TAGS\)/.test(commHtml));
ok('warna sorot peran dibedakan', /const wrapPeran=s=>`<span class="font-semibold text-teal-600/.test(commHtml));
ok('nama dicocokkan sebelum peran', /if\(!hit\) for\(const rl of MENTION_ROLE_TAGS\)/.test(commHtml));
ok('peran masuk daftar saran @', /const pool=\['everyone'\]\.concat\(availableRoleTags\(\), pics\)/.test(commHtml));
ok('peran tanpa anggota tidak ditawarkan', /function availableRoleTags\(\)[\s\S]{0,200}?MENTION_ROLE_TAGS\.filter\(r=>roleTagCount\(r\)>0\)/.test(commHtml));
ok('hanya user aktif yang dihitung', /function roleTagCount\(r\)[\s\S]{0,200}?u\.active!==false/.test(commHtml));
ok('saran peran menampilkan jumlah orangnya', /orang berperan ini/.test(commHtml));
ok('saran peran diberi ikon sendiri', /isRole\?`<span class="w-5 h-5 rounded-full inline-flex items-center justify-center bg-teal-100/.test(commHtml));

// Isian proses tidak boleh hilang saat keluar dari mode Edit sebelum Simpan.
ok('keluar mode Edit membaca isian dulu', /if\(state\._collabEdit\)\{\s*\/\/ sedang KELUAR dari mode edit\s*state\._collabDraft=collabReadStepInputs\(\);\s*state\._collabDirty=true;/.test(commHtml));
ok('masuk mode Edit tak menimpa rancangan tertunda', /state\._collabEdit=true;\s*if\(!state\._collabDirty\)\{/.test(commHtml));
ok('mode baca menampilkan rancangan tertunda', /const pending=!!state\._collabDirty;/.test(commHtml));
ok('ada spanduk peringatan belum tersimpan', /Perubahan proses belum disimpan/.test(commHtml));
ok('baris rancangan tak bisa dicentang', /const turn=!s\._pending&&isMyTurnStep\(c,s\), mine=stepIsMine\(s\), canChk=!s\._pending&&canCheckStepClient\(s\)/.test(commHtml));
ok('sub-ceklis disembunyikan di baris rancangan', /\$\{s\._pending\?'':stepSubBadge\(s\.order,s\.done\)\}/.test(commHtml));
ok('Simpan memakai rancangan bila ada', /state\._collabDirty \? \(state\._collabDraft\|\|\[\]\)\.filter\(s=>s\.name\)/.test(commHtml));
// Menyimpan dari mode baca dulu menghapus seluruh stage karena tak ikut dipetakan.
ok('stage ikut di jalur mode baca', /\(\(cur&&cur\.steps\)\|\|\[\]\)\.map\(s=>\(\{name:s\.name, pic:s\.pic, deadline:s\.deadline, stage:s\.stage\|\|'', srcOrder:s\.order\}\)\)/.test(commHtml));
ok('tanda tertunda dibersihkan setelah tersimpan', /state\._collabDirty=false; state\._collabDraft=\[\];\s*\/\/ sudah tersimpan/.test(commHtml));
ok('tanda tertunda direset saat modal dibuka', commHtml.indexOf("state._collabDraft=isNew?[{name:'',pic:'',deadline:'',stage:'',link:'',srcOrder:0}]:[]; state._collabDirty=false;") >= 0);
ok('tanda tertunda direset saat modal ditutup', /state\._collabEdit=false; state\._collabDirty=false; state\._collabDraft=\[\];/.test(commHtml));

// Pemilih identitas: kolom menyesuaikan jumlah nama supaya barisnya seimbang.
ok('ada penghitung kolom pemilih identitas', /function identityGridCols\(n\)/.test(commHtml));
ok('4 nama diberi 2 kolom (2x2, bukan 3+1)', /n===4 \? 2/.test(commHtml));
ok('layar sempit dibatasi 2 kolom', /var maks=lebar<640\?2:4/.test(commHtml));
ok('kolom dipasang sbg inline style', /grid\.style\.gridTemplateColumns='repeat\('\+identityGridCols\(items\.length\)/.test(commHtml));
// Class Tailwind yang dirangkai saat berjalan tidak ikut ter-generate di build tanpa CDN.
ok('grid tak lagi memakai kolom tetap', !/id="identityGrid" class="grid grid-cols-2 sm:grid-cols-3/.test(commHtml));
// Perhitungannya diuji langsung, bukan sekadar dicocokkan polanya.
ok('pembagian baris seimbang', (() => {
  const m = commHtml.match(/function identityGridCols\(n\)\{[\s\S]*?\n\}/);
  if (!m) return false;
  const fn = new Function('window', 'return (' + m[0] + ')')({ innerWidth: 1024 });
  return [[1,1],[2,2],[3,3],[4,2],[5,3],[6,3],[7,4],[8,4]].every(([n, k]) => fn(n) === k);
})());

// Menu notifikasi harus di ATAS kartu task. backdrop-blur pada <header> membuat stacking
// context sendiri, jadi z-index menu di dalamnya tak berlaku terhadap <section> konten —
// header WAJIB punya z-index sendiri, kalau tidak seluruh isinya tenggelam di bawah kartu.
ok('header punya stacking context sendiri', commHtml.indexOf("<header class=\"relative z-[70] h-16") >= 0);
ok('alasannya dicatat di kode', commHtml.indexOf("backdrop-blur membuat stacking context sendiri") >= 0);
ok('menu notifikasi tetap di dalam header', commHtml.indexOf("id=\"notifMenu\"") >= 0);
// Header harus DI BAWAH modal, supaya dialog tetap menutupinya.
// Header harus DI BAWAH modal, supaya dialog tetap menutupinya.
ok('modal task lebih tinggi dari header', (function(){var k=commHtml.indexOf("id=\"taskModal\""); if(k<0) return -1; var a=commHtml.indexOf('z-[',k); if(a<0) return -1; var b=commHtml.indexOf(']',a); return Number(commHtml.slice(a+3,b)); })() > (function(){var k=commHtml.indexOf("<header class=\"relative"); if(k<0) return -1; var a=commHtml.indexOf('z-[',k); if(a<0) return -1; var b=commHtml.indexOf(']',a); return Number(commHtml.slice(a+3,b)); })());

// Sidebar bisa disembunyikan supaya area task lebih lebar.
ok('ada tombol sembunyikan sidebar', /id="sidebarToggle"/.test(commHtml));
ok('tombol hanya utk layar lebar', /id="sidebarToggle"[^>]*hidden md:inline-flex/.test(commHtml));
ok('ada fungsi toggle sidebar', /function toggleSidebar\(\)/.test(commHtml));
ok('pilihan disimpan di localStorage', /LS\.set\('tt_sidebar_hidden'/.test(commHtml) && /LS\.get\('tt_sidebar_hidden'\)==='1'/.test(commHtml));
ok('sidebar disembunyikan lewat class, bukan dihapus', /el\.classList\.toggle\('md:hidden', sembunyi\)/.test(commHtml));
ok('ikon tombol ikut berubah', /ic\.textContent=sembunyi\?'menu':'menu_open'/.test(commHtml));
ok('grafik digambar ulang setelah lebar berubah', /function toggleSidebar\(\)[\s\S]{0,300}?renderAll\(\)/.test(commHtml));
ok('kondisi sidebar dipulihkan saat muat', /renderAppVersion\(\); applySidebar\(\)/.test(commHtml));

console.log('\n=== 16d-2. UI: salin sub-ceklis ke proses lain ===');
ok('tombol salin ada di kepala sub-ceklis', /toggleCopyChecklistPanel\(\$\{order\}\)/.test(commHtml));
ok('tombol hanya muncul bila ada proses lain', /editable&&otherStepsFor\(order\)\.length\?/.test(commHtml));
ok('ada wadah panel salin', /id="collab-subck-copy-\$\{order\}"/.test(commHtml));
ok('panel mendaftar proses selain sumber', /function otherStepsFor\(order\)[\s\S]{0,200}?s\.order!==order/.test(commHtml));
ok('tiap tujuan menampilkan PIC-nya', /renderCopyChecklistPanel[\s\S]{0,1200}?escapeHtml\(stepPicLabel\(s\.pic\)\)/.test(commHtml));
// Menyalin MENAMBAH, bukan menimpa — user harus tahu sebelum menekan tombol.
ok('tujuan yang sudah berisi diberi tanda', /sudah ada \$\{punya\}/.test(commHtml));
ok('diberi tahu item masuk belum tercentang', /item masuk belum tercentang/.test(commHtml));
ok('tanpa tujuan terpilih ditolak di klien', /submitCopyChecklist\(order\)[\s\S]{0,300}?Pilih dulu proses tujuannya/.test(commHtml));
ok('tombol dikunci selama menyalin', /submitCopyChecklist\(order\)[\s\S]{0,600}?btn\.disabled=true; btn\.textContent='Menyalin…'/.test(commHtml));
ok('memanggil copyChecklist sekali utk semua tujuan', /\.copyChecklist\(collabStepTaskId\(order\), picked\.map\(o=>collabStepTaskId\(o\)\), state\.currentUser\)/.test(commHtml));
ok('proses tujuan disegarkan setelah salin', /picked\.forEach\(o=>\{ if\(state\._collabExpanded&&state\._collabExpanded\[o\]\) loadStepChecklist\(o\); else syncStepMainCheckbox\(o\)/.test(commHtml));
ok('aksi ceklis (termasuk salin & link) terdaftar', commHtml.indexOf("'getChecklist','addChecklistItem','copyChecklist','setChecklistLink','setChecklistDone'") >= 0);

console.log('\n=== 16e. Kelola User memuat SEMUA nama, bukan cuma yang terdaftar ===');
const uaHtml = call('doGet', {})._html;
// Masalah yang diperbaiki: begitu sheet USERS terisi, roleOf() mengembalikan '' untuk
// nama yang belum tercatat — haknya hilang diam-diam DAN ia tak muncul di panel mana pun,
// jadi Dev tak punya cara membetulkannya tanpa menyunting sheet/kode.
ok('ada pengumpul semua nama yang dikenal', /function knownPeople\(\)/.test(uaHtml));
ok('nama diambil dari dropdown PIC', /function knownPeople\(\)[\s\S]{0,900}?state\.options&&state\.options\.pic\|\|\[\]\)\.forEach\(add\)/.test(uaHtml));
ok('nama diambil dari dropdown Support', /function knownPeople\(\)[\s\S]{0,900}?state\.options&&state\.options\.support\|\|\[\]\)\.forEach\(add\)/.test(uaHtml));
// SENGAJA tidak membaca PIC/Support dari task lama: kalau dibaca, user yang baru dihapus
// akan muncul lagi sebagai "Belum diatur" dan penghapusannya terasa gagal.
ok('nama TIDAK dipungut dari task lama', !/function knownPeople\(\)[\s\S]{0,900}?state\.tasks\|\|\[\]\)\.forEach/.test(uaHtml));
ok('"dev" tak ikut jadi baris user', /function knownPeople\(\)[\s\S]{0,400}?k==='dev'\) return/.test(uaHtml));
ok('baris = gabungan terdaftar + belum terdaftar', /function userAdminRows\(\)[\s\S]{0,700}?registered:true[\s\S]{0,200}?registered:false/.test(uaHtml));
// Urutan tabel = hierarki peran aplikasi: Manager teratas → Magang → Lihat Saja.
ok('urutan memakai peringkat peran', /function roleRank\(u\)/.test(uaHtml));
ok('peringkat diambil dari daftar ROLES aplikasi', /function roleRank\(u\)[\s\S]{0,300}?state\.roles\|\|\[\]\)\.filter\(r=>!same\(r,'Dev'\)\)/.test(uaHtml));
ok('yang belum diatur tetap paling atas', /function roleRank\(u\)[\s\S]{0,200}?!u\.registered\) return -1/.test(uaHtml));
ok('peran asing jatuh ke paling bawah', /function roleRank\(u\)[\s\S]{0,400}?i<0 \? order\.length : i/.test(uaHtml));
ok('sort memakai roleRank lalu nama', /sort\(\(a,b\)=> \(roleRank\(a\)-roleRank\(b\)\) \|\| a\.name\.localeCompare/.test(uaHtml));
ok('tak ada lagi urutan terdaftar-vs-belum', !/a\.registered!==b\.registered \? \(a\.registered\?1:-1\)/.test(uaHtml));
// Karyawan tetap dilindungi dari penghapusan; magang & sisa dropdown boleh dibersihkan.
ok('ada daftar peran karyawan tetap', /const PERMANENT_ROLES=\['Manager','Leader','Staff'\]/.test(uaHtml));
ok('ada penjaga boleh-hapus', /function canDeleteUser\(u\)/.test(uaHtml));
ok('ada penanda user terlindungi', /function isProtectedUser\(u\)/.test(uaHtml));
ok('terlindungi = karyawan tetap yang MASIH AKTIF', /function isProtectedUser\(u\)\{ return !!u && u\.registered && isPermanentRole\(u\.role\) && u\.active!==false; \}/.test(uaHtml));
ok('karyawan tetap aktif tak bisa dihapus', /function canDeleteUser\(u\)[\s\S]{0,300}?return !isProtectedUser\(u\)/.test(uaHtml));
ok('gembok hanya utk yang terlindungi', /isProtectedUser\(u\)&&!same\(u\.name,state\.currentUser\)/.test(uaHtml));
ok('diri sendiri & Dev tak bisa dihapus', /function canDeleteUser\(u\)[\s\S]{0,300}?same\(u\.name,state\.currentUser\) \|\| baseName\(u\.name\)==='dev'\) return false/.test(uaHtml));
ok('karyawan tetap diberi ikon gembok', /lock_outline/.test(uaHtml));
ok('gembok menjelaskan cara membukanya', /Karyawan tetap yang masih aktif tidak bisa dihapus[\s\S]{0,250}?Nonaktifkan dulu/.test(uaHtml));
ok('removeUser dijaga canDeleteUser', /function removeUser\(i\)[\s\S]{0,300}?!canDeleteUser\(u\)\)\{/.test(uaHtml));
ok('konfirmasi menyebut pencabutan dari PIC', /function removeUser\(i\)[\s\S]{0,600}?dropdown PIC & Support/.test(uaHtml));
ok('tabel memakai userAdminRows, bukan state.users', /const people=userAdminRows\(\)/.test(uaHtml));
ok('tabel TIDAK lagi memetakan state.users langsung', !/const users=\(state\.users\|\|\[\]\);\s*if\(!users\.length\)/.test(uaHtml));
// Memilih peran untuk nama yang belum terdaftar = sekaligus mendaftarkannya.
ok('ada opsi "belum diatur" utk yang tak terdaftar', /— belum diatur —/.test(uaHtml));
ok('ada lencana peringatan "Belum diatur"', /Belum diatur<\/span>/.test(uaHtml));
ok('ada spanduk jumlah yang belum berperan', /belum punya peran/.test(uaHtml));
// Handler harus membaca daftar gabungan yang sama, kalau tidak indeksnya meleset ke orang lain.
ok('changeUserRole memakai userAdminRows', /function changeUserRole\(i,role\)\{\s*const u=userAdminRows\(\)\[i\]/.test(uaHtml));
ok('toggleUserActive memakai userAdminRows', /function toggleUserActive\(i\)\{\s*const u=userAdminRows\(\)\[i\]/.test(uaHtml));
ok('removeUser memakai userAdminRows', /function removeUser\(i\)\{\s*const u=userAdminRows\(\)\[i\]/.test(uaHtml));
ok('tak ada lagi handler yang indeks ke state.users', !/const u=\(state\.users\|\|\[\]\)\[i\]/.test(uaHtml));
// Aksi yang mustahil untuk baris belum terdaftar harus dijaga, bukan cuma disembunyikan.
ok('nonaktifkan dijaga utk yg belum terdaftar', /function toggleUserActive\(i\)[\s\S]{0,200}?!u\.registered\) return/.test(uaHtml));
// Yang belum berperan JUSTRU boleh dihapus — itulah cara membersihkan sisa nama di dropdown.
ok('yang belum berperan boleh dihapus', /function isProtectedUser\(u\)\{ return !!u && u\.registered &&/.test(uaHtml));
// Akun duplikat: nonaktifkan dulu, tombol hapus lalu muncul.
ok('nonaktif melepas kuncian', /isPermanentRole\(u\.role\) && u\.active!==false/.test(uaHtml));
ok('memilih opsi kosong bukan perintah simpan', /function changeUserRole\(i,role\)[\s\S]{0,300}?if\(!role\)\{ renderUserAdmin\(\); return; \}/.test(uaHtml));
ok('keterangan panel menyebut semua nama dikenal', /semua nama yang dikenal sistem/.test(uaHtml));

console.log('\n=== 17. Mode Dev TIDAK aktif sebelum DEV_PIN diisi ===');
eq('PIN kosong ditolak saat DEV_PIN belum diset', call('verifyPin', '__dev__', '').ok, false);
eq('PIN apa pun ditolak', call('verifyPin', '__dev__', '3108').ok, false);
ok('pesannya menjelaskan sebabnya', /DEV_PIN/.test(call('verifyPin', '__dev__', '1234').message || ''));

console.log('\n=== 17b. Ketahanan halaman (Apps Script tanpa CDN) ===');
const pageHtml = call('doGet', {})._html;
// Layar "Memuat…" harus dijamin hilang lewat finally, apa pun yang gagal di tengah.
ok('afterLoad memakai try/finally', /function afterLoad\(\)[\s\S]{0,3000}?\}\s*finally\s*\{[\s\S]{0,200}?getElementById\('loading'\)[\s\S]{0,80}?add\('hide'\)/.test(pageHtml));
ok('error afterLoad dilaporkan ke user', /afterLoad gagal/.test(pageHtml));
// Library CDN dipakai dengan penjagaan, bukan telanjang.
ok('Chart.js dijaga sebelum dipakai', /typeof Chart==='undefined'/.test(pageHtml));
ok('Gantt dijaga', /if\(!window\.Gantt\)/.test(pageHtml));
ok('Sortable dijaga', /window\.Sortable\s*&&/.test(pageHtml));
ok('ada deteksi library yang gagal dimuat', /function missingLibs\(\)/.test(pageHtml));
// .hide tidak boleh bergantung Tailwind (kalau tidak, overlay tak bisa disembunyikan).
ok('.hide didefinisikan di CSS inline', /\.hide\{display:none!important\}/.test(pageHtml));
// localStorage bisa melempar di iframe Apps Script -> semua akses harus aman.
ok('ada pembungkus localStorage aman', /var LS = \{[\s\S]{0,300}catch\(e\)\{ return null; \}/.test(pageHtml));
// Yang paling berbahaya: akses yang jalan SEBELUM/DI LUAR try — kalau melempar, seluruh script mati.
ok('state awal pakai LS.get', /currentUser: LS\.get\('tt_current_user'\)/.test(pageHtml));
ok('applyTheme pakai LS.get', /LS\.get\('theme'\)/.test(pageHtml));
ok('toggleTheme pakai LS.set', /function toggleTheme\(\)\{LS\.set\('theme'/.test(pageHtml));
ok('setCurrentUser pakai LS.set', /setCurrentUser\(user\)\{[\s\S]{0,160}?state\.currentUser=user;LS\.set\('tt_current_user',user\)/.test(pageHtml));

console.log('\n=== 18. doGet: halaman web app ===');
const page = call('doGet', {});
ok('doGet mengembalikan halaman', !!page && typeof page._html === 'string');
ok('halaman = frontend lengkap', page._html.indexOf('<!DOCTYPE html>') === 0 && page._html.indexOf('ProductTrack') > 0);
ok('halaman polos TANPA suntikan mode', !/window\.__TT_VIEW\s*=/.test(page._html));
const pageLintas = call('doGet', { parameter: { view: 'lintas' } });
ok('?view=lintas menyuntikkan __TT_VIEW', /window\.__TT_VIEW="lintas"/.test(pageLintas._html));
ok('suntikan diletakkan sebelum </head>', pageLintas._html.indexOf('__TT_VIEW') < pageLintas._html.indexOf('</head>'));
const pageUnlock = call('doGet', { parameter: { unlock: '1' } });
ok('?unlock=1 -> mode normal', /window\.__TT_VIEW="normal"/.test(pageUnlock._html));
const pageEvil = call('doGet', { parameter: { view: '"><script>alert(1)</script>' } });
ok('parameter berbahaya dibersihkan', !/alert\(1\)/.test(pageEvil._html));
ok('frontend membaca __TT_VIEW', fs.readFileSync(path.join(GAS_DIR, 'Index.html'), 'utf8').indexOf('window.__TT_VIEW') > 0);

console.log(`\n✅ Semua ${passed} assertion lulus.`);
