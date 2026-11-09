import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "accent" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-700 text-white hover:bg-brand-900 border border-brand-700 hover:border-brand-900 shadow-sm",
  secondary:
    "bg-surface text-ink border border-line-strong hover:border-brand-600 hover:text-brand-900",
  accent:
    "bg-accent-500 text-ink border border-accent-500 hover:bg-accent-600 hover:border-accent-600 shadow-sm",
  danger:
    "bg-danger-700 text-white border border-danger-700 hover:bg-danger-700/90 hover:border-danger-700/90",
  ghost: "bg-transparent text-ink-soft border border-transparent hover:bg-brand-50 hover:text-brand-900",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-[0.8125rem]",
  md: "px-4 py-2.5 text-sm",
  lg: "px-5 py-3 text-[0.9375rem]",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra?: string,
): string {
  return clsx(
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}
