-- Aturan kapasitas 120%:
--   <= 100%       : normal
--   > 100% - 120% : boleh dikirim, ditandai untuk validasi tambahan Akademik
--   > 120%        : ditolak otomatis oleh server
--
-- Persentase disimpan sebagai snapshot agar keputusan Akademik tetap dapat
-- diaudit meskipun kapasitas ruangan berubah di kemudian hari.

ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS capacity_percentage_snapshot numeric(10,2),
  ADD COLUMN IF NOT EXISTS capacity_review_required boolean NOT NULL DEFAULT false;

ALTER TABLE booking_requests
  ADD CONSTRAINT booking_requests_capacity_percentage_check
  CHECK (capacity_percentage_snapshot IS NULL OR capacity_percentage_snapshot > 0);

UPDATE booking_requests b
   SET capacity_percentage_snapshot = ROUND((b.participant_count::numeric / r.capacity) * 100, 2)
  FROM rooms r
 WHERE r.id = b.room_id
   AND r.capacity IS NOT NULL
   AND r.capacity > 0
   AND b.capacity_percentage_snapshot IS NULL;

UPDATE booking_requests
   SET capacity_review_required = true
 WHERE capacity_percentage_snapshot > 100
   AND capacity_percentage_snapshot <= 120
   AND status IN ('pending_academic', 'revision_requested');

CREATE INDEX IF NOT EXISTS booking_requests_capacity_review_idx
  ON booking_requests(capacity_review_required)
  WHERE capacity_review_required;

COMMENT ON COLUMN booking_requests.capacity_percentage_snapshot IS
  'Persentase jumlah peserta terhadap kapasitas ruangan saat pengajuan dikirim.';
COMMENT ON COLUMN booking_requests.capacity_review_required IS
  'True bila jumlah peserta 101-120% kapasitas dan perlu validasi tambahan Akademik.';
