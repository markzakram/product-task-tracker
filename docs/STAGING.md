# Staging — "app bayangan" sebelum menyentuh produksi

Tujuannya satu: **menguji perubahan dengan aplikasi sungguhan, di atas data mainan.**
URL produksi (`product-task-tracker.vercel.app`) dan spreadsheet aslinya tidak ikut terpengaruh.

Ini bukan fitur baru yang harus dibangun. Kedua backend sudah membaca tujuan
spreadsheet dari konfigurasi, bukan dari kode:

| Backend | Sumber tujuan sheet |
|---|---|
| Vercel | env var `SPREADSHEET_ID` — `api/_sheets.js`, `getSpreadsheetId()` |
| Apps Script | Script Property `SPREADSHEET_ID` — `gas/Code.gs`, `ss_()` |

Jadi staging = **menyalin sheet + mengarahkan satu variabel**.

---

## Tiga lapis pengujian

Pakai yang paling murah dulu; naik ke lapis berikutnya hanya kalau perlu.

| Lapis | Perintah / tempat | Waktu | Menyentuh data? |
|---|---|---|---|
| 1. Tes otomatis | `npm test` | detik | tidak — Google Sheets ditiru |
| 2. Jalan lokal | `npm run dev` | detik | ya, sheet **staging** |
| 3. App bayangan | URL Preview Vercel | ~1 menit | ya, sheet **staging** |

Lapis 3 yang bisa dibagikan ke tim untuk mencoba sendiri.

---

## ⚠ Bahaya yang harus dibereskan lebih dulu

Secara bawaan, environment **Preview** di Vercel memakai env var yang sama dengan
**Production**. Kalau `SPREADSHEET_ID` dibiarkan begitu, app bayangan akan
**menulis ke spreadsheet asli**.

Itu lebih berbahaya daripada tidak punya staging sama sekali — karena yang paling
perlu diuji justru hal-hal merusak: hapus user, hapus proses kolaborasi, hapus task.

**Kerjakan Langkah 1–3 di bawah sampai selesai sebelum push branch pertama.**

---

## Langkah 1 — Salin spreadsheet

1. Buka spreadsheet produksi.
2. **File → Make a copy**.
3. Beri nama yang tak mungkin tertukar, mis. `TaskTracker STAGING — JANGAN DIPAKAI PRODUKSI`.
4. Salin **ID**-nya dari URL:
   `https://docs.google.com/spreadsheets/d/`**`<INI_ID_NYA>`**`/edit`

> Salinan ini akan melenceng dari produksi seiring waktu. Itu wajar — salin ulang
> menjelang pengujian besar, jangan dirawat terus-menerus.

## Langkah 2 — Share ke service account

Sheet salinan **tidak** mewarisi izin service account.

1. Di sheet staging, klik **Share**.
2. Tambahkan email service account sebagai **Editor**:
   ```
   task-tracker@data-intelligence-500306.iam.gserviceaccount.com
   ```
3. Matikan notifikasi email, lalu **Share**.

Kalau langkah ini terlewat, gejalanya: app bayangan terbuka tapi semua data kosong,
atau error `The caller does not have permission`.

## Langkah 3 — Env var khusus Preview di Vercel

**Vercel → Project → Settings → Environment Variables.**

Untuk tiap baris di bawah, buat entri **baru** dan centang **Preview saja**
(jangan sentuh entri Production yang sudah ada):

| Variable | Nilai untuk Preview | Kenapa |
|---|---|---|
| `SPREADSHEET_ID` | ID sheet staging (Langkah 1) | **wajib** — ini inti pemisahannya |
| `ACCESS_PIN` | PIN berbeda dari produksi | URL preview bisa dibuka siapa saja yang tahu alamatnya |
| `MAGANG_PIN` | PIN berbeda | idem |
| `DEV_PIN` | PIN berbeda | mode Dev bisa mengubah peran user |
| `METRICS_TOKENS` | *(kosongkan)* | supaya sistem OKR tidak menarik angka dari data mainan |
| `OKR_SHEET_ID` | *(kosongkan)* | idem, untuk MCP |

`GOOGLE_SERVICE_ACCOUNT_JSON` **tidak perlu** dibuat ulang — kredensial yang sama
dipakai untuk kedua sheet, asalkan Langkah 2 sudah dikerjakan.

### Memastikan sudah benar

Setelah preview pertama jadi, buka URL-nya lalu cek: **judul task-nya harus data
salinan, bukan data hari ini.** Kalau yang muncul data produksi, `SPREADSHEET_ID`
untuk Preview belum aktif — periksa lagi centang environment-nya, lalu **Redeploy**
(env var hanya berlaku untuk deploy baru).

---

## Langkah 4 — Alur kerja per perubahan

```bash
git checkout -b fitur/nama-perubahan
# ... kerjakan ...
npm test                       # lapis 1
cp public/index.html gas/Index.html   # WAJIB kalau index.html disentuh
npm test                       # ulangi setelah sinkron
git add -A && git commit -m "..."
git push -u origin fitur/nama-perubahan
```

Vercel otomatis membangun URL preview:
`product-task-tracker-git-fitur-nama-perubahan-<akun>.vercel.app`

Uji di sana. Kalau sudah beres:

```bash
git checkout master
git merge fitur/nama-perubahan
git push
```

Produksi ikut terbarui. Branch-nya boleh dihapus:

```bash
git branch -d fitur/nama-perubahan && git push origin --delete fitur/nama-perubahan
```

> App bayangan hanya berguna kalau pekerjaan mampir di branch dulu. Commit langsung
> ke `master` melewati seluruh mekanisme ini.

---

## Menjalankan di komputer sendiri (lapis 2)

Loop tercepat — tanpa deploy sama sekali.

1. Buat file `.env.local` di akar proyek (sudah masuk `.gitignore`, aman):

   ```
   SPREADSHEET_ID=<ID_SHEET_STAGING>
   GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account", ... }
   ACCESS_PIN=111111
   DEV_PIN=1111
   TIMEZONE_OFFSET_MINUTES=420
   ```

2. Jalankan:

   ```bash
   npm run dev
   ```

**Pastikan `SPREADSHEET_ID` di sini menunjuk sheet staging.** Ini satu-satunya
tempat yang tidak dijaga Vercel — salah isi berarti mengedit produksi dari laptop.

---

## Sisi Apps Script

`gas/Code.gs` membaca Script Property `SPREADSHEET_ID`, dan baru jatuh ke
spreadsheet terikat kalau properti itu kosong. Dua pilihan:

**A. Proyek Apps Script kedua (terpisah penuh)**
Buat proyek baru, tempel `Code.gs` + `Index.html`, lalu
**Project Settings → Script Properties → `SPREADSHEET_ID`** = ID sheet staging.

**B. Test deployment (lebih ringan)**
Di editor Apps Script: **Deploy → Test deployments**. Ini menjalankan kode HEAD
tanpa mengubah deployment yang sedang dipakai orang — tapi tetap menunjuk sheet
yang sama, jadi hanya aman untuk perubahan yang tidak menulis data.

---

## Gerbang otomatis

`.github/workflows/ci.yml` berjalan di tiap push dan pull request. Dua hal yang
dijaganya:

1. `npm test` — seluruh assertion harus lulus.
2. **`public/index.html` harus identik dengan `gas/Index.html`.**

Poin kedua menutup satu-satunya langkah manual yang paling sering terlewat:
`gas/Index.html` adalah salinan tangan, dan kalau lupa disinkronkan, tes bisa
melaporkan hijau padahal membaca berkas basi. Kalau CI gagal di sini,
perbaikannya satu baris:

```bash
cp public/index.html gas/Index.html
```

---

## Ringkasan checklist

- [ ] Spreadsheet disalin, namanya jelas-jelas staging
- [ ] Sheet staging di-share ke service account sebagai **Editor**
- [ ] `SPREADSHEET_ID` dibuat untuk **Preview saja** = ID staging
- [ ] PIN (`ACCESS_PIN`, `MAGANG_PIN`, `DEV_PIN`) dibedakan untuk Preview
- [ ] `METRICS_TOKENS` & `OKR_SHEET_ID` dikosongkan untuk Preview
- [ ] Push branch percobaan, buka URL preview, **pastikan datanya salinan**
- [ ] Baru setelah itu: kerjakan perubahan sungguhan lewat branch
