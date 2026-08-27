# MCP Server — Claude di Device Manager

`api/mcp.js` membuat Claude di perangkat manapun bisa bertanya soal task tim dan
progres OKR dengan bahasa biasa — tanpa ada yang perlu dipasang di perangkat itu,
dan tanpa satu pun kredensial Google turun ke sana.

```
Sheet Task Tracker          Sheet OKR (milik manager)
        │                            │
   api/metrics.js                    │
        │  runQuery()                │ spreadsheets.readonly
        └──────→ api/mcp.js ←────────┘
                     │  HTTPS + Bearer token
              Claude di device manager
```

Berkas ini satu-satunya yang mengenal dua dunia sekaligus — memang itu tugasnya,
dia jembatannya. Yang tetap terpisah adalah datanya dan kode task tracker-nya
sendiri: `_sheets.js`, `rpc.js`, dan `metrics.js` tidak mengenal satu pun istilah
OKR.

---

## Daftar isi

1. [Batas kemampuannya](#1-batas-kemampuannya)
2. [Setup](#2-setup)
3. [Menyambungkan dari device manager](#3-menyambungkan-dari-device-manager)
4. [Delapan tool yang tersedia](#4-delapan-tool-yang-tersedia)
5. [Yang bisa dan tidak bisa ditanyakan](#5-yang-bisa-dan-tidak-bisa-ditanyakan)
6. [Kalau ada masalah](#6-kalau-ada-masalah)

---

## 1. Batas kemampuannya

| Terhadap | Kemampuan | Ditegakkan oleh |
|---|---|---|
| Task tracker | **baca saja** | Hanya lewat `runQuery()` — tak ada satu pun jalur tulis |
| Sheet OKR | **baca saja** | Scope `spreadsheets.readonly`; token dari Google memang tak bisa menulis |
| Catatan pribadi | **tak terjangkau** | `metrics.js` hanya menyentuh `Main` & `ACTIVITY` |

Baris kedua bukan sekadar niat baik. Scope `readonly` ditegakkan Google di sisi
sana, jadi salah kode sekalipun tak bisa merusak sheet OKR manager.

Konsekuensinya: **manager tetap menyunting OKR-nya langsung di Google Sheets.**
Claude bisa membaca dan menghitung, tidak mengubah. Ini pilihan sadar untuk versi
pertama — kalau nanti menulis memang diperlukan, itu butuh akses Editor dan tool
tersendiri, dan sebaiknya diputuskan terpisah.

---

## 2. Setup

Endpoint memakai **token yang sama** dengan metrics, jadi tak ada yang perlu
dibuat lagi. Mencabut satu baris di `METRICS_TOKENS` menutup dua-duanya sekaligus.

Yang perlu ditambahkan hanya penunjuk ke sheet OKR. Di Vercel **Settings →
Environments → Production**:

| Nama | Nilai | Wajib |
|---|---|---|
| `OKR_SHEET_ID` | ID sheet OKR, bagian tengah URL-nya | untuk tool `okr_*` |
| `OKR_SHEET_TAB` | Nama tab. Default `OKR` | tidak |

ID-nya diambil dari URL:

```
https://docs.google.com/spreadsheets/d/<INI_ID_NYA>/edit
```

Sheet OKR juga harus di-share ke service account, **Viewer** saja:

```
task-tracker@data-intelligence-500306.iam.gserviceaccount.com
```

Lalu **Redeploy**.

> Tanpa `OKR_SHEET_ID`, tool `task_*` tetap jalan normal. Yang gagal hanya
> `okr_list` dan `okr_progress`, dengan pesan yang menyebutkan apa yang kurang —
> bukan error yang membingungkan.

---

## 3. Menyambungkan dari device manager

### Claude Code

Satu perintah, dan ini jalur yang sudah pasti bekerja karena header bisa disetel
langsung:

```bash
claude mcp add --transport http task-tracker https://product-task-tracker.vercel.app/api/mcp --header "Authorization: Bearer <token-okr-mcp>"
```

### Claude Desktop / claude.ai

Ditambahkan sebagai **custom connector** dengan URL:

```
https://product-task-tracker.vercel.app/api/mcp
```

**Ini perlu dicoba dulu, bukan dijamin.** Dukungan header autentikasi statis pada
custom connector berbeda-beda antar versi aplikasi — sebagian versi hanya
menyediakan alur OAuth. Kalau di aplikasi manager tidak ada tempat mengisi header
`Authorization`, jalur ini belum bisa dipakai apa adanya.

Kalau ternyata begitu, ada dua jalan keluar, dan sebaiknya diputuskan setelah tahu
versi mana yang dipakai:

- Manager memakai Claude Code (jalur pertama di atas), atau
- Ditambahkan lapisan OAuth di endpoint ini

### Memastikan sambungannya hidup

```bash
curl -s -X POST https://product-task-tracker.vercel.app/api/mcp \
  -H "Authorization: Bearer <token-okr-mcp>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Harus mengembalikan delapan tool. Kalau `401`, tokennya salah atau belum
di-redeploy.

---

## 4. Delapan tool yang tersedia

### Task tracker

| Tool | Menjawab |
|---|---|
| `task_summary` | Kondisi sekarang: total, terbuka, sebaran status/stage/PIC |
| `task_throughput` | Berapa selesai per bulan atau minggu |
| `task_ontime` | Berapa persen selesai sebelum tenggat |
| `task_workload` | Beban tiap PIC, termasuk yang lewat tenggat |
| `task_aging` | Task terbuka yang lama tak bergerak |
| `task_list` | Daftar task tersaring |

Semuanya menerima penyaring yang sama: `from`, `to`, `stage`, `platform`, `pic`,
`status`, `priority`, `q`.

### Sheet OKR

| Tool | Menjawab |
|---|---|
| `okr_list` | Daftar Objective & KR apa adanya, tanpa menghitung |
| `okr_progress` | Menjalankan `Query`/`Ambil` tiap KR, lalu membandingkan ke baseline & target |

`okr_progress` adalah inti sistemnya. Untuk tiap KR dia mengembalikan `measured`
yang berisi salah satu dari:

| Nilai | Artinya |
|---|---|
| `auto` | Terukur dari task tracker. Ada `current`, `progress`, `target_reached`, `caveats` |
| `manual` | Kolom `Query` sengaja kosong — diukur di luar task tracker |
| `error` | Cara ukurnya bermasalah, dengan penjelasan sebabnya |

Pembedaan `manual` itu penting: KR yang tidak diukur dari sini dilaporkan apa
adanya sebagai "tidak ada angkanya di sini", bukan dikarang jadi nol.

### Caveats ikut di setiap jawaban

Tiap tool mengembalikan `caveats` — keterbatasan data di balik angkanya. Deskripsi
tiap tool sudah memuat instruksi agar Claude selalu menyampaikannya bersama
angkanya, dan `initialize` mengulang instruksi yang sama di tingkat server.

Jadi manager tidak akan menerima "55,7%" telanjang; yang sampai adalah 55,7%
beserta catatan bahwa 163 task Done tak terhitung karena tanggal selesainya tak
diketahui.

---

## 5. Yang bisa dan tidak bisa ditanyakan

Yang berjalan baik:

```
"Progres KR-1 gimana?"
"Task apa yang nyangkut di Review PM lebih dari dua minggu?"
"Beban siapa yang paling berat sekarang?"
"Stage mana yang paling sering kena Revisi?"
"Kenapa throughput Agustus turun dibanding Juli?"
```

Yang perlu diketahui sejak awal:

**"Kenapa TSK-042 telat?"** — Claude bisa menunjukkan *bahwa* task itu telat,
berapa lama, di stage mana. Alasannya tidak ada di data; yang keluar cuma dugaan.

**"Bandingkan Q1 vs Q2"** — belum bisa. Riwayat `ACTIVITY` baru mulai 29 Juni 2026,
dan kolom status terstruktur baru aktif 27 Agustus 2026. Periksa
`status_logging.structured_ratio` sebelum mempercayai perbandingan antar periode.

**"Apa isi catatan pribadi si A?"** — tak bisa, dengan cara apa pun. Sheet `NOTES`
tidak terjangkau dari sini.

**"Ubah target KR-1 jadi 80%"** — tak bisa. Sunting langsung di Google Sheets.

### Satu hal yang bukan soal teknis

Ada 11 PIC, dan `task_workload` bisa menghasilkan metrik per orang dengan mudah.
Kalau tim tahu ada AI yang menghitung throughput mereka satu-satu, sebagian akan
menandai Done lebih cepat dari kenyataan — dan data yang jadi fondasi OKR itu
sendiri ikut rusak.

Lebih aman kalau posisinya jelas sejak awal: ini alat melihat **alur kerja** — di
mana yang macet, mana yang kelebihan beban — bukan alat menilai orang.

---

## 6. Kalau ada masalah

| Yang terjadi | Sebabnya | Perbaikannya |
|---|---|---|
| `401` saat menyambung | Token salah, atau belum redeploy | Cek token, Redeploy dari Vercel |
| `405` pada permintaan GET | Klien mencoba membuka aliran SSE | Wajar — server ini stateless, hanya melayani POST |
| Tool `okr_*` mengembalikan error | `OKR_SHEET_ID` belum diset | Lihat [bagian 2](#2-setup) |
| `okr_progress` bilang "Query ditolak" | Salah ketik di kolom Query | Jalankan `npm run okr:check` untuk melihat baris mana |
| KR menunjukkan `measured: "error"` | Kolom `Query`/`Ambil` bermasalah | Pesannya menyebutkan sebabnya |
| Angka tak berubah padahal sheet sudah diubah | Masih dalam masa cache (45 detik) | Tunggu sebentar, atau set `METRICS_CACHE_SECONDS=0` |
| Progres semua KR `null` | Kolom `Baseline` kosong | Isi baseline — lihat [docs/OKR.md](OKR.md#5-memeriksa-sebelum-dipakai) |

### Menjalankan tes

```bash
npm run test:mcp
```

68 assertion, tanpa jaringan dan tanpa credential — memakai spreadsheet tiruan
yang melayani sheet task tracker dan sheet OKR sekaligus, jadi jalur
`okr_progress` teruji utuh sampai ke perhitungan metrics.

---

## Rangkaian lengkapnya

| # | Bagian | Berkas | Status |
|---|---|---|---|
| 1 | Endpoint metrics read-only | `api/metrics.js` | selesai |
| 1b | Kolom status terstruktur | `api/_sheets.js` | selesai |
| 2 | Templat & pemeriksa sheet OKR | `okr/` | selesai |
| 3 | MCP server | `api/mcp.js` | selesai |

Yang tersisa bukan lagi pekerjaan kode, melainkan pemakaian: isi sheet OKR dengan
Objective sungguhan, biarkan pencatatan status terkumpul beberapa minggu, lalu
periksa `status_logging.structured_ratio` sebelum mulai membandingkan antar
periode.
