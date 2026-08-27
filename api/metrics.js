/**
 * ============================================================
 * TASK TRACKER — ENDPOINT METRICS (READ-ONLY)
 *
 * Kontrak data untuk sistem LUAR (mis. sistem OKR milik manager).
 * Bentuk keluaran endpoint ini SENGAJA dijaga stabil: struktur sheet
 * boleh berubah, tapi jawaban di sini harus tetap sama bentuknya.
 *
 * Tiga aturan yang menjaga endpoint ini tetap aman:
 *
 *  1. HANYA GET. Tidak ada satu pun jalur tulis di file ini. Metode
 *     selain GET ditolak sebelum apa pun dibaca.
 *  2. HANYA dua sumber: getTasks() (sheet Main) dan getActivityLog()
 *     (sheet ACTIVITY). Sheet NOTES, COMMENTS, LINKS, USERS, AUTH,
 *     CHECKLIST, COLLAB, dan NOTIFICATIONS tidak pernah disentuh —
 *     ini dijamin oleh konstruksi, bukan oleh filter yang bisa lupa.
 *  3. Setiap jawaban membawa `coverage` + `caveats`: seberapa lengkap
 *     data di balik angka itu. Angka tanpa konteks cakupannya gampang
 *     dibaca sebagai kebenaran utuh, padahal bukan.
 *
 * Autentikasi: header `x-metrics-token`. Token TIDAK boleh lewat query
 * string — URL gampang bocor lewat log server & riwayat browser.
 *
 * Pemakaian: server-ke-server. Tidak ada header CORS, jadi endpoint ini
 * tak bisa dipanggil langsung dari kode browser — memang disengaja,
 * supaya token tidak pernah mendarat di perangkat pemakai.
 * ============================================================
 */

const backend = require('./_sheets.js');

/* ------------------------------------------------------------------ */
/* Autentikasi                                                         */
/* ------------------------------------------------------------------ */

/**
 * Token dibaca dari env METRICS_TOKENS berformat `nama:token,nama2:token2`
 * supaya bisa dicabut per orang tanpa mengganggu yang lain.
 * METRICS_TOKEN (tunggal) tetap didukung untuk pemakaian cepat.
 */
function parseTokens() {
  const out = [];
  const many = String(process.env.METRICS_TOKENS || '').trim();
  if (many) {
    many.split(',').forEach((pair) => {
      const i = pair.indexOf(':');
      if (i <= 0) return;
      const label = pair.slice(0, i).trim();
      const token = pair.slice(i + 1).trim();
      if (label && token) out.push({ label, token });
    });
  }
  const single = String(process.env.METRICS_TOKEN || '').trim();
  if (single) out.push({ label: 'default', token: single });
  return out;
}

/** Perbandingan panjang-tetap supaya lama pencocokan tak membocorkan token. */
function safeEqual(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

function identify(req) {
  const known = parseTokens();
  if (!known.length) return { ok: false, reason: 'NO_TOKEN_CONFIGURED' };
  const given = String(req.headers['x-metrics-token'] || '').trim();
  if (!given) return { ok: false, reason: 'MISSING' };
  const hit = known.find((k) => safeEqual(k.token, given));
  return hit ? { ok: true, label: hit.label } : { ok: false, reason: 'INVALID' };
}

/* ------------------------------------------------------------------ */
/* Cache                                                               */
/* ------------------------------------------------------------------ */

/**
 * Yang di-cache adalah HASIL BACA SHEET, bukan hasil per-query. Jadi sepuluh
 * pertanyaan berbeda dalam satu menit tetap cuma sekali baca ke Google.
 * Instance serverless dipakai ulang saat hangat, jadi cache ini efektif.
 */
let _cache = null;
function cacheSeconds() {
  const n = Number(process.env.METRICS_CACHE_SECONDS);
  return Number.isFinite(n) && n >= 0 ? n : 45;
}

async function loadSource() {
  const ttl = cacheSeconds() * 1000;
  const now = Date.now();
  if (_cache && ttl > 0 && now - _cache.at < ttl) {
    return Object.assign({}, _cache.data, { cached: true, age_seconds: Math.round((now - _cache.at) / 1000) });
  }
  // Dua panggilan ini adalah SATU-SATUNYA akses data di file ini.
  const [tasks, activity] = await Promise.all([
    backend.getTasks(),
    backend.getActivityLog(100000).catch(() => []),
  ]);
  const data = { tasks, activity, fetched_at: new Date().toISOString() };
  _cache = { at: now, data };
  return Object.assign({}, data, { cached: false, age_seconds: 0 });
}

/* ------------------------------------------------------------------ */
/* Tanggal                                                             */
/* ------------------------------------------------------------------ */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (s) => ISO_DAY.test(String(s || ''));

/** "Nynda (PM) • 2026-08-11 20:47:56" -> "2026-08-11" */
function dayFromStatusBy(statusBy) {
  const m = String(statusBy || '').match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

/**
 * Apakah satu baris log menandai perpindahan status KE Done?
 *
 * Baris yang punya kolom `statusTo` terisi dipercaya apa adanya — termasuk saat
 * isinya bukan Done, yang berarti baris itu memang bukan penyelesaian. Hanya
 * baris lama, yang ditulis sebelum kolom itu ada, yang jatuh ke pembacaan teks
 * "• Status: Done •". Pembacaan teks itu rapuh dan sengaja jadi jalur cadangan,
 * bukan jalur utama.
 */
function movedToDone(entry) {
  const to = String((entry && entry.statusTo) || '').trim();
  if (to) return /^done$/i.test(to);
  return /Status:\s*Done/i.test((entry && entry.detail) || '');
}

/**
 * Seberapa banyak riwayat sudah tercatat terstruktur, bukan ditebak dari teks.
 * Dipakai untuk melaporkan kemajuan perbaikan pencatatan — angka ini semestinya
 * naik terus seiring waktu.
 */
function statusLoggingProgress(activity) {
  let structured = 0;
  let textOnly = 0;
  activity.forEach((a) => {
    if (String((a && a.statusTo) || '').trim()) structured += 1;
    else if (/Status:\s*\S/.test((a && a.detail) || '')) textOnly += 1;
  });
  return { structured, text_only: textOnly, structured_ratio: ratio(structured, structured + textOnly) };
}

/** Peta taskId -> tanggal PERTAMA kali task tercatat berpindah ke Done. */
function buildCompletionMap(activity) {
  const map = {};
  // getActivityLog() mengembalikan terbaru di atas; dibalik supaya yang terbaca
  // pertama adalah kejadian paling awal.
  for (let i = activity.length - 1; i >= 0; i--) {
    const a = activity[i];
    if (!a || !a.taskId) continue;
    if (!movedToDone(a)) continue;
    const day = String(a.timestamp || '').slice(0, 10);
    if (isDay(day) && !map[a.taskId]) map[a.taskId] = day;
  }
  return map;
}

/** Tanggal selesai sebuah task: ACTIVITY dulu, baru statusBy sebagai cadangan. */
function completionDay(task, completionMap) {
  if (String(task.status || '').toLowerCase() !== 'done') return '';
  const fromLog = completionMap[task.id];
  if (fromLog) return fromLog;
  const fromRow = dayFromStatusBy(task.statusBy);
  return isDay(fromRow) ? fromRow : '';
}

function bucketOf(day, granularity) {
  if (!isDay(day)) return '';
  if (granularity === 'week') {
    const d = new Date(day + 'T00:00:00Z');
    const dow = (d.getUTCDay() + 6) % 7;           // Senin = 0
    d.setUTCDate(d.getUTCDate() - dow);
    return d.toISOString().slice(0, 10);
  }
  return day.slice(0, 7);                           // YYYY-MM
}

function daysBetween(fromDay, toDay) {
  if (!isDay(fromDay) || !isDay(toDay)) return null;
  const a = Date.parse(fromDay + 'T00:00:00Z');
  const b = Date.parse(toDay + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Penyaringan                                                         */
/* ------------------------------------------------------------------ */

const norm = (s) => String(s || '').trim().toLowerCase();

function readFilters(query) {
  const pick = (k) => {
    const v = query[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s === undefined || s === null ? '' : String(s).trim();
  };
  return {
    from: pick('from'), to: pick('to'),
    stage: pick('stage'), platform: pick('platform'),
    pic: pick('pic'), status: pick('status'), priority: pick('priority'),
    q: pick('q'),
  };
}

/**
 * Platform bisa berisi banyak nilai dalam satu sel ("All Platform, Markaz"),
 * jadi pencocokannya per bagian, bukan seluruh string.
 */
function platformParts(v) {
  return String(v || '').split(',').map((s) => norm(s)).filter(Boolean);
}

function matchesFilters(task, f) {
  if (f.stage && norm(task.stage) !== norm(f.stage)) return false;
  if (f.pic && norm(task.pic) !== norm(f.pic)) return false;
  if (f.status && norm(task.status) !== norm(f.status)) return false;
  if (f.priority && norm(task.priority) !== norm(f.priority)) return false;
  if (f.platform && !platformParts(task.platform).includes(norm(f.platform))) return false;
  if (f.q && !norm(task.taskName).includes(norm(f.q))) return false;
  return true;
}

/** Saring rentang tanggal terhadap kolom tanggal yang dipilih view. */
function inRange(day, f) {
  if (!f.from && !f.to) return true;
  if (!isDay(day)) return false;          // tak punya tanggal -> di luar rentang
  if (f.from && day < f.from) return false;
  if (f.to && day > f.to) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Cakupan data & catatan peringatan                                   */
/* ------------------------------------------------------------------ */

const ratio = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : null);

function coverageOf(tasks, completionMap) {
  const total = tasks.length;
  const done = tasks.filter((t) => norm(t.status) === 'done');
  const withCompletion = done.filter((t) => completionDay(t, completionMap));
  return {
    tasks_counted: total,
    due_date: ratio(tasks.filter((t) => isDay(t.dueDate)).length, total),
    platform: ratio(tasks.filter((t) => String(t.platform || '').trim()).length, total),
    pic: ratio(tasks.filter((t) => String(t.pic || '').trim()).length, total),
    completion_date: ratio(withCompletion.length, done.length),
    completion_date_note: `${withCompletion.length} dari ${done.length} task Done punya tanggal selesai yang bisa dipastikan`,
  };
}

function earliestActivityDay(activity) {
  let min = '';
  activity.forEach((a) => {
    const d = String(a.timestamp || '').slice(0, 10);
    if (isDay(d) && (!min || d < min)) min = d;
  });
  return min;
}

/**
 * Catatan peringatan dirakit dari kondisi data saat itu, bukan daftar tetap.
 * Kalau pencatatan membaik, peringatannya hilang sendiri.
 */
function buildCaveats(view, filters, cov, source, excluded) {
  const out = [];
  const usesDue = view === 'ontime' || view === 'aging';
  const usesCompletion = view === 'throughput' || view === 'ontime';

  // Menyaring per periode berarti membandingkan tanggal selesai — dan task yang
  // tanggal selesainya tak diketahui langsung gugur SEBELUM dihitung. Tanpa
  // catatan ini, `coverage.completion_date` akan terlihat 100% justru karena
  // yang bolong sudah tersingkir duluan. Itu menyesatkan, jadi disebut eksplisit.
  if (excluded && excluded.no_completion_date > 0) {
    out.push(`${excluded.no_completion_date} task Done tidak masuk hitungan karena tanggal selesainya tak diketahui, sehingga tak bisa dipastikan jatuh di rentang ini atau bukan. Angka di bawah dihitung dari sisanya.`);
  }

  if (usesDue && cov.due_date !== null && cov.due_date < 0.95) {
    out.push(`Hanya ${Math.round(cov.due_date * 100)}% task punya Due Date. Task tanpa Due Date TIDAK dihitung, jadi angka ini bukan gambaran seluruh task.`);
  }
  if (usesCompletion && cov.completion_date !== null && cov.completion_date < 0.95) {
    out.push(`Tanggal selesai hanya bisa dipastikan untuk ${Math.round(cov.completion_date * 100)}% task Done (${cov.completion_date_note}).`);
  }
  if (usesCompletion) {
    const prog = statusLoggingProgress(source.activity);
    if (prog.structured === 0 && prog.text_only > 0) {
      out.push('Belum ada satu pun perpindahan status yang tercatat di kolom terstruktur, jadi seluruh riwayat masih dibaca dengan menebak pola teks. Angka ini akan membaik sendiri begitu status task mulai berubah setelah perbaikan pencatatan aktif.');
    } else if (prog.structured_ratio !== null && prog.structured_ratio < 0.5) {
      out.push(`Baru ${Math.round(prog.structured_ratio * 100)}% riwayat status tercatat terstruktur; sisanya masih dibaca dari teks. Riwayat lama tidak bisa diisi mundur, jadi rasio ini hanya naik untuk kejadian baru.`);
    }
  }
  const first = earliestActivityDay(source.activity);
  if (first && filters.from && filters.from < first) {
    out.push(`Riwayat ACTIVITY baru mulai ${first}. Rentang sebelum tanggal itu tidak punya jejak, jadi perbandingan antar periode akan menyesatkan.`);
  } else if (first && usesCompletion && !filters.from) {
    out.push(`Riwayat ACTIVITY baru mulai ${first}; apa pun sebelum itu tak terhitung.`);
  }
  if (cov.platform !== null && cov.platform < 0.95) {
    out.push(`Platform kosong pada ${Math.round((1 - cov.platform) * 100)}% task, dan sebagian sel berisi lebih dari satu platform.`);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

function tally(rows, keyFn) {
  const out = {};
  rows.forEach((r) => {
    const k = keyFn(r) || '(kosong)';
    out[k] = (out[k] || 0) + 1;
  });
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}

/** Ringkasan kondisi sekarang. Rentang tanggal disaring ke Created Date. */
function viewSummary(tasks) {
  const open = tasks.filter((t) => norm(t.status) !== 'done');
  return {
    total: tasks.length,
    done: tasks.length - open.length,
    open: open.length,
    by_status: tally(tasks, (t) => t.status),
    by_priority: tally(tasks, (t) => t.priority),
    by_stage: tally(tasks, (t) => t.stage),
    by_pic: tally(tasks, (t) => t.pic),
    by_platform: tally(tasks, (t) => t.platform),
  };
}

/** Jumlah task selesai per periode. Disaring ke tanggal SELESAI. */
function viewThroughput(tasks, completionMap, query) {
  const granularity = String(query.bucket || 'month').toLowerCase() === 'week' ? 'week' : 'month';
  const groupBy = ['stage', 'platform', 'pic', 'priority'].includes(String(query.groupBy || ''))
    ? String(query.groupBy) : '';
  const buckets = {};
  tasks.forEach((t) => {
    const day = completionDay(t, completionMap);
    if (!day) return;
    const b = bucketOf(day, granularity);
    if (!buckets[b]) buckets[b] = { completed: 0, breakdown: {} };
    buckets[b].completed += 1;
    if (groupBy) {
      const k = String(t[groupBy] || '').trim() || '(kosong)';
      buckets[b].breakdown[k] = (buckets[b].breakdown[k] || 0) + 1;
    }
  });
  const ordered = Object.keys(buckets).sort();
  return {
    bucket: granularity,
    group_by: groupBy || null,
    series: ordered.map((b) => ({
      period: b,
      completed: buckets[b].completed,
      breakdown: groupBy ? buckets[b].breakdown : undefined,
    })),
    total_completed: ordered.reduce((n, b) => n + buckets[b].completed, 0),
  };
}

/** Ketepatan waktu: dinilai HANYA untuk task Done yang punya Due Date + tanggal selesai. */
function viewOntime(tasks, completionMap) {
  const done = tasks.filter((t) => norm(t.status) === 'done');
  const scorable = [];
  done.forEach((t) => {
    const day = completionDay(t, completionMap);
    if (!day || !isDay(t.dueDate)) return;
    scorable.push({ task: t, completedOn: day, lateDays: daysBetween(t.dueDate, day) });
  });
  const late = scorable.filter((s) => s.lateDays > 0);
  const totalLate = late.reduce((n, s) => n + s.lateDays, 0);
  return {
    done_total: done.length,
    scored: scorable.length,
    not_scored: done.length - scorable.length,
    on_time: scorable.length - late.length,
    late: late.length,
    on_time_rate: ratio(scorable.length - late.length, scorable.length),
    avg_days_late: late.length ? Math.round((totalLate / late.length) * 10) / 10 : 0,
    worst: late.sort((a, b) => b.lateDays - a.lateDays).slice(0, 10)
      .map((s) => ({ id: s.task.id, taskName: s.task.taskName, pic: s.task.pic, dueDate: s.task.dueDate, completedOn: s.completedOn, daysLate: s.lateDays })),
  };
}

/** Beban per PIC: yang masih terbuka, dipecah per status, plus yang lewat tenggat. */
function viewWorkload(tasks) {
  const today = todayUtc();
  const per = {};
  tasks.forEach((t) => {
    const pic = String(t.pic || '').trim() || '(kosong)';
    if (!per[pic]) per[pic] = { pic, total: 0, open: 0, done: 0, overdue: 0, by_status: {} };
    const row = per[pic];
    row.total += 1;
    if (norm(t.status) === 'done') {
      row.done += 1;
    } else {
      row.open += 1;
      row.by_status[t.status || '(kosong)'] = (row.by_status[t.status || '(kosong)'] || 0) + 1;
      if (isDay(t.dueDate) && t.dueDate < today) row.overdue += 1;
    }
  });
  return { as_of_day: today, people: Object.values(per).sort((a, b) => b.open - a.open) };
}

/**
 * Task terbuka yang lama tak bergerak.
 *
 * Umur diukur dari perubahan status terakhir (kolom statusBy). Kalau kolom itu
 * kosong — dan sekarang mayoritas memang kosong — dipakai Created Date, yang
 * membuat umurnya terlihat LEBIH TUA dari kenyataan. Tiap baris menandai
 * sumber ukurannya lewat `basis` supaya perbedaan ini kelihatan.
 */
function viewAging(tasks, query) {
  const today = todayUtc();
  const minDays = Number(query.minDays) > 0 ? Number(query.minDays) : 14;
  const rows = [];
  tasks.filter((t) => norm(t.status) !== 'done').forEach((t) => {
    const moved = dayFromStatusBy(t.statusBy);
    const basis = isDay(moved) ? 'statusBy' : 'createdDate';
    const since = isDay(moved) ? moved : t.createdDate;
    const age = daysBetween(since, today);
    if (age === null || age < minDays) return;
    rows.push({
      id: t.id, taskName: t.taskName, status: t.status, stage: t.stage,
      pic: t.pic, priority: t.priority, dueDate: t.dueDate || null,
      overdue: isDay(t.dueDate) && t.dueDate < today,
      idleDays: age, basis, since,
    });
  });
  rows.sort((a, b) => b.idleDays - a.idleDays);
  return {
    min_days: minDays,
    counted: rows.length,
    measured_from_status_change: rows.filter((r) => r.basis === 'statusBy').length,
    measured_from_created_date: rows.filter((r) => r.basis === 'createdDate').length,
    tasks: rows.slice(0, Number(query.limit) > 0 ? Number(query.limit) : 50),
  };
}

/**
 * Daftar task tersaring.
 *
 * Catatan bebas (PIC Notes / PM Notes) TIDAK ikut kecuali diminta lewat
 * `include=notes` — default-nya ramping supaya jawaban tidak tenggelam teks.
 * Sheet NOTES ("catatan saya" per orang) tidak pernah ikut, dengan cara apa pun.
 */
function viewTasks(tasks, completionMap, query) {
  const withNotes = String(query.include || '').split(',').map((s) => s.trim()).includes('notes');
  const limit = Number(query.limit) > 0 ? Math.min(Number(query.limit), 500) : 100;
  const rows = tasks.slice(0, limit).map((t) => {
    const row = {
      id: t.id, taskName: t.taskName, status: t.status, priority: t.priority,
      stage: t.stage, platform: t.platform, pic: t.pic, support: t.support,
      createdDate: t.createdDate || null, dueDate: t.dueDate || null,
      completedOn: completionDay(t, completionMap) || null,
      lastStatusChangeBy: t.statusBy || null,
    };
    if (withNotes) {
      row.picNotes = t.picNotes || '';
      row.pmNotes = t.pmNotes || '';
    }
    return row;
  });
  return { returned: rows.length, matched: tasks.length, truncated: tasks.length > rows.length, tasks: rows };
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

const VIEWS = ['summary', 'throughput', 'ontime', 'workload', 'aging', 'tasks'];

// View yang menyaring rentang tanggal ke tanggal SELESAI, bukan Created Date.
const RANGE_ON_COMPLETION = { throughput: 1, ontime: 1 };

/**
 * Hitung satu jawaban metrics dari sekumpulan parameter.
 *
 * Ini inti perhitungannya, sengaja dipisah dari lapisan HTTP supaya `api/mcp.js`
 * bisa memakainya langsung — tanpa server memanggil dirinya sendiri lewat
 * jaringan, yang cuma menambah latensi dan satu titik gagal baru.
 *
 * Melempar Error ber-`.code` (`UNKNOWN_VIEW` / `BAD_DATE`) untuk masukan yang
 * salah; pemanggil yang menerjemahkannya jadi status HTTP atau pesan MCP.
 */
async function runQuery(query) {
  const q = (query && typeof query === 'object') ? query : {};
  const view = String(q.view || 'summary').trim() || 'summary';
  if (!VIEWS.includes(view)) {
    const e = new Error(`View "${view}" tidak dikenal.`);
    e.code = 'UNKNOWN_VIEW';
    e.available = VIEWS;
    throw e;
  }

  const filters = readFilters(q);
  for (const k of ['from', 'to']) {
    if (filters[k] && !isDay(filters[k])) {
      const e = new Error(`Parameter "${k}" harus format YYYY-MM-DD, dapat "${filters[k]}".`);
      e.code = 'BAD_DATE';
      throw e;
    }
  }

  const source = await loadSource();
  const completionMap = buildCompletionMap(source.activity);

  // Saring atribut dulu, lalu rentang tanggal terhadap kolom yang sesuai view.
  let rows = source.tasks.filter((t) => matchesFilters(t, filters));
  const excluded = { no_completion_date: 0 };
  if (filters.from || filters.to) {
    if (RANGE_ON_COMPLETION[view]) {
      // Dihitung SEBELUM penyaringan, karena setelah disaring jejaknya hilang.
      excluded.no_completion_date = rows.filter(
        (t) => norm(t.status) === 'done' && !completionDay(t, completionMap),
      ).length;
      rows = rows.filter((t) => inRange(completionDay(t, completionMap), filters));
    } else {
      rows = rows.filter((t) => inRange(t.createdDate, filters));
    }
  }

  let data;
  if (view === 'summary') data = viewSummary(rows);
  else if (view === 'throughput') data = viewThroughput(rows, completionMap, q);
  else if (view === 'ontime') data = viewOntime(rows, completionMap);
  else if (view === 'workload') data = viewWorkload(rows);
  else if (view === 'aging') data = viewAging(rows, q);
  else data = viewTasks(rows, completionMap, q);

  // Cakupan dihitung dari baris yang benar-benar dipakai, bukan seluruh sheet,
  // supaya angkanya menjelaskan jawaban INI.
  const coverage = coverageOf(rows, completionMap);

  return {
    ok: true,
    view,
    as_of: source.fetched_at,
    from_cache: source.cached,
    cache_age_seconds: source.age_seconds,
    filters,
    range_applied_to: (filters.from || filters.to)
      ? (RANGE_ON_COMPLETION[view] ? 'completedOn' : 'createdDate')
      : null,
    coverage,
    excluded,
    status_logging: statusLoggingProgress(source.activity),
    caveats: buildCaveats(view, filters, coverage, source, excluded),
    data,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  // Read-only ditegakkan di sini, sebelum apa pun dibaca atau di-parse.
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end(JSON.stringify({
      ok: false, error: 'METHOD_NOT_ALLOWED',
      message: 'Endpoint ini hanya melayani GET. Tidak ada jalur tulis di sini.',
    }));
  }

  const auth = identify(req);
  if (!auth.ok) {
    const message = auth.reason === 'NO_TOKEN_CONFIGURED'
      ? 'METRICS_TOKENS belum diset di server. Endpoint sengaja tertutup sampai token dikonfigurasi.'
      : 'Perlu header x-metrics-token yang sah.';
    return res.status(401).end(JSON.stringify({ ok: false, error: 'AUTH', message }));
  }

  const query = (req.query && typeof req.query === 'object') ? req.query : {};
  try {
    return res.status(200).end(JSON.stringify(await runQuery(query)));
  } catch (err) {
    if (err && err.code === 'UNKNOWN_VIEW') {
      return res.status(400).end(JSON.stringify({
        ok: false, error: 'UNKNOWN_VIEW', message: err.message, available: err.available,
      }));
    }
    if (err && err.code === 'BAD_DATE') {
      return res.status(400).end(JSON.stringify({ ok: false, error: 'BAD_DATE', message: err.message }));
    }
    console.error('[metrics] view=%s caller=%s error:', query.view, auth.label, err && err.stack ? err.stack : err);
    return res.status(500).end(JSON.stringify({
      ok: false, error: 'SERVER', message: String((err && err.message) || err),
    }));
  }
};

// Dipakai api/mcp.js — inti perhitungan tanpa lapisan HTTP.
module.exports.runQuery = runQuery;
module.exports.identify = identify;
module.exports.VIEWS = VIEWS;

// Diekspor untuk pengujian — tidak dipakai jalur HTTP.
module.exports._internals = {
  parseTokens, safeEqual, identify, buildCompletionMap, completionDay, dayFromStatusBy,
  movedToDone, statusLoggingProgress,
  bucketOf, daysBetween, matchesFilters, inRange, platformParts, coverageOf, buildCaveats,
  viewSummary, viewThroughput, viewOntime, viewWorkload, viewAging, viewTasks, VIEWS,
};
