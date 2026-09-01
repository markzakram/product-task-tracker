/**
 * ============================================================
 * TASK TRACKER — BACKEND (Google Sheets API)
 * Port dari Code_TaskTracker_New.gs (Apps Script) ke Node.js + googleapis.
 * Menulis ke Google Spreadsheet yang SAMA seperti versi Apps Script.
 *
 * Database utama:
 *   Sheet  : Main
 *   Header : baris 3, mulai kolom B  (B3:Q3)
 *   Data   : mulai baris 4
 *   Kolom  : Task ID, Created Date, Due Date, Start Date, Status, Priority,
 *            Task Name, Stage, Platform, PIC, Support, Document,
 *            Approval Gate, Last Update, PIC Notes, PM Notes
 *
 * Sheet pendukung: OPTIONS, COMMENTS, ACTIVITY (header di baris 1).
 * ============================================================
 */

const { google } = require('googleapis');
const crypto = require('crypto');
// PIN mode Dev untuk deployment INTERNAL (Vercel) — ada nilai bawaan supaya mode Dev
// tetap bisa dimasuki tanpa perlu menyetel env var. Timpa dengan env DEV_PIN bila mau ganti.
// Catatan: paket Apps Script di gas/ (yang didistribusikan) sengaja TIDAK punya bawaan.
const DEV_PIN = String(process.env.DEV_PIN || '3108').trim();
const PIN_SALT = String(process.env.PIN_SALT || 'pt_pin_salt_v1');
function hashPin(user, pin) {
  return crypto.createHash('sha256').update(String(user || '').toLowerCase().trim() + ':' + String(pin || '') + ':' + PIN_SALT).digest('hex');
}

const CONFIG = {
  TASK_SHEET: process.env.MAIN_SHEET_NAME || 'Main',
  OPTIONS_SHEET: 'OPTIONS',
  COMMENTS_SHEET: 'COMMENTS',
  ACTIVITY_SHEET: 'ACTIVITY',
  AUTH_SHEET: 'AUTH',
  LINKS_SHEET: 'LINKS',
  DASHBOARDS_SHEET: 'DASHBOARDS',
  NOTES_SHEET: 'NOTES',
  CHECKLIST_SHEET: 'CHECKLIST',
  COLLAB_SHEET: 'COLLAB',
  COLLAB_STEP_SHEET: 'COLLAB_STEPS',
  PACKAGE_SHEET: 'PACKAGES',
  PACKAGE_VARIANT_SHEET: 'PACKAGE_VARIANTS',
  PACKAGE_ITEM_SHEET: 'PACKAGE_ITEMS',
  PACKAGE_CONTRIB_SHEET: 'PACKAGE_CONTRIB',
  NOTIF_SHEET: 'NOTIFICATIONS',
  USERS_SHEET: 'USERS',
  HEADER_ROW: 3,
  FIRST_DATA_ROW: 4,
  FIRST_COL_LETTER: 'B',
  LAST_COL_LETTER: 'W',
};

const TASK_HEADERS = [
  'Task ID', 'Created Date', 'Due Date', 'Status', 'Priority',
  'Task Name', 'Stage', 'Platform', 'PIC', 'Support', 'Document',
  'PIC Notes', 'PM Notes', 'Divisi Tujuan', 'Kontak Divisi', 'Kata Kerja', 'Jumlah', 'Objek', 'Detail', 'Dibuat Oleh', 'Lintas View', 'Status By',
];

// Pemetaan field -> kolom (B..W). Urutan tetap.
const COL = {
  taskId: 'B', createdDate: 'C', dueDate: 'D', status: 'E',
  priority: 'F', taskName: 'G', stage: 'H', platform: 'I', pic: 'J',
  support: 'K', document: 'L', picNotes: 'M', pmNotes: 'N',
  divisiTujuan: 'O', kontakDivisi: 'P', verb: 'Q', jumlah: 'R', objek: 'S', detail: 'T', createdBy: 'U', mirror: 'V',
  statusBy: 'W',
};

// Rumus nama task: Kata Kerja (verb, parent=stage) -> Objek (object, parent="stage||verb"). Jumlah & Detail diisi manual.
const OPTION_TYPES = ['status', 'priority', 'stage', 'platform', 'pic', 'support', 'division', 'verb', 'object'];

const DEFAULT_OPTIONS = {
  status: ['Todo', 'In progress', 'Review PM', 'Revisi', 'Hold', 'Done'],
  priority: ['Urgent', 'High', 'Normal', 'Low'],
  stage: [
    'RnD', 'Develop Materi', 'Develop Soal', 'QC Konten', 'Input',
    'Liveclass', 'Report', 'Data & Intelligence', 'Manajemen Sistem', 'Manajemen Guru',
  ],
  platform: [
    'All Platform', 'Cerebrum', 'JadiASN', 'JadiPPPK', 'JadiBUMN', 'JadiSekdin',
    'JadiBeasiswa', 'JadiOJK', 'JadiPCPM', 'JadiPrajurit', 'JadiPolisi',
    'Jago TPA', 'Siadu', 'Markaz', 'Toefl Academy',
    'IT', 'Marketing', 'Sales',
  ],
  pic: ['Nynda', 'Andika', 'Alya', 'Kiki', 'Bilar', 'Ali', 'Dhea', 'Uma', 'Arifah', 'Lintas Divisi'],
  support: ['Nynda', 'Andika', 'Alya', 'Kiki', 'Bilar', 'Ali', 'Dhea', 'Uma', 'Arifah', 'Lintas Divisi'],
  division: ['IT', 'Marketing', 'Sales'],
};

// Validasi dropdown di dalam Spreadsheet (header -> tipe opsi).
const VALIDATION_MAP = {
  Status: 'status', Priority: 'priority', Stage: 'stage',
  Platform: 'platform', PIC: 'pic', Support: 'support',
  'Divisi Tujuan': 'division',
};

/* ------------------------------------------------------------------ */
/* Auth & client                                                       */
/* ------------------------------------------------------------------ */

let _sheetsClient = null;
// Memo per-instance (warm): sheet yang sudah dipastikan ada+header benar tak perlu dibaca ulang.
// Reset otomatis tiap cold start. Menghemat read pada jalur tulis yang sering dipanggil.
const _ensured = new Set();

/* Environment yang sedang berjalan, apa adanya dari Vercel: production | preview |
   development. Dikirim ke browser supaya penanda STAGING tak perlu menebak dari URL —
   satu deployment produksi punya beberapa alias (alias cabang, URL hash) dan SEMUANYA
   menulis ke data produksi yang sama.
   Kalau tak diketahui (jalan lokal, host lain), sengaja BUKAN production: lebih baik
   keliru menandai produksi sebagai uji coba daripada sebaliknya. */
function appEnv() {
  return String(process.env.VERCEL_ENV || process.env.APP_ENV || 'development').toLowerCase();
}

function getSpreadsheetId() {
  const id = process.env.SPREADSHEET_ID;
  if (!id) throw new Error('Env SPREADSHEET_ID belum diset.');
  return id.trim();
}

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Env GOOGLE_SERVICE_ACCOUNT_JSON belum diset.');
  let creds;
  try {
    creds = JSON.parse(raw);
  } catch (e) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON bukan JSON yang valid.');
  }
  // Vercel kadang menyimpan newline private key sebagai "\\n".
  if (creds.private_key) creds.private_key = String(creds.private_key).replace(/\\n/g, '\n');
  return creds;
}

async function getSheets() {
  if (_sheetsClient) return _sheetsClient;
  const auth = new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  _sheetsClient = google.sheets({ version: 'v4', auth: authClient });
  return _sheetsClient;
}

/* ------------------------------------------------------------------ */
/* PERAN PENGGUNA — sheet USERS, dengan CADANGAN environment variable   */
/*                                                                      */
/*  Dev     — super user; SATU-SATUNYA yang boleh kelola user & peran.  */
/*  Manager — lihat semua task, set Done, setup kolaborasi, task lintas */
/*            divisi, kelola dropdown.                                  */
/*  Leader  — lihat semua task, set Done, setup kolaborasi.             */
/*  Staff   — task miliknya + semua task magang; boleh menutup task     */
/*            MAGANG, tapi task sendiri maksimal "Review PM".           */
/*  Magang  — hanya task sesama magang; tak bisa menutup apa pun.       */
/*  Lihat Saja — baca terbatas (task lintas divisi).                    */
/*                                                                      */
/*  Selama sheet USERS kosong/absen, peran diambil dari environment     */
/*  variable persis seperti sebelumnya — instalasi lama tidak berubah.  */
/* ------------------------------------------------------------------ */
const ROLES = ['Dev', 'Manager', 'Leader', 'Staff', 'Magang', 'Lihat Saja'];
const ROLE_DEFAULT = 'Staff';

// Nama tanpa suffix "(...)" -> lowercase, untuk perbandingan yang toleran.
function baseName(s) {
  return String(s || '').replace(/\s*\(.*?\)\s*$/, '').trim().toLowerCase();
}

function envList(key, dflt) {
  return String(process.env[key] || dflt).split(',').map(s => s.trim()).filter(Boolean);
}

// Cache daftar user. Fungsi peran sengaja tetap SINKRON supaya seluruh pemanggilnya
// tak perlu diubah jadi async; yang asinkron hanya pemuatannya (loadUsers()).
// rpc.js memanggil invalidateUsers() di awal tiap request agar tak memakai data basi
// dari instance serverless yang masih hangat.
let _users = null;
function invalidateUsers() { _users = null; }
function usersLoaded() { return Array.isArray(_users); }
function usersConfigured() { return usersLoaded() && _users.length > 0; }
function setUsersFromRows(rows) {
  _users = (rows || [])
    .map((r, i) => ({
      row: i + 2,
      name: String((r && r[0]) || '').trim(),
      role: String((r && r[1]) || '').trim() || ROLE_DEFAULT,
      active: (r && r[2] === '') ? true : !(r && String(r[2]).toLowerCase() === 'false'),
    }))
    .filter(u => u.name);
  return _users;
}
async function loadUsers(pre) {
  if (pre !== undefined) return setUsersFromRows(pre);
  if (usersLoaded()) return _users;
  let rows = [];
  try { rows = await valuesGet(`${CONFIG.USERS_SHEET}!A2:C`); } catch (e) { rows = []; }
  return setUsersFromRows(rows);
}

function roleOfActor(name) {
  const n = baseName(name);
  if (!n) return '';
  if (n === 'dev') return 'Dev';
  if (!usersConfigured()) return '';
  const hit = _users.find(u => baseName(u.name) === n);
  if (!hit) return '';
  return hit.active ? hit.role : 'Nonaktif';
}
function hasRole(name, role) { return String(roleOfActor(name)).toLowerCase() === role; }

function getManagers() {
  if (usersConfigured()) {
    return _users.filter(u => u.active && String(u.role).toLowerCase() === 'manager').map(u => u.name);
  }
  return envList('MANAGERS', 'Nynda');
}

// Apakah actor seorang manager? (peran Manager, daftar MANAGERS, atau akun Dev).
function isManagerActor(name) {
  const n = baseName(name);
  if (!n) return false;
  if (n === 'dev') return true;
  if (usersConfigured()) return hasRole(name, 'manager');
  return envList('MANAGERS', 'Nynda').some(m => baseName(m) === n);
}
function isLeaderActor(name) {
  if (!baseName(name)) return false;
  if (usersConfigured()) return hasRole(name, 'leader');
  const n = baseName(name);
  return envList('DONE_APPROVERS', 'Nynda,Dhea,Alya').some(a => baseName(a) === n) && !isManagerActor(name);
}
function isStaffActor(name) { return usersConfigured() && hasRole(name, 'staff'); }
/* PIC boleh berupa PERAN, ditulis "@Magang" — task milik BERSAMA semua yang berperan itu.
   Awalan "@" dipakai supaya tak pernah bentrok dengan orang yang kebetulan bernama "Magang",
   dan tetap terbaca jelas saat sheet dibuka manual. "Dev" tak boleh jadi PIC bersama. */
// "Nama • 2026-08-11 10:00". Berawalan nama, jadi Sheets tidak mengubahnya jadi nilai tanggal.
function statusByStamp(actor) { return `${String(actor || '').trim() || 'Unknown'} • ${nowStamp()}`; }

function rolePicOf(pic) {
  const s = String(pic || '').trim();
  if (s.charAt(0) !== '@') return '';
  const r = normalizeRole(s.slice(1));
  return (r && r.toLowerCase() !== 'dev') ? r : '';
}
function isMagangActor(name) {
  if (rolePicOf(name).toLowerCase() === 'magang') return true;   // task milik bersama anak magang
  return usersConfigured() && hasRole(name, 'magang');
}

// Status "Done" bersifat final dan hanya boleh diset oleh yang berwenang.
function isDoneStatus(v) {
  return String(v || '').trim().toLowerCase() === 'done';
}

// Daftar approver umum: peran Manager + Leader (atau env DONE_APPROVERS).
function getDoneApprovers() {
  if (usersConfigured()) {
    return _users.filter(u => {
      const r = String(u.role).toLowerCase();
      return u.active && (r === 'manager' || r === 'leader');
    }).map(u => u.name);
  }
  return envList('DONE_APPROVERS', 'Nynda,Dhea,Alya');
}

// Boleh menutup task ke "Done"? Bergantung SIAPA PIC task itu:
//   Manager/Leader/Dev -> task siapa pun · Staff -> hanya task MAGANG · Magang -> tidak.
// taskPic boleh dikosongkan untuk pertanyaan umum "orang ini bisa Done sama sekali?".
// Apakah `name` terdaftar sebagai Support pada task ini?
function isSupportOf(taskSupport, name) {
  const n = baseName(name);
  if (!n) return false;
  const list = Array.isArray(taskSupport) ? taskSupport : String(taskSupport || '').split(',');
  return list.map(s => baseName(s)).filter(Boolean).includes(n);
}
function canApproveDone(name, taskPic, taskSupport) {
  if (!baseName(name)) return false;
  if (isManagerActor(name)) return true;
  if (usersConfigured()) {
    if (isLeaderActor(name)) return true;
    if (isMagangActor(name)) return false;
    if (isStaffActor(name)) {
      if (taskPic === undefined || taskPic === null || taskPic === '') return true;
      // Task karyawan (termasuk miliknya sendiri): paling jauh Review PM.
      if (!isMagangActor(taskPic)) return false;
      // Task anak magang: hanya karyawan yang MENDAMPINGI di task itu (Support) yang
      // boleh menutupnya — bukan sembarang Staff yang tak terlibat.
      return isSupportOf(taskSupport, name);
    }
    return false;
  }
  const n = baseName(name);
  return getDoneApprovers().some(a => baseName(a) === n);
}

// Siapa yang boleh MENYUSUN Task Kolaborasi: Manager, Leader, dan Dev.
function getCollabManagers() {
  if (usersConfigured()) return getDoneApprovers();
  return envList('COLLAB_MANAGERS', 'Nynda,Dhea,Alya');
}
function canManageCollabActor(name) {
  if (!baseName(name)) return false;
  if (isManagerActor(name)) return true;
  if (usersConfigured()) return isLeaderActor(name);
  const n = baseName(name);
  return getCollabManagers().some(a => baseName(a) === n);
}

// Kelola user & peran: HANYA Dev — satu pintu, supaya tak ada yang bisa menaikkan
// haknya sendiri atau menambah akses tanpa sepengetahuan pemilik sistem.
function canManageUsers(name) { return baseName(name) === 'dev'; }
function usersDeniedMessage() {
  return 'Hanya mode Dev yang bisa mengelola user & peran. Masuk lewat tekan-tahan logo ProductTrack, atau ubah langsung di sheet USERS.';
}

function doneDeniedMessage(taskPic) {
  if (taskPic && isMagangActor(taskPic)) {
    return 'Task anak magang hanya bisa ditutup ("Done") oleh karyawan — Staff, Leader, atau Manager. Magang sendiri maksimal "Review PM".';
  }
  const who = getDoneApprovers();
  return 'Hanya ' + (who.length ? who.join(', ') : 'Manager/Leader') + ' yang bisa menandai task sebagai "Done". Set ke "Review PM" agar diteruskan.';
}

/* ------------------------------------------------------------------ */
/* Low-level Sheets helpers                                            */
/* ------------------------------------------------------------------ */

/* ---------- Percobaan ulang saat kena kuota ----------
   Kuota baca Google Sheets dihitung PER MENIT, dan yang memicunya hampir selalu ledakan
   sesaat — jeda beberapa ratus milidetik biasanya sudah cukup untuk lewat. Anggarannya
   sengaja pendek (total di bawah 2 detik) karena fungsi Vercel punya batas waktu sendiri;
   kalau tetap gagal, galatnya dilempar dan pemanggil sudah menanganinya dengan benar.

   Yang boleh diulang dibedakan dengan sengaja:
   - BACA idempoten, jadi aman diulang untuk kuota MAUPUN gangguan sesaat (5xx, koneksi
     putus).
   - TULIS hanya diulang saat kena kuota. Kena kuota berarti permintaannya DITOLAK sebelum
     dijalankan, jadi mengulang aman. Galat jaringan sebaliknya ambigu: bisa saja sudah
     terlanjur dijalankan lalu jawabannya yang hilang — mengulangnya akan menggandakan
     baris pada append, atau menghapus dua baris pada deleteDimension. */
const ULANG_JEDA = [400, 1100];          // dua percobaan ulang; sisanya dilempar

function kodeGalat(err) {
  return Number((err && (err.code || (err.response && err.response.status))) || 0);
}
function pesanGalat(err) {
  const dari = (err && (err.message || err.toString())) || '';
  return String(dari).toLowerCase();
}
function kenaKuota(err) {
  if (kodeGalat(err) === 429) return true;
  const alasan = (err && err.errors && err.errors[0] && err.errors[0].reason) || '';
  if (/ratelimitexceeded|userratelimitexceeded|quotaexceeded/i.test(alasan)) return true;
  const m = pesanGalat(err);
  return m.indexOf('quota exceeded') >= 0 || m.indexOf('rate limit') >= 0
      || m.indexOf('resource_exhausted') >= 0;
}
function gangguanSesaat(err) {
  const k = kodeGalat(err);
  if (k === 500 || k === 502 || k === 503 || k === 504) return true;
  const m = pesanGalat(err);
  return m.indexOf('econnreset') >= 0 || m.indexOf('etimedout') >= 0
      || m.indexOf('socket hang up') >= 0 || m.indexOf('backenderror') >= 0;
}
const bolehUlangBaca = err => kenaKuota(err) || gangguanSesaat(err);
const bolehUlangTulis = err => kenaKuota(err);          // hanya kuota — lihat catatan di atas

function tidur(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ulangi(jalankan, bolehUlang) {
  for (let i = 0; ; i++) {
    try { return await jalankan(); }
    catch (e) {
      if (i >= ULANG_JEDA.length || !bolehUlang(e)) throw e;
      // Jitter kecil supaya beberapa permintaan yang barengan tidak bangun serentak.
      await tidur(ULANG_JEDA[i] + Math.floor(Math.random() * 250));
    }
  }
}

async function valuesGet(range, opts = {}) {
  const sheets = await getSheets();
  const res = await ulangi(() => sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range,
    valueRenderOption: opts.valueRenderOption || 'UNFORMATTED_VALUE',
    dateTimeRenderOption: opts.dateTimeRenderOption || 'SERIAL_NUMBER',
  }), bolehUlangBaca);
  return res.data.values || [];
}

// Ambil BANYAK range dalam SATU request (hemat kuota: 1 read utk semua range).
// Mengembalikan map { range: values[][] }.
async function valuesBatchGet(ranges, opts = {}) {
  const sheets = await getSheets();
  const res = await ulangi(() => sheets.spreadsheets.values.batchGet({
    spreadsheetId: getSpreadsheetId(),
    ranges,
    valueRenderOption: opts.valueRenderOption || 'UNFORMATTED_VALUE',
    dateTimeRenderOption: opts.dateTimeRenderOption || 'SERIAL_NUMBER',
  }), bolehUlangBaca);
  const vr = res.data.valueRanges || [];
  const out = {};
  ranges.forEach((r, i) => { out[r] = (vr[i] && vr[i].values) || []; });
  return out;
}

async function valuesUpdate(range, values) {
  const sheets = await getSheets();
  await ulangi(() => sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  }), bolehUlangTulis);
}

async function valuesAppend(range, values) {
  const sheets = await getSheets();
  await ulangi(() => sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  }), bolehUlangTulis);
}

async function getSheetMeta() {
  const sheets = await getSheets();
  const res = await ulangi(() => sheets.spreadsheets.get({
    spreadsheetId: getSpreadsheetId(),
    fields: 'sheets.properties(sheetId,title,gridProperties)',
  }), bolehUlangBaca);
  const map = {};
  (res.data.sheets || []).forEach(s => {
    map[s.properties.title] = s.properties;
  });
  return map;
}

async function batchUpdate(requests) {
  const sheets = await getSheets();
  await ulangi(() => sheets.spreadsheets.batchUpdate({
    spreadsheetId: getSpreadsheetId(),
    requestBody: { requests },
  }), bolehUlangTulis);
}

/* ------------------------------------------------------------------ */
/* Date helpers (port formatDate_ / toDateOrString_)                   */
/* ------------------------------------------------------------------ */

function pad(n) { return String(n).padStart(2, '0'); }

function serialToDate(serial) {
  // Google Sheets serial -> JS Date. Pakai getter UTC agar komponen = wall clock.
  const ms = Math.round((Number(serial) - 25569) * 86400 * 1000);
  return new Date(ms);
}

function formatDate(value, withTime) {
  if (value === '' || value === null || value === undefined) return '';
  let d = null;
  if (typeof value === 'number') {
    d = serialToDate(value);
  } else if (value instanceof Date) {
    d = value;
  } else {
    const s = String(value).trim();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (iso) {
      d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3], +(iso[4] || 0), +(iso[5] || 0), +(iso[6] || 0)));
    } else if (dmy) {
      d = new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1], +(dmy[4] || 0), +(dmy[5] || 0)));
    } else {
      return s; // teks tak dikenal -> kembalikan apa adanya
    }
  }
  if (!d || isNaN(d)) return String(value || '');
  const Y = d.getUTCFullYear(), Mo = pad(d.getUTCMonth() + 1), Da = pad(d.getUTCDate());
  if (withTime) return `${Y}-${Mo}-${Da} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return `${Y}-${Mo}-${Da}`;
}

// Untuk ditulis ke sheet (USER_ENTERED). Sheets mengenali format ISO yyyy-mm-dd.
function toSheetDate(value) {
  if (!value) return '';
  if (typeof value === 'number') return formatDate(value, false);
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  return s;
}

// Stempel waktu yang kita TULIS sebagai teks ("2026-08-07 10:00:00") diterima Sheets dengan
// valueInputOption USER_ENTERED, jadi dikenali sebagai nilai tanggal — dan saat dibaca lagi
// (UNFORMATTED_VALUE + SERIAL_NUMBER) yang kembali adalah ANGKA SERIAL, bukan teks tadi.
// Dibaca mentah, "2026-08-07 10:00" berubah jadi "46241.4166…". Padanan stampStr_() di gas/Code.gs.
function stampStr(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return formatDate(v, true);
  return String(v).trim();
}

function nowStamp() {
  const offsetMin = parseInt(process.env.TIMEZONE_OFFSET_MINUTES || '420', 10);
  const local = new Date(Date.now() + offsetMin * 60000);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} `
    + `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`;
}

/* ------------------------------------------------------------------ */
/* Mapping baris <-> task                                              */
/* ------------------------------------------------------------------ */

function rowToTask(row, rowNumber) {
  const g = i => (row[i] === undefined || row[i] === null ? '' : row[i]);
  const createdDate = formatDate(g(1), false);
  return {
    rowNumber,
    id: String(g(0)).trim(),
    createdDate,
    dueDate: formatDate(g(2), false),
    status: String(g(3)).trim(),
    priority: String(g(4)).trim(),
    taskName: String(g(5)).trim(),
    stage: String(g(6)).trim(),
    platform: String(g(7)).trim(),
    pic: String(g(8)).trim(),
    support: String(g(9)).trim(),
    document: String(g(10)).trim(),
    picNotes: String(g(11)).trim(),
    pmNotes: String(g(12)).trim(),
    divisiTujuan: String(g(13)).trim(),
    kontakDivisi: String(g(14)).trim(),
    verb: String(g(15)).trim(),
    jumlah: String(g(16)).trim(),
    objek: String(g(17)).trim(),
    detail: String(g(18)).trim(),
    createdBy: String(g(19)).trim(),
    mirror: String(g(20)).trim(),
    // "Nama • 2026-08-11 10:00" — teks berawalan nama, jadi Sheets tak mengubahnya jadi tanggal.
    statusBy: String(g(21)).trim(),   // siapa & kapan status terakhir diubah
    // Field virtual (tidak ada kolomnya di sheet ini) — disediakan agar UI lama tetap jalan.
    startDate: createdDate,
    approvalGate: '',
    lastUpdate: '',
  };
}

function taskToRow(task, existingTask) {
  const id = task.id || null; // di-resolve oleh pemanggil bila perlu generate
  const createdDate = task.createdDate || (existingTask && existingTask.createdDate) || toSheetDate(new Date());
  const support = Array.isArray(task.support) ? task.support.join(', ') : String(task.support || '');
  // Sheet ini 15 kolom (B..P): tanpa Start Date, Approval Gate, Last Update.
  return [
    id || '',
    toSheetDate(createdDate),
    toSheetDate(task.dueDate || ''),
    task.status || 'Todo',
    task.priority || 'Normal',
    task.taskName || '',
    task.stage || '',
    task.platform || '',
    task.pic || '',
    support,
    task.document || '',
    task.picNotes || '',
    task.pmNotes || '',
    task.divisiTujuan || '',
    task.kontakDivisi || '',
    task.verb || '',
    task.jumlah || '',
    task.objek || '',
    task.detail || '',
    (task.createdBy || (existingTask && existingTask.createdBy) || ''),
    (task.mirror ? 'Ya' : ''),
    (task.statusBy !== undefined ? task.statusBy : ((existingTask && existingTask.statusBy) || '')),
  ];
}

/* ------------------------------------------------------------------ */
/* TASKS                                                               */
/* ------------------------------------------------------------------ */

const MAIN_DATA_RANGE = () =>
  `${CONFIG.TASK_SHEET}!${CONFIG.FIRST_COL_LETTER}${CONFIG.FIRST_DATA_ROW}:${CONFIG.LAST_COL_LETTER}`;

async function getTasks(pre) {
  const rows = pre !== undefined ? pre : await valuesGet(MAIN_DATA_RANGE());
  return rows
    .map((row, idx) => rowToTask(row, CONFIG.FIRST_DATA_ROW + idx))
    .filter(t => t.id || t.taskName);
}

async function getTaskIdColumn() {
  // Hanya kolom Task ID (B4:B) untuk cari baris & generate ID.
  const rows = await valuesGet(`${CONFIG.TASK_SHEET}!${COL.taskId}${CONFIG.FIRST_DATA_ROW}:${COL.taskId}`);
  return rows.map(r => String((r && r[0]) || '').trim());
}

function findRowByTaskId(ids, taskId) {
  if (!taskId) return -1;
  const needle = String(taskId).trim();
  const idx = ids.findIndex(v => v === needle);
  return idx === -1 ? -1 : CONFIG.FIRST_DATA_ROW + idx;
}

function generateTaskId(ids) {
  let max = 0;
  ids.forEach(v => {
    const m = String(v || '').match(/(\d+)\s*$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return 'TSK-' + String(max + 1).padStart(3, '0');
}

async function saveTask(task) {
  if (!task) return { success: false, message: 'Data task kosong.' };
  if (!String(task.taskName || '').trim()) return { success: false, message: 'Task Name wajib diisi.' };

  const ids = await getTaskIdColumn();
  let rowNumber = -1;
  let existingTask = null;

  if (task.id) {
    rowNumber = findRowByTaskId(ids, task.id);
    if (rowNumber !== -1) {
      const cur = await valuesGet(`${CONFIG.TASK_SHEET}!${CONFIG.FIRST_COL_LETTER}${rowNumber}:${CONFIG.LAST_COL_LETTER}${rowNumber}`);
      existingTask = rowToTask(cur[0] || [], rowNumber);
    }
  }
  const isUpdate = rowNumber !== -1;
  const actor = String(task.actor || '').trim() || 'Unknown';

  // Gerbang "Done": hanya Done approver yang boleh MENETAPKAN status ke Done.
  // Perpindahan KE Done oleh yang tak berhak ditolak; task yang sudah Done boleh
  // tetap Done atau ditarik balik (bukan aksi "membuat Done").
  const oldStatus = (existingTask && existingTask.status) || '';
  // Izin Done bergantung PIC task-nya (Staff boleh menutup task anak magang).
  await loadUsers();
  const finalPic = String(task.pic || (existingTask && existingTask.pic) || '').trim();
  if (isDoneStatus(task.status) && !isDoneStatus(oldStatus) && !canApproveDone(actor, finalPic, task.support !== undefined ? task.support : (existingTask && existingTask.support))) {
    return { success: false, message: doneDeniedMessage(finalPic) };
  }

  // Pastikan ID terisi. createdBy = pembuat task (di-set saat create, dipertahankan saat update).
  const finalId = task.id || generateTaskId(ids);
  const createdBy = isUpdate ? ((existingTask && existingTask.createdBy) || task.createdBy || '') : actor;
  // Catat pengubah status hanya bila statusnya memang berganti — supaya menyunting judul
  // atau deadline tidak ikut mengubah keterangan "diubah oleh".
  const statusBerubah = String(task.status || '').trim() !== String(oldStatus).trim();
  const statusBy = statusBerubah ? statusByStamp(actor) : ((existingTask && existingTask.statusBy) || '');
  const rowData = taskToRow(Object.assign({}, task, { id: finalId, createdBy, statusBy }), existingTask);

  if (!isUpdate) {
    rowNumber = CONFIG.FIRST_DATA_ROW + ids.length; // baris kosong berikutnya
  }
  await valuesUpdate(
    `${CONFIG.TASK_SHEET}!${CONFIG.FIRST_COL_LETTER}${rowNumber}:${CONFIG.LAST_COL_LETTER}${rowNumber}`,
    [rowData],
  );

  const savedRows = await valuesGet(`${CONFIG.TASK_SHEET}!${CONFIG.FIRST_COL_LETTER}${rowNumber}:${CONFIG.LAST_COL_LETTER}${rowNumber}`);
  const saved = rowToTask(savedRows[0] || rowData, rowNumber);
  // `statusBerubah` sudah dihitung di atas untuk keperluan statusBy — dipakai ulang
  // di sini. Pada task baru, oldStatus kosong sehingga tercatat "" → status awal,
  // yang memang benar: itu titik masuk task ke alur kerja.
  await logActivity(actor, isUpdate ? 'Update Task' : 'Create Task', saved.id,
    `${saved.taskName} • Status: ${saved.status} • PIC: ${saved.pic}`,
    statusBerubah ? oldStatus : '', statusBerubah ? saved.status : '');

  const tasks = await getTasks();
  return { success: true, message: 'Task berhasil disimpan.', task: saved, tasks };
}

async function deleteTask(taskId, actor) {
  const ids = await getTaskIdColumn();
  const rowNumber = findRowByTaskId(ids, taskId);
  if (rowNumber === -1) return { success: false, message: 'Task ID tidak ditemukan.' };

  const cur = await valuesGet(`${CONFIG.TASK_SHEET}!${CONFIG.FIRST_COL_LETTER}${rowNumber}:${CONFIG.LAST_COL_LETTER}${rowNumber}`);
  const removed = rowToTask(cur[0] || [], rowNumber);

  const meta = await getSheetMeta();
  const sheetId = meta[CONFIG.TASK_SHEET] && meta[CONFIG.TASK_SHEET].sheetId;
  if (sheetId === undefined || sheetId === null) return { success: false, message: 'Sheet Main tidak ditemukan.' };

  await batchUpdate([{
    deleteDimension: {
      range: { sheetId, dimension: 'ROWS', startIndex: rowNumber - 1, endIndex: rowNumber },
    },
  }]);

  // Ceklis, komentar, notifikasi, dan riwayatnya ikut dibuang. Nomor task dipakai ulang
  // (generateTaskId = max+1), jadi kalau ditinggalkan, task BARU akan mewarisi ceklis dan
  // percakapan milik task yang sudah dihapus.
  let ikut = 0;
  ikut += await purgeRowsForRef(CONFIG.CHECKLIST_SHEET, 'G', 0, taskId);   // A = Task ID
  ikut += await purgeRowsForRef(CONFIG.COMMENTS_SHEET, 'D', 1, taskId);    // B = Task ID
  ikut += await purgeRowsForRef(CONFIG.NOTIF_SHEET, 'H', 3, taskId);       // D = Ref ID
  ikut += await purgeRowsForRef(CONFIG.ACTIVITY_SHEET, 'E', 3, taskId);    // D = Task ID
  // Jejak penghapusan dicatat TANPA taskId, supaya tak nyangkut di task bernomor sama.
  await logActivity(String(actor || '').trim() || 'Unknown', 'Delete Task', '',
    `${taskId} dihapus: ${removed.taskName || ''} (${ikut} ceklis/komentar/notifikasi/aktivitas ikut dibuang)`);
  const tasks = await getTasks();
  return { success: true, message: 'Task berhasil dihapus.', tasks };
}

const QUICK_FIELD_COL = {
  status: COL.status, priority: COL.priority, pic: COL.pic, stage: COL.stage, mirror: COL.mirror,
};

async function quickUpdateField(taskId, field, value, actor) {
  const f = String(field || '');
  const ids = await getTaskIdColumn();
  const row = findRowByTaskId(ids, taskId);
  if (row === -1) return { success: false, message: 'Task ID tidak ditemukan.' };

  const col = QUICK_FIELD_COL[f];
  if (!col) {
    // Field 'virtual' tanpa kolom di sheet ini: no-op sukses agar UI tidak menampilkan error.
    if (['startDate', 'approvalGate', 'lastUpdate'].includes(f)) {
      const cur0 = await valuesGet(`${CONFIG.TASK_SHEET}!${CONFIG.FIRST_COL_LETTER}${row}:${CONFIG.LAST_COL_LETTER}${row}`);
      return { success: true, message: `${f} dinonaktifkan (tidak disimpan).`, task: rowToTask(cur0[0] || [], row) };
    }
    return { success: false, message: 'Field tidak didukung: ' + field };
  }

  // Untuk perubahan status, baris lamanya dibaca lebih dulu — dipakai dua hal
  // sekaligus: gerbang izin "Done", dan pencatatan status LAMA ke log. Satu
  // pembacaan melayani keduanya, jadi tak ada tambahan kuota untuk jalur Done.
  let oldStatus = '';
  if (f === 'status') {
    const cur0 = await valuesGet(`${CONFIG.TASK_SHEET}!${CONFIG.FIRST_COL_LETTER}${row}:${CONFIG.LAST_COL_LETTER}${row}`);
    const existing = rowToTask(cur0[0] || [], row);
    oldStatus = existing.status;
    // Gerbang "Done": yang bukan Done approver tak boleh memindahkan task KE Done.
    // Task yang sudah Done tetap boleh diubah (mis. ditarik balik) — yang dilarang
    // hanya aksi menetapkan Done. Izinnya bergantung PIC task — Staff boleh
    // menutup task milik anak magang.
    if (isDoneStatus(value)) {
      await loadUsers();
      if (!isDoneStatus(oldStatus) && !canApproveDone(actor, existing.pic, existing.support)) {
        return { success: false, message: doneDeniedMessage(existing.pic) };
      }
    }
  }

  await valuesUpdate(`${CONFIG.TASK_SHEET}!${col}${row}`, [[value]]);
  // Catat siapa yang mengubah status. Wajib untuk task milik bersama (PIC berupa peran):
  // tanpa ini, satu status dipakai beramai-ramai tanpa jejak siapa yang menggerakkannya.
  if (f === 'status') await valuesUpdate(`${CONFIG.TASK_SHEET}!${COL.statusBy}${row}`, [[statusByStamp(actor)]]);
  // Kolom status hanya diisi bila status benar-benar berpindah. Menyetel ulang ke
  // nilai yang sama bukan perpindahan, dan kalau dicatat akan terbaca sebagai
  // "selesai hari ini" oleh penghitung riwayat.
  const statusBerpindah = f === 'status' && String(value || '').trim() !== String(oldStatus).trim();
  await logActivity(String(actor || '').trim() || 'Unknown', 'Update Task', taskId, `${field} → ${value}`,
    statusBerpindah ? oldStatus : '', statusBerpindah ? String(value || '') : '');

  const cur = await valuesGet(`${CONFIG.TASK_SHEET}!${CONFIG.FIRST_COL_LETTER}${row}:${CONFIG.LAST_COL_LETTER}${row}`);
  const saved = rowToTask(cur[0] || [], row);
  return { success: true, message: `${field} diperbarui.`, task: saved };
}

async function quickUpdateDates(taskId, startDate, dueDate, actor) {
  const ids = await getTaskIdColumn();
  const row = findRowByTaskId(ids, taskId);
  if (row === -1) return { success: false, message: 'Task ID tidak ditemukan.' };

  // Sheet ini hanya punya kolom Due Date (tanpa Start Date / Last Update).
  const data = [];
  if (dueDate) data.push({ range: `${CONFIG.TASK_SHEET}!${COL.dueDate}${row}`, values: [[toSheetDate(dueDate)]] });

  if (data.length) {
    const sheets = await getSheets();
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: getSpreadsheetId(),
      requestBody: { valueInputOption: 'USER_ENTERED', data },
    });
  }

  await logActivity(String(actor || '').trim() || 'Unknown', 'Update Task', taskId,
    `Jadwal: ${startDate || '?'} → ${dueDate || '?'}`);

  const cur = await valuesGet(`${CONFIG.TASK_SHEET}!${CONFIG.FIRST_COL_LETTER}${row}:${CONFIG.LAST_COL_LETTER}${row}`);
  const saved = rowToTask(cur[0] || [], row);
  return { success: true, message: 'Jadwal diperbarui.', task: saved };
}

/* ------------------------------------------------------------------ */
/* OPTIONS                                                             */
/* ------------------------------------------------------------------ */

async function readOptionsRaw(pre) {
  const rows = pre !== undefined ? pre : await valuesGet(`${CONFIG.OPTIONS_SHEET}!A2:D`, { valueRenderOption: 'UNFORMATTED_VALUE' });
  return rows
    .map((r, i) => ({
      row: i + 2,
      type: String((r && r[0]) || '').trim(),
      value: String((r && r[1]) || '').trim(),
      active: r && (r[2] === true || String(r[2]).toUpperCase() === 'TRUE'),
      parent: String((r && r[3]) || '').trim(),
    }))
    .filter(r => r.type && r.value);
}

async function getOptions(pre) {
  let raw = [];
  try {
    raw = (await readOptionsRaw(pre)).filter(r => r.active);
  } catch (e) {
    raw = [];
  }
  const options = {};
  OPTION_TYPES.forEach(t => (options[t] = []));
  const verbMap = {};  // { stage: [kata kerja, ...] }
  const objekMap = {}; // { "stage||verb": [objek, ...] }
  raw.forEach(row => {
    if (!options[row.type]) options[row.type] = [];
    if (!options[row.type].includes(row.value)) options[row.type].push(row.value);
    if (row.type === 'verb' && row.parent) { (verbMap[row.parent] = verbMap[row.parent] || []); if (!verbMap[row.parent].includes(row.value)) verbMap[row.parent].push(row.value); }
    if (row.type === 'object' && row.parent) { (objekMap[row.parent] = objekMap[row.parent] || []); if (!objekMap[row.parent].includes(row.value)) objekMap[row.parent].push(row.value); }
  });
  OPTION_TYPES.forEach(t => {
    if (!options[t] || !options[t].length) options[t] = DEFAULT_OPTIONS[t] || [];
  });
  options.verbMap = verbMap;
  options.objekMap = objekMap;
  return options;
}

const USES_PARENT = ['verb', 'object']; // tipe opsi bertingkat (punya induk di kolom Parent): kata kerja & objek

async function saveOption(type, value, parent) {
  type = String(type || '').trim();
  value = String(value || '').trim();
  parent = String(parent || '').trim();
  if (!OPTION_TYPES.includes(type)) return { success: false, message: 'Tipe opsi tidak valid.' };
  if (!value) return { success: false, message: 'Nilai opsi tidak boleh kosong.' };
  if (USES_PARENT.includes(type) && !parent) return { success: false, message: 'Opsi ini wajib punya induk (parent).' };

  await ensureOptionsSheet();
  const rows = await readOptionsRaw();
  const found = rows.find(r => r.type === type && r.value.toLowerCase() === value.toLowerCase() && (!USES_PARENT.includes(type) || r.parent.toLowerCase() === parent.toLowerCase()));
  if (found) {
    await valuesUpdate(`${CONFIG.OPTIONS_SHEET}!C${found.row}:D${found.row}`, [[true, parent]]);
  } else {
    await valuesAppend(`${CONFIG.OPTIONS_SHEET}!A:D`, [[type, value, true, parent]]);
  }
  await applySheetValidations().catch(() => {});
  return { success: true, message: 'Opsi berhasil disimpan.', options: await getOptions() };
}

async function deleteOption(type, value, parent) {
  type = String(type || '').trim();
  value = String(value || '').trim();
  parent = String(parent || '').trim();
  if (!OPTION_TYPES.includes(type)) return { success: false, message: 'Tipe opsi tidak valid.' };

  const rows = await readOptionsRaw();
  const found = rows.find(r => r.type === type && r.value.toLowerCase() === value.toLowerCase() && (!USES_PARENT.includes(type) || r.parent.toLowerCase() === parent.toLowerCase()));
  if (found) await valuesUpdate(`${CONFIG.OPTIONS_SHEET}!C${found.row}`, [[false]]);
  await applySheetValidations().catch(() => {});
  return { success: true, message: 'Opsi berhasil dinonaktifkan.', options: await getOptions() };
}

// Edit (rename) nilai opsi + cascade ke task yang masih memakai nilai lama.
async function editOption(type, oldValue, newValue, parent) {
  type = String(type || '').trim();
  oldValue = String(oldValue || '').trim();
  newValue = String(newValue || '').trim();
  parent = String(parent || '').trim();
  if (!OPTION_TYPES.includes(type)) return { success: false, message: 'Tipe opsi tidak valid.' };
  if (!oldValue || !newValue) return { success: false, message: 'Nilai lama/baru tidak boleh kosong.' };
  const rows = await readOptionsRaw();
  const found = rows.find(r => r.type === type && r.value.toLowerCase() === oldValue.toLowerCase() && (!USES_PARENT.includes(type) || r.parent.toLowerCase() === parent.toLowerCase()));
  if (!found) return { success: false, message: 'Opsi tidak ditemukan.' };
  await valuesUpdate(`${CONFIG.OPTIONS_SHEET}!B${found.row}`, [[newValue]]);

  if (USES_PARENT.includes(type)) {
    // Kata kerja / objek: cukup ganti nama opsi. Nama task lama tidak diubah otomatis.
    await applySheetValidations().catch(() => {});
    return { success: true, message: `"${oldValue}" diubah menjadi "${newValue}".`, options: await getOptions() };
  }

  const col = COL[type];
  if (col) {
    const taskRows = await valuesGet(MAIN_DATA_RANGE());
    const colIdx = col.charCodeAt(0) - 'B'.charCodeAt(0);
    const data = [];
    taskRows.forEach((row, idx) => {
      const cur = String((row && row[colIdx]) || '');
      if (!cur) return;
      const rowNumber = CONFIG.FIRST_DATA_ROW + idx;
      if (type === 'support') {
        const parts = cur.split(',').map(s => s.trim()).filter(Boolean);
        if (parts.some(p => p.toLowerCase() === oldValue.toLowerCase())) {
          const np = parts.map(p => p.toLowerCase() === oldValue.toLowerCase() ? newValue : p).join(', ');
          data.push({ range: `${CONFIG.TASK_SHEET}!${col}${rowNumber}`, values: [[np]] });
        }
      } else if (cur.toLowerCase() === oldValue.toLowerCase()) {
        data.push({ range: `${CONFIG.TASK_SHEET}!${col}${rowNumber}`, values: [[newValue]] });
      }
    });
    if (data.length) {
      const sheets = await getSheets();
      await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: getSpreadsheetId(), requestBody: { valueInputOption: 'USER_ENTERED', data } });
    }
  }
  await applySheetValidations().catch(() => {});
  return { success: true, message: `"${oldValue}" diubah menjadi "${newValue}".`, options: await getOptions(), tasks: await getTasks() };
}

/* ------------------------------------------------------------------ */
/* COMMENTS                                                            */
/* ------------------------------------------------------------------ */

async function getComments(taskId) {
  let rows = [];
  try {
    rows = await valuesGet(`${CONFIG.COMMENTS_SHEET}!A2:D`);
  } catch (e) {
    return [];
  }
  return rows
    .filter(r => String((r && r[1]) || '') === String(taskId || ''))
    .map(r => ({
      timestamp: formatDate(r[0], true),
      taskId: String(r[1] || ''),
      author: String(r[2] || ''),
      message: String(r[3] || ''),
    }));
}

async function addComment(payload) {
  const taskId = String((payload && payload.taskId) || '').trim();
  const author = String((payload && payload.author) || 'Unknown').trim();
  const message = String((payload && payload.message) || '').trim();
  if (!taskId) return { success: false, message: 'Task ID tidak valid.' };
  if (!message) return { success: false, message: 'Komentar tidak boleh kosong.' };

  await ensureCommentsSheet();
  await valuesAppend(`${CONFIG.COMMENTS_SHEET}!A:D`, [[nowStamp(), taskId, author, message]]);
  await logActivity(author, 'Comment', taskId, message.length > 120 ? message.slice(0, 117) + '...' : message);
  await createMentionNotifications(taskId, author, message).catch(() => {});   // tag @user -> notifikasi
  return { success: true, message: 'Komentar berhasil ditambahkan.', comments: await getComments(taskId) };
}

/* ------------------------------------------------------------------ */
/* CHECKLIST (ceklis per task: PM menyusun, PIC mencentang)            */
/* ------------------------------------------------------------------ */

async function ensureChecklistSheet() {
  if (_ensured.has('checklist')) return;
  await ensureSheetExists(CONFIG.CHECKLIST_SHEET);
  const head = await valuesGet(`${CONFIG.CHECKLIST_SHEET}!A1:G1`);
  if (!head.length || !head[0] || !head[0][0]) {
    await valuesUpdate(`${CONFIG.CHECKLIST_SHEET}!A1:G1`,
      [['Task ID', 'Item', 'Done', 'Created By', 'Checked By', 'Checked At', 'Link']]);
  } else if (!head[0][6]) {
    await valuesUpdate(`${CONFIG.CHECKLIST_SHEET}!G1`, [['Link']]);   // lampiran hasil — OPSIONAL
  }
  _ensured.add('checklist');
}

function isChecked(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === 'true' || s === 'ya' || s === 'yes' || s === '1' || s === 'x';
}

// Actor adalah PIC atau Support dari task ini? (server-side, mencerminkan ownsTask di UI)
function ownsTaskActor(task, actor) {
  const a = baseName(actor);
  if (!a || !task) return false;
  // PIC berupa peran -> dimiliki bersama oleh semua yang berperan itu.
  const rp = rolePicOf(task.pic);
  if (rp && hasRole(actor, rp.toLowerCase())) return true;
  if (baseName(task.pic) === a) return true;
  return String(task.support || '').split(',').map(s => baseName(s)).filter(Boolean).includes(a);
}

async function getTaskById(taskId) {
  const ids = await getTaskIdColumn();
  const row = findRowByTaskId(ids, taskId);
  if (row === -1) return null;
  const cur = await valuesGet(`${CONFIG.TASK_SHEET}!${CONFIG.FIRST_COL_LETTER}${row}:${CONFIG.LAST_COL_LETTER}${row}`);
  return rowToTask(cur[0] || [], row);
}

// Boleh menambah item & mencentang.
//  - Sub-ceklis proses kolaborasi (id "COL-xxx#N"): FLEKSIBEL — siapa pun boleh
//    (mode lihat-saja sudah diblokir di gerbang RPC).
//  - Ceklis task biasa: manager/Dev, atau PIC/Support task itu.
async function canEditChecklist(taskId, actor) {
  if (parseCollabStep(taskId)) return !!baseName(actor);
  await loadUsers();
  if (isManagerActor(actor)) return true;
  const task = await getTaskById(taskId);
  return ownsTaskActor(task, actor);
}
// Boleh menghapus item.
//  - Sub-ceklis proses kolaborasi: FLEKSIBEL — siapa pun boleh.
//  - Ceklis task biasa: manager/Dev SAJA (item dari PM tak boleh dihilangkan PIC).
/* Boleh menghapus item ceklis?
   - Sub-ceklis kolaborasi: fleksibel, seperti aturan mencentangnya.
   - Ceklis task biasa: Manager, Leader, ATAU orang yang MEMBUAT item itu. Pembuatnya perlu
     bisa membereskan salah ketiknya sendiri; sebelumnya hanya manager, jadi PIC terpaksa
     menitip hapus. Item buatan orang lain tetap tak bisa dihapus sembarang PIC. */
async function canDeleteChecklist(taskId, actor, createdBy) {
  if (parseCollabStep(taskId)) return !!baseName(actor);
  await loadUsers();
  if (isManagerActor(actor) || isLeaderActor(actor)) return true;
  const pembuat = baseName(createdBy);
  // Pembuat tak diketahui (item lama dgn kolom D rusak): jatuh ke siapa pun yang memang
  // berhak mengubah ceklis task ini — PM atau PIC/Support-nya. Tanpa cadangan ini, item
  // lama terkunci selamanya dan hanya bisa dihapus Leader/Manager.
  if (!pembuat) return await canEditChecklist(taskId, actor);
  return pembuat === baseName(actor);
}

async function getChecklist(taskId) {
  let rows = [];
  try { rows = await valuesGet(`${CONFIG.CHECKLIST_SHEET}!A2:G`); } catch (e) { return []; }
  return rows
    .map((r, i) => ({
      row: i + 2,
      taskId: String((r && r[0]) || '').trim(),
      item: String((r && r[1]) || '').trim(),
      done: isChecked(r && r[2]),
      // Baris lama bisa punya kolom D rusak: sebelum 1.77.0, mencentang item menimpanya
      // dengan TEKS ITEM. Tandanya pasti (D === B), jadi dibaca sebagai "pembuat tak diketahui"
      // — bukan ditebak jadi nama orang, karena menebak pemilik lebih berbahaya daripada mengaku
      // tidak tahu. Izin menghapusnya lalu jatuh ke aturan cadangan di canDeleteChecklist().
      createdBy: (function(){
        const d = String((r && r[3]) || '').trim();
        return d && d === String((r && r[1]) || '').trim() ? '' : d;
      })(),
      checkedBy: String((r && r[4]) || '').trim(),
      checkedAt: stampStr(r && r[5]),
      link: String((r && r[6]) || '').trim(),   // lampiran hasil (opsional)
    }))
    .filter(c => c.taskId === String(taskId || '').trim() && c.item);
}

async function addChecklistItem(taskId, item, actor, link) {
  taskId = String(taskId || '').trim();
  item = String(item || '').trim();
  actor = String(actor || '').trim() || 'Unknown';
  if (!taskId) return { success: false, message: 'Task ID tidak valid.' };
  if (!item) return { success: false, message: 'Item ceklis tidak boleh kosong.' };
  if (!(await canEditChecklist(taskId, actor))) {
    return { success: false, message: 'Hanya PM atau PIC/Support task ini yang bisa menambah item ceklis.' };
  }
  await ensureChecklistSheet();
  await valuesAppend(`${CONFIG.CHECKLIST_SHEET}!A:G`, [[taskId, item, 'FALSE', actor, '', '', String(link || '').trim()]]);
  await logActivity(actor, 'Checklist Add', taskId, item.length > 120 ? item.slice(0, 117) + '...' : item);
  return { success: true, message: 'Item ceklis ditambahkan.', checklist: await getChecklist(taskId) };
}

// Salin seluruh sub-ceklis satu proses ke proses lain. Dipakai saat beberapa proses
// mengerjakan daftar yang sama (mis. Alya "Generate" 23 item, lalu Ali "QC" daftar itu juga).
// Ditulis sekali jalan, bukan 23 panggilan terpisah, supaya cepat & tak putus di tengah.
// Item selalu masuk dalam keadaan BELUM tercentang — status pengerjaan tidak ikut disalin.
async function copyChecklist(fromId, toIds, actor) {
  fromId = String(fromId || '').trim();
  actor = String(actor || '').trim() || 'Unknown';
  const targets = (Array.isArray(toIds) ? toIds : [toIds]).map(x => String(x || '').trim())
    .filter(x => x && x !== fromId);
  if (!fromId) return { success: false, message: 'Sumber ceklis tidak valid.' };
  if (!targets.length) return { success: false, message: 'Pilih minimal satu proses tujuan.' };
  if (!(await canEditChecklist(fromId, actor))) {
    return { success: false, message: 'Anda tidak berhak membaca ceklis sumber.' };
  }

  const source = await getChecklist(fromId);
  if (!source.length) return { success: false, message: 'Sub-ceklis sumber masih kosong — tidak ada yang disalin.' };

  const rows = [];
  const ditolak = [];
  for (const to of targets) {
    if (!(await canEditChecklist(to, actor))) { ditolak.push(to); continue; }
    source.forEach(it => rows.push([to, it.item, 'FALSE', actor, '', '', it.link || '']));
  }
  if (!rows.length) return { success: false, message: 'Anda tidak berhak menambah ceklis di proses tujuan.' };

  await ensureChecklistSheet();
  await valuesAppend(`${CONFIG.CHECKLIST_SHEET}!A:G`, rows);
  const berhasil = targets.length - ditolak.length;
  await logActivity(actor, 'Checklist Copy', fromId, `${source.length} item → ${berhasil} proses`);
  return {
    success: true,
    message: `${source.length} sub-item disalin ke ${berhasil} proses.` + (ditolak.length ? ` ${ditolak.length} dilewati (tanpa izin).` : ''),
    copied: source.length,
    targets: berhasil,
    checklistSummary: await getChecklistSummary(),
  };
}

async function setChecklistDone(taskId, row, done, actor) {
  taskId = String(taskId || '').trim();
  row = parseInt(row, 10);
  actor = String(actor || '').trim() || 'Unknown';
  const val = !!done;
  if (!row || row < 2) return { success: false, message: 'Baris tidak valid.' };
  if (!(await canEditChecklist(taskId, actor))) {
    return { success: false, message: 'Hanya PM atau PIC/Support task ini yang bisa mencentang ceklis.' };
  }
  // Pastikan baris ini benar milik task tsb (hindari salah-centang bila baris bergeser).
  const cur = await valuesGet(`${CONFIG.CHECKLIST_SHEET}!A${row}:B${row}`);
  const owner = String((cur[0] && cur[0][0]) || '').trim();
  if (owner !== taskId) return { success: false, message: 'Item ceklis tidak cocok dengan task ini. Muat ulang.' };
  // JANGAN menulis kolom D di sini — itu "Created By". Menulis rentang C:F sekaligus dulu
  // menimpanya dengan teks item, sehingga pembuat item hilang setiap kali dicentang.
  await valuesUpdate(`${CONFIG.CHECKLIST_SHEET}!C${row}`, [[val ? 'TRUE' : 'FALSE']]);
  await valuesUpdate(`${CONFIG.CHECKLIST_SHEET}!E${row}:F${row}`, [[val ? actor : '', val ? nowStamp() : '']]);
  const list = await getChecklist(taskId);
  const restamped = await restampCollabStep(taskId, list, actor);
  return {
    success: true, message: val ? 'Item dicentang.' : 'Centang dibatalkan.', checklist: list,
    ...(restamped ? { collabs: await getCollabs(), stepRestamped: true } : {}),
  };
}

// Proses yang punya sub-ceklis baru benar-benar rampung saat sub-ceklisnya tuntas. Jadi bila
// sub-item ditambahkan setelah prosesnya dicentang (sub jadi 5/6), lalu item terakhir itu
// dicentang, tanggal selesai prosesnya ikut diperbarui — tanpa perlu buka-tutup centang utama.
// Hanya berlaku untuk proses yang SUDAH dicentang; yang belum tetap butuh tindakan PIC-nya.
async function restampCollabStep(taskId, list, actor) {
  const ref = parseCollabStep(taskId);
  if (!ref || !list.length || list.some(i => !i.done)) return false;
  let srows = [];
  try { srows = await valuesGet(`${CONFIG.COLLAB_STEP_SHEET}!A2:H`); } catch (e) { return false; }
  const idx = srows.findIndex(r => String((r && r[0]) || '').trim() === ref.collabId && Number((r && r[1]) || 0) === ref.order);
  if (idx < 0) return false;
  const sudahDone = String((srows[idx] && srows[idx][5]) || '').toUpperCase() === 'TRUE';
  if (!sudahDone) return false;
  const rn = idx + 2;
  await valuesUpdate(`${CONFIG.COLLAB_STEP_SHEET}!H${rn}`, [[nowStamp()]]);
  await logActivity(actor, 'Collab Step Restamp', ref.collabId, `Proses ${ref.order}: tanggal selesai diperbarui (sub-ceklis tuntas)`);
  return true;
}

/* Lampiran hasil pada satu item ceklis — OPSIONAL. Dipakai saat pekerjaan sudah selesai
   dan hasilnya perlu bisa dibuka langsung (Drive/Docs/Sheets). Izinnya mengikuti aturan
   mencentang: siapa pun yang boleh mengubah ceklis task itu boleh melampirkan. */
async function setChecklistLink(taskId, row, link, actor) {
  taskId = String(taskId || '').trim();
  row = parseInt(row, 10);
  actor = String(actor || '').trim() || 'Unknown';
  link = String(link || '').trim();
  if (!row || row < 2) return { success: false, message: 'Baris tidak valid.' };
  if (link.length > 500) return { success: false, message: 'Link terlalu panjang (maks 500 karakter).' };
  if (!(await canEditChecklist(taskId, actor))) {
    return { success: false, message: 'Anda tak berhak mengubah ceklis ini.' };
  }
  const cur = await valuesGet(`${CONFIG.CHECKLIST_SHEET}!A${row}:B${row}`);
  if (String((cur[0] && cur[0][0]) || '').trim() !== taskId) {
    return { success: false, message: 'Item ceklis tidak cocok dengan task ini. Muat ulang.' };
  }
  await ensureChecklistSheet();
  await valuesUpdate(`${CONFIG.CHECKLIST_SHEET}!G${row}`, [[link]]);
  await logActivity(actor, 'Checklist Link', taskId, link ? ('lampiran: ' + link.slice(0, 90)) : 'lampiran dihapus');
  return { success: true, message: link ? 'Link dilampirkan.' : 'Link dihapus.', checklist: await getChecklist(taskId) };
}

async function deleteChecklistItem(taskId, row, actor) {
  taskId = String(taskId || '').trim();
  row = parseInt(row, 10);
  actor = String(actor || '').trim() || 'Unknown';
  if (!row || row < 2) return { success: false, message: 'Baris tidak valid.' };
  // Baca dulu barisnya: izin menghapus bergantung SIAPA yang membuat item itu.
  const cur = await valuesGet(`${CONFIG.CHECKLIST_SHEET}!A${row}:D${row}`);
  const owner = String((cur[0] && cur[0][0]) || '').trim();
  if (owner !== taskId) return { success: false, message: 'Item ceklis tidak cocok dengan task ini. Muat ulang.' };
  // Kolom D bisa rusak pada baris lama (tertimpa teks item sebelum 1.77.0) -> anggap
  // pembuatnya tak diketahui, sama seperti pembacaan di getChecklist().
  const dRaw = String((cur[0] && cur[0][3]) || '').trim();
  const pembuat = (dRaw && dRaw === String((cur[0] && cur[0][1]) || '').trim()) ? '' : dRaw;
  if (!(await canDeleteChecklist(taskId, actor, pembuat))) {
    return { success: false, message: `Hanya ${pembuat || 'pembuat item'}, Leader, atau Manager yang bisa menghapus item ini.` };
  }
  const meta = await getSheetMeta();
  const sheetId = meta[CONFIG.CHECKLIST_SHEET] && meta[CONFIG.CHECKLIST_SHEET].sheetId;
  if (sheetId == null) return { success: false, message: 'Sheet CHECKLIST tidak ditemukan.' };
  await batchUpdate([{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } }]);
  await logActivity(actor, 'Checklist Delete', taskId, String((cur[0] && cur[0][1]) || ''));
  return { success: true, message: 'Item ceklis dihapus.', checklist: await getChecklist(taskId) };
}

// Ringkasan progres semua task (untuk bootstrap): { taskId: {done, total} }
async function getChecklistSummary(pre) {
  let rows = [];
  if (pre !== undefined) rows = pre;
  /* null = TAK DIKETAHUI, bukan "tak ada ceklis". Gagal baca sesaat dulu mengembalikan {},
     dan {} tak bisa dibedakan dari benar-benar kosong — akibatnya lencana progres ceklis
     lenyap dari seluruh papan seolah tak ada yang pernah dibuat. Pemanggil di layar sudah
     menjaga nilai kosong, jadi yang lama dipertahankan. Sengaja TIDAK dilempar: fungsi ini
     ikut dipakai saat muat-awal, dan melempar berarti seluruh aplikasi gagal terbuka. */
  else { try { rows = await valuesGet(`${CONFIG.CHECKLIST_SHEET}!A2:C`); } catch (e) { return null; } }
  const out = {};
  rows.forEach(r => {
    const id = String((r && r[0]) || '').trim();
    if (!id || !String((r && r[1]) || '').trim()) return;
    if (!out[id]) out[id] = { done: 0, total: 0 };
    out[id].total++;
    if (isChecked(r && r[2])) out[id].done++;
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* COLLAB (task kolaborasi: alur proses beruntun antar-PIC)            */
/* Manager menyusun proses (nama + PIC + deadline); tiap proses hanya  */
/* bisa dicentang oleh PIC-nya. Urutan dipakai untuk handoff/notif.    */
/* ------------------------------------------------------------------ */

async function ensureCollabSheets() {
  if (_ensured.has('collab')) return;
  await ensureSheetExists(CONFIG.COLLAB_SHEET);
  let head = await valuesGet(`${CONFIG.COLLAB_SHEET}!A1:I1`);
  let h0 = head[0] || [];
  if (!h0[0]) await valuesUpdate(`${CONFIG.COLLAB_SHEET}!A1:J1`, [['Collab ID', 'Platform', 'Title', 'Description', 'Created By', 'Created At', 'Deadline', 'Type', 'Color', 'Paket ID']]);
  else {
    if (!h0[6]) await valuesUpdate(`${CONFIG.COLLAB_SHEET}!G1`, [['Deadline']]);   // deadline project keseluruhan
    if (!h0[7]) await valuesUpdate(`${CONFIG.COLLAB_SHEET}!H1`, [['Type']]);        // tipe task (untuk Kanban per-tipe)
    if (!h0[8]) await valuesUpdate(`${CONFIG.COLLAB_SHEET}!I1`, [['Color']]);       // warna kartu (grid & kanban)
    if (!h0[9]) await valuesUpdate(`${CONFIG.COLLAB_SHEET}!J1`, [['Paket ID']]);    // paket utama yang digarap task ini
  }
  await ensureSheetExists(CONFIG.COLLAB_STEP_SHEET);
  head = await valuesGet(`${CONFIG.COLLAB_STEP_SHEET}!A1:K1`);
  h0 = head[0] || [];
  if (!h0[0]) await valuesUpdate(`${CONFIG.COLLAB_STEP_SHEET}!A1:K1`, [['Collab ID', 'Order', 'Step', 'PIC', 'Deadline', 'Done', 'Done By', 'Done At', 'Note', 'Stage', 'Link']]);
  else {
    if (!h0[8]) await valuesUpdate(`${CONFIG.COLLAB_STEP_SHEET}!I1`, [['Note']]);    // catatan per proses (PIC note)
    if (!h0[9]) await valuesUpdate(`${CONFIG.COLLAB_STEP_SHEET}!J1`, [['Stage']]);   // stage per proses — OPSIONAL
    if (!h0[10]) await valuesUpdate(`${CONFIG.COLLAB_STEP_SHEET}!K1`, [['Link']]);    // lampiran hasil — OPSIONAL
  }
  _ensured.add('collab');
}
function parseCollabStep(taskId) { const m = String(taskId || '').match(/^(COL-\d+)#(\d+)$/); return m ? { collabId: m[1], order: Number(m[2]) } : null; }
async function collabStepPic(collabId, order) { const c = (await getCollabs()).find(x => x.id === collabId); if (!c) return null; const s = c.steps.find(x => x.order === order); return s ? s.pic : null; }

function genCollabId(ids) {
  let max = 0;
  (ids || []).forEach(v => { const m = String(v || '').match(/(\d+)\s*$/); if (m) max = Math.max(max, Number(m[1])); });
  return 'COL-' + String(max + 1).padStart(3, '0');
}

// Mencentang = mengklaim pekerjaan itu selesai, jadi tetap khusus PIC proses (+ Dev).
// MEMBATALKAN centang adalah tindakan koreksi, bukan klaim — Manager boleh, supaya salah
// centang tak perlu menunggu orangnya. Argumen `undo` true = permintaan membatalkan.
function canCheckStep(stepPic, actor, undo) {
  if (baseName(actor) === 'dev') return true;
  if (undo && isManagerActor(actor)) return true;
  // PIC proses berupa peran -> proses milik bersama, siapa pun berperan itu boleh mencentang.
  const rp = rolePicOf(stepPic);
  if (rp) return hasRole(actor, rp.toLowerCase());
  const p = baseName(stepPic);
  return !!p && p === baseName(actor);
}

async function loadCollabsRaw(preC, preS) {
  let crows = [], srows = [];
  if (preC !== undefined) { crows = preC || []; srows = preS || []; }
  else {
    try {
      const b = await valuesBatchGet([`${CONFIG.COLLAB_SHEET}!A2:J`, `${CONFIG.COLLAB_STEP_SHEET}!A2:K`]);
      crows = b[`${CONFIG.COLLAB_SHEET}!A2:J`] || [];
      srows = b[`${CONFIG.COLLAB_STEP_SHEET}!A2:K`] || [];
    } catch (e) {
      /* JANGAN dijadikan daftar kosong. Indeks proses inilah yang menentukan setoran mana
         yang sudah "selesai"; kalau kosong, seluruh angka rancangan anjlok ke nol seolah
         tak ada yang pernah dikerjakan. Pemanggil di muat-awal sudah menangkapnya sendiri,
         jadi melempar di sini tidak membuat aplikasi gagal terbuka. */
      throw new Error('Gagal membaca data task kolaborasi: ' + ((e && e.message) || e));
    }
  }
  const steps = {};
  srows.forEach((r, i) => {
    const cid = String((r && r[0]) || '').trim(); if (!cid) return;
    (steps[cid] = steps[cid] || []).push({
      row: i + 2,
      order: Number((r && r[1]) || 0),
      name: String((r && r[2]) || '').trim(),
      pic: String((r && r[3]) || '').trim(),
      deadline: (r && r[4] != null && r[4] !== '') ? formatDate(r[4], false) : '',
      done: isChecked(r && r[5]),
      doneBy: String((r && r[6]) || '').trim(),
      doneAt: stampStr(r && r[7]),
      note: String((r && r[8]) || '').trim(),
      stage: String((r && r[9]) || '').trim(),   // OPSIONAL — baris lama tanpa kolom J terbaca ''
      link: String((r && r[10]) || '').trim(),  // lampiran hasil — OPSIONAL
    });
  });
  Object.values(steps).forEach(list => list.sort((a, b) => a.order - b.order));
  return crows.map((r, i) => {
    const id = String((r && r[0]) || '').trim();
    const list = steps[id] || [];
    const done = list.filter(s => s.done).length;
    return {
      row: i + 2, id,
      platform: String((r && r[1]) || '').trim(),
      title: String((r && r[2]) || '').trim(),
      description: String((r && r[3]) || '').trim(),
      createdBy: String((r && r[4]) || '').trim(),
      createdAt: stampStr(r && r[5]),
      deadline: (r && r[6] != null && r[6] !== '') ? formatDate(r[6], false) : '',
      type: String((r && r[7]) || '').trim(),
      color: String((r && r[8]) || '').trim(),
      // Kolom J hanya diakui kalau berpola PKG-xxx. Di sheet lama kolom itu sempat
      // dipakai orang untuk hal lain (mis. nama stage), dan menganggapnya tautan paket
      // akan memunculkan paket hantu yang tak pernah ada.
      paketId: (function(){ const v = String((r && r[9]) || '').trim(); return PKG_ID_RE.test(v) ? v : ''; })(),
      steps: list, done, total: list.length,
      status: (list.length && done >= list.length) ? 'Selesai' : 'Aktif',
    };
  }).filter(c => c.id);
}

/* getCollabs = collab mentah + paket yang tertaut padanya.
   Dipisah dua lapis karena readPackages() butuh indeks proses SELURUH collab (satu item
   bisa dihasilkan proses milik collab lain), jadi paket tak mungkin diselesaikan di
   tengah pembacaan collab tanpa memutar balik. */
async function getCollabs(preC, preS) {
  const collabs = await loadCollabsRaw(preC, preS);
  let pkgs = {};
  try { pkgs = await readPackages(buildStepIndex(collabs)); } catch (e) { pkgs = {}; }
  collabs.forEach(c => { c.pkg = c.paketId ? (pkgs[c.paketId] || null) : null; });
  return collabs;
}

/* ------------------------------------------------------------------ */
/* RANCANGAN PAKET — entitas tersendiri (PKG-xxx).                     */
/*                                                                     */
/* Manager menyusun RANCANGAN lebih dulu: daftar target per paket,      */
/* mis. "Latsol Verbal PCPM BI 41 — 10 Paket". Task kolaborasi lalu     */
/* MENYETOR sebagian demi sebagian: satu task 5 paket, task lain 5      */
/* paket, sampai targetnya terpenuhi.                                   */
/*                                                                     */
/* Pola itu sudah terjadi hari ini, cuma dihitung di kepala orang lalu  */
/* diketik ke sel: COL-009 "5 Paket TO" + COL-010 "TO 15 paket" = 20,   */
/* dan sheet Master menuliskan "Tahap 1 – 20 paket". Yang hilang cuma   */
/* penjumlahan otomatisnya, dan itulah yang dikembalikan di sini.       */
/*                                                                     */
/* Target = wewenang Manager. Kontribusi = milik task, jadi siapa pun   */
/* yang mengelola task itu boleh mengaturnya; kalau tidak, tiap task    */
/* baru harus menunggu Manager.                                         */
/* ------------------------------------------------------------------ */
const PKG_MARSEL = ['program', 'namaPaket', 'tagline', 'benefit', 'tanggal', 'tujuan'];
const PKG_PRODUK = ['dibimbing', 'latsol', 'materi', 'tryout', 'drilling', 'liveClass', 'catatan'];
const PKG_HEADERS = ['Paket ID', 'Platform', 'Marsel PIC', 'Program', 'Nama Paket', 'Tagline', 'Benefit',
  'Tanggal', 'Tujuan', 'Produk PIC', 'Dibimbing', 'Latsol', 'Materi', 'Tryout', 'Drilling',
  'Live Class', 'Catatan', 'Updated By', 'Updated At', 'Mirror'];
const PKGV_HEADERS = ['Paket ID', 'Order', 'Masa Aktif', 'Harga Awal', 'Harga Diskon', 'Status'];
/* Target rancangan. "Awal" = yang sudah tersedia sebelum task apa pun (mis. warisan
   angkatan lalu) — dihitung sebagai terpenuhi tanpa perlu kontribusi palsu. */
const PKGI_HEADERS = ['Item ID', 'Paket ID', 'Order', 'Kategori', 'Grup', 'Nama', 'Target', 'Satuan', 'Awal', 'Catatan'];
/* Setoran satu task terhadap satu target. Step Order 0 = dihitung saat TASK-nya Selesai,
   bukan per proses — dipakai kalau setorannya memang hasil seluruh task. */
const PKGC_HEADERS = ['Paket ID', 'Item ID', 'Collab ID', 'Step Order', 'Jumlah', 'Catatan'];
const PKG_KATEGORI = ['Dibimbing', 'Latsol', 'Materi', 'Tryout', 'Drilling', 'Live Class'];
// Kolom J COLLAB sempat diisi orang dengan hal lain (nama stage) sebelum jadi Paket ID.
const PKG_ID_RE = new RegExp('^PKG-[0-9]+$');

async function ensurePackageSheets() {
  if (_ensured.has('package')) return;
  await ensureSheetExists(CONFIG.PACKAGE_SHEET);
  let head = await valuesGet(`${CONFIG.PACKAGE_SHEET}!A1:T1`);
  // Dicek per PANJANG, bukan sekadar A1 kosong: sheet PACKAGES yang sudah telanjur ada
  // masih berjudul 19 kolom, jadi kolom Mirror yang baru tak akan pernah dapat judulnya.
  if (((head[0] || []).length) < PKG_HEADERS.length) await valuesUpdate(`${CONFIG.PACKAGE_SHEET}!A1:T1`, [PKG_HEADERS]);
  await ensureSheetExists(CONFIG.PACKAGE_VARIANT_SHEET);
  head = await valuesGet(`${CONFIG.PACKAGE_VARIANT_SHEET}!A1:F1`);
  if (!((head[0] || [])[0])) await valuesUpdate(`${CONFIG.PACKAGE_VARIANT_SHEET}!A1:F1`, [PKGV_HEADERS]);
  await ensureSheetExists(CONFIG.PACKAGE_ITEM_SHEET);
  head = await valuesGet(`${CONFIG.PACKAGE_ITEM_SHEET}!A1:J1`);
  if (!((head[0] || [])[0])) await valuesUpdate(`${CONFIG.PACKAGE_ITEM_SHEET}!A1:J1`, [PKGI_HEADERS]);
  await ensureSheetExists(CONFIG.PACKAGE_CONTRIB_SHEET);
  head = await valuesGet(`${CONFIG.PACKAGE_CONTRIB_SHEET}!A1:F1`);
  if (!((head[0] || [])[0])) await valuesUpdate(`${CONFIG.PACKAGE_CONTRIB_SHEET}!A1:F1`, [PKGC_HEADERS]);
  _ensured.add('package');
}

function emptyPackage(paketId) {
  const o = { id: String(paketId || ''), row: 0, platform: '', marselPic: '', produkPic: '', updatedBy: '', updatedAt: '', mirror: false, variants: [], items: [] };
  PKG_MARSEL.concat(PKG_PRODUK).forEach(k => { o[k] = ''; });
  return o;
}

function rowToPackage(r, rowNum) {
  const g = i => String((r && r[i]) != null ? r[i] : '').trim();
  return {
    id: g(0), row: rowNum,
    platform: g(1),
    marselPic: g(2),
    program: g(3), namaPaket: g(4), tagline: g(5), benefit: g(6),
    tanggal: (r && r[7] != null && r[7] !== '') ? formatDate(r[7], false) : '',
    tujuan: g(8),
    produkPic: g(9),
    dibimbing: g(10), latsol: g(11), materi: g(12), tryout: g(13),
    drilling: g(14), liveClass: g(15), catatan: g(16),
    updatedBy: g(17), updatedAt: stampStr(r && r[18]),
    // Kolom T: paket ini ikut ditampilkan ke Lintas Divisi atau tidak. Pola & kata
    // penyangkalnya disamakan dengan kolom Mirror pada task biasa.
    mirror: !['', 'tidak', 'no', 'false', '0'].includes(g(19).toLowerCase()),
    variants: [], items: [],
  };
}

function packageToRow(p) {
  return [p.id, p.platform, p.marselPic, p.program, p.namaPaket, p.tagline, p.benefit,
    p.tanggal ? toSheetDate(p.tanggal) : '', p.tujuan, p.produkPic,
    p.dibimbing, p.latsol, p.materi, p.tryout, p.drilling, p.liveClass, p.catatan,
    p.updatedBy, p.updatedAt, p.mirror ? 'TRUE' : ''];
}

function packageFilled(p) {
  const hit = list => list.filter(k => String((p && p[k]) || '').trim()).length;
  const m = hit(PKG_MARSEL), d = hit(PKG_PRODUK);
  return {
    marsel: m, marselTotal: PKG_MARSEL.length,
    produk: d, produkTotal: PKG_PRODUK.length,
    total: m + d, grandTotal: PKG_MARSEL.length + PKG_PRODUK.length,
  };
}

/* Status target dihitung, tak pernah diketik:
     terpenuhi = Awal + setoran yang prosesnya sudah selesai
     menunggu  = setoran yang prosesnya belum selesai
   "lebih" sengaja TIDAK dibulatkan jadi "done" — kelebihan biasanya berarti salah hitung
   atau ada setoran dobel, dan justru itu yang perlu terlihat. */
function itemHitung(it) {
  const target = Number(it.target || 0) || 0;
  const awal = Number(it.awal || 0) || 0;
  let terpenuhi = awal, menunggu = 0;
  (it.kontrib || []).forEach(k => { if (k.selesai) terpenuhi += Number(k.jumlah || 0) || 0; else menunggu += Number(k.jumlah || 0) || 0; });
  const sisa = Math.max(0, target - terpenuhi);
  let status = 'belum';
  if (target > 0 && terpenuhi > target) status = 'lebih';
  else if (target > 0 && terpenuhi >= target) status = 'done';
  else if (menunggu > 0) status = 'proses';
  else if (terpenuhi > 0) status = 'sebagian';
  return { target, awal, terpenuhi, menunggu, sisa, lebih: Math.max(0, terpenuhi - target), status };
}
function itemRingkas(items) {
  const r = { target: 0, terpenuhi: 0, menunggu: 0, sisa: 0, jml: (items || []).length,
    done: 0, lebih: 0, kurang: 0 };
  (items || []).forEach(it => {
    r.target += it.target; r.terpenuhi += it.terpenuhi; r.menunggu += it.menunggu; r.sisa += it.sisa;
    if (it.status === 'done') r.done++;
    else if (it.status === 'lebih') r.lebih++;
    else r.kurang++;
  });
  return r;
}

function canEditPackageArea(pkg, area, actor, terlibat) {
  const a = baseName(actor); if (!a) return false;
  if (isManagerActor(actor) || isLeaderActor(actor)) return true;
  const pic = baseName(area === 'marsel' ? (pkg && pkg.marselPic) : (pkg && pkg.produkPic));
  if (!pic) return !!terlibat;
  return pic === a;
}

async function genPackageId() {
  let rows = [];
  try { rows = await valuesGet(`${CONFIG.PACKAGE_SHEET}!A2:A`); } catch (e) { rows = []; }
  let maks = 0;
  rows.forEach(r => { const m = /^PKG-(\d+)$/.exec(String((r && r[0]) || '').trim()); if (m) maks = Math.max(maks, Number(m[1])); });
  return 'PKG-' + String(maks + 1).padStart(3, '0');
}
async function nextItemIds(n) {
  let rows = [];
  try { rows = await valuesGet(`${CONFIG.PACKAGE_ITEM_SHEET}!A2:A`); } catch (e) { rows = []; }
  let maks = 0;
  rows.forEach(r => { const m = /^ITM-(\d+)$/.exec(String((r && r[0]) || '').trim()); if (m) maks = Math.max(maks, Number(m[1])); });
  const out = [];
  for (let i = 1; i <= n; i++) out.push('ITM-' + String(maks + i).padStart(4, '0'));
  return out;
}

// Indeks proses + status task, dipakai menentukan setoran mana yang sudah terhitung.
function buildStepIndex(collabs) {
  const idx = { step: {}, collab: {} };
  (collabs || []).forEach(c => {
    idx.collab[c.id] = { id: c.id, title: c.title, status: c.status, done: c.done, total: c.total };
    idx.step[c.id] = {};
    (c.steps || []).forEach(s => { idx.step[c.id][s.order] = { order: s.order, name: s.name, pic: s.pic, done: s.done, doneBy: s.doneBy, collabId: c.id, collabTitle: c.title }; });
  });
  return idx;
}

async function readPackages(stepIndex) {
  let prows = [], vrows = [], irows = [], crows = [];
  try {
    const b = await valuesBatchGet([`${CONFIG.PACKAGE_SHEET}!A2:T`, `${CONFIG.PACKAGE_VARIANT_SHEET}!A2:F`,
      `${CONFIG.PACKAGE_ITEM_SHEET}!A2:J`, `${CONFIG.PACKAGE_CONTRIB_SHEET}!A2:F`]);
    prows = b[`${CONFIG.PACKAGE_SHEET}!A2:T`] || [];
    vrows = b[`${CONFIG.PACKAGE_VARIANT_SHEET}!A2:F`] || [];
    irows = b[`${CONFIG.PACKAGE_ITEM_SHEET}!A2:J`] || [];
    crows = b[`${CONFIG.PACKAGE_CONTRIB_SHEET}!A2:F`] || [];
  } catch (e) {
    /* JANGAN dijadikan "kosong". Sheet-nya sudah dipastikan ada oleh ensurePackageSheets,
       jadi gagal di sini berarti gangguan baca sesaat (kuota Sheets, jaringan) — dan daftar
       kosong TAK BISA dibedakan dari "memang belum ada paket". Dulu justru itu yang membuat
       rancangan yang sudah tertaut terlihat hilang: daftar kosong menimpa data yang baik.
       Dilempar supaya penangan gagal di layar mempertahankan data terakhir yang benar. */
    throw new Error('Gagal membaca data paket: ' + ((e && e.message) || e));
  }
  const idx = stepIndex || { step: {}, collab: {} };
  const out = {};
  prows.forEach((r, i) => { const p = rowToPackage(r, i + 2); if (p.id) out[p.id] = p; });
  vrows.forEach((r, i) => {
    const pid = String((r && r[0]) || '').trim(); if (!pid || !out[pid]) return;
    out[pid].variants.push({
      row: i + 2, order: Number((r && r[1]) || 0),
      masaAktif: String((r && r[2]) || '').trim(),
      hargaAwal: Number((r && r[3]) || 0) || 0,
      hargaDiskon: Number((r && r[4]) || 0) || 0,
      status: String((r && r[5]) || '').trim() || 'aktif',
    });
  });
  const itemById = {};
  irows.forEach((r, i) => {
    const iid = String((r && r[0]) || '').trim();
    const pid = String((r && r[1]) || '').trim();
    if (!iid || !pid || !out[pid]) return;
    const it = {
      row: i + 2, itemId: iid, paketId: pid,
      order: Number((r && r[2]) || 0),
      kategori: String((r && r[3]) || '').trim(),
      grup: String((r && r[4]) || '').trim(),
      nama: String((r && r[5]) || '').trim(),
      target: Number((r && r[6]) || 0) || 0,
      satuan: String((r && r[7]) || '').trim() || 'Paket',
      awal: Number((r && r[8]) || 0) || 0,
      catatan: String((r && r[9]) || '').trim(),
      kontrib: [],
    };
    itemById[iid] = it;
    out[pid].items.push(it);
  });
  crows.forEach((r, i) => {
    const iid = String((r && r[1]) || '').trim();
    const it = itemById[iid]; if (!it) return;
    const cid = String((r && r[2]) || '').trim();
    const so = Number((r && r[3]) || 0) || 0;
    const step = (cid && so) ? ((idx.step[cid] || {})[so] || null) : null;
    const col = cid ? (idx.collab[cid] || null) : null;
    // Setoran tanpa collab = catatan sejarah (tasknya sudah dihapus, kerjanya sudah terjadi).
    // Setoran tanpa nomor proses = dihitung saat TASK-nya Selesai.
    const selesai = !cid ? true : (so ? !!(step && step.done) : !!(col && col.status === 'Selesai'));
    it.kontrib.push({
      row: i + 2, paketId: String((r && r[0]) || '').trim(), itemId: iid,
      collabId: cid, stepOrder: so,
      jumlah: Number((r && r[4]) || 0) || 0,
      catatan: String((r && r[5]) || '').trim(),
      step, collabTitle: col ? col.title : '', selesai,
      // Sumbernya bisa lenyap (collab dihapus / proses diringkas) — ditandai, tak didiamkan.
      hilang: !!(cid && !col) || !!(cid && so && !step),
    });
  });
  Object.values(out).forEach(p => {
    p.variants.sort((a, b) => a.order - b.order);
    p.items.sort((a, b) => a.order - b.order);
    p.filled = packageFilled(p);
    p.items.forEach(it => { Object.assign(it, itemHitung(it)); });
    p.ringkas = itemRingkas(p.items);
    const cid = {};
    p.items.forEach(it => (it.kontrib || []).forEach(k => { if (k.collabId) cid[k.collabId] = 1; }));
    p.collabIds = Object.keys(cid);
  });
  return out;
}

async function getPackages() {
  await ensurePackageSheets();
  const collabs = await loadCollabsRaw();
  return Object.values(await readPackages(buildStepIndex(collabs)))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

async function savePackage(paketId, payload, actor) {
  actor = String(actor || '').trim() || 'Unknown';
  paketId = String(paketId || '').trim();
  await loadUsers();
  await ensurePackageSheets();
  payload = payload || {};
  const collabs = await loadCollabsRaw();
  const semua = await readPackages(buildStepIndex(collabs));
  const baruSekali = !paketId;
  const bos = isManagerActor(actor) || isLeaderActor(actor);
  if (baruSekali) {
    if (!bos) return { success: false, message: 'Hanya Leader atau Manager yang bisa membuat paket baru.' };
    paketId = await genPackageId();
  }
  const lama = semua[paketId] || emptyPackage(paketId);
  if (!baruSekali && !lama.row) return { success: false, message: 'Paket tidak ditemukan: ' + paketId };
  const baru = Object.assign({}, lama);
  const terlibat = (lama.collabIds || []).some(cid => {
    const c = collabs.find(x => x.id === cid);
    return c && (c.steps || []).some(s => canCheckStep(s.pic, actor, false));
  });
  const bolehMarsel = canEditPackageArea(lama, 'marsel', actor, terlibat || baruSekali);
  const bolehProduk = canEditPackageArea(lama, 'produk', actor, terlibat || baruSekali);
  let sentuh = 0;
  if (payload.platform !== undefined) {
    if (!bos) return { success: false, message: 'Platform paket hanya bisa diubah Leader atau Manager.' };
    baru.platform = String(payload.platform || '').trim(); sentuh++;
  }
  if (payload.mirror !== undefined) {
    /* Sengaja BEDA dari mirror task biasa yang tetap PM/Dev saja: paket boleh Leader,
       karena Leader yang menyusun rancangannya. Kalau aturan task ikut diubah, ubah juga
       canMirror() di public/index.html supaya keduanya tak diam-diam berbeda. */
    if (!bos) return { success: false, message: 'Hanya Leader atau Manager yang bisa membagikan paket ke Lintas Divisi.' };
    baru.mirror = !!payload.mirror; sentuh++;
  }
  if (payload.marsel) {
    if (!bolehMarsel) return { success: false, message: 'Hanya PIC Area Marsel, Leader, atau Manager yang bisa mengubah sisi ini.' };
    PKG_MARSEL.forEach(k => { if (payload.marsel[k] !== undefined) baru[k] = String(payload.marsel[k] || '').trim(); });
    if (payload.marsel.marselPic !== undefined && bos) baru.marselPic = String(payload.marsel.marselPic || '').trim();
    sentuh++;
  }
  if (payload.produk) {
    if (!bolehProduk) return { success: false, message: 'Hanya PIC Area Produk, Leader, atau Manager yang bisa mengubah sisi ini.' };
    PKG_PRODUK.forEach(k => { if (payload.produk[k] !== undefined) baru[k] = String(payload.produk[k] || '').trim(); });
    if (payload.produk.produkPic !== undefined && bos) baru.produkPic = String(payload.produk.produkPic || '').trim();
    sentuh++;
  }
  if (payload.variants !== undefined) {
    if (!bolehMarsel) return { success: false, message: 'Varian & harga hanya bisa diubah PIC Area Marsel, Leader, atau Manager.' };
    sentuh++;
  }
  /* RANCANGAN (daftar target) = wewenang Leader & Manager. Leader-lah yang menyusun isi
     paket sehari-hari, jadi menutupnya cuma memaksa mereka menitip ke Manager. */
  if (payload.items !== undefined) {
    if (!bos) return { success: false, message: 'Rancangan paket (daftar target) hanya bisa diubah Leader atau Manager.' };
    sentuh++;
  }
  if (!sentuh) return { success: false, message: 'Tak ada yang diubah.' };
  baru.id = paketId;
  baru.updatedBy = actor; baru.updatedAt = nowStamp();
  const rowData = packageToRow(baru);
  if (lama.row) await valuesUpdate(`${CONFIG.PACKAGE_SHEET}!A${lama.row}:T${lama.row}`, [rowData]);
  else await valuesAppend(`${CONFIG.PACKAGE_SHEET}!A:T`, [rowData]);
  if (payload.variants !== undefined) {
    await purgeRowsForRef(CONFIG.PACKAGE_VARIANT_SHEET, 'F', 0, paketId);
    const list = (payload.variants || []).filter(v => v && String(v.masaAktif || '').trim());
    if (list.length) {
      await valuesAppend(`${CONFIG.PACKAGE_VARIANT_SHEET}!A:F`, list.map((v, i) => [
        paketId, i + 1, String(v.masaAktif || '').trim(),
        Number(v.hargaAwal || 0) || 0, Number(v.hargaDiskon || 0) || 0,
        String(v.status || 'aktif').trim()]));
    }
  }
  if (payload.items !== undefined) {
    const masuk = (payload.items || []).filter(v => v && String(v.nama || '').trim());
    // Item ID yang sudah ada DIPERTAHANKAN — kalau tidak, seluruh setoran yang menunjuknya
    // jadi yatim setiap kali rancangannya disimpan ulang.
    const perluBaru = masuk.filter(v => !/^ITM-\d+$/.test(String(v.itemId || '').trim())).length;
    const idBaru = perluBaru ? await nextItemIds(perluBaru) : [];
    let ptr = 0;
    const rows = masuk.map((v, i) => {
      const iid = /^ITM-\d+$/.test(String(v.itemId || '').trim()) ? String(v.itemId).trim() : idBaru[ptr++];
      return [iid, paketId, i + 1,
        String(v.kategori || '').trim(), String(v.grup || '').trim(), String(v.nama || '').trim(),
        Number(v.target || 0) || 0, String(v.satuan || 'Paket').trim(),
        Number(v.awal || 0) || 0, String(v.catatan || '').trim()];
    });
    await purgeRowsForRef(CONFIG.PACKAGE_ITEM_SHEET, 'J', 1, paketId);
    if (rows.length) await valuesAppend(`${CONFIG.PACKAGE_ITEM_SHEET}!A:J`, rows);
    // Setoran yang targetnya dihapus ikut dibuang — kalau dibiarkan, ia menggantung tanpa
    // induk dan angkanya tak pernah muncul di mana pun lagi.
    const hidup = {}; rows.forEach(r => { hidup[r[0]] = 1; });
    await purgeContribTanpaItem(paketId, hidup);
  }
  await logActivity(actor, 'Package Save', '', `Rancangan paket ${paketId} diperbarui`);
  return { success: true, message: baruSekali ? ('Paket ' + paketId + ' dibuat.') : 'Rancangan paket tersimpan.', paketId, packages: await getPackages(), collabs: await getCollabs() };
}

// Buang baris setoran milik paket ini yang Item ID-nya sudah tak ada.
async function purgeContribTanpaItem(paketId, hidup) {
  let rows = [];
  try { rows = await valuesGet(`${CONFIG.PACKAGE_CONTRIB_SHEET}!A2:F`); } catch (e) { return 0; }
  const hapus = [];
  rows.forEach((r, i) => {
    if (String((r || [])[0] || '').trim() !== paketId) return;
    if (!hidup[String((r || [])[1] || '').trim()]) hapus.push(i + 2);
  });
  if (!hapus.length) return 0;
  const meta = await getSheetMeta();
  const sid = meta[CONFIG.PACKAGE_CONTRIB_SHEET] && meta[CONFIG.PACKAGE_CONTRIB_SHEET].sheetId;
  if (sid == null) return 0;
  await batchUpdate(hapus.sort((a, b) => b - a)
    .map(rn => ({ deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: rn - 1, endIndex: rn } } })));
  return hapus.length;
}

/* Setoran SATU task terhadap satu paket. Sengaja diganti per-task, bukan per-paket:
   kalau seluruh setoran paket ditulis ulang, task lain yang sedang membuka paket yang
   sama akan saling menghapus setoran. */
async function setPackageContrib(paketId, collabId, list, actor) {
  actor = String(actor || '').trim() || 'Unknown';
  paketId = String(paketId || '').trim();
  collabId = String(collabId || '').trim();
  await loadUsers();
  if (!canManageCollabActor(actor)) return { success: false, message: 'Hanya Leader atau Manager yang bisa mengatur setoran task.' };
  if (!paketId || !collabId) return { success: false, message: 'Paket atau task tidak disebut.' };
  await ensurePackageSheets();
  const semua = await readPackages(buildStepIndex(await loadCollabsRaw()));
  const p = semua[paketId];
  if (!p) return { success: false, message: 'Paket tidak ditemukan: ' + paketId };
  const sah = {}; (p.items || []).forEach(it => { sah[it.itemId] = 1; });
  const bersih = (list || []).filter(k => k && sah[String(k.itemId || '').trim()] && (Number(k.jumlah || 0) || 0) > 0);
  // Buang setoran lama milik task ini di paket ini saja.
  let rows = [];
  try { rows = await valuesGet(`${CONFIG.PACKAGE_CONTRIB_SHEET}!A2:F`); } catch (e) { rows = []; }
  const hapus = [];
  rows.forEach((r, i) => {
    if (String((r || [])[0] || '').trim() === paketId && String((r || [])[2] || '').trim() === collabId) hapus.push(i + 2);
  });
  if (hapus.length) {
    const meta = await getSheetMeta();
    const sid = meta[CONFIG.PACKAGE_CONTRIB_SHEET] && meta[CONFIG.PACKAGE_CONTRIB_SHEET].sheetId;
    if (sid != null) await batchUpdate(hapus.sort((a, b) => b - a)
      .map(rn => ({ deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: rn - 1, endIndex: rn } } })));
  }
  if (bersih.length) {
    await valuesAppend(`${CONFIG.PACKAGE_CONTRIB_SHEET}!A:F`, bersih.map(k => [
      paketId, String(k.itemId).trim(), collabId,
      Number(k.stepOrder || 0) || 0, Number(k.jumlah || 0) || 0,
      String(k.catatan || '').trim()]));
  }
  await logActivity(actor, 'Package Contrib', collabId, `${collabId} menyetor ${bersih.length} target di ${paketId}`);
  return { success: true, message: 'Setoran task tersimpan.', packages: await getPackages(), collabs: await getCollabs() };
}

/* Hapus BANYAK paket sekaligus. Bukan sekadar kenyamanan: deletePackage memuat ulang
   seluruh paket + collab tiap kali dipanggil, jadi menghapus 20 paket satu per satu
   menembus kuota "read requests per minute" Google dan berhenti di tengah jalan.
   Di sini pembacaan ulangnya dilakukan SEKALI, di akhir. */
async function deletePackages(ids, actor) {
  actor = String(actor || '').trim() || 'Unknown';
  await loadUsers();
  if (!isManagerActor(actor) && !isLeaderActor(actor)) return { success: false, message: 'Hanya Leader atau Manager yang bisa menghapus paket.' };
  const daftar = [...new Set((ids || []).map(x => String(x || '').trim()).filter(Boolean))];
  if (!daftar.length) return { success: false, message: 'Tak ada paket yang dipilih.' };
  await ensurePackageSheets();
  let ikut = 0;
  for (const paketId of daftar) {
    ikut += await purgeRowsForRef(CONFIG.PACKAGE_VARIANT_SHEET, 'F', 0, paketId);
    ikut += await purgeRowsForRef(CONFIG.PACKAGE_ITEM_SHEET, 'J', 1, paketId);
    ikut += await purgeRowsForRef(CONFIG.PACKAGE_CONTRIB_SHEET, 'F', 0, paketId);
    await purgeRowsForRef(CONFIG.PACKAGE_SHEET, 'T', 0, paketId);
  }
  // Tautan di COLLAB dibereskan sekali jalan untuk seluruh daftar.
  const pilih = new Set(daftar);
  const crows = await valuesGet(`${CONFIG.COLLAB_SHEET}!A2:J`);
  for (let i = 0; i < crows.length; i++) {
    if (pilih.has(String((crows[i] || [])[9] || '').trim())) await valuesUpdate(`${CONFIG.COLLAB_SHEET}!J${i + 2}`, [['']]);
  }
  await logActivity(actor, 'Package Delete', '', `${daftar.length} paket dihapus (${ikut} varian/target/setoran ikut dibuang): ${daftar.join(', ')}`);
  return { success: true, message: daftar.length + ' paket dihapus.', packages: await getPackages(), collabs: await getCollabs() };
}

async function deletePackage(paketId, actor) {
  actor = String(actor || '').trim() || 'Unknown';
  paketId = String(paketId || '').trim();
  await loadUsers();
  if (!isManagerActor(actor) && !isLeaderActor(actor)) return { success: false, message: 'Hanya Leader atau Manager yang bisa menghapus paket.' };
  await ensurePackageSheets();
  let ikut = 0;
  ikut += await purgeRowsForRef(CONFIG.PACKAGE_VARIANT_SHEET, 'F', 0, paketId);
  ikut += await purgeRowsForRef(CONFIG.PACKAGE_ITEM_SHEET, 'J', 1, paketId);
  ikut += await purgeRowsForRef(CONFIG.PACKAGE_CONTRIB_SHEET, 'F', 0, paketId);
  // Nomor paket dipakai ulang (max+1) — baris menggantung akan diwarisi paket berikutnya.
  await purgeRowsForRef(CONFIG.PACKAGE_SHEET, 'T', 0, paketId);
  const crows = await valuesGet(`${CONFIG.COLLAB_SHEET}!A2:J`);
  for (let i = 0; i < crows.length; i++) {
    if (String((crows[i] || [])[9] || '').trim() === paketId) await valuesUpdate(`${CONFIG.COLLAB_SHEET}!J${i + 2}`, [['']]);
  }
  await logActivity(actor, 'Package Delete', '', `Paket ${paketId} dihapus (${ikut} varian/target/setoran ikut dibuang)`);
  return { success: true, message: 'Paket dihapus.', packages: await getPackages(), collabs: await getCollabs() };
}

async function setCollabPackage(collabId, paketId, actor) {
  actor = String(actor || '').trim() || 'Unknown';
  collabId = String(collabId || '').trim();
  paketId = String(paketId || '').trim();
  await loadUsers();
  if (!canManageCollabActor(actor)) return { success: false, message: 'Hanya Leader atau Manager yang bisa menautkan task ke paket.' };
  await ensureCollabSheets();
  await ensurePackageSheets();
  if (paketId) {
    const ada = await valuesGet(`${CONFIG.PACKAGE_SHEET}!A2:A`);
    if (!ada.some(r => String((r && r[0]) || '').trim() === paketId)) return { success: false, message: 'Paket tidak ditemukan: ' + paketId };
  }
  const crows = await valuesGet(`${CONFIG.COLLAB_SHEET}!A2:A`);
  const i = crows.findIndex(r => String((r && r[0]) || '').trim() === collabId);
  if (i < 0) return { success: false, message: 'Task kolaborasi tidak ditemukan.' };
  await valuesUpdate(`${CONFIG.COLLAB_SHEET}!J${i + 2}`, [[paketId]]);
  await logActivity(actor, 'Collab Link', collabId, paketId ? `${collabId} ditautkan ke ${paketId}` : `${collabId} dilepas dari paketnya`);
  return { success: true, message: paketId ? 'Task ditautkan ke ' + paketId + '.' : 'Tautan paket dilepas.', collabs: await getCollabs(), packages: await getPackages() };
}


// Hapus semua baris step milik satu collab (descending agar index tak bergeser).
async function deleteStepRowsForCollab(collabId) {
  let srows = [];
  try { srows = await valuesGet(`${CONFIG.COLLAB_STEP_SHEET}!A2:A`); } catch (e) { return; }
  const rowsToDelete = [];
  srows.forEach((r, i) => { if (String((r && r[0]) || '').trim() === collabId) rowsToDelete.push(i + 2); });
  if (!rowsToDelete.length) return;
  const meta = await getSheetMeta();
  const sid = meta[CONFIG.COLLAB_STEP_SHEET] && meta[CONFIG.COLLAB_STEP_SHEET].sheetId;
  if (sid == null) return;
  const reqs = rowsToDelete.sort((a, b) => b - a)
    .map(rn => ({ deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: rn - 1, endIndex: rn } } }));
  await batchUpdate(reqs);
}

// Sub-ceklis proses dikunci ke id "COL-xxx#<urutan>", sedangkan urutan dihitung ulang tiap
// kali disimpan. Jadi saat proses disusun ulang, kunci itu WAJIB ikut dipetakan — kalau tidak,
// sub-ceklis tertinggal di nomor lama dan menempel ke proses yang salah.
// Proses yang dihapus: sub-ceklisnya ikut dibuang, supaya tidak diwarisi proses baru yang
// kebetulan menempati nomor itu.
/* Buang semua baris yang merujuk sebuah entitas — task ("TSK-055") maupun collab
   ("COL-016", termasuk kunci prosesnya "COL-016#2").
   Dipakai saat collab dihapus: komentar, notifikasi, dan riwayat aktivitasnya ikut hilang.
   Tanpa ini, nomor collab yang dipakai ulang (genCollabId = max+1) membuat collab BARU
   mewarisi percakapan milik collab yang sudah dihapus. */
async function purgeRowsForRef(sheetName, colLetter, colIdx, collabId) {
  let rows = [];
  try { rows = await valuesGet(`${sheetName}!A2:${colLetter}`); } catch (e) { return 0; }
  const kena = v => { const s = String(v || '').trim(); return s === collabId || s.indexOf(collabId + '#') === 0; };
  const hapus = [];
  rows.forEach((r, i) => { if (kena((r || [])[colIdx])) hapus.push(i + 2); });
  if (!hapus.length) return 0;
  const meta = await getSheetMeta();
  const sid = meta[sheetName] && meta[sheetName].sheetId;
  if (sid == null) return 0;
  await batchUpdate(hapus.sort((a, b) => b - a)
    .map(rn => ({ deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: rn - 1, endIndex: rn } } })));
  return hapus.length;
}

async function remapCollabChecklists(collabId, orderMap) {
  let rows = [];
  try { rows = await valuesGet(`${CONFIG.CHECKLIST_SHEET}!A2:A`); } catch (e) { return; }
  const re = new RegExp('^' + collabId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '#(\\d+)$');
  const updates = [], deletes = [];
  rows.forEach((r, i) => {
    const m = re.exec(String((r && r[0]) || '').trim());
    if (!m) return;
    const rn = i + 2, lama = Number(m[1]), baru = orderMap[lama];
    if (!baru) { deletes.push(rn); return; }
    if (baru !== lama) updates.push({ range: `${CONFIG.CHECKLIST_SHEET}!A${rn}`, values: [[`${collabId}#${baru}`]] });
  });
  // Semua nilai baru dihitung dari nilai LAMA sebelum satu pun ditulis, jadi pertukaran
  // urutan (mis. 2 <-> 3) tidak saling menimpa.
  if (updates.length) {
    const sheets = await getSheets();
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: getSpreadsheetId(),
      requestBody: { valueInputOption: 'RAW', data: updates },
    });
  }
  if (deletes.length) {
    const meta = await getSheetMeta();
    const sid = meta[CONFIG.CHECKLIST_SHEET] && meta[CONFIG.CHECKLIST_SHEET].sheetId;
    if (sid != null) {
      await batchUpdate(deletes.sort((a, b) => b - a)
        .map(rn => ({ deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: rn - 1, endIndex: rn } } })));
    }
  }
}

async function saveCollab(payload, actor) {
  actor = String(actor || '').trim() || 'Unknown';
  await loadUsers();
  if (!canManageCollabActor(actor)) return { success: false, message: 'Anda tak berhak membuat/mengubah task kolaborasi.' };
  const platform = String((payload && payload.platform) || '').trim();
  const title = String((payload && payload.title) || '').trim();
  const description = String((payload && payload.description) || '').trim();
  const deadline = String((payload && payload.deadline) || '').trim();   // deadline project keseluruhan
  const type = String((payload && payload.type) || '').trim();           // tipe task (Kanban per-tipe)
  const color = String((payload && payload.color) || '').trim();         // warna kartu (grid & kanban)
  const steps = Array.isArray(payload && payload.steps) ? payload.steps : [];
  if (!title) return { success: false, message: 'Judul task kolaborasi wajib diisi.' };
  // srcOrder = urutan asli proses saat form dibuka; dipakai agar status done/catatan
  // tetap ikut prosesnya saat urutan diubah (bukan mengikuti posisi). 0 = proses baru.
  const clean = steps.map(s => ({ name: String((s && s.name) || '').trim(), pic: String((s && s.pic) || '').trim(), deadline: String((s && s.deadline) || '').trim(), stage: String((s && s.stage) || '').trim(), link: (s && s.link !== undefined) ? String(s.link).trim() : undefined, srcOrder: Number((s && s.srcOrder) || 0) }))
    .filter(s => s.name);
  if (!clean.length) return { success: false, message: 'Minimal 1 proses (nama proses wajib diisi).' };

  await ensureCollabSheets();
  let crows = [];
  try { crows = await valuesGet(`${CONFIG.COLLAB_SHEET}!A2:I`); } catch (e) { crows = []; }
  const ids = crows.map(r => String((r && r[0]) || '').trim());
  let id = String((payload && payload.id) || '').trim();
  const isUpdate = id && ids.includes(id);

  // Pertahankan status "done" & catatan proses lama saat manager mengedit struktur.
  let prevStep = {};
  if (isUpdate) {
    const existing = (await getCollabs()).find(c => c.id === id);
    if (existing) existing.steps.forEach(s => { prevStep[s.order] = { done: s.done, doneBy: s.doneBy, doneAt: s.doneAt, note: s.note, link: s.link }; });
  }

  const dl = deadline ? toSheetDate(deadline) : '';
  if (isUpdate) {
    const rn = ids.indexOf(id) + 2;
    const keepBy = String((crows[rn - 2] && crows[rn - 2][4]) || actor);
    const keepAt = String((crows[rn - 2] && crows[rn - 2][5]) || nowStamp());
    // Sengaja berhenti di kolom I: kolom J (Paket ID) diurus setCollabPackage,
    // dan menulisnya di sini akan menghapus tautan paket tiap kali task disimpan.
    await valuesUpdate(`${CONFIG.COLLAB_SHEET}!A${rn}:I${rn}`, [[id, platform, title, description, keepBy, keepAt, dl, type, color]]);
    await deleteStepRowsForCollab(id);
  } else {
    id = genCollabId(ids);
    await valuesAppend(`${CONFIG.COLLAB_SHEET}!A:I`, [[id, platform, title, description, actor, nowStamp(), dl, type, color]]);
  }

  const stepRows = clean.map((s, i) => {
    const order = i + 1;
    const pd = prevStep[s.srcOrder] || {};   // bawa done/catatan dari proses asalnya (tahan reorder)
    return [id, order, s.name, s.pic, s.deadline ? toSheetDate(s.deadline) : '', pd.done ? 'TRUE' : 'FALSE', pd.doneBy || '', pd.doneAt || '', pd.note || '', String((s && s.stage) || '').trim(), (s && s.link !== undefined ? String(s.link).trim() : (pd.link || ''))];
  });
  if (stepRows.length) await valuesAppend(`${CONFIG.COLLAB_STEP_SHEET}!A:K`, stepRows);

  // Sub-ceklis harus ikut berpindah bersama prosesnya (lihat remapCollabChecklists).
  if (isUpdate) {
    const orderMap = {};
    clean.forEach((s, i) => { if (s.srcOrder > 0) orderMap[s.srcOrder] = i + 1; });
    await remapCollabChecklists(id, orderMap);
  }

  await logActivity(actor, isUpdate ? 'Collab Update' : 'Collab Create', id, `${title} • ${clean.length} proses`);
  return { success: true, message: isUpdate ? 'Task kolaborasi diperbarui.' : 'Task kolaborasi dibuat.', collabs: await getCollabs() };
}

// PIC proses (atau manager/Dev) mengisi catatan proses — mis. minta tambahan deadline.
/* Lampiran hasil pada satu PROSES — OPSIONAL, dan izinnya sengaja sama dengan catatan
   proses: PIC proses itu sendiri (atau manager). Menyusun ulang/mengganti nama proses tetap
   khusus Manager/Leader, tapi ORANG YANG MENGERJAKAN harus bisa menautkan hasilnya sendiri
   tanpa menunggu manager membuka mode Edit. */
async function setCollabStepLink(collabId, order, link, actor) {
  collabId = String(collabId || '').trim();
  order = Number(order);
  actor = String(actor || '').trim() || 'Unknown';
  link = String(link || '').trim();
  if (link.length > 500) return { success: false, message: 'Link terlalu panjang (maks 500 karakter).' };
  await ensureCollabSheets();
  let srows = [];
  try { srows = await valuesGet(`${CONFIG.COLLAB_STEP_SHEET}!A2:K`); } catch (e) { srows = []; }
  let idx = -1;
  for (let i = 0; i < srows.length; i++) {
    const r = srows[i];
    if (String((r && r[0]) || '').trim() === collabId && Number((r && r[1]) || 0) === order) { idx = i; break; }
  }
  if (idx < 0) return { success: false, message: 'Proses tidak ditemukan. Muat ulang.' };
  const pic = String((srows[idx] && srows[idx][3]) || '').trim();
  await loadUsers();
  if (!isManagerActor(actor) && !canCheckStep(pic, actor)) {
    return { success: false, message: `Hanya ${pic || 'PIC proses ini'} atau manager yang bisa mengisi link hasil.` };
  }
  await valuesUpdate(`${CONFIG.COLLAB_STEP_SHEET}!K${idx + 2}`, [[link]]);
  await logActivity(actor, 'Collab Step Link', collabId, `Proses ${order}: ` + (link ? 'link hasil diperbarui' : 'link hasil dihapus'));
  return { success: true, message: link ? 'Link hasil disimpan.' : 'Link hasil dihapus.', collabs: await getCollabs() };
}

async function setCollabStepNote(collabId, order, note, actor) {
  collabId = String(collabId || '').trim();
  order = Number(order);
  actor = String(actor || '').trim() || 'Unknown';
  await ensureCollabSheets();
  let srows = [];
  try { srows = await valuesGet(`${CONFIG.COLLAB_STEP_SHEET}!A2:K`); } catch (e) { srows = []; }
  let idx = -1;
  for (let i = 0; i < srows.length; i++) {
    const r = srows[i];
    if (String((r && r[0]) || '').trim() === collabId && Number((r && r[1]) || 0) === order) { idx = i; break; }
  }
  if (idx < 0) return { success: false, message: 'Proses tidak ditemukan. Muat ulang.' };
  const pic = String((srows[idx] && srows[idx][3]) || '').trim();
  await loadUsers();
  if (!isManagerActor(actor) && !canCheckStep(pic, actor)) {
    return { success: false, message: `Hanya ${pic || 'PIC proses ini'} atau manager yang bisa mengisi catatan.` };
  }
  await valuesUpdate(`${CONFIG.COLLAB_STEP_SHEET}!I${idx + 2}`, [[String(note || '').trim()]]);
  await logActivity(actor, 'Collab Step Note', collabId, `Proses ${order}: catatan diperbarui`);
  return { success: true, message: 'Catatan proses disimpan.', collabs: await getCollabs() };
}

// Ubah tipe task (dipakai drag antar kolom Kanban per-tipe). Manager/Dev saja.
async function setCollabType(collabId, type, actor) {
  actor = String(actor || '').trim() || 'Unknown';
  await loadUsers();
  if (!canManageCollabActor(actor)) return { success: false, message: 'Anda tak berhak mengubah tipe task.' };
  collabId = String(collabId || '').trim();
  await ensureCollabSheets();
  let crows = [];
  try { crows = await valuesGet(`${CONFIG.COLLAB_SHEET}!A2:H`); } catch (e) { crows = []; }
  const ci = crows.findIndex(r => String((r && r[0]) || '').trim() === collabId);
  if (ci < 0) return { success: false, message: 'Task kolaborasi tidak ditemukan.' };
  await valuesUpdate(`${CONFIG.COLLAB_SHEET}!H${ci + 2}`, [[String(type || '').trim()]]);
  await logActivity(actor, 'Collab Type', collabId, `Tipe → ${type || '(kosong)'}`);
  return { success: true, message: 'Tipe task diperbarui.', collabs: await getCollabs() };
}

async function setCollabStepDone(collabId, order, done, actor) {
  collabId = String(collabId || '').trim();
  order = Number(order);
  actor = String(actor || '').trim() || 'Unknown';
  const val = !!done;
  await ensureCollabSheets();
  let srows = [];
  try { srows = await valuesGet(`${CONFIG.COLLAB_STEP_SHEET}!A2:H`); } catch (e) { srows = []; }
  let idx = -1;
  for (let i = 0; i < srows.length; i++) {
    const r = srows[i];
    if (String((r && r[0]) || '').trim() === collabId && Number((r && r[1]) || 0) === order) { idx = i; break; }
  }
  if (idx < 0) return { success: false, message: 'Proses tidak ditemukan. Muat ulang.' };
  const r = srows[idx];
  const pic = String((r && r[3]) || '').trim();
  if (!canCheckStep(pic, actor, !val)) {
    return { success: false, message: val
      ? `Hanya ${pic || 'PIC proses ini'} yang bisa mencentang proses ini.`
      : `Hanya ${pic || 'PIC proses ini'} atau Manager yang bisa membatalkan centang ini.` };
  }
  // Main-ceklis proses tak boleh dicentang selama sub-ceklisnya belum tuntas (membatalkan centang selalu boleh).
  if (val) {
    const sub = await getChecklist(`${collabId}#${order}`);
    const undone = sub.filter(i => !i.done).length;
    if (sub.length && undone > 0) {
      return { success: false, message: `Selesaikan dulu semua sub-ceklis proses ini (${sub.length - undone}/${sub.length}).` };
    }
  }
  const rn = idx + 2;
  await valuesUpdate(`${CONFIG.COLLAB_STEP_SHEET}!F${rn}:H${rn}`, [[val ? 'TRUE' : 'FALSE', val ? actor : '', val ? nowStamp() : '']]);
  await logActivity(actor, val ? 'Collab Step Done' : 'Collab Step Undone', collabId, `Proses ${order}: ${String((r && r[2]) || '')}`);
  return { success: true, message: val ? 'Proses dicentang.' : 'Centang dibatalkan.', collabs: await getCollabs() };
}

async function deleteCollab(id, actor) {
  actor = String(actor || '').trim() || 'Unknown';
  await loadUsers();
  if (!canManageCollabActor(actor)) return { success: false, message: 'Anda tak berhak menghapus task kolaborasi.' };
  id = String(id || '').trim();
  await ensureCollabSheets();
  // Rekam dulu proses mana yang SUDAH selesai, sebelum barisnya dibuang. Dipakai di bawah
  // untuk mengawetkan status deliverable yang dihasilkannya.
  let stepSelesai = {}, colSelesai = false;
  try {
    const sr = await valuesGet(`${CONFIG.COLLAB_STEP_SHEET}!A2:F`);
    let n = 0, d = 0;
    sr.forEach(r => {
      if (String((r || [])[0] || '').trim() !== id) return;
      const ok = isChecked((r || [])[5]);
      stepSelesai[Number((r || [])[1] || 0)] = ok;
      n++; if (ok) d++;
    });
    // Setoran tanpa nomor proses dihitung saat TASK-nya Selesai, jadi keadaan itu ikut direkam.
    colSelesai = n > 0 && d >= n;
  } catch (e) { stepSelesai = {}; colSelesai = false; }
  await deleteStepRowsForCollab(id);
  // Sub-ceklisnya ikut dibuang. Nomor collab dipakai ulang (genCollabId = max+1), jadi bila
  // dibiarkan menggantung, collab BARU akan mewarisi sub-ceklis milik collab yang dihapus.
  await remapCollabChecklists(id, {});
  let crows = [];
  try { crows = await valuesGet(`${CONFIG.COLLAB_SHEET}!A2:F`); } catch (e) { crows = []; }
  const ci = crows.findIndex(r => String((r && r[0]) || '').trim() === id);
  if (ci >= 0) {
    const meta = await getSheetMeta();
    const sid = meta[CONFIG.COLLAB_SHEET] && meta[CONFIG.COLLAB_SHEET].sheetId;
    if (sid != null) await batchUpdate([{ deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: (ci + 2) - 1, endIndex: (ci + 2) } } }]);
  }
  // Komentar, notifikasi, dan riwayat aktivitasnya ikut dibuang — kalau tidak, collab baru
  // yang memakai ulang nomor itu akan menampilkan percakapan milik collab yang sudah dihapus.
  let ikut = 0;
  ikut += await purgeRowsForRef(CONFIG.COMMENTS_SHEET, 'D', 1, id);   // B = Task ID
  ikut += await purgeRowsForRef(CONFIG.NOTIF_SHEET, 'H', 3, id);      // D = Ref ID
  ikut += await purgeRowsForRef(CONFIG.ACTIVITY_SHEET, 'E', 3, id);   // D = Task ID
  // Master paket & variannya ikut dibuang. Tanpa ini, collab BARU yang memakai ulang
  // nomor itu (genCollabId = max+1) akan mewarisi harga & isi paket milik yang dihapus.
  // Paketnya TIDAK ikut dihapus — ia hidup lebih lama daripada task yang menggarapnya,
  // dan satu paket digarap banyak task. Yang dibereskan cuma jejak task ini di deliverable:
  // tautannya dilepas, TAPI status hasilnya diawetkan. Deliverable yang prosesnya sudah
  // selesai tetap "siap" — pekerjaannya memang terjadi; yang hilang cuma catatan tasknya.
  // Setoran task ini terhadap rancangan paket. Yang prosesnya SUDAH selesai diawetkan
  // sebagai catatan sejarah (Collab ID dikosongkan, tetap terhitung) — pekerjaannya memang
  // terjadi. Yang belum selesai dibuang: tak ada yang dihasilkan, jadi tak boleh menghantui
  // angka "menunggu" selamanya.
  let awet = 0, buang = [];
  try {
    const km = await valuesGet(`${CONFIG.PACKAGE_CONTRIB_SHEET}!A2:F`);
    for (let i = 0; i < km.length; i++) {
      if (String((km[i] || [])[2] || '').trim() !== id) continue;
      const so = Number((km[i] || [])[3] || 0) || 0;
      const jadi = so ? !!stepSelesai[so] : (colSelesai === true);
      if (jadi) { await valuesUpdate(`${CONFIG.PACKAGE_CONTRIB_SHEET}!C${i + 2}:D${i + 2}`, [['', 0]]); awet++; }
      else buang.push(i + 2);
    }
    if (buang.length) {
      const meta = await getSheetMeta();
      const sid = meta[CONFIG.PACKAGE_CONTRIB_SHEET] && meta[CONFIG.PACKAGE_CONTRIB_SHEET].sheetId;
      if (sid != null) await batchUpdate(buang.sort((a, b) => b - a)
        .map(rn => ({ deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: rn - 1, endIndex: rn } } })));
    }
  } catch (e) { awet = 0; }
  ikut += awet + buang.length;
  // Jejak penghapusan dicatat TANPA taskId, supaya tidak nyangkut di feed collab bernomor sama.
  await logActivity(actor, 'Collab Delete', '', `${id} dihapus (${ikut} komentar/notifikasi/aktivitas ikut dibuang)`);
  return { success: true, message: 'Task kolaborasi dihapus.', collabs: await getCollabs() };
}

/* ------------------------------------------------------------------ */
/* USERS (daftar anggota tim & perannya) — hanya Dev yang boleh kelola */
/* ------------------------------------------------------------------ */

async function ensureUsersSheet() {
  await ensureSheetExists(CONFIG.USERS_SHEET);
  const head = await valuesGet(`${CONFIG.USERS_SHEET}!A1:C1`);
  if (!head.length || !head[0] || !head[0][0]) {
    await valuesUpdate(`${CONFIG.USERS_SHEET}!A1:C1`, [['Nama', 'Peran', 'Aktif']]);
  }
}

async function getUsers() {
  await loadUsers();
  return _users.map(u => ({ row: u.row, name: u.name, role: u.role, active: u.active }));
}

function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  const hit = ROLES.find(x => x.toLowerCase() === r);
  return hit || '';
}

// Tambah user baru / ubah peran & status aktifnya. Nama sekaligus didaftarkan ke
// dropdown PIC & Support agar langsung bisa diberi task.
async function saveUser(name, role, active, actor) {
  actor = String(actor || '').trim() || 'Unknown';
  name = String(name || '').trim();
  if (!canManageUsers(actor)) return { success: false, message: usersDeniedMessage() };
  if (!name) return { success: false, message: 'Nama user tidak boleh kosong.' };
  if (name.length > 40) return { success: false, message: 'Nama user terlalu panjang (maks 40 karakter).' };
  if (baseName(name) === 'dev') return { success: false, message: '"Dev" adalah nama khusus mode Dev dan tidak bisa dipakai sebagai user.' };

  const wanted = normalizeRole(role);
  if (!wanted) return { success: false, message: 'Peran tidak valid. Pilih: ' + ROLES.join(', ') + '.' };

  await ensureUsersSheet();
  invalidateUsers();
  await loadUsers();
  const isActive = (active === undefined || active === null) ? true : !!active;
  const found = _users.find(u => baseName(u.name) === baseName(name));

  if (found) await valuesUpdate(`${CONFIG.USERS_SHEET}!A${found.row}:C${found.row}`, [[name, wanted, isActive ? 'TRUE' : 'FALSE']]);
  else await valuesAppend(`${CONFIG.USERS_SHEET}!A:C`, [[name, wanted, isActive ? 'TRUE' : 'FALSE']]);
  invalidateUsers();

  // Daftarkan ke dropdown PIC & Support (abaikan untuk peran Lihat Saja).
  let options = null;
  if (wanted.toLowerCase() !== 'lihat saja') {
    try { await saveOption('pic', name, ''); const r = await saveOption('support', name, ''); options = r.options; }
    catch (e) { /* opsi tak wajib */ }
  }
  await logActivity(actor, found ? 'User Update' : 'User Add', '', `${name} → ${wanted}${isActive ? '' : ' (nonaktif)'}`);
  return {
    success: true,
    message: found ? `Peran ${name} diperbarui jadi ${wanted}.` : `${name} ditambahkan sebagai ${wanted}.`,
    users: await getUsers(),
    options: options || await getOptions(),
  };
}

// Peran "karyawan tetap" — sengaja tidak bisa dihapus. Nama mereka melekat di task lama,
// jadi mencabutnya dari dropdown PIC akan meninggalkan task yang PIC-nya tak bisa dipilih
// lagi. Untuk yang keluar, pakai Nonaktif: haknya dicabut, riwayatnya utuh.
const PERMANENT_ROLES = ['Manager', 'Leader', 'Staff'];
function isPermanentRole(role) {
  const r = String(role || '').trim().toLowerCase();
  return PERMANENT_ROLES.some(x => x.toLowerCase() === r);
}

/* Ganti nama user (mis. salah ketik). Nama dipakai sebagai KUNCI di banyak tempat, jadi
   mengganti baris USERS saja akan membuat task, proses kolaborasi, link, dan catatan orang
   itu jadi yatim — pemiliknya tak lagi cocok dengan siapa pun. Karena itu semua rujukan
   ikut diperbarui dalam satu operasi, dan jumlah yang tersentuh dilaporkan balik. */
async function renameUser(oldName, newName, actor) {
  actor = String(actor || '').trim() || 'Unknown';
  oldName = String(oldName || '').trim();
  newName = String(newName || '').trim();
  if (!canManageUsers(actor)) return { success: false, message: usersDeniedMessage() };
  if (!oldName || !newName) return { success: false, message: 'Nama lama & baru wajib diisi.' };
  if (newName.length > 40) return { success: false, message: 'Nama baru terlalu panjang (maks 40 karakter).' };
  if (baseName(oldName) === 'dev' || baseName(newName) === 'dev') {
    return { success: false, message: '"Dev" adalah nama khusus mode Dev dan tidak bisa dipakai.' };
  }
  if (baseName(oldName) === baseName(newName) && oldName === newName) {
    return { success: false, message: 'Nama barunya sama dengan yang lama.' };
  }

  invalidateUsers();
  await loadUsers();
  const found = _users.find(u => baseName(u.name) === baseName(oldName));
  if (!found) return { success: false, message: `User "${oldName}" tidak ditemukan.` };
  // Hanya tolak bila BENAR-BENAR orang lain (bukan sekadar beda kapital dari dirinya sendiri).
  const bentrok = _users.find(u => baseName(u.name) === baseName(newName) && baseName(u.name) !== baseName(oldName));
  if (bentrok) return { success: false, message: `Sudah ada user bernama "${bentrok.name}".` };

  const cocok = v => baseName(v) === baseName(oldName);
  let tersentuh = 0;

  await valuesUpdate(`${CONFIG.USERS_SHEET}!A${found.row}`, [[newName]]);
  invalidateUsers();

  // Task: kolom PIC dan Support (Support berisi daftar dipisah koma).
  try {
    const rows = await valuesGet(MAIN_DATA_RANGE());
    const data = [];
    rows.forEach((r, i) => {
      const rn = CONFIG.FIRST_DATA_ROW + i;
      if (cocok((r || [])[8])) { data.push({ range: `${CONFIG.TASK_SHEET}!${COL.pic}${rn}`, values: [[newName]] }); tersentuh++; }
      const sup = String((r || [])[9] || '');
      if (sup && sup.split(',').some(cocok)) {
        const baru = sup.split(',').map(s => (cocok(s) ? newName : s.trim())).filter(Boolean).join(', ');
        data.push({ range: `${CONFIG.TASK_SHEET}!${COL.support}${rn}`, values: [[baru]] });
        tersentuh++;
      }
    });
    if (data.length) {
      const sheets = await getSheets();
      await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: getSpreadsheetId(), requestBody: { valueInputOption: 'RAW', data } });
    }
  } catch (e) { /* jangan gagalkan penggantian nama karena satu sheet tak terbaca */ }

  // Sheet lain yang memakai nama sebagai kunci: PIC proses kolaborasi, link, catatan, PIN.
  const kolomNama = [
    [CONFIG.COLLAB_STEP_SHEET, 'D', 3],   // PIC proses
    [CONFIG.LINKS_SHEET, 'A', 0],
    [CONFIG.NOTES_SHEET, 'A', 0],
    [CONFIG.AUTH_SHEET, 'A', 0],
    [CONFIG.NOTIF_SHEET, 'B', 1],         // penerima notifikasi
  ];
  for (const [sheetName, kolom, idx] of kolomNama) {
    try {
      const rows = await valuesGet(`${sheetName}!A2:${kolom > 'A' ? kolom : 'A'}`);
      const data = [];
      rows.forEach((r, i) => { if (cocok((r || [])[idx])) data.push({ range: `${sheetName}!${kolom}${i + 2}`, values: [[newName]] }); });
      if (data.length) {
        const sheets = await getSheets();
        await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: getSpreadsheetId(), requestBody: { valueInputOption: 'RAW', data } });
        tersentuh += data.length;
      }
    } catch (e) { /* sheet opsional */ }
  }

  // Dropdown PIC & Support ikut diganti supaya nama lama tak bisa dipilih lagi.
  let options = null;
  try {
    await deleteOption('pic', oldName, '');
    await deleteOption('support', oldName, '');
    await saveOption('pic', newName, '');
    options = (await saveOption('support', newName, '')).options;
  } catch (e) { /* opsi tak wajib */ }

  await logActivity(actor, 'User Rename', '', `${oldName} → ${newName} (${tersentuh} rujukan ikut diperbarui)`);
  return {
    success: true,
    message: `"${oldName}" diganti jadi "${newName}". ${tersentuh} rujukan ikut diperbarui.`,
    renamed: tersentuh,
    users: await getUsers(),
    options: options || await getOptions(),
  };
}

async function deleteUser(name, actor) {
  actor = String(actor || '').trim() || 'Unknown';
  name = String(name || '').trim();
  if (!canManageUsers(actor)) return { success: false, message: usersDeniedMessage() };
  if (!name) return { success: false, message: 'Nama user tidak boleh kosong.' };
  if (baseName(name) === 'dev') return { success: false, message: '"Dev" adalah mode khusus dan tidak bisa dihapus.' };
  if (baseName(name) === baseName(actor)) return { success: false, message: 'Tidak bisa menghapus diri sendiri.' };

  invalidateUsers();
  await loadUsers();
  const found = _users.find(u => baseName(u.name) === baseName(name));
  // Karyawan tetap yang masih aktif dikunci; nonaktifkan dulu. Pengaman dua langkah ini
  // mencegah penghapusan tak sengaja tapi tetap memberi jalan untuk akun duplikat.
  if (found && isPermanentRole(found.role) && found.active !== false) {
    return { success: false, message: `${name} berperan ${found.role} dan masih aktif. Nonaktifkan dulu lewat tombol Aktif/Nonaktif, baru bisa dihapus.` };
  }

  // Nama bisa saja cuma nyangkut di dropdown tanpa baris USERS; itu tetap sah dihapus.
  let inOptions = false;
  try {
    const raw = await readOptionsRaw();
    inOptions = raw.some(o => o.active && (o.type === 'pic' || o.type === 'support') && baseName(o.value) === baseName(name));
  } catch (e) { /* opsi tak terbaca: jangan halangi penghapusan baris USERS */ }
  if (!found && !inOptions) return { success: false, message: 'User tidak ditemukan.' };

  if (found) {
    const meta = await getSheetMeta();
    const sheetId = meta[CONFIG.USERS_SHEET] && meta[CONFIG.USERS_SHEET].sheetId;
    if (sheetId == null) return { success: false, message: 'Sheet USERS tidak ditemukan.' };
    await batchUpdate([{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: found.row - 1, endIndex: found.row } } }]);
    invalidateUsers();
  }

  // Cabut juga dari dropdown PIC & Support supaya benar-benar tak bisa dipilih lagi.
  let options = null;
  try { await deleteOption('pic', name, ''); options = (await deleteOption('support', name, '')).options; }
  catch (e) { /* dropdown gagal dicabut bukan alasan membatalkan penghapusan */ }

  await logActivity(actor, 'User Delete', '', name);
  try { await deleteUserPin(name); } catch (e) { /* PIN menggantung tak masalah */ }
  return {
    success: true,
    message: `${name} dihapus dari daftar user dan dropdown PIC & Support.`,
    users: await getUsers(),
    options: options || await getOptions(),
  };
}

/* ------------------------------------------------------------------ */
/* NOTIFIKASI (tag @user di komentar -> lonceng in-app)               */
/* ------------------------------------------------------------------ */

async function ensureNotificationsSheet() {
  if (_ensured.has('notif')) return;
  await ensureSheetExists(CONFIG.NOTIF_SHEET);
  const head = await valuesGet(`${CONFIG.NOTIF_SHEET}!A1:H1`);
  if (!head.length || !head[0] || !head[0][0]) {
    await valuesUpdate(`${CONFIG.NOTIF_SHEET}!A1:H1`, [['ID', 'For User', 'Type', 'Ref ID', 'From', 'Text', 'Created At', 'Read']]);
  }
  _ensured.add('notif');
}

async function addNotification(forUser, type, refId, from, text) {
  if (!String(forUser || '').trim()) return;
  await ensureNotificationsSheet();
  const id = 'N' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
  await valuesAppend(`${CONFIG.NOTIF_SHEET}!A:H`,
    [[id, String(forUser), String(type || ''), String(refId || ''), String(from || ''), String(text || ''), nowStamp(), 'FALSE']]);
}

async function getNotifications(user) {
  let rows = [];
  try { rows = await valuesGet(`${CONFIG.NOTIF_SHEET}!A2:H`); } catch (e) { return []; }
  const u = baseName(user);
  if (!u) return [];
  return rows
    .map((r, i) => ({
      row: i + 2, id: String((r && r[0]) || ''), forUser: String((r && r[1]) || ''),
      type: String((r && r[2]) || ''), refId: String((r && r[3]) || ''), from: String((r && r[4]) || ''),
      text: String((r && r[5]) || ''), createdAt: stampStr(r && r[6]), read: isChecked(r && r[7]),
    }))
    .filter(n => baseName(n.forUser) === u)
    .reverse(); // terbaru dulu
}

// Tandai terbaca: semua notif user (opsional difilter refId), mis. saat membuka collab terkait.
async function markNotificationsRead(user, refId) {
  await ensureNotificationsSheet();
  let rows = [];
  try { rows = await valuesGet(`${CONFIG.NOTIF_SHEET}!A2:H`); } catch (e) { return { success: true, notifications: [] }; }
  const u = baseName(user), ref = String(refId || '').trim();
  const data = [];
  rows.forEach((r, i) => {
    const fu = baseName((r && r[1]) || ''), rf = String((r && r[3]) || '').trim(), read = isChecked(r && r[7]);
    if (fu === u && !read && (!ref || rf === ref)) data.push({ range: `${CONFIG.NOTIF_SHEET}!H${i + 2}`, values: [['TRUE']] });
  });
  if (data.length) {
    const sheets = await getSheets();
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: getSpreadsheetId(), requestBody: { valueInputOption: 'RAW', data } });
  }
  return { success: true, notifications: await getNotifications(user) };
}

// Parse @Nama pada pesan komentar -> buat notifikasi untuk tiap user valid yang di-tag.
// @everyone / @semua / @all -> tag SEMUA user (kecuali penulis & user lihat-saja).
const MENTION_ALL = ['everyone', 'semua', 'all'];
// @peran -> tag semua user AKTIF dengan peran itu (mis. @staff, @magang).
// "Dev" & "Lihat Saja" sengaja tidak ikut: yang pertama akun teknis, yang kedua tamu baca.
const MENTION_ROLES = ['manager', 'leader', 'staff', 'magang'];

async function createMentionNotifications(refId, author, message) {
  const msg = String(message || '');
  if (msg.indexOf('@') < 0) return;
  let pics = [];
  try { pics = (await getOptions()).pic || []; } catch (e) { pics = []; }
  const validPics = pics.filter(p => baseName(p) !== 'lintas divisi');   // hindari user lihat-saja
  try { await loadUsers(); } catch (e) { /* peran tak wajib */ }
  // Kumpulan nama = dropdown PIC + baris USERS. Kalau hanya PIC, nama yang belum masuk
  // dropdown gagal dicocokkan lalu JATUH ke tag peran — "@Magang A" berubah jadi "@magang"
  // dan menotifikasi seluruh anak magang. Nama harus selalu menang atas peran.
  const namaSah = validPics.slice();
  (_users || []).forEach(u => {
    if (u.active === false) return;
    if (baseName(u.name) === 'lintas divisi') return;
    if (!namaSah.some(p => baseName(p) === baseName(u.name))) namaSah.push(u.name);
  });
  // Cocokkan nama TERPANJANG dulu supaya nama ber-spasi ("Staff Data") tidak tertukar
  // dengan nama lain yang kata depannya sama ("Staff Soal").
  const sorted = namaSah.slice().sort((a, b) => String(b).length - String(a).length);

  const targets = new Set();
  const peranDitag = new Set();
  let tagAll = false;
  const lower = msg.toLowerCase();
  const batasKata = ch => !ch || !/[A-Za-z0-9]/.test(ch);

  for (let i = 0; i < msg.length; i++) {
    if (msg.charAt(i) !== '@') continue;
    const rest = lower.substring(i + 1);
    // 1) Nama user (boleh mengandung spasi). Nama menang atas peran karena lebih spesifik.
    let matched = false;
    for (const p of sorted) {
      const nm = baseName(p);
      if (!nm || rest.indexOf(nm) !== 0) continue;
      if (!batasKata(rest.charAt(nm.length))) continue;   // "@Staff" jangan cocok ke tengah kata
      if (baseName(p) !== baseName(author)) targets.add(p);
      matched = true; break;
    }
    if (matched) continue;
    // 2) @everyone / @semua / @all
    if (MENTION_ALL.some(kw => rest.indexOf(kw) === 0 && batasKata(rest.charAt(kw.length)))) { tagAll = true; continue; }
    // 3) @peran
    for (const r of MENTION_ROLES) {
      if (rest.indexOf(r) === 0 && batasKata(rest.charAt(r.length))) { peranDitag.add(r); break; }
    }
  }

  if (tagAll) validPics.forEach(p => { if (baseName(p) !== baseName(author)) targets.add(p); });
  if (peranDitag.size && usersConfigured()) {
    (_users || []).forEach(u => {
      if (u.active === false) return;
      if (!peranDitag.has(String(u.role || '').trim().toLowerCase())) return;
      if (baseName(u.name) === baseName(author)) return;
      targets.add(u.name);
    });
  }
  if (!targets.size) return;

  const sasaran = tagAll ? 'semua'
    : (peranDitag.size ? Array.from(peranDitag).join('/') : 'Anda');
  const text = `${author} men-tag ${sasaran}: "${msg.slice(0, 90)}"`;
  for (const t of targets) {
    await addNotification(t, 'mention', refId, author, text);
  }
}

/* ------------------------------------------------------------------ */
/* ACTIVITY                                                            */
/* ------------------------------------------------------------------ */

/**
 * Catat satu kejadian ke sheet ACTIVITY.
 *
 * `statusFrom`/`statusTo` diisi HANYA saat status task memang berpindah, dan
 * ditulis ke kolom tersendiri (F & G) — bukan diselipkan ke teks `detail`.
 * Sebelumnya status hanya bisa dibaca ulang dengan menebak pola dari kalimat
 * "• Status: Done •", yang rapuh: sekali format kalimatnya berubah, seluruh
 * riwayat jadi tak terbaca tanpa satu pun error muncul.
 *
 * Kolom `detail` tetap memuat kalimat lamanya supaya tampilan riwayat di UI
 * tidak berubah dan baris lama tetap sebanding dengan baris baru.
 */
async function logActivity(user, action, taskId, detail, statusFrom, statusTo) {
  try {
    await valuesAppend(`${CONFIG.ACTIVITY_SHEET}!A:G`,
      [[nowStamp(), String(user || 'Unknown'), String(action || ''), String(taskId || ''), String(detail || ''),
        String(statusFrom || ''), String(statusTo || '')]]);
  } catch (e) {
    // Logging tidak boleh menggagalkan operasi utama.
  }
}

async function getActivityLog(limit, pre) {
  let rows = [];
  if (pre !== undefined) rows = pre;
  else {
    try { rows = await valuesGet(`${CONFIG.ACTIVITY_SHEET}!A2:G`); }
    catch (e) { return []; }
  }
  const out = rows
    .map(r => ({
      timestamp: formatDate(r[0], true),
      user: String(r[1] || ''),
      action: String(r[2] || ''),
      taskId: String(r[3] || ''),
      detail: String(r[4] || ''),
      // Kosong pada baris yang ditulis sebelum kolom ini ada. Pembaca harus
      // memperlakukan kosong sebagai "tak tercatat", bukan "tidak berubah".
      statusFrom: String(r[5] || ''),
      statusTo: String(r[6] || ''),
    }))
    .filter(r => r.timestamp || r.user);
  out.reverse(); // terbaru di atas
  const max = Number(limit) > 0 ? Number(limit) : 200;
  return out.slice(0, max);
}

/* ------------------------------------------------------------------ */
/* BOOTSTRAP                                                           */
/* ------------------------------------------------------------------ */

async function getAllCommentsLite(pre) {
  let rows = [];
  if (pre !== undefined) rows = pre;
  else { try { rows = await valuesGet(`${CONFIG.COMMENTS_SHEET}!A2:D`); } catch (e) { return []; } }
  return rows
    .map(r => ({ timestamp: formatDate(r && r[0], true), taskId: String((r && r[1]) || ''), author: String((r && r[2]) || '') }))
    .filter(c => c.taskId);
}

// Apakah salah satu Support task ini seorang magang?

/* Task yang boleh dilihat dari level "magang": HANYA yang benar-benar miliknya —
   sebagai PIC atau Support. Sesama magang TIDAK lagi saling melihat: task Wildan dulu ikut
   muncul di layar tiga magang lain, padahal bukan pekerjaan mereka.
   Task yang sengaja ber-PIC peran ("@Magang") tetap terlihat oleh semuanya — itu memang
   task milik bersama, dan ownsTaskActor() yang memutuskannya. */
// Nama yang diklaim browser divalidasi dulu harus ber-peran Magang, jadi klaim palsu
// tidak bisa dipakai untuk menembus ke data karyawan.
function magangVisibleTask(task, asUser) {
  return !!asUser && ownsTaskActor(task, asUser);
}

async function getBootstrapData(opts) {
  const viewOnly = !!(opts && opts.viewOnly);
  const magangOnly = !!(opts && opts.magangOnly);
  // Satu batchGet untuk SEMUA range -> hemat kuota (±2 read, bukan ±11).
  const meta = await getSheetMeta().catch(() => ({}));            // 1 read: tahu sheet mana yang ada
  const sheetOf = {
    tasks: CONFIG.TASK_SHEET, options: CONFIG.OPTIONS_SHEET, activity: CONFIG.ACTIVITY_SHEET,
    comments: CONFIG.COMMENTS_SHEET, auth: CONFIG.AUTH_SHEET, links: CONFIG.LINKS_SHEET,
    dashboards: CONFIG.DASHBOARDS_SHEET, notes: CONFIG.NOTES_SHEET, checklist: CONFIG.CHECKLIST_SHEET,
    collab: CONFIG.COLLAB_SHEET, collabSteps: CONFIG.COLLAB_STEP_SHEET, users: CONFIG.USERS_SHEET,
  };
  const R = {
    tasks: MAIN_DATA_RANGE(), options: `${CONFIG.OPTIONS_SHEET}!A2:D`, activity: `${CONFIG.ACTIVITY_SHEET}!A2:E`,
    comments: `${CONFIG.COMMENTS_SHEET}!A2:D`, auth: `${CONFIG.AUTH_SHEET}!A2:B`, links: `${CONFIG.LINKS_SHEET}!A2:D`,
    dashboards: `${CONFIG.DASHBOARDS_SHEET}!A2:D`, notes: `${CONFIG.NOTES_SHEET}!A2:E`, checklist: `${CONFIG.CHECKLIST_SHEET}!A2:C`,
    // A2:J, bukan A2:I — kolom J menyimpan Paket ID. Kalau berhenti di I, tiap muat
    // ulang mengembalikan collab tanpa tautan paket dan tautannya tampak hilang.
    collab: `${CONFIG.COLLAB_SHEET}!A2:J`, collabSteps: `${CONFIG.COLLAB_STEP_SHEET}!A2:K`,
    users: `${CONFIG.USERS_SHEET}!A2:C`,
  };
  const present = Object.keys(R).filter(k => meta[sheetOf[k]]);
  let batch = null;
  if (present.length) { try { batch = await valuesBatchGet(present.map(k => R[k])); } catch (e) { batch = null; } }  // 1 read
  // pre(k): array (dari batch) bila sukses; [] bila sheet tak ada; undefined bila batch gagal -> fungsi baca sendiri.
  const pre = (k) => (batch === null ? undefined : (meta[sheetOf[k]] ? (batch[R[k]] || []) : []));

  // Peran diambil dari batch yang sama -> tidak menambah kuota baca sama sekali.
  await loadUsers(pre('users'));

  const [tasks, options, activity, commentsSummary, pinUsers, links, dashboards, notes, checklistSummary, collabs] = await Promise.all([
    getTasks(pre('tasks')),
    getOptions(pre('options')),
    getActivityLog(200, pre('activity')),
    getAllCommentsLite(pre('comments')),
    listPinUsers(pre('auth')),
    getAllLinks(pre('links')),
    getAllDashboards(pre('dashboards')),
    getAllNotes(pre('notes')),
    getChecklistSummary(pre('checklist')),
    getCollabs(pre('collab'), pre('collabSteps')).catch(() => []),
  ]);
  if (magangOnly) {
    // Level magang: PANGKAS di server. Task karyawan tidak pernah ikut terkirim,
    // jadi tak bisa diintip lewat DevTools sekalipun.
    const asUserRaw = String((opts && opts.asUser) || '').trim();
    const asUser = isMagangActor(asUserRaw) ? asUserRaw : '';   // klaim non-magang diabaikan
    const shown = (tasks || []).filter(t => magangVisibleTask(t, asUser));
    const shownIds = new Set(shown.map(t => t.id));
    const magangNames = _users.filter(u => u.active && String(u.role).toLowerCase() === 'magang').map(u => u.name);
    // Task kolaborasi: hanya yang ada prosesnya dipegang magang.
    const myCollabs = (collabs || []).filter(c => (c.steps || []).some(s => isMagangActor(s.pic)));
    return {
      tasks: shown,
      options,
      activity: [],
      commentsSummary: (commentsSummary || []).filter(c => shownIds.has(c.taskId)),
      pinUsers: [],
      links: asUser ? (links || []).filter(l => baseName(l.user) === baseName(asUser)) : [],
      dashboards,   // dashboard eksternal dibuka juga untuk magang (isinya bukan data task)
      notes: asUser ? (notes || []).filter(n => baseName(n.user) === baseName(asUser)) : [],
      checklistSummary,
      collabs: myCollabs,
      magangOnly: true,
      magangUsers: magangNames,          // daftar identitas yang boleh dipilih
      meta: {
        sheetName: CONFIG.TASK_SHEET,
        env: appEnv(),
        managers: [], doneApprovers: [], collabManagers: [],
        users: _users.filter(u => String(u.role).toLowerCase() === 'magang')
          .map(u => ({ row: u.row, name: u.name, role: u.role, active: u.active })),
        roles: ROLES,
        generatedAt: nowStamp(),
      },
    };
  }

  if (viewOnly) {
    // Tamu tanpa PIN: hanya task yang di-set Lintas (punya Divisi Tujuan) atau di-mirror,
    // plus opsi (utk label/warna), dashboards, dan ringkasan chat pada task tsb.
    const isShown = (t) => {
      const ext = String((t && t.divisiTujuan) || '').trim() !== '';
      const mir = /^(ya|yes|true|1)$/i.test(String((t && t.mirror) || '').trim());
      return ext || mir;
    };
    const shown = (tasks || []).filter(isShown);
    const shownIds = new Set(shown.map(t => t.id));
    return {
      tasks: shown,
      options,
      activity: [],
      commentsSummary: (commentsSummary || []).filter(c => shownIds.has(c.taskId)),
      pinUsers: [],
      links: [],
      dashboards: dashboards || [],
      notes: [],
      viewOnly: true,
      meta: {
        sheetName: CONFIG.TASK_SHEET,
        env: appEnv(),
        managers: getManagers(),
        doneApprovers: getDoneApprovers(),
        collabManagers: getCollabManagers(),
        users: await getUsers(),   // sumber peran untuk UI (Dev/Manager/Leader/Staff/Magang/Lihat Saja)
        roles: ROLES,
        generatedAt: nowStamp(),
      },
    };
  }
  return {
    tasks,
    options,
    activity,
    commentsSummary,
    pinUsers,
    links,
    dashboards,
    notes,
    checklistSummary,
    collabs,
    meta: {
      sheetName: CONFIG.TASK_SHEET,
      env: appEnv(),
      managers: getManagers(),
      doneApprovers: getDoneApprovers(),
      collabManagers: getCollabManagers(),
      users: await getUsers(),   // sumber peran untuk UI (Dev/Manager/Leader/Staff/Magang/Lihat Saja)
      roles: ROLES,
      generatedAt: nowStamp(),
    },
  };
}

/* ------------------------------------------------------------------ */
/* SETUP (buat sheet/header/opsi default bila belum ada)               */
/* ------------------------------------------------------------------ */

async function ensureSheetExists(title) {
  const meta = await getSheetMeta();
  if (meta[title]) return meta[title];
  await batchUpdate([{ addSheet: { properties: { title } } }]);
  const meta2 = await getSheetMeta();
  return meta2[title];
}

async function ensureOptionsSheet() {
  await ensureSheetExists(CONFIG.OPTIONS_SHEET);
  const head = await valuesGet(`${CONFIG.OPTIONS_SHEET}!A1:D1`);
  const h0 = head[0] || [];
  if (!h0[0]) await valuesUpdate(`${CONFIG.OPTIONS_SHEET}!A1:D1`, [['Type', 'Value', 'Active', 'Parent']]);
  else if (!h0[3]) await valuesUpdate(`${CONFIG.OPTIONS_SHEET}!D1`, [['Parent']]);
  // Seed opsi default yang belum ada.
  const existing = await readOptionsRaw();
  const toAppend = [];
  OPTION_TYPES.forEach(type => {
    (DEFAULT_OPTIONS[type] || []).forEach(value => {
      const exists = existing.some(r => r.type === type && r.value.toLowerCase() === String(value).toLowerCase());
      if (!exists) toAppend.push([type, value, true, '']);
    });
  });
  if (toAppend.length) await valuesAppend(`${CONFIG.OPTIONS_SHEET}!A:D`, toAppend);
}

// Template rumus nama task (dari tabel "RUMUS DETAIL TASK"): Stage -> Kata Kerja -> Objek.
const FORMULA_TEMPLATE = {
  'RND': { 'Menyusun': ['kurikulum', 'product knowledge', 'silabus', 'sistem penilaian', 'panduan'], 'Membuat': ['mapping', 'prompt'], 'Melakukan': ['riset'] },
  'Develop Konten (Materi/Soal)': { 'Menyusun': ['materi', 'journey'], 'Membuat': ['soal'], 'Melakukan': ['syuting', 'retake'], 'Mengambil (take)': ['video pembahasan'] },
  'Manajemen Sistem': { 'Merapikan': ['subbab'], 'Menyusun': ['kerangka kategori'], 'Generate/regenerate': ['paket'], 'Menampilkan/menyembunyikan': ['kategori'], 'Mengelompokkan': ['data'], 'Menyelesaikan': ['report'] },
  'QC': { 'Memperbarui': ['bumper', 'thumbnail'], 'Melakukan': ['QC'] },
  'Operasional': { 'Menginput': ['soal', 'video pembahasan', 'jadwal'], 'Membangun': ['sistem otomatis'], 'Memonitor': ['liveclass'] },
  'Manajemen Guru': { 'Mendistribusikan': ['proyek video pembahasan', 'proyek komplit'], 'Menyusun': ['jadwal'] },
  'Data & Intelligence': { 'Membuat': ['query'], 'Melakukan': ['scraping'], 'Membangun': ['dashboard'] },
  'Kreatif': { 'Mengedit': ['PDF', 'video'], 'Membuat': ['icon'] },
};
async function seedFormulaTemplate() {
  await ensureOptionsSheet();
  const existing = await readOptionsRaw();
  const has = (type, value, parent) => existing.some(r => r.type === type && r.value.toLowerCase() === String(value).toLowerCase() && (!USES_PARENT.includes(type) || r.parent.toLowerCase() === String(parent || '').toLowerCase()));
  const toAppend = [];
  Object.keys(FORMULA_TEMPLATE).forEach(stage => {
    if (!has('stage', stage)) toAppend.push(['stage', stage, true, '']);
    Object.keys(FORMULA_TEMPLATE[stage]).forEach(verb => {
      if (!has('verb', verb, stage)) toAppend.push(['verb', verb, true, stage]);
      FORMULA_TEMPLATE[stage][verb].forEach(objek => {
        const p = stage + '||' + verb;
        if (!has('object', objek, p)) toAppend.push(['object', objek, true, p]);
      });
    });
  });
  if (toAppend.length) await valuesAppend(`${CONFIG.OPTIONS_SHEET}!A:D`, toAppend);
  await applySheetValidations().catch(() => {});
  return { success: true, message: `Template terisi: ${toAppend.length} baris baru (stage + kata kerja + objek).`, options: await getOptions() };
}

async function ensureCommentsSheet() {
  if (_ensured.has('comments')) return;
  await ensureSheetExists(CONFIG.COMMENTS_SHEET);
  const head = await valuesGet(`${CONFIG.COMMENTS_SHEET}!A1:D1`);
  if (!head.length || !head[0] || !head[0][0]) {
    await valuesUpdate(`${CONFIG.COMMENTS_SHEET}!A1:D1`, [['Timestamp', 'Task ID', 'Author', 'Message']]);
  }
  _ensured.add('comments');
}

async function ensureActivitySheet() {
  await ensureSheetExists(CONFIG.ACTIVITY_SHEET);
  const head = await valuesGet(`${CONFIG.ACTIVITY_SHEET}!A1:G1`);
  const h0 = (head.length && head[0]) || [];
  if (!h0[0]) {
    await valuesUpdate(`${CONFIG.ACTIVITY_SHEET}!A1:G1`,
      [['Timestamp', 'User', 'Action', 'Task ID', 'Detail', 'Status Lama', 'Status Baru']]);
  } else if (!h0[5]) {
    // Sheet lama yang baru punya A..E — tambah dua kolom status tanpa menyentuh baris data.
    await valuesUpdate(`${CONFIG.ACTIVITY_SHEET}!F1:G1`, [['Status Lama', 'Status Baru']]);
  }
}

async function ensureTaskHeaders() {
  await ensureSheetExists(CONFIG.TASK_SHEET);
  const range = `${CONFIG.TASK_SHEET}!${CONFIG.FIRST_COL_LETTER}${CONFIG.HEADER_ROW}:${CONFIG.LAST_COL_LETTER}${CONFIG.HEADER_ROW}`;
  const cur = await valuesGet(range, { valueRenderOption: 'FORMATTED_VALUE' });
  const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const have = (cur[0] || []).map(norm);
  const ok = TASK_HEADERS.every((h, i) => norm(have[i]) === norm(h));
  if (!ok) await valuesUpdate(range, [TASK_HEADERS]);
}

async function colLetterToIndex(letter) {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1; // 0-based
}

async function applySheetValidations() {
  const meta = await getSheetMeta();
  const props = meta[CONFIG.TASK_SHEET];
  if (!props) return;
  const sheetId = props.sheetId;
  const maxRows = (props.gridProperties && props.gridProperties.rowCount) || 1000;
  const options = await getOptions();

  const requests = [];
  for (const header of Object.keys(VALIDATION_MAP)) {
    const list = options[VALIDATION_MAP[header]] || [];
    if (!list.length) continue;
    const headerIdx = TASK_HEADERS.indexOf(header);
    if (headerIdx === -1) continue;
    const colIndex = await colLetterToIndex(CONFIG.FIRST_COL_LETTER) + headerIdx;
    requests.push({
      setDataValidation: {
        range: {
          sheetId,
          startRowIndex: CONFIG.FIRST_DATA_ROW - 1,
          endRowIndex: maxRows,
          startColumnIndex: colIndex,
          endColumnIndex: colIndex + 1,
        },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: list.map(v => ({ userEnteredValue: String(v) })) },
          showCustomUi: true,
          strict: false,
        },
      },
    });
  }
  if (requests.length) await batchUpdate(requests);
}

/* ------------------------------------------------------------------ */
/* PIN per-user (sheet AUTH tersembunyi, hash, validasi di server)     */
/* ------------------------------------------------------------------ */

async function ensureAuthSheet() {
  if (_ensured.has('auth')) return;
  const p = await ensureSheetExists(CONFIG.AUTH_SHEET);
  const head = await valuesGet(`${CONFIG.AUTH_SHEET}!A1:B1`);
  if (!head.length || !head[0] || !head[0][0]) {
    await valuesUpdate(`${CONFIG.AUTH_SHEET}!A1:B1`, [['User', 'PinHash']]);
  }
  try {
    if (p && p.sheetId != null) {
      await batchUpdate([{ updateSheetProperties: { properties: { sheetId: p.sheetId, hidden: true }, fields: 'hidden' } }]);
    }
  } catch (e) { /* abaikan bila gagal menyembunyikan */ }
  _ensured.add('auth');
}

async function readAuthRaw(pre) {
  let rows;
  if (pre !== undefined) rows = pre || [];
  else {
    /* Sheet-nya dipastikan ada DULU, supaya gagal setelah titik ini benar-benar berarti
       gangguan baca — bukan "AUTH memang belum pernah dibuat". Bedanya menentukan: daftar
       kosong membuat verifyPin menganggap semua orang belum berPIN lalu meloloskannya.
       Karena itu galatnya dilempar, bukan disulap jadi daftar kosong. */
    await ensureAuthSheet();
    rows = await valuesGet(`${CONFIG.AUTH_SHEET}!A2:B`);
  }
  return (rows || [])
    .map(r => ({ user: String((r && r[0]) || '').trim(), hash: String((r && r[1]) || '').trim() }))
    .filter(r => r.user);
}

// Verifikasi PIN di server.
//  - Mode Dev (user === '__dev__'): cocokkan dengan DEV_PIN (default 3108).
//  - Mode user biasa: jika user punya PIN khusus -> wajib cocok; jika belum -> bebas (tanpa PIN).
async function verifyPin(user, pin) {
  user = String(user || '').trim();
  // DEV_PIN kosong = mode Dev dinonaktifkan (jangan sampai PIN kosong dianggap cocok).
  if (user === '__dev__') {
    if (!DEV_PIN) return { ok: false, message: 'Mode Dev belum diaktifkan (set env DEV_PIN di Vercel).' };
    return { ok: String(pin || '').trim() === DEV_PIN };
  }
  /* Gagal baca = TIDAK TAHU, dan tidak tahu harus berarti ditolak. Dulu galat baca berubah
     jadi daftar kosong, lalu "tak ada di daftar" dibaca sebagai "belum berPIN" — artinya
     satu gangguan sesaat meloloskan setiap user berPIN tanpa PIN sama sekali. */
  let rows;
  try { rows = await readAuthRaw(); }
  catch (e) { return { ok: false, message: 'Tak bisa memeriksa PIN sekarang (data gagal dibaca). Coba lagi sebentar lagi.' }; }
  const found = rows.find(r => r.user.toLowerCase() === user.toLowerCase());
  if (!found) return { ok: true, noPin: true };
  return { ok: hashPin(user, pin) === found.hash };
}

// Set/ubah PIN seorang user (dipanggil oleh dev). Hanya hash yang disimpan.
async function setUserPin(user, pin) {
  user = String(user || '').trim();
  pin = String(pin || '').trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  if (!/^\d{4}$/.test(pin)) return { success: false, message: 'PIN harus 4 digit angka.' };
  await ensureAuthSheet();
  const rows = await readAuthRaw();
  const hash = hashPin(user, pin);
  const idx = rows.findIndex(r => r.user.toLowerCase() === user.toLowerCase());
  if (idx === -1) await valuesAppend(`${CONFIG.AUTH_SHEET}!A:B`, [[user, hash]]);
  else await valuesUpdate(`${CONFIG.AUTH_SHEET}!B${idx + 2}`, [[hash]]);
  return { success: true, message: `PIN untuk ${user} disimpan.` };
}

// Hapus PIN seorang user (kembali bebas tanpa PIN).
async function deleteUserPin(user) {
  user = String(user || '').trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  let rows = [];
  try { rows = await valuesGet(`${CONFIG.AUTH_SHEET}!A2:B`); } catch (e) { return { success: true, message: 'Tidak ada PIN.', removed: false }; }
  const i = rows.findIndex(r => String((r && r[0]) || '').trim().toLowerCase() === user.toLowerCase());
  if (i === -1) return { success: true, message: 'User belum punya PIN.', removed: false };
  const meta = await getSheetMeta();
  const sheetId = meta[CONFIG.AUTH_SHEET] && meta[CONFIG.AUTH_SHEET].sheetId;
  if (sheetId == null) return { success: false, message: 'Sheet AUTH tidak ditemukan.' };
  const rowNumber = 2 + i;
  await batchUpdate([{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowNumber - 1, endIndex: rowNumber } } }]);
  return { success: true, message: `PIN untuk ${user} dihapus.`, removed: true };
}

// Daftar user yang sudah punya PIN khusus (hash TIDAK dikirim).
async function listPinUsers(pre) {
  const rows = await readAuthRaw(pre);
  return rows.map(r => r.user);
}

/* ------------------------------------------------------------------ */
/* LINK per-user (sheet LINKS: User, Title, URL)                       */
/* ------------------------------------------------------------------ */

async function ensureLinksSheet() {
  await ensureSheetExists(CONFIG.LINKS_SHEET);
  const head = await valuesGet(`${CONFIG.LINKS_SHEET}!A1:D1`);
  const h0 = head[0] || [];
  if (!h0[0]) await valuesUpdate(`${CONFIG.LINKS_SHEET}!A1:D1`, [['User', 'Title', 'URL', 'Folder']]);
  else if (!h0[3]) await valuesUpdate(`${CONFIG.LINKS_SHEET}!D1`, [['Folder']]);
}

async function getAllLinks(pre) {
  let rows = [];
  if (pre !== undefined) rows = pre;
  else { try { rows = await valuesGet(`${CONFIG.LINKS_SHEET}!A2:D`); } catch (e) { return []; } }
  return rows
    .map((r, i) => ({ row: i + 2, user: String((r && r[0]) || '').trim(), title: String((r && r[1]) || '').trim(), url: String((r && r[2]) || '').trim(), folder: String((r && r[3]) || '').trim() }))
    .filter(l => l.user && l.url);
}

async function addUserLink(user, title, url, folder) {
  user = String(user || '').trim();
  title = String(title || '').trim();
  url = String(url || '').trim();
  folder = String(folder || '').trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  if (!url) return { success: false, message: 'URL wajib diisi.' };
  await ensureLinksSheet();
  await valuesAppend(`${CONFIG.LINKS_SHEET}!A:D`, [[user, title || url, url, folder]]);
  return { success: true, message: 'Link ditambahkan.', links: await getAllLinks() };
}

async function updateUserLink(user, row, title, url, folder) {
  user = String(user || '').trim();
  row = parseInt(row, 10);
  title = String(title || '').trim();
  url = String(url || '').trim();
  folder = String(folder || '').trim();
  if (!row || row < 2) return { success: false, message: 'Baris tidak valid.' };
  if (!url) return { success: false, message: 'URL wajib diisi.' };
  const cur = await valuesGet(`${CONFIG.LINKS_SHEET}!A${row}:A${row}`);
  const owner = String((cur[0] && cur[0][0]) || '').trim();
  if (owner.toLowerCase() !== user.toLowerCase()) return { success: false, message: 'Bukan link Anda.' };
  await valuesUpdate(`${CONFIG.LINKS_SHEET}!B${row}:D${row}`, [[title || url, url, folder]]);
  return { success: true, message: 'Link diperbarui.', links: await getAllLinks() };
}

async function deleteUserLink(user, row) {
  user = String(user || '').trim();
  row = parseInt(row, 10);
  if (!row || row < 2) return { success: false, message: 'Baris tidak valid.' };
  const cur = await valuesGet(`${CONFIG.LINKS_SHEET}!A${row}:A${row}`);
  const owner = String((cur[0] && cur[0][0]) || '').trim();
  if (owner.toLowerCase() !== user.toLowerCase()) return { success: false, message: 'Bukan link Anda.' };
  const meta = await getSheetMeta();
  const sheetId = meta[CONFIG.LINKS_SHEET] && meta[CONFIG.LINKS_SHEET].sheetId;
  if (sheetId == null) return { success: false, message: 'Sheet LINKS tidak ditemukan.' };
  await batchUpdate([{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } }]);
  return { success: true, message: 'Link dihapus.', links: await getAllLinks() };
}

// Operasi massal pada kolom Folder milik 1 user: ganti semua link berfolder oldFolder -> newFolder.
async function _bulkFolderOp(user, oldFolder, newFolder) {
  await ensureLinksSheet();
  let rows = [];
  try { rows = await valuesGet(`${CONFIG.LINKS_SHEET}!A2:D`); } catch (e) { rows = []; }
  if (!rows.length) return { success: true, changed: 0, links: [] };
  let changed = 0;
  const dCol = rows.map(r => {
    const u = String((r && r[0]) || '').trim();
    const f = String((r && r[3]) || '').trim();
    if (u.toLowerCase() === user.toLowerCase() && f === oldFolder) { changed++; return [newFolder]; }
    return [f];
  });
  if (changed > 0) await valuesUpdate(`${CONFIG.LINKS_SHEET}!D2:D${rows.length + 1}`, dCol);
  return { success: true, changed, links: await getAllLinks() };
}

async function renameUserFolder(user, oldFolder, newFolder) {
  user = String(user || '').trim();
  oldFolder = String(oldFolder || '').trim();
  newFolder = String(newFolder || '').trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  if (!oldFolder) return { success: false, message: 'Folder asal tidak valid.' };
  if (!newFolder) return { success: false, message: 'Nama folder baru wajib diisi.' };
  const res = await _bulkFolderOp(user, oldFolder, newFolder);
  return { ...res, message: `Folder "${oldFolder}" diganti jadi "${newFolder}" (${res.changed} link).` };
}

async function deleteUserFolder(user, folder) {
  user = String(user || '').trim();
  folder = String(folder || '').trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  if (!folder) return { success: false, message: 'Folder tidak valid.' };
  // Pindahkan semua link di folder ini ke root (Umum). Link TIDAK dihapus.
  const res = await _bulkFolderOp(user, folder, '');
  return { ...res, message: `Folder "${folder}" dihapus. ${res.changed} link dipindah ke Umum (tidak terhapus).` };
}

/* ------------------------------------------------------------------ */
/* DASHBOARD LAIN (dashboard eksternal — CRUD khusus Dev)              */
/* ------------------------------------------------------------------ */
// Isian awal sheet DASHBOARDS saat pertama kali dibuat. Sengaja kosong supaya tidak ada
// URL internal yang ikut terdistribusi — tambahkan lewat tab "Dashboard Lain" (mode Dev).
const DEFAULT_DASHBOARDS = [];
async function ensureDashboardsSheet() {
  await ensureSheetExists(CONFIG.DASHBOARDS_SHEET);
  const head = await valuesGet(`${CONFIG.DASHBOARDS_SHEET}!A1:D1`);
  if (!head.length || !head[0] || !head[0][0]) {
    await valuesUpdate(`${CONFIG.DASHBOARDS_SHEET}!A1:D1`, [['Title', 'Desc', 'Icon', 'URL']]);
    if (DEFAULT_DASHBOARDS.length) await valuesAppend(`${CONFIG.DASHBOARDS_SHEET}!A:D`, DEFAULT_DASHBOARDS); // seed agar dashboard awal tak hilang
  }
}
async function getAllDashboards(pre) {
  let rows = [];
  if (pre !== undefined) rows = pre;
  else { try { rows = await valuesGet(`${CONFIG.DASHBOARDS_SHEET}!A2:D`); } catch (e) { return []; } }
  return rows
    .map((r, i) => ({ row: i + 2, title: String((r && r[0]) || '').trim(), desc: String((r && r[1]) || '').trim(), icon: String((r && r[2]) || '').trim(), url: String((r && r[3]) || '').trim() }))
    .filter(d => d.title || d.url);
}
async function addDashboard(title, desc, icon, url) {
  title = String(title || '').trim();
  desc = String(desc || '').trim();
  icon = String(icon || '').trim() || 'dashboard';
  url = String(url || '').trim();
  if (!title) return { success: false, message: 'Judul dashboard wajib diisi.' };
  if (!url) return { success: false, message: 'URL dashboard wajib diisi.' };
  await ensureDashboardsSheet();
  await valuesAppend(`${CONFIG.DASHBOARDS_SHEET}!A:D`, [[title, desc, icon, url]]);
  return { success: true, message: 'Dashboard ditambahkan.', dashboards: await getAllDashboards() };
}
async function updateDashboard(row, title, desc, icon, url) {
  row = parseInt(row, 10);
  title = String(title || '').trim();
  desc = String(desc || '').trim();
  icon = String(icon || '').trim() || 'dashboard';
  url = String(url || '').trim();
  if (!row || row < 2) return { success: false, message: 'Baris tidak valid.' };
  if (!title) return { success: false, message: 'Judul dashboard wajib diisi.' };
  if (!url) return { success: false, message: 'URL dashboard wajib diisi.' };
  await ensureDashboardsSheet();
  await valuesUpdate(`${CONFIG.DASHBOARDS_SHEET}!A${row}:D${row}`, [[title, desc, icon, url]]);
  return { success: true, message: 'Dashboard diperbarui.', dashboards: await getAllDashboards() };
}
async function deleteDashboard(row) {
  row = parseInt(row, 10);
  if (!row || row < 2) return { success: false, message: 'Baris tidak valid.' };
  const meta = await getSheetMeta();
  const sheetId = meta[CONFIG.DASHBOARDS_SHEET] && meta[CONFIG.DASHBOARDS_SHEET].sheetId;
  if (sheetId == null) return { success: false, message: 'Sheet DASHBOARDS tidak ditemukan.' };
  await batchUpdate([{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } }]);
  return { success: true, message: 'Dashboard dihapus.', dashboards: await getAllDashboards() };
}

/* ------------------------------------------------------------------ */
/* CATATAN SAYA (sheet NOTES: User, Title, Body, UpdatedAt, Folder)    */
/* ------------------------------------------------------------------ */
async function ensureNotesSheet() {
  await ensureSheetExists(CONFIG.NOTES_SHEET);
  const head = await valuesGet(`${CONFIG.NOTES_SHEET}!A1:E1`);
  const h0 = head[0] || [];
  if (!h0[0]) await valuesUpdate(`${CONFIG.NOTES_SHEET}!A1:E1`, [['User', 'Title', 'Body', 'UpdatedAt', 'Folder']]);
  else if (!h0[4]) await valuesUpdate(`${CONFIG.NOTES_SHEET}!E1`, [['Folder']]);
}
async function getAllNotes(pre) {
  let rows = [];
  if (pre !== undefined) rows = pre;
  else { try { rows = await valuesGet(`${CONFIG.NOTES_SHEET}!A2:E`); } catch (e) { return []; } }
  return rows
    .map((r, i) => ({ row: i + 2, user: String((r && r[0]) || '').trim(), title: String((r && r[1]) || '').trim(), body: String((r && r[2]) || '').trim(), updatedAt: stampStr(r && r[3]), folder: String((r && r[4]) || '').trim() }))
    .filter(n => n.user && (n.title || n.body));
}
async function addNote(user, title, body, folder) {
  user = String(user || '').trim();
  title = String(title || '').trim();
  body = String(body || '').trim();
  folder = String(folder || '').trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  if (!title && !body) return { success: false, message: 'Catatan tidak boleh kosong.' };
  await ensureNotesSheet();
  await valuesAppend(`${CONFIG.NOTES_SHEET}!A:E`, [[user, title || '(tanpa judul)', body, nowStamp(), folder]]);
  return { success: true, message: 'Catatan ditambahkan.', notes: await getAllNotes() };
}
async function updateNote(user, row, title, body, folder) {
  user = String(user || '').trim();
  row = parseInt(row, 10);
  title = String(title || '').trim();
  body = String(body || '').trim();
  folder = String(folder || '').trim();
  if (!row || row < 2) return { success: false, message: 'Baris tidak valid.' };
  if (!title && !body) return { success: false, message: 'Catatan tidak boleh kosong.' };
  const cur = await valuesGet(`${CONFIG.NOTES_SHEET}!A${row}:A${row}`);
  const owner = String((cur[0] && cur[0][0]) || '').trim();
  if (owner.toLowerCase() !== user.toLowerCase()) return { success: false, message: 'Bukan catatan Anda.' };
  await valuesUpdate(`${CONFIG.NOTES_SHEET}!B${row}:E${row}`, [[title || '(tanpa judul)', body, nowStamp(), folder]]);
  return { success: true, message: 'Catatan diperbarui.', notes: await getAllNotes() };
}
async function deleteNote(user, row) {
  user = String(user || '').trim();
  row = parseInt(row, 10);
  if (!row || row < 2) return { success: false, message: 'Baris tidak valid.' };
  const cur = await valuesGet(`${CONFIG.NOTES_SHEET}!A${row}:A${row}`);
  const owner = String((cur[0] && cur[0][0]) || '').trim();
  if (owner.toLowerCase() !== user.toLowerCase()) return { success: false, message: 'Bukan catatan Anda.' };
  const meta = await getSheetMeta();
  const sheetId = meta[CONFIG.NOTES_SHEET] && meta[CONFIG.NOTES_SHEET].sheetId;
  if (sheetId == null) return { success: false, message: 'Sheet NOTES tidak ditemukan.' };
  await batchUpdate([{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } }]);
  return { success: true, message: 'Catatan dihapus.', notes: await getAllNotes() };
}
// Operasi massal folder catatan milik 1 user (kolom E).
async function _bulkNoteFolderOp(user, oldFolder, newFolder) {
  await ensureNotesSheet();
  let rows = [];
  try { rows = await valuesGet(`${CONFIG.NOTES_SHEET}!A2:E`); } catch (e) { rows = []; }
  if (!rows.length) return { success: true, changed: 0, notes: [] };
  let changed = 0;
  const eCol = rows.map(r => {
    const u = String((r && r[0]) || '').trim();
    const f = String((r && r[4]) || '').trim();
    if (u.toLowerCase() === user.toLowerCase() && f === oldFolder) { changed++; return [newFolder]; }
    return [f];
  });
  if (changed > 0) await valuesUpdate(`${CONFIG.NOTES_SHEET}!E2:E${rows.length + 1}`, eCol);
  return { success: true, changed, notes: await getAllNotes() };
}
async function renameNoteFolder(user, oldFolder, newFolder) {
  user = String(user || '').trim();
  oldFolder = String(oldFolder || '').trim();
  newFolder = String(newFolder || '').trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  if (!oldFolder) return { success: false, message: 'Folder asal tidak valid.' };
  if (!newFolder) return { success: false, message: 'Nama folder baru wajib diisi.' };
  const res = await _bulkNoteFolderOp(user, oldFolder, newFolder);
  return { ...res, message: `Folder "${oldFolder}" diganti jadi "${newFolder}" (${res.changed} catatan).` };
}
async function deleteNoteFolder(user, folder) {
  user = String(user || '').trim();
  folder = String(folder || '').trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  if (!folder) return { success: false, message: 'Folder tidak valid.' };
  const res = await _bulkNoteFolderOp(user, folder, ''); // catatan dipindah ke Umum, tidak dihapus
  return { ...res, message: `Folder "${folder}" dihapus. ${res.changed} catatan dipindah ke Umum.` };
}

async function setupTaskTracker() {
  await ensureTaskHeaders();
  await ensureOptionsSheet();
  await ensureCommentsSheet();
  await ensureChecklistSheet();
  await ensureCollabSheets();
  await ensureNotificationsSheet();
  await ensureActivitySheet();
  await ensureUsersSheet();
  await ensureAuthSheet();
  await ensureLinksSheet();
  await ensureDashboardsSheet();
  await ensureNotesSheet();
  await applySheetValidations().catch(() => {});
  return {
    success: true,
    message: 'Setup selesai. Sheet Main, OPTIONS, COMMENTS, ACTIVITY, dropdown, dan header dasar sudah siap.',
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${getSpreadsheetId()}/edit`,
  };
}

// Isi Task ID untuk baris yang punya Task Name tapi kolom Task ID-nya kosong
// (mis. baris yang diketik langsung di spreadsheet). ID dilanjutkan dari nomor tertinggi.
async function assignMissingTaskIds() {
  const rows = await valuesGet(MAIN_DATA_RANGE());
  let max = 0;
  rows.forEach(r => { const m = String((r && r[0]) || '').match(/(\d+)\s*$/); if (m) max = Math.max(max, Number(m[1])); });
  const data = [];
  rows.forEach((row, idx) => {
    const tid = String((row && row[0]) || '').trim();
    const name = String((row && row[5]) || '').trim(); // kolom G (Task Name) = indeks 5 dari B
    if (!tid && name) {
      max += 1;
      const rowNumber = CONFIG.FIRST_DATA_ROW + idx;
      data.push({ range: `${CONFIG.TASK_SHEET}!${COL.taskId}${rowNumber}`, values: [['TSK-' + String(max).padStart(3, '0')]] });
    }
  });
  if (data.length) {
    const sheets = await getSheets();
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: getSpreadsheetId(),
      requestBody: { valueInputOption: 'RAW', data },
    });
  }
  const tasks = await getTasks();
  return { success: true, message: `${data.length} Task ID baru dibuat untuk baris yang belum punya ID.`, assigned: data.length, tasks };
}

module.exports = {
  // bootstrap & reads
  getBootstrapData, getTasks, getOptions, getComments, getActivityLog,
  // writes
  saveTask, deleteTask, quickUpdateField, quickUpdateDates,
  addComment, saveOption, deleteOption, editOption,
  // ceklis per task (PM menyusun, PIC mencentang)
  renameUser,
  getChecklist, addChecklistItem, copyChecklist, setChecklistLink, setChecklistDone, deleteChecklistItem,
  // task kolaborasi (alur beruntun antar-PIC)
  getCollabs, saveCollab, setCollabStepDone, setCollabStepNote, setCollabStepLink, setCollabType, deleteCollab,
  // master koordinasi paket (nempel pada collab)
  savePackage, getPackages, deletePackage, deletePackages, setCollabPackage, setPackageContrib,
  // notifikasi (tag @user)
  getNotifications, markNotificationsRead,
  // user & peran (Dev saja)
  getUsers, saveUser, deleteUser, invalidateUsers,
  // setup
  setupTaskTracker, assignMissingTaskIds,
  // auth (PIN)
  verifyPin, setUserPin, deleteUserPin, listPinUsers,
  // link per-user
  addUserLink, updateUserLink, deleteUserLink, getAllLinks,
  renameUserFolder, deleteUserFolder,
  // dashboard lain (CRUD Dev)
  getAllDashboards, addDashboard, updateDashboard, deleteDashboard,
  // catatan saya (per user)
  getAllNotes, addNote, updateNote, deleteNote, renameNoteFolder, deleteNoteFolder,
  // rumus nama task (kata kerja/objek)
  seedFormulaTemplate,
  // (exported for tests)
  _internals: { formatDate, toSheetDate, generateTaskId, rowToTask, taskToRow, findRowByTaskId, serialToDate, nowStamp,
    isManagerActor, canApproveDone, getDoneApprovers, getManagers, isDoneStatus,
    isLeaderActor, isStaffActor, isMagangActor, canManageUsers, roleOfActor,
    usersConfigured, invalidateUsers, setUsersFromRows, normalizeRole, ROLES,
    ownsTaskActor, isChecked, canCheckStep, genCollabId, parseCollabStep,
    canManageCollabActor, getCollabManagers },
};
