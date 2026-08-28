/**
 * ============================================================
 * PRODUCTTRACK — TASK TRACKER
 * Backend Google Apps Script (bound ke Spreadsheet)
 *
 * Versi ini 100% berjalan di dalam Google:
 *   Spreadsheet = database, Apps Script = server, Web App = aplikasi.
 * Tidak perlu hosting, service account, atau kartu kredit.
 *
 * Database utama:
 *   Sheet  : Main
 *   Header : baris 3, mulai kolom B  (B3:V3)
 *   Data   : mulai baris 4
 *
 * Sheet pendukung (header di baris 1):
 *   OPTIONS, COMMENTS, ACTIVITY, CHECKLIST, COLLAB, COLLAB_STEPS,
 *   NOTIFICATIONS, AUTH, LINKS, DASHBOARDS, NOTES
 *
 * Fungsi berakhiran "_" bersifat privat (tidak bisa dipanggil dari browser).
 * ============================================================
 */

/* ================================================================== */
/* KONFIGURASI                                                        */
/* ================================================================== */

// Semua nilai di bawah bisa ditimpa lewat Project Settings > Script Properties.
var _props = null;
function prop_(key, dflt) {
  if (_props === null) {
    try { _props = PropertiesService.getScriptProperties().getProperties() || {}; }
    catch (e) { _props = {}; }
  }
  var v = _props[key];
  return (v === undefined || v === null || String(v).trim() === '') ? dflt : String(v).trim();
}

var CONFIG = {
  TASK_SHEET: prop_('MAIN_SHEET_NAME', 'Main'),
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
  NOTIF_SHEET: 'NOTIFICATIONS',
  USERS_SHEET: 'USERS',
  HEADER_ROW: 3,
  FIRST_DATA_ROW: 4,
  FIRST_COL_LETTER: 'B',
  LAST_COL_LETTER: 'W'
};

var TASK_HEADERS = [
  'Task ID', 'Created Date', 'Due Date', 'Status', 'Priority',
  'Task Name', 'Stage', 'Platform', 'PIC', 'Support', 'Document',
  'PIC Notes', 'PM Notes', 'Divisi Tujuan', 'Kontak Divisi', 'Kata Kerja',
  'Jumlah', 'Objek', 'Detail', 'Dibuat Oleh', 'Lintas View', 'Status By'
];

// Pemetaan field -> kolom (B..V). Urutan tetap.
var COL = {
  taskId: 'B', createdDate: 'C', dueDate: 'D', status: 'E',
  priority: 'F', taskName: 'G', stage: 'H', platform: 'I', pic: 'J',
  support: 'K', document: 'L', picNotes: 'M', pmNotes: 'N',
  divisiTujuan: 'O', kontakDivisi: 'P', verb: 'Q', jumlah: 'R',
  objek: 'S', detail: 'T', createdBy: 'U', mirror: 'V', statusBy: 'W'
};

var OPTION_TYPES = ['status', 'priority', 'stage', 'platform', 'pic', 'support', 'division', 'verb', 'object'];

var DEFAULT_OPTIONS = {
  status: ['Todo', 'In progress', 'Review PM', 'Revisi', 'Hold', 'Done'],
  priority: ['Urgent', 'High', 'Normal', 'Low'],
  stage: [
    'RnD', 'Develop Materi', 'Develop Soal', 'QC Konten', 'Input',
    'Liveclass', 'Report', 'Data & Intelligence', 'Manajemen Sistem', 'Manajemen Guru'
  ],
  platform: [
    'All Platform', 'Cerebrum', 'JadiASN', 'JadiPPPK', 'JadiBUMN', 'JadiSekdin',
    'JadiBeasiswa', 'JadiOJK', 'JadiPCPM', 'JadiPrajurit', 'JadiPolisi',
    'Jago TPA', 'Siadu', 'Markaz', 'Toefl Academy', 'IT', 'Marketing', 'Sales'
  ],
  pic: ['Manager', 'Staff Soal', 'Leader Konten', 'Staff Input', 'Leader Sistem', 'Staff Data', 'Staff Materi', 'Staff QC', 'Staff Liveclass', 'Magang Konten', 'Magang Data', 'Lintas Divisi'],
  support: ['Manager', 'Staff Soal', 'Leader Konten', 'Staff Input', 'Leader Sistem', 'Staff Data', 'Staff Materi', 'Staff QC', 'Staff Liveclass', 'Magang Konten', 'Magang Data', 'Lintas Divisi'],
  division: ['IT', 'Marketing', 'Sales']
};

// Validasi dropdown di dalam Spreadsheet (header -> tipe opsi).
var VALIDATION_MAP = {
  Status: 'status', Priority: 'priority', Stage: 'stage',
  Platform: 'platform', PIC: 'pic', Support: 'support',
  'Divisi Tujuan': 'division'
};

// Header standar tiap sheet pendukung — dipakai saat sheet dibuat otomatis.
var SHEET_HEADERS = {};
SHEET_HEADERS[CONFIG.OPTIONS_SHEET] = ['Type', 'Value', 'Active', 'Parent'];
SHEET_HEADERS[CONFIG.COMMENTS_SHEET] = ['Timestamp', 'Task ID', 'Author', 'Message'];
SHEET_HEADERS[CONFIG.ACTIVITY_SHEET] = ['Timestamp', 'User', 'Action', 'Task ID', 'Detail'];
SHEET_HEADERS[CONFIG.AUTH_SHEET] = ['User', 'PinHash'];
SHEET_HEADERS[CONFIG.LINKS_SHEET] = ['User', 'Title', 'URL', 'Folder'];
SHEET_HEADERS[CONFIG.DASHBOARDS_SHEET] = ['Title', 'Desc', 'Icon', 'URL'];
SHEET_HEADERS[CONFIG.NOTES_SHEET] = ['User', 'Title', 'Body', 'UpdatedAt', 'Folder'];
SHEET_HEADERS[CONFIG.CHECKLIST_SHEET] = ['Task ID', 'Item', 'Done', 'Created By', 'Checked By', 'Checked At', 'Link'];
SHEET_HEADERS[CONFIG.COLLAB_SHEET] = ['Collab ID', 'Platform', 'Title', 'Description', 'Created By', 'Created At', 'Deadline', 'Type', 'Color'];
SHEET_HEADERS[CONFIG.COLLAB_STEP_SHEET] = ['Collab ID', 'Order', 'Step', 'PIC', 'Deadline', 'Done', 'Done By', 'Done At', 'Note', 'Stage', 'Link'];
SHEET_HEADERS[CONFIG.PACKAGE_SHEET] = ['Collab ID', 'Marsel PIC', 'Program', 'Nama Paket', 'Tagline', 'Benefit', 'Tanggal', 'Tujuan', 'Produk PIC', 'Dibimbing', 'Latsol', 'Materi', 'Tryout', 'Drilling', 'Live Class', 'Catatan', 'Updated By', 'Updated At'];
SHEET_HEADERS[CONFIG.PACKAGE_VARIANT_SHEET] = ['Collab ID', 'Order', 'Masa Aktif', 'Harga Awal', 'Harga Diskon', 'Status'];
SHEET_HEADERS[CONFIG.PACKAGE_ITEM_SHEET] = ['Collab ID', 'Order', 'Kategori', 'Grup', 'Nama', 'Jumlah', 'Satuan', 'Step Order', 'Status'];
SHEET_HEADERS[CONFIG.NOTIF_SHEET] = ['ID', 'For User', 'Type', 'Ref ID', 'From', 'Text', 'Created At', 'Read'];
SHEET_HEADERS[CONFIG.USERS_SHEET] = ['Nama', 'Peran', 'Aktif'];

/* ------------------------------------------------------------------ */
/* PERAN PENGGUNA                                                      */
/*                                                                     */
/*  Dev     — super user. SATU-SATUNYA yang boleh menambah user &      */
/*            menetapkan peran. Sengaja disembunyikan dari pemilih.    */
/*  Manager — lihat semua task, set Done, setup kolaborasi, kelola     */
/*            task lintas divisi & dropdown. TIDAK kelola user.        */
/*  Leader  — lihat semua task, set Done, setup kolaborasi.            */
/*            TIDAK bisa kelola user maupun task lintas divisi.        */
/*  Staff   — task miliknya + SEMUA task anak magang (membimbing).     */
/*            Boleh menutup (Done) task milik magang, tapi task-nya    */
/*            sendiri maksimal "Review PM".                            */
/*  Magang  — HANYA task sesama magang (termasuk miliknya sendiri).    */
/*            Tidak melihat pekerjaan karyawan. Maksimal "Review PM".  */
/*  Lihat Saja — akses baca terbatas (task lintas divisi saja).        */
/* ------------------------------------------------------------------ */
var ROLES = ['Dev', 'Manager', 'Leader', 'Staff', 'Magang', 'Lihat Saja'];
var ROLE_DEFAULT = 'Staff';

/* ================================================================== */
/* PERAN & HAK AKSES                                                  */
/* ================================================================== */

function csvProp_(key, dflt) {
  return prop_(key, dflt).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

// Nama tanpa suffix "(...)" -> lowercase, untuk perbandingan yang toleran.
function baseName_(s) {
  return String(s || '').replace(/\s*\(.*?\)\s*$/, '').trim().toLowerCase();
}

/* ---- Daftar user & peran (sumber utama: sheet USERS) ---- */

// Memo per-eksekusi: pemeriksaan peran dipanggil berkali-kali dalam satu request.
var _usersCache = null;
function usersRaw_() {
  if (_usersCache) return _usersCache;
  var rows = [];
  try { rows = valuesGet_(CONFIG.USERS_SHEET + '!A2:C'); } catch (e) { rows = []; }
  _usersCache = rows
    .map(function (r, i) {
      return {
        row: i + 2,
        name: String((r && r[0]) || '').trim(),
        role: String((r && r[1]) || '').trim() || ROLE_DEFAULT,
        active: (r && r[2] === '') ? true : !(r && String(r[2]).toLowerCase() === 'false')
      };
    })
    .filter(function (u) { return u.name; });
  return _usersCache;
}
function invalidateUsers_() { _usersCache = null; }

// Peran seseorang. '' bila belum terdaftar di sheet USERS.
function roleOfActor_(name) {
  var n = baseName_(name);
  if (!n) return '';
  if (n === 'dev') return 'Dev';
  var list = usersRaw_();
  for (var i = 0; i < list.length; i++) {
    if (baseName_(list[i].name) === n) return list[i].active ? list[i].role : 'Nonaktif';
  }
  return '';
}
function hasRole_(name, role) { return String(roleOfActor_(name)).toLowerCase() === role; }

// Fallback ke Script Properties dipakai HANYA bila sheet USERS masih kosong,
// supaya instalasi lama (yang mengatur peran lewat properties) tetap jalan.
function usersConfigured_() { return usersRaw_().length > 0; }

function getManagers_() {
  if (usersConfigured_()) {
    return usersRaw_().filter(function (u) { return u.active && String(u.role).toLowerCase() === 'manager'; })
      .map(function (u) { return u.name; });
  }
  return csvProp_('MANAGERS', 'Manager');
}

// Manager penuh = peran Manager + akun Dev (super-user untuk testing).
function isManagerActor_(name) {
  var n = baseName_(name);
  if (!n) return false;
  if (n === 'dev') return true;
  if (usersConfigured_()) return hasRole_(name, 'manager');
  return csvProp_('MANAGERS', 'Manager').some(function (m) { return baseName_(m) === n; });
}

// Leader: hak menengah — lihat semua task, set Done, setup kolaborasi.
function isLeaderActor_(name) {
  if (!baseName_(name)) return false;
  if (usersConfigured_()) return hasRole_(name, 'leader');
  return csvProp_('DONE_APPROVERS', '').some(function (a) { return baseName_(a) === baseName_(name); });
}

// Anak magang: peran paling terbatas, dan pekerjaannya dibimbing karyawan.
// "Nama • 2026-08-11 10:00". Berawalan nama, jadi Sheets tak mengubahnya jadi nilai tanggal.
function statusByStamp_(actor) { return (String(actor || '').trim() || 'Unknown') + ' • ' + nowStamp_(); }
/* PIC boleh berupa PERAN, ditulis "@Magang" — task milik BERSAMA semua yang berperan itu.
   Awalan "@" dipakai supaya tak pernah bentrok dengan orang yang kebetulan bernama "Magang". */
function rolePicOf_(pic) {
  var t = String(pic || '').trim();
  if (t.charAt(0) !== '@') return '';
  var r = normalizeRole_(t.slice(1));
  return (r && r.toLowerCase() !== 'dev') ? r : '';
}
function isMagangActor_(name) {
  if (rolePicOf_(name).toLowerCase() === 'magang') return true;   // task milik bersama anak magang
  if (!baseName_(name)) return false;
  return usersConfigured_() && hasRole_(name, 'magang');
}
function isStaffActor_(name) {
  if (!baseName_(name)) return false;
  return usersConfigured_() && hasRole_(name, 'staff');
}

function isDoneStatus_(v) { return String(v || '').trim().toLowerCase() === 'done'; }

// Siapa yang boleh MENETAPKAN status "Done" secara umum: Manager, Leader, dan Dev.
function getDoneApprovers_() {
  if (usersConfigured_()) {
    return usersRaw_().filter(function (u) {
      var r = String(u.role).toLowerCase();
      return u.active && (r === 'manager' || r === 'leader');
    }).map(function (u) { return u.name; });
  }
  return csvProp_('DONE_APPROVERS', 'Manager');
}

// Boleh menutup task ke "Done"?  Bergantung pada SIAPA PIC task itu:
//  - Manager / Leader / Dev  -> task siapa pun.
//  - Staff                   -> hanya task milik anak MAGANG (ia yang membimbing).
//  - Magang                  -> tidak pernah (maksimal "Review PM").
// taskPic boleh dikosongkan untuk pertanyaan umum "orang ini bisa Done sama sekali?".
// Apakah `name` terdaftar sebagai Support pada task ini?
function isSupportOf_(taskSupport, name) {
  var n = baseName_(name);
  if (!n) return false;
  var list = (Object.prototype.toString.call(taskSupport) === '[object Array]')
    ? taskSupport : String(taskSupport || '').split(',');
  return list.map(function (s) { return baseName_(s); }).filter(Boolean).indexOf(n) >= 0;
}
function canApproveDone_(name, taskPic, taskSupport) {
  if (!baseName_(name)) return false;
  if (isManagerActor_(name)) return true;
  if (usersConfigured_()) {
    if (isLeaderActor_(name)) return true;
    if (isMagangActor_(name)) return false;
    if (isStaffActor_(name)) {
      if (taskPic === undefined || taskPic === null || taskPic === '') return true;  // pertanyaan umum
      // Task karyawan (termasuk miliknya sendiri): paling jauh Review PM.
      if (!isMagangActor_(taskPic)) return false;
      // Task anak magang: hanya karyawan yang MENDAMPINGI di task itu (Support) yang
      // boleh menutupnya — bukan sembarang Staff yang tak terlibat.
      return isSupportOf_(taskSupport, name);
    }
    return false;
  }
  var n = baseName_(name);
  return getDoneApprovers_().some(function (a) { return baseName_(a) === n; });
}

// Siapa yang boleh MENYUSUN Task Kolaborasi: Manager, Leader, dan Dev.
function getCollabManagers_() {
  if (usersConfigured_()) return getDoneApprovers_();
  return csvProp_('COLLAB_MANAGERS', 'Manager');
}
function canManageCollabActor_(name) {
  if (!baseName_(name)) return false;
  if (isManagerActor_(name)) return true;
  if (usersConfigured_()) return isLeaderActor_(name);
  var n = baseName_(name);
  return getCollabManagers_().some(function (a) { return baseName_(a) === n; });
}

// Boleh menambah/mengubah/menghapus user & peran: HANYA Dev.
// Disengaja satu pintu: penambahan anggota baru (mis. anak magang) dan pemberian hak
// tidak boleh bisa dilakukan Manager — supaya tak ada yang bisa menaikkan hak sendiri
// atau menambah akses tanpa sepengetahuan pemilik sistem.
function canManageUsers_(name) { return baseName_(name) === 'dev'; }
function usersDeniedMessage_() {
  return 'Hanya mode Dev yang bisa mengelola user & peran. Masuk lewat tekan-tahan logo ProductTrack, atau ubah langsung di sheet USERS.';
}

function doneDeniedMessage_(taskPic) {
  var who = getDoneApprovers_();
  var siapa = who.length ? who.join(', ') : 'Manager/Leader';
  if (taskPic && isMagangActor_(taskPic)) {
    return 'Task anak magang hanya bisa ditutup ("Done") oleh karyawan — Staff, Leader, atau Manager. Magang sendiri maksimal "Review PM".';
  }
  return 'Hanya ' + siapa + ' yang bisa menandai task sebagai "Done". Set ke "Review PM" agar diteruskan.';
}

/* ---- CRUD user (dipanggil dari tab Pengaturan) ---- */

function ensureUsersSheet_() {
  sheet_(CONFIG.USERS_SHEET, true);
  var head = valuesGet_(CONFIG.USERS_SHEET + '!A1:C1');
  if (!head.length || !head[0] || !head[0][0]) {
    valuesUpdate_(CONFIG.USERS_SHEET + '!A1:C1', [SHEET_HEADERS[CONFIG.USERS_SHEET]]);
  }
}

function getUsers() {
  return usersRaw_().map(function (u) { return { row: u.row, name: u.name, role: u.role, active: u.active }; });
}

function normalizeRole_(role) {
  var r = String(role || '').trim().toLowerCase();
  for (var i = 0; i < ROLES.length; i++) if (ROLES[i].toLowerCase() === r) return ROLES[i];
  return '';
}

// Tambah user baru / ubah peran & status aktifnya.
// Nama user sekaligus didaftarkan ke dropdown PIC & Support agar bisa langsung dipakai.
function saveUser(name, role, active, actor) {
  actor = String(actor || '').trim() || 'Unknown';
  name = String(name || '').trim();
  if (!canManageUsers_(actor)) return { success: false, message: usersDeniedMessage_() };
  if (!name) return { success: false, message: 'Nama user tidak boleh kosong.' };
  if (name.length > 40) return { success: false, message: 'Nama user terlalu panjang (maks 40 karakter).' };
  if (baseName_(name) === 'dev') return { success: false, message: '"Dev" adalah nama khusus mode Dev dan tidak bisa dipakai sebagai user.' };

  var wanted = normalizeRole_(role);
  if (!wanted) return { success: false, message: 'Peran tidak valid. Pilih: ' + ROLES.join(', ') + '.' };

  ensureUsersSheet_();
  var isActive = (active === undefined || active === null) ? true : !!active;
  var list = usersRaw_();
  var found = null;
  for (var i = 0; i < list.length; i++) if (baseName_(list[i].name) === baseName_(name)) { found = list[i]; break; }

  if (found) valuesUpdate_(CONFIG.USERS_SHEET + '!A' + found.row + ':C' + found.row, [[name, wanted, isActive ? 'TRUE' : 'FALSE']]);
  else valuesAppend_(CONFIG.USERS_SHEET + '!A:C', [[name, wanted, isActive ? 'TRUE' : 'FALSE']]);
  invalidateUsers_();

  // Daftarkan ke dropdown PIC & Support (abaikan untuk peran Lihat Saja).
  if (wanted.toLowerCase() !== 'lihat saja') {
    try { saveOption('pic', name, ''); saveOption('support', name, ''); } catch (e) { /* opsi tak wajib */ }
  }
  logActivity_(actor, found ? 'User Update' : 'User Add', '', name + ' → ' + wanted + (isActive ? '' : ' (nonaktif)'));
  return {
    success: true,
    message: found ? ('Peran ' + name + ' diperbarui jadi ' + wanted + '.') : (name + ' ditambahkan sebagai ' + wanted + '.'),
    users: getUsers(), options: getOptions()
  };
}

// Peran "karyawan tetap" — sengaja tidak bisa dihapus. Nama mereka melekat di task lama,
// jadi mencabutnya dari dropdown PIC akan meninggalkan task yang PIC-nya tak bisa dipilih
// lagi. Untuk yang keluar, pakai Nonaktif: haknya dicabut, riwayatnya utuh.
var PERMANENT_ROLES = ['Manager', 'Leader', 'Staff'];
function isPermanentRole_(role) {
  var r = String(role || '').trim().toLowerCase();
  for (var i = 0; i < PERMANENT_ROLES.length; i++) if (PERMANENT_ROLES[i].toLowerCase() === r) return true;
  return false;
}

/* Ganti nama user (mis. salah ketik). Nama dipakai sebagai KUNCI di banyak tempat, jadi
   mengganti baris USERS saja akan membuat task, proses kolaborasi, link, dan catatan orang
   itu jadi yatim. Karena itu semua rujukan ikut diperbarui dalam satu operasi. */
function renameUser(oldName, newName, actor) {
  actor = String(actor || '').trim() || 'Unknown';
  oldName = String(oldName || '').trim();
  newName = String(newName || '').trim();
  if (!canManageUsers_(actor)) return { success: false, message: usersDeniedMessage_() };
  if (!oldName || !newName) return { success: false, message: 'Nama lama & baru wajib diisi.' };
  if (newName.length > 40) return { success: false, message: 'Nama baru terlalu panjang (maks 40 karakter).' };
  if (baseName_(oldName) === 'dev' || baseName_(newName) === 'dev') {
    return { success: false, message: '"Dev" adalah nama khusus mode Dev dan tidak bisa dipakai.' };
  }
  if (oldName === newName) return { success: false, message: 'Nama barunya sama dengan yang lama.' };

  var list = usersRaw_(), found = null, bentrok = null;
  list.forEach(function (u) {
    if (baseName_(u.name) === baseName_(oldName)) found = u;
    else if (baseName_(u.name) === baseName_(newName)) bentrok = u;
  });
  if (!found) return { success: false, message: 'User "' + oldName + '" tidak ditemukan.' };
  if (bentrok) return { success: false, message: 'Sudah ada user bernama "' + bentrok.name + '".' };

  var cocok = function (v) { return baseName_(v) === baseName_(oldName); };
  var tersentuh = 0;

  valuesUpdate_(CONFIG.USERS_SHEET + '!A' + found.row, [[newName]]);
  invalidateUsers_();

  // Task: kolom PIC & Support (Support daftar dipisah koma).
  try {
    var rows = valuesGet_(mainDataRange_());
    rows.forEach(function (r, i) {
      var rn = CONFIG.FIRST_DATA_ROW + i;
      if (cocok((r || [])[8])) { valuesUpdate_(CONFIG.TASK_SHEET + '!' + COL.pic + rn, [[newName]]); tersentuh++; }
      var sup = String((r || [])[9] || '');
      if (sup && sup.split(',').some(cocok)) {
        var baru = sup.split(',').map(function (s) { return cocok(s) ? newName : String(s).trim(); })
          .filter(Boolean).join(', ');
        valuesUpdate_(CONFIG.TASK_SHEET + '!' + COL.support + rn, [[baru]]);
        tersentuh++;
      }
    });
  } catch (e) { /* jangan gagalkan penggantian nama karena satu sheet tak terbaca */ }

  // Sheet lain yang memakai nama sebagai kunci.
  [[CONFIG.COLLAB_STEP_SHEET, 'D', 3], [CONFIG.LINKS_SHEET, 'A', 0], [CONFIG.NOTES_SHEET, 'A', 0],
   [CONFIG.AUTH_SHEET, 'A', 0], [CONFIG.NOTIF_SHEET, 'B', 1]].forEach(function (t) {
    try {
      var rows2 = valuesGet_(t[0] + '!A2:' + t[1]);
      rows2.forEach(function (r, i) {
        if (cocok((r || [])[t[2]])) { valuesUpdate_(t[0] + '!' + t[1] + (i + 2), [[newName]]); tersentuh++; }
      });
    } catch (e) { /* sheet opsional */ }
  });

  // Dropdown PIC & Support ikut diganti supaya nama lama tak bisa dipilih lagi.
  var options = null;
  try {
    deleteOption('pic', oldName, '');
    deleteOption('support', oldName, '');
    saveOption('pic', newName, '');
    options = saveOption('support', newName, '').options;
  } catch (e) { /* opsi tak wajib */ }

  logActivity_(actor, 'User Rename', '', oldName + ' → ' + newName + ' (' + tersentuh + ' rujukan ikut diperbarui)');
  return {
    success: true,
    message: '"' + oldName + '" diganti jadi "' + newName + '". ' + tersentuh + ' rujukan ikut diperbarui.',
    renamed: tersentuh,
    users: getUsers(),
    options: options || getOptions()
  };
}

function deleteUser(name, actor) {
  actor = String(actor || '').trim() || 'Unknown';
  name = String(name || '').trim();
  if (!canManageUsers_(actor)) return { success: false, message: usersDeniedMessage_() };
  if (!name) return { success: false, message: 'Nama user tidak boleh kosong.' };
  if (baseName_(name) === 'dev') return { success: false, message: '"Dev" adalah mode khusus dan tidak bisa dihapus.' };
  if (baseName_(name) === baseName_(actor)) return { success: false, message: 'Tidak bisa menghapus diri sendiri.' };
  var list = usersRaw_();
  var found = null;
  for (var i = 0; i < list.length; i++) if (baseName_(list[i].name) === baseName_(name)) { found = list[i]; break; }
  // Karyawan tetap yang masih aktif dikunci; nonaktifkan dulu. Pengaman dua langkah ini
  // mencegah penghapusan tak sengaja tapi tetap memberi jalan untuk akun duplikat.
  if (found && isPermanentRole_(found.role) && found.active !== false) {
    return { success: false, message: name + ' berperan ' + found.role + ' dan masih aktif. Nonaktifkan dulu lewat tombol Aktif/Nonaktif, baru bisa dihapus.' };
  }

  // Nama bisa saja cuma nyangkut di dropdown tanpa baris USERS; itu tetap sah dihapus.
  var inOptions = false;
  try {
    var raw = readOptionsRaw_();
    for (var j = 0; j < raw.length; j++) {
      if (raw[j].active && (raw[j].type === 'pic' || raw[j].type === 'support') && baseName_(raw[j].value) === baseName_(name)) { inOptions = true; break; }
    }
  } catch (e) { /* opsi tak terbaca: jangan halangi penghapusan baris USERS */ }
  if (!found && !inOptions) return { success: false, message: 'User tidak ditemukan.' };

  if (found) { deleteRows_(CONFIG.USERS_SHEET, [found.row]); invalidateUsers_(); }

  // Cabut juga dari dropdown PIC & Support supaya benar-benar tak bisa dipilih lagi.
  var options = null;
  try { deleteOption('pic', name, ''); options = deleteOption('support', name, '').options; }
  catch (e) { /* dropdown gagal dicabut bukan alasan membatalkan penghapusan */ }

  logActivity_(actor, 'User Delete', '', name);
  // PIN user ikut dihapus supaya tidak menggantung.
  try { deleteUserPin(name); } catch (e) { /* abaikan */ }
  return {
    success: true,
    message: name + ' dihapus dari daftar user dan dropdown PIC & Support.',
    users: getUsers(),
    options: options || getOptions(),
  };
}

/* ================================================================== */
/* AKSES SPREADSHEET (pengganti Google Sheets API)                    */
/* ================================================================== */

var _ss = null;
function ss_() {
  if (_ss) return _ss;
  var id = prop_('SPREADSHEET_ID', '');
  _ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!_ss) throw new Error('Spreadsheet tidak ditemukan. Isi Script Property SPREADSHEET_ID, atau pasang script ini di dalam spreadsheet.');
  return _ss;
}

// Ambil sheet; create=true -> dibuat bila belum ada (sekalian ditulis headernya).
function sheet_(name, create) {
  var sh = ss_().getSheetByName(name);
  if (sh || !create) return sh;
  sh = ss_().insertSheet(name);
  var head = SHEET_HEADERS[name];
  if (head) {
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function colToIdx_(letter) {
  var n = 0, s = String(letter || '').toUpperCase();
  for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n - 1; // 0-based
}

// Parse A1 notation "Sheet!B4:V" / "Sheet!E5" / "Sheet!A:D".
function a1Parse_(a1) {
  var s = String(a1 || '');
  var bang = s.lastIndexOf('!');
  if (bang < 0) return null;
  var name = s.substring(0, bang).replace(/^'/, '').replace(/'$/, '').replace(/''/g, "'");
  var ref = s.substring(bang + 1).toUpperCase();
  var m = ref.match(/^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/);
  if (!m) return null;
  return { sheet: name, c1: m[1], r1: m[2], c2: (m[3] || m[1]), r2: (m[3] ? m[4] : m[2]) };
}

// Buang baris kosong di ekor, meniru perilaku Sheets API (yang tak mengembalikan sisa baris kosong).
function trimTrailing_(vals) {
  var end = vals.length;
  while (end > 0) {
    var row = vals[end - 1], empty = true;
    for (var i = 0; i < row.length; i++) {
      var v = row[i];
      if (v !== '' && v !== null && v !== undefined) { empty = false; break; }
    }
    if (!empty) break;
    end--;
  }
  return end === vals.length ? vals : vals.slice(0, end);
}

// Baca range. opts.display=true -> nilai tampilan (string) alih-alih nilai mentah.
function valuesGet_(a1, opts) {
  var p = a1Parse_(a1);
  if (!p) return [];
  var sh = sheet_(p.sheet, false);
  if (!sh) return [];
  var maxRows = sh.getMaxRows(), maxCols = sh.getMaxColumns();
  var lastRow = sh.getLastRow();
  var c1 = colToIdx_(p.c1) + 1;
  var c2 = colToIdx_(p.c2) + 1;
  var r1 = p.r1 ? Number(p.r1) : 1;
  var r2 = p.r2 ? Number(p.r2) : lastRow;
  if (c1 > maxCols || r1 > maxRows) return [];
  if (!r2 || r2 < r1) return [];
  r2 = Math.min(r2, maxRows);
  c2 = Math.min(Math.max(c2, c1), maxCols);
  var rng = sh.getRange(r1, c1, r2 - r1 + 1, c2 - c1 + 1);
  return trimTrailing_((opts && opts.display) ? rng.getDisplayValues() : rng.getValues());
}

function ensureCapacity_(sh, lastRowNeeded, lastColNeeded) {
  var mr = sh.getMaxRows();
  if (lastRowNeeded > mr) sh.insertRowsAfter(mr, lastRowNeeded - mr);
  var mc = sh.getMaxColumns();
  if (lastColNeeded > mc) sh.insertColumnsAfter(mc, lastColNeeded - mc);
}

// Samakan panjang tiap baris (setValues wajib persegi).
function rectangle_(values) {
  var numCols = 0;
  values.forEach(function (r) { numCols = Math.max(numCols, (r || []).length); });
  if (!numCols) return null;
  return {
    cols: numCols,
    rows: values.map(function (r) {
      var o = (r || []).slice();
      while (o.length < numCols) o.push('');
      return o;
    })
  };
}

// Tulis nilai. String yang berbentuk tanggal akan diparse Sheets seperti diketik manual
// (setara valueInputOption USER_ENTERED pada versi API).
function valuesUpdate_(a1, values) {
  var p = a1Parse_(a1);
  if (!p || !values || !values.length) return;
  var rect = rectangle_(values);
  if (!rect) return;
  var sh = sheet_(p.sheet, true);
  var c1 = colToIdx_(p.c1) + 1;
  var r1 = p.r1 ? Number(p.r1) : 1;
  ensureCapacity_(sh, r1 + rect.rows.length - 1, c1 + rect.cols - 1);
  sh.getRange(r1, c1, rect.rows.length, rect.cols).setValues(rect.rows);
}

function valuesAppend_(a1, values) {
  var p = a1Parse_(a1);
  if (!p || !values || !values.length) return;
  var rect = rectangle_(values);
  if (!rect) return;
  var sh = sheet_(p.sheet, true);
  var c1 = colToIdx_(p.c1) + 1;
  var startRow = sh.getLastRow() + 1;
  if (startRow < 2 && SHEET_HEADERS[p.sheet]) startRow = 2;   // jangan menimpa baris header
  if (startRow < 1) startRow = 1;
  ensureCapacity_(sh, startRow + rect.rows.length - 1, c1 + rect.cols - 1);
  sh.getRange(startRow, c1, rect.rows.length, rect.cols).setValues(rect.rows);
}

// Tulis banyak range sekaligus (pengganti values.batchUpdate).
function valuesBatchUpdate_(data) {
  (data || []).forEach(function (d) { valuesUpdate_(d.range, d.values); });
}

function deleteRows_(sheetName, rowNumbers) {
  var sh = sheet_(sheetName, false);
  if (!sh || !rowNumbers || !rowNumbers.length) return;
  rowNumbers.slice().sort(function (a, b) { return b - a; }).forEach(function (rn) {
    if (rn >= 1 && rn <= sh.getMaxRows()) sh.deleteRow(rn);
  });
}

/* ================================================================== */
/* TANGGAL                                                            */
/* ================================================================== */

function pad_(n) { var s = String(n); return s.length < 2 ? '0' + s : s; }

function tz_() {
  try { return Session.getScriptTimeZone() || 'Asia/Jakarta'; }
  catch (e) { return 'Asia/Jakarta'; }
}

function serialToDate_(serial) {
  return new Date(Math.round((Number(serial) - 25569) * 86400 * 1000));
}

function fmtUtc_(d, withTime) {
  var s = d.getUTCFullYear() + '-' + pad_(d.getUTCMonth() + 1) + '-' + pad_(d.getUTCDate());
  return withTime ? (s + ' ' + pad_(d.getUTCHours()) + ':' + pad_(d.getUTCMinutes())) : s;
}

function fmtLocal_(d, withTime) {
  var s = d.getFullYear() + '-' + pad_(d.getMonth() + 1) + '-' + pad_(d.getDate());
  return withTime ? (s + ' ' + pad_(d.getHours()) + ':' + pad_(d.getMinutes())) : s;
}

function formatDate_(value, withTime) {
  if (value === '' || value === null || value === undefined) return '';
  // PENTING: Date dari SpreadsheetApp memakai zona waktu skrip. Kalau dibaca dengan
  // getter UTC, tanggalnya bisa mundur 1 hari di GMT+7. Jadi pakai getter lokal.
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';
    return fmtLocal_(value, withTime);
  }
  if (typeof value === 'number') return fmtUtc_(serialToDate_(value), withTime);

  var s = String(value).trim();
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  var dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  var d = null;
  if (iso) d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3], +(iso[4] || 0), +(iso[5] || 0), +(iso[6] || 0)));
  else if (dmy) d = new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1], +(dmy[4] || 0), +(dmy[5] || 0)));
  else return s; // teks tak dikenal -> kembalikan apa adanya
  if (!d || isNaN(d.getTime())) return s;
  return fmtUtc_(d, withTime);
}

// Untuk ditulis ke sheet. Sheets mengenali format ISO yyyy-mm-dd.
function toSheetDate_(value) {
  if (!value) return '';
  if (typeof value === 'number') return formatDate_(value, false);
  if (Object.prototype.toString.call(value) === '[object Date]') return fmtLocal_(value, false);
  var s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + pad_(+m[2]) + '-' + pad_(+m[1]);
  return s;
}

function nowStamp_() {
  return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss');
}

function todayIso_() {
  return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
}

function isChecked_(v) {
  if (v === true) return true;
  var s = String(v || '').trim().toLowerCase();
  return s === 'true' || s === 'ya' || s === 'yes' || s === '1' || s === 'x';
}

// Kolom "stempel waktu" (Created At / Done At / Checked At / UpdatedAt) dibaca apa adanya
// sebagai teks. Kalau Sheets terlanjur mengubahnya jadi nilai tanggal, String() akan
// menghasilkan teks kacau ("Mon Jul 28 2026 ..." / "46231.375") — jadi rapikan di sini.
function stampStr_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return isNaN(v.getTime()) ? '' : fmtLocal_(v, true);
  }
  if (typeof v === 'number') return fmtUtc_(serialToDate_(v), true);
  return String(v).trim();
}

/* ================================================================== */
/* PEMETAAN BARIS <-> TASK                                            */
/* ================================================================== */

function rowToTask_(row, rowNumber) {
  var g = function (i) { return (row[i] === undefined || row[i] === null) ? '' : row[i]; };
  var createdDate = formatDate_(g(1), false);
  return {
    rowNumber: rowNumber,
    id: String(g(0)).trim(),
    createdDate: createdDate,
    dueDate: formatDate_(g(2), false),
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
    statusBy: String(g(21)).trim(),   // siapa & kapan status terakhir diubah
    // Field virtual (tak punya kolom di sheet) — disediakan agar UI tetap jalan.
    startDate: createdDate,
    approvalGate: '',
    lastUpdate: ''
  };
}

function taskToRow_(task, existingTask) {
  var id = task.id || null;
  var createdDate = task.createdDate || (existingTask && existingTask.createdDate) || todayIso_();
  var support = Object.prototype.toString.call(task.support) === '[object Array]'
    ? task.support.join(', ') : String(task.support || '');
  return [
    id || '',
    toSheetDate_(createdDate),
    toSheetDate_(task.dueDate || ''),
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
    (task.statusBy !== undefined ? task.statusBy : ((existingTask && existingTask.statusBy) || ''))
  ];
}

/* ================================================================== */
/* TASKS                                                              */
/* ================================================================== */

function mainDataRange_() {
  return CONFIG.TASK_SHEET + '!' + CONFIG.FIRST_COL_LETTER + CONFIG.FIRST_DATA_ROW + ':' + CONFIG.LAST_COL_LETTER;
}
function taskRowRange_(rowNumber) {
  return CONFIG.TASK_SHEET + '!' + CONFIG.FIRST_COL_LETTER + rowNumber + ':' + CONFIG.LAST_COL_LETTER + rowNumber;
}

function getTasks(pre) {
  var rows = (pre !== undefined) ? pre : valuesGet_(mainDataRange_());
  return rows
    .map(function (row, idx) { return rowToTask_(row, CONFIG.FIRST_DATA_ROW + idx); })
    .filter(function (t) { return t.id || t.taskName; });
}

function getTaskIdColumn_() {
  var rows = valuesGet_(CONFIG.TASK_SHEET + '!' + COL.taskId + CONFIG.FIRST_DATA_ROW + ':' + COL.taskId);
  return rows.map(function (r) { return String((r && r[0]) || '').trim(); });
}

function findRowByTaskId_(ids, taskId) {
  if (!taskId) return -1;
  var needle = String(taskId).trim();
  for (var i = 0; i < ids.length; i++) if (ids[i] === needle) return CONFIG.FIRST_DATA_ROW + i;
  return -1;
}

function generateTaskId_(ids) {
  var max = 0;
  ids.forEach(function (v) {
    var m = String(v || '').match(/(\d+)\s*$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return 'TSK-' + ('00' + (max + 1)).slice(-3);
}

function getTaskById_(taskId) {
  var ids = getTaskIdColumn_();
  var row = findRowByTaskId_(ids, taskId);
  if (row === -1) return null;
  var cur = valuesGet_(taskRowRange_(row));
  return rowToTask_(cur[0] || [], row);
}

function saveTask(task) {
  if (!task) return { success: false, message: 'Data task kosong.' };
  if (!String(task.taskName || '').trim()) return { success: false, message: 'Task Name wajib diisi.' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { success: false, message: 'Server sibuk, coba lagi sebentar.' }; }
  try {
    var ids = getTaskIdColumn_();
    var rowNumber = -1;
    var existingTask = null;

    if (task.id) {
      rowNumber = findRowByTaskId_(ids, task.id);
      if (rowNumber !== -1) {
        var cur = valuesGet_(taskRowRange_(rowNumber));
        existingTask = rowToTask_(cur[0] || [], rowNumber);
      }
    }
    var isUpdate = rowNumber !== -1;
    var actor = String(task.actor || '').trim() || 'Unknown';

    // Gerbang "Done": hanya Done approver yang boleh MENETAPKAN status ke Done.
    // Task yang sudah Done boleh tetap Done atau ditarik balik.
    var oldStatus = (existingTask && existingTask.status) || '';
    // Izin Done bergantung pada PIC task-nya (Staff boleh menutup task anak magang).
    var finalPic = String(task.pic || (existingTask && existingTask.pic) || '').trim();
    if (isDoneStatus_(task.status) && !isDoneStatus_(oldStatus) && !canApproveDone_(actor, finalPic, task.support !== undefined ? task.support : (existingTask && existingTask.support))) {
      return { success: false, message: doneDeniedMessage_(finalPic) };
    }

    var finalId = task.id || generateTaskId_(ids);
    var createdBy = isUpdate ? ((existingTask && existingTask.createdBy) || task.createdBy || '') : actor;
    var merged = {};
    Object.keys(task).forEach(function (k) { merged[k] = task[k]; });
    merged.id = finalId;
    merged.createdBy = createdBy;
    // Catat pengubah status HANYA bila statusnya memang berganti, supaya menyunting judul
    // atau deadline tidak ikut mengubah keterangan "diubah oleh".
    var oldSt = String((existingTask && existingTask.status) || '').trim();
    merged.statusBy = (String(task.status || '').trim() !== oldSt)
      ? statusByStamp_(actor)
      : ((existingTask && existingTask.statusBy) || '');
    var rowData = taskToRow_(merged, existingTask);

    if (!isUpdate) rowNumber = CONFIG.FIRST_DATA_ROW + ids.length; // baris kosong berikutnya
    valuesUpdate_(taskRowRange_(rowNumber), [rowData]);

    var savedRows = valuesGet_(taskRowRange_(rowNumber));
    var saved = rowToTask_(savedRows[0] || rowData, rowNumber);
    logActivity_(actor, isUpdate ? 'Update Task' : 'Create Task', saved.id,
      saved.taskName + ' • Status: ' + saved.status + ' • PIC: ' + saved.pic);

    return { success: true, message: 'Task berhasil disimpan.', task: saved, tasks: getTasks() };
  } finally {
    try { lock.releaseLock(); } catch (e) { /* abaikan */ }
  }
}

function deleteTask(taskId, actor) {
  var ids = getTaskIdColumn_();
  var rowNumber = findRowByTaskId_(ids, taskId);
  if (rowNumber === -1) return { success: false, message: 'Task ID tidak ditemukan.' };

  var cur = valuesGet_(taskRowRange_(rowNumber));
  var removed = rowToTask_(cur[0] || [], rowNumber);
  if (!sheet_(CONFIG.TASK_SHEET, false)) return { success: false, message: 'Sheet Main tidak ditemukan.' };
  deleteRows_(CONFIG.TASK_SHEET, [rowNumber]);

  // Ceklis, komentar, notifikasi, dan riwayatnya ikut dibuang. Nomor task dipakai ulang
  // (generateTaskId_ = max+1), jadi kalau ditinggalkan, task BARU akan mewarisi ceklis dan
  // percakapan milik task yang sudah dihapus.
  var ikut = 0;
  ikut += purgeRowsForRef_(CONFIG.CHECKLIST_SHEET, 'G', 0, taskId);   // A = Task ID
  ikut += purgeRowsForRef_(CONFIG.COMMENTS_SHEET, 'D', 1, taskId);    // B = Task ID
  ikut += purgeRowsForRef_(CONFIG.NOTIF_SHEET, 'H', 3, taskId);       // D = Ref ID
  ikut += purgeRowsForRef_(CONFIG.ACTIVITY_SHEET, 'E', 3, taskId);    // D = Task ID
  // Jejak penghapusan dicatat TANPA taskId, supaya tak nyangkut di task bernomor sama.
  logActivity_(String(actor || '').trim() || 'Unknown', 'Delete Task', '',
    taskId + ' dihapus: ' + (removed.taskName || '') + ' (' + ikut + ' ceklis/komentar/notifikasi/aktivitas ikut dibuang)');
  return { success: true, message: 'Task berhasil dihapus.', tasks: getTasks() };
}

var QUICK_FIELD_COL = {
  status: COL.status, priority: COL.priority, pic: COL.pic, stage: COL.stage, mirror: COL.mirror
};

function quickUpdateField(taskId, field, value, actor) {
  var f = String(field || '');
  var ids = getTaskIdColumn_();
  var row = findRowByTaskId_(ids, taskId);
  if (row === -1) return { success: false, message: 'Task ID tidak ditemukan.' };

  var col = QUICK_FIELD_COL[f];
  if (!col) {
    // Field virtual tanpa kolom di sheet ini: no-op sukses agar UI tak menampilkan error.
    if (['startDate', 'approvalGate', 'lastUpdate'].indexOf(f) >= 0) {
      var cur0 = valuesGet_(taskRowRange_(row));
      return { success: true, message: f + ' dinonaktifkan (tidak disimpan).', task: rowToTask_(cur0[0] || [], row) };
    }
    return { success: false, message: 'Field tidak didukung: ' + field };
  }

  // Gerbang "Done": yang bukan approver tak boleh memindahkan task KE Done (menarik balik boleh).
  // Izinnya bergantung PIC task — Staff boleh menutup task milik anak magang.
  if (f === 'status' && isDoneStatus_(value)) {
    var prev = valuesGet_(taskRowRange_(row));
    var existing = rowToTask_(prev[0] || [], row);
    if (!isDoneStatus_(existing.status) && !canApproveDone_(actor, existing.pic, existing.support)) {
      return { success: false, message: doneDeniedMessage_(existing.pic) };
    }
  }

  valuesUpdate_(CONFIG.TASK_SHEET + '!' + col + row, [[value]]);
  // Wajib untuk task milik bersama (PIC berupa peran): tanpa ini satu status dipakai
  // beramai-ramai tanpa jejak siapa yang menggerakkannya.
  if (f === 'status') valuesUpdate_(CONFIG.TASK_SHEET + '!' + COL.statusBy + row, [[statusByStamp_(actor)]]);
  logActivity_(String(actor || '').trim() || 'Unknown', 'Update Task', taskId, field + ' → ' + value);

  var after = valuesGet_(taskRowRange_(row));
  return { success: true, message: field + ' diperbarui.', task: rowToTask_(after[0] || [], row) };
}

function quickUpdateDates(taskId, startDate, dueDate, actor) {
  var ids = getTaskIdColumn_();
  var row = findRowByTaskId_(ids, taskId);
  if (row === -1) return { success: false, message: 'Task ID tidak ditemukan.' };

  // Sheet ini hanya punya kolom Due Date (tanpa Start Date / Last Update).
  if (dueDate) valuesUpdate_(CONFIG.TASK_SHEET + '!' + COL.dueDate + row, [[toSheetDate_(dueDate)]]);

  logActivity_(String(actor || '').trim() || 'Unknown', 'Update Task', taskId,
    'Jadwal: ' + (startDate || '?') + ' → ' + (dueDate || '?'));

  var cur = valuesGet_(taskRowRange_(row));
  return { success: true, message: 'Jadwal diperbarui.', task: rowToTask_(cur[0] || [], row) };
}

/* ================================================================== */
/* OPTIONS                                                            */
/* ================================================================== */

function readOptionsRaw_(pre) {
  var rows = (pre !== undefined) ? pre : valuesGet_(CONFIG.OPTIONS_SHEET + '!A2:D');
  return rows
    .map(function (r, i) {
      return {
        row: i + 2,
        type: String((r && r[0]) || '').trim(),
        value: String((r && r[1]) || '').trim(),
        active: !!(r && (r[2] === true || String(r[2]).toUpperCase() === 'TRUE')),
        parent: String((r && r[3]) || '').trim()
      };
    })
    .filter(function (r) { return r.type && r.value; });
}

function getOptions(pre) {
  var raw = [];
  try {
    raw = readOptionsRaw_(pre).filter(function (r) { return r.active; });
  } catch (e) { raw = []; }

  var options = {};
  OPTION_TYPES.forEach(function (t) { options[t] = []; });
  var verbMap = {};   // { stage: [kata kerja, ...] }
  var objekMap = {};  // { "stage||verb": [objek, ...] }

  raw.forEach(function (row) {
    if (!options[row.type]) options[row.type] = [];
    if (options[row.type].indexOf(row.value) < 0) options[row.type].push(row.value);
    if (row.type === 'verb' && row.parent) {
      verbMap[row.parent] = verbMap[row.parent] || [];
      if (verbMap[row.parent].indexOf(row.value) < 0) verbMap[row.parent].push(row.value);
    }
    if (row.type === 'object' && row.parent) {
      objekMap[row.parent] = objekMap[row.parent] || [];
      if (objekMap[row.parent].indexOf(row.value) < 0) objekMap[row.parent].push(row.value);
    }
  });
  OPTION_TYPES.forEach(function (t) {
    if (!options[t] || !options[t].length) options[t] = DEFAULT_OPTIONS[t] || [];
  });
  options.verbMap = verbMap;
  options.objekMap = objekMap;
  return options;
}

var USES_PARENT = ['verb', 'object']; // tipe opsi bertingkat: kata kerja & objek

function findOptionRow_(rows, type, value, parent) {
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.type !== type) continue;
    if (r.value.toLowerCase() !== String(value).toLowerCase()) continue;
    if (USES_PARENT.indexOf(type) >= 0 && r.parent.toLowerCase() !== String(parent || '').toLowerCase()) continue;
    return r;
  }
  return null;
}

function saveOption(type, value, parent) {
  type = String(type || '').trim();
  value = String(value || '').trim();
  parent = String(parent || '').trim();
  if (OPTION_TYPES.indexOf(type) < 0) return { success: false, message: 'Tipe opsi tidak valid.' };
  if (!value) return { success: false, message: 'Nilai opsi tidak boleh kosong.' };
  if (USES_PARENT.indexOf(type) >= 0 && !parent) return { success: false, message: 'Opsi ini wajib punya induk (parent).' };

  ensureOptionsSheet_();
  var rows = readOptionsRaw_();
  var found = findOptionRow_(rows, type, value, parent);
  if (found) valuesUpdate_(CONFIG.OPTIONS_SHEET + '!C' + found.row + ':D' + found.row, [[true, parent]]);
  else valuesAppend_(CONFIG.OPTIONS_SHEET + '!A:D', [[type, value, true, parent]]);

  try { applySheetValidations_(); } catch (e) { /* abaikan */ }
  return { success: true, message: 'Opsi berhasil disimpan.', options: getOptions() };
}

function deleteOption(type, value, parent) {
  type = String(type || '').trim();
  value = String(value || '').trim();
  parent = String(parent || '').trim();
  if (OPTION_TYPES.indexOf(type) < 0) return { success: false, message: 'Tipe opsi tidak valid.' };

  var rows = readOptionsRaw_();
  var found = findOptionRow_(rows, type, value, parent);
  if (found) valuesUpdate_(CONFIG.OPTIONS_SHEET + '!C' + found.row, [[false]]);
  try { applySheetValidations_(); } catch (e) { /* abaikan */ }
  return { success: true, message: 'Opsi berhasil dinonaktifkan.', options: getOptions() };
}

// Rename nilai opsi + cascade ke task yang masih memakai nilai lama.
function editOption(type, oldValue, newValue, parent) {
  type = String(type || '').trim();
  oldValue = String(oldValue || '').trim();
  newValue = String(newValue || '').trim();
  parent = String(parent || '').trim();
  if (OPTION_TYPES.indexOf(type) < 0) return { success: false, message: 'Tipe opsi tidak valid.' };
  if (!oldValue || !newValue) return { success: false, message: 'Nilai lama/baru tidak boleh kosong.' };

  var rows = readOptionsRaw_();
  var found = findOptionRow_(rows, type, oldValue, parent);
  if (!found) return { success: false, message: 'Opsi tidak ditemukan.' };
  valuesUpdate_(CONFIG.OPTIONS_SHEET + '!B' + found.row, [[newValue]]);

  if (USES_PARENT.indexOf(type) >= 0) {
    // Kata kerja / objek: cukup ganti nama opsi. Nama task lama tidak diubah otomatis.
    try { applySheetValidations_(); } catch (e) { /* abaikan */ }
    return { success: true, message: '"' + oldValue + '" diubah menjadi "' + newValue + '".', options: getOptions() };
  }

  var col = COL[type];
  if (col) {
    var taskRows = valuesGet_(mainDataRange_());
    var colIdx = colToIdx_(col) - colToIdx_(CONFIG.FIRST_COL_LETTER);
    var data = [];
    taskRows.forEach(function (row, idx) {
      var cur = String((row && row[colIdx]) || '');
      if (!cur) return;
      var rowNumber = CONFIG.FIRST_DATA_ROW + idx;
      if (type === 'support') {
        var parts = cur.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        var hit = parts.some(function (p) { return p.toLowerCase() === oldValue.toLowerCase(); });
        if (hit) {
          var np = parts.map(function (p) { return p.toLowerCase() === oldValue.toLowerCase() ? newValue : p; }).join(', ');
          data.push({ range: CONFIG.TASK_SHEET + '!' + col + rowNumber, values: [[np]] });
        }
      } else if (cur.toLowerCase() === oldValue.toLowerCase()) {
        data.push({ range: CONFIG.TASK_SHEET + '!' + col + rowNumber, values: [[newValue]] });
      }
    });
    valuesBatchUpdate_(data);
  }
  try { applySheetValidations_(); } catch (e) { /* abaikan */ }
  return { success: true, message: '"' + oldValue + '" diubah menjadi "' + newValue + '".', options: getOptions(), tasks: getTasks() };
}

/* ================================================================== */
/* COMMENTS                                                           */
/* ================================================================== */

function getComments(taskId) {
  var rows = [];
  try { rows = valuesGet_(CONFIG.COMMENTS_SHEET + '!A2:D'); } catch (e) { return []; }
  return rows
    .filter(function (r) { return String((r && r[1]) || '') === String(taskId || ''); })
    .map(function (r) {
      return {
        timestamp: formatDate_(r[0], true),
        taskId: String(r[1] || ''),
        author: String(r[2] || ''),
        message: String(r[3] || '')
      };
    });
}

function addComment(payload) {
  var taskId = String((payload && payload.taskId) || '').trim();
  var author = String((payload && payload.author) || 'Unknown').trim();
  var message = String((payload && payload.message) || '').trim();
  if (!taskId) return { success: false, message: 'Task ID tidak valid.' };
  if (!message) return { success: false, message: 'Komentar tidak boleh kosong.' };

  ensureCommentsSheet_();
  valuesAppend_(CONFIG.COMMENTS_SHEET + '!A:D', [[nowStamp_(), taskId, author, message]]);
  logActivity_(author, 'Comment', taskId, message.length > 120 ? message.slice(0, 117) + '...' : message);
  try { createMentionNotifications_(taskId, author, message); } catch (e) { /* notifikasi tak boleh menggagalkan komentar */ }
  return { success: true, message: 'Komentar berhasil ditambahkan.', comments: getComments(taskId) };
}

/* ================================================================== */
/* CHECKLIST (ceklis task + sub-ceklis proses kolaborasi)             */
/* ================================================================== */

function ownsTaskActor_(task, actor) {
  var a = baseName_(actor);
  if (!a || !task) return false;
  // PIC berupa peran -> dimiliki bersama oleh semua yang berperan itu.
  var rp = rolePicOf_(task.pic);
  if (rp && hasRole_(actor, rp.toLowerCase())) return true;
  if (baseName_(task.pic) === a) return true;
  return String(task.support || '').split(',').map(function (s) { return baseName_(s); })
    .filter(Boolean).indexOf(a) >= 0;
}

// Boleh menambah item & mencentang:
//  - Sub-ceklis proses kolaborasi ("COL-xxx#N"): FLEKSIBEL, siapa pun boleh.
//  - Ceklis task biasa: manager/Dev, atau PIC/Support task itu.
function canEditChecklist_(taskId, actor) {
  if (parseCollabStep_(taskId)) return !!baseName_(actor);
  if (isManagerActor_(actor)) return true;
  return ownsTaskActor_(getTaskById_(taskId), actor);
}
// Boleh menghapus item:
//  - Sub-ceklis kolaborasi: FLEKSIBEL.
//  - Ceklis task biasa: manager/Dev SAJA (item dari PM tak boleh dihapus PIC).
/* Boleh menghapus item ceklis?
   - Sub-ceklis kolaborasi: fleksibel, seperti aturan mencentangnya.
   - Ceklis task biasa: Manager, Leader, ATAU orang yang MEMBUAT item itu. */
function canDeleteChecklist_(taskId, actor, createdBy) {
  if (parseCollabStep_(taskId)) return !!baseName_(actor);
  if (isManagerActor_(actor) || isLeaderActor_(actor)) return true;
  var pembuat = baseName_(createdBy);
  // Pembuat tak diketahui (item lama dgn kolom D rusak): jatuh ke siapa pun yang berhak
  // mengubah ceklis task ini — PM atau PIC/Support-nya.
  if (!pembuat) return canEditChecklist_(taskId, actor);
  return pembuat === baseName_(actor);
}

function getChecklist(taskId) {
  var rows = [];
  try { rows = valuesGet_(CONFIG.CHECKLIST_SHEET + '!A2:G'); } catch (e) { return []; }
  var needle = String(taskId || '').trim();
  return rows
    .map(function (r, i) {
      return {
        row: i + 2,
        taskId: String((r && r[0]) || '').trim(),
        item: String((r && r[1]) || '').trim(),
        done: isChecked_(r && r[2]),
        // Kolom D bisa rusak pada baris lama (sebelum 1.77.0 mencentang menimpanya dgn
        // TEKS ITEM). Tandanya pasti (D === B) -> dibaca sebagai "pembuat tak diketahui".
        createdBy: (String((r && r[3]) || '').trim() === String((r && r[1]) || '').trim())
          ? '' : String((r && r[3]) || '').trim(),
        checkedBy: String((r && r[4]) || '').trim(),
        checkedAt: stampStr_(r && r[5]),
        link: String((r && r[6]) || '').trim()   // lampiran hasil (opsional)
      };
    })
    .filter(function (c) { return c.taskId === needle && c.item; });
}

function addChecklistItem(taskId, item, actor, link) {
  taskId = String(taskId || '').trim();
  item = String(item || '').trim();
  actor = String(actor || '').trim() || 'Unknown';
  if (!taskId) return { success: false, message: 'Task ID tidak valid.' };
  if (!item) return { success: false, message: 'Item ceklis tidak boleh kosong.' };
  if (!canEditChecklist_(taskId, actor)) {
    return { success: false, message: 'Hanya PM atau PIC/Support task ini yang bisa menambah item ceklis.' };
  }
  ensureChecklistSheet_();
  valuesAppend_(CONFIG.CHECKLIST_SHEET + '!A:G', [[taskId, item, 'FALSE', actor, '', '', String(link || '').trim()]]);
  logActivity_(actor, 'Checklist Add', taskId, item.length > 120 ? item.slice(0, 117) + '...' : item);
  return { success: true, message: 'Item ceklis ditambahkan.', checklist: getChecklist(taskId) };
}

// Salin seluruh sub-ceklis satu proses ke proses lain. Dipakai saat beberapa proses
// mengerjakan daftar yang sama (mis. Alya "Generate" 23 item, lalu Ali "QC" daftar itu juga).
// Ditulis sekali jalan, bukan 23 panggilan terpisah, supaya cepat & tak putus di tengah.
// Item selalu masuk dalam keadaan BELUM tercentang — status pengerjaan tidak ikut disalin.
function copyChecklist(fromId, toIds, actor) {
  fromId = String(fromId || '').trim();
  actor = String(actor || '').trim() || 'Unknown';
  var targets = (Object.prototype.toString.call(toIds) === '[object Array]' ? toIds : [toIds])
    .map(function (x) { return String(x || '').trim(); })
    .filter(function (x) { return x && x !== fromId; });
  if (!fromId) return { success: false, message: 'Sumber ceklis tidak valid.' };
  if (!targets.length) return { success: false, message: 'Pilih minimal satu proses tujuan.' };
  if (!canEditChecklist_(fromId, actor)) return { success: false, message: 'Anda tidak berhak membaca ceklis sumber.' };

  var source = getChecklist(fromId);
  if (!source.length) return { success: false, message: 'Sub-ceklis sumber masih kosong — tidak ada yang disalin.' };

  var rows = [], ditolak = 0;
  targets.forEach(function (to) {
    if (!canEditChecklist_(to, actor)) { ditolak++; return; }
    source.forEach(function (it) { rows.push([to, it.item, 'FALSE', actor, '', '', it.link || '']); });
  });
  if (!rows.length) return { success: false, message: 'Anda tidak berhak menambah ceklis di proses tujuan.' };

  ensureChecklistSheet_();
  valuesAppend_(CONFIG.CHECKLIST_SHEET + '!A:G', rows);
  var berhasil = targets.length - ditolak;
  logActivity_(actor, 'Checklist Copy', fromId, source.length + ' item → ' + berhasil + ' proses');
  return {
    success: true,
    message: source.length + ' sub-item disalin ke ' + berhasil + ' proses.' + (ditolak ? ' ' + ditolak + ' dilewati (tanpa izin).' : ''),
    copied: source.length,
    targets: berhasil,
    checklistSummary: getChecklistSummary_(),
  };
}

function setChecklistDone(taskId, row, done, actor) {
  taskId = String(taskId || '').trim();
  row = parseInt(row, 10);
  actor = String(actor || '').trim() || 'Unknown';
  var val = !!done;
  if (!row || row < 2) return { success: false, message: 'Baris tidak valid.' };
  if (!canEditChecklist_(taskId, actor)) {
    return { success: false, message: 'Hanya PM atau PIC/Support task ini yang bisa mencentang ceklis.' };
  }
  // Pastikan baris ini benar milik task tsb (hindari salah-centang bila baris bergeser).
  var cur = valuesGet_(CONFIG.CHECKLIST_SHEET + '!A' + row + ':B' + row);
  var owner = String((cur[0] && cur[0][0]) || '').trim();
  if (owner !== taskId) return { success: false, message: 'Item ceklis tidak cocok dengan task ini. Muat ulang.' };
  // JANGAN menulis kolom D di sini — itu "Created By". Menulis rentang C:F sekaligus dulu
  // menimpanya dengan teks item, sehingga pembuat item hilang setiap kali dicentang.
  valuesUpdate_(CONFIG.CHECKLIST_SHEET + '!C' + row, [[val ? 'TRUE' : 'FALSE']]);
  valuesUpdate_(CONFIG.CHECKLIST_SHEET + '!E' + row + ':F' + row, [[val ? actor : '', val ? nowStamp_() : '']]);
  var list = getChecklist(taskId);
  var out = { success: true, message: val ? 'Item dicentang.' : 'Centang dibatalkan.', checklist: list };
  if (restampCollabStep_(taskId, list, actor)) { out.collabs = getCollabs(); out.stepRestamped = true; }
  return out;
}

// Proses yang punya sub-ceklis baru benar-benar rampung saat sub-ceklisnya tuntas. Jadi bila
// sub-item ditambahkan setelah prosesnya dicentang (sub jadi 5/6), lalu item terakhir itu
// dicentang, tanggal selesai prosesnya ikut diperbarui — tanpa perlu buka-tutup centang utama.
// Hanya berlaku untuk proses yang SUDAH dicentang; yang belum tetap butuh tindakan PIC-nya.
function restampCollabStep_(taskId, list, actor) {
  var ref = parseCollabStep_(taskId);
  if (!ref || !list.length) return false;
  for (var k = 0; k < list.length; k++) if (!list[k].done) return false;
  var srows = [];
  try { srows = valuesGet_(CONFIG.COLLAB_STEP_SHEET + '!A2:H'); } catch (e) { return false; }
  var idx = -1;
  for (var i = 0; i < srows.length; i++) {
    var r = srows[i];
    if (String((r && r[0]) || '').trim() === ref.collabId && Number((r && r[1]) || 0) === ref.order) { idx = i; break; }
  }
  if (idx < 0) return false;
  if (!isChecked_(srows[idx] && srows[idx][5])) return false;   // hanya proses yang sudah dicentang
  valuesUpdate_(CONFIG.COLLAB_STEP_SHEET + '!H' + (idx + 2), [[nowStamp_()]]);
  logActivity_(actor, 'Collab Step Restamp', ref.collabId, 'Proses ' + ref.order + ': tanggal selesai diperbarui (sub-ceklis tuntas)');
  return true;
}

/* Lampiran hasil pada satu item ceklis — OPSIONAL. Izinnya mengikuti aturan mencentang. */
function setChecklistLink(taskId, row, link, actor) {
  taskId = String(taskId || '').trim();
  row = parseInt(row, 10);
  actor = String(actor || '').trim() || 'Unknown';
  link = String(link || '').trim();
  if (!row || row < 2) return { success: false, message: 'Baris tidak valid.' };
  if (link.length > 500) return { success: false, message: 'Link terlalu panjang (maks 500 karakter).' };
  if (!canEditChecklist_(taskId, actor)) return { success: false, message: 'Anda tak berhak mengubah ceklis ini.' };
  var cur = valuesGet_(CONFIG.CHECKLIST_SHEET + '!A' + row + ':B' + row);
  if (String((cur[0] && cur[0][0]) || '').trim() !== taskId) {
    return { success: false, message: 'Item ceklis tidak cocok dengan task ini. Muat ulang.' };
  }
  ensureChecklistSheet_();
  valuesUpdate_(CONFIG.CHECKLIST_SHEET + '!G' + row, [[link]]);
  logActivity_(actor, 'Checklist Link', taskId, link ? ('lampiran: ' + link.slice(0, 90)) : 'lampiran dihapus');
  return { success: true, message: link ? 'Link dilampirkan.' : 'Link dihapus.', checklist: getChecklist(taskId) };
}

function deleteChecklistItem(taskId, row, actor) {
  taskId = String(taskId || '').trim();
  row = parseInt(row, 10);
  actor = String(actor || '').trim() || 'Unknown';
  if (!row || row < 2) return { success: false, message: 'Baris tidak valid.' };
  // Baca dulu barisnya: izin menghapus bergantung SIAPA yang membuat item itu.
  var cur = valuesGet_(CONFIG.CHECKLIST_SHEET + '!A' + row + ':D' + row);
  var owner = String((cur[0] && cur[0][0]) || '').trim();
  if (owner !== taskId) return { success: false, message: 'Item ceklis tidak cocok dengan task ini. Muat ulang.' };
  // Kolom D bisa rusak pada baris lama (tertimpa teks item sebelum 1.77.0) -> anggap
  // pembuatnya tak diketahui, sama seperti pembacaan di getChecklist().
  var dRaw = String((cur[0] && cur[0][3]) || '').trim();
  var pembuat = (dRaw && dRaw === String((cur[0] && cur[0][1]) || '').trim()) ? '' : dRaw;
  if (!canDeleteChecklist_(taskId, actor, pembuat)) {
    return { success: false, message: 'Hanya ' + (pembuat || 'pembuat item') + ', Leader, atau Manager yang bisa menghapus item ini.' };
  }
  if (!sheet_(CONFIG.CHECKLIST_SHEET, false)) return { success: false, message: 'Sheet CHECKLIST tidak ditemukan.' };
  deleteRows_(CONFIG.CHECKLIST_SHEET, [row]);
  logActivity_(actor, 'Checklist Delete', taskId, String((cur[0] && cur[0][1]) || ''));
  return { success: true, message: 'Item ceklis dihapus.', checklist: getChecklist(taskId) };
}

// Ringkasan progres semua ceklis (untuk bootstrap): { taskId: {done, total} }
function getChecklistSummary_(pre) {
  var rows = [];
  if (pre !== undefined) rows = pre;
  else { try { rows = valuesGet_(CONFIG.CHECKLIST_SHEET + '!A2:C'); } catch (e) { return {}; } }
  var out = {};
  rows.forEach(function (r) {
    var id = String((r && r[0]) || '').trim();
    if (!id || !String((r && r[1]) || '').trim()) return;
    if (!out[id]) out[id] = { done: 0, total: 0 };
    out[id].total++;
    if (isChecked_(r && r[2])) out[id].done++;
  });
  return out;
}

/* ================================================================== */
/* COLLAB (task kolaborasi: alur proses beruntun antar-PIC)           */
/* ================================================================== */

function parseCollabStep_(taskId) {
  var m = String(taskId || '').match(/^(COL-\d+)#(\d+)$/);
  return m ? { collabId: m[1], order: Number(m[2]) } : null;
}

function genCollabId_(ids) {
  var max = 0;
  (ids || []).forEach(function (v) {
    var m = String(v || '').match(/(\d+)\s*$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return 'COL-' + ('00' + (max + 1)).slice(-3);
}

// Mencentang = mengklaim pekerjaan itu selesai, jadi tetap khusus PIC proses (+ Dev).
// MEMBATALKAN centang adalah tindakan koreksi, bukan klaim — Manager boleh, supaya salah
// centang tak perlu menunggu orangnya. Argumen `undo` true = permintaan membatalkan.
function canCheckStep_(stepPic, actor, undo) {
  if (baseName_(actor) === 'dev') return true;
  if (undo && isManagerActor_(actor)) return true;
  // PIC proses berupa peran -> proses milik bersama, siapa pun berperan itu boleh mencentang.
  var rp = rolePicOf_(stepPic);
  if (rp) return hasRole_(actor, rp.toLowerCase());
  var p = baseName_(stepPic);
  return !!p && p === baseName_(actor);
}

/* ================================================================== */
/* MASTER KOORDINASI PAKET — satu task kolaborasi = satu paket.       */
/* Kuncinya Collab ID, jadi paket ikut hidup & mati bersama collabnya. */
/* Dua area berpemilik: Marsel (C..H) dan Produk (J..P), meniru pita  */
/* "AREA MARSEL" / "AREA PRODUK" di sheet Master aslinya.             */
/* ================================================================== */
var PKG_MARSEL = ['program', 'namaPaket', 'tagline', 'benefit', 'tanggal', 'tujuan'];
var PKG_PRODUK = ['dibimbing', 'latsol', 'materi', 'tryout', 'drilling', 'liveClass', 'catatan'];
// Kategori deliverable mengikuti kolom Area Produk di sheet Master aslinya.
var PKG_KATEGORI = ['Dibimbing', 'Latsol', 'Materi', 'Tryout', 'Drilling', 'Live Class'];

/* Status item: kalau ditautkan ke sebuah proses, statusnya IKUT proses itu dan tak bisa
   diketik manual — itu inti integrasinya. Item tanpa proses (mis. produksi angkatan lalu
   yang sudah jadi) memakai status tersimpannya sendiri. */
function itemStatus_(it, step) {
  if (step) return step.done ? 'siap' : 'proses';
  return String((it && it.status) || '').trim().toLowerCase() === 'siap' ? 'siap' : 'belum';
}
// Ringkasan jumlah paket per status — menggantikan baris 'Total: 40 Paket' yang diketik tangan.
function itemRingkas_(items) {
  var r = { siap: 0, proses: 0, belum: 0, total: 0, jml: (items || []).length };
  (items || []).forEach(function (it) {
    var n = Number(it.jumlah || 0) || 0;
    r.total += n;
    if (r[it.status] !== undefined) r[it.status] += n;
  });
  return r;
}

function ensurePackageSheets_() {
  sheet_(CONFIG.PACKAGE_SHEET, true);
  var head = [];
  try { head = valuesGet_(CONFIG.PACKAGE_SHEET + '!A1:R1'); } catch (e) { head = []; }
  if (!((head[0] || [])[0])) valuesUpdate_(CONFIG.PACKAGE_SHEET + '!A1:R1', [SHEET_HEADERS[CONFIG.PACKAGE_SHEET]]);
  sheet_(CONFIG.PACKAGE_VARIANT_SHEET, true);
  try { head = valuesGet_(CONFIG.PACKAGE_VARIANT_SHEET + '!A1:F1'); } catch (e) { head = []; }
  if (!((head[0] || [])[0])) valuesUpdate_(CONFIG.PACKAGE_VARIANT_SHEET + '!A1:F1', [SHEET_HEADERS[CONFIG.PACKAGE_VARIANT_SHEET]]);
  sheet_(CONFIG.PACKAGE_ITEM_SHEET, true);
  try { head = valuesGet_(CONFIG.PACKAGE_ITEM_SHEET + '!A1:I1'); } catch (e) { head = []; }
  if (!((head[0] || [])[0])) valuesUpdate_(CONFIG.PACKAGE_ITEM_SHEET + '!A1:I1', [SHEET_HEADERS[CONFIG.PACKAGE_ITEM_SHEET]]);
}

function emptyPackage_(collabId) {
  var o = { collabId: String(collabId || ''), row: 0, marselPic: '', produkPic: '', updatedBy: '', updatedAt: '', variants: [], items: [] };
  PKG_MARSEL.concat(PKG_PRODUK).forEach(function (k) { o[k] = ''; });
  return o;
}

function rowToPackage_(r, rowNum) {
  var g = function (i) { return String((r && r[i]) !== null && (r && r[i]) !== undefined ? r[i] : '').trim(); };
  return {
    collabId: g(0), row: rowNum,
    marselPic: g(1),
    program: g(2), namaPaket: g(3), tagline: g(4), benefit: g(5),
    tanggal: (r && r[6] !== null && r[6] !== undefined && r[6] !== '') ? formatDate_(r[6], false) : '',
    tujuan: g(7),
    produkPic: g(8),
    dibimbing: g(9), latsol: g(10), materi: g(11), tryout: g(12),
    drilling: g(13), liveClass: g(14), catatan: g(15),
    updatedBy: g(16), updatedAt: stampStr_(r && r[17]),
    variants: [], items: []
  };
}

function packageToRow_(p) {
  return [p.collabId, p.marselPic, p.program, p.namaPaket, p.tagline, p.benefit,
    p.tanggal ? toSheetDate_(p.tanggal) : '', p.tujuan, p.produkPic,
    p.dibimbing, p.latsol, p.materi, p.tryout, p.drilling, p.liveClass, p.catatan,
    p.updatedBy, p.updatedAt];
}

// Berapa dari 13 field isi yang sudah terisi, dipecah per area — supaya terlihat sisi
// mana yang menahan. Sel kosong di spreadsheet tak bisa membedakan "belum" dari "tak perlu".
function packageFilled_(p) {
  var hit = function (list) {
    return list.filter(function (k) { return String((p && p[k]) || '').trim(); }).length;
  };
  var m = hit(PKG_MARSEL), d = hit(PKG_PRODUK);
  return {
    marsel: m, marselTotal: PKG_MARSEL.length,
    produk: d, produkTotal: PKG_PRODUK.length,
    total: m + d, grandTotal: PKG_MARSEL.length + PKG_PRODUK.length
  };
}

// Siapa boleh mengubah sisi mana. Manager/Leader bebas; kalau area sudah bertuan,
// hanya PIC-nya. Kalau BELUM bertuan, siapa pun yang jadi PIC proses di collab itu boleh
// mulai mengisi — tanpa ini paket baru jadi jalan buntu: tak ada PIC area, jadi cuma
// manager yang bisa menyentuh, sementara yang mengerjakan justru staff-nya.
function canEditPackageArea_(pkg, area, actor, terlibat) {
  var a = baseName_(actor); if (!a) return false;
  if (isManagerActor_(actor) || isLeaderActor_(actor)) return true;
  var pic = baseName_(area === 'marsel' ? (pkg && pkg.marselPic) : (pkg && pkg.produkPic));
  if (!pic) return !!terlibat;
  return pic === a;
}

// Apakah actor memegang salah satu proses di collab ini (termasuk PIC berbentuk peran).
function isCollabParticipant_(collabId, actor) {
  if (!baseName_(actor)) return false;
  var srows = [];
  try { srows = valuesGet_(CONFIG.COLLAB_STEP_SHEET + '!A2:D'); } catch (e) { return false; }
  return srows.some(function (r) {
    return String((r && r[0]) || '').trim() === collabId && canCheckStep_((r && r[3]) || '', actor, false);
  });
}

function readPackages_(prePkg, preVar, preItem) {
  var prows = [], vrows = [], irows = [];
  if (prePkg !== undefined) { prows = prePkg || []; vrows = preVar || []; irows = preItem || []; }
  else {
    try {
      prows = valuesGet_(CONFIG.PACKAGE_SHEET + '!A2:R');
      vrows = valuesGet_(CONFIG.PACKAGE_VARIANT_SHEET + '!A2:F');
      irows = valuesGet_(CONFIG.PACKAGE_ITEM_SHEET + '!A2:I');
    } catch (e) { return {}; }
  }
  var out = {};
  prows.forEach(function (r, i) {
    var p = rowToPackage_(r, i + 2);
    if (p.collabId) out[p.collabId] = p;
  });
  vrows.forEach(function (r, i) {
    var cid = String((r && r[0]) || '').trim(); if (!cid) return;
    if (!out[cid]) out[cid] = emptyPackage_(cid);
    out[cid].variants.push({
      row: i + 2, order: Number((r && r[1]) || 0),
      masaAktif: String((r && r[2]) || '').trim(),
      hargaAwal: Number((r && r[3]) || 0) || 0,
      hargaDiskon: Number((r && r[4]) || 0) || 0,
      status: String((r && r[5]) || '').trim() || 'aktif'
    });
  });
  irows.forEach(function (r, i) {
    var cid = String((r && r[0]) || '').trim(); if (!cid) return;
    if (!out[cid]) out[cid] = emptyPackage_(cid);
    out[cid].items.push({
      row: i + 2, order: Number((r && r[1]) || 0),
      kategori: String((r && r[2]) || '').trim(),
      grup: String((r && r[3]) || '').trim(),
      nama: String((r && r[4]) || '').trim(),
      jumlah: Number((r && r[5]) || 0) || 0,
      satuan: String((r && r[6]) || '').trim() || 'Paket',
      stepOrder: Number((r && r[7]) || 0) || 0,
      status: String((r && r[8]) || '').trim().toLowerCase() || 'belum'
    });
  });
  Object.keys(out).forEach(function (k) {
    out[k].variants.sort(function (a, b) { return a.order - b.order; });
    out[k].items.sort(function (a, b) { return a.order - b.order; });
  });
  return out;
}

function savePackage(collabId, payload, actor) {
  actor = String(actor || '').trim() || 'Unknown';
  collabId = String(collabId || '').trim();
  if (!collabId) return { success: false, message: 'Collab ID kosong.' };
  ensurePackageSheets_();
  payload = payload || {};
  var semua = readPackages_();
  var lama = semua[collabId] || emptyPackage_(collabId);
  var baru = {};
  Object.keys(lama).forEach(function (k) { baru[k] = lama[k]; });
  var terlibat = isCollabParticipant_(collabId, actor);
  var bolehMarsel = canEditPackageArea_(lama, 'marsel', actor, terlibat);
  var bolehProduk = canEditPackageArea_(lama, 'produk', actor, terlibat);
  var bos = isManagerActor_(actor) || isLeaderActor_(actor);
  var sentuh = 0;
  if (payload.marsel) {
    if (!bolehMarsel) return { success: false, message: 'Hanya PIC Area Marsel, Leader, atau Manager yang bisa mengubah sisi ini.' };
    PKG_MARSEL.forEach(function (k) {
      if (payload.marsel[k] !== undefined) baru[k] = String(payload.marsel[k] || '').trim();
    });
    // PIC area hanya boleh ditunjuk atasan — kalau tidak, PIC bisa mengoper tanggung jawabnya sendiri.
    if (payload.marsel.marselPic !== undefined && bos) baru.marselPic = String(payload.marsel.marselPic || '').trim();
    sentuh++;
  }
  if (payload.produk) {
    if (!bolehProduk) return { success: false, message: 'Hanya PIC Area Produk, Leader, atau Manager yang bisa mengubah sisi ini.' };
    PKG_PRODUK.forEach(function (k) {
      if (payload.produk[k] !== undefined) baru[k] = String(payload.produk[k] || '').trim();
    });
    if (payload.produk.produkPic !== undefined && bos) baru.produkPic = String(payload.produk.produkPic || '').trim();
    sentuh++;
  }
  // Varian (masa aktif + harga) ikut Area Marsel — di sheet Master pun kolomnya ada di band Marsel.
  if (payload.variants !== undefined) {
    if (!bolehMarsel) return { success: false, message: 'Varian & harga hanya bisa diubah PIC Area Marsel, Leader, atau Manager.' };
    sentuh++;
  }
  // Deliverable Area Produk.
  if (payload.items !== undefined) {
    if (!bolehProduk) return { success: false, message: 'Daftar deliverable hanya bisa diubah PIC Area Produk, Leader, atau Manager.' };
    sentuh++;
  }
  if (!sentuh) return { success: false, message: 'Tak ada yang diubah.' };
  baru.updatedBy = actor; baru.updatedAt = nowStamp_();
  var rowData = packageToRow_(baru);
  if (lama.row) valuesUpdate_(CONFIG.PACKAGE_SHEET + '!A' + lama.row + ':R' + lama.row, [rowData]);
  else valuesAppend_(CONFIG.PACKAGE_SHEET + '!A:R', [rowData]);
  if (payload.variants !== undefined) {
    purgeRowsForRef_(CONFIG.PACKAGE_VARIANT_SHEET, 'F', 0, collabId);
    var list = (payload.variants || []).filter(function (v) { return v && String(v.masaAktif || '').trim(); });
    if (list.length) {
      valuesAppend_(CONFIG.PACKAGE_VARIANT_SHEET + '!A:F', list.map(function (v, i) {
        return [collabId, i + 1, String(v.masaAktif || '').trim(),
          Number(v.hargaAwal || 0) || 0, Number(v.hargaDiskon || 0) || 0,
          String(v.status || 'aktif').trim()];
      }));
    }
  }
  if (payload.items !== undefined) {
    purgeRowsForRef_(CONFIG.PACKAGE_ITEM_SHEET, 'I', 0, collabId);
    var itl = (payload.items || []).filter(function (v) { return v && String(v.nama || '').trim(); });
    if (itl.length) {
      valuesAppend_(CONFIG.PACKAGE_ITEM_SHEET + '!A:I', itl.map(function (v, i) {
        return [collabId, i + 1,
          String(v.kategori || '').trim(), String(v.grup || '').trim(), String(v.nama || '').trim(),
          Number(v.jumlah || 0) || 0, String(v.satuan || 'Paket').trim(),
          Number(v.stepOrder || 0) || 0,
          // Status tersimpan hanya dipakai untuk item TANPA proses. Yang bertaut proses
          // statusnya diturunkan saat dibaca, jadi apa pun yang dikirim klien diabaikan.
          Number(v.stepOrder || 0) ? '' : (String(v.status || '').trim().toLowerCase() === 'siap' ? 'siap' : 'belum')];
      }));
    }
  }
  logActivity_(actor, 'Package Save', collabId, 'Master paket ' + collabId + ' diperbarui');
  return { success: true, message: 'Master paket tersimpan.', collabs: getCollabs() };
}

function getCollabs(preC, preS) {
  var crows = [], srows = [];
  if (preC !== undefined) { crows = preC || []; srows = preS || []; }
  else {
    try {
      crows = valuesGet_(CONFIG.COLLAB_SHEET + '!A2:I');
      srows = valuesGet_(CONFIG.COLLAB_STEP_SHEET + '!A2:K');
    } catch (e) { return []; }
  }
  var steps = {};
  srows.forEach(function (r, i) {
    var cid = String((r && r[0]) || '').trim();
    if (!cid) return;
    steps[cid] = steps[cid] || [];
    steps[cid].push({
      row: i + 2,
      order: Number((r && r[1]) || 0),
      name: String((r && r[2]) || '').trim(),
      pic: String((r && r[3]) || '').trim(),
      deadline: (r && r[4] !== null && r[4] !== undefined && r[4] !== '') ? formatDate_(r[4], false) : '',
      done: isChecked_(r && r[5]),
      doneBy: String((r && r[6]) || '').trim(),
      doneAt: stampStr_(r && r[7]),
      note: String((r && r[8]) || '').trim(),
      stage: String((r && r[9]) || '').trim(),  // OPSIONAL — baris lama tanpa kolom J terbaca ''
      link: String((r && r[10]) || '').trim()   // lampiran hasil — OPSIONAL
    });
  });
  Object.keys(steps).forEach(function (k) {
    steps[k].sort(function (a, b) { return a.order - b.order; });
  });

  // Master paket ikut dibawa di sini, bukan lewat panggilan terpisah: setiap jalur yang
  // menyegarkan state.collabs jadi otomatis menyegarkan paketnya juga.
  var pkgs = readPackages_();

  return crows.map(function (r, i) {
    var id = String((r && r[0]) || '').trim();
    var list = steps[id] || [];
    var done = list.filter(function (s) { return s.done; }).length;
    var pkg = pkgs[id] || emptyPackage_(id);
    pkg.filled = packageFilled_(pkg);
    // Status tiap deliverable diturunkan dari prosesnya di sini — satu-satunya tempat
    // yang punya item DAN daftar prosesnya sekaligus, jadi klien tak perlu menghitung ulang.
    var byOrder = {};
    list.forEach(function (s) { byOrder[s.order] = s; });
    pkg.items.forEach(function (it) {
      var st = it.stepOrder ? byOrder[it.stepOrder] : null;
      it.step = st ? { order: st.order, name: st.name, pic: st.pic, done: st.done, doneBy: st.doneBy } : null;
      // Proses yang ditunjuk bisa hilang kalau daftar prosesnya diringkas ulang.
      it.stepHilang = !!(it.stepOrder && !st);
      it.status = itemStatus_(it, st);
    });
    pkg.ringkas = itemRingkas_(pkg.items);
    return {
      row: i + 2,
      id: id,
      platform: String((r && r[1]) || '').trim(),
      title: String((r && r[2]) || '').trim(),
      description: String((r && r[3]) || '').trim(),
      createdBy: String((r && r[4]) || '').trim(),
      createdAt: stampStr_(r && r[5]),
      deadline: (r && r[6] !== null && r[6] !== undefined && r[6] !== '') ? formatDate_(r[6], false) : '',
      type: String((r && r[7]) || '').trim(),
      color: String((r && r[8]) || '').trim(),
      steps: list,
      done: done,
      total: list.length,
      status: (list.length && done >= list.length) ? 'Selesai' : 'Aktif',
      pkg: pkg
    };
  }).filter(function (c) { return c.id; });
}

function deleteStepRowsForCollab_(collabId) {
  var srows = [];
  try { srows = valuesGet_(CONFIG.COLLAB_STEP_SHEET + '!A2:A'); } catch (e) { return; }
  var rowsToDelete = [];
  srows.forEach(function (r, i) {
    if (String((r && r[0]) || '').trim() === collabId) rowsToDelete.push(i + 2);
  });
  deleteRows_(CONFIG.COLLAB_STEP_SHEET, rowsToDelete);
}

// Sub-ceklis proses dikunci ke id "COL-xxx#<urutan>", sedangkan urutan dihitung ulang tiap
// kali disimpan. Jadi saat proses disusun ulang, kunci itu WAJIB ikut dipetakan — kalau tidak,
// sub-ceklis tertinggal di nomor lama dan menempel ke proses yang salah.
// Proses yang dihapus: sub-ceklisnya ikut dibuang, supaya tidak diwarisi proses baru yang
// kebetulan menempati nomor itu.
/* Buang semua baris yang merujuk sebuah entitas — task ("TSK-055") maupun collab
   ("COL-016", termasuk kunci prosesnya "COL-016#2").
   Dipakai saat collab dihapus: komentar, notifikasi, dan riwayat aktivitasnya ikut hilang.
   Tanpa ini, nomor collab yang dipakai ulang (genCollabId_ = max+1) membuat collab BARU
   mewarisi percakapan milik collab yang sudah dihapus. */
function purgeRowsForRef_(sheetName, colLetter, colIdx, collabId) {
  var rows = [];
  try { rows = valuesGet_(sheetName + '!A2:' + colLetter); } catch (e) { return 0; }
  var hapus = [];
  rows.forEach(function (r, i) {
    var v = String((r || [])[colIdx] || '').trim();
    if (v === collabId || v.indexOf(collabId + '#') === 0) hapus.push(i + 2);
  });
  if (!hapus.length) return 0;
  deleteRows_(sheetName, hapus);
  return hapus.length;
}

function remapCollabChecklists_(collabId, orderMap) {
  var rows = [];
  try { rows = valuesGet_(CONFIG.CHECKLIST_SHEET + '!A2:A'); } catch (e) { return; }
  var re = new RegExp('^' + collabId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '#(\\d+)$');
  var updates = [], deletes = [];
  rows.forEach(function (r, i) {
    var m = re.exec(String((r && r[0]) || '').trim());
    if (!m) return;
    var rn = i + 2, lama = Number(m[1]), baru = orderMap[lama];
    if (!baru) { deletes.push(rn); return; }
    if (baru !== lama) updates.push({ row: rn, val: collabId + '#' + baru });
  });
  // Semua nilai baru dihitung dari nilai LAMA sebelum satu pun ditulis, jadi pertukaran
  // urutan (mis. 2 <-> 3) tidak saling menimpa.
  updates.forEach(function (u) { valuesUpdate_(CONFIG.CHECKLIST_SHEET + '!A' + u.row, [[u.val]]); });
  if (deletes.length) deleteRows_(CONFIG.CHECKLIST_SHEET, deletes);
}

function saveCollab(payload, actor) {
  actor = String(actor || '').trim() || 'Unknown';
  if (!canManageCollabActor_(actor)) return { success: false, message: 'Anda tak berhak membuat/mengubah task kolaborasi.' };

  var platform = String((payload && payload.platform) || '').trim();
  var title = String((payload && payload.title) || '').trim();
  var description = String((payload && payload.description) || '').trim();
  var deadline = String((payload && payload.deadline) || '').trim();  // deadline project keseluruhan
  var type = String((payload && payload.type) || '').trim();          // tipe task (Kanban per-tipe)
  var color = String((payload && payload.color) || '').trim();        // warna kartu
  var steps = (payload && Object.prototype.toString.call(payload.steps) === '[object Array]') ? payload.steps : [];
  if (!title) return { success: false, message: 'Judul task kolaborasi wajib diisi.' };

  // srcOrder = urutan asli proses saat form dibuka; dipakai agar status done/catatan
  // tetap ikut prosesnya saat urutan diubah (bukan mengikuti posisi). 0 = proses baru.
  var clean = steps.map(function (s) {
    return {
      name: String((s && s.name) || '').trim(),
      pic: String((s && s.pic) || '').trim(),
      deadline: String((s && s.deadline) || '').trim(),
      stage: String((s && s.stage) || '').trim(),
      link: (s && s.link !== undefined) ? String(s.link).trim() : undefined,
      srcOrder: Number((s && s.srcOrder) || 0)
    };
  }).filter(function (s) { return s.name; });
  if (!clean.length) return { success: false, message: 'Minimal 1 proses (nama proses wajib diisi).' };

  ensureCollabSheets_();
  var crows = [];
  try { crows = valuesGet_(CONFIG.COLLAB_SHEET + '!A2:I'); } catch (e) { crows = []; }
  var ids = crows.map(function (r) { return String((r && r[0]) || '').trim(); });
  var id = String((payload && payload.id) || '').trim();
  var isUpdate = !!(id && ids.indexOf(id) >= 0);

  // Pertahankan status "done" & catatan proses lama saat struktur diedit.
  var prevStep = {};
  if (isUpdate) {
    var existing = getCollabs().filter(function (c) { return c.id === id; })[0];
    if (existing) existing.steps.forEach(function (s) {
      prevStep[s.order] = { done: s.done, doneBy: s.doneBy, doneAt: s.doneAt, note: s.note, link: s.link };
    });
  }

  var dl = deadline ? toSheetDate_(deadline) : '';
  if (isUpdate) {
    var rn = ids.indexOf(id) + 2;
    var keepBy = String((crows[rn - 2] && crows[rn - 2][4]) || actor);
    var keepAt = String((crows[rn - 2] && crows[rn - 2][5]) || nowStamp_());
    valuesUpdate_(CONFIG.COLLAB_SHEET + '!A' + rn + ':I' + rn, [[id, platform, title, description, keepBy, keepAt, dl, type, color]]);
    deleteStepRowsForCollab_(id);
  } else {
    id = genCollabId_(ids);
    valuesAppend_(CONFIG.COLLAB_SHEET + '!A:I', [[id, platform, title, description, actor, nowStamp_(), dl, type, color]]);
  }

  var stepRows = clean.map(function (s, i) {
    var order = i + 1;
    var pd = prevStep[s.srcOrder] || {};   // bawa done/catatan dari proses asalnya (tahan reorder)
    return [id, order, s.name, s.pic, s.deadline ? toSheetDate_(s.deadline) : '',
      pd.done ? 'TRUE' : 'FALSE', pd.doneBy || '', pd.doneAt || '', pd.note || '', String((s && s.stage) || '').trim(), (s && s.link !== undefined ? String(s.link).trim() : (pd.link || ''))];
  });
  if (stepRows.length) valuesAppend_(CONFIG.COLLAB_STEP_SHEET + '!A:K', stepRows);

  // Sub-ceklis harus ikut berpindah bersama prosesnya (lihat remapCollabChecklists_).
  if (isUpdate) {
    var orderMap = {};
    clean.forEach(function (s, i) { if (s.srcOrder > 0) orderMap[s.srcOrder] = i + 1; });
    remapCollabChecklists_(id, orderMap);
  }

  logActivity_(actor, isUpdate ? 'Collab Update' : 'Collab Create', id, title + ' • ' + clean.length + ' proses');
  return { success: true, message: isUpdate ? 'Task kolaborasi diperbarui.' : 'Task kolaborasi dibuat.', collabs: getCollabs() };
}

function findStepRow_(srows, collabId, order) {
  for (var i = 0; i < srows.length; i++) {
    var r = srows[i];
    if (String((r && r[0]) || '').trim() === collabId && Number((r && r[1]) || 0) === order) return i;
  }
  return -1;
}

// PIC proses (atau manager/Dev) mengisi catatan proses — mis. minta tambahan deadline.
/* Lampiran hasil pada satu PROSES — OPSIONAL, izinnya sama dengan catatan proses:
   PIC proses itu sendiri (atau manager). Menyusun ulang proses tetap khusus Manager/Leader. */
function setCollabStepLink(collabId, order, link, actor) {
  collabId = String(collabId || '').trim();
  order = Number(order);
  actor = String(actor || '').trim() || 'Unknown';
  link = String(link || '').trim();
  if (link.length > 500) return { success: false, message: 'Link terlalu panjang (maks 500 karakter).' };
  ensureCollabSheets_();
  var srows = [];
  try { srows = valuesGet_(CONFIG.COLLAB_STEP_SHEET + '!A2:K'); } catch (e) { srows = []; }
  var idx = -1;
  for (var i = 0; i < srows.length; i++) {
    var r = srows[i];
    if (String((r && r[0]) || '').trim() === collabId && Number((r && r[1]) || 0) === order) { idx = i; break; }
  }
  if (idx < 0) return { success: false, message: 'Proses tidak ditemukan. Muat ulang.' };
  var pic = String((srows[idx] && srows[idx][3]) || '').trim();
  if (!isManagerActor_(actor) && !canCheckStep_(pic, actor)) {
    return { success: false, message: 'Hanya ' + (pic || 'PIC proses ini') + ' atau manager yang bisa mengisi link hasil.' };
  }
  valuesUpdate_(CONFIG.COLLAB_STEP_SHEET + '!K' + (idx + 2), [[link]]);
  logActivity_(actor, 'Collab Step Link', collabId, 'Proses ' + order + ': ' + (link ? 'link hasil diperbarui' : 'link hasil dihapus'));
  return { success: true, message: link ? 'Link hasil disimpan.' : 'Link hasil dihapus.', collabs: getCollabs() };
}

function setCollabStepNote(collabId, order, note, actor) {
  collabId = String(collabId || '').trim();
  order = Number(order);
  actor = String(actor || '').trim() || 'Unknown';
  ensureCollabSheets_();
  var srows = [];
  try { srows = valuesGet_(CONFIG.COLLAB_STEP_SHEET + '!A2:K'); } catch (e) { srows = []; }
  var idx = findStepRow_(srows, collabId, order);
  if (idx < 0) return { success: false, message: 'Proses tidak ditemukan. Muat ulang.' };
  var pic = String((srows[idx] && srows[idx][3]) || '').trim();
  if (!isManagerActor_(actor) && !canCheckStep_(pic, actor)) {
    return { success: false, message: 'Hanya ' + (pic || 'PIC proses ini') + ' atau manager yang bisa mengisi catatan.' };
  }
  valuesUpdate_(CONFIG.COLLAB_STEP_SHEET + '!I' + (idx + 2), [[String(note || '').trim()]]);
  logActivity_(actor, 'Collab Step Note', collabId, 'Proses ' + order + ': catatan diperbarui');
  return { success: true, message: 'Catatan proses disimpan.', collabs: getCollabs() };
}

// Ubah tipe task (dipakai drag antar kolom Kanban per-tipe).
function setCollabType(collabId, type, actor) {
  actor = String(actor || '').trim() || 'Unknown';
  if (!canManageCollabActor_(actor)) return { success: false, message: 'Anda tak berhak mengubah tipe task.' };
  collabId = String(collabId || '').trim();
  ensureCollabSheets_();
  var crows = [];
  try { crows = valuesGet_(CONFIG.COLLAB_SHEET + '!A2:H'); } catch (e) { crows = []; }
  var ci = -1;
  for (var i = 0; i < crows.length; i++) {
    if (String((crows[i] && crows[i][0]) || '').trim() === collabId) { ci = i; break; }
  }
  if (ci < 0) return { success: false, message: 'Task kolaborasi tidak ditemukan.' };
  valuesUpdate_(CONFIG.COLLAB_SHEET + '!H' + (ci + 2), [[String(type || '').trim()]]);
  logActivity_(actor, 'Collab Type', collabId, 'Tipe → ' + (type || '(kosong)'));
  return { success: true, message: 'Tipe task diperbarui.', collabs: getCollabs() };
}

function setCollabStepDone(collabId, order, done, actor) {
  collabId = String(collabId || '').trim();
  order = Number(order);
  actor = String(actor || '').trim() || 'Unknown';
  var val = !!done;
  ensureCollabSheets_();
  var srows = [];
  try { srows = valuesGet_(CONFIG.COLLAB_STEP_SHEET + '!A2:H'); } catch (e) { srows = []; }
  var idx = findStepRow_(srows, collabId, order);
  if (idx < 0) return { success: false, message: 'Proses tidak ditemukan. Muat ulang.' };
  var pic = String((srows[idx] && srows[idx][3]) || '').trim();
  if (!canCheckStep_(pic, actor, !val)) {
    return { success: false, message: val
      ? 'Hanya ' + (pic || 'PIC proses ini') + ' yang bisa mencentang proses ini.'
      : 'Hanya ' + (pic || 'PIC proses ini') + ' atau Manager yang bisa membatalkan centang ini.' };
  }
  // Main-ceklis proses tak boleh dicentang selama sub-ceklisnya belum tuntas
  // (membatalkan centang selalu boleh).
  if (val) {
    var sub = getChecklist(collabId + '#' + order);
    var undone = sub.filter(function (i2) { return !i2.done; }).length;
    if (sub.length && undone > 0) {
      return { success: false, message: 'Selesaikan dulu semua sub-ceklis proses ini (' + (sub.length - undone) + '/' + sub.length + ').' };
    }
  }
  var rn = idx + 2;
  valuesUpdate_(CONFIG.COLLAB_STEP_SHEET + '!F' + rn + ':H' + rn,
    [[val ? 'TRUE' : 'FALSE', val ? actor : '', val ? nowStamp_() : '']]);
  logActivity_(actor, val ? 'Collab Step Done' : 'Collab Step Undone', collabId,
    'Proses ' + order + ': ' + String((srows[idx] && srows[idx][2]) || ''));

  // Handoff: beri tahu PIC proses berikutnya bahwa sekarang gilirannya.
  if (val) {
    try {
      var next = findStepRow_(srows, collabId, order + 1);
      if (next >= 0) {
        var nextPic = String((srows[next] && srows[next][3]) || '').trim();
        var nextName = String((srows[next] && srows[next][2]) || '').trim();
        if (nextPic && baseName_(nextPic) !== baseName_(actor)) {
          addNotification_(nextPic, 'turn', collabId, actor,
            'Giliran Anda: "' + nextName + '" (setelah ' + actor + ' menyelesaikan proses ' + order + ')');
        }
      }
    } catch (e) { /* notifikasi tak boleh menggagalkan centang */ }
  }
  return { success: true, message: val ? 'Proses dicentang.' : 'Centang dibatalkan.', collabs: getCollabs() };
}

function deleteCollab(id, actor) {
  actor = String(actor || '').trim() || 'Unknown';
  if (!canManageCollabActor_(actor)) return { success: false, message: 'Anda tak berhak menghapus task kolaborasi.' };
  id = String(id || '').trim();
  ensureCollabSheets_();
  deleteStepRowsForCollab_(id);
  // Sub-ceklisnya ikut dibuang. Nomor collab dipakai ulang (genCollabId_ = max+1), jadi bila
  // dibiarkan menggantung, collab BARU akan mewarisi sub-ceklis milik collab yang dihapus.
  remapCollabChecklists_(id, {});
  var crows = [];
  try { crows = valuesGet_(CONFIG.COLLAB_SHEET + '!A2:F'); } catch (e) { crows = []; }
  var ci = -1;
  for (var i = 0; i < crows.length; i++) {
    if (String((crows[i] && crows[i][0]) || '').trim() === id) { ci = i; break; }
  }
  if (ci >= 0) deleteRows_(CONFIG.COLLAB_SHEET, [ci + 2]);
  // Komentar, notifikasi, dan riwayat aktivitasnya ikut dibuang.
  var ikut = 0;
  ikut += purgeRowsForRef_(CONFIG.COMMENTS_SHEET, 'D', 1, id);   // B = Task ID
  ikut += purgeRowsForRef_(CONFIG.NOTIF_SHEET, 'H', 3, id);      // D = Ref ID
  ikut += purgeRowsForRef_(CONFIG.ACTIVITY_SHEET, 'E', 3, id);   // D = Task ID
  // Master paket & variannya ikut dibuang. Tanpa ini, collab BARU yang memakai ulang
  // nomor itu (genCollabId_ = max+1) akan mewarisi harga & isi paket milik yang dihapus.
  ikut += purgeRowsForRef_(CONFIG.PACKAGE_SHEET, 'R', 0, id);
  ikut += purgeRowsForRef_(CONFIG.PACKAGE_VARIANT_SHEET, 'F', 0, id);
  ikut += purgeRowsForRef_(CONFIG.PACKAGE_ITEM_SHEET, 'I', 0, id);
  // Jejak penghapusan dicatat TANPA taskId, supaya tak nyangkut di feed collab bernomor sama.
  logActivity_(actor, 'Collab Delete', '', id + ' dihapus (' + ikut + ' komentar/notifikasi/aktivitas ikut dibuang)');
  return { success: true, message: 'Task kolaborasi dihapus.', collabs: getCollabs() };
}

/* ================================================================== */
/* NOTIFIKASI (tag @user + handoff giliran -> lonceng in-app)         */
/* ================================================================== */

function addNotification_(forUser, type, refId, from, text) {
  if (!String(forUser || '').trim()) return;
  ensureNotificationsSheet_();
  var id = 'N' + new Date().getTime() + '-' + Math.floor(Math.random() * 1e6);
  valuesAppend_(CONFIG.NOTIF_SHEET + '!A:H',
    [[id, String(forUser), String(type || ''), String(refId || ''), String(from || ''), String(text || ''), nowStamp_(), 'FALSE']]);
}

function getNotifications(user) {
  var rows = [];
  try { rows = valuesGet_(CONFIG.NOTIF_SHEET + '!A2:H'); } catch (e) { return []; }
  var u = baseName_(user);
  if (!u) return [];
  return rows
    .map(function (r, i) {
      return {
        row: i + 2,
        id: String((r && r[0]) || ''),
        forUser: String((r && r[1]) || ''),
        type: String((r && r[2]) || ''),
        refId: String((r && r[3]) || ''),
        from: String((r && r[4]) || ''),
        text: String((r && r[5]) || ''),
        createdAt: stampStr_(r && r[6]),
        read: isChecked_(r && r[7])
      };
    })
    .filter(function (n) { return baseName_(n.forUser) === u; })
    .reverse(); // terbaru dulu
}

function markNotificationsRead(user, refId) {
  ensureNotificationsSheet_();
  var rows = [];
  try { rows = valuesGet_(CONFIG.NOTIF_SHEET + '!A2:H'); } catch (e) { return { success: true, notifications: [] }; }
  var u = baseName_(user), ref = String(refId || '').trim();
  var data = [];
  rows.forEach(function (r, i) {
    var fu = baseName_((r && r[1]) || '');
    var rf = String((r && r[3]) || '').trim();
    var read = isChecked_(r && r[7]);
    if (fu === u && !read && (!ref || rf === ref)) {
      data.push({ range: CONFIG.NOTIF_SHEET + '!H' + (i + 2), values: [['TRUE']] });
    }
  });
  valuesBatchUpdate_(data);
  return { success: true, notifications: getNotifications(user) };
}

// Parse @Nama pada komentar -> notifikasi untuk tiap user valid yang di-tag.
// @everyone / @semua / @all -> tag SEMUA user (kecuali penulis & user lihat-saja).
var MENTION_ALL = ['everyone', 'semua', 'all'];
// @peran -> tag semua user AKTIF dengan peran itu (mis. @staff, @magang).
// "Dev" & "Lihat Saja" sengaja tidak ikut: yang pertama akun teknis, yang kedua tamu baca.
var MENTION_ROLES = ['manager', 'leader', 'staff', 'magang'];
function createMentionNotifications_(refId, author, message) {
  var msg = String(message || '');
  if (msg.indexOf('@') < 0) return;
  var pics = [];
  try { pics = getOptions().pic || []; } catch (e) { pics = []; }
  var validPics = pics.filter(function (p) { return baseName_(p) !== 'lintas divisi'; });
  // Kumpulan nama = dropdown PIC + baris USERS. Kalau hanya PIC, nama yang belum masuk
  // dropdown gagal dicocokkan lalu JATUH ke tag peran — "@Magang A" berubah jadi "@magang"
  // dan menotifikasi seluruh anak magang. Nama harus selalu menang atas peran.
  var namaSah = validPics.slice();
  if (usersConfigured_()) {
    usersRaw_().forEach(function (u) {
      if (u.active === false || baseName_(u.name) === 'lintas divisi') return;
      var ada = namaSah.some(function (p) { return baseName_(p) === baseName_(u.name); });
      if (!ada) namaSah.push(u.name);
    });
  }
  // Cocokkan nama TERPANJANG dulu supaya nama ber-spasi ("Staff Data", "Budi Santoso")
  // tidak tertukar dengan nama lain yang kata depannya sama ("Staff Soal").
  var sorted = namaSah.slice().sort(function (a, b) { return String(b).length - String(a).length; });

  var targets = [];
  var addTarget = function (p) { if (targets.indexOf(p) < 0) targets.push(p); };
  var tagAll = false;
  var peranDitag = [];

  var lower = msg.toLowerCase();
  for (var i = 0; i < msg.length; i++) {
    if (msg.charAt(i) !== '@') continue;
    var rest = lower.substring(i + 1);
    var matched = false;
    // 1) Nama user (boleh mengandung spasi).
    for (var k = 0; k < sorted.length; k++) {
      var nm = baseName_(sorted[k]);
      if (!nm || rest.indexOf(nm) !== 0) continue;
      var after = rest.charAt(nm.length);
      if (after && /[A-Za-z0-9]/.test(after)) continue;   // "@Staff" jangan cocok ke tengah kata
      if (baseName_(sorted[k]) !== baseName_(author)) addTarget(sorted[k]);
      matched = true; break;
    }
    if (matched) continue;
    // 2) @everyone / @semua / @all
    var kenaSemua = false;
    for (var m = 0; m < MENTION_ALL.length; m++) {
      var kw = MENTION_ALL[m];
      if (rest.indexOf(kw) === 0 && !/[A-Za-z0-9]/.test(rest.charAt(kw.length) || '')) { tagAll = true; kenaSemua = true; break; }
    }
    if (kenaSemua) continue;
    // 3) @peran -> semua user aktif berperan itu
    for (var q = 0; q < MENTION_ROLES.length; q++) {
      var rl = MENTION_ROLES[q];
      if (rest.indexOf(rl) === 0 && !/[A-Za-z0-9]/.test(rest.charAt(rl.length) || '')) { if (peranDitag.indexOf(rl) < 0) peranDitag.push(rl); break; }
    }
  }
  if (tagAll) validPics.forEach(function (p) { if (baseName_(p) !== baseName_(author)) addTarget(p); });
  if (peranDitag.length && usersConfigured_()) {
    usersRaw_().forEach(function (u) {
      if (u.active === false) return;
      if (peranDitag.indexOf(String(u.role || '').trim().toLowerCase()) < 0) return;
      if (baseName_(u.name) === baseName_(author)) return;
      addTarget(u.name);
    });
  }
  if (!targets.length) return;

  var sasaran = tagAll ? 'semua' : (peranDitag.length ? peranDitag.join('/') : 'Anda');
  var text = author + ' men-tag ' + sasaran + ': "' + msg.slice(0, 90) + '"';
  targets.forEach(function (t) { addNotification_(t, 'mention', refId, author, text); });
}

/* ================================================================== */
/* ACTIVITY                                                           */
/* ================================================================== */

function logActivity_(user, action, taskId, detail) {
  try {
    valuesAppend_(CONFIG.ACTIVITY_SHEET + '!A:E',
      [[nowStamp_(), String(user || 'Unknown'), String(action || ''), String(taskId || ''), String(detail || '')]]);
  } catch (e) {
    // Logging tidak boleh menggagalkan operasi utama.
  }
}

function getActivityLog(limit, pre) {
  var rows = [];
  if (pre !== undefined) rows = pre;
  else { try { rows = valuesGet_(CONFIG.ACTIVITY_SHEET + '!A2:E'); } catch (e) { return []; } }
  var out = rows
    .map(function (r) {
      return {
        timestamp: formatDate_(r[0], true),
        user: String(r[1] || ''),
        action: String(r[2] || ''),
        taskId: String(r[3] || ''),
        detail: String(r[4] || '')
      };
    })
    .filter(function (r) { return r.timestamp || r.user; });
  out.reverse(); // terbaru di atas
  var max = Number(limit) > 0 ? Number(limit) : 200;
  return out.slice(0, max);
}

/* ================================================================== */
/* BOOTSTRAP (satu panggilan untuk semua data awal)                   */
/* ================================================================== */

function getAllCommentsLite_(pre) {
  var rows = [];
  if (pre !== undefined) rows = pre;
  else { try { rows = valuesGet_(CONFIG.COMMENTS_SHEET + '!A2:D'); } catch (e) { return []; } }
  return rows
    .map(function (r) {
      return { timestamp: formatDate_(r && r[0], true), taskId: String((r && r[1]) || ''), author: String((r && r[2]) || '') };
    })
    .filter(function (c) { return c.taskId; });
}

function getBootstrapData(opts) {
  var viewOnly = !!(opts && opts.viewOnly);

  var tasks = getTasks();
  var options = getOptions();
  var activity = getActivityLog(200);
  var commentsSummary = getAllCommentsLite_();
  var pinUsers = listPinUsers();
  var links = getAllLinks();
  var dashboards = getAllDashboards();
  var notes = getAllNotes();
  var checklistSummary = getChecklistSummary_();
  var collabs = [];
  try { collabs = getCollabs(); } catch (e) { collabs = []; }

  var meta = {
    sheetName: CONFIG.TASK_SHEET,
    managers: getManagers_(),
    doneApprovers: getDoneApprovers_(),
    collabManagers: getCollabManagers_(),
    users: getUsers(),        // sumber peran untuk UI (Dev/Manager/Leader/Staff/Lihat Saja)
    roles: ROLES,
    generatedAt: nowStamp_()
  };

  if (viewOnly) {
    // Tamu: hanya task Lintas Divisi (punya Divisi Tujuan) atau yang di-mirror.
    var shown = tasks.filter(function (t) {
      var ext = String((t && t.divisiTujuan) || '').trim() !== '';
      var mir = /^(ya|yes|true|1)$/i.test(String((t && t.mirror) || '').trim());
      return ext || mir;
    });
    var shownIds = {};
    shown.forEach(function (t) { shownIds[t.id] = true; });
    return {
      tasks: shown,
      options: options,
      activity: [],
      commentsSummary: commentsSummary.filter(function (c) { return shownIds[c.taskId]; }),
      pinUsers: [],
      links: [],
      dashboards: dashboards || [],
      notes: [],
      viewOnly: true,
      meta: meta
    };
  }

  return {
    tasks: tasks,
    options: options,
    activity: activity,
    commentsSummary: commentsSummary,
    pinUsers: pinUsers,
    links: links,
    dashboards: dashboards,
    notes: notes,
    checklistSummary: checklistSummary,
    collabs: collabs,
    meta: meta
  };
}

/* ================================================================== */
/* SETUP SHEET & VALIDASI                                             */
/* ================================================================== */

function ensureOptionsSheet_() {
  sheet_(CONFIG.OPTIONS_SHEET, true);
  var head = valuesGet_(CONFIG.OPTIONS_SHEET + '!A1:D1');
  var h0 = head[0] || [];
  if (!h0[0]) valuesUpdate_(CONFIG.OPTIONS_SHEET + '!A1:D1', [['Type', 'Value', 'Active', 'Parent']]);
  else if (!h0[3]) valuesUpdate_(CONFIG.OPTIONS_SHEET + '!D1', [['Parent']]);

  // Seed opsi default yang belum ada.
  var existing = readOptionsRaw_();
  var toAppend = [];
  OPTION_TYPES.forEach(function (type) {
    (DEFAULT_OPTIONS[type] || []).forEach(function (value) {
      var exists = existing.some(function (r) {
        return r.type === type && r.value.toLowerCase() === String(value).toLowerCase();
      });
      if (!exists) toAppend.push([type, value, true, '']);
    });
  });
  if (toAppend.length) valuesAppend_(CONFIG.OPTIONS_SHEET + '!A:D', toAppend);
}

// Template rumus nama task: Stage -> Kata Kerja -> Objek.
var FORMULA_TEMPLATE = {
  'RnD': { 'Menyusun': ['kurikulum', 'product knowledge', 'silabus', 'sistem penilaian', 'panduan'], 'Membuat': ['mapping', 'prompt'], 'Melakukan': ['riset'] },
  'Develop Materi': { 'Menyusun': ['materi', 'journey'], 'Mengambil (take)': ['video pembahasan'], 'Melakukan': ['syuting', 'retake'] },
  'Develop Soal': { 'Membuat': ['soal', 'pembahasan'], 'Menyusun': ['paket tryout'] },
  'QC Konten': { 'Melakukan': ['QC'], 'Memperbarui': ['bumper', 'thumbnail'] },
  'Input': { 'Menginput': ['soal', 'video pembahasan', 'jadwal'], 'Membangun': ['sistem otomatis'] },
  'Liveclass': { 'Memonitor': ['liveclass'], 'Menyusun': ['jadwal'] },
  'Manajemen Sistem': { 'Merapikan': ['subbab'], 'Menyusun': ['kerangka kategori'], 'Generate/regenerate': ['paket'], 'Menampilkan/menyembunyikan': ['kategori'] },
  'Manajemen Guru': { 'Mendistribusikan': ['proyek video pembahasan', 'proyek komplit'], 'Menyusun': ['jadwal'] },
  'Data & Intelligence': { 'Membuat': ['query'], 'Melakukan': ['scraping'], 'Membangun': ['dashboard'] },
  'Report': { 'Menyelesaikan': ['report'], 'Mengelompokkan': ['data'] }
};

function seedFormulaTemplate() {
  ensureOptionsSheet_();
  var existing = readOptionsRaw_();
  var has = function (type, value, parent) {
    return existing.some(function (r) {
      return r.type === type && r.value.toLowerCase() === String(value).toLowerCase()
        && (USES_PARENT.indexOf(type) < 0 || r.parent.toLowerCase() === String(parent || '').toLowerCase());
    });
  };
  var toAppend = [];
  Object.keys(FORMULA_TEMPLATE).forEach(function (stage) {
    if (!has('stage', stage)) toAppend.push(['stage', stage, true, '']);
    Object.keys(FORMULA_TEMPLATE[stage]).forEach(function (verb) {
      if (!has('verb', verb, stage)) toAppend.push(['verb', verb, true, stage]);
      FORMULA_TEMPLATE[stage][verb].forEach(function (objek) {
        var p = stage + '||' + verb;
        if (!has('object', objek, p)) toAppend.push(['object', objek, true, p]);
      });
    });
  });
  if (toAppend.length) valuesAppend_(CONFIG.OPTIONS_SHEET + '!A:D', toAppend);
  try { applySheetValidations_(); } catch (e) { /* abaikan */ }
  return { success: true, message: 'Template terisi: ' + toAppend.length + ' baris baru (stage + kata kerja + objek).', options: getOptions() };
}

function ensureCommentsSheet_() {
  sheet_(CONFIG.COMMENTS_SHEET, true);
  var head = valuesGet_(CONFIG.COMMENTS_SHEET + '!A1:D1');
  if (!head.length || !head[0] || !head[0][0]) {
    valuesUpdate_(CONFIG.COMMENTS_SHEET + '!A1:D1', [SHEET_HEADERS[CONFIG.COMMENTS_SHEET]]);
  }
}

function ensureActivitySheet_() {
  sheet_(CONFIG.ACTIVITY_SHEET, true);
  var head = valuesGet_(CONFIG.ACTIVITY_SHEET + '!A1:E1');
  if (!head.length || !head[0] || !head[0][0]) {
    valuesUpdate_(CONFIG.ACTIVITY_SHEET + '!A1:E1', [SHEET_HEADERS[CONFIG.ACTIVITY_SHEET]]);
  }
}

function ensureChecklistSheet_() {
  sheet_(CONFIG.CHECKLIST_SHEET, true);
  var head = valuesGet_(CONFIG.CHECKLIST_SHEET + '!A1:G1');
  if (!head.length || !head[0] || !head[0][0]) {
    valuesUpdate_(CONFIG.CHECKLIST_SHEET + '!A1:G1', [SHEET_HEADERS[CONFIG.CHECKLIST_SHEET]]);
  }
}

function ensureCollabSheets_() {
  sheet_(CONFIG.COLLAB_SHEET, true);
  var head = valuesGet_(CONFIG.COLLAB_SHEET + '!A1:I1');
  var h0 = head[0] || [];
  if (!h0[0]) valuesUpdate_(CONFIG.COLLAB_SHEET + '!A1:I1', [SHEET_HEADERS[CONFIG.COLLAB_SHEET]]);
  else {
    if (!h0[6]) valuesUpdate_(CONFIG.COLLAB_SHEET + '!G1', [['Deadline']]);
    if (!h0[7]) valuesUpdate_(CONFIG.COLLAB_SHEET + '!H1', [['Type']]);
    if (!h0[8]) valuesUpdate_(CONFIG.COLLAB_SHEET + '!I1', [['Color']]);
  }
  sheet_(CONFIG.COLLAB_STEP_SHEET, true);
  head = valuesGet_(CONFIG.COLLAB_STEP_SHEET + '!A1:K1');
  h0 = head[0] || [];
  if (!h0[0]) valuesUpdate_(CONFIG.COLLAB_STEP_SHEET + '!A1:K1', [SHEET_HEADERS[CONFIG.COLLAB_STEP_SHEET]]);
  else {
    if (!h0[8]) valuesUpdate_(CONFIG.COLLAB_STEP_SHEET + '!I1', [['Note']]);
    if (!h0[9]) valuesUpdate_(CONFIG.COLLAB_STEP_SHEET + '!J1', [['Stage']]);   // stage per proses — OPSIONAL
    if (!h0[10]) valuesUpdate_(CONFIG.COLLAB_STEP_SHEET + '!K1', [['Link']]);    // lampiran hasil — OPSIONAL
  }
}

function ensureNotificationsSheet_() {
  sheet_(CONFIG.NOTIF_SHEET, true);
  var head = valuesGet_(CONFIG.NOTIF_SHEET + '!A1:H1');
  if (!head.length || !head[0] || !head[0][0]) {
    valuesUpdate_(CONFIG.NOTIF_SHEET + '!A1:H1', [SHEET_HEADERS[CONFIG.NOTIF_SHEET]]);
  }
}

function ensureTaskHeaders_() {
  var sh = sheet_(CONFIG.TASK_SHEET, true);
  var range = CONFIG.TASK_SHEET + '!' + CONFIG.FIRST_COL_LETTER + CONFIG.HEADER_ROW + ':' + CONFIG.LAST_COL_LETTER + CONFIG.HEADER_ROW;
  var cur = valuesGet_(range, { display: true });
  var norm = function (s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); };
  var have = (cur[0] || []).map(norm);
  var ok = TASK_HEADERS.every(function (h, i) { return norm(have[i]) === norm(h); });
  if (!ok) {
    valuesUpdate_(range, [TASK_HEADERS]);
    try {
      sh.getRange(CONFIG.HEADER_ROW, colToIdx_(CONFIG.FIRST_COL_LETTER) + 1, 1, TASK_HEADERS.length)
        .setFontWeight('bold').setBackground('#eef2ff');
      sh.setFrozenRows(CONFIG.HEADER_ROW);
    } catch (e) { /* kosmetik saja */ }
  }
}

function applySheetValidations_() {
  var sh = sheet_(CONFIG.TASK_SHEET, false);
  if (!sh) return;
  var options = getOptions();
  var maxRows = sh.getMaxRows();
  var numRows = maxRows - CONFIG.FIRST_DATA_ROW + 1;
  if (numRows <= 0) return;

  Object.keys(VALIDATION_MAP).forEach(function (header) {
    var list = options[VALIDATION_MAP[header]] || [];
    if (!list.length) return;
    var headerIdx = TASK_HEADERS.indexOf(header);
    if (headerIdx === -1) return;
    var colIndex = colToIdx_(CONFIG.FIRST_COL_LETTER) + headerIdx + 1; // 1-based
    if (colIndex > sh.getMaxColumns()) return;
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(list.map(String), true)
      .setAllowInvalid(true)   // longgar: nilai lama tetap boleh
      .build();
    sh.getRange(CONFIG.FIRST_DATA_ROW, colIndex, numRows, 1).setDataValidation(rule);
  });
}

function setupTaskTracker() {
  ensureTaskHeaders_();
  ensureOptionsSheet_();
  ensureCommentsSheet_();
  ensureChecklistSheet_();
  ensureCollabSheets_();
  ensureNotificationsSheet_();
  ensureActivitySheet_();
  ensureUsersSheet_();
  ensureAuthSheet_();
  ensureLinksSheet_();
  ensureDashboardsSheet_();
  ensureNotesSheet_();
  try { applySheetValidations_(); } catch (e) { /* abaikan */ }
  return {
    success: true,
    message: 'Setup selesai. Sheet Main, OPTIONS, COMMENTS, ACTIVITY, dropdown, dan header dasar sudah siap.',
    spreadsheetUrl: ss_().getUrl()
  };
}

// Isi Task ID untuk baris yang punya Task Name tapi kolom Task ID-nya kosong
// (mis. baris yang diketik langsung di spreadsheet).
function assignMissingTaskIds() {
  var rows = valuesGet_(mainDataRange_());
  var max = 0;
  rows.forEach(function (r) {
    var m = String((r && r[0]) || '').match(/(\d+)\s*$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  var data = [];
  rows.forEach(function (row, idx) {
    var tid = String((row && row[0]) || '').trim();
    var name = String((row && row[5]) || '').trim(); // kolom G (Task Name)
    if (!tid && name) {
      max += 1;
      var rowNumber = CONFIG.FIRST_DATA_ROW + idx;
      data.push({ range: CONFIG.TASK_SHEET + '!' + COL.taskId + rowNumber, values: [['TSK-' + ('00' + max).slice(-3)]] });
    }
  });
  valuesBatchUpdate_(data);
  return { success: true, message: data.length + ' Task ID baru dibuat untuk baris yang belum punya ID.', assigned: data.length, tasks: getTasks() };
}

/* ================================================================== */
/* PIN PER-USER (sheet AUTH tersembunyi, hanya hash yang disimpan)     */
/* ================================================================== */

function hashPin_(user, pin) {
  var salt = prop_('PIN_SALT', 'pt_pin_salt_v1');
  var raw = String(user || '').toLowerCase().trim() + ':' + String(pin || '') + ':' + salt;
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] & 0xff;
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

function ensureAuthSheet_() {
  var sh = sheet_(CONFIG.AUTH_SHEET, true);
  var head = valuesGet_(CONFIG.AUTH_SHEET + '!A1:B1');
  if (!head.length || !head[0] || !head[0][0]) {
    valuesUpdate_(CONFIG.AUTH_SHEET + '!A1:B1', [SHEET_HEADERS[CONFIG.AUTH_SHEET]]);
  }
  try { if (sh && !sh.isSheetHidden()) sh.hideSheet(); } catch (e) { /* abaikan */ }
}

function readAuthRaw_(pre) {
  try {
    var rows = (pre !== undefined) ? pre : valuesGet_(CONFIG.AUTH_SHEET + '!A2:B');
    return rows
      .map(function (r) { return { user: String((r && r[0]) || '').trim(), hash: String((r && r[1]) || '').trim() }; })
      .filter(function (r) { return r.user; });
  } catch (e) { return []; }
}

// Verifikasi PIN.
//  - Mode Dev (user === '__dev__'): cocokkan dengan DEV_PIN.
//  - User biasa: kalau punya PIN khusus wajib cocok; kalau belum, bebas.
function verifyPin(user, pin) {
  user = String(user || '').trim();
  if (user === '__dev__') {
    var devPin = prop_('DEV_PIN', '');
    if (!devPin) return { ok: false, message: 'DEV_PIN belum diset di Script Properties.' };
    return { ok: String(pin || '').trim() === devPin };
  }
  var rows = readAuthRaw_();
  var found = rows.filter(function (r) { return r.user.toLowerCase() === user.toLowerCase(); })[0];
  if (!found) return { ok: true, noPin: true };
  return { ok: hashPin_(user, pin) === found.hash };
}

function setUserPin(user, pin) {
  user = String(user || '').trim();
  pin = String(pin || '').trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  if (!/^\d{4}$/.test(pin)) return { success: false, message: 'PIN harus 4 digit angka.' };
  ensureAuthSheet_();
  var rows = readAuthRaw_();
  var hash = hashPin_(user, pin);
  var idx = -1;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].user.toLowerCase() === user.toLowerCase()) { idx = i; break; }
  }
  if (idx === -1) valuesAppend_(CONFIG.AUTH_SHEET + '!A:B', [[user, hash]]);
  else valuesUpdate_(CONFIG.AUTH_SHEET + '!B' + (idx + 2), [[hash]]);
  return { success: true, message: 'PIN untuk ' + user + ' disimpan.' };
}

function deleteUserPin(user) {
  user = String(user || '').trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  var rows = [];
  try { rows = valuesGet_(CONFIG.AUTH_SHEET + '!A2:B'); } catch (e) { return { success: true, message: 'Tidak ada PIN.', removed: false }; }
  var i = -1;
  for (var k = 0; k < rows.length; k++) {
    if (String((rows[k] && rows[k][0]) || '').trim().toLowerCase() === user.toLowerCase()) { i = k; break; }
  }
  if (i === -1) return { success: true, message: 'User belum punya PIN.', removed: false };
  if (!sheet_(CONFIG.AUTH_SHEET, false)) return { success: false, message: 'Sheet AUTH tidak ditemukan.' };
  deleteRows_(CONFIG.AUTH_SHEET, [2 + i]);
  return { success: true, message: 'PIN untuk ' + user + ' dihapus.', removed: true };
}

// Daftar user yang punya PIN khusus (hash TIDAK dikirim ke browser).
function listPinUsers(pre) {
  return readAuthRaw_(pre).map(function (r) { return r.user; });
}

/* ================================================================== */
/* LINK PER-USER                                                      */
/* ================================================================== */

function ensureLinksSheet_() {
  sheet_(CONFIG.LINKS_SHEET, true);
  var head = valuesGet_(CONFIG.LINKS_SHEET + '!A1:D1');
  var h0 = head[0] || [];
  if (!h0[0]) valuesUpdate_(CONFIG.LINKS_SHEET + '!A1:D1', [SHEET_HEADERS[CONFIG.LINKS_SHEET]]);
  else if (!h0[3]) valuesUpdate_(CONFIG.LINKS_SHEET + '!D1', [['Folder']]);
}

function getAllLinks(pre) {
  var rows = [];
  if (pre !== undefined) rows = pre;
  else { try { rows = valuesGet_(CONFIG.LINKS_SHEET + '!A2:D'); } catch (e) { return []; } }
  return rows
    .map(function (r, i) {
      return {
        row: i + 2,
        user: String((r && r[0]) || '').trim(),
        title: String((r && r[1]) || '').trim(),
        url: String((r && r[2]) || '').trim(),
        folder: String((r && r[3]) || '').trim()
      };
    })
    .filter(function (l) { return l.user && l.url; });
}

function addUserLink(user, title, url, folder) {
  user = String(user || '').trim();
  title = String(title || '').trim();
  url = String(url || '').trim();
  folder = String(folder || '').trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  if (!url) return { success: false, message: 'URL wajib diisi.' };
  ensureLinksSheet_();
  valuesAppend_(CONFIG.LINKS_SHEET + '!A:D', [[user, title || url, url, folder]]);
  return { success: true, message: 'Link ditambahkan.', links: getAllLinks() };
}

function updateUserLink(user, row, title, url, folder) {
  user = String(user || '').trim();
  row = parseInt(row, 10);
  title = String(title || '').trim();
  url = String(url || '').trim();
  folder = String(folder || '').trim();
  if (!row || row < 2) return { success: false, message: 'Baris tidak valid.' };
  if (!url) return { success: false, message: 'URL wajib diisi.' };
  var cur = valuesGet_(CONFIG.LINKS_SHEET + '!A' + row + ':A' + row);
  var owner = String((cur[0] && cur[0][0]) || '').trim();
  if (owner.toLowerCase() !== user.toLowerCase()) return { success: false, message: 'Bukan link Anda.' };
  valuesUpdate_(CONFIG.LINKS_SHEET + '!B' + row + ':D' + row, [[title || url, url, folder]]);
  return { success: true, message: 'Link diperbarui.', links: getAllLinks() };
}

function deleteUserLink(user, row) {
  user = String(user || '').trim();
  row = parseInt(row, 10);
  if (!row || row < 2) return { success: false, message: 'Baris tidak valid.' };
  var cur = valuesGet_(CONFIG.LINKS_SHEET + '!A' + row + ':A' + row);
  var owner = String((cur[0] && cur[0][0]) || '').trim();
  if (owner.toLowerCase() !== user.toLowerCase()) return { success: false, message: 'Bukan link Anda.' };
  if (!sheet_(CONFIG.LINKS_SHEET, false)) return { success: false, message: 'Sheet LINKS tidak ditemukan.' };
  deleteRows_(CONFIG.LINKS_SHEET, [row]);
  return { success: true, message: 'Link dihapus.', links: getAllLinks() };
}

// Operasi massal kolom Folder milik 1 user.
function bulkFolderOp_(user, oldFolder, newFolder) {
  ensureLinksSheet_();
  var rows = [];
  try { rows = valuesGet_(CONFIG.LINKS_SHEET + '!A2:D'); } catch (e) { rows = []; }
  if (!rows.length) return { success: true, changed: 0, links: [] };
  var changed = 0;
  var dCol = rows.map(function (r) {
    var u = String((r && r[0]) || '').trim();
    var f = String((r && r[3]) || '').trim();
    if (u.toLowerCase() === user.toLowerCase() && f === oldFolder) { changed++; return [newFolder]; }
    return [f];
  });
  if (changed > 0) valuesUpdate_(CONFIG.LINKS_SHEET + '!D2:D' + (rows.length + 1), dCol);
  return { success: true, changed: changed, links: getAllLinks() };
}

function renameUserFolder(user, oldFolder, newFolder) {
  user = String(user || '').trim();
  oldFolder = String(oldFolder || '').trim();
  newFolder = String(newFolder || '').trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  if (!oldFolder) return { success: false, message: 'Folder asal tidak valid.' };
  if (!newFolder) return { success: false, message: 'Nama folder baru wajib diisi.' };
  var res = bulkFolderOp_(user, oldFolder, newFolder);
  res.message = 'Folder "' + oldFolder + '" diganti jadi "' + newFolder + '" (' + res.changed + ' link).';
  return res;
}

function deleteUserFolder(user, folder) {
  user = String(user || '').trim();
  folder = String(folder || '').trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  if (!folder) return { success: false, message: 'Folder tidak valid.' };
  // Link dipindah ke root (Umum), TIDAK dihapus.
  var res = bulkFolderOp_(user, folder, '');
  res.message = 'Folder "' + folder + '" dihapus. ' + res.changed + ' link dipindah ke Umum (tidak terhapus).';
  return res;
}

/* ================================================================== */
/* DASHBOARD LAIN                                                     */
/* ================================================================== */

function ensureDashboardsSheet_() {
  sheet_(CONFIG.DASHBOARDS_SHEET, true);
  var head = valuesGet_(CONFIG.DASHBOARDS_SHEET + '!A1:D1');
  if (!head.length || !head[0] || !head[0][0]) {
    valuesUpdate_(CONFIG.DASHBOARDS_SHEET + '!A1:D1', [SHEET_HEADERS[CONFIG.DASHBOARDS_SHEET]]);
  }
}

function getAllDashboards(pre) {
  var rows = [];
  if (pre !== undefined) rows = pre;
  else { try { rows = valuesGet_(CONFIG.DASHBOARDS_SHEET + '!A2:D'); } catch (e) { return []; } }
  return rows
    .map(function (r, i) {
      return {
        row: i + 2,
        title: String((r && r[0]) || '').trim(),
        desc: String((r && r[1]) || '').trim(),
        icon: String((r && r[2]) || '').trim(),
        url: String((r && r[3]) || '').trim()
      };
    })
    .filter(function (d) { return d.title || d.url; });
}

function addDashboard(title, desc, icon, url) {
  title = String(title || '').trim();
  desc = String(desc || '').trim();
  icon = String(icon || '').trim() || 'dashboard';
  url = String(url || '').trim();
  if (!title) return { success: false, message: 'Judul dashboard wajib diisi.' };
  if (!url) return { success: false, message: 'URL dashboard wajib diisi.' };
  ensureDashboardsSheet_();
  valuesAppend_(CONFIG.DASHBOARDS_SHEET + '!A:D', [[title, desc, icon, url]]);
  return { success: true, message: 'Dashboard ditambahkan.', dashboards: getAllDashboards() };
}

function updateDashboard(row, title, desc, icon, url) {
  row = parseInt(row, 10);
  title = String(title || '').trim();
  desc = String(desc || '').trim();
  icon = String(icon || '').trim() || 'dashboard';
  url = String(url || '').trim();
  if (!row || row < 2) return { success: false, message: 'Baris tidak valid.' };
  if (!title) return { success: false, message: 'Judul dashboard wajib diisi.' };
  if (!url) return { success: false, message: 'URL dashboard wajib diisi.' };
  ensureDashboardsSheet_();
  valuesUpdate_(CONFIG.DASHBOARDS_SHEET + '!A' + row + ':D' + row, [[title, desc, icon, url]]);
  return { success: true, message: 'Dashboard diperbarui.', dashboards: getAllDashboards() };
}

function deleteDashboard(row) {
  row = parseInt(row, 10);
  if (!row || row < 2) return { success: false, message: 'Baris tidak valid.' };
  if (!sheet_(CONFIG.DASHBOARDS_SHEET, false)) return { success: false, message: 'Sheet DASHBOARDS tidak ditemukan.' };
  deleteRows_(CONFIG.DASHBOARDS_SHEET, [row]);
  return { success: true, message: 'Dashboard dihapus.', dashboards: getAllDashboards() };
}

/* ================================================================== */
/* CATATAN SAYA                                                       */
/* ================================================================== */

function ensureNotesSheet_() {
  sheet_(CONFIG.NOTES_SHEET, true);
  var head = valuesGet_(CONFIG.NOTES_SHEET + '!A1:E1');
  var h0 = head[0] || [];
  if (!h0[0]) valuesUpdate_(CONFIG.NOTES_SHEET + '!A1:E1', [SHEET_HEADERS[CONFIG.NOTES_SHEET]]);
  else if (!h0[4]) valuesUpdate_(CONFIG.NOTES_SHEET + '!E1', [['Folder']]);
}

function getAllNotes(pre) {
  var rows = [];
  if (pre !== undefined) rows = pre;
  else { try { rows = valuesGet_(CONFIG.NOTES_SHEET + '!A2:E'); } catch (e) { return []; } }
  return rows
    .map(function (r, i) {
      return {
        row: i + 2,
        user: String((r && r[0]) || '').trim(),
        title: String((r && r[1]) || '').trim(),
        body: String((r && r[2]) || '').trim(),
        updatedAt: stampStr_(r && r[3]),
        folder: String((r && r[4]) || '').trim()
      };
    })
    .filter(function (n) { return n.user && (n.title || n.body); });
}

function addNote(user, title, body, folder) {
  user = String(user || '').trim();
  title = String(title || '').trim();
  body = String(body || '').trim();
  folder = String(folder || '').trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  if (!title && !body) return { success: false, message: 'Catatan tidak boleh kosong.' };
  ensureNotesSheet_();
  valuesAppend_(CONFIG.NOTES_SHEET + '!A:E', [[user, title || '(tanpa judul)', body, nowStamp_(), folder]]);
  return { success: true, message: 'Catatan ditambahkan.', notes: getAllNotes() };
}

function updateNote(user, row, title, body, folder) {
  user = String(user || '').trim();
  row = parseInt(row, 10);
  title = String(title || '').trim();
  body = String(body || '').trim();
  folder = String(folder || '').trim();
  if (!row || row < 2) return { success: false, message: 'Baris tidak valid.' };
  if (!title && !body) return { success: false, message: 'Catatan tidak boleh kosong.' };
  var cur = valuesGet_(CONFIG.NOTES_SHEET + '!A' + row + ':A' + row);
  var owner = String((cur[0] && cur[0][0]) || '').trim();
  if (owner.toLowerCase() !== user.toLowerCase()) return { success: false, message: 'Bukan catatan Anda.' };
  valuesUpdate_(CONFIG.NOTES_SHEET + '!B' + row + ':E' + row, [[title || '(tanpa judul)', body, nowStamp_(), folder]]);
  return { success: true, message: 'Catatan diperbarui.', notes: getAllNotes() };
}

function deleteNote(user, row) {
  user = String(user || '').trim();
  row = parseInt(row, 10);
  if (!row || row < 2) return { success: false, message: 'Baris tidak valid.' };
  var cur = valuesGet_(CONFIG.NOTES_SHEET + '!A' + row + ':A' + row);
  var owner = String((cur[0] && cur[0][0]) || '').trim();
  if (owner.toLowerCase() !== user.toLowerCase()) return { success: false, message: 'Bukan catatan Anda.' };
  if (!sheet_(CONFIG.NOTES_SHEET, false)) return { success: false, message: 'Sheet NOTES tidak ditemukan.' };
  deleteRows_(CONFIG.NOTES_SHEET, [row]);
  return { success: true, message: 'Catatan dihapus.', notes: getAllNotes() };
}

function bulkNoteFolderOp_(user, oldFolder, newFolder) {
  ensureNotesSheet_();
  var rows = [];
  try { rows = valuesGet_(CONFIG.NOTES_SHEET + '!A2:E'); } catch (e) { rows = []; }
  if (!rows.length) return { success: true, changed: 0, notes: [] };
  var changed = 0;
  var eCol = rows.map(function (r) {
    var u = String((r && r[0]) || '').trim();
    var f = String((r && r[4]) || '').trim();
    if (u.toLowerCase() === user.toLowerCase() && f === oldFolder) { changed++; return [newFolder]; }
    return [f];
  });
  if (changed > 0) valuesUpdate_(CONFIG.NOTES_SHEET + '!E2:E' + (rows.length + 1), eCol);
  return { success: true, changed: changed, notes: getAllNotes() };
}

function renameNoteFolder(user, oldFolder, newFolder) {
  user = String(user || '').trim();
  oldFolder = String(oldFolder || '').trim();
  newFolder = String(newFolder || '').trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  if (!oldFolder) return { success: false, message: 'Folder asal tidak valid.' };
  if (!newFolder) return { success: false, message: 'Nama folder baru wajib diisi.' };
  var res = bulkNoteFolderOp_(user, oldFolder, newFolder);
  res.message = 'Folder "' + oldFolder + '" diganti jadi "' + newFolder + '" (' + res.changed + ' catatan).';
  return res;
}

function deleteNoteFolder(user, folder) {
  user = String(user || '').trim();
  folder = String(folder || '').trim();
  if (!user) return { success: false, message: 'User tidak boleh kosong.' };
  if (!folder) return { success: false, message: 'Folder tidak valid.' };
  var res = bulkNoteFolderOp_(user, folder, ''); // catatan dipindah ke Umum, tidak dihapus
  res.message = 'Folder "' + folder + '" dihapus. ' + res.changed + ' catatan dipindah ke Umum.';
  return res;
}

/* ================================================================== */
/* WEB APP                                                            */
/* ================================================================== */

function doGet(e) {
  var html = HtmlService.createHtmlOutputFromFile('Index').getContent();

  // Halaman Apps Script berjalan di dalam iframe yang TIDAK membawa query string asli,
  // jadi mode berbagi (?view=lintas) disuntikkan sendiri ke halaman.
  var view = (e && e.parameter && e.parameter.view) ? String(e.parameter.view) : '';
  if (e && e.parameter && e.parameter.unlock) view = 'normal';
  if (view) {
    html = html.replace('</head>',
      '<script>window.__TT_VIEW=' + JSON.stringify(view.replace(/[^A-Za-z]/g, '')) + ';</script></head>');
  }

  return HtmlService.createHtmlOutput(html)
    .setTitle('ProductTrack — Task Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// URL web app aktif (dipakai untuk tombol "bagikan" bila diperlukan).
function getWebAppUrl() {
  try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; }
}
