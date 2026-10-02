-- =============================================================================
--  produk_base — skema MySQL 8.0 untuk ProductTrack v1
--
--  Pemindahan apa adanya dari 18 tab spreadsheet. Bentuk datanya TIDAK diubah:
--  satu tab = satu tabel, kolom sama, urutan sama. Perubahan model data menunggu
--  v3; mencampur keduanya berarti kalau ada yang salah kita tak tahu penyebabnya
--  tempat penyimpanannya atau bentuk datanya.
--
--  Yang berubah hanyalah hal-hal yang di spreadsheet memang mustahil:
--
--  1. KUNCI ASING. Di Sheets, menghapus sebuah paket berarti menyapu lima tab
--     satu per satu lewat purgeRowsForRef(). Di sini ON DELETE CASCADE yang
--     mengerjakannya, dalam satu transaksi, tanpa bisa setengah jalan.
--
--  2. KUNCI UNIK. Bug 1.120.0 — dua simpan bersamaan menggandakan seluruh isi
--     rancangan paket — menjadi MUSTAHIL di sini, bukan sekadar dicegah di UI.
--     Sisipan kedua ditolak database. Kuncinya di aplikasi tetap berguna supaya
--     orang tak melihat error, tapi bukan lagi satu-satunya penjaga.
--
--  3. TIPE TANGGAL. Kolom Done At pernah rusak massal di Sheets (145 nilai
--     kehilangan titik desimalnya karena diperlakukan sebagai angka). DATETIME
--     tidak bisa mengalami itu.
--
--  4. ID BARIS SUNGGUHAN. LINKS, NOTES, DASHBOARDS, CHECKLIST, COMMENTS, dan
--     ACTIVITY di v1 dialamatkan lewat NOMOR BARIS spreadsheet. Nomor baris
--     bergeser setiap kali ada yang dihapus. Di sini mereka punya id sendiri
--     yang tak pernah berubah — ini menuntut penyesuaian di sisi aplikasi,
--     lihat catatan di akhir berkas.
--
--  NAMA SKEMA. Berkas ini memakai `produk_base`, karena itulah yang hibah IT Anda
--  benar-benar izinkan hari ini:
--
--      GRANT ALL PRIVILEGES ON `produk_base`.* TO `produk_db`@`%`
--      GRANT USAGE ON *.*            <- tak ada CREATE global
--
--  CREATE DATABASE untuk nama LAIN akan ditolak dengan error 1044. Saya pernah
--  menyarankan `ops_produk` supaya sekali lihat jelas ini perkakas internal dan
--  bukan database platform seperti tetangganya yang berakhiran _base. Saran itu
--  masih berlaku, tapi menuntut IT membuat skema baru. Kalau itu yang dipilih,
--  yang perlu diubah hanya DUA baris di bawah ini.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS produk_base
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
USE produk_base;

/* Kalau produk_base SUDAH dibuat IT lebih dulu, CREATE di atas tidak berbuat apa-apa
   — termasuk tidak memperbaiki charset-nya. Kalau skema itu lahir sebagai latin1,
   seluruh teks Indonesia dan emoji akan rusak tanpa satu pun pesan error. Jadi
   dipaksa di sini; aman dijalankan berulang. */
ALTER DATABASE produk_base
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

/* Periksa dulu sebelum lanjut — kalau dua baris ini tidak utf8mb4, berhenti di sini. */
SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
  FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = 'produk_base';

SET FOREIGN_KEY_CHECKS = 0;


-- =============================================================================
--  ORANG & PILIHAN
-- =============================================================================

-- Tab USERS (A:C). Nama dipakai sebagai kunci karena seluruh data lain menunjuk
-- orang lewat NAMANYA, bukan id — itu kenyataan v1 dan tidak diubah di sini.
/* Catatan collation: utf8mb4_0900_ai_ci itu buta huruf besar-kecil, jadi 'Ali' dan 'ali'
   dianggap SATU orang — kunci utama akan menolak yang kedua. Itu memang yang kita mau
   (v1 pun mencocokkan nama secara longgar), tapi kalau di sheet ada dua ejaan untuk orang
   yang sama, salah satunya akan tertolak saat migrasi. Itu temuan, bukan kegagalan. */
CREATE TABLE IF NOT EXISTS users (
  nama        VARCHAR(100) NOT NULL,
  peran       VARCHAR(40)  NOT NULL DEFAULT 'Staff',
  aktif       BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (nama)
) ENGINE=InnoDB;

-- Tab AUTH (A:B). PIN per user, disimpan sebagai hash.
CREATE TABLE IF NOT EXISTS auth_pins (
  user_nama   VARCHAR(100) NOT NULL,
  pin_hash    VARCHAR(128) NOT NULL,
  PRIMARY KEY (user_nama)
) ENGINE=InnoDB;

-- Tab OPTIONS (A:E). Isi dropdown: status, platform, stage, kesulitan, dsb.
-- `urutan` yang menentukan tampilannya — fitur seret-untuk-mengurutkan menulis
-- ke kolom ini.
CREATE TABLE IF NOT EXISTS options (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipe        VARCHAR(40)  NOT NULL,
  nilai       VARCHAR(190) NOT NULL,
  aktif       BOOLEAN      NOT NULL DEFAULT TRUE,
  induk       VARCHAR(190) NULL,
  urutan      INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  /* Satu nilai tak boleh muncul dua kali dalam satu tipe. Di Sheets ini hanya
     konvensi; di sini ditegakkan. */
  UNIQUE KEY uq_options_tipe_nilai (tipe, nilai),
  KEY ix_options_tipe_urutan (tipe, urutan)
) ENGINE=InnoDB;


-- =============================================================================
--  TASK
-- =============================================================================

-- Tab Main (B:W, 22 kolom). Kolom A di spreadsheet memang tak terpakai dan
-- tidak ikut dipindah.
CREATE TABLE IF NOT EXISTS tasks (
  task_id         VARCHAR(20)  NOT NULL,          -- TSK-019
  created_date    DATE         NULL,
  due_date        DATE         NULL,
  status          VARCHAR(40)  NOT NULL DEFAULT '',
  kesulitan       VARCHAR(40)  NOT NULL DEFAULT '',
  task_name       TEXT         NOT NULL,
  stage           VARCHAR(80)  NOT NULL DEFAULT '',
  platform        VARCHAR(80)  NOT NULL DEFAULT '',
  pic             VARCHAR(100) NOT NULL DEFAULT '',
  support         VARCHAR(255) NOT NULL DEFAULT '',   -- beberapa nama dipisah koma
  document        TEXT         NULL,
  pic_notes       TEXT         NULL,
  pm_notes        TEXT         NULL,
  divisi_tujuan   VARCHAR(100) NOT NULL DEFAULT '',
  kontak_divisi   VARCHAR(190) NOT NULL DEFAULT '',
  kata_kerja      VARCHAR(80)  NOT NULL DEFAULT '',
  jumlah          VARCHAR(40)  NOT NULL DEFAULT '',   -- teks: ada "5", ada "5-10"
  objek           VARCHAR(255) NOT NULL DEFAULT '',
  detail          TEXT         NULL,
  dibuat_oleh     VARCHAR(100) NOT NULL DEFAULT '',
  lintas_view     BOOLEAN      NOT NULL DEFAULT FALSE,  -- mirror ke Lintas Divisi
  /* "Nynda (PM) • 2026-08-11 10:00". Dibiarkan satu teks supaya migrasinya
     setia; memecahnya jadi dua kolom boleh menyusul kalau memang dibutuhkan. */
  status_by       VARCHAR(190) NOT NULL DEFAULT '',
  PRIMARY KEY (task_id),
  /* Empat kolom inilah yang disaring hampir di setiap layar. */
  KEY ix_tasks_pic (pic),
  KEY ix_tasks_status (status),
  KEY ix_tasks_platform (platform),
  KEY ix_tasks_due (due_date),
  KEY ix_tasks_mirror (lintas_view)
) ENGINE=InnoDB;

-- Tab CHECKLIST (A:G). Sub-ceklis di dalam task.
-- task_id juga menampung id semu proses kolaborasi ("COL-026#3"), jadi TIDAK
-- bisa diberi kunci asing ke tasks — itu disengaja, bukan kelalaian.
CREATE TABLE IF NOT EXISTS checklists (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id     VARCHAR(40)  NOT NULL,
  item        TEXT         NOT NULL,
  done        BOOLEAN      NOT NULL DEFAULT FALSE,
  /* 150, bukan 100: di data sungguhan ada baris yang kolom ini terisi teks item
     sepanjang 103 karakter. Jelas salah isi, tapi melebarkan kolom tak merugikan
     siapa pun sedangkan memotongnya menghilangkan tulisan orang. */
  created_by  VARCHAR(150) NOT NULL DEFAULT '',
  checked_by  VARCHAR(150) NOT NULL DEFAULT '',
  checked_at  DATETIME     NULL,
  link        TEXT         NULL,
  PRIMARY KEY (id),
  KEY ix_checklists_task (task_id)
) ENGINE=InnoDB;

-- Tab COMMENTS (A:D).
CREATE TABLE IF NOT EXISTS comments (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dibuat_at   DATETIME     NOT NULL,
  /* VARCHAR(40), bukan 20 seperti tasks.task_id, dan tanpa kunci asing: kolom ini juga
     menampung id collab ("COL-026") dan id semu prosesnya ("COL-026#3"). Disengaja. */
  task_id     VARCHAR(40)  NOT NULL,
  author      VARCHAR(100) NOT NULL,
  message     TEXT         NOT NULL,
  PRIMARY KEY (id),
  KEY ix_comments_task (task_id, dibuat_at)
) ENGINE=InnoDB;

-- Tab ACTIVITY (A:G). Jejak audit; hanya ditambah, tak pernah disunting.
CREATE TABLE IF NOT EXISTS activity_log (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  terjadi_at    DATETIME     NOT NULL,
  user_nama     VARCHAR(100) NOT NULL DEFAULT '',
  action        VARCHAR(60)  NOT NULL DEFAULT '',
  /* VARCHAR(40), bukan 20 seperti tasks.task_id, dan tanpa kunci asing: kolom ini juga
     menampung id collab ("COL-026") dan id semu prosesnya ("COL-026#3"). Disengaja. */
  task_id       VARCHAR(40)  NOT NULL DEFAULT '',
  detail        TEXT         NULL,
  status_lama   VARCHAR(40)  NOT NULL DEFAULT '',
  status_baru   VARCHAR(40)  NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  /* Dibaca terbaru-dulu dan dibatasi 200 baris di bootstrap. */
  KEY ix_activity_waktu (terjadi_at DESC),
  KEY ix_activity_task (task_id)
) ENGINE=InnoDB;

-- Tab NOTIFICATIONS (A:H).
CREATE TABLE IF NOT EXISTS notifications (
  id          VARCHAR(40)  NOT NULL,
  for_user    VARCHAR(100) NOT NULL,
  tipe        VARCHAR(40)  NOT NULL DEFAULT '',
  ref_id      VARCHAR(40)  NOT NULL DEFAULT '',
  dari        VARCHAR(100) NOT NULL DEFAULT '',
  teks        TEXT         NOT NULL,
  dibuat_at   DATETIME     NOT NULL,
  dibaca      BOOLEAN      NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  /* Kueri terbanyak: "notifikasi saya yang belum dibaca". */
  KEY ix_notif_user_baca (for_user, dibaca, dibuat_at DESC)
) ENGINE=InnoDB;


-- =============================================================================
--  TASK KOLABORASI (proses beruntun)
-- =============================================================================

-- Tab COLLAB (A:K).
CREATE TABLE IF NOT EXISTS collabs (
  collab_id   VARCHAR(20)  NOT NULL,          -- COL-026
  platform    VARCHAR(190) NOT NULL DEFAULT '',  -- bisa beberapa, dipisah koma
  title       TEXT         NOT NULL,
  description TEXT         NULL,
  created_by  VARCHAR(100) NOT NULL DEFAULT '',
  created_at  DATETIME     NULL,
  deadline    DATE         NULL,
  tipe        VARCHAR(80)  NOT NULL DEFAULT '',
  color       VARCHAR(20)  NOT NULL DEFAULT '',
  paket_id    VARCHAR(20)  NULL,              -- tautan ke rancangan paket
  mirror      BOOLEAN      NOT NULL DEFAULT FALSE,
  PRIMARY KEY (collab_id),
  /* Proses kolaborasi adalah pekerjaan yang berdiri sendiri; ia hanya MENUNJUK paket.
     Jadi SET NULL, bukan CASCADE: paket dihapus berarti tautannya lepas, bukan
     prosesnya ikut lenyap. */
  CONSTRAINT fk_collabs_paket FOREIGN KEY (paket_id)
    REFERENCES packages (paket_id) ON DELETE SET NULL ON UPDATE CASCADE,
  KEY ix_collabs_paket (paket_id),
  KEY ix_collabs_mirror (mirror)
) ENGINE=InnoDB;

-- Tab COLLAB_STEPS (A:K). Inilah proses beruntunnya — urutan yang menentukan
-- giliran siapa. Satu-satunya tabel di v1 yang urutannya BERMAKNA, bukan sekadar
-- tampilan.
CREATE TABLE IF NOT EXISTS collab_steps (
  collab_id   VARCHAR(20)  NOT NULL,
  urutan      SMALLINT UNSIGNED NOT NULL,
  step        TEXT         NOT NULL,
  pic         VARCHAR(100) NOT NULL DEFAULT '',
  deadline    DATE         NULL,
  done        BOOLEAN      NOT NULL DEFAULT FALSE,
  done_by     VARCHAR(100) NOT NULL DEFAULT '',
  /* Kolom yang di Sheets pernah rusak massal: 145 nilai kehilangan titik
     desimalnya karena diperlakukan sebagai angka. DATETIME tak bisa begitu. */
  done_at     DATETIME     NULL,
  note        TEXT         NULL,
  stage       VARCHAR(80)  NOT NULL DEFAULT '',
  link        TEXT         NULL,
  PRIMARY KEY (collab_id, urutan),
  CONSTRAINT fk_steps_collab FOREIGN KEY (collab_id)
    REFERENCES collabs (collab_id) ON DELETE CASCADE ON UPDATE CASCADE,
  KEY ix_steps_pic_done (pic, done)
) ENGINE=InnoDB;


-- =============================================================================
--  RANCANGAN PAKET
-- =============================================================================

-- Tab PACKAGES (A:T).
CREATE TABLE IF NOT EXISTS packages (
  paket_id     VARCHAR(20)  NOT NULL,         -- PKG-041
  platform     VARCHAR(190) NOT NULL DEFAULT '',
  marsel_pic   VARCHAR(100) NOT NULL DEFAULT '',
  program      VARCHAR(255) NOT NULL DEFAULT '',
  nama_paket   VARCHAR(255) NOT NULL DEFAULT '',
  tagline      TEXT         NULL,
  benefit      TEXT         NULL,
  tanggal      VARCHAR(100) NOT NULL DEFAULT '',  -- teks bebas di v1, bukan tanggal
  tujuan       TEXT         NULL,
  produk_pic   VARCHAR(100) NOT NULL DEFAULT '',
  dibimbing    TEXT         NULL,
  latsol       TEXT         NULL,
  materi       TEXT         NULL,
  tryout       TEXT         NULL,
  drilling     TEXT         NULL,
  live_class   TEXT         NULL,
  catatan      TEXT         NULL,
  updated_by   VARCHAR(100) NOT NULL DEFAULT '',
  updated_at   DATETIME     NULL,
  mirror       BOOLEAN      NOT NULL DEFAULT FALSE,
  PRIMARY KEY (paket_id),
  KEY ix_packages_platform (platform),
  KEY ix_packages_mirror (mirror)
) ENGINE=InnoDB;

-- Tab PACKAGE_ITEMS (A:J). Target per paket.
CREATE TABLE IF NOT EXISTS package_items (
  item_id     VARCHAR(20)  NOT NULL,          -- ITM-0662
  paket_id    VARCHAR(20)  NOT NULL,
  urutan      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  kategori    VARCHAR(80)  NOT NULL DEFAULT '',
  grup        VARCHAR(190) NOT NULL DEFAULT '',
  nama        VARCHAR(255) NOT NULL,
  target      INT          NOT NULL DEFAULT 0,
  satuan      VARCHAR(40)  NOT NULL DEFAULT 'Paket',
  awal        INT          NOT NULL DEFAULT 0,
  catatan     TEXT         NULL,
  PRIMARY KEY (item_id),
  /* INI yang membuat bug duplikasi 1.120.0 mustahil terulang. Dua simpan
     bersamaan mengirim item_id yang SAMA (terbukti waktu diuji: dua baris
     "Verbal" keduanya ITM-0662); sisipan kedua kini ditolak database, bukan
     sekadar dicegah tombol yang dikunci. */
  CONSTRAINT fk_items_paket FOREIGN KEY (paket_id)
    REFERENCES packages (paket_id) ON DELETE CASCADE ON UPDATE CASCADE,
  KEY ix_items_paket_urutan (paket_id, urutan)
) ENGINE=InnoDB;

-- Tab PACKAGE_CONTRIB (A:F). Setoran: proses kolaborasi mana menyumbang berapa
-- ke target mana.
CREATE TABLE IF NOT EXISTS package_contribs (
  paket_id    VARCHAR(20)  NOT NULL,
  item_id     VARCHAR(20)  NOT NULL,
  collab_id   VARCHAR(20)  NOT NULL,
  step_order  SMALLINT UNSIGNED NOT NULL,
  jumlah      INT          NOT NULL DEFAULT 0,
  catatan     TEXT         NULL,
  /* Satu target + satu proses = satu setoran. v1 memeriksa ini di klien dan
     menolak dengan pesan "punya dua setoran untuk proses yang sama"; di sini
     aturannya ikut ditegakkan database. */
  PRIMARY KEY (item_id, collab_id, step_order),
  CONSTRAINT fk_contrib_item FOREIGN KEY (item_id)
    REFERENCES package_items (item_id) ON DELETE CASCADE ON UPDATE CASCADE,
  /* Kunci utamanya (item_id, collab_id, step_order) tak bisa melayani FK ini karena
     (collab_id, step_order) bukan awalannya. MySQL akan membuat indeksnya sendiri;
     ditulis eksplisit supaya kelihatan oleh yang membaca skema ini nanti. */
  KEY ix_contrib_step (collab_id, step_order),
  CONSTRAINT fk_contrib_step FOREIGN KEY (collab_id, step_order)
    REFERENCES collab_steps (collab_id, urutan) ON DELETE CASCADE ON UPDATE CASCADE,
  /* paket_id sebenarnya bisa diturunkan dari item_id. Dibawa apa adanya karena ada di
     sheet-nya, dan diberi FK supaya setidaknya tak bisa menunjuk paket yang tak ada.
     Yang TIDAK bisa dijaga FK: paket_id di sini berbeda dari paket_id item-nya.
     Periksa itu saat migrasi, sekali, lalu lupakan. */
  CONSTRAINT fk_contrib_paket FOREIGN KEY (paket_id)
    REFERENCES packages (paket_id) ON DELETE CASCADE ON UPDATE CASCADE,
  KEY ix_contrib_paket (paket_id)
) ENGINE=InnoDB;

-- Tab PACKAGE_LINKS (A:D).
CREATE TABLE IF NOT EXISTS package_links (
  paket_id    VARCHAR(20)  NOT NULL,
  urutan      SMALLINT UNSIGNED NOT NULL,
  label       VARCHAR(190) NOT NULL DEFAULT '',
  url         TEXT         NOT NULL,
  PRIMARY KEY (paket_id, urutan),
  CONSTRAINT fk_pkglinks_paket FOREIGN KEY (paket_id)
    REFERENCES packages (paket_id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Tab PACKAGE_VARIANTS (A:F). Masa aktif & harga — milik tim Marsel, tak lagi
-- disunting dari aplikasi ini, tapi datanya tetap dibawa.
CREATE TABLE IF NOT EXISTS package_variants (
  paket_id      VARCHAR(20)  NOT NULL,
  urutan        SMALLINT UNSIGNED NOT NULL,
  masa_aktif    VARCHAR(100) NOT NULL DEFAULT '',
  harga_awal    INT          NOT NULL DEFAULT 0,
  harga_diskon  INT          NOT NULL DEFAULT 0,
  status        VARCHAR(40)  NOT NULL DEFAULT 'aktif',
  PRIMARY KEY (paket_id, urutan),
  CONSTRAINT fk_variants_paket FOREIGN KEY (paket_id)
    REFERENCES packages (paket_id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;


-- =============================================================================
--  RUANG SAYA & LAIN-LAIN
-- =============================================================================

-- Tab LINKS (A:D). Link pribadi per user.
CREATE TABLE IF NOT EXISTS user_links (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_nama   VARCHAR(100) NOT NULL,
  title       VARCHAR(255) NOT NULL DEFAULT '',
  url         TEXT         NOT NULL,
  folder      VARCHAR(190) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY ix_links_user (user_nama, folder)
) ENGINE=InnoDB;

-- Tab NOTES (A:E). Catatan pribadi per user.
CREATE TABLE IF NOT EXISTS user_notes (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_nama   VARCHAR(100) NOT NULL,
  title       VARCHAR(255) NOT NULL DEFAULT '',
  body        LONGTEXT     NULL,
  updated_at  DATETIME     NULL,
  folder      VARCHAR(190) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY ix_notes_user (user_nama, folder)
) ENGINE=InnoDB;

-- Tab DASHBOARDS (A:D). Daftar dashboard eksternal di tab "Dashboard Lain".
CREATE TABLE IF NOT EXISTS dashboards (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title       VARCHAR(255) NOT NULL,
  deskripsi   TEXT         NULL,
  icon        VARCHAR(60)  NOT NULL DEFAULT '',
  url         TEXT         NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;


SET FOREIGN_KEY_CHECKS = 1;


-- =============================================================================
--  CATATAN UNTUK TAHAP BERIKUTNYA — jangan dijalankan, dibaca saja
-- =============================================================================
--
--  A. YANG MENUNTUT PERUBAHAN KODE APLIKASI
--
--     LINKS, NOTES, DASHBOARDS, CHECKLIST, COMMENTS, dan ACTIVITY di v1
--     dialamatkan lewat NOMOR BARIS spreadsheet — findLinkByRow(row),
--     deleteNote(row), dan seterusnya. Nomor baris bergeser setiap kali ada
--     baris dihapus, dan v1 hidup dengan itu karena tak punya pilihan lain.
--
--     Di sini mereka punya id sendiri.
--
--     KOREKSI (diperiksa saat menulis api/_db.js): ini TIDAK menuntut perubahan
--     frontend seperti yang tertulis di sini semula. Frontend memperlakukan nilai
--     itu sebagai pegangan buram — ia hanya meneruskannya balik lewat
--     deleteNote(n.row), editLink(l.row), openDashboardModal(d.row) — tanpa pernah
--     menghitung atau menampilkannya. Jadi _db.js cukup mengisi `row` dengan id
--     AUTO_INCREMENT, dan frontend tak perlu disentuh.
--
--     Id MySQL malah lebih baik daripada nomor baris: ia tak pernah bergeser saat
--     ada yang dihapus, sedangkan nomor baris bergeser — dan itu persis sebab
--     penyuntingan di v1 bisa mengenai baris yang salah.
--
--  B. URUTAN MEMASUKKAN DATA
--
--     Kunci asing menuntut induknya ada lebih dulu:
--       users, options, dashboards
--       -> packages -> package_items -> package_links -> package_variants
--       -> collabs  -> collab_steps
--       -> package_contribs      (butuh package_items DAN collab_steps)
--       -> tasks, checklists, comments, activity_log, notifications, auth_pins
--
--  C. YANG AKAN DITOLAK SAAT MIGRASI, DAN ITU GUNANYA
--
--     Baris yang selama ini diam-diam salah di spreadsheet akan gagal masuk:
--     setoran yang menunjuk item atau proses yang sudah tak ada, target kembar
--     dengan item_id sama, nilai tanggal yang bukan tanggal. Itu bukan hambatan
--     migrasi — itu daftar kerusakan yang selama ini tak terlihat.
--
--     Jalankan migrasinya ke tabel kosong lebih dulu, kumpulkan semua yang
--     ditolak, baru putuskan mana yang diperbaiki dan mana yang memang dibuang.
--
--  D. YANG BELUM ADA DI SINI
--
--     Tak ada kolom created_at/updated_at seragam, karena v1 memang tak
--     punya. Menambahkannya sekarang berarti mengisi dengan tebakan untuk 475
--     baris yang sudah ada. Lebih jujur ditambahkan saat v3, ketika semua baris
--     baru memang punya waktunya.
-- =============================================================================
