"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { RESTRICTION_LABELS } from "@/lib/format";

export type RestrictionRow = {
  id: string;
  roomName: string;
  roomCode: string;
  startLabel: string;
  endLabel: string;
  type: "closure" | "maintenance" | "restriction";
  reason: string;
};

export function RestrictionManager({
  rooms,
  restrictions,
  defaultDate,
}: {
  rooms: Array<{ id: string; name: string; code: string }>;
  restrictions: RestrictionRow[];
  defaultDate: string;
}) {
  const router = useRouter();
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [type, setType] = useState<"closure" | "maintenance" | "restriction">("maintenance");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <form
        className="card-surface p-5"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          setNotice(null);
          setLoading(true);
          try {
            const response = await fetch("/api/admin/restrictions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ roomId, date, startTime, endTime, restrictionType: type, reason }),
            });
            const payload = (await response.json()) as {
              error?: { message?: string };
              conflictsDetected?: number;
            };
            if (!response.ok) throw new Error(payload.error?.message ?? "Gagal menyimpan pembatasan.");
            setNotice(
              payload.conflictsDetected
                ? `Pembatasan tersimpan. ${payload.conflictsDetected} konflik pasca-persetujuan ditandai dan Akademik diberi notifikasi.`
                : "Pembatasan tersimpan.",
            );
            setReason("");
            router.refresh();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Gagal menyimpan pembatasan.");
          } finally {
            setLoading(false);
          }
        }}
      >
        <h3 className="font-display text-lg font-semibold text-ink">Tambah penutupan/pembatasan</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Perubahan yang berbenturan dengan booking terkonfirmasi akan ditandai sebagai konflik pasca-persetujuan. Sistem
          tidak membatalkan booking otomatis.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="restriction-room" className="field-label">Ruangan</label>
            <select
              id="restriction-room"
              className="field-input"
              value={roomId}
              onChange={(event) => setRoomId(event.target.value)}
              required
            >
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name} ({room.code})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label htmlFor="restriction-date" className="field-label">Tanggal</label>
              <input
                id="restriction-date"
                type="date"
                className="field-input"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="restriction-start" className="field-label">Mulai</label>
              <input
                id="restriction-start"
                type="time"
                className="field-input"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="restriction-end" className="field-label">Selesai</label>
              <input
                id="restriction-end"
                type="time"
                className="field-input"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <label htmlFor="restriction-type" className="field-label">Jenis</label>
            <select
              id="restriction-type"
              className="field-input"
              value={type}
              onChange={(event) => setType(event.target.value as typeof type)}
            >
              <option value="maintenance">Pemeliharaan</option>
              <option value="closure">Penutupan</option>
              <option value="restriction">Pembatasan penggunaan</option>
            </select>
          </div>
          <div>
            <label htmlFor="restriction-reason" className="field-label">Alasan</label>
            <textarea
              id="restriction-reason"
              className="field-input min-h-20"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={5}
              required
            />
          </div>
        </div>

        {error ? <Alert tone="danger" className="mt-3">{error}</Alert> : null}
        {notice ? <Alert tone="success" className="mt-3">{notice}</Alert> : null}

        <Button type="submit" size="sm" className="mt-4" disabled={loading}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {loading ? "Menyimpan…" : "Simpan pembatasan"}
        </Button>
      </form>

      <div className="card-surface p-5">
        <h3 className="font-display text-lg font-semibold text-ink">Pembatasan tercatat</h3>
        {restrictions.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Belum ada penutupan atau pemeliharaan yang tercatat.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {restrictions.map((restriction) => (
              <li key={restriction.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{restriction.roomName}</p>
                    <Badge tone={restriction.type === "closure" ? "danger" : restriction.type === "maintenance" ? "warning" : "neutral"}>
                      {RESTRICTION_LABELS[restriction.type]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {restriction.startLabel} – {restriction.endLabel}
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">{restriction.reason}</p>
                </div>
                <ConfirmButton
                  title="Hapus pembatasan?"
                  description="Penghapusan pembatasan tidak otomatis menyelesaikan konflik pasca-persetujuan yang sudah tercatat."
                  confirmLabel="Hapus"
                  variant="danger"
                  onConfirm={async () => {
                    const response = await fetch(`/api/admin/restrictions/${restriction.id}`, { method: "DELETE" });
                    const payload = (await response.json()) as { error?: { message?: string } };
                    if (!response.ok) throw new Error(payload.error?.message ?? "Gagal menghapus.");
                    router.refresh();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Hapus
                </ConfirmButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
