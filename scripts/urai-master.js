/* Pengurai sel Area Produk dari sheet "Master Koordinasi Paket" jadi TARGET rancangan.
   Aturannya diturunkan dari bentuk data yang benar-benar dipakai, bukan tebakan:

     baris pertama         -> judul sel ("PCPM BI 41"), dilewati
     diawali "BONUS"       -> mulai dari sini warisan angkatan lama, jadi teks bebas
     diawali "Total"       -> RINGKASAN, dilewati (lihat catatan di bawah)
     berbullet (• atau -)  -> SELALU item, walau diawali kata "Tahap"
     tanpa bullet,
       diawali "Tahap",
       tanpa angka+satuan  -> judul kelompok ("Tahap 1", "Tahap 2 DONE")
     selain itu            -> item

   Bullet jadi pembeda karena di kolom Materi ada "• Tahap 1 Seleksi Potensi Dasar (SPD)"
   yang jelas item, sementara di Latsol "Tahap 1" polos adalah judul kelompoknya. */

const RE_BONUS = /^\s*BONUS\b/i;
/* Dulu polanya cuma "Total:" atau "Total=", sehingga baris seperti "Total TWK: 50 Paket"
   dan "Total Keseluruhan: 210 Paket" lolos jadi target. Akibatnya fatal: di kolom Latsol
   JadiASN, 22 item asli senilai 210 Paket ditambah 420 Paket palsu dari empat baris
   ringkasan. Sekarang SEMUA baris yang diawali kata "Total" dilewati. */
const RE_TOTAL = /^\s*[-•*]?\s*Total\b/i;
const RE_BULLET = /^\s*[•*]|^\s*-\s+/;
const RE_JUMLAH = /(\d+)\s*(Paket|BAB|Bab|Sesi|sesi|Video|Ebook|paket|bab)\b/;
const RE_COMING = /\+\s*(\d+)\s*(?:Paket|BAB|Sesi|Video|Ebook|paket|sesi)\b[^\n]*COMING\s*SOON/i;
const RE_DONE = /\bDONE\b/;
const RE_JUDUL_GRUP = /^Tahap\b/i;

const rapi = (s) => String(s || '').replace(/\s+/g, ' ').trim();
function satuanRapi(u) {
  const v = String(u || '').toLowerCase();
  if (v === 'bab') return 'BAB';
  if (v === 'sesi') return 'Sesi';
  if (v === 'video') return 'Video';
  if (v === 'ebook') return 'Ebook';
  return 'Paket';
}

/* -> { target: [...], bonus: '<teks sisa>' } */
function uraiSel(teks, kategori) {
  const semua = String(teks || '').split(/\r?\n/);
  const target = [], bonus = [];
  let diBonus = false, grup = '', grupJadi = false, lewatiJudul = true;

  for (const asli of semua) {
    if (!String(asli).trim()) { if (diBonus) bonus.push(asli); continue; }
    if (RE_BONUS.test(asli)) diBonus = true;
    if (diBonus) { bonus.push(asli); continue; }
    if (RE_TOTAL.test(asli)) continue;

    const berbullet = RE_BULLET.test(asli);
    const bersih = rapi(String(asli).replace(/^[\s•*]+/, '').replace(/^-\s+/, ''));
    if (!bersih || bersih === '-') continue;

    // Baris pertama sel adalah judulnya ("PCPM BI 41"), bukan deliverable.
    if (lewatiJudul) { lewatiJudul = false; if (!berbullet && !RE_JUMLAH.test(bersih)) continue; }

    const mJum = RE_JUMLAH.exec(bersih);
    if (!berbullet && !mJum && RE_JUDUL_GRUP.test(bersih)) {
      grupJadi = RE_DONE.test(bersih);
      grup = bersih.replace(RE_DONE, '').trim();
      continue;
    }

    const jadi = RE_DONE.test(bersih) || grupJadi;
    const nama0 = bersih.replace(RE_DONE, '').replace(/\s+/g, ' ').trim();
    if (!mJum) {
      // Tanpa angka tetap dicatat (target 1) — kalau dibuang, isi seperti kolom Dibimbing
      // "PCPM BI 41 Tahap 1" hilang sama sekali dari rancangan.
      target.push({ kategori, grup, nama: nama0, target: 1, satuan: 'Paket', awal: 1 });
      continue;
    }
    const n = Number(mJum[1]) || 0;
    const mCome = RE_COMING.exec(bersih);
    const tambahan = mCome ? (Number(mCome[1]) || 0) : 0;
    let nama = bersih.slice(0, mJum.index).replace(/[\s–—:]+$/, '').replace(/[-]\s*$/, '').trim();
    // Angka bisa berada di dalam kurung penjelas — mis. "Setiap Hari Senin-Jumat (1 sesi
    // Gratis pukul 19.00…)". Memotong di situ menyisakan nama buntung berikut kurung
    // menggantung, jadi barisnya dipakai utuh dan jumlahnya dianggap 1.
    const kurungMenggantung = (nama.match(/\(/g) || []).length > (nama.match(/\)/g) || []).length;
    if (!nama || kurungMenggantung) {
      target.push({ kategori, grup, nama: nama0, target: 1, satuan: 'Paket', awal: 1 });
      continue;
    }
    target.push({
      kategori, grup, nama,
      // "10 Paket + 10 Paket COMING SOON" -> target 20, yang 10 sudah tersedia.
      target: n + tambahan,
      satuan: satuanRapi(mJum[2]),
      /* Sheet Master mendaftar apa yang paketnya BERISI, bukan antrean pekerjaan. Jadi
         bawaannya "sudah tersedia" — kalau tidak, impor melahirkan ratusan pekerjaan palsu
         yang sebenarnya sudah lama jadi. Satu-satunya penanda tekstual bahwa sesuatu BELUM
         ada adalah "COMING SOON"; hanya bagian itu yang disisakan sebagai kekurangan. */
      awal: tambahan ? n : (n || 0),
    });
  }
  return { target, bonus: bonus.join('\n').trim() };
}

module.exports = { uraiSel };
