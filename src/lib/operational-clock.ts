import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export type RevisionHoldPolicy = "release" | "hold_limited";

export type OpsSettings = {
  timezone: string;
  workdays: number[];
  openTime: string;
  closeTime: string;
  decisionTargetMinutes: number;
  holdLimitMinutes: number;
  revisionHoldPolicy: RevisionHoldPolicy;
  revisionHoldMinutes: number | null;
  bookingBufferMinutes: number;
  scheduleFreshnessDays: number;
  requireFreshSchedule: boolean;
  requireOrgPosition: boolean;
  allowDemoRoomData: boolean;
  isConfirmed: boolean;
};

export type DayException = {
  isClosed: boolean;
  openTime: string | null;
  closeTime: string | null;
  description: string;
};

export type ClockConfig = {
  settings: OpsSettings;
  /** Local dates (campus timezone) that are non-operational (holidays/breaks). */
  holidays: Set<string>;
  exceptions: Map<string, DayException>;
};

export type OperationalWindow = {
  date: string;
  start: Date;
  end: Date;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function normalizeTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value.trim());
  if (!match) throw new Error(`Format waktu tidak valid: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Format waktu tidak valid: ${value}`);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function isValidDateKey(value: string): boolean {
  return DATE_RE.test(value);
}

export function isValidTimeKey(value: string): boolean {
  return TIME_RE.test(value);
}

export function dateKeyInTimezone(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "yyyy-MM-dd");
}

export function timeKeyInTimezone(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "HH:mm");
}

export function combineDateAndTime(dateKey: string, timeKey: string, timezone: string): Date {
  if (!isValidDateKey(dateKey)) throw new Error(`Tanggal tidak valid: ${dateKey}`);
  if (!isValidTimeKey(timeKey)) throw new Error(`Waktu tidak valid: ${timeKey}`);
  return fromZonedTime(`${dateKey}T${timeKey}:00`, timezone);
}

/** True when the given campus-local date/time is earlier than the reference time. */
export function isPastDateTime(
  dateKey: string,
  timeKey: string,
  timezone: string,
  now: Date = new Date(),
): boolean {
  return combineDateAndTime(dateKey, timeKey, timezone).getTime() < now.getTime();
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * Default availability filter window that is never in the past.
 * Uses today's remaining operational window, or tomorrow when today is closed.
 */
export function defaultAvailabilityWindow(
  now: Date,
  timezone: string,
  openTime: string,
  closeTime: string,
): { date: string; startTime: string; endTime: string } {
  const today = dateKeyInTimezone(now, timezone);
  // Start at least one minute ahead so the default never becomes "past" while
  // the availability query is still running.
  const nextMinute = new Date(now.getTime() + 60_000);
  const openAtToday = combineDateAndTime(today, openTime, timezone);
  const closeAtToday = combineDateAndTime(today, closeTime, timezone);
  const startAtToday = new Date(Math.max(nextMinute.getTime(), openAtToday.getTime()));
  const useToday = startAtToday.getTime() < closeAtToday.getTime();
  const date = useToday ? today : addDaysToDateKey(today, 1);
  const startAt = useToday ? startAtToday : combineDateAndTime(date, openTime, timezone);
  const closeAt = useToday ? closeAtToday : combineDateAndTime(date, closeTime, timezone);
  const endAt = new Date(Math.min(startAt.getTime() + 2 * 60 * 60 * 1000, closeAt.getTime()));
  return {
    date,
    startTime: timeKeyInTimezone(startAt, timezone),
    endTime: timeKeyInTimezone(endAt, timezone),
  };
}

function isoWeekday(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dayOfWeek === 0 ? 7 : dayOfWeek;
}

export function getWindowForDate(dateKey: string, config: ClockConfig): OperationalWindow | null {
  const exception = config.exceptions.get(dateKey);
  if (exception) {
    if (exception.isClosed) return null;
    if (exception.openTime && exception.closeTime) {
      return {
        date: dateKey,
        start: combineDateAndTime(dateKey, exception.openTime, config.settings.timezone),
        end: combineDateAndTime(dateKey, exception.closeTime, config.settings.timezone),
      };
    }
  }

  if (config.holidays.has(dateKey)) return null;
  if (!config.settings.workdays.includes(isoWeekday(dateKey))) return null;

  const { openTime, closeTime, timezone } = config.settings;
  const start = combineDateAndTime(dateKey, openTime, timezone);
  const end = combineDateAndTime(dateKey, closeTime, timezone);
  if (end <= start) return null;
  return { date: dateKey, start, end };
}

function findWindowAtOrAfter(
  anchor: Date,
  config: ClockConfig,
  maxDays = 400,
): OperationalWindow | null {
  let dateKey = dateKeyInTimezone(anchor, config.settings.timezone);
  for (let i = 0; i < maxDays; i += 1) {
    const window = getWindowForDate(dateKey, config);
    if (window && window.end > anchor) {
      return {
        date: dateKey,
        start: window.start < anchor ? anchor : window.start,
        end: window.end,
      };
    }
    dateKey = addDaysToDateKey(dateKey, 1);
  }
  return null;
}

/**
 * Adds operational minutes to an anchor timestamp, skipping time outside
 * operational hours, weekends, holidays, and closed exceptions.
 */
export function addOperationalMinutes(
  anchor: Date,
  minutes: number,
  config: ClockConfig,
): Date {
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new Error("Durasi operational clock tidak valid.");
  }
  let remaining = minutes;
  let cursor = new Date(anchor.getTime());
  let window = findWindowAtOrAfter(cursor, config);

  while (window) {
    const start = cursor > window.start ? cursor : window.start;
    const availableMs = window.end.getTime() - start.getTime();
    if (availableMs <= 0) {
      cursor = window.end;
      window = findWindowAtOrAfter(cursor, config);
      continue;
    }
    const availableMinutes = availableMs / 60_000;
    if (remaining <= availableMinutes) {
      return new Date(start.getTime() + remaining * 60_000);
    }
    remaining -= availableMinutes;
    cursor = window.end;
    window = findWindowAtOrAfter(cursor, config);
  }

  throw new Error(
    "Tidak dapat menghitung waktu operasional: tidak ada jam operasional dalam horizon konfigurasi.",
  );
}

/**
 * Returns the number of operational minutes between two timestamps.
 * Returns 0 when end <= start.
 */
export function operationalMinutesBetween(start: Date, end: Date, config: ClockConfig): number {
  if (end.getTime() <= start.getTime()) return 0;
  let total = 0;
  let dateKey = dateKeyInTimezone(start, config.settings.timezone);
  const endDateKey = dateKeyInTimezone(end, config.settings.timezone);
  let guard = 0;
  while (dateKey <= endDateKey && guard < 3_660) {
    const window = getWindowForDate(dateKey, config);
    if (window) {
      const overlapStart = Math.max(start.getTime(), window.start.getTime());
      const overlapEnd = Math.min(end.getTime(), window.end.getTime());
      if (overlapEnd > overlapStart) total += (overlapEnd - overlapStart) / 60_000;
    }
    dateKey = addDaysToDateKey(dateKey, 1);
    guard += 1;
  }
  return total;
}

export function isOpenAt(timestamp: Date, config: ClockConfig): boolean {
  const window = getWindowForDate(dateKeyInTimezone(timestamp, config.settings.timezone), config);
  if (!window) return false;
  return timestamp >= window.start && timestamp < window.end;
}

export function nextOpeningAt(timestamp: Date, config: ClockConfig): Date | null {
  const window = findWindowAtOrAfter(timestamp, config);
  return window ? window.start : null;
}

export function validateClockConfig(config: ClockConfig): void {
  const { workdays, openTime, closeTime, timezone } = config.settings;
  if (!Array.isArray(workdays) || workdays.length === 0) {
    throw new Error("Minimal satu hari kerja operasional harus dipilih.");
  }
  if (workdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
    throw new Error("Hari kerja operasional tidak valid.");
  }
  normalizeTime(openTime);
  normalizeTime(closeTime);
  if (openTime >= closeTime) {
    throw new Error("Jam tutup operasional harus lebih lambat dari jam buka.");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error("Zona waktu tidak valid.");
  }
}
