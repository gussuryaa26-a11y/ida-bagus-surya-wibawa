import { beforeEach, describe, expect, it } from "vitest";
import { authenticate, hashPassword } from "@/lib/auth";
import { getBookingForUser, createBookingRequest, type BookingInput } from "@/lib/bookings";
import { decideBooking } from "@/lib/approvals";
import { listSecuritySchedule } from "@/lib/reports";
import { query } from "@/lib/db";
import {
  IDS,
  TEST_DATE,
  academicUser,
  resetDatabase,
  securityUser,
  student1,
} from "./fixtures";

const bookingInput: BookingInput = {
  activityName: "Kegiatan Keamanan",
  activityPurpose: "Menguji pembatasan data untuk petugas keamanan.",
  activityType: "seminar",
  participantCount: 20,
  requiredFacilities: ["ac"],
  roomId: IDS.roomB,
  date: TEST_DATE,
  startTime: "10:00",
  endTime: "12:00",
};

beforeEach(async () => {
  await resetDatabase();
});

describe("authentication", () => {
  it("rejects inactive accounts and invalid passwords", async () => {
    const passwordHash = await hashPassword("ValidPassword123");
    await query("UPDATE users SET password_hash = $2 WHERE id = $1", [IDS.student1, passwordHash]);
    const user = await authenticate("20240001", "ValidPassword123");
    expect(user.role).toBe("student");

    await expect(authenticate("20240001", "SalahPassword")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });

    await query("UPDATE users SET is_active = false WHERE id = $1", [IDS.student1]);
    await expect(authenticate("20240001", "ValidPassword123")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});

describe("least privilege", () => {
  it("limits security staff to operational fields", async () => {
    const { booking } = await createBookingRequest(bookingInput, student1);
    await decideBooking({ bookingId: booking.id, action: "approve" }, academicUser);

    const schedule = await listSecuritySchedule(TEST_DATE, TEST_DATE, "Asia/Makassar");
    expect(schedule).toHaveLength(1);
    expect(Object.keys(schedule[0]).sort()).toEqual(
      ["activity_name", "end_at", "id", "room_code", "room_name", "start_at", "status"].sort(),
    );
    expect(JSON.stringify(schedule)).not.toContain("Mahasiswa Satu");
    expect(await getBookingForUser(booking.id, securityUser)).toBeNull();
  });

  it("does not allow security staff to decide bookings", async () => {
    const { booking } = await createBookingRequest(bookingInput, student1);
    await expect(
      decideBooking({ bookingId: booking.id, action: "approve" }, securityUser),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("makes audit logs append-only", async () => {
    await query(
      `INSERT INTO audit_logs (actor_label, action, entity_type) VALUES ('test', 'test.action', 'test')`,
    );
    await expect(query("UPDATE audit_logs SET action = 'changed'")).rejects.toThrow(/append-only/);
    await expect(query("DELETE FROM audit_logs")).rejects.toThrow(/append-only/);
  });
});
