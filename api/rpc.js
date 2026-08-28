/**
 * ============================================================
 * /api/rpc — Serverless dispatcher (Vercel, Node.js)
 *
 * Frontend memanggil seperti google.script.run:
 *   POST /api/rpc
 *   body: { "action": "saveTask", "args": [ {..task..} ] }
 *
 * Setiap action dipetakan ke fungsi backend di ./_sheets.js,
 * dengan tanda tangan argumen identik dengan versi Apps Script.
 * ============================================================
 */

const backend = require('./_sheets'); // rpc dispatcher
const crypto = require('crypto');

// Sesi admin ringan (HMAC) untuk login Google: payload {email, exp} ditandatangani SESSION_SECRET.
// Tak bisa dipalsukan tanpa secret, dan otomatis kedaluwarsa.
function b64url(v){ return Buffer.from(v).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function signSession(email, secret, days) {
  const exp = Date.now() + ((days || 30) * 86400000);
  const p = b64url(JSON.stringify({ email: email, exp: exp }));
  const sig = b64url(crypto.createHmac('sha256', secret).update(p).digest());
  return p + '.' + sig;
}
function verifySession(token, secret) {
  if (!token || String(token).indexOf('.') < 0) return null;
  const parts = String(token).split('.');
  const p = parts[0], sig = parts[1];
  const expect = b64url(crypto.createHmac('sha256', secret).update(p).digest());
  if (sig !== expect) return null;
  try {
    const o = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!o || !o.exp || o.exp < Date.now()) return null;
    return o;
  } catch (e) { return null; }
}

// Whitelist action -> fungsi backend. Argumen diteruskan sesuai urutan
// pemanggilan google.script.run pada versi Apps Script.
const HANDLERS = {
  getBootstrapData: () => backend.getBootstrapData(),
  getTasks: () => backend.getTasks(),
  getOptions: () => backend.getOptions(),
  getActivityLog: (limit) => backend.getActivityLog(limit),
  getComments: (taskId) => backend.getComments(taskId),

  saveTask: (task) => backend.saveTask(task),
  deleteTask: (taskId, actor) => backend.deleteTask(taskId, actor),
  quickUpdateField: (taskId, field, value, actor) => backend.quickUpdateField(taskId, field, value, actor),
  quickUpdateDates: (taskId, startDate, dueDate, actor) => backend.quickUpdateDates(taskId, startDate, dueDate, actor),

  addComment: (payload) => backend.addComment(payload),
  getChecklist: (taskId) => backend.getChecklist(taskId),
  addChecklistItem: (taskId, item, actor, link) => backend.addChecklistItem(taskId, item, actor, link),
  setChecklistLink: (taskId, row, link, actor) => backend.setChecklistLink(taskId, row, link, actor),
  copyChecklist: (fromId, toIds, actor) => backend.copyChecklist(fromId, toIds, actor),
  setChecklistDone: (taskId, row, done, actor) => backend.setChecklistDone(taskId, row, done, actor),
  deleteChecklistItem: (taskId, row, actor) => backend.deleteChecklistItem(taskId, row, actor),

  getCollabs: () => backend.getCollabs(),
  saveCollab: (payload, actor) => backend.saveCollab(payload, actor),
  setCollabStepDone: (collabId, order, done, actor) => backend.setCollabStepDone(collabId, order, done, actor),
  setCollabStepNote: (collabId, order, note, actor) => backend.setCollabStepNote(collabId, order, note, actor),
  setCollabStepLink: (collabId, order, link, actor) => backend.setCollabStepLink(collabId, order, link, actor),
  setCollabType: (collabId, type, actor) => backend.setCollabType(collabId, type, actor),
  deleteCollab: (id, actor) => backend.deleteCollab(id, actor),
  savePackage: (collabId, payload, actor) => backend.savePackage(collabId, payload, actor),
  getNotifications: (user) => backend.getNotifications(user),
  markNotificationsRead: (user, refId) => backend.markNotificationsRead(user, refId),
  getUsers: () => backend.getUsers(),
  saveUser: (name, role, active, actor) => backend.saveUser(name, role, active, actor),
  deleteUser: (name, actor) => backend.deleteUser(name, actor),
  renameUser: (oldName, newName, actor) => backend.renameUser(oldName, newName, actor),
  saveOption: (type, value, parent) => backend.saveOption(type, value, parent),
  deleteOption: (type, value, parent) => backend.deleteOption(type, value, parent),
  editOption: (type, oldValue, newValue, parent) => backend.editOption(type, oldValue, newValue, parent),
  seedFormulaTemplate: () => backend.seedFormulaTemplate(),

  setupTaskTracker: () => backend.setupTaskTracker(),
  assignMissingTaskIds: () => backend.assignMissingTaskIds(),
  verifyPin: (user, pin) => backend.verifyPin(user, pin),
  setUserPin: (user, pin) => backend.setUserPin(user, pin),
  deleteUserPin: (user) => backend.deleteUserPin(user),
  listPinUsers: () => backend.listPinUsers(),
  addUserLink: (user, title, url, folder) => backend.addUserLink(user, title, url, folder),
  updateUserLink: (user, row, title, url, folder) => backend.updateUserLink(user, row, title, url, folder),
  deleteUserLink: (user, row) => backend.deleteUserLink(user, row),
  renameUserFolder: (user, oldFolder, newFolder) => backend.renameUserFolder(user, oldFolder, newFolder),
  deleteUserFolder: (user, folder) => backend.deleteUserFolder(user, folder),
  addDashboard: (title, desc, icon, url) => backend.addDashboard(title, desc, icon, url),
  updateDashboard: (row, title, desc, icon, url) => backend.updateDashboard(row, title, desc, icon, url),
  deleteDashboard: (row) => backend.deleteDashboard(row),
  addNote: (user, title, body, folder) => backend.addNote(user, title, body, folder),
  updateNote: (user, row, title, body, folder) => backend.updateNote(user, row, title, body, folder),
  deleteNote: (user, row) => backend.deleteNote(user, row),
  renameNoteFolder: (user, oldFolder, newFolder) => backend.renameNoteFolder(user, oldFolder, newFolder),
  deleteNoteFolder: (user, folder) => backend.deleteNoteFolder(user, folder),
};

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  // Fallback: baca stream mentah.
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'GET') {
    // Health check sederhana.
    return res.status(200).end(JSON.stringify({ ok: true, service: 'task-tracker-rpc' }));
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, GET');
    return res.status(405).end(JSON.stringify({ __error: true, message: 'Method not allowed' }));
  }

  let action, args, authProvided = '';
  try {
    const body = await readJsonBody(req);
    action = body.action;
    args = Array.isArray(body.args) ? body.args : [];
    authProvided = (req.headers['x-app-password'] || body._auth || '').toString();
  } catch (e) {
    return res.status(400).end(JSON.stringify({ __error: true, message: 'Body tidak valid.' }));
  }

  // Gerbang akses berlapis:
  //  - Login Google terverifikasi + email admin terdaftar -> akses PENUH tanpa PIN (aman, tak bisa dipalsukan).
  //  - PIN penuh (ACCESS_PIN)  -> akses PENUH (kelola task).
  //  - PIN lihat (VIEW_PIN)    -> mode LIHAT-SAJA (Lintas): baca terbatas + chat, tak bisa tulis.
  //  - selain itu              -> DIBLOKIR total (tak ada data sama sekali).
  // Gerbang aktif bila ada PIN atau Google dikonfigurasi; kalau semua kosong, app terbuka (anti-terkunci).
  const FULL_PIN = (process.env.ACCESS_PIN || process.env.APP_PASSWORD || '').trim();
  const VIEW_PIN = (process.env.VIEW_PIN || '').trim();
  const DEFAULT_ALLOW = ['administrator@officecerebrum.com', 'nyndaramadhanti@cerebrum.id'];
  const envAllow = (process.env.AUTHORIZED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const ALLOW_EMAILS = envAllow.length ? envAllow : DEFAULT_ALLOW;
  const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const SESSION_SECRET = (process.env.SESSION_SECRET || '').trim();
  const googleOn = !!(GOOGLE_CLIENT_ID && SESSION_SECRET);
  // Email admin HANYA dipercaya dari sesi terverifikasi (hasil login Google), bukan header mentah yang bisa dipalsukan.
  const sess = (googleOn && req.headers['x-session']) ? verifySession(req.headers['x-session'], SESSION_SECRET) : null;
  const sessionEmail = sess ? String(sess.email || '').toLowerCase() : '';

  // Konfigurasi publik untuk frontend: apakah tombol Google ditampilkan + client id-nya.
  if (action === 'getConfig') {
    return res.status(200).end(JSON.stringify({ googleEnabled: googleOn, googleClientId: GOOGLE_CLIENT_ID }));
  }
  // Verifikasi kredensial Google -> terbitkan sesi admin bila email diizinkan.
  if (action === 'verifyGoogle') {
    if (!googleOn) return res.status(200).end(JSON.stringify({ success: false, message: 'Login Google belum dikonfigurasi.' }));
    try {
      const idToken = (args && args[0]) ? String(args[0]) : '';
      const { google } = require('googleapis');
      const gclient = new google.auth.OAuth2(GOOGLE_CLIENT_ID);
      const ticket = await gclient.verifyIdToken({ idToken: idToken, audience: GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload() || {};
      const email = String(payload.email || '').toLowerCase();
      const verified = (payload.email_verified === true || payload.email_verified === 'true');
      if (verified && email && ALLOW_EMAILS.includes(email)) {
        return res.status(200).end(JSON.stringify({ success: true, level: 'full', email: email, session: signSession(email, SESSION_SECRET) }));
      }
      return res.status(200).end(JSON.stringify({ success: false, level: 'none', email: email, message: 'Email ini tidak diizinkan sebagai admin.' }));
    } catch (e) {
      return res.status(200).end(JSON.stringify({ success: false, message: 'Verifikasi Google gagal. Coba lagi.' }));
    }
  }

  // PIN khusus anak magang: level terbatas. Datanya DISARING DI SERVER — bukan sekadar
  // disembunyikan di browser — sehingga task karyawan tak pernah sampai ke perangkat mereka.
  const MAGANG_PIN = (process.env.MAGANG_PIN || '').trim();

  const gateOn = !!(FULL_PIN || VIEW_PIN || MAGANG_PIN || googleOn);
  let level;
  if (!gateOn) level = 'full';
  else if ((FULL_PIN && authProvided === FULL_PIN) || (sessionEmail && ALLOW_EMAILS.includes(sessionEmail))) level = 'full';
  else if (MAGANG_PIN && authProvided === MAGANG_PIN) level = 'magang';
  else if (VIEW_PIN && authProvided === VIEW_PIN) level = 'view';
  else level = 'none';

  // Action yang boleh diakses di level "view" (lihat-saja): baca terbatas + chat.
  const GUEST_ACTIONS = { getBootstrapData: 1, getComments: 1, addComment: 1 };
  // Level "magang" boleh bekerja seperti biasa, TAPI tidak boleh menyentuh hal administratif.
  const MAGANG_DENY = {
    saveUser: 1, deleteUser: 1, renameUser: 1, setUserPin: 1, deleteUserPin: 1, listPinUsers: 1,
    setupTaskTracker: 1, assignMissingTaskIds: 1, seedFormulaTemplate: 1,
    saveOption: 1, deleteOption: 1, editOption: 1,
    addDashboard: 1, updateDashboard: 1, deleteDashboard: 1,
    deleteTask: 1, deleteCollab: 1, saveCollab: 1, setCollabType: 1, savePackage: 1,
  };

  // Identitas yang diklaim browser. TIDAK dipercaya untuk menaikkan hak — hanya dipakai
  // mempersempit data, dan backend memastikan namanya memang ber-peran Magang.
  const claimedUser = String(req.headers['x-user'] || '').slice(0, 60);

  if (action === 'login') {
    return res.status(200).end(JSON.stringify({ success: level !== 'none', level: level, gateOn: gateOn, message: level === 'none' ? 'PIN salah.' : 'Berhasil.' }));
  }
  if (level === 'none') {
    return res.status(401).end(JSON.stringify({ __error: true, code: 'AUTH', message: 'Perlu PIN.' }));
  }
  if (level === 'view' && !GUEST_ACTIONS[action]) {
    return res.status(401).end(JSON.stringify({ __error: true, code: 'AUTH', message: 'Perlu PIN akses penuh.' }));
  }
  if (level === 'magang' && MAGANG_DENY[action]) {
    return res.status(401).end(JSON.stringify({ __error: true, code: 'AUTH', message: 'Aksi ini hanya untuk karyawan.' }));
  }

  const handler = HANDLERS[action];
  if (!handler) {
    return res.status(400).end(JSON.stringify({ __error: true, message: 'Action tidak dikenal: ' + action }));
  }

  // Instance serverless dipakai ulang saat masih hangat. Buang cache daftar user tiap
  // request supaya perubahan peran langsung berlaku, bukan menunggu cold start.
  try { backend.invalidateUsers(); } catch (e) { /* versi lama tanpa fungsi ini */ }

  try {
    // Tamu (tanpa PIN) hanya menerima data terbatas dari bootstrap.
    // Level magang: server memangkas datanya sebelum dikirim.
    const result = (action === 'getBootstrapData')
      ? await backend.getBootstrapData({ viewOnly: level === 'view', magangOnly: level === 'magang', asUser: claimedUser })
      : await handler(...args);
    // Hasil bisa berupa objek {success,...}, array, atau primitif.
    return res.status(200).end(JSON.stringify(result === undefined ? null : result));
  } catch (err) {
    // Error tak terduga -> 500, frontend akan memanggil withFailureHandler.
    console.error(`[rpc] action=${action} error:`, err && err.stack ? err.stack : err);
    const message = (err && err.message) ? err.message : 'Terjadi kesalahan di server.';
    return res.status(500).end(JSON.stringify({ __error: true, message }));
  }
};
