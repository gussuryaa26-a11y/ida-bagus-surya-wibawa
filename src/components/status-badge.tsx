import clsx from "clsx";
import { STATUS_LABELS, STATUS_TONES } from "@/lib/format";
import type { BookingStatus } from "@/lib/types";

export function StatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.72rem] font-semibold leading-5",
        STATUS_TONES[status],
        className,
      )}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </span>
  );
}
