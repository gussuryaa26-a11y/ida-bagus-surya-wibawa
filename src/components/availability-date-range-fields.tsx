"use client";

import { useEffect, useState } from "react";
import { GENERAL_BOOKING_HOURS } from "@/lib/booking-hours";
import { dateKeyInTimezone, timeKeyInTimezone } from "@/lib/operational-clock";

/**
 * Date/time fields for availability filters. The native min attributes stop the
 * picker from offering dates before today and times before "now" on today's date.
 */
export function AvailabilityDateRangeFields({
  timezone,
  initialDate,
  initialStartTime,
  initialEndTime,
  idPrefix,
  dateLabel = "Tanggal",
  startLabel = "Mulai",
  endLabel = "Selesai",
  dateWrapperClassName,
  timeWrapperClassName,
}: {
  timezone: string;
  initialDate: string;
  initialStartTime: string;
  initialEndTime: string;
  idPrefix: string;
  dateLabel?: string;
  startLabel?: string;
  endLabel?: string;
  dateWrapperClassName?: string;
  timeWrapperClassName?: string;
}) {
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const interval = window.setInterval(update, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const today = now ? dateKeyInTimezone(now, timezone) : undefined;
  const minTime = now && date === today ? timeKeyInTimezone(now, timezone) : undefined;
  const earliestStartTime =
    minTime && minTime > GENERAL_BOOKING_HOURS.openTime ? minTime : GENERAL_BOOKING_HOURS.openTime;

  return (
    <>
      <div className={dateWrapperClassName}>
        <label htmlFor={`${idPrefix}-date`} className="field-label">
          {dateLabel}
        </label>
        <input
          id={`${idPrefix}-date`}
          name="date"
          type="date"
          defaultValue={initialDate}
          min={today}
          onChange={(event) => setDate(event.target.value)}
          className="field-input"
        />
      </div>
      <div className={timeWrapperClassName}>
        <div>
          <label htmlFor={`${idPrefix}-startTime`} className="field-label">
            {startLabel}
          </label>
          <input
            id={`${idPrefix}-startTime`}
            name="startTime"
            type="time"
            defaultValue={initialStartTime}
            min={earliestStartTime}
            max={GENERAL_BOOKING_HOURS.closeTime}
            onChange={(event) => setStartTime(event.target.value)}
            className="field-input"
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-endTime`} className="field-label">
            {endLabel}
          </label>
          <input
            id={`${idPrefix}-endTime`}
            name="endTime"
            type="time"
            defaultValue={initialEndTime}
            min={startTime || minTime}
            max={GENERAL_BOOKING_HOURS.closeTime}
            className="field-input"
          />
        </div>
      </div>
    </>
  );
}
