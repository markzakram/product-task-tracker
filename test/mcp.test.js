/**
 * Tes untuk api/mcp.js — MCP server (JSON-RPC di atas HTTP).
 * googleapis diganti tiruan in-memory yang melayani DUA spreadsheet sekaligus:
 * sheet task tracker dan sheet OKR. Jadi jalur okr_progress teruji utuh —
 * termasuk pemanggilan Query milik tiap KR ke perhitungan metrics.
 *
 * Jalankan: node test/mcp.test.js
 */
const assert = require('assert');
const Module = require('module');

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log('  ✓ ' + name); passed++; }
function eq(name, a, b) {
  assert.strictEqual(a, b, `${name} (got=${JSON.stringify(a)} want=${JSON.stringify(b)})`);
  console.log('  ✓ ' + name); passed++;
}

/* ---------------- Spreadsheet tiruan ---------------- */
const TASK_ID = 'SHEET-TASK';
const OKR_ID = 'SHEET-OKR';

// Main!B4:W — kolom: id, created, due, status, priority, name, stage, platform, pic, ...
const MAIN = [
  ['TSK-001', '2026-07-01', '2026-07-10', 'Done', 'High', 'Edit video', 'QC', 'JadiASN', 'Dhea', '', '', 'cat pic', 'cat pm', '', '', '', '', '', '', 'Nynda', '', 'Dhea • 2026-07-08 09:00:00'],
  ['TSK-002', '2026-07-02', '2026-07-05', 'Done', 'Normal', 'Susun soal', 'QC', 'Markaz', 'Arifah', '', '', '', '', '', '', '', '', '', '', 'Nynda', '', ''],
  ['TSK-003', '2026-06-01', '2026-06-15', 'Review PM', 'Urgent', 'Review materi', 'QC', 'JadiPPG', 'Arifah', '', '', '', '', '', '', '', '', '', '', 'Nynda', '', ''],
  ['TSK-004', '2026-08-01', '', 'Todo', 'Normal', 'Bikin liveclass', 'Kreatif', '', 'Dhea', '', '', '', '', '', '', '', '', '', '', 'Nynda', '', ''],
];
// ACTIVITY!A2:G — timestamp, user, action, taskId, detail, statusLama, statusBaru
const ACTIVITY = [
  ['2026-07-08 09:00:00', 'Dhea', 'Update Task', 'TSK-001', 'Edit video • Status: Done • PIC: Dhea', 'In progress', 'Done'],
  ['2026-07-09 11:00:00', 'Arifah', 'Update Task', 'TSK-002', 'Susun soal • Status: Done • PIC: Arifah', '', ''],
];
// OKR!A1:L
const OKR = [
  ['ID', 'Periode', 'Objective', 'Key Result', 'Owner', 'Arah', 'Baseline', 'Target', 'Query', 'Ambil', 'Status', 'Catatan'],
  ['O1.KR1', 'Q3 2026', 'Kualitas naik', 'Ketepatan waktu QC 90%', 'Nynda', 'naik', '0.5', '0.9', 'view=ontime&stage=QC', 'data.on_time_rate', '', ''],
  ['O1.KR2', 'Q3 2026', 'Kualitas naik', 'Task terbuka turun ke 1', 'Nynda', 'turun', '2', '1', 'view=summary', 'data.open', '', ''],
  ['O2.KR1', 'Q3 2026', 'Tim sehat', 'Skor survei 4.2', 'Nynda', 'naik', '3.8', '4.2', '', '', '', 'Diukur manual'],
  ['O2.KR2', 'Q3 2026', 'Tim sehat', 'Baris setengah terisi', 'Nynda', 'naik', '1', '2', 'view=summary', '', '', ''],
  ['O3.KR1', 'Q2 2026', 'Periode lain', 'Jalur Ambil salah', 'Nynda', 'naik', '1', '2', 'view=summary', 'data.tidak_ada', '', ''],
];

const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'googleapis') {
    return {
      google: {
        auth: { GoogleAuth: class { async getClient() { return {}; } } },
        sheets: () => ({
          spreadsheets: {
            values: {
              get: async ({ spreadsheetId, range }) => {
                if (spreadsheetId === OKR_ID) return { data: { values: OKR } };
                if (/^Main!/.test(range)) return { data: { values: MAIN } };
                if (/^ACTIVITY!/.test(range)) return { data: { values: ACTIVITY } };
                return { data: { values: [] } };
              },
            },
          },
        }),
      },
    };
  }
  return origLoad.apply(this, arguments);
};

process.env.SPREADSHEET_ID = TASK_ID;
process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: 'x@y.z', private_key: 'k' });
process.env.METRICS_TOKENS = 'manager:tok-mgr,okr-mcp:tok-mcp';
process.env.METRICS_CACHE_SECONDS = '0';
process.env.OKR_SHEET_ID = OKR_ID;

const mcp = require('../api/mcp');
const { pluck, toNum, parseQueryString, progressOf, reached, toolListPayload } = mcp._internals;

/* ---------------- Pemanggil HTTP tiruan ---------------- */
function post(body, token, method) {
  return new Promise((resolve) => {
    const headers = {};
    if (token) headers.authorization = 'Bearer ' + token;
    const res = {
      _s: 200, _h: {},
      setHeader(k, v) { this._h[k] = v; },
      status(c) { this._s = c; return this; },
      end(b) { resolve({ status: this._s, headers: this._h, json: b ? JSON.parse(b) : null }); },
    };
    mcp({ method: method || 'POST', body, headers, on() {} }, res);
  });
}
const rpc = (id, m, params) => ({ jsonrpc: '2.0', id, method: m, params });
const callTool = async (name, args, token) => {
  const r = await post(rpc(99, 'tools/call', { name, arguments: args || {} }), token || 'tok-mcp');
  const raw = r.json.result.content[0].text;
  // Hasil sukses berupa JSON; hasil gagal berupa kalimat biasa supaya model bisa
  // langsung membaca sebabnya. Jadi parsing di sini memang boleh gagal.
  let data = null;
  try { data = JSON.parse(raw); } catch (e) { /* biarkan null */ }
  return { isError: r.json.result.isError, data, raw };
};

/* ---------------- Fungsi murni ---------------- */
console.log('Fungsi bantu:');
eq('querystring dipecah', JSON.stringify(parseQueryString('view=ontime&stage=QC')), '{"view":"ontime","stage":"QC"}');
eq('querystring dengan spasi ter-encode', parseQueryString('status=Review%20PM').status, 'Review PM');
eq('querystring dengan plus', parseQueryString('q=edit+video').q, 'edit video');
eq('querystring kosong', JSON.stringify(parseQueryString('')), '{}');
eq('pluck jalur dalam', pluck({ data: { a: { b: 7 } } }, 'data.a.b'), 7);
ok('pluck jalur tak ada -> undefined', pluck({ data: {} }, 'data.x.y') === undefined);
eq('toNum teks angka', toNum('0.9'), 0.9);
ok('toNum kosong -> null', toNum('') === null);
ok('toNum bukan angka -> null', toNum('abc') === null);

console.log('\nProgres & pencapaian:');
eq('arah naik: setengah jalan', progressOf(0.7, 0.5, 0.9), 0.5);
eq('arah turun: setengah jalan', progressOf(1.5, 2, 1), 0.5);
eq('melampaui target', progressOf(1.0, 0.5, 0.9), 1.25);
ok('tanpa baseline -> null', progressOf(0.7, null, 0.9) === null);
ok('baseline sama dengan target -> null', progressOf(0.7, 0.9, 0.9) === null);
ok('naik: tercapai', reached(0.95, 0.9, 'naik') === true);
ok('naik: belum', reached(0.85, 0.9, 'naik') === false);
// Tanpa kolom Arah, KR menurun akan dinilai terbalik — inilah sebabnya kolom itu wajib.
ok('turun: 1 di bawah target 5 = tercapai', reached(1, 5, 'turun') === true);
ok('turun tanpa arah -> dinilai terbalik', reached(1, 5, '') === false);

/* ---------------- Protokol ---------------- */
(async () => {
  console.log('\nProtokol MCP:');
  let r = await post(rpc(1, 'initialize', { protocolVersion: '2025-06-18' }), 'tok-mcp');
  eq('initialize dibalas', r.status, 200);
  eq('versi protokol dipenuhi', r.json.result.protocolVersion, '2025-06-18');
  eq('nama server', r.json.result.serverInfo.name, 'task-tracker-okr');
  ok('kemampuan tools diumumkan', !!r.json.result.capabilities.tools);
  ok('instruksi menyebut caveats', /caveats/i.test(r.json.result.instructions));

  r = await post(rpc(2, 'initialize', { protocolVersion: '1999-01-01' }), 'tok-mcp');
  eq('versi tak dikenal -> dibalas versi terbaru', r.json.result.protocolVersion, '2025-06-18');

  r = await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, 'tok-mcp');
  eq('notifikasi tidak dibalas', r.status, 202);
  ok('notifikasi tanpa badan jawaban', r.json === null);

  r = await post(rpc(3, 'ping'), 'tok-mcp');
  eq('ping dijawab', JSON.stringify(r.json.result), '{}');

  r = await post(rpc(4, 'metode/ngawur'), 'tok-mcp');
  eq('metode tak dikenal', r.json.error.code, -32601);

  console.log('\nDaftar tool:');
  r = await post(rpc(5, 'tools/list'), 'tok-mcp');
  const tools = r.json.result.tools;
  eq('jumlah tool', tools.length, 8);
  ok('semua punya skema masukan', tools.every((t) => t.inputSchema && t.inputSchema.type === 'object'));
  ok('semua tool task_* mengingatkan soal caveats',
    tools.filter((t) => t.name.startsWith('task_')).every((t) => /caveats/i.test(t.description)));
  ok('daftar tool tak membocorkan fungsi internal', toolListPayload().every((t) => t.run === undefined));

  console.log('\nAutentikasi:');
  r = await post(rpc(6, 'tools/list'), 'token-salah');
  eq('token salah ditolak', r.status, 401);
  eq('klien diberi tahu perlu Bearer', r.headers['WWW-Authenticate'], 'Bearer realm="task-tracker-okr"');
  r = await post(rpc(7, 'tools/list'), null);
  eq('tanpa token ditolak', r.status, 401);
  // Header lama tetap diterima supaya klien yang tak bisa menyetel Authorization tetap jalan.
  const viaShim = await new Promise((resolve) => {
    const res = { _s: 200, setHeader() {}, status(c) { this._s = c; return this; }, end(b) { resolve({ status: this._s, json: JSON.parse(b) }); } };
    mcp({ method: 'POST', body: rpc(8, 'tools/list'), headers: { 'x-metrics-token': 'tok-mgr' }, on() {} }, res);
  });
  eq('x-metrics-token juga diterima', viaShim.status, 200);

  console.log('\nMetode HTTP:');
  r = await post(null, 'tok-mcp', 'GET');
  eq('GET ditolak (server tak beraliran SSE)', r.status, 405);
  r = await post(null, 'tok-mcp', 'DELETE');
  eq('DELETE diterima (stateless)', r.status, 200);

  console.log('\nTool task_*:');
  let t = await callTool('task_summary');
  ok('task_summary sukses', t.isError === false);
  eq('total task', t.data.data.total, 4);
  eq('terbuka', t.data.data.open, 2);
  ok('caveats ikut dibawa', Array.isArray(t.data.caveats));

  t = await callTool('task_ontime', { stage: 'QC' });
  eq('ontime: yang bisa dinilai', t.data.data.scored, 2);
  eq('ontime: tepat waktu (TSK-001)', t.data.data.on_time, 1);
  eq('ontime: telat (TSK-002)', t.data.data.late, 1);

  t = await callTool('task_list', { limit: 1 });
  ok('task_list menyembunyikan catatan bebas secara bawaan', t.data.data.tasks[0].picNotes === undefined);
  t = await callTool('task_list', { limit: 1, include_notes: true });
  eq('include_notes membuka catatan task', t.data.data.tasks[0].picNotes, 'cat pic');

  t = await callTool('task_aging', { minDays: 1 });
  ok('aging hanya task terbuka', t.data.data.tasks.every((x) => x.status !== 'Done'));

  t = await callTool('task_throughput', { groupBy: 'stage' });
  eq('throughput: total selesai', t.data.data.total_completed, 2);

  console.log('\nTool okr_*:');
  t = await callTool('okr_list');
  eq('okr_list membaca semua baris', t.data.count, 5);
  t = await callTool('okr_list', { periode: 'Q2 2026' });
  eq('okr_list menyaring periode', t.data.count, 1);

  t = await callTool('okr_progress', { periode: 'Q3 2026' });
  eq('okr_progress: KR periode itu', t.data.count, 4);
  const byId = Object.fromEntries(t.data.okr.map((x) => [x.id, x]));

  eq('KR terukur otomatis', byId['O1.KR1'].measured, 'auto');
  eq('nilai sekarang dari data task', byId['O1.KR1'].current, 0.5);
  eq('progres dihitung dari baseline', byId['O1.KR1'].progress, 0);
  ok('caveats KR ikut dibawa', Array.isArray(byId['O1.KR1'].caveats));

  eq('KR arah turun terukur', byId['O1.KR2'].measured, 'auto');
  eq('KR arah turun: nilai sekarang', byId['O1.KR2'].current, 2);
  ok('KR arah turun belum tercapai', byId['O1.KR2'].target_reached === false);

  eq('KR manual ditandai, bukan dikarang', byId['O2.KR1'].measured, 'manual');
  ok('KR manual tak punya angka current', byId['O2.KR1'].current === undefined);

  eq('baris setengah terisi ditandai error', byId['O2.KR2'].measured, 'error');
  ok('pesannya menjelaskan sebabnya', /setengah terisi/i.test(byId['O2.KR2'].error));

  t = await callTool('okr_progress', { id: 'O3.KR1' });
  eq('jalur Ambil salah ditandai error', t.data.okr[0].measured, 'error');
  ok('pesannya menyebut jalurnya', /data\.tidak_ada/.test(t.data.okr[0].error));

  console.log('\nKegagalan tool tidak merusak sesi:');
  const r2 = await post(rpc(20, 'tools/call', { name: 'ngawur', arguments: {} }), 'tok-mcp');
  eq('tool tak dikenal -> error JSON-RPC', r2.json.error.code, -32602);
  const saved = process.env.OKR_SHEET_ID;
  process.env.OKR_SHEET_ID = '';
  const noSheet = await callTool('okr_list');
  ok('sheet OKR belum diset -> isError, bukan sesi rusak', noSheet.isError === true);
  ok('pesannya memberi tahu apa yang harus dilakukan', /OKR_SHEET_ID/.test(noSheet.raw));
  process.env.OKR_SHEET_ID = saved;

  console.log(`\n✅ Semua ${passed} assertion lulus.`);
  Module._load = origLoad;
})().catch((e) => { console.error('\n❌ GAGAL:', e && e.stack ? e.stack : e); process.exit(1); });
