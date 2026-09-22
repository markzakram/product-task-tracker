/* Service worker ProductTrack.
   =============================
   Ada di sini untuk SATU alasan: Chrome hanya menawarkan "Pasang aplikasi" kalau situsnya
   punya service worker dengan penangan fetch. Tanpa ini, "Tambahkan ke layar utama" cuma
   membuat pintasan biasa yang tetap membuka browser lengkap dengan bilah alamatnya.

   Yang SENGAJA tidak dilakukan: menyimpan halamannya ke cache.
   ------------------------------------------------------------
   index.html adalah satu berkas yang di-deploy ulang hampir tiap hari. Kalau ia disajikan
   dari cache, pengguna bisa memakai versi lama berhari-hari tanpa sadar — memanggil aksi
   yang sudah tak ada di backend, atau tak melihat kolom yang baru ditambahkan. Itu kelas
   bug yang jauh lebih mahal daripada memuat ulang 500 KB.

   Jadi: dokumen SELALU dari jaringan. Kalau jaringannya mati, yang tampil halaman luring
   di bawah — bukan salinan lama aplikasi yang akan gagal di panggilan pertamanya.

   Data (/api/) tak pernah disentuh sama sekali. */

/* Ganti angkanya kalau isi ASET berubah — itu yang membuang cache lama. */
const CACHE = 'producttrack-statis-v1';

/* Path relatif terhadap /sw.js, jadi terhadap akar situs.
   Catatan: cache.addAll() menolak SELURUH pemasangan kalau salah satu berkas 404, jadi
   daftar ini diperiksa otomatis di test/gas.test.js — berkasnya harus benar-benar ada. */
const ASET = [
  'manifest.json',
  'logo/icon-192.png',
  'logo/icon-512.png',
  'logo/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASET))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nama) => Promise.all(nama.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  /* POST ke /api/rpc lewat di sini juga. Membiarkannya berarti tak ada satu pun aksi
     tulis yang bisa tersangkut di lapisan ini. */
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Tailwind, Chart.js dsb: urusan browser
  if (url.pathname.indexOf('/api/') === 0) return;   // data selalu segar

  /* Dokumen: jaringan dulu, selalu. Cache cuma jadi jaring pengaman saat luring. */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => new Response(LURING, {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }))
    );
    return;
  }

  /* Ikon & manifest: cache dulu. Isinya hanya berubah kalau CACHE di atas ikut diganti. */
  if (url.pathname.indexOf('/logo/') === 0 || url.pathname === '/manifest.json') {
    e.respondWith(caches.match(req).then((c) => c || fetch(req)));
  }

  /* Sisanya tak diintersep — biar browser yang menangani seperti biasa. */
});

/* Halaman luring ditulis di sini, bukan jadi berkas tersendiri: `cleanUrls` di vercel.json
   mengalihkan /luring.html ke /luring dengan 308, dan cache.put() menolak respons hasil
   pengalihan — pemasangannya akan gagal diam-diam. Sebagai teks di dalam berkas ini, ia
   tak bisa 404 dan tak bisa basi.

   Tanpa CDN apa pun, karena justru dipakai saat tak ada jaringan. */
const LURING = `<!DOCTYPE html>
<html lang="id"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Tidak ada koneksi — ProductTrack</title>
<style>
  :root { --latar:#ffffff; --teks:#0f172a; --redup:#64748b; --garis:#e2e8f0; --utama:#0068B4; }
  @media (prefers-color-scheme: dark) {
    :root { --latar:#0f172a; --teks:#f8fafc; --redup:#94a3b8; --garis:#1e293b; --utama:#5CC6F7; }
  }
  * { box-sizing:border-box; }
  body {
    margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    padding:24px; background:var(--latar); color:var(--teks);
    font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  }
  .kotak { max-width:22rem; text-align:center; }
  .bulat {
    width:64px; height:64px; margin:0 auto 20px; border-radius:18px;
    border:1px solid var(--garis); display:flex; align-items:center; justify-content:center;
    font-size:30px; line-height:1;
  }
  h1 { margin:0 0 8px; font-size:19px; font-weight:700; letter-spacing:-.01em; }
  p { margin:0 0 20px; font-size:14px; line-height:1.6; color:var(--redup); }
  button {
    width:100%; padding:13px 20px; border:0; border-radius:11px; cursor:pointer;
    background:var(--utama); color:#fff; font-size:14px; font-weight:600; font-family:inherit;
  }
  button:active { opacity:.85; }
</style>
</head><body>
  <div class="kotak">
    <div class="bulat">📡</div>
    <h1>Tidak ada koneksi</h1>
    <p>ProductTrack membaca datanya langsung dari Google Spreadsheet, jadi ia butuh internet
       untuk menampilkan apa pun. Sambungkan lagi, lalu coba muat ulang.</p>
    <button onclick="location.reload()">Coba lagi</button>
  </div>
</body></html>`;
