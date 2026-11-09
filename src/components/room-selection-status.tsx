import clsx from "clsx";
import type { RoomSelectionState, RoomSelectionTone } from "@/lib/room-selection";

const TONES: Record<RoomSelectionTone, string> = {
  success: "border-success-700/20 bg-success-100 text-success-700",
  warning: "border-accent-300 bg-warning-100 text-warning-700",
  danger: "border-danger-700/20 bg-danger-100 text-danger-700",
  neutral: "border-line-strong bg-paper text-ink-soft",
};

/**
 * Occupies the same slot as the room-selection button. Rendered instead of the
 * button, never alongside a disabled one, so the reason is always readable.
 */
export function RoomSelectionStatus({
  state,
  className,
}: {
  state: RoomSelectionState;
  className?: string;
}) {
  if (state.selectable) return null;

  return (
    <p
      className={clsx(
        "flex min-h-[2.125rem] w-full items-center justify-center rounded-full border px-3 py-1.5 text-center text-[0.8125rem] font-semibold leading-snug",
        TONES[state.tone],
        className,
      )}
    >
      {state.label}
    </p>
  );
}
