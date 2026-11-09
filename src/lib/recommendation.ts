import { listRooms } from "./rooms";
import { getSettings } from "./settings";
import { combineDateAndTime } from "./operational-clock";
import { assertStartNotPast, checkRoomAvailability } from "./availability";
import { formatCapacityPercentage } from "./capacity";
import { AppError } from "./errors";
import type { ActivityType, AvailabilityResult, RoomCategory } from "./types";

export type RecommendationCandidate = AvailabilityResult & {
  fitScore: number;
  recommendationReasons: string[];
  categoryMatch: boolean;
  capacityFit: boolean;
  capacityAllowed: boolean;
  facilitiesFit: boolean;
  recommended: boolean;
};

const CATEGORY_PREFERENCE: Record<ActivityType, RoomCategory[]> = {
  seminar: ["hall", "multipurpose", "classroom"],
  workshop: ["multipurpose", "classroom", "hall"],
  rapat: ["multipurpose", "classroom", "hall"],
  lomba: ["hall", "multipurpose", "classroom"],
  seni: ["hall", "multipurpose", "classroom"],
  olahraga: ["hall", "multipurpose", "classroom"],
  lainnya: ["multipurpose", "classroom", "hall"],
};

const CATEGORY_LABEL: Record<RoomCategory, string> = {
  classroom: "ruang kelas",
  multipurpose: "ruang serbaguna",
  hall: "aula",
};

export type RecommendationInput = {
  activityType: ActivityType;
  participantCount: number;
  requiredFacilities: string[];
  date: string;
  startTime: string;
  endTime: string;
};

export async function recommendRooms(input: RecommendationInput): Promise<{
  candidates: RecommendationCandidate[];
  bestUnavailable: RecommendationCandidate | null;
  timezone: string;
}> {
  const settings = await getSettings();
  const startAt = combineDateAndTime(input.date, input.startTime, settings.timezone);
  const endAt = combineDateAndTime(input.date, input.endTime, settings.timezone);
  assertStartNotPast(startAt);
  if (endAt <= startAt) {
    throw new AppError("VALIDATION_ERROR", "Waktu selesai harus setelah waktu mulai.");
  }
  if (input.participantCount <= 0) {
    throw new AppError("VALIDATION_ERROR", "Jumlah peserta harus lebih dari nol.");
  }

  const rooms = await listRooms();
  const preference = CATEGORY_PREFERENCE[input.activityType];
  const candidates: RecommendationCandidate[] = [];

  for (const room of rooms) {
    const availability = await checkRoomAvailability({
      roomId: room.id,
      startAt,
      endAt,
      participantCount: input.participantCount,
      requiredFacilities: input.requiredFacilities,
    });

    const demoUsable = settings.allowDemoRoomData && room.isDemoData;
    const categoryRank = preference.indexOf(room.category);
    const categoryMatch = categoryRank === 0;
    const capacity = availability.capacity;
    const capacityFit = capacity?.status === "normal";
    const capacityAllowed = capacity?.allowed === true;
    const missingFacilities = input.requiredFacilities.filter((facility) => !room.facilities.includes(facility));
    const facilitiesFit = Boolean((room.facilitiesVerified || demoUsable) && missingFacilities.length === 0);

    let fitScore = 0;
    if (categoryRank >= 0) fitScore += (preference.length - categoryRank) * 15;
    if (capacityFit && room.capacity) {
      const surplusRatio = Math.max(0, (room.capacity - input.participantCount) / Math.max(room.capacity, 1));
      fitScore += 50 - Math.min(40, surplusRatio * 40);
    } else if (capacityAllowed) {
      // Ruangan 101–120% masih boleh diajukan, tetapi diberi skor lebih rendah
      // daripada ruangan yang muat dalam kapasitas normal.
      fitScore += 20;
    }
    if (facilitiesFit) fitScore += 30;
    if (availability.available) fitScore += 1000;

    const reasons: string[] = [];
    if (capacity?.status === "normal") {
      reasons.push(
        `Kapasitas ${capacity.capacity} ${room.capacityVerified ? "terverifikasi" : "DEMO (belum diverifikasi kampus)"}, memenuhi ${input.participantCount} peserta (${formatCapacityPercentage(
          capacity.percentage ?? 0,
        )}% dari kapasitas).`,
      );
    } else if (capacity?.status === "unverified") {
      reasons.push(capacity.reason ?? "Kapasitas belum terverifikasi kampus.");
    }
    // Untuk status warning/rejected, alasan kapasitas sudah ditampilkan sebagai
    // catatan khusus di kartu ruangan; jangan duplikasi di daftar alasan.
    if (input.requiredFacilities.length === 0) {
      reasons.push("Tidak ada kebutuhan fasilitas khusus.");
    } else if (!room.facilitiesVerified && !demoUsable) {
      reasons.push("Data fasilitas belum terverifikasi kampus.");
    } else if (missingFacilities.length === 0) {
      reasons.push(`Fasilitas lengkap: ${input.requiredFacilities.join(", ")}.`);
    } else {
      reasons.push(`Fasilitas tidak tersedia: ${missingFacilities.join(", ")}.`);
    }
    reasons.push(
      categoryMatch
        ? `Kategori ${CATEGORY_LABEL[room.category]} paling sesuai untuk kegiatan ${input.activityType}.`
        : `Kategori ${CATEGORY_LABEL[room.category]} merupakan alternatif untuk kegiatan ${input.activityType}.`,
    );

    candidates.push({
      ...availability,
      fitScore,
      recommendationReasons: reasons,
      categoryMatch,
      capacityFit,
      capacityAllowed,
      facilitiesFit,
      recommended: availability.available && capacityAllowed && facilitiesFit,
    });
  }

  candidates.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
    return a.room.name.localeCompare(b.room.name);
  });

  const bestUnavailable =
    candidates.find((candidate) => !candidate.available && candidate.capacityAllowed && candidate.facilitiesFit) ??
    candidates.find((candidate) => !candidate.available) ??
    null;

  return { candidates, bestUnavailable, timezone: settings.timezone };
}

export async function listRoomAvailability(input: {
  date: string;
  startTime: string;
  endTime: string;
  participantCount?: number;
  requiredFacilities?: string[];
}): Promise<{ results: AvailabilityResult[]; timezone: string }> {
  const settings = await getSettings();
  const startAt = combineDateAndTime(input.date, input.startTime, settings.timezone);
  const endAt = combineDateAndTime(input.date, input.endTime, settings.timezone);
  assertStartNotPast(startAt);
  if (endAt <= startAt) {
    throw new AppError("VALIDATION_ERROR", "Waktu selesai harus setelah waktu mulai.");
  }
  const rooms = await listRooms();
  const results: AvailabilityResult[] = [];
  for (const room of rooms) {
    results.push(
      await checkRoomAvailability({
        roomId: room.id,
        startAt,
        endAt,
        participantCount: input.participantCount,
        requiredFacilities: input.requiredFacilities,
      }),
    );
  }
  results.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return a.room.name.localeCompare(b.room.name);
  });
  return { results, timezone: settings.timezone };
}
