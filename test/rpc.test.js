/*
 * Uji gerbang akses api/rpc.js.
 *
 * Berkas ini yang memutuskan siapa boleh apa, tapi sebelumnya tak punya uji sama sekali —
 * dan di situlah bug mode tamu lahir: aksi yang ditolak KARENA LEVEL memakai kode 'AUTH'
 * yang sama dengan "PIN salah", sehingga layar depan melempar tamu balik ke layar PIN
 * padahal PIN-nya sudah benar. Terlihat seperti PIN-nya ditolak terus.
 *
 * Backend diganti tiruan: yang diuji gerbangnya, bukan spreadsheetnya.
 */
const assert = require('assert');
const path = require('path');
const Module = require('module');

const PAKET = [
  { id: 'PKG-001', namaPaket: 'Dibagikan', mirror: true },
  { id: 'PKG-002', namaPaket: 'Belum dibagikan', mirror: false },
];
const COLLAB = [
  { id: 'COL-001', title: 'Dibagikan', mirror: true, steps: [] },
  { id: 'COL-002', title: 'Belum dibagikan', mirror: false, steps: [] },
];

const dipanggil = [];
const backendTiruan = {
  invalidateUsers() {},
  getBootstrapData(opts) {
    dipanggil.push('getBootstrapData:' + JSON.stringify(opts || {}));
    if (opts && opts.viewOnly) {
      return Promise.resolve({ tasks: [], options: {}, viewOnly: true,
        collabs: COLLAB.filter(c => c.mirror), meta: {} });
    }
    return Promise.resolve({ tasks: [{ id: 'TSK-001' }], options: {}, collabs: COLLAB, meta: {} });
  },
  getPackages() { dipanggil.push('getPackages'); return Promise.resolve(PAKET.slice()); },
  getComments() { dipanggil.push('getComments'); return Promise.resolve([]); },
  getNotifications() { dipanggil.push('getNotifications'); return Promise.resolve([]); },
  getCollabs() { dipanggil.push('getCollabs'); return Promise.resolve(COLLAB.slice()); },
  saveCollab() { dipanggil.push('saveCollab'); return Promise.resolve({ success: true }); },
  deleteTask() { dipanggil.push('deleteTask'); return Promise.resolve({ success: true }); },
  getTasks() { return Promise.resolve([]); },
};

const origLoad = Module._load;
Module._load = function (request, parent) {
  if (request === './_sheets' || request === './_sheets.js') return backendTiruan;
  return origLoad.apply(this, arguments);
};
const handler = require(path.join(__dirname, '..', 'api', 'rpc.js'));
Module._load = origLoad;

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log('  ✓ ' + name); passed++; }
function eq(name, a, b) {
  assert.strictEqual(a, b, name + ' — dapat ' + JSON.stringify(a) + ', harusnya ' + JSON.stringify(b));
  console.log('  ✓ ' + name); passed++;
}

function tembak(action, pin, args) {
  return new Promise(resolve => {
    let kode = 200;
    const res = {
      setHeader() {},
      status(c) { kode = c; return res; },
      end(body) {
        let data = null;
        try { data = body ? JSON.parse(body) : null; } catch (e) { data = body; }
        resolve({ kode, data });
      },
    };
    const headers = {};
    if (pin !== undefined && pin !== null) headers['x-app-password'] = pin;
    handler({ method: 'POST', headers, body: { action, args: args || [] } }, res);
  });
}

(async () => {
  process.env.ACCESS_PIN = '111111';
  process.env.VIEW_PIN = '222222';
  process.env.MAGANG_PIN = '333333';
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.SESSION_SECRET;

  console.log('\n=== 1. Login mengenali tiap PIN ===');
  eq('PIN penuh -> full', (await tembak('login', '111111')).data.level, 'full');
  eq('PIN lihat -> view', (await tembak('login', '222222')).data.level, 'view');
  eq('PIN magang -> magang', (await tembak('login', '333333')).data.level, 'magang');
  eq('PIN salah -> none', (await tembak('login', '999999')).data.level, 'none');
  eq('PIN salah dilaporkan gagal', (await tembak('login', '999999')).data.success, false);
  eq('tanpa PIN sama sekali -> none', (await tembak('login', undefined)).data.level, 'none');

  console.log('\n=== 2. Tamu: yang boleh dibuka ===');
  eq('muat-awal boleh', (await tembak('getBootstrapData', '222222', [{}])).kode, 200);
  eq('komentar boleh dibaca', (await tembak('getComments', '222222')).kode, 200);
  /* getPackages ikut diizinkan sejak Lintas Divisi punya menu Rancangan Paket. Tanpa ini,
     muat-awal tamu memanggilnya, ditolak, lalu terlempar balik ke layar PIN. */
  eq('rancangan paket boleh dibaca', (await tembak('getPackages', '222222')).kode, 200);

  console.log('\n=== 3. Tamu: data dipangkas DI SERVER ===');
  const pkgTamu = (await tembak('getPackages', '222222')).data;
  eq('hanya paket yang dibagikan yang dikirim', pkgTamu.length, 1);
  eq('dan memang yang ditandai', pkgTamu[0].id, 'PKG-001');
  ok('yang belum dibagikan tak ikut terkirim', !pkgTamu.some(p => p.id === 'PKG-002'));
  const pkgPenuh = (await tembak('getPackages', '111111')).data;
  eq('akses penuh tetap menerima semuanya', pkgPenuh.length, 2);
  const bootTamu = (await tembak('getBootstrapData', '222222', [{}])).data;
  ok('muat-awal tamu membawa kunci collabs', Object.prototype.hasOwnProperty.call(bootTamu, 'collabs'));
  eq('dan isinya hanya yang dibagikan', (bootTamu.collabs || []).length, 1);
  ok('backend diberi tahu ini sesi tamu', dipanggil.some(x => x.indexOf('"viewOnly":true') >= 0));

  console.log('\n=== 4. Ditolak karena LEVEL, bukan karena PIN salah ===');
  /* Inti perbaikannya. Dulu keduanya memakai 401/AUTH, dan layar depan memperlakukan AUTH
     sebagai "sesi habis" lalu memunculkan layar PIN — tamu berputar mengetik PIN yang sudah
     benar. Sekarang tolakan level memakai 403/FORBIDDEN dan tak menyentuh layar PIN. */
  const tolakTamu = await tembak('getNotifications', '222222');
  eq('aksi di luar jatah tamu ditolak 403', tolakTamu.kode, 403);
  eq('kodenya FORBIDDEN, bukan AUTH', tolakTamu.data.code, 'FORBIDDEN');
  ok('pesannya menjelaskan sebabnya', /PIN akses penuh/.test(tolakTamu.data.message || ''));
  const tolakMagang = await tembak('deleteTask', '333333');
  eq('aksi terlarang magang ditolak 403', tolakMagang.kode, 403);
  eq('kodenya FORBIDDEN juga', tolakMagang.data.code, 'FORBIDDEN');

  console.log('\n=== 5. PIN salah TETAP berarti minta PIN ===');
  const salah = await tembak('getBootstrapData', '999999', [{}]);
  eq('ditolak 401', salah.kode, 401);
  eq('kodenya AUTH', salah.data.code, 'AUTH');
  ok('hanya kode inilah yang pantas memunculkan layar PIN', salah.data.code === 'AUTH');

  console.log('\n=== 6. Magang tetap boleh bekerja ===');
  eq('magang boleh membaca muat-awal', (await tembak('getBootstrapData', '333333', [{}])).kode, 200);
  eq('magang DITOLAK menyimpan task kolaborasi', (await tembak('saveCollab', '333333')).kode, 403);
  eq('magang DITOLAK membagikan task ke Lintas Divisi', (await tembak('setCollabMirror', '333333')).kode, 403);

  console.log('\n=== 7. Tanpa PIN & tanpa Google, app terbuka (anti-terkunci) ===');
  delete process.env.ACCESS_PIN;
  delete process.env.VIEW_PIN;
  delete process.env.MAGANG_PIN;
  eq('gerbang mati -> level full', (await tembak('login', undefined)).data.level, 'full');
  eq('dan datanya bisa dibaca', (await tembak('getPackages', undefined)).kode, 200);
  eq('tanpa gerbang, tak ada pemangkasan', (await tembak('getPackages', undefined)).data.length, 2);

  console.log(`\n✅ Semua ${passed} assertion lulus.`);
})().catch(e => { console.error('\n❌ GAGAL:', e && e.stack ? e.stack : e); process.exit(1); });
