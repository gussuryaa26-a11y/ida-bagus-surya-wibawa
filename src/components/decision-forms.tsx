"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type DecisionAction = "approve" | "reject" | "request_revision";

const ACTIONS: Array<{
  value: DecisionAction;
  label: string;
  description: string;
  icon: React.ReactNode;
  tone: string;
}> = [
  {
    value: "approve",
    label: "Setujui",
    description: "Booking terkonfirmasi, slot dipertahankan, memo dibuat.",
    icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
    tone: "border-success-700/30 bg-success-100 text-success-700",
  },
  {
    value: "reject",
    label: "Tolak",
    description: "Slot dilepas setelah keputusan tersimpan.",
    icon: <XCircle className="h-4 w-4" aria-hidden="true" />,
    tone: "border-danger-700/20 bg-danger-100 text-danger-700",
  },
  {
    value: "request_revision",
    label: "Minta revisi",
    description: "Pemohon memperbaiki pengajuan. Slot mengikuti kebijakan revisi.",
    icon: <RotateCcw className="h-4 w-4" aria-hidden="true" />,
    tone: "border-accent-300 bg-accent-100 text-accent-700",
  },
];

export function BookingDecisionForm({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<DecisionAction>("approve");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requiresReason = action !== "approve";

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="field-label">Keputusan</legend>
        <div className="space-y-2">
          {ACTIONS.map((item) => (
            <label
              key={item.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                action === item.value ? item.tone : "border-line bg-surface text-ink-soft"
              }`}
            >
              <input
                type="radio"
                name="decision"
                value={item.value}
                checked={action === item.value}
                onChange={() => setAction(item.value)}
                className="mt-0.5 h-4 w-4 accent-[var(--color-brand-700)]"
              />
              <span>
                <span className="flex items-center gap-1.5 font-semibold">
                  {item.icon}
                  {item.label}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed opacity-80">{item.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="decision-reason" className="field-label">
          Catatan {requiresReason ? <span className="text-danger-700">* wajib</span> : "(opsional)"}
        </label>
        <textarea
          id="decision-reason"
          className="field-input min-h-24"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={2000}
          placeholder={requiresReason ? "Alasan penolakan/revisi yang jelas untuk pemohon." : "Catatan tambahan bila perlu."}
        />
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <Button
        className="w-full"
        variant={action === "reject" ? "danger" : "primary"}
        onClick={() => {
          setError(null);
          setNotice(null);
          if (requiresReason && reason.trim().length < 5) {
            setError("Alasan wajib diisi minimal 5 karakter untuk penolakan atau permintaan revisi.");
            return;
          }
          dialogRef.current?.showModal();
        }}
      >
        Tinjau & simpan keputusan
      </Button>

      <dialog
        ref={dialogRef}
        className="w-[min(92vw,32rem)] rounded-2xl border border-line bg-surface p-0 shadow-2xl backdrop:bg-ink/40"
      >
        <div className="p-6">
          <h2 className="font-display text-xl font-semibold text-ink">Konfirmasi keputusan</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Keputusan{" "}
            <strong className="text-ink">
              {ACTIONS.find((item) => item.value === action)?.label}
            </strong>{" "}
            akan disimpan dengan identitas Anda dan waktu server. Server memeriksa ulang status terbaru sebelum menyimpan.
          </p>
          {requiresReason ? (
            <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-sm text-ink-soft">Catatan: {reason}</p>
          ) : null}
          {error ? <Alert tone="danger" className="mt-3">{error}</Alert> : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => dialogRef.current?.close()} disabled={loading}>
              Batal
            </Button>
            <Button
              variant={action === "reject" ? "danger" : "primary"}
              size="sm"
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                setError(null);
                try {
                  const response = await fetch(`/api/booking-requests/${bookingId}/decision`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action, reason }),
                  });
                  const payload = (await response.json()) as {
                    error?: { message?: string };
                    memoError?: string | null;
                  };
                  if (!response.ok) throw new Error(payload.error?.message ?? "Keputusan gagal disimpan.");
                  dialogRef.current?.close();
                  setNotice(
                    payload.memoError
                      ? `Keputusan tersimpan. Namun memo gagal dibuat: ${payload.memoError}. Booking tidak dibatalkan.`
                      : "Keputusan berhasil disimpan.",
                  );
                  router.refresh();
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "Keputusan gagal disimpan.");
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? "Menyimpan…" : "Ya, simpan keputusan"}
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
