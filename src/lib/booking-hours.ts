import { AppError } from "./errors";
import { combineDateAndTime, dateKeyInTimezone, isPastDateTime } from "./operational-clock";
import type { Room } from "./types";

/**
 * Jam booking ruangan kampus.
 *
 * Aturan ini sengaja dipisahkan dari `operational_settings` karena jam booking
 * berbeda per jenis ruangan: ruangan umum 07:00–21:00, sedangkan Inkubator
 * Bisnis hanya Senin–Jumat 07:00–20:00.
 */
export const GENERAL_BOOKING_HOURS = {
  openTime: "07:00",
  closeTime: "21:00",
} as const;

export const INCUBATOR_BOOKING_HOURS = {
  openTime: "07:00",
  closeTime: "20:00",
  allowedWeekdays: [1, 2, 3, 4, 5] as const,
} as const;

export type BookingHoursPolicy = {
  openTime: string;
  closeTime: string;
  allowedWeekdays: readonly number[] | null;
  label: string;
};

/** Ruang Inkubator Bisnis dikenali dari kode atau namanya. */
export function isIncubatorRoom(room: Pick<Room, "code" | "name">): boolean {
  const code = room.code.trim().toUpperCase();
  const name = room.name.trim().toLowerCase();
  return code === "INKUBATOR" || name.includes("inkubator");
}

export function getBookingHoursPolicy(room: Pick<Room, "code" | "name">): BookingHoursPolicy {
  if (isIncubatorRoom(room)) {
    return {
      openTime: INCUBATOR_BOOKING_HOURS.openTime,
      closeTime: INCUBATOR_BOOKING_HOURS.closeTime,
      allowedWeekdays: INCUBATOR_BOOKING_HOURS.allowedWeekdays,
      label: "Ruang Inkubator Bisnis: Senin–Jumat, 07:00–20:00",
    };
  }
  return {
    openTime: GENERAL_BOOKING_HOURS.openTime,
    closeTime: GENERAL_BOOKING_HOURS.closeTime,
    allowedWeekdays: null,
    label: "Ruangan kampus: setiap hari, 07:00–21:00",
  };
}

export function isoWeekdayForDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dayOfWeek === 0 ? 7 : dayOfWeek;
}

/**
 * Validasi jam umum untuk semua ruangan. Perbandingan memakai timestamp, jadi
 * kelebihan satu detik dari jam tutup tetap ditolak.
 */
export function validateGeneralBookingHours(
  startAt: Date,
  endAt: Date,
  timezone: string,
): void {
  const dateKey = dateKeyInTimezone(startAt, timezone);
  const openAt = combineDateAndTime(dateKey, GENERAL_BOOKING_HOURS.openTime, timezone);
  const closeAt = combineDateAndTime(dateKey, GENERAL_BOOKING_HOURS.closeTime, timezone);

  if (startAt.getTime() < openAt.getTime() || endAt.getTime() > closeAt.getTime()) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Ruangan kampus hanya dapat dibooking pada pukul ${GENERAL_BOOKING_HOURS.openTime}–${GENERAL_BOOKING_HOURS.closeTime}. Waktu di luar rentang tersebut tidak diperbolehkan.`,
    );
  }
}

/**
 * Pelanggaran khusus ruangan (saat ini Inkubator Bisnis). Mengembalikan pesan
 * alasan agar ruangan ditampilkan tidak tersedia tanpa menggagalkan pengecekan
 * ruangan lain.
 */
export function getRoomBookingHoursViolation(
  room: Pick<Room, "code" | "name">,
  startAt: Date,
  endAt: Date,
  timezone: string,
): string | null {
  const policy = getBookingHoursPolicy(room);
  if (!policy.allowedWeekdays) return null;

  const dateKey = dateKeyInTimezone(startAt, timezone);
  if (!policy.allowedWeekdays.includes(isoWeekdayForDateKey(dateKey))) {
    return "Ruang Inkubator Bisnis hanya dapat dibooking pada hari Senin–Jumat.";
  }

  const openAt = combineDateAndTime(dateKey, policy.openTime, timezone);
  const closeAt = combineDateAndTime(dateKey, policy.closeTime, timezone);
  if (startAt.getTime() < openAt.getTime() || endAt.getTime() > closeAt.getTime()) {
    return `Ruang Inkubator Bisnis hanya dapat dibooking pada pukul ${policy.openTime}–${policy.closeTime}.`;
  }

  return null;
}

export type BookingScheduleFieldErrors = {
  date?: string;
  time?: string;
};

/**
 * Validasi tanggal/jam yang dipakai UI saat memilih tanggal maupun saat
 * melanjutkan langkah. Server tetap memeriksa ulang dengan timestamp.
 */
export function getBookingScheduleFieldErrors(
  value: { date: string; startTime: string; endTime: string },
  timezone: string,
  now: Date = new Date(),
): BookingScheduleFieldErrors {
  const errors: BookingScheduleFieldErrors = {};
  const todayKey = dateKeyInTimezone(now, timezone);

  if (!value.date) {
    errors.date = "Tanggal kegiatan wajib diisi.";
  } else if (value.date < todayKey) {
    errors.date = "Tanggal kegiatan tidak boleh sebelum hari ini.";
  }

  if (!value.startTime || !value.endTime) {
    errors.time = "Waktu mulai dan selesai wajib diisi.";
  } else if (value.startTime < GENERAL_BOOKING_HOURS.openTime) {
    errors.time = `Jam mulai paling awal ${GENERAL_BOOKING_HOURS.openTime}.`;
  } else if (value.endTime > GENERAL_BOOKING_HOURS.closeTime) {
    errors.time = `Jam selesai paling lambat ${GENERAL_BOOKING_HOURS.closeTime}.`;
  } else if (value.endTime <= value.startTime) {
    errors.time = "Waktu selesai harus setelah waktu mulai.";
  } else if (!errors.date && isPastDateTime(value.date, value.startTime, timezone, now)) {
    errors.time = "Waktu mulai tidak boleh di masa lalu. Pilih waktu setelah sekarang.";
  }

  return errors;
}
