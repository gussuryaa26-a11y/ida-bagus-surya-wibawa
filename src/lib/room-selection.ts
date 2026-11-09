import type { AvailabilityResult } from "./types";

export type RoomSelectionTone = "success" | "warning" | "danger" | "neutral";

export type RoomSelectionState = {
  /** True only when the room can actually be selected for this time slot. */
  selectable: boolean;
  /** Text for the selection slot: the action, or the reason it is blocked. */
  label: string;
  /** Short status for badges, independent of the action wording. */
  statusLabel: string;
  tone: RoomSelectionTone;
};

type AvailabilityLike = Pick<
  AvailabilityResult,
  "available" | "code" | "label" | "reasons" | "blockReason"
>;

/**
 * Single source of truth for the room-selection UI.
 *
 * An unavailable room must never render a "Pilih Ruangan" control. The caller
 * renders the returned label in its place, so the state is always visible and
 * never hidden behind a disabled button.
 */
export function getRoomSelectionState(
  availability?: AvailabilityLike | null,
): RoomSelectionState {
  if (!availability) {
    return {
      selectable: false,
      label: "Memeriksa ketersediaan…",
      statusLabel: "Memeriksa ketersediaan…",
      tone: "neutral",
    };
  }

  if (availability.available) {
    return {
      selectable: true,
      label: "Pilih Ruangan",
      statusLabel: availability.label,
      tone: "success",
    };
  }

  switch (availability.blockReason) {
    case "booking_confirmed":
      return blocked("Ruangan Sudah Dibooking", "danger");
    case "slot_held":
      return blocked("Slot Sedang Ditahan", "warning");
    case "class_schedule":
      return blocked("Ada Jadwal Perkuliahan", "warning");
    case "room_inactive":
      return blocked("Ruangan Tidak Aktif", "neutral");
    case "capacity":
      return blocked(
        availability.code === "capacity_insufficient"
          ? "Melebihi Batas"
          : "Kapasitas Belum Terverifikasi",
        availability.code === "capacity_insufficient" ? "danger" : "neutral",
      );
    case "facilities":
      return blocked(
        availability.code === "facilities_missing"
          ? "Fasilitas Tidak Lengkap"
          : "Fasilitas Belum Terverifikasi",
        "neutral",
      );
    case "restriction":
      return blocked("Ruangan Sedang Ditutup", "warning");
    case "data_stale":
      return blocked("Data Jadwal Perlu Diperbarui", "warning");
    default:
      return blocked(fallbackLabel(availability), "danger");
  }
}

function blocked(label: string, tone: RoomSelectionTone): RoomSelectionState {
  return { selectable: false, label, statusLabel: label, tone };
}

function fallbackLabel(availability: AvailabilityLike): string {
  if (availability.code === "class_conflict") return "Ada Jadwal Perkuliahan";
  if (availability.code === "booking_conflict") {
    const held = availability.reasons.some((reason) => /ditahan|menunggu keputusan/i.test(reason));
    return held ? "Slot Sedang Ditahan" : "Ruangan Sudah Dibooking";
  }
  return availability.label;
}

type AvailabilityPriorityLike = Pick<AvailabilityResult, "available" | "blockReason">;

/**
 * Urutan prioritas kartu ruangan untuk mahasiswa:
 * tersedia → ada jadwal kuliah → slot pending → kendala lain → sudah dibooking → nonaktif.
 */
export function getRoomAvailabilityPriority(
  availability?: AvailabilityPriorityLike | null,
): number {
  if (availability?.available) return 0;
  switch (availability?.blockReason) {
    case "class_schedule":
      return 1;
    case "slot_held":
      return 2;
    case "capacity":
    case "facilities":
    case "restriction":
    case "data_stale":
      return 3;
    case "booking_confirmed":
      return 4;
    case "room_inactive":
      return 5;
    default:
      return 3;
  }
}

export function sortRoomsByAvailability<T extends { id: string }>(
  rooms: T[],
  availabilityByRoom: ReadonlyMap<string, AvailabilityPriorityLike>,
): T[] {
  return rooms
    .map((room, index) => ({
      room,
      index,
      priority: getRoomAvailabilityPriority(availabilityByRoom.get(room.id)),
    }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map(({ room }) => room);
}
