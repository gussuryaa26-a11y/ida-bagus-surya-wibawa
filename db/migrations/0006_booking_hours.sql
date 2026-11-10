-- Jam booking ruangan kampus: 07:00–21:00 untuk ruangan umum.
-- Jam khusus Inkubator Bisnis (Senin–Jumat, 07:00–20:00) ditegakkan di
-- application layer melalui src/lib/booking-hours.ts.
UPDATE operational_settings
   SET open_time = '07:00',
       close_time = '21:00'
 WHERE id = 1
   AND is_confirmed = false;
