import clsx from "clsx";
import type { ReactNode } from "react";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "accent" | "success" | "warning" | "danger";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-line/50 text-ink-soft border-line-strong",
    brand: "bg-brand-50 text-brand-900 border-brand-200",
    accent: "bg-accent-100 text-accent-700 border-accent-300",
    success: "bg-success-100 text-success-700 border-success-700/20",
    warning: "bg-warning-100 text-warning-700 border-accent-300",
    danger: "bg-danger-100 text-danger-700 border-danger-700/20",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.72rem] font-semibold leading-5",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
