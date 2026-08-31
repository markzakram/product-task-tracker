# scripts/

Perkakas sekali-jalan yang **bukan** bagian dari aplikasi. Tidak pernah dipanggil saat
aplikasi berjalan; dijalankan manual dari terminal.

| Berkas | Guna |
|---|---|
| `urai-master.js` | Mengurai sel Area Produk sheet Master jadi daftar target. Diuji di `test/impor.test.js`. |
| `impor-rancangan-produksi.js` | Membuat paket + targetnya di spreadsheet tujuan dari sheet Master. |

---

## Impor rancangan paket

Mengambil **baris 60–62** sheet *Master Koordinasi Paket* (PCPM, ASN, Sekdin) dan
membuatnya sebagai paket di spreadsheet tujuan. **Tidak** membuat task kolaborasi apa pun —
papan Kolaborasi tidak tersentuh.

### Sebelum menjalankan

1. Aplikasi di lingkungan tujuan sudah versi ≥ 1.83 (punya menu **Rancangan Paket**).
2. **Buka menu Rancangan Paket sekali** di sana, supaya keempat sheet paket dibuat aplikasi
   dengan header yang benar. Skrip ini sengaja tidak membuat sheet sendiri — header dan
   status tersembunyinya harus selalu berasal dari satu tempat. Kalau belum ada, skrip
   berhenti dan memberi tahu.
3. Service account punya akses **Editor** ke spreadsheet tujuan, dan akses **baca** ke sheet
   Master. Kredensialnya dari env `GOOGLE_SERVICE_ACCOUNT_JSON`, atau `credentials.json` di
   akar repo (berkas itu tidak ikut git).

### Jalankan

Uji coba dulu — **tidak menulis apa pun**, hanya menampilkan apa yang akan dibuat:

```bash
TUJUAN_ID=<id-spreadsheet-tujuan> node scripts/impor-rancangan-produksi.js
```

Kalau angkanya sudah cocok, ulangi dengan `--apply`:

```bash
TUJUAN_ID=<id-spreadsheet-tujuan> node scripts/impor-rancangan-produksi.js --apply
```

`AKTOR` bisa diisi kalau pembuatnya ingin dicatat atas nama lain (bawaan: `Nynda (PM)`).

### Yang diharapkan keluar

Di spreadsheet yang belum punya paket sama sekali:

```
+ PKG-001 | JadiPCPM    | PCPM BI 41                 | 19 target
+ PKG-002 | JadiASN     | Road to CPNS 2026          | 38 target
+ PKG-003 | JadiSEKDIN  | Menuju Sekolah Kedinasan   | 25 target
```

### Aman dijalankan berulang

- Paket yang **namanya sudah ada** di tujuan dilewati, bukan ditimpa dan bukan digandakan.
- Nomor `PKG-` dan `ITM-` selalu lanjut dari yang tertinggi di tujuan.
- Kolom **Mirror** dibiarkan kosong: paket hasil impor tidak otomatis tampil ke Lintas Divisi.
- Uji coba adalah bawaannya; menulis hanya kalau diberi `--apply`.

### Kenapa kolomnya dipilih manual

Isi Area Produk tidak seragam. Latsol dan Tryout memang daftar deliverable, tapi Drilling
berisi penjelasan fitur, Materi berisi kisi-kisi, dan Live Class berisi jadwal mingguan.
Menebaknya pernah menghasilkan **62 target sampah** — tiap kalimat penjelasan jadi satu
"target 1 Paket". Karena itu kolom mana yang jadi target ditulis eksplisit di konstanta
`PETA`. Kolom yang tidak jadi target **tidak dibuang**: isinya masuk ke kolom teks bebas
paket itu, jadi tetap terbaca orang.

Kalau sheet Master berubah bentuk atau barisnya bergeser, sesuaikan `PETA` dan
`BARIS_AWAL`/`BARIS_AKHIR`, lalu jalankan uji cobanya lebih dulu.
