import { describe, expect, it } from "vitest";
import {
  getRoomAvailabilityPriority,
  getRoomSelectionState,
  sortRoomsByAvailability,
} from "@/lib/room-selection";
import type { AvailabilityBlockReason, AvailabilityCode } from "@/lib/types";

function availability(overrides: {
  available?: boolean;
  code?: AvailabilityCode;
  label?: string;
  reasons?: string[];
  blockReason?: AvailabilityBlockReason | null;
} = {}) {
  return {
    available: overrides.available ?? false,
    code: overrides.code ?? "booking_conflict",
    label: overrides.label ?? "Sudah dibooking / slot ditahan",
    reasons: overrides.reasons ?? [],
    blockReason: overrides.blockReason ?? null,
  };
}

describe("room selection state", () => {
  it("offers the selection action only for an available room", () => {
    const state = getRoomSelectionState(
      availability({ available: true, code: "available", label: "Tersedia menurut jadwal" }),
    );
    expect(state).toMatchObject({
      selectable: true,
      label: "Pilih Ruangan",
      statusLabel: "Tersedia menurut jadwal",
    });
  });

  it("replaces the action with 'Ruangan Sudah Dibooking' for a confirmed booking", () => {
    const state = getRoomSelectionState(
      availability({ blockReason: "booking_confirmed", reasons: ["Sudah ada booking terkonfirmasi."] }),
    );
    expect(state).toMatchObject({
      selectable: false,
      label: "Ruangan Sudah Dibooking",
      statusLabel: "Ruangan Sudah Dibooking",
    });
  });

  it("replaces the action with 'Slot Sedang Ditahan' for a pending hold", () => {
    const state = getRoomSelectionState(
      availability({
        blockReason: "slot_held",
        reasons: ["Slot sedang ditahan oleh pengajuan lain yang menunggu keputusan Akademik."],
      }),
    );
    expect(state.selectable).toBe(false);
    expect(state.label).toBe("Slot Sedang Ditahan");
  });

  it("replaces the action with 'Ada Jadwal Perkuliahan' for a class conflict", () => {
    const state = getRoomSelectionState(
      availability({ code: "class_conflict", blockReason: "class_schedule" }),
    );
    expect(state.selectable).toBe(false);
    expect(state.label).toBe("Ada Jadwal Perkuliahan");
  });

  it("keeps 101–120% rooms selectable and blocks rooms above 120%", () => {
    const warning = getRoomSelectionState(
      availability({ available: true, code: "available", label: "Tersedia menurut jadwal" }),
    );
    expect(warning.selectable).toBe(true);
    expect(warning.label).toBe("Pilih Ruangan");

    const rejected = getRoomSelectionState(
      availability({
        code: "capacity_insufficient",
        label: "Kapasitas melebihi batas 120%",
        blockReason: "capacity",
      }),
    );
    expect(rejected).toMatchObject({
      selectable: false,
      label: "Melebihi Batas",
      tone: "danger",
    });
  });

  it("does not expose a selection action while availability is unknown", () => {
    const state = getRoomSelectionState(undefined);
    expect(state.selectable).toBe(false);
    expect(state.label).toBe("Memeriksa ketersediaan…");
  });

  it("keeps old booking conflicts readable when blockReason is absent", () => {
    const held = getRoomSelectionState(
      availability({ reasons: ["Slot sedang ditahan oleh pengajuan lain."] }),
    );
    expect(held.label).toBe("Slot Sedang Ditahan");

    const confirmed = getRoomSelectionState(
      availability({ reasons: ["Sudah ada booking terkonfirmasi pada rentang waktu tersebut."] }),
    );
    expect(confirmed.label).toBe("Ruangan Sudah Dibooking");
  });

  it("prioritizes available rooms, then class schedules, pending slots, and booked/inactive rooms", () => {
    expect(
      getRoomAvailabilityPriority(
        availability({ available: true, code: "available", label: "Tersedia menurut jadwal" }),
      ),
    ).toBe(0);
    expect(getRoomAvailabilityPriority(availability({ blockReason: "class_schedule" }))).toBe(1);
    expect(getRoomAvailabilityPriority(availability({ blockReason: "slot_held" }))).toBe(2);
    expect(getRoomAvailabilityPriority(availability({ blockReason: "booking_confirmed" }))).toBe(4);
    expect(getRoomAvailabilityPriority(availability({ blockReason: "room_inactive" }))).toBe(5);

    const rooms = [
      { id: "booked" },
      { id: "pending" },
      { id: "class" },
      { id: "available" },
      { id: "inactive" },
    ];
    const availabilityByRoom = new Map([
      ["booked", availability({ blockReason: "booking_confirmed" })],
      ["pending", availability({ blockReason: "slot_held" })],
      ["class", availability({ blockReason: "class_schedule" })],
      ["available", availability({ available: true, code: "available", label: "Tersedia" })],
      ["inactive", availability({ blockReason: "room_inactive" })],
    ]);

    expect(sortRoomsByAvailability(rooms, availabilityByRoom).map((room) => room.id)).toEqual([
      "available",
      "class",
      "pending",
      "booked",
      "inactive",
    ]);
  });
});
