# Sheet OKR — Panduan Menyusun

Sistem OKR berdiri **di luar** task tracker: spreadsheet sendiri, milik manager,
tidak menyentuh data operasional tim. Task tracker hanya jadi sumber angka lewat
[endpoint metrics](METRICS.md).

```
Sheet Task Tracker                    Sheet OKR (milik manager)
  Main, ACTIVITY, dst.                  Objective, KR, target
        │                                        │
        └──→ api/metrics.js ── HTTPS ───────────→┘
             read-only, agregat              kolom Query & Ambil
```

Berkas di folder `okr/` bukan bagian aplikasi — tidak dipanggil dari `api/` dan
tidak ikut ter-deploy. Isinya templat dan satu alat bantu penguji.

---

## Daftar isi

1. [Aturan dasar yang menentukan segalanya](#1-aturan-dasar-yang-menentukan-segalanya)
2. [Membuat sheet-nya](#2-membuat-sheet-nya)
3. [Arti tiap kolom](#3-arti-tiap-kolom)
4. [Menyusun kolom Query & Ambil](#4-menyusun-kolom-query--ambil)
5. [Memeriksa sebelum dipakai](#5-memeriksa-sebelum-dipakai)
6. [Alur review berkala](#6-alur-review-berkala)
7. [Kesalahan yang gampang terjadi](#7-kesalahan-yang-gampang-terjadi)

---

## 1. Aturan dasar yang menentukan segalanya

**OKR tidak lahir dari data. OKR ditetapkan manusia, lalu data dipakai mengukurnya.**

Kalau urutannya dibalik — buka data task, cari angka yang bisa dihitung, lalu
susun OKR dari situ — yang keluar adalah metrik kesibukan berbaju OKR.
"Menyelesaikan 280 task" itu laporan output, bukan hasil. Task tracker tahu
berapa banyak yang dikerjakan; dia tidak tahu apakah itu membawa perubahan.

Alur yang benar:

```
Manager menetapkan Objective (tujuan kualitatif)
        ↓
Manager menurunkan Key Result (pernyataan hasil, terukur)
        ↓
BARU dicari: apakah task tracker bisa mengukurnya?
        ↓
Bisa  → isi kolom Query & Ambil
Tidak → biarkan kosong, ukur dengan cara lain
```

Langkah terakhir itu penting. **Tidak semua KR harus terukur dari task tracker,
dan memaksakannya justru merusak OKR-nya.** Kalau sebuah hasil penting tapi tak
terlacak di sini — kepuasan tim, kualitas yang dirasakan pengguna, hasil bisnis —
tulis saja KR-nya dan kosongkan kolom Query. Nilainya diisi manual saat review.

Ada satu baris contoh seperti ini di templat, sengaja.

---

## 2. Membuat sheet-nya

**Langkah 1.** Buat Google Spreadsheet baru. Beri nama misalnya `OKR — Divisi Produk`.
Pemiliknya sebaiknya manager, bukan akun lain — ini dokumen kerjanya.

**Langkah 2.** Ganti nama tab pertama jadi **`OKR`** (huruf besar semua). Nama tab
ini yang dicari alat pemeriksa.

**Langkah 3.** Impor templatnya. Di Google Sheets: **File → Import → Upload**,
pilih [`okr/template.csv`](../okr/template.csv), lalu pada "Import location"
pilih **Replace current sheet**.

Templatnya sudah berisi lima contoh KR dengan **baseline dari data asli** (diukur
27 Agustus 2026). Ganti isinya dengan OKR kamu sendiri — contoh itu ada untuk
menunjukkan bentuknya, bukan untuk dipakai apa adanya.

**Langkah 4.** Kalau nanti mau dipakai alat pemeriksa atau MCP, bagikan sheet ini
ke service account dengan akses **Viewer** saja:

```
task-tracker@data-intelligence-500306.iam.gserviceaccount.com
```

Viewer sudah cukup — tidak ada yang perlu menulis ke sini selain manusia.

---

## 3. Arti tiap kolom

| Kolom | Isi | Wajib |
|---|---|---|
| `ID` | Pengenal tetap, mis. `O1.KR2`. Dipakai merujuk saat diskusi | ya |
| `Periode` | `Q3 2026`, `Agustus 2026` — untuk mata manusia | ya |
| `Objective` | Tujuan kualitatif. Boleh sama di beberapa baris | ya |
| `Key Result` | Pernyataan hasil yang terukur | ya |
| `Owner` | Siapa yang bertanggung jawab | ya |
| `Arah` | `naik` atau `turun` | ya |
| `Baseline` | Angka saat OKR ditetapkan | sangat disarankan |
| `Target` | Sasaran akhir periode | ya |
| `Query` | Querystring endpoint metrics | kalau terukur otomatis |
| `Ambil` | Jalur nilai di jawaban, mis. `data.on_time_rate` | kalau terukur otomatis |
| `Status` | Penilaian manusia: `On track` / `At risk` / `Off track` | tidak |
| `Catatan` | Konteks yang tak muncul di angka | tidak |

### Kenapa `Arah` wajib

Menentukan apakah `Target` itu batas bawah atau batas atas. Pada KR "Revisi turun
ke bawah 5%", nilai 1% adalah **melampaui target** — tanpa kolom ini, sistem apa
pun akan membacanya sebagai baru 20% tercapai.

### Kenapa `Baseline` sangat disarankan

Tanpa baseline, "sekarang 55,7% menuju 90%" tak bermakna. Berangkat dari 20% itu
kemajuan besar; berangkat dari 55% itu jalan di tempat.

Rumusnya:

```
progres = (sekarang − baseline) ÷ (target − baseline)
```

Rumus yang sama bekerja untuk dua arah, karena pada KR `turun` pembilang dan
penyebutnya sama-sama negatif.

Isi baseline dengan **menjalankan query-nya saat OKR ditetapkan**, bukan menebak.
Bagian 5 menunjukkan caranya.

---

## 4. Menyusun kolom Query & Ambil

Dua kolom ini jembatan antara kalimat KR dan angka nyata. Sengaja dipisah supaya
tak ada penerjemahan yang bisa salah diam-diam.

- **`Query`** — persis apa yang ada setelah tanda `?` pada URL endpoint
- **`Ambil`** — jalur bertitik menuju angkanya di dalam jawaban

Contoh: KR "Ketepatan waktu QC mencapai 90%"

```
Query : view=ontime&stage=QC&from=2026-07-01&to=2026-09-30
Ambil : data.on_time_rate
```

Artinya endpoint dipanggil di

```
/api/metrics?view=ontime&stage=QC&from=2026-07-01&to=2026-09-30
```

lalu diambil `data.on_time_rate` dari jawabannya.

### Pola yang sering dipakai

| Yang ingin diukur | Query | Ambil |
|---|---|---|
| Ketepatan waktu | `view=ontime&from=…&to=…` | `data.on_time_rate` |
| Ketepatan waktu satu stage | `view=ontime&stage=QC&from=…&to=…` | `data.on_time_rate` |
| Jumlah selesai per periode | `view=throughput&from=…&to=…` | `data.total_completed` |
| Task mandek | `view=aging&minDays=30` | `data.counted` |
| Task masih terbuka | `view=summary` | `data.open` |
| Jumlah pada satu status | `view=summary` | `data.by_status.Revisi` |
| Rata-rata hari terlambat | `view=ontime&from=…&to=…` | `data.avg_days_late` |

Daftar view dan penyaring selengkapnya ada di [docs/METRICS.md](METRICS.md).

> **Tanggal ditulis lengkap, bukan relatif.** Endpoint tidak mengenal "kuartal
> ini". Saat pindah ke Q4, ubah `from`/`to` di barisnya — atau lebih baik, buat
> baris baru dan simpan yang lama sebagai riwayat.

---

## 5. Memeriksa sebelum dipakai

Query yang salah ketik **tidak memunculkan error apa pun di spreadsheet**. Dia
diam saja sampai berbulan-bulan kemudian ada yang mempertanyakan angkanya.

Karena itu ada pemeriksanya:

```bash
METRICS_TOKEN=<token> node okr/check.js --csv okr/template.csv
```

Atau langsung ke sheet OKR yang sudah diisi:

```bash
METRICS_TOKEN=<token> node okr/check.js --sheet <ID_SHEET_OKR>
```

Keluarannya per KR — nilai sekarang, progres, dan catatan keterbatasan datanya:

```
O1.KR1  Ketepatan waktu QC mencapai 90%
  sekarang 0.886   baseline 0.886 → target 0.9 (naik)
  progres  0%
  · Hanya 69% task punya Due Date. Task tanpa Due Date TIDAK dihitung…
```

Yang ditangkapnya:

| Masalah | Pesannya |
|---|---|
| Nama view salah ketik | `QUERY DITOLAK (HTTP 400): View "ontimee" tidak dikenal` |
| Jalur `Ambil` salah | `JALUR "data.on_time_ratio" tidak menghasilkan angka` |
| Query diisi, Ambil kosong | `SETENGAH TERISI — isi keduanya, atau kosongkan keduanya` |
| Format tanggal salah | `Parameter "from" harus format YYYY-MM-DD` |
| Baseline kosong | `progres tak bisa dihitung, hanya nilai mentahnya yang berarti` |
| Arah kosong | `tak diketahui apakah target ini batas bawah atau batas atas` |

Keluar dengan kode `1` kalau ada yang bermasalah, jadi bisa dipakai di CI kalau
suatu saat perlu.

**Cara mengisi baseline:** kosongkan dulu kolom Baseline, jalankan pemeriksa,
lalu salin angka `sekarang` ke kolom Baseline. Itu titik berangkat yang sungguh
terukur, bukan tebakan.

---

## 6. Alur review berkala

```
1. Jalankan pemeriksa           → dapat nilai terkini semua KR
2. Isi KR manual                 → yang tak terukur dari tracker
3. Isi kolom Status              → penilaian manusia: On track / At risk / Off track
4. Isi kolom Catatan             → kenapa bergerak, atau kenapa tidak
5. Diskusi                       → apa yang diubah minggu depan
```

Langkah 3 sengaja manual. Angka bisa naik karena tim bekerja lebih baik, atau
karena definisinya bergeser, atau karena pencatatannya membaik. Hanya manusia
yang bisa membedakan ketiganya.

**Catatan keterbatasan ikut dibawa, bukan dibuang.** Kalau pemeriksa menampilkan
"hanya 69% task punya Due Date", itu bagian dari angkanya. KR yang terlihat 88%
padahal dihitung dari 35 task saja adalah cerita yang berbeda dari 88% atas 300
task.

---

## 7. Kesalahan yang gampang terjadi

**Menyusun OKR dari apa yang kebetulan bisa diukur.** Gejalanya: semua KR berupa
hitungan task. Kalau tidak ada satu pun KR manual di sheet, kemungkinan besar
tujuan sebenarnya sudah dipangkas agar muat ke alat ukurnya.

**Menjadikan metrik per orang sebagai KR.** `view=workload` dan `pic=` memang ada,
dan menggoda. Tapi begitu tim tahu throughput mereka jadi angka OKR, sebagian akan
menandai Done lebih cepat dari kenyataan — dan data yang jadi fondasi OKR itu
sendiri ikut rusak. Ukur alur kerjanya, bukan orangnya.

**Membandingkan antar periode terlalu dini.** Riwayat `ACTIVITY` baru mulai
29 Juni 2026, dan kolom status terstruktur baru aktif 27 Agustus 2026. Sebelum
`status_logging.structured_ratio` cukup tinggi, perbandingan antar bulan masih
menyesatkan. Lihat [docs/METRICS.md bagian 7](METRICS.md#7-batas-data-hari-ini).

**Baseline diisi dengan tebakan.** Angka yang enak dilihat, bukan yang terukur.
Akibatnya progres terlihat bagus sejak hari pertama tanpa ada yang berubah.

**Lupa `Arah` pada KR yang menurun.** Target `<5%` dengan arah kosong akan dibaca
sebagai "capai 5%", terbalik dari maksudnya.

---

## Berikutnya

Bagian 3 dari rencana — MCP di device manager — akan membaca sheet ini dan
endpoint metrics sekaligus, sehingga manager bisa bertanya dengan bahasa biasa
alih-alih menjalankan pemeriksa dari terminal.

Struktur kolom di atas sudah dirancang untuk itu: `Query` + `Ambil` adalah
kontrak yang sama yang akan dipakai MCP nanti. Isi sheet-nya sekarang, dan
bagian 3 tinggal menyambung.
