/**
 * ============================================================
 * MCP SERVER — jembatan Claude di device manager
 *
 * Bicara protokol MCP lewat Streamable HTTP (JSON-RPC 2.0 di atas POST), jadi
 * device manapun cukup menempelkan URL — tak ada yang perlu dipasang di
 * perangkatnya, dan tak ada kredensial Google yang turun ke sana.
 *
 * Berkas ini SATU-SATUNYA tempat yang tahu dua dunia sekaligus: metrik task
 * tracker dan sheet OKR. Memang itu tugasnya — dia jembatannya. Yang tetap
 * terpisah adalah datanya dan kode task tracker-nya sendiri: `_sheets.js`,
 * `rpc.js`, dan `metrics.js` tidak mengenal satu pun istilah OKR.
 *
 * Batas kemampuannya:
 *   - Task tracker  : BACA SAJA, lewat runQuery() milik metrics.js
 *   - Sheet OKR     : BACA SAJA (scope spreadsheets.readonly)
 *   - Data pribadi  : tak terjangkau — metrics.js hanya menyentuh Main & ACTIVITY
 *
 * Autentikasi: `Authorization: Bearer <token>` (standar MCP) atau
 * `x-metrics-token`. Token yang sama dengan endpoint metrics, jadi mencabut
 * satu baris di METRICS_TOKENS langsung menutup dua-duanya.
 * ============================================================
 */

const metrics = require('./metrics.js');

const SERVER_NAME = 'task-tracker-okr';
const SERVER_VERSION = '1.0.0';
// Versi protokol yang dipahami. Kalau klien meminta versi lain, dibalas dengan
// yang terbaru di sini — klien yang menentukan apakah masih mau lanjut.
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const DEFAULT_PROTOCOL = SUPPORTED_PROTOCOLS[0];

/* ------------------------------------------------------------------ */
/* Sheet OKR                                                           */
/* ------------------------------------------------------------------ */

function okrSheetId() {
  return String(process.env.OKR_SHEET_ID || '').trim();
}

function okrTab() {
  return String(process.env.OKR_SHEET_TAB || 'OKR').trim() || 'OKR';
}

let _okrCache = null;

/**
 * Baca sheet OKR jadi daftar objek berkunci nama kolom.
 *
 * Scope-nya `spreadsheets.readonly` — bukan sekadar niat baik, tapi batas yang
 * ditegakkan Google: token yang terbit dari sini memang tak bisa menulis, jadi
 * salah kode sekalipun tak bisa merusak sheet OKR manager.
 */
async function readOkrRows() {
  const id = okrSheetId();
  if (!id) {
    const e = new Error('OKR_SHEET_ID belum diset di server, jadi sheet OKR belum tersambung.');
    e.code = 'NO_OKR_SHEET';
    throw e;
  }
  const ttl = 45000;
  if (_okrCache && Date.now() - _okrCache.at < ttl) return _okrCache.rows;

  const { google } = require('googleapis');
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Env GOOGLE_SERVICE_ACCOUNT_JSON belum diset.');
  const credentials = JSON.parse(raw);
  if (credentials.private_key) credentials.private_key = String(credentials.private_key).replace(/\\n/g, '\n');

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${okrTab()}!A1:L` });
  const values = res.data.values || [];
  const head = (values[0] || []).map((h) => String(h).trim());
  const rows = values.slice(1)
    .map((r) => {
      const o = {};
      head.forEach((h, i) => { o[h] = String(r[i] === undefined ? '' : r[i]).trim(); });
      return o;
    })
    .filter((o) => Object.values(o).some((v) => v !== ''));

  _okrCache = { at: Date.now(), rows };
  return rows;
}

/** Ambil nilai lewat jalur bertitik, mis. "data.on_time_rate". */
function pluck(obj, dotPath) {
  return String(dotPath || '').split('.').reduce(
    (acc, key) => (acc === null || acc === undefined ? undefined : acc[key]),
    obj,
  );
}

function toNum(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Querystring "a=1&b=2" -> { a: '1', b: '2' }. */
function parseQueryString(qs) {
  const out = {};
  String(qs || '').split('&').forEach((pair) => {
    if (!pair) return;
    const i = pair.indexOf('=');
    const k = decodeURIComponent(i < 0 ? pair : pair.slice(0, i)).trim();
    const v = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' ')).trim();
    if (k) out[k] = v;
  });
  return out;
}

/**
 * Progres = seberapa jauh perjalanan baseline -> target sudah ditempuh.
 * Rumus yang sama bekerja dua arah: pada KR "turun", pembilang dan penyebutnya
 * sama-sama negatif. Tanpa baseline, progres memang tak bisa dihitung —
 * "55% menuju 90%" tak bermakna kalau tak diketahui berangkat dari mana.
 */
function progressOf(current, baseline, target) {
  if (current === null || baseline === null || target === null) return null;
  if (target === baseline) return null;
  return Math.round(((current - baseline) / (target - baseline)) * 1000) / 1000;
}

function reached(current, target, arah) {
  if (current === null || target === null) return null;
  return String(arah || '').toLowerCase() === 'turun' ? current <= target : current >= target;
}

/* ------------------------------------------------------------------ */
/* Definisi tool                                                       */
/* ------------------------------------------------------------------ */

const CAVEAT_NOTE = 'Jawaban memuat "caveats" — keterbatasan data di balik angkanya. '
  + 'SELALU sampaikan isi caveats bersama angkanya; angka tanpa konteks itu menyesatkan.';

const FILTER_PROPS = {
  from: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD (inklusif).' },
  to: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD (inklusif).' },
  stage: { type: 'string', description: 'Saring satu stage, mis. "QC".' },
  platform: { type: 'string', description: 'Saring satu platform. Cocok juga di sel bernilai ganda.' },
  pic: { type: 'string', description: 'Saring satu PIC.' },
  status: { type: 'string', description: 'Saring satu status, mis. "Review PM".' },
  priority: { type: 'string', description: 'Saring satu prioritas.' },
  q: { type: 'string', description: 'Cari potongan kata di nama task.' },
};

const obj = (props, required) => ({
  type: 'object',
  properties: props,
  required: required || [],
  additionalProperties: false,
});

const TOOLS = [
  {
    name: 'task_summary',
    description: `Kondisi task tim SAAT INI: total, terbuka, selesai, dan sebarannya per status/stage/PIC/platform/prioritas. Rentang tanggal mengacu ke tanggal task dibuat. ${CAVEAT_NOTE}`,
    inputSchema: obj(FILTER_PROPS),
    run: (a) => metrics.runQuery({ view: 'summary', ...a }),
  },
  {
    name: 'task_throughput',
    description: `Berapa task SELESAI per bulan atau minggu. Rentang tanggal mengacu ke tanggal selesai. Dihitung per task, bukan per kejadian log. ${CAVEAT_NOTE}`,
    inputSchema: obj({
      ...FILTER_PROPS,
      bucket: { type: 'string', enum: ['month', 'week'], description: 'Satuan periode. Default month.' },
      groupBy: { type: 'string', enum: ['stage', 'platform', 'pic', 'priority'], description: 'Pecah tiap periode per dimensi ini.' },
    }),
    run: (a) => metrics.runQuery({ view: 'throughput', ...a }),
  },
  {
    name: 'task_ontime',
    description: `Ketepatan waktu: berapa persen task selesai sebelum tenggat. HANYA menilai task yang punya Due Date DAN tanggal selesai yang bisa dipastikan — sisanya masuk "not_scored", dan yang gugur karena tak bertanggal ada di "excluded". Rentang tanggal mengacu ke tanggal selesai. ${CAVEAT_NOTE}`,
    inputSchema: obj(FILTER_PROPS),
    run: (a) => metrics.runQuery({ view: 'ontime', ...a }),
  },
  {
    name: 'task_workload',
    description: `Beban tiap PIC: berapa terbuka, selesai, dan lewat tenggat, dipecah per status. Diurutkan dari yang paling banyak task terbuka. ${CAVEAT_NOTE}`,
    inputSchema: obj(FILTER_PROPS),
    run: (a) => metrics.runQuery({ view: 'workload', ...a }),
  },
  {
    name: 'task_aging',
    description: `Task terbuka yang lama tak bergerak. PENTING: perhatikan "basis" tiap baris — kalau "createdDate", umurnya dihitung dari tanggal dibuat karena perubahan status terakhirnya tak tercatat, sehingga terlihat LEBIH TUA dari kenyataan. ${CAVEAT_NOTE}`,
    inputSchema: obj({
      ...FILTER_PROPS,
      minDays: { type: 'number', description: 'Minimal berapa hari mandek baru ditampilkan. Default 14.' },
      limit: { type: 'number', description: 'Maksimal baris. Default 50.' },
    }),
    run: (a) => metrics.runQuery({ view: 'aging', ...a }),
  },
  {
    name: 'task_list',
    description: `Daftar task tersaring dengan detailnya. Catatan bebas (PIC Notes / PM Notes) tidak ikut kecuali include_notes=true. Catatan pribadi per orang tidak pernah bisa diambil dengan cara apa pun. ${CAVEAT_NOTE}`,
    inputSchema: obj({
      ...FILTER_PROPS,
      limit: { type: 'number', description: 'Maksimal baris, batas keras 500. Default 100.' },
      include_notes: { type: 'boolean', description: 'Ikutkan PIC Notes & PM Notes.' },
    }),
    run: (a) => {
      const { include_notes, ...rest } = a;
      return metrics.runQuery({ view: 'tasks', ...rest, include: include_notes ? 'notes' : '' });
    },
  },
  {
    name: 'okr_list',
    description: 'Daftar Objective & Key Result dari sheet OKR, apa adanya tanpa menghitung apa pun. Pakai ini untuk melihat apa saja yang sedang dikejar dan bagaimana cara ukurnya didefinisikan.',
    inputSchema: obj({
      periode: { type: 'string', description: 'Saring satu periode, mis. "Q3 2026".' },
    }),
    run: async (a) => {
      const rows = await readOkrRows();
      const filtered = a.periode
        ? rows.filter((r) => String(r.Periode || '').toLowerCase() === String(a.periode).toLowerCase())
        : rows;
      return { ok: true, source: 'sheet OKR', count: filtered.length, okr: filtered };
    },
  },
  {
    name: 'okr_progress',
    description: `Progres tiap Key Result: menjalankan kolom "Query"/"Ambil" milik KR ke data task tracker, lalu membandingkan nilai sekarang terhadap baseline dan target. KR yang kolom Query-nya kosong memang sengaja diukur manual — laporkan apa adanya, jangan dikarang. ${CAVEAT_NOTE}`,
    inputSchema: obj({
      periode: { type: 'string', description: 'Saring satu periode, mis. "Q3 2026".' },
      id: { type: 'string', description: 'Hitung satu KR saja berdasarkan kolom ID, mis. "O1.KR1".' },
    }),
    run: async (a) => {
      const rows = await readOkrRows();
      let list = rows;
      if (a.periode) list = list.filter((r) => String(r.Periode || '').toLowerCase() === String(a.periode).toLowerCase());
      if (a.id) list = list.filter((r) => String(r.ID || '').toLowerCase() === String(a.id).toLowerCase());

      const out = [];
      for (const r of list) {
        const base = {
          id: r.ID || '', periode: r.Periode || '', objective: r.Objective || '',
          key_result: r['Key Result'] || '', owner: r.Owner || '', arah: r.Arah || '',
          baseline: toNum(r.Baseline), target: toNum(r.Target),
          status_manual: r.Status || '', catatan: r.Catatan || '',
        };
        const query = r.Query || '';
        const ambil = r.Ambil || '';

        if (!query && !ambil) {
          out.push({ ...base, measured: 'manual', note: 'Diukur di luar task tracker. Nilainya tidak ada di sini.' });
          continue;
        }
        if (!query || !ambil) {
          out.push({ ...base, measured: 'error', error: `Baris setengah terisi: Query="${query}" Ambil="${ambil}". Keduanya harus diisi, atau keduanya dikosongkan.` });
          continue;
        }
        try {
          const res = await metrics.runQuery(parseQueryString(query));
          const current = toNum(pluck(res, ambil));
          if (current === null) {
            out.push({ ...base, measured: 'error', error: `Jalur "${ambil}" tidak menghasilkan angka pada jawaban query ini.` });
            continue;
          }
          out.push({
            ...base,
            measured: 'auto',
            current,
            progress: progressOf(current, base.baseline, base.target),
            target_reached: reached(current, base.target, base.arah),
            warnings: [
              base.baseline === null ? 'Baseline kosong — progres tak bisa dihitung, hanya nilai mentahnya yang berarti.' : null,
              !base.arah ? 'Kolom Arah kosong — tak diketahui apakah target ini batas bawah atau batas atas.' : null,
            ].filter(Boolean),
            caveats: res.caveats || [],
            as_of: res.as_of,
          });
        } catch (e) {
          out.push({ ...base, measured: 'error', error: `Query ditolak: ${e.message}` });
        }
      }
      return { ok: true, count: out.length, okr: out };
    },
  },
];

const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
const toolListPayload = () => TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

/* ------------------------------------------------------------------ */
/* JSON-RPC                                                            */
/* ------------------------------------------------------------------ */

const rpcOk = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcErr = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

async function handleRpc(msg) {
  const { id, method, params } = msg || {};

  if (method === 'initialize') {
    const asked = String((params && params.protocolVersion) || '');
    return rpcOk(id, {
      protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : DEFAULT_PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      instructions: 'Data task tracker bersifat BACA-SAJA. Setiap jawaban memuat "caveats" '
        + 'berisi keterbatasan data di baliknya — sampaikan selalu bersama angkanya, jangan dibuang.',
    });
  }
  if (method === 'ping') return rpcOk(id, {});
  if (method === 'tools/list') return rpcOk(id, { tools: toolListPayload() });

  if (method === 'tools/call') {
    const name = params && params.name;
    const tool = TOOL_BY_NAME[name];
    if (!tool) return rpcErr(id, -32602, `Tool "${name}" tidak dikenal.`);
    const args = (params && params.arguments && typeof params.arguments === 'object') ? params.arguments : {};
    try {
      const result = await tool.run(args);
      return rpcOk(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: false });
    } catch (e) {
      // Kegagalan tool dikembalikan sebagai hasil ber-isError, bukan error
      // JSON-RPC — supaya model bisa membaca sebabnya dan mencoba cara lain,
      // alih-alih sesinya yang dianggap rusak.
      const text = e && e.code === 'NO_OKR_SHEET'
        ? `${e.message} Sheet OKR perlu dibuat lalu ID-nya diset di env OKR_SHEET_ID. Tool task_* tetap bisa dipakai.`
        : String((e && e.message) || e);
      return rpcOk(id, { content: [{ type: 'text', text }], isError: true });
    }
  }

  return rpcErr(id, -32601, `Method "${method}" tidak didukung.`);
}

/* ------------------------------------------------------------------ */
/* Handler HTTP                                                        */
/* ------------------------------------------------------------------ */

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) {
    try { return JSON.parse(req.body); } catch (e) { return null; }
  }
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      if (!data) return resolve(null);
      try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

/** Token boleh lewat Bearer (standar MCP) atau x-metrics-token. Tak pernah lewat URL. */
function authorize(req) {
  const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  const shim = { headers: { 'x-metrics-token': bearer ? bearer[1].trim() : (req.headers['x-metrics-token'] || '') } };
  return metrics.identify(shim);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'DELETE') return res.status(200).end();   // penutupan sesi — server ini stateless
  if (req.method === 'GET') {
    // Streamable HTTP memakai GET untuk membuka aliran SSE. Server ini tak
    // pernah mengirim pesan atas inisiatif sendiri, jadi alirannya tak perlu ada.
    res.setHeader('Allow', 'POST, DELETE');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(405).end(JSON.stringify({ error: 'Server ini tidak membuka aliran SSE. Kirim JSON-RPC lewat POST.' }));
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, DELETE');
    return res.status(405).end();
  }

  const auth = authorize(req);
  if (!auth.ok) {
    // WWW-Authenticate memberi tahu klien bahwa yang kurang memang kredensial,
    // bukan alamatnya yang salah.
    res.setHeader('WWW-Authenticate', 'Bearer realm="task-tracker-okr"');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const message = auth.reason === 'NO_TOKEN_CONFIGURED'
      ? 'METRICS_TOKENS belum diset di server.'
      : 'Perlu token yang sah lewat header Authorization: Bearer <token>.';
    return res.status(401).end(JSON.stringify(rpcErr(null, -32001, message)));
  }

  const body = await readJsonBody(req);
  if (!body) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(400).end(JSON.stringify(rpcErr(null, -32700, 'Body bukan JSON yang sah.')));
  }

  const batch = Array.isArray(body) ? body : [body];
  const replies = [];
  for (const msg of batch) {
    // Notifikasi (tanpa id) tidak dibalas — begitu aturan JSON-RPC.
    if (msg && msg.id === undefined) continue;
    try {
      replies.push(await handleRpc(msg));
    } catch (e) {
      console.error('[mcp] method=%s caller=%s error:', msg && msg.method, auth.label, e && e.stack ? e.stack : e);
      replies.push(rpcErr(msg && msg.id, -32603, String((e && e.message) || e)));
    }
  }

  if (!replies.length) return res.status(202).end();   // seluruhnya notifikasi
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).end(JSON.stringify(Array.isArray(body) ? replies : replies[0]));
};

module.exports._internals = {
  TOOLS, TOOL_BY_NAME, toolListPayload, handleRpc, authorize, readOkrRows,
  pluck, toNum, parseQueryString, progressOf, reached, SUPPORTED_PROTOCOLS, DEFAULT_PROTOCOL,
};
