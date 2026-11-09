"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button, type ButtonVariant } from "./button";

export function ConfirmButton({
  children,
  title,
  description,
  confirmLabel = "Konfirmasi",
  variant = "primary",
  onConfirm,
  disabled,
}: {
  children: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  variant?: ButtonVariant;
  onConfirm: () => Promise<void> | void;
  disabled?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button variant={variant} onClick={() => dialogRef.current?.showModal()} disabled={disabled}>
        {children}
      </Button>
      <dialog
        ref={dialogRef}
        className="w-[min(92vw,30rem)] rounded-2xl border border-line bg-surface p-0 shadow-2xl backdrop:bg-ink/40"
        onClose={() => {
          setError(null);
          setLoading(false);
        }}
      >
        <div className="p-6">
          <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
          {description ? <div className="mt-2 text-sm leading-relaxed text-muted">{description}</div> : null}
          {error ? <p className="mt-3 rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700">{error}</p> : null}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => dialogRef.current?.close()} disabled={loading}>
              Batal
            </Button>
            <Button
              variant={variant}
              size="sm"
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                setError(null);
                try {
                  await onConfirm();
                  dialogRef.current?.close();
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "Tindakan gagal.");
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? "Memproses…" : confirmLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
