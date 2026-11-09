import { beforeEach, describe, expect, it } from "vitest";
import { createBookingRequest, resubmitBooking, type BookingInput } from "@/lib/bookings";
import { decideBooking } from "@/lib/approvals";
import { runDeadlineJob } from "@/lib/deadlines";
import { checkRoomAvailability } from "@/lib/availability";
import { query } from "@/lib/db";
import {
  IDS,
  TEST_DATE,
  TEST_END,
  TEST_START,
  academicUser,
  resetDatabase,
  setSettings,
  student1,
  student2,
} from "./fixtures";

function input(overrides: Partial<BookingInput> = {}): BookingInput {
  return {
    activityName: "Kegiatan Keputusan",
    activityPurpose: "Menguji keputusan Akademik, revisi, dan kedaluwarsa slot.",
    activityType: "seminar",
    participantCount: 20,
    requiredFacilities: ["ac"],
    roomId: IDS.roomB,
    date: TEST_DATE,
    startTime: "10:00",
    endTime: "12:00",
    ...overrides,
  };
}

async function ageSubmission(bookingId: string, days = 4) {
  await query(
    `UPDATE booking_requests SET
       submitted_at = now() - ($2 || ' days')::interval,
       decision_target_at = now() - ($2 || ' days')::interval,
       hold_expires_at = now() - ($2 || ' days')::interval
     WHERE id = $1`,
    [bookingId, String(days)],
  );
}

beforeEach(async () => {
  await resetDatabase();
});

describe("academic decisions", () => {
  it("only allows the academic role to decide", async () => {
    const { booking } = await createBookingRequest(input(), student1);
    await expect(
      decideBooking({ bookingId: booking.id, action: "approve" }, student1),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      decideBooking({ bookingId: booking.id, action: "approve" }, { ...academicUser, role: "admin_it" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("approves once, writes decision metadata, and creates a memo", async () => {
    const { booking } = await createBookingRequest(input(), student1);
    const result = await decideBooking(
      { bookingId: booking.id, action: "approve", reason: "Sesuai jadwal." },
      academicUser,
    );
    expect(result.booking.status).toBe("approved");
    expect(result.booking.slotHeld).toBe(true);
    expect(result.booking.decisionBy).toBe(IDS.academic);
    expect(result.memoError).toBeNull();

    const memos = await query<{ generation_status: string }>(
      "SELECT generation_status FROM internal_memos WHERE booking_id = $1",
      [booking.id],
    );
    expect(memos[0]?.generation_status).toBe("ready");

    await expect(
      decideBooking({ bookingId: booking.id, action: "reject", reason: "Ubah keputusan" }, academicUser),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("releases the slot only after a rejection is stored", async () => {
    const { booking } = await createBookingRequest(input(), student1);
    await decideBooking(
      { bookingId: booking.id, action: "reject", reason: "Ruangan dialihkan untuk kegiatan lain." },
      academicUser,
    );
    const availability = await checkRoomAvailability({
      roomId: IDS.roomB,
      startAt: TEST_START,
      endAt: TEST_END,
    });
    expect(availability.available).toBe(true);
  });

  it("requires a reason for rejection and revision", async () => {
    const { booking } = await createBookingRequest(input(), student1);
    await expect(
      decideBooking({ bookingId: booking.id, action: "reject", reason: "" }, academicUser),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      decideBooking({ bookingId: booking.id, action: "request_revision", reason: "" }, academicUser),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("releases the slot when revision is requested under the release policy", async () => {
    const { booking } = await createBookingRequest(input(), student1);
    const result = await decideBooking(
      { bookingId: booking.id, action: "request_revision", reason: "Lengkapi tujuan kegiatan." },
      academicUser,
    );
    expect(result.booking.status).toBe("revision_requested");
    expect(result.booking.slotHeld).toBe(false);
    const availability = await checkRoomAvailability({
      roomId: IDS.roomB,
      startAt: TEST_START,
      endAt: TEST_END,
    });
    expect(availability.available).toBe(true);
  });

  it("expires a limited revision hold according to the configured policy", async () => {
    await setSettings({ revision_hold_policy: "hold_limited", revision_hold_minutes: 30 });
    const { booking } = await createBookingRequest(input(), student1);
    const revised = await decideBooking(
      { bookingId: booking.id, action: "request_revision", reason: "Lengkapi proposal kegiatan." },
      academicUser,
    );
    expect(revised.booking.slotHeld).toBe(true);
    expect(revised.booking.revisionDeadlineAt).not.toBeNull();

    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const result = await runDeadlineJob({ now: future });
    expect(result.expired).toBeGreaterThanOrEqual(1);
    const row = await query<{ status: string; slot_held: boolean }>(
      "SELECT status, slot_held FROM booking_requests WHERE id = $1",
      [booking.id],
    );
    expect(row[0]).toEqual({ status: "expired", slot_held: false });
  });

  it("lets the owner resubmit a revision and re-holds the slot", async () => {
    const { booking } = await createBookingRequest(input(), student1);
    await decideBooking(
      { bookingId: booking.id, action: "request_revision", reason: "Tambahkan detail peserta." },
      academicUser,
    );
    const updated = await resubmitBooking(booking.id, input({ participantCount: 30 }), student1);
    expect(updated.status).toBe("pending_academic");
    expect(updated.slotHeld).toBe(true);
    expect(updated.version).toBeGreaterThan(booking.version);
    await expect(resubmitBooking(booking.id, input(), student2)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("deadline job", () => {
  it("expires a pending request after the hold limit and is idempotent", async () => {
    const { booking } = await createBookingRequest(input(), student1);
    await ageSubmission(booking.id);

    const first = await runDeadlineJob();
    expect(first.expired).toBe(1);
    const row = await query<{ status: string; slot_held: boolean }>(
      "SELECT status, slot_held FROM booking_requests WHERE id = $1",
      [booking.id],
    );
    expect(row[0]).toEqual({ status: "expired", slot_held: false });

    const second = await runDeadlineJob();
    expect(second.expired).toBe(0);

    const audit = await query<{ count: string }>(
      "SELECT count(*)::text AS count FROM audit_logs WHERE action = 'booking.expired' AND entity_id = $1",
      [booking.id],
    );
    expect(Number(audit[0]?.count)).toBe(1);

    await expect(
      decideBooking({ bookingId: booking.id, action: "approve" }, academicUser),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("sends the one-hour reminder only once when the hold limit remains", async () => {
    await setSettings({ hold_limit_minutes: 10_000 });
    const { booking } = await createBookingRequest(input(), student1);
    await query(
      `UPDATE booking_requests SET submitted_at = now() - interval '2 days' WHERE id = $1`,
      [booking.id],
    );
    const first = await runDeadlineJob();
    expect(first.reminded).toBe(1);
    expect(first.expired).toBe(0);
    const second = await runDeadlineJob();
    expect(second.reminded).toBe(0);
  });

  it("never overwrites a stored decision when expiry runs concurrently", async () => {
    const { booking } = await createBookingRequest(input(), student1);
    await ageSubmission(booking.id, 5);

    const results = await Promise.allSettled([
      decideBooking({ bookingId: booking.id, action: "approve", reason: "Disetujui." }, academicUser),
      runDeadlineJob(),
    ]);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);

    const row = await query<{
      status: string;
      slot_held: boolean;
      decision_by: string | null;
    }>("SELECT status, slot_held, decision_by FROM booking_requests WHERE id = $1", [booking.id]);
    if (row[0].status === "approved") {
      expect(row[0].slot_held).toBe(true);
      expect(row[0].decision_by).toBe(IDS.academic);
    } else {
      expect(row[0].status).toBe("expired");
      expect(row[0].slot_held).toBe(false);
    }

    const decisionAudits = await query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_logs
        WHERE entity_id = $1 AND action IN ('booking.approve', 'booking.expired')`,
      [booking.id],
    );
    expect(Number(decisionAudits[0]?.count)).toBe(1);
  });
});
