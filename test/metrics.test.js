/**
 * Tes untuk api/metrics.js — endpoint metrics read-only.
 * Memakai data contoh di memori, jadi tak perlu jaringan/credential.
 * Jalankan: node test/metrics.test.js
 */
const assert = require('assert');
const { _internals } = require('../api/metrics');
const {
  parseTokens, safeEqual, identify, buildCompletionMap, completionDay, dayFromStatusBy,
  movedToDone, statusLoggingProgress,
  bucketOf, daysBetween, matchesFilters, inRange, platformParts, coverageOf, buildCaveats,
  viewSummary, viewThroughput, viewOntime, viewWorkload, viewAging, viewTasks,
} = _internals;

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  console.log('  ✓ ' + name);
  passed++;
}
function eq(name, a, b) {
  assert.strictEqual(a, b, `${name} (got=${JSON.stringify(a)} want=${JSON.stringify(b)})`);
  console.log('  ✓ ' + name);
  passed++;
}

/* ---------------- Data contoh ---------------- */
// Sengaja dibuat bolong seperti sheet aslinya: ada task tanpa Due Date, tanpa
// statusBy, dan platform bernilai ganda.
const TASKS = [
  { id: 'TSK-001', taskName: 'Edit video', status: 'Done', priority: 'High', stage: 'QC',
    platform: 'JadiASN', pic: 'Dhea', support: '', createdDate: '2026-07-01', dueDate: '2026-07-10',
    statusBy: 'Dhea • 2026-07-08 09:00:00', picNotes: 'catatan pic', pmNotes: 'catatan pm' },
  { id: 'TSK-002', taskName: 'Susun soal', status: 'Done', priority: 'Normal', stage: 'QC',
    platform: 'All Platform, Markaz', pic: 'Arifah', support: '', createdDate: '2026-07-02', dueDate: '2026-07-05',
    statusBy: '', picNotes: '', pmNotes: '' },                       // selesai, tanggalnya dari ACTIVITY
  { id: 'TSK-003', taskName: 'Rapikan data', status: 'Done', priority: 'Low', stage: 'Operasional',
    platform: '', pic: 'Dhea', support: '', createdDate: '2026-06-20', dueDate: '',
    statusBy: '', picNotes: '', pmNotes: '' },                       // tak bisa dinilai: tak ada Due Date
  { id: 'TSK-004', taskName: 'Review materi', status: 'Review PM', priority: 'Urgent', stage: 'QC',
    platform: 'JadiPPG', pic: 'Arifah', support: '', createdDate: '2026-06-01', dueDate: '2026-06-15',
    statusBy: 'Nynda (PM) • 2026-06-10 12:00:00', picNotes: '', pmNotes: '' },
  { id: 'TSK-005', taskName: 'Bikin liveclass', status: 'Todo', priority: 'Normal', stage: 'Kreatif',
    platform: 'JadiASN', pic: '', support: '', createdDate: '2026-08-01', dueDate: '2026-09-01',
    statusBy: '', picNotes: '', pmNotes: '' },                       // tanpa PIC
];

const ACTIVITY = [                                                    // terbaru di atas, seperti getActivityLog()
  { timestamp: '2026-08-20 09:07:32', user: 'Dhea', action: 'Update Task', taskId: 'TSK-005', detail: 'Bikin liveclass • Status: Todo • PIC: -' },
  { timestamp: '2026-07-09 11:00:00', user: 'Arifah', action: 'Update Task', taskId: 'TSK-002', detail: 'Susun soal • Status: Done • PIC: Arifah' },
  { timestamp: '2026-07-07 08:00:00', user: 'Arifah', action: 'Update Task', taskId: 'TSK-002', detail: 'Susun soal • Status: In progress • PIC: Arifah' },
  { timestamp: '2026-06-29 13:33:10', user: 'Arifah', action: 'Create Task', taskId: 'TSK-001', detail: 'Edit video • Status: Todo • PIC: Dhea' },
];

const MAP = buildCompletionMap(ACTIVITY);
const NO_FILTER = { from: '', to: '', stage: '', platform: '', pic: '', status: '', priority: '', q: '' };

/* ---------------- Autentikasi ---------------- */
console.log('Autentikasi:');
process.env.METRICS_TOKENS = 'manager:rahasia-abc,analis:rahasia-xyz';
delete process.env.METRICS_TOKEN;
eq('dua token terbaca', parseTokens().length, 2);
eq('label token kedua', parseTokens()[1].label, 'analis');
ok('safeEqual cocok', safeEqual('abc', 'abc') === true);
ok('safeEqual beda panjang', safeEqual('abc', 'abcd') === false);
ok('safeEqual beda isi', safeEqual('abc', 'abd') === false);
eq('token sah dikenali', identify({ headers: { 'x-metrics-token': 'rahasia-xyz' } }).label, 'analis');
ok('token salah ditolak', identify({ headers: { 'x-metrics-token': 'salah' } }).ok === false);
ok('tanpa token ditolak', identify({ headers: {} }).ok === false);
process.env.METRICS_TOKENS = '';
eq('server tanpa token dikonfigurasi -> tertutup', identify({ headers: { 'x-metrics-token': 'apa saja' } }).reason, 'NO_TOKEN_CONFIGURED');
process.env.METRICS_TOKENS = 'manager:rahasia-abc,analis:rahasia-xyz';

/* ---------------- Tanggal ---------------- */
console.log('\nTanggal & tanggal selesai:');
eq('statusBy -> tanggal', dayFromStatusBy('Nynda (PM) • 2026-08-11 20:47:56'), '2026-08-11');
eq('statusBy kosong -> kosong', dayFromStatusBy(''), '');
eq('ACTIVITY memberi tanggal Done TSK-002', MAP['TSK-002'], '2026-07-09');
ok('TSK-005 belum Done -> tak ada di peta', MAP['TSK-005'] === undefined);
eq('TSK-001 pakai statusBy (tak ada di ACTIVITY)', completionDay(TASKS[0], MAP), '2026-07-08');
eq('TSK-002 pakai ACTIVITY', completionDay(TASKS[1], MAP), '2026-07-09');
eq('TSK-003 Done tanpa jejak -> kosong', completionDay(TASKS[2], MAP), '');
eq('task belum Done -> kosong', completionDay(TASKS[4], MAP), '');
eq('bucket bulanan', bucketOf('2026-07-09', 'month'), '2026-07');
eq('bucket mingguan jatuh ke Senin', bucketOf('2026-07-09', 'week'), '2026-07-06');
eq('selisih hari', daysBetween('2026-07-05', '2026-07-09'), 4);
eq('selisih hari negatif', daysBetween('2026-07-10', '2026-07-08'), -2);
eq('tanggal tak sah -> null', daysBetween('bukan tanggal', '2026-07-08'), null);

console.log('\nKolom status terstruktur vs pembacaan teks:');
ok('kolom terstruktur Done -> ya', movedToDone({ statusTo: 'Done', detail: '' }) === true);
ok('kolom terstruktur huruf besar-kecil bebas', movedToDone({ statusTo: 'done', detail: '' }) === true);
ok('kolom terstruktur bukan Done -> tidak', movedToDone({ statusTo: 'Revisi', detail: '' }) === false);
// Kasus paling penting: baris yang PUNYA kolom terstruktur harus dipercaya penuh.
// Kalau teks lamanya masih menyebut "Status: Done" sementara kolomnya bilang Revisi,
// yang benar adalah kolomnya — teks itu cuma jejak kalimat lama.
ok('kolom terstruktur mengalahkan teks yang bertentangan',
  movedToDone({ statusTo: 'Revisi', detail: 'Apa pun • Status: Done • PIC: X' }) === false);
ok('tanpa kolom -> jatuh ke teks', movedToDone({ statusTo: '', detail: 'Apa pun • Status: Done •' }) === true);
ok('tanpa kolom & teks bukan Done -> tidak', movedToDone({ statusTo: '', detail: 'Apa pun • Status: Todo •' }) === false);
ok('baris kosong aman', movedToDone({}) === false && movedToDone(null) === false);

const CAMPUR = [
  { taskId: 'A', timestamp: '2026-08-01 10:00:00', statusFrom: 'Todo', statusTo: 'Done', detail: 'x' },
  { taskId: 'B', timestamp: '2026-07-01 10:00:00', statusFrom: '', statusTo: '', detail: 'y • Status: Done •' },
  { taskId: 'C', timestamp: '2026-07-02 10:00:00', statusFrom: 'Done', statusTo: 'Revisi', detail: 'z • Status: Done •' },
];
const prog = statusLoggingProgress(CAMPUR);
eq('terhitung terstruktur', prog.structured, 2);
eq('terhitung masih dari teks', prog.text_only, 1);
eq('rasio terstruktur', prog.structured_ratio, 0.667);
const mapCampur = buildCompletionMap(CAMPUR);
eq('A selesai dari kolom terstruktur', mapCampur.A, '2026-08-01');
eq('B selesai dari teks (baris lama)', mapCampur.B, '2026-07-01');
ok('C tidak dianggap selesai walau teksnya menyebut Done', mapCampur.C === undefined);
eq('log tanpa kolom sama sekali -> semua dari teks', statusLoggingProgress(ACTIVITY).structured, 0);

/* ---------------- Penyaringan ---------------- */
console.log('\nPenyaringan:');
eq('platform ganda dipecah', platformParts('All Platform, Markaz').join('|'), 'all platform|markaz');
ok('cocok platform di dalam sel ganda', matchesFilters(TASKS[1], { ...NO_FILTER, platform: 'Markaz' }) === true);
ok('platform lain tak ikut tercocok', matchesFilters(TASKS[1], { ...NO_FILTER, platform: 'JadiASN' }) === false);
ok('cocok stage tanpa peduli huruf besar', matchesFilters(TASKS[0], { ...NO_FILTER, stage: 'qc' }) === true);
ok('cocok pencarian nama', matchesFilters(TASKS[0], { ...NO_FILTER, q: 'video' }) === true);
ok('rentang tanggal inklusif di ujung', inRange('2026-07-01', { from: '2026-07-01', to: '2026-07-31' }) === true);
ok('di luar rentang', inRange('2026-08-01', { from: '2026-07-01', to: '2026-07-31' }) === false);
ok('tanpa tanggal -> di luar rentang', inRange('', { from: '2026-07-01', to: '' }) === false);
ok('tanpa rentang -> semua lolos', inRange('', { from: '', to: '' }) === true);

/* ---------------- Cakupan & peringatan ---------------- */
console.log('\nCakupan data & peringatan:');
const cov = coverageOf(TASKS, MAP);
eq('jumlah task dihitung', cov.tasks_counted, 5);
eq('cakupan Due Date 4/5', cov.due_date, 0.8);
eq('cakupan platform 4/5', cov.platform, 0.8);
eq('cakupan PIC 4/5', cov.pic, 0.8);
eq('cakupan tanggal selesai 2/3 Done', cov.completion_date, 0.667);
const cavOntime = buildCaveats('ontime', NO_FILTER, cov, { activity: ACTIVITY });
ok('ontime memperingatkan Due Date bolong', cavOntime.some((c) => c.includes('Due Date')));
ok('ontime memperingatkan tanggal selesai bolong', cavOntime.some((c) => c.includes('tanggal selesai')));
const cavRange = buildCaveats('throughput', { ...NO_FILTER, from: '2026-01-01' }, cov, { activity: ACTIVITY });
ok('rentang sebelum awal ACTIVITY diperingatkan', cavRange.some((c) => c.includes('2026-06-29')));
const covFull = coverageOf([TASKS[0]], MAP);
eq('data lengkap -> cakupan penuh', covFull.due_date, 1);
eq('data lengkap -> tak ada peringatan', buildCaveats('ontime', NO_FILTER, covFull, { activity: [] }).length, 0);
// Menyaring per periode membuang task Done yang tanggal selesainya tak diketahui.
// Itu harus disebut, bukan dibiarkan lenyap diam-diam.
const cavExcl = buildCaveats('ontime', { ...NO_FILTER, from: '2026-07-01' }, covFull, { activity: [] }, { no_completion_date: 3 });
ok('task yang gugur karena tak bertanggal disebut', cavExcl.some((c) => c.includes('3 task Done tidak masuk hitungan')));
eq('tak ada yang gugur -> tak ada catatan itu', buildCaveats('ontime', NO_FILTER, covFull, { activity: [] }, { no_completion_date: 0 }).length, 0);

/* ---------------- View ---------------- */
console.log('\nView summary:');
const sum = viewSummary(TASKS);
eq('total', sum.total, 5);
eq('done', sum.done, 3);
eq('open', sum.open, 2);
eq('status Done terhitung', sum.by_status.Done, 3);
eq('PIC kosong ditandai', sum.by_pic['(kosong)'], 1);

console.log('\nView throughput:');
const thr = viewThroughput(TASKS, MAP, { bucket: 'month' });
eq('total selesai yang bertanggal', thr.total_completed, 2);
eq('periode Juli ada', thr.series.find((s) => s.period === '2026-07').completed, 2);
ok('Done tanpa jejak tak masuk deret', thr.series.every((s) => s.period !== ''));
const thrGroup = viewThroughput(TASKS, MAP, { bucket: 'month', groupBy: 'stage' });
eq('groupBy stage: QC di Juli', thrGroup.series.find((s) => s.period === '2026-07').breakdown.QC, 2);

console.log('\nView ontime:');
const ont = viewOntime(TASKS, MAP);
eq('Done seluruhnya', ont.done_total, 3);
eq('yang bisa dinilai', ont.scored, 2);
eq('yang tak bisa dinilai', ont.not_scored, 1);
eq('tepat waktu (TSK-001 selesai 07-08 < due 07-10)', ont.on_time, 1);
eq('terlambat (TSK-002 selesai 07-09 > due 07-05)', ont.late, 1);
eq('rasio tepat waktu', ont.on_time_rate, 0.5);
eq('rata-rata hari terlambat', ont.avg_days_late, 4);
eq('daftar terparah teratas', ont.worst[0].id, 'TSK-002');

console.log('\nView workload:');
const wl = viewWorkload(TASKS);
const dhea = wl.people.find((p) => p.pic === 'Dhea');
eq('Dhea total', dhea.total, 2);
eq('Dhea semua sudah selesai', dhea.open, 0);
const arifah = wl.people.find((p) => p.pic === 'Arifah');
eq('Arifah punya 1 terbuka', arifah.open, 1);
eq('Arifah lewat tenggat (due 2026-06-15)', arifah.overdue, 1);
ok('PIC kosong tetap muncul', wl.people.some((p) => p.pic === '(kosong)'));

console.log('\nView aging:');
const ag = viewAging(TASKS, { minDays: 1 });
ok('hanya task terbuka', ag.tasks.every((t) => t.status !== 'Done'));
eq('dua task terbuka terhitung', ag.counted, 2);
eq('satu diukur dari perubahan status', ag.measured_from_status_change, 1);
eq('satu diukur dari tanggal dibuat', ag.measured_from_created_date, 1);
eq('yang paling lama mandek di atas', ag.tasks[0].id, 'TSK-004');
ok('basis pengukuran ikut dilaporkan', ag.tasks[0].basis === 'statusBy');
ok('TSK-004 ditandai lewat tenggat', ag.tasks[0].overdue === true);
eq('minDays besar menyaring habis', viewAging(TASKS, { minDays: 100000 }).counted, 0);

console.log('\nView tasks:');
const tv = viewTasks(TASKS, MAP, {});
eq('semua baris kembali', tv.returned, 5);
ok('catatan bebas TIDAK ikut secara bawaan', tv.tasks[0].picNotes === undefined && tv.tasks[0].pmNotes === undefined);
ok('tanggal selesai ikut', tv.tasks[0].completedOn === '2026-07-08');
const tvNotes = viewTasks(TASKS, MAP, { include: 'notes' });
eq('catatan ikut kalau diminta', tvNotes.tasks[0].picNotes, 'catatan pic');
const tvLimit = viewTasks(TASKS, MAP, { limit: 2 });
eq('limit dipatuhi', tvLimit.returned, 2);
ok('pemotongan ditandai', tvLimit.truncated === true);
eq('jumlah yang cocok tetap dilaporkan', tvLimit.matched, 5);

console.log('\nJaminan tak menyentuh data pribadi:');
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'api', 'metrics.js'), 'utf8');
const body = src.replace(/^[\s\S]*?\* =+\s*\*\//, '');   // buang blok komentar kepala
['NOTES_SHEET', 'COMMENTS_SHEET', 'LINKS_SHEET', 'getAllNotes', 'getComments', 'getAllLinks', 'getUsers'].forEach((name) => {
  ok(`metrics.js tidak memanggil ${name}`, !body.includes(name));
});
ok('hanya getTasks & getActivityLog yang dipanggil dari backend',
  (body.match(/backend\.\w+/g) || []).every((c) => c === 'backend.getTasks' || c === 'backend.getActivityLog'));

console.log(`\n✅ Semua ${passed} assertion lulus.`);
