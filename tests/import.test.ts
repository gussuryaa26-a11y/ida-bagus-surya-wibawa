import { beforeEach, describe, expect, it } from "vitest";
import { commitScheduleImport, previewScheduleImport } from "@/lib/schedule-import";
import { createBookingRequest, type BookingInput } from "@/lib/bookings";
import { decideBooking } from "@/lib/approvals";
import { addDaysToDateKey } from "@/lib/operational-clock";
import { query } from "@/lib/db";
import {
  IDS,
  TEST_DATE,
  academicUser,
  facilityUser,
  resetDatabase,
  student1,
} from "./fixtures";

const FROM = addDaysToDateKey(TEST_DATE, -30);
const UNTIL = addDaysToDateKey(TEST_DATE, 30);

function csv(rows: string[]): Buffer {
  return Buffer.from(
    [
      "room_code,day_of_week,start_time,end_time,effective_from,effective_until,semester_label,course_name",
      ...rows,
    ].join("\n"),
  );
}

const VALID = `B-201,Senin,13:00,15:00,${FROM},${UNTIL},Ganjil,Manajemen Proyek`;
const INVALID_ROOM = `X-999,Senin,13:00,15:00,${FROM},${UNTIL},Ganjil,Ruang Tidak Ada`;
const INVALID_TIME = `B-201,Senin,25:00,15:00,${FROM},${UNTIL},Ganjil,Waktu Salah`;

const bookingInput: BookingInput = {
  activityName: "Seminar Konflik Jadwal",
  activityPurpose: "Menguji deteksi konflik pasca-persetujuan setelah impor jadwal.",
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

describe("schedule import", () => {
  it("previews rows and reports per-row validation errors without writing", async () => {
    const preview = await previewScheduleImport("jadwal.csv", csv([VALID, INVALID_ROOM, INVALID_TIME]));
    expect(preview.totalRows).toBe(3);
    expect(preview.parsed).toHaveLength(1);
    expect(preview.issues).toHaveLength(2);
    const rows = await query<{ count: string }>("SELECT count(*)::text AS count FROM class_schedules");
    expect(Number(rows[0]?.count)).toBe(1);
  });

  it("commits valid rows and reports a partial import without damaging existing data", async () => {
    const result = await commitScheduleImport(
      {
        filename: "jadwal.csv",
        buffer: csv([VALID, INVALID_ROOM, INVALID_TIME]),
        source: "BAAK Test",
        sourceVersion: "v-test-1",
        strict: false,
      },
      facilityUser,
    );
    expect(result.status).toBe("partial");
    expect(result.successRows).toBe(1);
    expect(result.failedRows).toBe(2);

    const rows = await query<{ count: string }>("SELECT count(*)::text AS count FROM class_schedules");
    expect(Number(rows[0]?.count)).toBe(2);
    const history = await query<{ status: string; source: string }>(
      "SELECT status, source FROM schedule_imports WHERE id = $1",
      [result.importId],
    );
    expect(history[0]).toEqual({ status: "partial", source: "BAAK Test" });
  });

  it("rejects the whole import in strict mode when any row is invalid", async () => {
    await expect(
      commitScheduleImport(
        {
          filename: "jadwal.csv",
          buffer: csv([VALID, INVALID_ROOM]),
          source: "BAAK Test",
          sourceVersion: "v-test-2",
          strict: true,
        },
        facilityUser,
      ),
    ).rejects.toMatchObject({ code: "BUSINESS_RULE" });
    const rows = await query<{ count: string }>("SELECT count(*)::text AS count FROM class_schedules");
    expect(Number(rows[0]?.count)).toBe(1);
  });

  it("flags a post-approval conflict when a new class schedule overlaps a confirmed booking", async () => {
    const { booking } = await createBookingRequest(bookingInput, student1);
    await decideBooking({ bookingId: booking.id, action: "approve" }, academicUser);

    const conflicting = `B-201,Senin,10:00,12:00,${FROM},${UNTIL},Ganjil,Kelas Baru`;
    const result = await commitScheduleImport(
      {
        filename: "jadwal-baru.csv",
        buffer: csv([conflicting]),
        source: "BAAK Test",
        sourceVersion: "v-test-3",
        strict: false,
      },
      facilityUser,
    );
    expect(result.conflictsDetected).toBe(1);

    const conflicts = await query<{ conflict_type: string; source_change: string }>(
      "SELECT conflict_type, source_change FROM post_approval_conflicts WHERE booking_id = $1",
      [booking.id],
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.conflict_type).toBe("class_schedule");

    const status = await query<{ status: string }>(
      "SELECT status FROM booking_requests WHERE id = $1",
      [booking.id],
    );
    expect(status[0]?.status).toBe("approved");
  });
});
