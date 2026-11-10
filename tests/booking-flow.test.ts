import { beforeEach, describe, expect, it } from "vitest";
import {
  createBookingRequest,
  getBookingForUser,
  resubmitBooking,
  type BookingInput,
} from "@/lib/bookings";
import { decideBooking } from "@/lib/approvals";
import { checkRoomAvailability } from "@/lib/availability";
import { listRoomAvailability } from "@/lib/recommendation";
import { AppError } from "@/lib/errors";
import { getBookingScheduleFieldErrors } from "@/lib/booking-hours";
import { addDaysToDateKey, combineDateAndTime } from "@/lib/operational-clock";
import { query } from "@/lib/db";
import {
  IDS,
  TEST_DATE,
  TEST_END,
  TEST_START,
  academicUser,
  adminUser,
  resetDatabase,
  setSettings,
  student1,
  student2,
} from "./fixtures";

function input(overrides: Partial<BookingInput> = {}): BookingInput {
  return {
    activityName: "Workshop Uji",
    activityPurpose: "Kegiatan pengujian alur peminjaman ruangan kampus.",
    activityType: "workshop",
    participantCount: 20,
    requiredFacilities: ["ac", "wifi"],
    roomId: IDS.roomA,
    date: TEST_DATE,
    startTime: "10:00",
    endTime: "12:00",
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("booking creation", () => {
  it("saves a valid request, holds the slot, and records deadlines", async () => {
    const { booking, reused } = await createBookingRequest(input(), student1);
    expect(reused).toBe(false);
    expect(booking.status).toBe("pending_academic");
    expect(booking.slotHeld).toBe(true);
    expect(booking.decisionTargetAt.getTime()).toBeGreaterThan(booking.submittedAt.getTime());
    expect(booking.holdExpiresAt.getTime()).toBeGreaterThan(booking.decisionTargetAt.getTime());

    const audit = await query<{ count: string }>(
      "SELECT count(*)::text AS count FROM audit_logs WHERE action = 'booking.submitted' AND entity_id = $1",
      [booking.id],
    );
    expect(Number(audit[0]?.count)).toBe(1);
  });

  it("rejects a request without an organization (no personal bookings)", async () => {
    await expect(
      createBookingRequest(input(), { ...student1, organizationId: null }),
    ).rejects.toMatchObject({ code: "BUSINESS_RULE" });
  });

  it("rejects when organization position is required but missing", async () => {
    await expect(
      createBookingRequest(input(), { ...student1, orgPosition: null }),
    ).rejects.toMatchObject({ code: "BUSINESS_RULE" });
  });

  it("allows exactly 100% capacity without a review flag", async () => {
    const { booking } = await createBookingRequest(input({ participantCount: 40 }), student1);
    expect(booking.status).toBe("pending_academic");
    expect(booking.capacityPercentageSnapshot).toBe(100);
    expect(booking.capacityReviewRequired).toBe(false);
  });

  it("allows 101–120% capacity with a warning and Academic review flag", async () => {
    const availability = await checkRoomAvailability({
      roomId: IDS.roomA,
      startAt: TEST_START,
      endAt: TEST_END,
      participantCount: 44,
    });
    expect(availability.available).toBe(true);
    expect(availability.capacity).toMatchObject({
      status: "warning",
      percentage: 110,
      requiresReview: true,
    });

    const { booking } = await createBookingRequest(input({ participantCount: 44 }), student1);
    expect(booking.status).toBe("pending_academic");
    expect(booking.decisionAt).toBeNull();
    expect(booking.capacityPercentageSnapshot).toBe(110);
    expect(booking.capacityReviewRequired).toBe(true);

    const atLimit = await createBookingRequest(
      input({ roomId: IDS.roomC, participantCount: 60 }),
      student2,
    );
    expect(atLimit.booking.capacityPercentageSnapshot).toBe(120);
    expect(atLimit.booking.capacityReviewRequired).toBe(true);
    expect(atLimit.booking.status).toBe("pending_academic");
  });

  it("rejects above 120% without creating a booking or holding the slot", async () => {
    await expect(createBookingRequest(input({ participantCount: 49 }), student1)).rejects.toMatchObject({
      code: "BUSINESS_RULE",
      details: { code: "capacity_insufficient" },
    });

    const rows = await query<{ count: string }>("SELECT count(*)::text AS count FROM booking_requests");
    expect(Number(rows[0]?.count)).toBe(0);

    const availability = await checkRoomAvailability({
      roomId: IDS.roomA,
      startAt: TEST_START,
      endAt: TEST_END,
      participantCount: 49,
    });
    expect(availability.available).toBe(false);
    expect(availability.code).toBe("capacity_insufficient");
    expect(availability.capacity).toMatchObject({
      status: "rejected",
      percentage: 122.5,
      allowed: false,
    });
  });

  it("flags a 101–120% revision and keeps it pending for Academic", async () => {
    const { booking } = await createBookingRequest(input({ participantCount: 20 }), student1);
    await decideBooking(
      { bookingId: booking.id, action: "request_revision", reason: "Lengkapi proposal kegiatan." },
      academicUser,
    );

    const revised = await resubmitBooking(booking.id, input({ participantCount: 44 }), student1);
    expect(revised.status).toBe("pending_academic");
    expect(revised.capacityPercentageSnapshot).toBe(110);
    expect(revised.capacityReviewRequired).toBe(true);
  });

  it("rejects an over-120% revision without changing the request", async () => {
    const { booking } = await createBookingRequest(input({ participantCount: 20 }), student1);
    await decideBooking(
      { bookingId: booking.id, action: "request_revision", reason: "Lengkapi proposal kegiatan." },
      academicUser,
    );

    await expect(
      resubmitBooking(booking.id, input({ participantCount: 49 }), student1),
    ).rejects.toMatchObject({
      code: "BUSINESS_RULE",
      details: { code: "capacity_insufficient" },
    });

    const row = await query<{ status: string; participant_count: number }>(
      "SELECT status, participant_count FROM booking_requests WHERE id = $1",
      [booking.id],
    );
    expect(row[0]).toEqual({ status: "revision_requested", participant_count: 20 });
  });

  it("rejects rooms without verified capacity", async () => {
    await expect(
      createBookingRequest(input({ roomId: IDS.roomUnverified, participantCount: 10 }), student1),
    ).rejects.toMatchObject({ code: "BUSINESS_RULE" });
  });

  it("rejects availability checks for dates that have already passed", async () => {
    await expect(
      listRoomAvailability({ date: "2020-01-01", startTime: "09:00", endTime: "10:00" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("blocks bookings that collide with official class schedules", async () => {
    await expect(
      createBookingRequest(input({ startTime: "08:30", endTime: "09:30" }), student1),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Terdapat perkuliahan (Kelas Uji) (pukul 08:00–10:00).",
    });
  });

  it("allows class-time bookings on a configured holiday", async () => {
    const holidayDate = await query<{ date: string }>(
      "SELECT period_start::text AS date FROM academic_calendar LIMIT 1",
    );
    const result = await createBookingRequest(
      input({ date: holidayDate[0].date, startTime: "08:30", endTime: "09:30", roomId: IDS.roomA }),
      student1,
    );
    expect(result.booking.status).toBe("pending_academic");
  });

  it("rejects requests when schedule data is stale", async () => {
    await query("UPDATE schedule_imports SET completed_at = now() - interval '200 days'");
    await expect(createBookingRequest(input({ roomId: IDS.roomB }), student1)).rejects.toMatchObject({
      code: "BUSINESS_RULE",
    });
  });

  it("is idempotent for the same idempotency key", async () => {
    const first = await createBookingRequest(input({ roomId: IDS.roomB }), student1, {
      idempotencyKey: "idem-1",
    });
    const second = await createBookingRequest(input({ roomId: IDS.roomB }), student1, {
      idempotencyKey: "idem-1",
    });
    expect(second.reused).toBe(true);
    expect(second.booking.id).toBe(first.booking.id);
    const rows = await query<{ count: string }>("SELECT count(*)::text AS count FROM booking_requests");
    expect(Number(rows[0]?.count)).toBe(1);
  });

  it("allows adjacent time ranges because end is exclusive", async () => {
    const first = await createBookingRequest(
      input({ roomId: IDS.roomB, startTime: "10:00", endTime: "11:00" }),
      student1,
    );
    const second = await createBookingRequest(
      input({ roomId: IDS.roomB, startTime: "11:00", endTime: "12:00" }),
      student2,
    );
    expect(first.booking.status).toBe("pending_academic");
    expect(second.booking.status).toBe("pending_academic");
  });

  it("honours the configured booking buffer", async () => {
    await setSettings({ booking_buffer_minutes: 15 });
    await createBookingRequest(input({ roomId: IDS.roomB, startTime: "10:00", endTime: "11:00" }), student1);
    await expect(
      createBookingRequest(input({ roomId: IDS.roomB, startTime: "11:00", endTime: "12:00" }), student2),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("prevents two concurrent requests from both succeeding", async () => {
    const results = await Promise.allSettled([
      createBookingRequest(input({ roomId: IDS.roomB }), student1),
      createBookingRequest(input({ roomId: IDS.roomB }), student2),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const rejectedResult = rejected[0] as PromiseRejectedResult;
    expect(rejectedResult.reason).toBeInstanceOf(AppError);
    expect((rejectedResult.reason as AppError).code).toBe("CONFLICT");
    const rows = await query<{ count: string }>("SELECT count(*)::text AS count FROM booking_requests");
    expect(Number(rows[0]?.count)).toBe(1);
  });

  it("reports availability accurately and releases nothing before a decision", async () => {
    await createBookingRequest(input({ roomId: IDS.roomB }), student1);
    const availability = await checkRoomAvailability({
      roomId: IDS.roomB,
      startAt: TEST_START,
      endAt: TEST_END,
    });
    expect(availability.available).toBe(false);
    expect(availability.code).toBe("booking_conflict");
  });
});

describe("booking hours", () => {
  const timezone = "Asia/Makassar";

  it("allows a general room exactly from 07:00 to 21:00", async () => {
    const openAt = combineDateAndTime(TEST_DATE, "07:00", timezone);
    const closeAt = combineDateAndTime(TEST_DATE, "21:00", timezone);
    const availability = await checkRoomAvailability({
      roomId: IDS.roomB,
      startAt: openAt,
      endAt: closeAt,
    });
    expect(availability.available).toBe(true);
  });

  it("rejects a general room one second before open or after close", async () => {
    const openAt = combineDateAndTime(TEST_DATE, "07:00", timezone);
    const closeAt = combineDateAndTime(TEST_DATE, "21:00", timezone);

    await expect(
      checkRoomAvailability({
        roomId: IDS.roomB,
        startAt: new Date(openAt.getTime() - 1_000),
        endAt: new Date(openAt.getTime() + 60 * 60 * 1_000),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    await expect(
      checkRoomAvailability({
        roomId: IDS.roomB,
        startAt: new Date(closeAt.getTime() - 60 * 60 * 1_000),
        endAt: new Date(closeAt.getTime() + 1_000),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("allows the incubator exactly until 20:00 and rejects one second after", async () => {
    const openAt = combineDateAndTime(TEST_DATE, "07:00", timezone);
    const closeAt = combineDateAndTime(TEST_DATE, "20:00", timezone);
    const allowed = await checkRoomAvailability({
      roomId: IDS.roomIncubator,
      startAt: openAt,
      endAt: closeAt,
      participantCount: 4,
    });
    expect(allowed.available).toBe(true);

    const tooLate = await checkRoomAvailability({
      roomId: IDS.roomIncubator,
      startAt: new Date(closeAt.getTime() - 60 * 60 * 1_000),
      endAt: new Date(closeAt.getTime() + 1_000),
      participantCount: 4,
    });
    expect(tooLate.available).toBe(false);
    expect(tooLate.code).toBe("outside_booking_hours");
  });

  it("rejects the incubator on a weekend", async () => {
    const saturday = addDaysToDateKey(TEST_DATE, 5);
    const startAt = combineDateAndTime(saturday, "10:00", timezone);
    const endAt = combineDateAndTime(saturday, "12:00", timezone);
    const availability = await checkRoomAvailability({
      roomId: IDS.roomIncubator,
      startAt,
      endAt,
      participantCount: 4,
    });
    expect(availability.available).toBe(false);
    expect(availability.code).toBe("outside_booking_hours");

    await expect(
      createBookingRequest(
        input({
          roomId: IDS.roomIncubator,
          date: saturday,
          startTime: "10:00",
          endTime: "12:00",
          participantCount: 4,
        }),
        student1,
      ),
    ).rejects.toMatchObject({ code: "BUSINESS_RULE", details: { code: "outside_booking_hours" } });
  });

  it("rejects create requests outside general hours", async () => {
    await expect(
      createBookingRequest(input({ startTime: "06:59", endTime: "08:00" }), student1),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      createBookingRequest(input({ startTime: "20:00", endTime: "21:01" }), student1),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects an incubator request after 20:00", async () => {
    await expect(
      createBookingRequest(
        input({ roomId: IDS.roomIncubator, startTime: "19:00", endTime: "20:01", participantCount: 4 }),
        student1,
      ),
    ).rejects.toMatchObject({ code: "BUSINESS_RULE", details: { code: "outside_booking_hours" } });
  });

  it("validates a past date during date selection and enforces the time window", () => {
    const now = combineDateAndTime("2026-11-11", "10:00", timezone);
    expect(
      getBookingScheduleFieldErrors(
        { date: "2026-11-10", startTime: "10:00", endTime: "12:00" },
        timezone,
        now,
      ),
    ).toMatchObject({ date: "Tanggal kegiatan tidak boleh sebelum hari ini." });

    expect(
      getBookingScheduleFieldErrors(
        { date: "2026-11-11", startTime: "06:59", endTime: "12:00" },
        timezone,
        now,
      ).time,
    ).toContain("07:00");

    expect(
      getBookingScheduleFieldErrors(
        { date: "2026-11-11", startTime: "10:00", endTime: "21:01" },
        timezone,
        now,
      ).time,
    ).toContain("21:00");
  });
});

describe("booking access control", () => {
  it("does not expose another student's request", async () => {
    const { booking } = await createBookingRequest(input(), student1);
    expect(await getBookingForUser(booking.id, student1)).not.toBeNull();
    expect(await getBookingForUser(booking.id, student2)).toBeNull();
    expect(await getBookingForUser(booking.id, academicUser)).not.toBeNull();
    expect(await getBookingForUser(booking.id, adminUser)).toBeNull();
  });
});
