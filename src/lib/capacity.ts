import type { CapacityAssessment } from "./types";

/** Batas atas kapasitas yang masih boleh diajukan, dengan validasi Akademik. */
export const CAPACITY_REVIEW_RATIO = 1;
/** Batas keras: di atas 120% pengajuan ditolak otomatis. */
export const CAPACITY_HARD_LIMIT_RATIO = 1.2;

const percentageFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 2,
});

export function formatCapacityPercentage(value: number): string {
  return percentageFormatter.format(value);
}

export function getCapacityPercentage(
  participantCount: number,
  capacity: number | null,
): number | null {
  if (
    !Number.isFinite(participantCount) ||
    participantCount <= 0 ||
    capacity === null ||
    !Number.isFinite(capacity) ||
    capacity <= 0
  ) {
    return null;
  }
  return Math.round((participantCount / capacity) * 10_000) / 100;
}

/**
 * Evaluasi kapasitas memakai kapasitas aktual ruangan dari database.
 *
 * Aturan:
 * - <= 100%: normal.
 * - > 100% s.d. 120%: boleh dikirim, tetapi wajib validasi tambahan Akademik.
 * - > 120%: ditolak otomatis.
 *
 * Kapasitas null/0/NaN atau data yang belum terverifikasi tidak pernah
 * dianggap "normal"; pengajuan ditolak sampai data kapasitas valid.
 */
export function evaluateCapacity(input: {
  participantCount: number;
  capacity: number | null;
  capacityVerified: boolean;
  allowDemoRoomData: boolean;
  isDemoData: boolean;
}): CapacityAssessment {
  const { participantCount, capacity, capacityVerified, allowDemoRoomData, isDemoData } = input;

  if (!Number.isFinite(participantCount) || participantCount <= 0) {
    return {
      participantCount,
      capacity: null,
      percentage: null,
      status: "unverified",
      allowed: false,
      requiresReview: false,
      warning: false,
      reason: "Jumlah peserta tidak valid sehingga kapasitas ruangan tidak dapat divalidasi.",
    };
  }

  const capacityUsable =
    (capacityVerified || (allowDemoRoomData && isDemoData)) &&
    capacity !== null &&
    Number.isFinite(capacity) &&
    capacity > 0;

  if (!capacityUsable) {
    return {
      participantCount,
      capacity: null,
      percentage: null,
      status: "unverified",
      allowed: false,
      requiresReview: false,
      warning: false,
      reason:
        "Kapasitas ruangan belum terverifikasi atau tidak valid sehingga jumlah peserta tidak dapat divalidasi.",
    };
  }

  const percentage = getCapacityPercentage(participantCount, capacity);
  if (percentage === null) {
    return {
      participantCount,
      capacity,
      percentage: null,
      status: "unverified",
      allowed: false,
      requiresReview: false,
      warning: false,
      reason: "Kapasitas ruangan tidak valid sehingga jumlah peserta tidak dapat divalidasi.",
    };
  }

  // Bandingkan rasio mentah agar ambang 120% tetap tegas, sementara
  // persentase yang ditampilkan dibulatkan dua desimal.
  const ratio = participantCount / capacity;

  if (ratio > CAPACITY_HARD_LIMIT_RATIO) {
    return {
      participantCount,
      capacity,
      percentage,
      status: "rejected",
      allowed: false,
      requiresReview: false,
      warning: false,
      reason:
        "Jumlah peserta melebihi batas wajar. Pilih ruangan dengan kapasitas lebih besar.",
    };
  }

  if (ratio > CAPACITY_REVIEW_RATIO) {
    return {
      participantCount,
      capacity,
      percentage,
      status: "warning",
      allowed: true,
      requiresReview: true,
      warning: true,
      reason: `Jumlah peserta ${participantCount} orang adalah ${formatCapacityPercentage(
        percentage,
      )}% dari kapasitas ${capacity} orang. Pengajuan masih dapat dikirim, tetapi akan ditandai untuk validasi tambahan Bagian Akademik.`,
    };
  }

  return {
    participantCount,
    capacity,
    percentage,
    status: "normal",
    allowed: true,
    requiresReview: false,
    warning: false,
    reason: null,
  };
}
