"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { CALENDAR_TYPE_LABELS } from "@/lib/format";
import type { CalendarType } from "@/lib/calendar";

export type CalendarEntryView = {
  id: string;
  periodStart: string;
  periodEnd: string;
  calendarType: CalendarType;
  description: string;
  regularClassesEnabled: boolean;
  sourceOrAuthority: string;
  updatedLabel: string;
  updatedBy: string | null;
};

type FormState = {
  periodStart: string;
  periodEnd: string;
  calendarType: CalendarType;
  description: string;
  regularClassesEnabled: boolean;
  sourceOrAuthority: string;
};

const EMPTY: FormState = {
  periodStart: "",
  periodEnd: "",
  calendarType: "holiday",
  description: "",
  regularClassesEnabled: false,
  sourceOrAuthority: "",
};

export function CalendarManager({ entries }: { entries: CalendarEntryView[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<CalendarEntryView | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    dialogRef.current?.showModal();
  }

  function openEdit(entry: CalendarEntryView) {
    setEditing(entry);
    setForm({
      periodStart: entry.periodStart,
      periodEnd: entry.periodEnd,
      calendarType: entry.calendarType,
      description: entry.description,
      regularClassesEnabled: entry.regularClassesEnabled,
      sourceOrAuthority: entry.sourceOrAuthority,
    });
    setError(null);
    dialogRef.current?.showModal();
  }

  async function save() {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(editing ? `/api/admin/calendar/${editing.id}` : "/api/admin/calendar", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal menyimpan kalender.");
      dialogRef.current?.close();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gagal menyimpan kalender.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">Kalender akademik</h2>
          <p className="text-sm text-muted">
            Semua entri wajib mencantumkan sumber/otoritas. Hari libur menonaktifkan jadwal kuliah reguler, bukan
            menghapusnya.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          Tambah entri
        </Button>
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="admin-table min-w-[56rem]">
          <thead>
            <tr>
              <th>Periode</th>
              <th>Jenis</th>
              <th>Deskripsi</th>
              <th>Kelas reguler</th>
              <th>Sumber/otoritas</th>
              <th>Diperbarui</th>
              <th aria-label="Tindakan" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="font-medium text-ink">
                  {entry.periodStart}
                  {entry.periodEnd !== entry.periodStart ? ` – ${entry.periodEnd}` : ""}
                </td>
                <td>
                  <Badge tone={entry.calendarType === "semester" ? "brand" : "warning"}>
                    {CALENDAR_TYPE_LABELS[entry.calendarType]}
                  </Badge>
                </td>
                <td className="max-w-72 text-ink-soft">{entry.description}</td>
                <td>
                  <Badge tone={entry.regularClassesEnabled ? "success" : "neutral"}>
                    {entry.regularClassesEnabled ? "Aktif" : "Dinonaktifkan"}
                  </Badge>
                </td>
                <td className="max-w-56 text-xs text-ink-soft">{entry.sourceOrAuthority}</td>
                <td className="text-xs text-muted">
                  {entry.updatedLabel}
                  {entry.updatedBy ? ` • ${entry.updatedBy}` : ""}
                </td>
                <td>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => openEdit(entry)}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      Edit
                    </Button>
                    <ConfirmButton
                      title="Hapus entri kalender?"
                      description="Penghapusan akan memicu perhitungan ulang tenggat pengajuan yang masih terbuka."
                      confirmLabel="Hapus"
                      variant="danger"
                      onConfirm={async () => {
                        const response = await fetch(`/api/admin/calendar/${entry.id}`, { method: "DELETE" });
                        const payload = (await response.json()) as { error?: { message?: string } };
                        if (!response.ok) throw new Error(payload.error?.message ?? "Gagal menghapus.");
                        router.refresh();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </ConfirmButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 ? <p className="px-5 py-6 text-sm text-muted">Belum ada entri kalender.</p> : null}
      </div>

      <dialog
        ref={dialogRef}
        className="w-[min(96vw,38rem)] rounded-2xl border border-line bg-surface p-0 shadow-2xl backdrop:bg-ink/40"
      >
        <form
          className="p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <h2 className="font-display text-xl font-semibold text-ink">
            {editing ? "Ubah entri kalender" : "Tambah entri kalender"}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cal-start" className="field-label">Tanggal mulai</label>
              <input
                id="cal-start"
                type="date"
                className="field-input"
                value={form.periodStart}
                onChange={(event) => setForm({ ...form, periodStart: event.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="cal-end" className="field-label">Tanggal akhir</label>
              <input
                id="cal-end"
                type="date"
                className="field-input"
                value={form.periodEnd}
                onChange={(event) => setForm({ ...form, periodEnd: event.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="cal-type" className="field-label">Jenis</label>
              <select
                id="cal-type"
                className="field-input"
                value={form.calendarType}
                onChange={(event) => setForm({ ...form, calendarType: event.target.value as CalendarType })}
              >
                {Object.entries(CALENDAR_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cal-source" className="field-label">Sumber/otoritas</label>
              <input
                id="cal-source"
                className="field-input"
                value={form.sourceOrAuthority}
                onChange={(event) => setForm({ ...form, sourceOrAuthority: event.target.value })}
                required
                placeholder="Contoh: BAAK / SK Rektor"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="cal-description" className="field-label">Deskripsi</label>
              <input
                id="cal-description"
                className="field-input"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                required
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-soft sm:col-span-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-brand-700)]"
                checked={form.regularClassesEnabled}
                onChange={(event) => setForm({ ...form, regularClassesEnabled: event.target.checked })}
              />
              Jadwal kuliah reguler tetap aktif
            </label>
          </div>

          {error ? <Alert tone="danger" className="mt-4">{error}</Alert> : null}

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => dialogRef.current?.close()} disabled={loading}>
              Batal
            </Button>
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
