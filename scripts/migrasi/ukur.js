/* =============================================================================
   ukur.js — membandingkan hasil tarikan dengan batas panjang kolom di DDL.

   Dijalankan di ANTARA tarik.js dan muat.js. Tidak menyentuh jaringan, tidak
   menyentuh database — hanya membaca db/dump/*.json dan db/produk_base.sql.

   Alasannya: panjang VARCHAR di DDL ditentukan berdasarkan penilaian terhadap isi
   kolomnya, sedangkan Sheets tak punya batas panjang sama sekali. Satu catatan
   yang luar biasa panjang sudah cukup untuk menghentikan pemuatan di tengah jalan
   dengan ER_DATA_TOO_LONG — sesudah ratusan baris lain terlanjur masuk.

   Lebih baik tahu sekarang, selagi belum ada yang ditulis.

   Jalankan:
     node scripts/migrasi/ukur.js
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..', '..');
const DUMP = path.join(AKAR, 'db', 'dump');
const DDL = path.join(AKAR, 'db', 'produk_base.sql');

/* Petik batas VARCHAR tiap kolom langsung dari DDL-nya, bukan dari daftar yang
   ditulis ulang di sini. DDL-lah yang akan menolak nanti, jadi DDL juga yang
   harus jadi acuan sekarang. */
function batasDariDDL() {
  const sql = fs.readFileSync(DDL, 'utf8');
  const batas = {};
  const re = /CREATE TABLE IF NOT EXISTS ([a-z_]+) \(([\s\S]*?)\n\) ENGINE=InnoDB;/g;
  let m;
  while ((m = re.exec(sql))) {
    const kol = {};
    m[2].split('\n').forEach(baris => {
      const bersih = baris.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/, '').replace(/,\s*$/, '').trim();
      const g = bersih.match(/^([a-z_]+)\s+VARCHAR\((\d+)\)(.*)$/);
      /* `ekor` menyimpan sisa deklarasinya apa adanya — NULL, NOT NULL DEFAULT '',
         dan seterusnya. Saran ALTER nanti menyalinnya, tidak mengarang sendiri:
         menebak "NOT NULL DEFAULT ''" untuk kolom yang sebenarnya boleh NULL akan
         merusak kunci asing ON DELETE SET NULL yang bergantung padanya. */
      if (g) kol[g[1]] = { batas: Number(g[2]), ekor: g[3].replace(/s+/g, " ").trimEnd() };
    });
    batas[m[1]] = kol;
  }
  return batas;
}

function main() {
  if (!fs.existsSync(DUMP)) {
    console.error('Folder db/dump/ belum ada. Jalankan tarik.js dulu.');
    process.exit(1);
  }

  const batas = batasDariDDL();
  const kepanjangan = [];
  const terpanjang = [];

  for (const tabel of Object.keys(batas)) {
    const berkas = path.join(DUMP, tabel + '.json');
    if (!fs.existsSync(berkas)) continue;
    const baris = JSON.parse(fs.readFileSync(berkas, 'utf8'));

    for (const kolom of Object.keys(batas[tabel])) {
      const { batas: lebar, ekor } = batas[tabel][kolom];
      let maks = 0, barisMaks = null;
      for (const o of baris) {
        const v = o[kolom] == null ? '' : String(o[kolom]);
        if (v.length > maks) { maks = v.length; barisMaks = o.__baris; }
        if (v.length > lebar) {
          kepanjangan.push({ tabel, kolom, baris: o.__baris, panjang: v.length,
            batas: lebar, ekor, contoh: v.slice(0, 60) });
        }
      }
      if (maks) terpanjang.push({ tabel, kolom, maks, batas: lebar, barisMaks });
    }
  }

  /* Kolom yang nyaris penuh belum gagal, tapi akan gagal pada baris berikutnya
     yang sedikit lebih panjang. Itu layak dilihat sekarang, bukan nanti. */
  const mepet = terpanjang.filter(t => t.maks > t.batas * 0.8 && t.maks <= t.batas);
  if (mepet.length) {
    console.log('\n  Kolom yang sudah terpakai di atas 80% batasnya:');
    mepet.sort((a, b) => b.maks / b.batas - a.maks / a.batas).forEach(t => {
      console.log('    ' + (t.tabel + '.' + t.kolom).padEnd(34)
        + String(t.maks).padStart(5) + ' / ' + t.batas + '   (baris ' + t.barisMaks + ')');
    });
  }

  if (!kepanjangan.length) {
    console.log('\n  Semua nilai muat di kolomnya. Aman dilanjut ke muat.js.\n');
    return;
  }

  console.log('\n  ' + kepanjangan.length + ' nilai KEPANJANGAN — pemuatan akan gagal di sini:\n');
  kepanjangan.forEach(k => {
    console.log('    ' + k.tabel + '.' + k.kolom + '  baris ' + k.baris
      + ': ' + k.panjang + ' karakter, batas ' + k.batas);
    console.log('        ' + JSON.stringify(k.contoh) + '...');
  });

  /* Lebarkan kolomnya, jangan potong datanya. Memotong berarti menghilangkan isi
     yang ditulis orang, dan hilangnya tak akan pernah ketahuan. */
  const perlu = {};
  kepanjangan.forEach(k => {
    const kunci = k.tabel + '.' + k.kolom;
    if (!perlu[kunci]) perlu[kunci] = { panjang: 0, ekor: k.ekor };
    perlu[kunci].panjang = Math.max(perlu[kunci].panjang, k.panjang);
  });
  console.log('\n  Perbaikannya: lebarkan kolomnya di db/produk_base.sql (JANGAN potong datanya),');
  console.log('  lalu jalankan ALTER ini di database yang tabelnya sudah terlanjur dibuat:\n');
  Object.keys(perlu).forEach(kunci => {
    const [t, c] = kunci.split('.');
    /* Dibulatkan ke atas supaya tak perlu mengulang hal yang sama bulan depan. */
    const usul = Math.ceil((perlu[kunci].panjang + 20) / 50) * 50;
    console.log('    ALTER TABLE `' + t + '` MODIFY `' + c + '` VARCHAR(' + usul + ')'
      + perlu[kunci].ekor + ';');
  });
  console.log('\n  Periksa dulu baris aslinya di spreadsheet sebelum melebarkan — nilai yang');
  console.log('  jauh di luar kebiasaan kadang bukan data panjang, tapi sel yang salah isi.\n');
  process.exit(1);
}

main();
