import { describe, expect, it } from "vitest";
import {
  addOperationalMinutes,
  combineDateAndTime,
  defaultAvailabilityWindow,
  isOpenAt,
  isPastDateTime,
  operationalMinutesBetween,
  type ClockConfig,
} from "@/lib/operational-clock";

const timezone = "Asia/Makassar";

function config(overrides: Partial<ClockConfig["settings"]> = {}, holidays: string[] = []): ClockConfig {
  return {
    settings: {
      timezone,
      workdays: [1, 2, 3, 4, 5],
      openTime: "08:00",
      closeTime: "16:00",
      decisionTargetMinutes: 60,
      holdLimitMinutes: 180,
      revisionHoldPolicy: "release",
      revisionHoldMinutes: null,
      bookingBufferMinutes: 0,
      scheduleFreshnessDays: 120,
      requireFreshSchedule: true,
      requireOrgPosition: true,
      allowDemoRoomData: false,
      isConfirmed: false,
      ...overrides,
    },
    holidays: new Set(holidays),
    exceptions: new Map(),
  };
}

describe("operational clock", () => {
  it("stops at the end of the operational day and resumes next working day", () => {
    const friday = combineDateAndTime("2026-11-13", "15:00", timezone);
    const result = addOperationalMinutes(friday, 120, config());
    expect(result.toISOString()).toBe(combineDateAndTime("2026-11-16", "09:00", timezone).toISOString());
  });

  it("skips weekends", () => {
    const friday = combineDateAndTime("2026-11-13", "16:00", timezone);
    const result = addOperationalMinutes(friday, 60, config());
    expect(result.toISOString()).toBe(combineDateAndTime("2026-11-16", "09:00", timezone).toISOString());
  });

  it("skips configured holidays", () => {
    const friday = combineDateAndTime("2026-11-13", "15:00", timezone);
    const result = addOperationalMinutes(friday, 120, config({}, ["2026-11-16"]));
    expect(result.toISOString()).toBe(combineDateAndTime("2026-11-17", "09:00", timezone).toISOString());
  });

  it("handles submissions outside operational hours", () => {
    const mondayEvening = combineDateAndTime("2026-11-16", "17:00", timezone);
    const result = addOperationalMinutes(mondayEvening, 60, config());
    expect(result.toISOString()).toBe(combineDateAndTime("2026-11-17", "09:00", timezone).toISOString());
  });

  it("counts operational minutes only inside windows", () => {
    const friday15 = combineDateAndTime("2026-11-13", "15:00", timezone);
    const monday10 = combineDateAndTime("2026-11-16", "10:00", timezone);
    expect(operationalMinutesBetween(friday15, monday10, config())).toBe(180);
  });

  it("applies per-date exceptions and closures", () => {
    const monday = combineDateAndTime("2026-11-16", "09:00", timezone);
    const cfg = config();
    cfg.exceptions.set("2026-11-16", {
      isClosed: true,
      openTime: null,
      closeTime: null,
      description: "Tutup darurat",
    });
    expect(isOpenAt(monday, cfg)).toBe(false);
    expect(addOperationalMinutes(monday, 60, cfg).toISOString()).toBe(
      combineDateAndTime("2026-11-17", "09:00", timezone).toISOString(),
    );
  });

  it("uses end-exclusive bounds", () => {
    const start = combineDateAndTime("2026-11-16", "15:00", timezone);
    const end = combineDateAndTime("2026-11-16", "16:00", timezone);
    expect(operationalMinutesBetween(start, end, config())).toBe(60);
    expect(isOpenAt(end, config())).toBe(false);
  });

  it("detects dates and times that have already passed", () => {
    const now = combineDateAndTime("2026-10-27", "18:00", timezone);
    expect(isPastDateTime("2026-10-26", "17:00", timezone, now)).toBe(true);
    expect(isPastDateTime("2026-10-27", "17:00", timezone, now)).toBe(true);
    expect(isPastDateTime("2026-10-27", "18:00", timezone, now)).toBe(false);
    expect(isPastDateTime("2026-10-28", "08:00", timezone, now)).toBe(false);
  });

  it("defaults availability filters to a window that has not passed", () => {
    const midday = combineDateAndTime("2026-10-27", "12:30", timezone);
    expect(defaultAvailabilityWindow(midday, timezone, "08:00", "16:00")).toEqual({
      date: "2026-10-27",
      startTime: "12:31",
      endTime: "14:31",
    });

    const afterClose = combineDateAndTime("2026-10-27", "23:00", timezone);
    expect(defaultAvailabilityWindow(afterClose, timezone, "08:00", "16:00")).toEqual({
      date: "2026-10-28",
      startTime: "08:00",
      endTime: "10:00",
    });

    const justAfterOpen = new Date(combineDateAndTime("2026-10-27", "08:00", timezone).getTime() + 30_000);
    expect(defaultAvailabilityWindow(justAfterOpen, timezone, "08:00", "16:00")).toEqual({
      date: "2026-10-27",
      startTime: "08:01",
      endTime: "10:01",
    });
  });
});
