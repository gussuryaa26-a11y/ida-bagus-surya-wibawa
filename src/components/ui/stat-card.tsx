import clsx from "clsx";
import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "brand" | "accent" | "danger" | "success";
}) {
  const tones: Record<string, string> = {
    default: "bg-surface text-ink",
    brand: "bg-brand-900 text-white",
    accent: "bg-accent-100 text-ink",
    danger: "bg-danger-100 text-danger-700",
    success: "bg-success-100 text-success-700",
  };
  return (
    <div className={clsx("rounded-card border border-line p-5 shadow-sm", tones[tone])}>
      <div className="flex items-start justify-between gap-3">
        <p
          className={clsx(
            "text-[0.72rem] font-bold uppercase tracking-[0.1em]",
            tone === "brand" ? "text-brand-100" : "text-muted",
          )}
        >
          {label}
        </p>
        {icon ? <span className={tone === "brand" ? "text-brand-100" : "text-brand-600"}>{icon}</span> : null}
      </div>
      <p className="mt-3 font-display text-3xl font-semibold leading-none">{value}</p>
      {hint ? (
        <p className={clsx("mt-2 text-xs leading-relaxed", tone === "brand" ? "text-brand-100/90" : "text-muted")}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
