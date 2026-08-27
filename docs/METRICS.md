# Endpoint Metrics — Panduan Pemakaian

`api/metrics.js` adalah **pintu baca-saja** ke data Task Tracker, dibuat untuk dipakai
sistem lain — terutama sistem OKR manager — tanpa perlu tahu isi dalam spreadsheet.

Yang membedakan endpoint ini dari sekadar "ambil data": setiap jawaban membawa
**seberapa lengkap data di baliknya**. Angka tanpa konteks itu gampang dibaca sebagai
kebenaran utuh, padahal sering bukan.

---

## Daftar isi

1. [Kenapa endpoint terpisah](#1-kenapa-endpoint-terpisah)
2. [Setup sekali jalan](#2-setup-sekali-jalan)
3. [Cara memanggil](#3-cara-memanggil)
4. [Daftar view](#4-daftar-view)
5. [Penyaring yang berlaku di semua view](#5-penyaring-yang-berlaku-di-semua-view)
6. [Membaca jawaban](#6-membaca-jawaban)
7. [Batas data hari ini](#7-batas-data-hari-ini)
8. [Kalau ada masalah](#8-kalau-ada-masalah)
9. [Yang belum dikerjakan](#9-yang-belum-dikerjakan)

---

## 1. Kenapa endpoint terpisah

Task tracker ini berkembang cepat. Kalau sistem OKR membaca kolom sheet langsung,
tiap kali struktur sheet berubah, angka manager ikut bergeser tanpa ada yang sadar.

Endpoint ini jadi **kontrak**: struktur di dalam boleh berubah sesukanya, asalkan
bentuk jawaban di sini dijaga tetap sama.

```
Sheet Task Tracker
      │
      ├── api/rpc.js ──────→ Web app (tim)          baca + tulis
      │
      └── api/metrics.js ──→ Sistem OKR (manager)   BACA SAJA
```

### Tiga jaminan keamanan

| Jaminan | Cara ditegakkan |
|---|---|
| Tidak bisa menulis apa pun | Hanya melayani `GET`. Metode lain ditolak sebelum data dibaca |
| Tidak menyentuh data pribadi | Hanya memanggil `getTasks()` dan `getActivityLog()`. Sheet `NOTES`, `COMMENTS`, `LINKS`, `USERS`, `AUTH`, `CHECKLIST`, `COLLAB`, `NOTIFICATIONS` tidak pernah dibuka |
| Akses bisa dicabut per orang | Token terdaftar satu-satu, hapus satu tak mengganggu yang lain |

Jaminan kedua diuji otomatis — `test/metrics.test.js` membaca ulang kode sumbernya
dan gagal kalau ada panggilan ke luar dua fungsi itu. Jadi kalau nanti ada yang
menambah akses sheet lain tanpa sengaja, tesnya yang teriak duluan.

---

## 2. Setup sekali jalan

### Langkah 1 — Bikin token

Satu token untuk tiap orang atau sistem yang akan memakai:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Jalankan sebanyak jumlah pemakai. Jangan pakai token yang sama untuk dua pihak —
kalau salah satu bocor, kamu jadi harus mencabut akses semuanya sekaligus.

### Langkah 2 — Daftarkan di Vercel

Buka **Project Settings → Environments**, lalu **klik baris `Production`**. Variabel
dikelola di dalam environment itu.

> ⚠️ **Jangan klik tombol "Create Environment", dan abaikan kartu "Custom Environments"
> yang minta upgrade Pro.** Itu untuk membuat *lingkungan deployment* tambahan di luar
> Production/Preview/Development — bukan untuk menambah variabel. Menambah environment
> variable ke Production **gratis di paket Hobby**.

Tambahkan:

| Nama | Nilai | Wajib |
|---|---|---|
| `METRICS_TOKENS` | `manager:<token1>,okr-mcp:<token2>` | ya |
| `METRICS_CACHE_SECONDS` | `45` | tidak (default 45) |

Format `METRICS_TOKENS` itu `nama:token` dipisah koma. Bagian `nama` hanya dipakai
untuk penanda di log server — bukan bagian dari kredensial.

> **Kalau `METRICS_TOKENS` kosong, endpoint menolak semua permintaan.** Ini disengaja:
> lebih baik tertutup rapat daripada tak sengaja terbuka.

Setelah tersimpan, **Redeploy** — variabel baru tidak berlaku di deployment yang
sudah jalan.

### Langkah 3 — Pastikan jalan

```bash
curl -s -H "x-metrics-token: <token-kamu>" "https://product-task-tracker.vercel.app/api/metrics?view=summary"
```

Kalau berhasil, jawabannya diawali `{"ok":true,"view":"summary",...}`.

### Langkah 4 — Coba yang seharusnya gagal

Sama pentingnya. Ketiganya harus ditolak:

```bash
# tanpa token -> 401
curl -s -o /dev/null -w "%{http_code}\n" "https://product-task-tracker.vercel.app/api/metrics?view=summary"
```

```bash
# token salah -> 401
curl -s -o /dev/null -w "%{http_code}\n" -H "x-metrics-token: ngawur" "https://product-task-tracker.vercel.app/api/metrics?view=summary"
```

```bash
# coba menulis -> 405
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "x-metrics-token: <token-kamu>" "https://product-task-tracker.vercel.app/api/metrics"
```

Kalau ada yang balas `200`, berhenti dan periksa konfigurasinya sebelum token
dibagikan ke siapa pun.

---

## 3. Cara memanggil

```
GET https://product-task-tracker.vercel.app/api/metrics?view=<view>&<penyaring>
Header: x-metrics-token: <token>
```

> Contoh di bawah memakai dua variabel ini:
>
> ```bash
> export BASE="https://product-task-tracker.vercel.app"
> export TOKEN="<token-kamu>"
> ```

Token **harus lewat header**, tidak boleh lewat query string. URL gampang bocor —
tercatat di log server, riwayat browser, dan header `Referer`.

Endpoint ini **tidak mengirim header CORS**, jadi tak bisa dipanggil dari kode
browser. Ini disengaja: kalau bisa, tokennya harus ditaruh di perangkat pemakai.
Pemakaiannya server-ke-server (MCP, skrip, backend dashboard).

---

## 4. Daftar view

| View | Menjawab | Rentang tanggal mengacu ke |
|---|---|---|
| `summary` | Kondisi sekarang: berapa total, terbuka, sebaran status/stage/PIC | Created Date |
| `throughput` | Berapa yang selesai per bulan/minggu | tanggal selesai |
| `ontime` | Berapa persen selesai sebelum tenggat | tanggal selesai |
| `workload` | Beban tiap PIC, termasuk yang lewat tenggat | Created Date |
| `aging` | Task terbuka yang lama tak bergerak | Created Date |
| `tasks` | Daftar task tersaring, apa adanya | Created Date |

Tanpa `view`, dianggap `summary`.

### `summary`

```bash
curl -H "x-metrics-token: $TOKEN" "$BASE/api/metrics?view=summary"
```

```json
{
  "data": {
    "total": 471, "done": 415, "open": 56,
    "by_status":   { "Done": 415, "Review PM": 26, "Todo": 13, "Hold": 10, "In progress": 6, "Revisi": 1 },
    "by_stage":    { "QC": 118, "Operasional": 91, "Manajemen Sistem": 87 },
    "by_pic":      { "Kiki": 70, "Uma": 69, "Dhea": 66 },
    "by_priority": { "Normal": 345, "High": 81, "Urgent": 42, "Low": 3 },
    "by_platform": { "JadiASN": 115, "(kosong)": 77 }
  }
}
```

Tiap tally diurutkan dari yang terbanyak, dan nilai kosong muncul sebagai `(kosong)`
— sengaja ditampilkan, bukan dibuang, supaya lubang datanya kelihatan.

### `throughput`

Parameter tambahan:

| Parameter | Nilai | Default |
|---|---|---|
| `bucket` | `month` \| `week` | `month` |
| `groupBy` | `stage` \| `platform` \| `pic` \| `priority` | tak ada |

```bash
curl -H "x-metrics-token: $TOKEN" "$BASE/api/metrics?view=throughput&bucket=month&groupBy=stage"
```

```json
{
  "data": {
    "bucket": "month", "group_by": "stage", "total_completed": 252,
    "series": [
      { "period": "2026-06", "completed": 14,  "breakdown": { "Manajemen Sistem": 2, "Manajemen Guru": 1 } },
      { "period": "2026-07", "completed": 138, "breakdown": { "QC": 36, "Develop Konten (materi/soal)": 26 } },
      { "period": "2026-08", "completed": 100, "breakdown": { "Manajemen Sistem": 34, "QC": 14 } }
    ]
  }
}
```

Yang dihitung adalah **task**, bukan kejadian di log. Task yang statusnya diubah
berkali-kali tetap dihitung sekali, pada tanggal Done pertamanya.

### `ontime`

Sebuah task hanya bisa dinilai kalau punya **Due Date** *dan* **tanggal selesai**
yang bisa dipastikan. Yang tidak memenuhi masuk `not_scored` — tidak dianggap
tepat waktu, tidak juga dianggap telat.

```bash
curl -H "x-metrics-token: $TOKEN" "$BASE/api/metrics?view=ontime&from=2026-07-01&to=2026-09-30"
```

```json
{
  "data": {
    "done_total": 238, "scored": 194, "not_scored": 44,
    "on_time": 108, "late": 86,
    "on_time_rate": 0.557,
    "avg_days_late": 3.8,
    "worst": [ { "id": "TSK-389", "taskName": "…", "pic": "…", "dueDate": "2026-08-07", "completedOn": "2026-08-21", "daysLate": 14 } ]
  }
}
```

`worst` berisi 10 keterlambatan terparah — berguna untuk menunjuk contoh konkret
saat diskusi, bukan cuma bicara persentase. Perhatikan `avg_days_late` hanya
dirata-rata dari yang **telat**, bukan dari semua task; kalau ikut yang tepat
waktu, angkanya akan terlihat jauh lebih kecil dari kenyataan.

### `workload`

```bash
curl -H "x-metrics-token: $TOKEN" "$BASE/api/metrics?view=workload"
```

```json
{
  "data": {
    "as_of_day": "2026-08-27",
    "people": [
      { "pic": "Ali", "total": 36, "open": 15, "done": 21, "overdue": 2,
        "by_status": { "Review PM": 7, "Hold": 4, "In progress": 3, "Revisi": 1 } }
    ]
  }
}
```

Diurutkan dari yang paling banyak task terbuka. `overdue` hanya menghitung task
terbuka yang Due Date-nya sudah lewat.

### `aging`

Task terbuka yang lama tak bergerak.

| Parameter | Arti | Default |
|---|---|---|
| `minDays` | Minimal berapa hari mandek baru ditampilkan | `14` |
| `limit` | Maksimal baris | `50` |

```bash
curl -H "x-metrics-token: $TOKEN" "$BASE/api/metrics?view=aging&minDays=30"
```

```json
{
  "data": {
    "min_days": 30, "counted": 16,
    "measured_from_status_change": 0,
    "measured_from_created_date": 16,
    "tasks": [
      { "id": "TSK-002", "status": "Hold", "pic": "Ali",
        "idleDays": 86, "basis": "createdDate", "since": "2026-06-02", "overdue": false }
    ]
  }
}
```

**Perhatikan `basis`.** Idealnya umur dihitung dari perubahan status terakhir
(`statusBy`). Kalau kolom itu kosong, dipakai Created Date — dan umurnya jadi
terlihat **lebih tua dari kenyataan**, karena task bisa saja aktif dikerjakan
tanpa pernah berganti status.

Saat ini hampir semua baris memakai `createdDate`. Dua penghitung di atas
(`measured_from_status_change` vs `measured_from_created_date`) ada supaya
perbandingannya kelihatan sekali lihat.

### `tasks`

| Parameter | Arti | Default |
|---|---|---|
| `limit` | Maksimal baris (batas keras 500) | `100` |
| `include=notes` | Ikutkan `picNotes` & `pmNotes` | tidak ikut |

```bash
curl -H "x-metrics-token: $TOKEN" "$BASE/api/metrics?view=tasks&stage=QC&status=Review%20PM"
```

Catatan bebas tidak ikut secara bawaan supaya jawaban tidak tenggelam teks panjang.
Kalau memang perlu, minta `include=notes`.

Yang **tidak pernah bisa** diminta lewat parameter apa pun: isi sheet `NOTES`
("catatan saya" per orang), `COMMENTS`, dan `LINKS`. Tidak ada jalurnya di kode.

---

## 5. Penyaring yang berlaku di semua view

| Parameter | Contoh | Catatan |
|---|---|---|
| `from`, `to` | `2026-07-01` | Harus `YYYY-MM-DD`. Inklusif di kedua ujung |
| `stage` | `QC` | Tak peduli huruf besar-kecil |
| `platform` | `Markaz` | Cocok juga di sel bernilai ganda, mis. `"All Platform, Markaz"` |
| `pic` | `Dhea` | Persis, tak peduli huruf besar-kecil |
| `status` | `Review PM` | |
| `priority` | `Urgent` | |
| `q` | `video` | Cari potongan kata di nama task |

Bisa digabung bebas:

```bash
curl -H "x-metrics-token: $TOKEN" "$BASE/api/metrics?view=ontime&stage=QC&platform=JadiASN&from=2026-07-01&to=2026-09-30"
```

### Rentang tanggal mengacu ke kolom yang berbeda

Ini sumber salah paham yang paling sering, jadi tiap jawaban menyebutkan sendiri
lewat `range_applied_to`:

- `throughput` dan `ontime` → **tanggal selesai**. "Berapa yang selesai di Q3."
- View lain → **Created Date**. "Task yang dibuat di Q3, bagaimana keadaannya."

---

## 6. Membaca jawaban

Semua view memakai bungkus yang sama:

```json
{
  "ok": true,
  "view": "ontime",
  "as_of": "2026-08-27T09:14:03.221Z",
  "from_cache": true,
  "cache_age_seconds": 12,
  "filters": { "from": "2026-07-01", "to": "2026-09-30", "stage": "", "...": "" },
  "range_applied_to": "completedOn",
  "coverage": { "...": "..." },
  "excluded":  { "no_completion_date": 163 },
  "caveats":   [ "..." ],
  "data":      { "...": "..." }
}
```

### `coverage` — seberapa lengkap datanya

Dihitung dari baris yang benar-benar dipakai jawaban ini, bukan seluruh sheet.

| Kolom | Arti |
|---|---|
| `tasks_counted` | Berapa task jadi dasar jawaban |
| `due_date` | Rasio yang punya Due Date |
| `platform` | Rasio yang platform-nya terisi |
| `pic` | Rasio yang PIC-nya terisi |
| `completion_date` | Rasio task Done yang tanggal selesainya bisa dipastikan |

### `excluded` — yang gugur sebelum dihitung

Saat `throughput`/`ontime` disaring per periode, task Done yang tanggal selesainya
tak diketahui **gugur sebelum masuk hitungan** — tak mungkin ditentukan dia jatuh
di rentang itu atau bukan.

Tanpa angka ini, `coverage.completion_date` akan terlihat 100% justru **karena**
yang bolong sudah tersingkir duluan. Jadi jumlahnya disebut terpisah.

### `caveats` — peringatan berbahasa manusia

Dirakit dari kondisi data saat itu, bukan daftar tetap. Kalau pencatatan membaik,
peringatannya hilang dengan sendirinya.

Contoh nyata dari data sekarang:

> 163 task Done tidak masuk hitungan karena tanggal selesainya tak diketahui,
> sehingga tak bisa dipastikan jatuh di rentang ini atau bukan. Angka di bawah
> dihitung dari sisanya.

> Hanya 82% task punya Due Date. Task tanpa Due Date TIDAK dihitung, jadi angka
> ini bukan gambaran seluruh task.

**Kalau `caveats` tidak kosong, sampaikan isinya bersama angkanya.** Itu gunanya
ada di sana. Untuk MCP nanti, ini artinya `caveats` ikut masuk jawaban ke Claude —
bukan dibuang karena dianggap bukan "data".

### Cache

`from_cache: true` berarti angkanya dari hasil baca beberapa detik lalu, bukan
baca baru. Sepuluh pertanyaan berbeda dalam satu menit tetap cuma sekali baca
ke Google.

Kalau butuh angka betul-betul segar, tunggu `cache_age_seconds` melewati
`METRICS_CACHE_SECONDS`, atau set variabel itu ke `0`.

---

## 7. Batas data hari ini

Diukur langsung dari spreadsheet pada **27 Agustus 2026**. Angka-angka ini akan
berubah seiring pencatatan membaik — periksa `coverage` di jawaban asli, jangan
percaya tabel ini selamanya.

| Yang diukur | Kondisi | Akibatnya |
|---|---|---|
| Riwayat `ACTIVITY` | Mulai **29 Jun 2026** | Perbandingan antar kuartal belum bisa. Q1–Q2 tak berjejak |
| Due Date terisi | **76%** (357/471) | `ontime` mengabaikan seperempat task |
| Tanggal selesai dipastikan | **61%** (252/415 Done) | Hampir 4 dari 10 task Done tak diketahui kapan selesainya |
| `statusBy` terisi | **25%** (117/471) | `aging` hampir selalu memakai Created Date, umurnya jadi terlihat lebih tua |
| Platform terisi | **84%** | Pecahan per platform tidak lengkap |
| Platform bernilai ganda | ada, mis. `"All Platform, Markaz"` | Satu task bisa terhitung di beberapa platform |

### Yang paling berdampak: riwayat status masih teks bebas

Status perubahan tersimpan begini di kolom Detail `ACTIVITY`:

```
Mengedit 5 Video materi • Status: Done • PIC: Dhea
```

Endpoint ini membacanya dengan pencocokan pola. Jalan, tapi rapuh — begitu format
teksnya berubah sedikit, angka riwayat ikut bergeser tanpa error apa pun.

**Perbaikan yang paling besar hasilnya:** tambahkan kolom terpisah di `ACTIVITY`
untuk status lama dan status baru. Sekali dikerjakan, `completion_date` naik
mendekati 100%, `aging` jadi akurat, dan tren antar bulan bisa dipercaya.

Sampai itu dikerjakan: **kondisi hari ini bisa dipercaya, tren antar periode belum.**

---

## 8. Kalau ada masalah

| Yang terjadi | Sebabnya | Perbaikannya |
|---|---|---|
| `401` + `METRICS_TOKENS belum diset` | Variabel belum ada di Production | Settings → Environments → klik **Production**, isi variabelnya, lalu **Redeploy** |
| `401` + `Perlu header x-metrics-token` | Header tak terkirim atau token salah | Pastikan header, bukan query string. Cek titik dua di `nama:token` |
| `405` | Memakai POST/PUT | Endpoint ini hanya `GET` |
| `400 BAD_DATE` | Format tanggal salah | Pakai `YYYY-MM-DD`, mis. `2026-07-01` |
| `400 UNKNOWN_VIEW` | Salah tulis nama view | Daftar yang sah ikut dikirim di jawaban |
| `500 Env SPREADSHEET_ID belum diset` | Variabel dasar belum ada | Lihat [README](../README.md) bagian Environment Variables |
| Angka tak berubah padahal sheet sudah diubah | Masih dalam masa cache | Tunggu `cache_age_seconds` lewat, atau set `METRICS_CACHE_SECONDS=0` |
| `on_time_rate` terasa terlalu bagus | Task tanpa Due Date tidak dihitung | Baca `coverage.due_date` dan `excluded` |
| Angka `aging` terlihat kelewat besar | Umur dihitung dari Created Date | Lihat `basis` tiap baris dan `measured_from_created_date` |

### Menjalankan tes

```bash
npm run test:metrics
```

88 assertion, tanpa jaringan dan tanpa credential — memakai data contoh di memori.

Untuk menguji ke spreadsheet asli, jalankan lewat `vercel dev` dengan `.env` terisi,
lalu tembak `http://localhost:3000/api/metrics?view=summary`.

---

## 9. Yang belum dikerjakan

Endpoint ini bagian pertama dari tiga. Dua sisanya belum dibuat:

| # | Bagian | Status |
|---|---|---|
| 1 | `api/metrics.js` — kontrak read-only | **selesai** |
| 2 | Sheet OKR — Objective, KR, target, cara ukur | belum |
| 3 | MCP di device manager — baca (1), baca/tulis (2) | belum |

Bagian 1 sudah berguna sendiri: skrip, dashboard, atau laporan apa pun bisa
memakainya sekarang, tanpa menunggu OKR.

Untuk bagian 2, kolom `Cara ukur` di sheet OKR sebaiknya langsung berisi parameter
endpoint ini, supaya tak ada penerjemahan yang bisa salah:

| KR | Target | Cara ukur |
|---|---|---|
| QC selesai tepat waktu | 90% | `view=ontime&stage=QC` → `data.on_time_rate` |
| Revisi ditekan | <5% | `view=summary` → `by_status.Revisi / total` |

Sebelum bagian 3 dipasang, sebaiknya kolom status di `ACTIVITY` dirapikan dulu
(lihat [bagian 7](#7-batas-data-hari-ini)). Kalau tidak, hal pertama yang dilakukan
manager hampir pasti membandingkan antar bulan — dan itu justru bagian yang paling
belum bisa dipercaya.

---

## Ringkasan

```bash
# angka hari ini
curl -H "x-metrics-token: $TOKEN" "$BASE/api/metrics?view=summary"

# selesai per bulan, dipecah per stage
curl -H "x-metrics-token: $TOKEN" "$BASE/api/metrics?view=throughput&groupBy=stage"

# ketepatan waktu Q3
curl -H "x-metrics-token: $TOKEN" "$BASE/api/metrics?view=ontime&from=2026-07-01&to=2026-09-30"

# beban tiap orang
curl -H "x-metrics-token: $TOKEN" "$BASE/api/metrics?view=workload"

# yang mandek lebih dari sebulan
curl -H "x-metrics-token: $TOKEN" "$BASE/api/metrics?view=aging&minDays=30"
```

Selalu baca `caveats` sebelum memakai angkanya.
