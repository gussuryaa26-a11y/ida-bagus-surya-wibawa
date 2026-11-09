ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE INDEX IF NOT EXISTS booking_requests_cancelled_at_idx
  ON booking_requests(cancelled_at)
  WHERE cancelled_at IS NOT NULL;

COMMENT ON COLUMN booking_requests.cancelled_at IS
  'Waktu pengajuan dibatalkan langsung oleh pemohon sebelum keputusan Akademik.';
COMMENT ON COLUMN booking_requests.cancelled_by IS
  'Pemohon yang membatalkan pengajuan pada tahap pending.';
COMMENT ON COLUMN booking_requests.cancellation_reason IS
  'Alasan pembatalan langsung oleh pemohon pada tahap pending.';
