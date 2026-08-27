# Product Task Tracker — Deploy ke Vercel (data tetap ke Google Spreadsheet)

Versi ini memindahkan Task Tracker dari **Apps Script Web App** ke **Vercel**, tetapi
seluruh data **tetap dibaca & ditulis ke Google Spreadsheet yang sama** (sheet `Main`,
`OPTIONS`, `COMMENTS`, `ACTIVITY`). UI tidak berubah — yang berubah hanya "mesin" di belakangnya:
dari `google.script.run` menjadi pemanggilan `fetch` ke serverless function di `/api/rpc`.

```
task-tracker-vercel/
├─ api/
│  ├─ rpc.js        # 1 endpoint: terima {action, args}, panggil fungsi backend
│  └─ _sheets.js    # semua logika (port dari Code.gs) pakai Google Sheets API
├─ public/
│  └─ index.html    # UI lama, kini memanggil /api/rpc
├─ test/logic.test.js
├─ package.json
├─ vercel.json
├─ .env.example
└─ .gitignore
```

Akses ke Spreadsheet memakai **Service Account** (1 akun robot milik Google Cloud).
Anda cukup men-*share* Spreadsheet ke email service account tersebut sebagai **Editor**.

> **Bagaimana koneksinya bekerja (bahasa sederhana).** Spreadsheet Anda **tidak berubah** dan tetap menjadi database. Yang baru: Vercel butuh izin untuk membaca/menulis sheet itu. Google memberi sebuah **akun robot** (service account) dengan email sendiri + satu file kunci `.json`. Anda **share sheet ke email robot** itu (persis seperti share ke rekan kerja), lalu **tempel file kunci robot ke Vercel**. Setelah itu Vercel "login sebagai robot" dan menulis ke spreadsheet yang sama. Tiga hal wajib sejajar: **(1)** Google Sheets API aktif, **(2)** sheet di-share ke email robot, **(3)** kunci JSON + Spreadsheet ID terisi di Vercel.

---

## Ringkasan langkah

1. Buat **Service Account** di Google Cloud + aktifkan **Google Sheets API**.
2. Buat **key JSON** untuk service account itu.
3. **Share** Google Spreadsheet ke email service account (sebagai Editor).
4. Push project ini ke **GitHub**, lalu **Import** ke **Vercel**.
5. Isi **Environment Variables** di Vercel (`SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`, dll).
6. **Deploy**. Buka URL → klik **Setup** sekali (atau jalankan otomatis) untuk memastikan header & dropdown siap.

---

## 1. Google Cloud: Service Account + Sheets API

1. Buka <https://console.cloud.google.com/> → buat / pilih sebuah **Project**.
2. Menu **APIs & Services → Library** → cari **Google Sheets API** → **Enable**.
3. Menu **APIs & Services → Credentials → Create Credentials → Service account**.
   - Beri nama, mis. `task-tracker`. Klik **Create and continue** → **Done**.
4. Klik service account yang baru dibuat → tab **Keys → Add key → Create new key → JSON**.
   - File `.json` akan terunduh. **Simpan baik-baik & jangan di-commit ke Git.**
5. Catat **email** service account, bentuknya seperti:
   `task-tracker@nama-project.iam.gserviceaccount.com`

## 2. Share Spreadsheet ke service account

1. Buka Google Spreadsheet Task Management Anda.
2. Klik **Share / Bagikan**.
3. Tempel **email service account** tadi, beri peran **Editor**, kirim.
   (Tanpa langkah ini, Vercel tidak akan bisa menulis ke sheet → akan muncul error 403.)
4. Salin **Spreadsheet ID** dari URL:
   `https://docs.google.com/spreadsheets/d/`**`<INI_SPREADSHEET_ID>`**`/edit`

## 3. Siapkan kode (GitHub)

Cara termudah lewat web tanpa command line:
1. Buat repository baru di GitHub (boleh private).
2. Upload seluruh isi folder `task-tracker-vercel/` ke repo tersebut
   (tombol **Add file → Upload files** di GitHub bisa dipakai untuk drag-and-drop).

Atau via Git:
```bash
cd task-tracker-vercel
git init
git add .
git commit -m "Task tracker on Vercel"
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

## 4. Import ke Vercel

1. Buka <https://vercel.com/> → login (boleh pakai akun GitHub).
2. **Add New → Project → Import** repo Anda.
3. Framework Preset: **Other**. Dengan preset ini Vercel otomatis menyajikan isi folder
   **`public/`** sebagai web root (`index.html` → `/`) dan menjadikan file di **`api/`**
   sebagai serverless function (`api/rpc.js` → `/api/rpc`). Build Command & Output Directory
   biarkan kosong/default.
4. **JANGAN deploy dulu** — buka **Environment Variables** lebih dulu (langkah 5).

## 5. Environment Variables di Vercel

Di halaman import (atau **Project → Settings → Environment Variables**), tambahkan:

| Name | Value |
|---|---|
| `SPREADSHEET_ID` | ID spreadsheet dari langkah 2 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | **Seluruh isi** file JSON service account, **dalam satu baris** |
| `MANAGERS` | (opsional) daftar nama manager, pisah koma. Default `Nynda` |
| `TIMEZONE_OFFSET_MINUTES` | (opsional) `420` = WIB, `480` = WITA, `540` = WIT |
| `METRICS_TOKENS` | (opsional) token endpoint metrics read-only, format `nama:token` pisah koma. Lihat [docs/METRICS.md](docs/METRICS.md) |

Tips mengisi `GOOGLE_SERVICE_ACCOUNT_JSON`:
- Buka file `.json` dengan teks editor, **copy semua isinya** (termasuk tanda `{ }`),
  lalu tempel sebagai value. Vercel menyimpan apa adanya — newline pada `private_key`
  (`\n`) sudah ditangani otomatis oleh kode.
- Pastikan dipasang untuk environment **Production** (dan Preview bila perlu).

Lihat `.env.example` untuk contoh formatnya.

> ⚠️ **Paling sering bikin gagal:** `GOOGLE_SERVICE_ACCOUNT_JSON` harus **satu baris penuh** (tanpa Enter di tengah). Kalau ter-paste dengan baris baru, deploy akan error `JSON tidak valid`. Setelah memperbaiki env, selalu **Redeploy**.

## 6. Deploy & inisialisasi

1. Klik **Deploy**. Tunggu sampai selesai, lalu buka **URL** yang diberikan Vercel.
2. Cek koneksi sehat: buka `https://<domain-anda>.vercel.app/api/rpc` di browser — harus muncul `{"ok":true,...}`.
3. **Inisialisasi sheet** (membuat `Main`, `OPTIONS`, `COMMENTS`, `ACTIVITY` + header + dropdown bila belum ada). Pilih salah satu:
   - **Cara mudah (disarankan):** buka aplikasi → menu **Settings** → klik tombol **Jalankan Setup** → tunggu notifikasi *"Setup selesai"*.
   - **Cara manual (alternatif):** jalankan via konsol browser (tab Console di DevTools) pada halaman aplikasi:
     ```js
     fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({action:'setupTaskTracker',args:[]})}).then(r=>r.json()).then(console.log)
     ```
   Jika spreadsheet sudah berisi struktur dari versi Apps Script, langkah ini opsional (tetap aman dijalankan).

Selesai. Aplikasi kini berjalan di Vercel, namun **semua input tetap masuk ke Spreadsheet yang sama**.

---

## Menjalankan / mengetes secara lokal (opsional)

```bash
npm install
npm test                 # tes fungsi murni (format tanggal, ID, mapping baris) — tanpa koneksi

npm i -g vercel          # sekali saja
vercel dev               # jalankan lokal; isi dulu .env.local sesuai .env.example
```

`vercel dev` akan menyajikan `public/index.html` di `/` dan menjalankan `api/rpc.js` di `/api/rpc`.

---

## Endpoint metrics (read-only, untuk sistem luar)

Selain `api/rpc.js` yang dipakai web app, ada `api/metrics.js` — pintu **baca-saja**
untuk sistem lain (mis. sistem OKR manager) yang butuh angka tanpa boleh menulis
apa pun dan tanpa menyentuh data pribadi tim.

Panduan lengkap: **[docs/METRICS.md](docs/METRICS.md)**

## Cara kerja singkat (untuk developer)

- Frontend memakai pola yang sama seperti dulu: `GAS.withSuccessHandler(...).withFailureHandler(...).namaFungsi(args)`.
  Bedanya, `GAS` kini sebuah *runner* kecil yang mem-`fetch` ke `/api/rpc` dengan body
  `{action:'namaFungsi', args:[...]}`. Bila kebetulan dibuka di dalam Apps Script, ia otomatis
  memakai `google.script.run` asli (jadi file ini tetap kompatibel dua arah).
- `api/rpc.js` memetakan `action` → fungsi di `api/_sheets.js` dengan tanda tangan argumen identik
  dengan versi `Code.gs`.
- `api/_sheets.js` adalah port langsung dari `Code.gs`: `getBootstrapData`, `getTasks`, `saveTask`,
  `deleteTask`, `quickUpdateField`, `quickUpdateDates`, `getComments`, `addComment`, `saveOption`,
  `deleteOption`, `getActivityLog`, plus `setupTaskTracker`.

### Pemetaan kolom sheet `Main` (header baris 3, data baris 4)
`B` Task ID · `C` Created Date · `D` Due Date · `E` Status · `F` Priority ·
`G` Task Name · `H` Stage · `I` Platform · `J` PIC · `K` Support · `L` Document ·
`M` PIC Notes · `N` PM Notes

> Versi ini disesuaikan ke sheet **13 kolom** (tanpa Start Date, Approval Gate, Last Update). Kolom `A` dibiarkan kosong; data mulai di `B4`. Nama tab harus **Main** (atau set env `MAIN_SHEET_NAME`).

## Troubleshooting (kalau error)

Sebelum menyimpulkan gagal, cek **Checklist cepat** ini dulu:

- [ ] **Google Sheets API** sudah *Enable* di project Google Cloud yang benar.
- [ ] Spreadsheet sudah **di-share** ke email service account sebagai **Editor**.
- [ ] `SPREADSHEET_ID` benar (hanya bagian ID dari URL, bukan seluruh link).
- [ ] `GOOGLE_SERVICE_ACCOUNT_JSON` = **seluruh** isi JSON dalam **satu baris**, dipasang di environment **Production**.
- [ ] Sudah **Redeploy** setelah mengisi/mengubah Environment Variables.
- [ ] Sudah klik **Jalankan Setup** sekali (Settings → Jalankan Setup).

| Pesan / gejala | Penyebab umum | Solusi |
|---|---|---|
| `403` / *The caller does not have permission* | Sheet belum di-share ke robot, atau Sheets API belum aktif | Share spreadsheet ke **email service account** sebagai **Editor**; pastikan **Google Sheets API** *Enable*. |
| `GOOGLE_SERVICE_ACCOUNT_JSON bukan JSON yang valid` | Isi env terpotong / ada baris baru / kurang `{` `}` | Copy **seluruh** isi `.json` sebagai **satu baris**, tempel ulang, lalu **Redeploy**. |
| `Env SPREADSHEET_ID belum diset` / `...JSON belum diset` | Variable belum dibuat, salah nama, atau bukan di Production | Cek **Settings → Environment Variables**: nama persis, dicentang **Production**, lalu **Redeploy**. |
| `Unable to parse range` / sheet tidak ditemukan | Sheet/header belum ada | Jalankan **Setup** (Settings → Jalankan Setup), lalu refresh halaman. |
| Halaman terbuka tapi task kosong / dropdown default | Backend belum konek atau sheet `Main` kosong | Cek health `/api/rpc` (`{"ok":true}`), jalankan Setup, pastikan data ada di `Main` mulai **baris 4**. |
| Sudah ubah env tapi tidak berubah | Env hanya berlaku untuk deploy baru | Selalu **Redeploy** dari tab **Deployments** setelah mengubah env. |

## Catatan & batasan

- **Tidak ada LockService seperti di Apps Script.** Untuk tim kecil, tabrakan tulis sangat jarang.
  Bila nanti perlu, bisa ditambahkan kunci via store eksternal (mis. Upstash Redis).
- **Keamanan:** sama seperti versi lama, "Mode User" bersifat di sisi klien. Bila perlu autentikasi
  ketat per-orang, tambahkan login (mis. Google OAuth / Vercel Password Protection) di depan aplikasi.
- **Tanggal:** ditulis sebagai `yyyy-mm-dd` (USER_ENTERED) agar dikenali Google Sheets sebagai
  tanggal. `Last Update` ditulis `yyyy-mm-dd HH:mm:ss` mengikuti `TIMEZONE_OFFSET_MINUTES`.
- **Jangan pernah commit** file JSON service account atau `.env` ke repository publik.
