ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS status_note text;

ALTER TABLE rooms
  ADD CONSTRAINT rooms_status_note_check
  CHECK (status_note IS NULL OR char_length(status_note) >= 5);

COMMENT ON COLUMN rooms.status_note IS
  'Keterangan masalah ruangan saat dinonaktifkan oleh Akademik.';
