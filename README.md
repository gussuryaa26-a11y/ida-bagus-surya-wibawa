# SIMPAR — Sistem Peminjaman Ruangan Kampus IDB Bali

SIMPAR adalah aplikasi web internal non-komersial untuk pengajuan peminjaman ruangan kegiatan
organisasi resmi kampus IDB Bali. Sistem mencakup autentikasi, RBAC, ketersediaan ruangan,
rekomendasi deterministik, penahanan slot, persetujuan Akademik, pembatalan, timer jam operasional,
notifikasi in-app, audit trail, impor jadwal, dan generator PDF Internal Memo.

> Status konfigurasi: data ruangan, kapasitas, fasilitas, jam operasional, kalender, organisasi,
> dan akun awal adalah **DEMO** dan **belum diverifikasi/disahkan kampus**. Aplikasi menampilkan
> penanda DEMO secara eksplisit. Jangan menganggap data DEMO sebagai data resmi.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS 4, komponen UI internal (token warna/typography/spacing)
- PostgreSQL (driver `pg`, migrasi SQL, exclusion constraint `btree_gist`)
- Autentikasi sesi server-side: cookie HttpOnly + sesi di database + bcrypt
- Validasi Zod
- `pdf-lib` untuk Internal Memo (template adapter DEMO/resmi)
- `exceljs` + parser CSV untuk impor jadwal
- Vitest untuk unit/integration test

## Menjalankan secara lokal

Prasyarat: Node.js 20+ dan npm. PostgreSQL **tidak perlu diinstal** untuk development karena
tersedia embedded PostgreSQL (paket `embedded-postgres`, binary platform).

```bash
npm install
cp .env.example .env.local        # sesuaikan bila perlu
npm run db:start                  # terminal 1: PostgreSQL embedded di 127.0.0.1:55432
npm run db:setup                  # terminal 2: migrasi + seed DEMO
npm run dev                       # http://localhost:3000
npm run preview                   # buka http://localhost:3000 di Google Chrome
```

`npm run preview` membuka Chrome ke `http://localhost:3000`. Jika dev server belum berjalan,
skrip menjalankan `npm run dev` di jendela baru lalu menunggu sampai siap (maks. 90 detik).

`db:start` membuat data di `.data/pg` dan database `simpar`. Hentikan dengan Ctrl+C. Data tetap
tersimpan (persistent) dan bisa dipakai lagi.

Untuk PostgreSQL eksternal (produksi):

```bash
export DATABASE_URL="postgresql://user:pass@host:5432/simpar"
npm run db:migrate
# seed hanya untuk demo/development:
# npm run db:seed
npm run build && npm run start
```

Reset demo development: hentikan `db:start`, hapus folder `.data/`, jalankan `npm run db:start`
lalu `npm run db:setup` (destruktif untuk data development saja).

## Akun demo (development only)

Kata sandi default: `Demo1234!` (dapat diubah dengan `SEED_DEMO_PASSWORD` sebelum seed).

Direktori mahasiswa DEMO berisi **100 akun** dengan NIM `20240001` sampai `20240100`. Setiap akun
memiliki nama lengkap, NIM, program studi, email kampus (demo), nomor telepon (demo), dan afiliasi
organisasi. Data ini meniru integrasi direktori civitas akademika/SIAKAD; bukan data resmi kampus.

| Peran | Login | Kewenangan |
| --- | --- | --- |
| Mahasiswa (BEM DEMO) | `20240001` | Ajukan, revisi, pembatalan, unduh memo miliknya |
| Mahasiswa (HIMA DEMO) | `20240002` | Ajukan, revisi, pembatalan, unduh memo miliknya |
| Mahasiswa lainnya | `20240003`–`20240100` | Ajukan, revisi, pembatalan, unduh memo miliknya |
| Bagian Akademik | `akademik` | Setujui/tolak/revisi, putuskan pembatalan, audit |
| Pengelola Fasilitas | `fasilitas` | Ruangan, kapasitas/fasilitas, pembatasan, impor jadwal |
| Petugas Keamanan | `keamanan` | Hanya jadwal booking terkonfirmasi (data operasional minimum) |
| Admin IT | `admin` | Akun/role, konfigurasi teknis, audit, job manual |

Akun demo tidak boleh dipakai di produksi. Hapus/ubah seed sebelum peluncuran.

Profil mahasiswa bersifat hanya-baca dan menampilkan **nama lengkap, NIM, program studi, email
terdaftar, dan nomor telepon terdaftar**. Organisasi yang diwakili diisi mahasiswa pada form
pengajuan, lalu nilai tersebut disalin ke `booking_requests.organization_name_snapshot` agar Bagian
Akademik menilai organisasi yang dinyatakan pemohon.

## Alur utama

1. Login dengan NIM/ID dan kata sandi.
2. Mahasiswa mengisi organisasi yang diwakili, keperluan kegiatan organisasi (bukan pribadi), dan
   data kegiatan lainnya.
3. Sistem menampilkan rekomendasi ruangan deterministik + seluruh ruangan kampus dengan gambar,
   kapasitas, fasilitas, status ketersediaan, dan alasan.
4. Server memvalidasi ulang, memeriksa konflik, lalu menyimpan pengajuan dan menahan slot secara
   atomik (`pending_academic`).
5. Akademik memutuskan: setujui, tolak, atau minta revisi. Target 1 jam operasional; penahanan
   maksimal 3 jam operasional.
6. Jika disetujui, PDF Internal Memo dibuat setelah transaksi persetujuan berhasil. Kegagalan PDF
   tidak membatalkan booking dan dapat dicoba ulang.
7. Pembatalan booking terkonfirmasi harus disetujui Akademik sebelum slot dilepas.

## Aturan bisnis yang diterapkan

- Pengajuan hanya untuk organisasi aktif; pemohon wajib punya afiliasi organisasi (dan jabatan bila
  dikonfigurasi). Tidak ada opsi pengajuan pribadi.
- Otoritas keputusan akhir: role `academic`. Admin IT tidak otomatis dapat menyetujui.
- Target keputusan 60 menit operasional dan penahanan slot 180 menit operasional (dapat dikonfigurasi).
  Timer memakai zona waktu kampus, hari kerja, kalender libur, dan pengecualian jam operasional.
- Slot kedaluwarsa hanya jika status masih `pending_academic`; keputusan yang sudah tersimpan tidak
  ditimpa.
- Pembatalan tetap menahan slot sampai Akademik menyetujui. Pola yang dipilih: penolakan pembatalan
  mengembalikan booking ke `approved` dan baris pembatalan menjadi `rejected`.
- Kebijakan revisi default: **lepas slot** (rekomendasi PRD). Opsi `hold_limited` tersedia dan
  didokumentasikan sebagai keputusan yang masih perlu dikonfirmasi kampus.
- Konflik pasca-persetujuan (impor jadwal/pembatasan baru) ditandai, Akademik diberi notifikasi,
  booking **tidak** dibatalkan otomatis.
- Ketersediaan hanya berdasarkan data tercatat; sistem tidak mengklaim okupansi fisik.
- Hari libur menonaktifkan jadwal kuliah reguler, tetapi tidak otomatis membuat semua ruangan
  tersedia; booking, penutupan, dan pembatasan tetap berlaku.

## Anti double-booking

Pembuatan pengajuan berjalan dalam satu transaksi database dengan:

1. `pg_advisory_xact_lock` per ruangan untuk menyerialkan pemeriksaan + penyimpanan;
2. pemeriksaan jadwal kuliah, booking/penahanan aktif, buffer, pembatasan, kapasitas, fasilitas, dan
   kesegaran data;
3. `EXCLUDE USING gist` pada `booking_requests` (kolom `slot_held`) sebagai pengaman terakhir di
   database;
4. idempotency key (`Idempotency-Key`) dengan unique index per pemohon.

Dua pengajuan bersamaan untuk ruangan/waktu yang bertabrakan tidak dapat sama-sama berhasil.
Waktu akhir bersifat eksklusif: 09.00–10.00 dan 10.00–11.00 tidak bertabrakan kecuali buffer
dikonfigurasi.

## Struktur database

Migrasi: `db/migrations/0001_init.sql` dan `db/migrations/0002_student_directory.sql` (forward-only,
dijalankan oleh `npm run db:migrate`).

Tabel utama: `users`, `sessions`, `organizations`, `rooms`, `room_restrictions`,
`academic_calendar`, `operational_exceptions`, `operational_settings`, `class_schedules`,
`schedule_imports`, `booking_requests`, `booking_cancellations`, `internal_memos`, `notifications`,
`post_approval_conflicts`, `audit_logs`.

Catatan:

- `booking_requests.slot_held` + exclusion constraint menjamin tidak ada overlap aktif.
- `booking_requests.organization_name_snapshot` menyimpan organisasi yang diisi mahasiswa pada form
  pengajuan; Bagian Akademik melihat nilai ini, bukan hanya afiliasi profil.
- `users.contact_phone` menyimpan nomor telepon dari direktori kampus (DEMO) dan ditampilkan
  hanya-baca pada profil mahasiswa.
- `audit_logs` memiliki trigger yang menolak UPDATE/DELETE (append-only).
- `internal_memos` menyimpan versi dokumen/template dan status pembuatan; file PDF disimpan di
  `MEMO_STORAGE_DIR` (default `.data/memos`) dengan referensi nama file yang dibatasi.
- Enum status: `draft`, `pending_academic`, `revision_requested`, `approved`, `rejected`, `expired`,
  `cancellation_requested`, `cancelled`, `cancel_rejected`. Pengajuan langsung `pending_academic`
  saat dikirim; `draft` dan `cancel_rejected` disediakan untuk kompatibilitas model dan tidak dipakai
  sebagai status booking aktif (pola pembatalan dijelaskan di atas).
- Rollback: migrasi bersifat forward-only. Sebelum perubahan produksi, ambil backup
  (`pg_dump -Fc`), uji restore ke database terpisah, dan pulihkan dengan `pg_restore`. Tidak ada
  migrasi destruktif otomatis.

## API (ringkas)

Autentikasi:

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`

Ruangan & ketersediaan:

- `GET /api/rooms`, `GET /api/rooms/{id}`
- `GET /api/rooms/availability?date=YYYY-MM-DD&startTime=HH:MM&endTime=HH:MM`
- `POST /api/rooms/recommendations`

Pengajuan:

- `POST /api/booking-requests` (header `Idempotency-Key` disarankan)
- `GET /api/booking-requests`, `GET /api/booking-requests/{id}`
- `POST /api/booking-requests/{id}/decision` (Akademik)
- `POST /api/booking-requests/{id}/revision` (pemohon, status `revision_requested`)

Pembatalan & memo:

- `POST /api/bookings/{id}/cancellation-requests`
- `POST /api/cancellation-requests/{id}/decision` (Akademik)
- `POST /api/bookings/{id}/internal-memo` (buat/coba ulang)
- `GET /api/internal-memos/{id}/download` (otorisasi server)

Administrasi:

- `POST /api/admin/schedules/import` (multipart: `file`, `source`, `sourceVersion`, `mode=preview|commit`, `strict`)
- `GET/POST /api/admin/calendar`, `PATCH/DELETE /api/admin/calendar/{id}`
- `GET/POST /api/admin/rooms`, `PATCH /api/admin/rooms/{id}`
- `GET/POST /api/admin/restrictions`, `DELETE /api/admin/restrictions/{id}`
- `GET/PATCH /api/admin/settings`
- `GET/POST /api/admin/users`, `PATCH /api/admin/users/{id}`, `POST /api/admin/users/{id}/password`
- `GET /api/audit` (Admin IT)
- `GET /api/notifications`, `PATCH /api/notifications`
- `PATCH /api/profile`
- `POST /api/internal/jobs/deadlines` (Bearer `INTERNAL_JOB_TOKEN` atau sesi Admin IT)

Kodeerror: 400 validasi, 401 belum login, 403 tidak berwenang, 404 tidak ditemukan/tidak boleh
diungkap, 409 konflik, 422 aturan bisnis, 429 rate limit, 500 kegagalan server.

## Job tenggat & kedaluwarsa

Endpoint job **idempotent**:

```bash
curl -X POST -H "Authorization: Bearer $INTERNAL_JOB_TOKEN" \
  https://simpar.example.ac.id/api/internal/jobs/deadlines
```

CLI:

```bash
npm run job:deadlines
```

Job melakukan:

- hitung ulang target/hold untuk pengajuan terbuka berdasarkan konfigurasi terbaru;
- kirim pengingat target 1 jam (sekali per pengajuan);
- kedaluwarsakan pengajuan yang melewati batas penahanan dengan transaksi + row lock;
- lepaskan slot revisi bila kebijakan `release`.

**Scheduler persisten belum dikonfigurasi otomatis** di lingkungan ini. Untuk produksi, jadwalkan
endpoint/CLI setiap 5–15 menit pada jam operasional, misalnya cron:

```cron
*/10 8-17 * * 1-5 curl -fsS -X POST -H "Authorization: Bearer $INTERNAL_JOB_TOKEN" https://simpar.example.ac.id/api/internal/jobs/deadlines
```

Sesuaikan zona waktu server/cron dengan zona waktu kampus. Jika scheduler tidak berjalan, status
tidak berubah otomatis sampai job dijalankan; halaman Admin menyediakan tombol job manual.

## Internal Memo

- Hanya dibuat setelah booking disetujui.
- Default memakai template **DEMO** dan PDF berlabel “DEMO — belum resmi”, tanpa klaim nomor surat,
  tanda tangan, stempel, atau pejabat.
- Retry idempotent terhadap baris memo yang sama; kegagalan tidak mengubah status booking.
- Unduhan diperiksa di server (pemohon atau Akademik).
- Untuk template resmi: pilih `Template resmi kampus` + isi path template pada konfigurasi Admin.
  Adapter resmi membutuhkan file PDF dan file mapping `<template>.fields.json`:

```json
{
  "fields": {
    "documentNumber": { "x": 420, "y": 760, "size": 10 },
    "activityName": { "x": 120, "y": 700, "size": 11 },
    "organizationName": { "x": 120, "y": 680, "size": 11 },
    "requesterName": { "x": 120, "y": 660, "size": 11 },
    "requesterNim": { "x": 320, "y": 660, "size": 10 },
    "roomName": { "x": 120, "y": 640, "size": 11 },
    "date": { "x": 120, "y": 620, "size": 11 },
    "time": { "x": 120, "y": 600, "size": 11 },
    "participantCount": { "x": 120, "y": 580, "size": 11 },
    "facilities": { "x": 120, "y": 560, "size": 10 },
    "purpose": { "x": 120, "y": 520, "size": 10 }
  }
}
```

Contoh ada di `templates/internal-memo.fields.example.json`. Template resmi, penomoran, pejabat,
tanda tangan, dan stempel **wajib disediakan/disahkan kampus**; sistem tidak mengarangnya.

## Konfigurasi yang masih perlu dikonfirmasi kampus

1. Jam operasional resmi, hari kerja, dan zona waktu (saat ini `Asia/Makassar`, DEMO).
2. Kalender libur, cuti bersama, periode libur, dan pengecualian jam.
3. Daftar ruangan resmi, kapasitas, dan fasilitas terverifikasi.
4. Daftar organisasi resmi dan mekanisme verifikasi afiliasi/jabatan.
5. Kebijakan slot saat `revision_requested` (default: lepas slot).
6. Prosedur konflik jadwal pasca-persetujuan.
7. Template/penomoran/penandatangan/stempel Internal Memo.
8. Kanal notifikasi (saat ini in-app; email belum diaktifkan).
9. Retensi data/dokumen/audit.
10. Buffer antarbooking dan prosedur pembatalan darurat.

Semua nilai ini dapat diubah lewat Admin → Konfigurasi operasional (tercatat audit) atau data
master. Konfigurasi belum ditandai terkonfirmasi sampai administrator mencentang konfirmasi resmi.

## Pengujian

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Status terakhir di lingkungan ini:

- `npm run typecheck`: lulus
- `npm run lint`: lulus tanpa warning
- `npm test`: **43 test lulus** (6 file) menggunakan PostgreSQL embedded terpisah di port `55433`
- `npm run build`: lulus
- Smoke test HTTP/manual: login, rekomendasi, pengajuan, penolakan 409 double booking, keputusan
  Akademik, unduh PDF, pembatalan ditolak/disetujui, job tenggat, impor CSV preview/commit

Cakupan test: operational clock (weekend/libur/pengecualian), validasi & idempotensi pengajuan,
konkurensi double booking, buffer, konflik jadwal kuliah, kapasitas belum terverifikasi, kesegaran
jadwal, keputusan Akademik, revisi, kedaluwarsa idempotent, race keputusan vs kedaluwarsa,
pembatalan menahan/melepas slot, otorisasi memo/PDF, kegagalan template resmi + retry, impor
sebagian/ketat, konflik pasca-persetujuan, RBAC, keamanan data Keamanan, autentikasi akun nonaktif,
dan audit append-only.

Test menggunakan database test terpisah dan **tidak** menyentuh database development.

## Keamanan

- Otorisasi & kepemilikan data selalu diperiksa di server (bukan hanya menyembunyikan tombol).
- Cookie sesi HttpOnly, SameSite=Lax, Secure di produksi; token disimpan sebagai hash.
- Password bcrypt (cost 12), login rate-limit 5 percobaan/15 menit per IP+ID (in-memory; gunakan
  shared store untuk multi-instance).
- Validasi input Zod, pesan error tidak membocorkan stack/secret.
- Audit append-only untuk tindakan penting.
- Header keamanan dasar (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`).
- PDF dan file memo hanya diunduh lewat route ber-otorisasi.
- Secret dibaca dari environment; jangan commit `.env.local`.
- `AUTH_SECRET` wajib di produksi; `INTERNAL_JOB_TOKEN` sebaiknya dirotasi berkala.

## Batasan / pekerjaan lanjutan

- Scheduler produksi belum dikonfigurasi; job harus dijadwalkan manual (lihat di atas).
- Email/kanal notifikasi eksternal belum diaktifkan; retry kanal eksternal belum diimplementasikan.
- Daftar organisasi belum memiliki UI CRUD; seed DEMO dan pengelolaan afiliasi via Admin. Kampus
  perlu menetapkan sumber resmi.
- Template resmi Internal Memo belum tersedia; hanya adapter + contoh mapping.
- Impor `.xlsx` didukung melalui ExcelJS, tetapi pengujian otomatis utama memakai CSV.
- Rate limiter in-memory tidak cocok untuk deployment multi-instance tanpa shared store.
- Belum ada endpoint pembatalan darurat oleh petugas; prosedur ini masih perlu ditetapkan kampus.
- Konflik pasca-persetujuan ditandai dan dinotifikasi, tetapi belum ada alur resolusi formal.
- Gambar ruangan berasal dari website IDB Bali; untuk beberapa ruangan foto spesifik belum tersedia
  dan ditandai sebagai foto ilustrasi.
- `draft`/`cancel_rejected` disediakan di enum untuk kompatibilitas; alur aktif menggunakan pola
  yang dijelaskan pada bagian aturan bisnis.

## Environment variables

| Variabel | Wajib | Keterangan |
| --- | --- | --- |
| `DATABASE_URL` | Produksi | Koneksi PostgreSQL |
| `AUTH_SECRET` | Produksi | Pepper hash token sesi (min. 16 karakter) |
| `INTERNAL_JOB_TOKEN` | Disarankan | Bearer token endpoint job |
| `MEMO_STORAGE_DIR` | Opsional | Direktori PDF memo (default `.data/memos`) |
| `SEED_DEMO_PASSWORD` | Development | Kata sandi akun seed |
| `DEV_DB_PORT` / `DEV_DB_DIR` / `DEV_DB_NAME` | Development | Konfigurasi embedded PostgreSQL |

## Lisensi / penggunaan

Aplikasi internal kampus, non-komersial. Tidak ada pembayaran, langganan, iklan, komisi, atau
monetisasi. Logo dan foto fasilitas diambil dari website resmi IDB Bali yang Anda rujuk; gunakan
sesuai kebijakan kampus.
