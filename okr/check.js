#!/usr/bin/env node
/**
 * ============================================================
 * PEMERIKSA JEMBATAN OKR -> METRICS
 *
 * Membaca daftar Key Result (dari Google Sheet OKR atau berkas CSV), lalu
 * menjalankan kolom `Query` masing-masing ke endpoint metrics dan melaporkan
 * nilai yang keluar.
 *
 * Gunanya satu: menemukan KR yang cara ukurnya SALAH sebelum manager terlanjur
 * memakainya. Query yang typo tidak memunculkan error saat diisi di spreadsheet
 * — barunya ketahuan berbulan-bulan kemudian saat angkanya dipertanyakan.
 *
 * Skrip ini BUKAN bagian dari aplikasi. Tidak dipanggil dari api/, tidak ikut
 * ter-deploy. Sistem OKR memang sengaja berdiri di luar task tracker; berkas ini
 * hanya alat bantu supaya sambungannya bisa diuji.
 *
 * Pemakaian:
 *   node okr/check.js --csv okr/template.csv
 *   node okr/check.js --sheet <ID_SHEET_OKR>
 *
 * Perlu:
 *   METRICS_TOKEN   token endpoint metrics   (atau --token <t>)
 *   METRICS_BASE    URL dasar                (atau --base <url>)
 *   Untuk --sheet: GOOGLE_APPLICATION_CREDENTIALS atau credentials.json di root,
 *   dan sheet OKR harus di-share ke service account itu (cukup akses Viewer).
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------------ */
/* Argumen                                                             */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = { csv: '', sheet: '', token: '', base: '', tab: 'OKR' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--csv') out.csv = argv[++i] || '';
    else if (a === '--sheet') out.sheet = argv[++i] || '';
    else if (a === '--token') out.token = argv[++i] || '';
    else if (a === '--base') out.base = argv[++i] || '';
    else if (a === '--tab') out.tab = argv[++i] || 'OKR';
  }
  out.token = out.token || process.env.METRICS_TOKEN || '';
  out.base = (out.base || process.env.METRICS_BASE || 'https://product-task-tracker.vercel.app').replace(/\/+$/, '');
  out.sheet = out.sheet || process.env.OKR_SHEET_ID || '';
  return out;
}

/* ------------------------------------------------------------------ */
/* Pembacaan CSV                                                       */
/* ------------------------------------------------------------------ */

/**
 * Pembaca CSV yang menghormati tanda kutip — kolom Catatan sering memuat koma,
 * dan pemisahan naif akan menggeser seluruh kolom setelahnya tanpa error.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const s = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; }   // kutip ganda = satu kutip literal
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const head = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((r) => {
    const o = {};
    head.forEach((h, i) => { o[h] = String(r[i] === undefined ? '' : r[i]).trim(); });
    return o;
  });
}

async function readFromSheet(sheetId, tab) {
  const { google } = require('googleapis');
  let credentials = null;
  const local = path.join(__dirname, '..', 'credentials.json');
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  else if (fs.existsSync(local)) credentials = JSON.parse(fs.readFileSync(local, 'utf8'));
  else throw new Error('Kredensial tak ditemukan. Set GOOGLE_SERVICE_ACCOUNT_JSON atau taruh credentials.json di root.');
  if (credentials.private_key) credentials.private_key = String(credentials.private_key).replace(/\\n/g, '\n');

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${tab}!A1:L` });
  return rowsToObjects(res.data.values || []);
}

/* ------------------------------------------------------------------ */
/* Pemanggilan metrics                                                 */
/* ------------------------------------------------------------------ */

async function callMetrics(base, token, query) {
  const url = `${base}/api/metrics?${query}`;
  const res = await fetch(url, { headers: { 'x-metrics-token': token } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* biar ditangani pemanggil */ }
  return { status: res.status, json, raw: text };
}

/** Ambil nilai lewat jalur bertitik, mis. "data.on_time_rate". */
function pluck(obj, dotPath) {
  return String(dotPath || '').split('.').reduce(
    (acc, key) => (acc === null || acc === undefined ? undefined : acc[key]),
    obj,
  );
}

/* ------------------------------------------------------------------ */
/* Penilaian                                                           */
/* ------------------------------------------------------------------ */

const num = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Progres = seberapa jauh perjalanan dari baseline ke target sudah ditempuh.
 *
 * Rumus yang sama bekerja untuk dua arah: pada KR "turun", target lebih kecil
 * dari baseline sehingga pembilang dan penyebut sama-sama negatif. Yang TIDAK
 * bisa dihitung adalah KR tanpa baseline — "55% menuju 90%" tak bermakna kalau
 * tak diketahui berangkat dari 20% atau dari 54%.
 */
function progressOf(current, baseline, target) {
  if (current === null || baseline === null || target === null) return null;
  if (target === baseline) return null;
  return (current - baseline) / (target - baseline);
}

function tercapai(current, target, arah) {
  if (current === null || target === null) return null;
  return String(arah || '').toLowerCase() === 'turun' ? current <= target : current >= target;
}

const pct = (v) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const show = (v) => (v === null || v === undefined ? '—' : String(v));

/* ------------------------------------------------------------------ */
/* Utama                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.csv && !args.sheet) {
    console.error('Perlu --csv <berkas> atau --sheet <id>. Lihat docs/OKR.md.');
    process.exit(2);
  }
  if (!args.token) {
    console.error('Perlu token metrics: set METRICS_TOKEN atau pakai --token <t>.');
    process.exit(2);
  }

  const rows = args.csv
    ? rowsToObjects(parseCsv(fs.readFileSync(args.csv, 'utf8')))
    : await readFromSheet(args.sheet, args.tab);

  console.log(`Sumber : ${args.csv || `sheet ${args.sheet} (tab ${args.tab})`}`);
  console.log(`Endpoint: ${args.base}`);
  console.log(`KR terbaca: ${rows.length}\n`);

  let bermasalah = 0;
  let manual = 0;
  let berkaveat = 0;

  for (const r of rows) {
    const id = r.ID || '(tanpa ID)';
    const kr = r['Key Result'] || '';
    const query = r.Query || '';
    const ambil = r.Ambil || '';

    console.log(`${id}  ${kr}`);

    if (!query && !ambil) {
      manual++;
      console.log('  diisi manual — tidak diukur dari task tracker\n');
      continue;
    }
    if (!query || !ambil) {
      bermasalah++;
      console.log(`  ⚠ SETENGAH TERISI — Query="${query}" Ambil="${ambil}". Isi keduanya, atau kosongkan keduanya.\n`);
      continue;
    }

    let res;
    try {
      res = await callMetrics(args.base, args.token, query);
    } catch (e) {
      bermasalah++;
      console.log(`  ⚠ GAGAL memanggil endpoint: ${e.message}\n`);
      continue;
    }

    if (res.status !== 200 || !res.json || res.json.ok !== true) {
      bermasalah++;
      const pesan = (res.json && (res.json.message || res.json.error)) || res.raw.slice(0, 120);
      console.log(`  ⚠ QUERY DITOLAK (HTTP ${res.status}): ${pesan}`);
      console.log(`     query: ${query}\n`);
      continue;
    }

    const current = num(pluck(res.json, ambil));
    if (current === null) {
      bermasalah++;
      console.log(`  ⚠ JALUR "${ambil}" tidak menghasilkan angka. Periksa ejaannya terhadap jawaban endpoint.\n`);
      continue;
    }

    const baseline = num(r.Baseline);
    const target = num(r.Target);
    const prog = progressOf(current, baseline, target);
    const sudah = tercapai(current, target, r.Arah);

    console.log(`  sekarang ${show(current)}   baseline ${show(baseline)} → target ${show(target)} (${r.Arah || 'arah tak diisi'})`);
    console.log(`  progres  ${pct(prog)}${sudah === null ? '' : sudah ? '   ✓ target tercapai' : ''}`);
    if (baseline === null) console.log('  ⚠ Baseline kosong — progres tak bisa dihitung, hanya nilai mentahnya yang berarti.');
    if (!r.Arah) console.log('  ⚠ Kolom Arah kosong — tak diketahui apakah target ini batas bawah atau batas atas.');

    // Caveat ditempelkan ke KR-nya masing-masing, tidak dikumpulkan jadi satu
    // daftar global. Tiap KR menyaring data yang berbeda, jadi "69% punya Due
    // Date" pada satu KR dan "82%" pada KR lain sama-sama benar — digabung,
    // keduanya malah terbaca seperti saling bertentangan.
    const caveats = res.json.caveats || [];
    if (caveats.length) {
      berkaveat++;
      caveats.forEach((c) => console.log(`  · ${c}`));
    }
    console.log('');
  }

  console.log('─'.repeat(60));
  console.log(`Terukur otomatis : ${rows.length - manual - bermasalah}`);
  console.log(`Diisi manual     : ${manual}`);
  console.log(`Bermasalah       : ${bermasalah}`);
  if (berkaveat) {
    console.log(`\n${berkaveat} KR punya catatan keterbatasan data. Sampaikan catatannya bersama angkanya saat review — bukan angkanya saja.`);
  }

  process.exit(bermasalah > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch((e) => { console.error('GAGAL:', e && e.message ? e.message : e); process.exit(1); });
}

module.exports = { parseCsv, rowsToObjects, pluck, progressOf, tercapai, num };
