import clsx from "clsx";
import type { ReactNode } from "react";

export function Alert({
  children,
  tone = "info",
  title,
  className,
}: {
  children?: ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
  title?: ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    info: "border-brand-200 bg-brand-50 text-brand-900",
    success: "border-success-700/20 bg-success-100 text-success-700",
    warning: "border-accent-300 bg-warning-100 text-warning-700",
    danger: "border-danger-700/20 bg-danger-100 text-danger-700",
  };
  return (
    <div className={clsx("rounded-xl border px-4 py-3 text-sm leading-relaxed", tones[tone], className)} role="status">
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : undefined}>{children}</div> : null}
    </div>
  );
}
