import { query } from "./db";
import { formatDateRange } from "./format";
import {
  getStudentRecipientIds,
  sendNotifications,
  type NotificationInput,
} from "./notifications";
import { dateKeyInTimezone, timeKeyInTimezone } from "./operational-clock";
import { recommendRooms } from "./recommendation";
import { getRoomById, setRoomOperationalStatus } from "./rooms";
import { getSettings } from "./settings";
import type { ActivityType, Room, SessionUser } from "./types";

type AffectedBooking = {
  id: string;
  requester_id: string;
  activity_name: string;
  activity_type: string;
  participant_count: number;
  required_facilities: string[];
  start_at: Date;
  end_at: Date;
  status: "pending_academic" | "approved";
};

/**
 * Mengubah status ruangan dan, saat ruangan dinonaktifkan, mengirim:
 * - notifikasi umum ke seluruh mahasiswa aktif;
 * - notifikasi khusus ke pemohon yang masih memiliki booking pending/disetujui
 *   di ruangan tersebut, lengkap dengan rekomendasi ruangan pengganti.
 */
export async function setRoomOperationalStatusWithNotifications(
  id: string,
  input: { isActive: boolean; note: string },
  actor: SessionUser,
): Promise<Room> {
  const before = await getRoomById(id, true);
  const wasActive = before?.isActive === true;
  const room = await setRoomOperationalStatus(id, input, actor);

  if (!input.isActive && wasActive) {
    await notifyRoomDeactivated(room);
  }

  return room;
}

export async function notifyRoomDeactivated(room: Room): Promise<void> {
  const settings = await getSettings();
  const description = (room.statusNote?.trim() || "Ruangan sedang tidak aktif").replace(/[.!?]+$/, "");
  const [studentIds, affectedBookings] = await Promise.all([
    getStudentRecipientIds(),
    query<AffectedBooking>(
      `SELECT id, requester_id, activity_name, activity_type, participant_count,
              required_facilities, start_at, end_at, status
         FROM booking_requests
        WHERE room_id = $1
          AND status IN ('pending_academic', 'approved')
          AND end_at >= now()
        ORDER BY start_at ASC`,
      [room.id],
    ),
  ]);

  const notifications: NotificationInput[] = studentIds.map((recipientId) => ({
    recipientId,
    eventType: "room.deactivated",
    title: "Ruangan dinonaktifkan",
    body: `Ruangan "${room.name}" (${room.code}) dinonaktifkan. Keterangan: ${description}. Pengajuan baru untuk ruangan ini akan ditolak. Silakan pilih ruangan lain di halaman Ruangan Kampus.`,
    entityType: "room",
    entityId: room.id,
  }));

  const specialNotifications = await Promise.all(
    affectedBookings.map(async (booking): Promise<NotificationInput> => {
      const range = formatDateRange(booking.start_at, booking.end_at, settings.timezone);
      const recommendationText = await buildRecommendationText(booking, settings.timezone);
      const pending = booking.status === "pending_academic";

      return {
        recipientId: booking.requester_id,
        eventType: "booking.room_deactivated",
        title: pending
          ? "Ruangan dinonaktifkan — pengajuan perlu dialihkan"
          : "Ruangan dinonaktifkan — booking perlu dialihkan",
        body: pending
          ? `Ruangan "${room.name}" (${room.code}) dinonaktifkan. Keterangan: ${description}. Pengajuan "${booking.activity_name}" pada ${range} masih menunggu keputusan. Batalkan pengajuan lama lalu ajukan ruangan pengganti. ${recommendationText}`
          : `Ruangan "${room.name}" (${room.code}) dinonaktifkan. Keterangan: ${description}. Booking "${booking.activity_name}" pada ${range} sudah disetujui dan tidak dapat dibatalkan langsung. Koordinasikan dengan Akademik untuk pengalihan. ${recommendationText}`,
        entityType: "booking_request",
        entityId: booking.id,
      };
    }),
  );

  await sendNotifications([...notifications, ...specialNotifications]);
}

async function buildRecommendationText(
  booking: AffectedBooking,
  timezone: string,
): Promise<string> {
  try {
    const { candidates } = await recommendRooms({
      activityType: booking.activity_type as ActivityType,
      participantCount: booking.participant_count,
      requiredFacilities: booking.required_facilities,
      date: dateKeyInTimezone(booking.start_at, timezone),
      startTime: timeKeyInTimezone(booking.start_at, timezone),
      endTime: timeKeyInTimezone(booking.end_at, timezone),
    });

    const recommended = candidates.filter(
      (candidate) => candidate.available && candidate.recommended,
    );
    const alternatives = (
      recommended.length > 0 ? recommended : candidates.filter((candidate) => candidate.available)
    ).slice(0, 3);

    if (alternatives.length === 0) {
      return "Belum ada ruangan pengganti yang tersedia pada waktu tersebut. Silakan periksa halaman Ruangan Kampus.";
    }

    return `Rekomendasi ruangan pengganti: ${alternatives
      .map((candidate) => `${candidate.room.name} (${candidate.room.code})`)
      .join(", ")}.`;
  } catch (error) {
    console.error("[simpar] failed to build room deactivation recommendations", error);
    return "Rekomendasi ruangan pengganti belum dapat dihitung. Silakan periksa halaman Ruangan Kampus.";
  }
}
