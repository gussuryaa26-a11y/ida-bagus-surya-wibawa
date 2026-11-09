"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CancelPendingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => dialogRef.current?.showModal()}>
        Batalkan pengajuan
      </Button>
      <dialog
        ref={dialogRef}
        className="w-[min(92vw,32rem)] rounded-2xl border border-line bg-surface p-0 shadow-2xl backdrop:bg-ink/40"
      >
        <form
          className="p-6"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setLoading(true);
            try {
              const response = await fetch(`/api/bookings/${bookingId}/cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason }),
              });
              const payload = (await response.json()) as { error?: { message?: string } };
              if (!response.ok) throw new Error(payload.error?.message ?? "Pengajuan gagal dibatalkan.");
              dialogRef.current?.close();
              router.refresh();
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Pengajuan gagal dibatalkan.");
            } finally {
              setLoading(false);
            }
          }}
        >
          <h2 className="font-display text-xl font-semibold text-ink">Batalkan pengajuan?</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Pengajuan akan dibatalkan dan slot ruangan langsung dilepas. Tindakan ini tidak dapat dibatalkan.
          </p>
          <div className="mt-4">
            <label htmlFor="cancel-reason" className="field-label">
              Alasan pembatalan <span className="text-danger-700">*</span>
            </label>
            <textarea
              id="cancel-reason"
              className="field-input min-h-24"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={5}
              maxLength={2000}
              required
              placeholder="Jelaskan alasan pembatalan secara singkat dan jelas."
            />
            {error ? (
              <p className="mt-2 rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700">{error}</p>
            ) : null}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              autoFocus
              onClick={() => dialogRef.current?.close()}
              disabled={loading}
            >
              Pertahankan pengajuan
            </Button>
            <Button type="submit" variant="danger" size="sm" disabled={loading}>
              {loading ? "Membatalkan…" : "Ya, batalkan pengajuan"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
