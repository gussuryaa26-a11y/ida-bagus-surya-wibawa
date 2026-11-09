"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";

export function RoomStatusManager({
  roomId,
  roomName,
  isActive,
  statusNote,
  compact = false,
}: {
  roomId: string;
  roomName: string;
  isActive: boolean;
  statusNote: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const noteId = `room-status-note-${roomId}`;
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function updateStatus(
    nextActive: boolean,
    reason: string,
    setFailure: (message: string | null) => void,
  ) {
    setFailure(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/academic/rooms/${roomId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive, note: reason }),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Status ruangan gagal disimpan.");
      dialogRef.current?.close();
      setNote("");
      router.refresh();
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : "Status ruangan gagal disimpan.");
    } finally {
      setLoading(false);
    }
  }

  const controls = (
    <>
      {compact ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">Status ruangan</span>
          <Badge tone={isActive ? "success" : "danger"}>{isActive ? "Aktif" : "Nonaktif"}</Badge>
        </div>
      ) : null}

      {!compact && !isActive ? (
        <div className="rounded-xl bg-paper px-3 py-2.5 text-sm leading-relaxed text-ink-soft">
          <p className="text-xs font-semibold text-muted">Keterangan masalah</p>
          <p className="mt-1">{statusNote ?? "Tidak ada keterangan."}</p>
        </div>
      ) : null}

      {actionError ? <Alert tone="danger">{actionError}</Alert> : null}

      {isActive ? (
        <Button
          variant="danger"
          size="sm"
          className={compact ? "w-full" : undefined}
          onClick={() => {
            setActionError(null);
            setDialogError(null);
            setNote("");
            dialogRef.current?.showModal();
          }}
        >
          Nonaktifkan ruangan
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          className={compact ? "w-full" : undefined}
          disabled={loading}
          onClick={() => void updateStatus(true, "", setActionError)}
        >
          {loading ? "Mengaktifkan…" : "Aktifkan ruangan"}
        </Button>
      )}
    </>
  );

  const dialog = (
    <dialog
      ref={dialogRef}
      className="w-[min(92vw,32rem)] rounded-2xl border border-line bg-surface p-0 shadow-2xl backdrop:bg-ink/40"
    >
      <form
        className="p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void updateStatus(false, note, setDialogError);
        }}
      >
        <h2 className="font-display text-xl font-semibold text-ink">Nonaktifkan {roomName}?</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Ruangan akan ditandai tidak aktif dan tidak bisa dipilih untuk pengajuan baru. Pengajuan yang sudah disetujui
          tidak dibatalkan otomatis.
        </p>
        <div className="mt-4">
          <label htmlFor={noteId} className="field-label">
            Keterangan masalah <span className="text-danger-700">*</span>
          </label>
          <textarea
            id={noteId}
            className="field-input min-h-24"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            minLength={5}
            maxLength={500}
            required
            placeholder="Contoh: AC rusak dan menunggu perbaikan."
          />
          {dialogError ? (
            <p className="mt-2 rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700">{dialogError}</p>
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
            Batal
          </Button>
          <Button type="submit" variant="danger" size="sm" disabled={loading}>
            {loading ? "Menonaktifkan…" : "Nonaktifkan ruangan"}
          </Button>
        </div>
      </form>
    </dialog>
  );

  if (compact) {
    return (
      <>
        <div className="space-y-2">{controls}</div>
        {dialog}
      </>
    );
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Status operasional"
          description="Akademik dapat menonaktifkan ruangan yang bermasalah. Pengajuan baru akan ditolak selama ruangan nonaktif."
          action={<Badge tone={isActive ? "success" : "danger"}>{isActive ? "Aktif" : "Nonaktif"}</Badge>}
        />
        <div className="space-y-3 px-5 py-4">{controls}</div>
      </Card>
      {dialog}
    </>
  );
}
