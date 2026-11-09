import { beforeEach, describe, expect, it } from "vitest";
import { createBookingRequest, type BookingInput } from "@/lib/bookings";
import { decideBooking } from "@/lib/approvals";
import { cancelPendingBooking } from "@/lib/cancellations";
import { downloadInternalMemo, generateInternalMemo } from "@/lib/memos";
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
    activityName: "Seminar Pembatalan",
    activityPurpose: "Menguji pembatalan booking dan pembuatan Internal Memo.",
    activityType: "seminar",
    participantCount: 30,
    requiredFacilities: ["ac", "wifi"],
    roomId: IDS.roomB,
    date: TEST_DATE,
    startTime: "10:00",
    endTime: "12:00",
    ...overrides,
  };
}

async function approvedBooking() {
  const { booking } = await createBookingRequest(input(), student1);
  const result = await decideBooking({ bookingId: booking.id, action: "approve" }, academicUser);
  return result.booking;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("pending cancellation", () => {
  it("releases the slot immediately when the requester cancels a pending request", async () => {
    const { booking } = await createBookingRequest(input(), student1);
    const availabilityBefore = await checkRoomAvailability({
      roomId: IDS.roomB,
      startAt: TEST_START,
      endAt: TEST_END,
    });
    expect(availabilityBefore.available).toBe(false);

    await cancelPendingBooking(
      booking.id,
      "Kegiatan tidak jadi dilaksanakan karena perubahan jadwal.",
      student1,
    );

    const row = await query<{
      status: string;
      slot_held: boolean;
      cancelled_at: Date | null;
      cancellation_reason: string | null;
    }>(
      "SELECT status, slot_held, cancelled_at, cancellation_reason FROM booking_requests WHERE id = $1",
      [booking.id],
    );
    expect(row[0]?.status).toBe("cancelled");
    expect(row[0]?.slot_held).toBe(false);
    expect(row[0]?.cancelled_at).toBeTruthy();
    expect(row[0]?.cancellation_reason).toContain("perubahan jadwal");

    const availabilityAfter = await checkRoomAvailability({
      roomId: IDS.roomB,
      startAt: TEST_START,
      endAt: TEST_END,
    });
    expect(availabilityAfter.available).toBe(true);
  });

  it("rejects cancellation after approval and for non-owners", async () => {
    const approved = await approvedBooking();
    await expect(
      cancelPendingBooking(approved.id, "Mencoba membatalkan setelah disetujui.", student1),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const approvedRow = await query<{ status: string; slot_held: boolean }>(
      "SELECT status, slot_held FROM booking_requests WHERE id = $1",
      [approved.id],
    );
    expect(approvedRow[0]).toEqual({ status: "approved", slot_held: true });

    const { booking: pending } = await createBookingRequest(
      input({ roomId: IDS.roomC, startTime: "13:00", endTime: "15:00" }),
      student1,
    );
    await expect(
      cancelPendingBooking(pending.id, "Bukan pemilik pengajuan.", student2),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const pendingRow = await query<{ status: string; slot_held: boolean }>(
      "SELECT status, slot_held FROM booking_requests WHERE id = $1",
      [pending.id],
    );
    expect(pendingRow[0]).toEqual({ status: "pending_academic", slot_held: true });
  });

  it("rejects a cancellation reason shorter than 5 characters", async () => {
    const { booking } = await createBookingRequest(input(), student1);
    await expect(cancelPendingBooking(booking.id, "no", student1)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});

describe("internal memo", () => {
  it("is only generated after approval and is downloadable by authorized users", async () => {
    const { booking } = await createBookingRequest(input(), student1);
    await expect(generateInternalMemo(booking.id, student1)).rejects.toMatchObject({
      code: "BUSINESS_RULE",
    });

    await decideBooking({ bookingId: booking.id, action: "approve" }, academicUser);
    const memo = await query<{ id: string; generation_status: string }>(
      "SELECT id, generation_status FROM internal_memos WHERE booking_id = $1",
      [booking.id],
    );
    expect(memo[0]?.generation_status).toBe("ready");

    const download = await downloadInternalMemo(memo[0].id, student1);
    expect(download.bytes.length).toBeGreaterThan(1000);
    expect(download.bytes.subarray(0, 4).toString()).toBe("%PDF");
    await expect(downloadInternalMemo(memo[0].id, student2)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("does not cancel an approval when the official template is missing, and supports retry", async () => {
    await setSettings({ memo_template_kind: "official", memo_official_template_path: null });
    const { booking } = await createBookingRequest(input(), student1);
    const result = await decideBooking(
      { bookingId: booking.id, action: "approve" },
      academicUser,
    );
    expect(result.booking.status).toBe("approved");
    expect(result.memoError).toBeTruthy();

    const failed = await query<{ generation_status: string; error_message: string | null }>(
      "SELECT generation_status, error_message FROM internal_memos WHERE booking_id = $1",
      [booking.id],
    );
    expect(failed[0]?.generation_status).toBe("failed");
    expect(failed[0]?.error_message).toBeTruthy();

    await setSettings({ memo_template_kind: "demo", memo_official_template_path: null });
    const retried = await generateInternalMemo(booking.id, academicUser);
    expect(retried.generationStatus).toBe("ready");

    const status = await query<{ status: string }>(
      "SELECT status FROM booking_requests WHERE id = $1",
      [booking.id],
    );
    expect(status[0]?.status).toBe("approved");
  });
});
