import { beforeEach, describe, expect, it } from "vitest";
import { decideBooking } from "@/lib/approvals";
import { checkRoomAvailability } from "@/lib/availability";
import { createBookingRequest, type BookingInput } from "@/lib/bookings";
import { query } from "@/lib/db";
import { setRoomOperationalStatusWithNotifications } from "@/lib/room-status-notifications";
import { getRoomById, listRooms, setRoomOperationalStatus } from "@/lib/rooms";
import {
  IDS,
  TEST_DATE,
  TEST_END,
  TEST_START,
  academicUser,
  resetDatabase,
  student1,
  student2,
} from "./fixtures";

function bookingInput(roomId: string, activityName: string): BookingInput {
  return {
    activityName,
    activityPurpose: "Menguji notifikasi penonaktifan ruangan.",
    activityType: "seminar",
    participantCount: 30,
    requiredFacilities: ["ac", "wifi"],
    roomId,
    date: TEST_DATE,
    startTime: "10:00",
    endTime: "12:00",
  };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("academic room status", () => {
  it("deactivates a room with a problem note and releases it from the selectable list", async () => {
    const note = "AC rusak dan menunggu perbaikan.";

    await setRoomOperationalStatus(IDS.roomA, { isActive: false, note }, academicUser);

    const room = await getRoomById(IDS.roomA, true);
    expect(room).toMatchObject({ isActive: false, statusNote: note });

    const availability = await checkRoomAvailability({
      roomId: IDS.roomA,
      startAt: TEST_START,
      endAt: TEST_END,
    });
    expect(availability.available).toBe(false);
    expect(availability.code).toBe("room_inactive");
    expect(availability.reasons.join(" ")).toContain(note);

    const activeRooms = await listRooms();
    expect(activeRooms.some((item) => item.id === IDS.roomA)).toBe(false);

    const allRooms = await listRooms({ includeInactive: true });
    expect(allRooms.find((item) => item.id === IDS.roomA)?.statusNote).toBe(note);

    const audit = await query<{ action: string; reason: string | null }>(
      "SELECT action, reason FROM audit_logs WHERE entity_id = $1 AND action = 'room.deactivated'",
      [IDS.roomA],
    );
    expect(audit[0]).toMatchObject({ action: "room.deactivated", reason: note });
  });

  it("activates the room again and clears the problem note", async () => {
    await setRoomOperationalStatus(
      IDS.roomA,
      { isActive: false, note: "Lampu ruangan mati." },
      academicUser,
    );
    await setRoomOperationalStatus(IDS.roomA, { isActive: true, note: "" }, academicUser);

    const room = await getRoomById(IDS.roomA, true);
    expect(room).toMatchObject({ isActive: true, statusNote: null });

    const availability = await checkRoomAvailability({
      roomId: IDS.roomA,
      startAt: TEST_START,
      endAt: TEST_END,
    });
    expect(availability.available).toBe(true);

    const audit = await query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'room.activated'",
      [IDS.roomA],
    );
    expect(audit).toHaveLength(1);
  });

  it("rejects non-academic actors and deactivation without a note", async () => {
    await expect(
      setRoomOperationalStatus(IDS.roomA, { isActive: false, note: "AC rusak." }, student1),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      setRoomOperationalStatus(IDS.roomA, { isActive: false, note: "" }, academicUser),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const room = await getRoomById(IDS.roomA, true);
    expect(room?.isActive).toBe(true);
  });

  it("notifies all students and gives a pending booking a special transfer recommendation", async () => {
    const { booking } = await createBookingRequest(
      bookingInput(IDS.roomB, "Seminar Terdampak"),
      student1,
    );

    await setRoomOperationalStatusWithNotifications(
      IDS.roomB,
      { isActive: false, note: "AC rusak dan menunggu perbaikan." },
      academicUser,
    );

    const general = await query<{ body: string }>(
      "SELECT body FROM notifications WHERE recipient_id = $1 AND event_type = 'room.deactivated'",
      [IDS.student1],
    );
    expect(general).toHaveLength(1);
    expect(general[0]?.body).toContain("AC rusak dan menunggu perbaikan.");

    const generalForOtherStudent = await query<{ id: string }>(
      "SELECT id FROM notifications WHERE recipient_id = $1 AND event_type = 'room.deactivated'",
      [IDS.student2],
    );
    expect(generalForOtherStudent).toHaveLength(1);

    const special = await query<{ body: string; related_entity_id: string }>(
      `SELECT body, related_entity_id FROM notifications
        WHERE recipient_id = $1 AND event_type = 'booking.room_deactivated' AND related_entity_id = $2`,
      [IDS.student1, booking.id],
    );
    expect(special).toHaveLength(1);
    expect(special[0]?.related_entity_id).toBe(booking.id);
    expect(special[0]?.body).toContain("masih menunggu keputusan");
    expect(special[0]?.body).toContain("Rekomendasi ruangan pengganti");

    const otherStudentSpecial = await query<{ id: string }>(
      "SELECT id FROM notifications WHERE recipient_id = $1 AND event_type = 'booking.room_deactivated'",
      [IDS.student2],
    );
    expect(otherStudentSpecial).toHaveLength(0);
  });

  it("gives an approved booking a special transfer recommendation", async () => {
    const { booking } = await createBookingRequest(
      bookingInput(IDS.roomC, "Seminar Disetujui Terdampak"),
      student1,
    );
    await decideBooking({ bookingId: booking.id, action: "approve" }, academicUser);

    await setRoomOperationalStatusWithNotifications(
      IDS.roomC,
      { isActive: false, note: "Lampu ruangan mati." },
      academicUser,
    );

    const special = await query<{ body: string }>(
      `SELECT body FROM notifications
        WHERE recipient_id = $1 AND event_type = 'booking.room_deactivated' AND related_entity_id = $2`,
      [IDS.student1, booking.id],
    );
    expect(special).toHaveLength(1);
    expect(special[0]?.body).toContain("sudah disetujui");
    expect(special[0]?.body).toContain("tidak dapat dibatalkan langsung");
    expect(special[0]?.body).toContain("Rekomendasi ruangan pengganti");
  });
});
