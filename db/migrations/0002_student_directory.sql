-- Directory civitas akademika (DEMO) + organisasi yang diisi pemohon pada pengajuan.
--
-- 1. contact_phone: nomor telepon yang terdaftar pada direktori kampus (DEMO).
-- 2. organization_name_snapshot: organisasi yang diisi mahasiswa pada form pengajuan.
--    Nilai ini disalin dari input form agar Bagian Akademik menilai organisasi yang
--    benar-benar dinyatakan pemohon, bukan hanya afiliasi profil.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS contact_phone text;

ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS organization_name_snapshot text;

UPDATE booking_requests b
   SET organization_name_snapshot = o.name
  FROM organizations o
 WHERE b.organization_id = o.id
   AND b.organization_name_snapshot IS NULL;

ALTER TABLE booking_requests
  ALTER COLUMN organization_name_snapshot SET NOT NULL;
