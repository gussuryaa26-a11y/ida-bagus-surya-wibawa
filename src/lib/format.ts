import type { ActivityType, BookingStatus, RoomCategory, UserRole } from "./types";

export const STATUS_LABELS: Record<BookingStatus, string> = {
  draft: "Draft",
  pending_academic: "Menunggu Akademik",
  revision_requested: "Perlu Revisi",
  approved: "Disetujui",
  rejected: "Ditolak",
  expired: "Kedaluwarsa",
  cancellation_requested: "Pembatalan Menunggu",
  cancelled: "Dibatalkan",
  cancel_rejected: "Pembatalan Ditolak",
};

export const STATUS_TONES: Record<BookingStatus, string> = {
  draft: "bg-line/50 text-ink-soft border-line-strong",
  pending_academic: "bg-warning-100 text-warning-700 border-accent-300",
  revision_requested: "bg-accent-100 text-accent-700 border-accent-300",
  approved: "bg-success-100 text-success-700 border-success-700/20",
  rejected: "bg-danger-100 text-danger-700 border-danger-700/20",
  expired: "bg-line/50 text-ink-soft border-line-strong",
  cancellation_requested: "bg-warning-100 text-warning-700 border-accent-300",
  cancelled: "bg-line/50 text-ink-soft border-line-strong",
  cancel_rejected: "bg-danger-100 text-danger-700 border-danger-700/20",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  student: "Mahasiswa",
  academic: "Bagian Akademik",
  facility_manager: "Pengelola Fasilitas",
  security: "Petugas Keamanan",
  admin_it: "Admin IT",
};

export const CATEGORY_LABELS: Record<RoomCategory, string> = {
  classroom: "Ruang Kelas",
  multipurpose: "Ruang Serbaguna",
  hall: "Aula",
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  seminar: "Seminar",
  workshop: "Workshop",
  rapat: "Rapat",
  lomba: "Lomba",
  seni: "Kegiatan Seni",
  olahraga: "Olahraga",
  lainnya: "Lainnya",
};

export const FACILITY_LABELS: Record<string, string> = {
  proyektor: "Proyektor",
  ac: "AC",
  wifi: "Wi-Fi",
  papan_tulis: "Papan tulis",
  sound_system: "Sound system",
  panggung: "Panggung",
  meja: "Meja",
  kursi: "Kursi",
  komputer: "Komputer",
  imac: "iMac",
  kamera: "Kamera",
  mesin_jahit: "Mesin jahit",
};

export const RESTRICTION_LABELS: Record<string, string> = {
  closure: "Penutupan",
  maintenance: "Pemeliharaan",
  restriction: "Pembatasan",
};

export const CALENDAR_TYPE_LABELS: Record<string, string> = {
  holiday: "Hari libur",
  break: "Periode libur",
  semester: "Semester",
  exception: "Pengecualian",
};

export function formatDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatDateShort(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: timezone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDateRange(start: Date, end: Date, timezone: string): string {
  const sameDay =
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(start) ===
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(end);
  if (sameDay) {
    return `${formatDate(start, timezone)}, ${formatTime(start, timezone)}–${formatTime(end, timezone)}`;
  }
  return `${formatDateTime(start, timezone)} – ${formatDateTime(end, timezone)}`;
}

export function formatMinutes(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (hours === 0) return `${rest} menit`;
  if (rest === 0) return `${hours} jam`;
  return `${hours} jam ${rest} menit`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function facilityLabels(facilities: string[]): string {
  return facilities.map((facility) => FACILITY_LABELS[facility] ?? facility).join(", ");
}

export function eventTypeLabel(eventType: string): string {
  const labels: Record<string, string> = {
    "booking.submitted": "Pengajuan terkirim",
    "booking.approved": "Pengajuan disetujui",
    "booking.rejected": "Pengajuan ditolak",
    "booking.revision_requested": "Revisi diminta",
    "booking.resubmitted": "Revisi dikirim",
    "booking.overdue": "Target terlewati",
    "booking.expired": "Slot kedaluwarsa",
    "booking.cancellation_requested": "Pembatalan diajukan",
    "booking.cancellation_approved": "Pembatalan disetujui",
    "booking.cancellation_rejected": "Pembatalan ditolak",
    "booking.cancelled_by_requester": "Pengajuan dibatalkan",
    "room.deactivated": "Ruangan dinonaktifkan",
    "booking.room_deactivated": "Ruangan booking dinonaktifkan",
    "booking.post_approval_conflict": "Konflik pasca-persetujuan",
    "memo.ready": "Internal Memo siap",
    "memo.failed": "Internal Memo gagal",
  };
  return labels[eventType] ?? eventType;
}

export function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    "auth.login": "Login",
    "booking.submitted": "Pengajuan dibuat",
    "booking.approve": "Disetujui",
    "booking.reject": "Ditolak",
    "booking.request_revision": "Revisi diminta",
    "booking.resubmitted": "Revisi dikirim",
    "booking.expired": "Kedaluwarsa",
    "booking.post_approval_conflict": "Konflik pasca-persetujuan",
    "booking.cancellation_requested": "Pembatalan diajukan",
    "booking.cancellation_approved": "Pembatalan disetujui",
    "booking.cancellation_rejected": "Pembatalan ditolak",
    "booking.cancelled_by_requester": "Pengajuan dibatalkan pemohon",
    "internal_memo.generated": "Memo dibuat",
    "internal_memo.downloaded": "Memo diunduh",
    "room.created": "Ruangan dibuat",
    "room.updated": "Ruangan diubah",
    "room.activated": "Ruangan diaktifkan",
    "room.deactivated": "Ruangan dinonaktifkan",
    "room.restriction_created": "Pembatasan dibuat",
    "room.restriction_deleted": "Pembatasan dihapus",
    "schedule.imported": "Jadwal diimpor",
    "schedule.import_failed": "Impor jadwal gagal",
    "calendar.created": "Kalender dibuat",
    "calendar.updated": "Kalender diubah",
    "calendar.deleted": "Kalender dihapus",
    "settings.updated": "Konfigurasi diubah",
    "user.created": "Akun dibuat",
    "user.updated": "Akun diubah",
    "user.password_reset": "Kata sandi direset",
    "profile.updated": "Profil diubah",
    "demo.seeded": "Seed demo",
  };
  return labels[action] ?? action;
}

export function truncate(value: string, length = 80): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}
