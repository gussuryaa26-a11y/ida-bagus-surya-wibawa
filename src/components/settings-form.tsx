"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { OperationalSettings } from "@/lib/settings";

export function SettingsForm({ initial }: { initial: OperationalSettings }) {
  const router = useRouter();
  const [form, setForm] = useState({
    timezone: initial.timezone,
    workdays: initial.workdays,
    openTime: initial.openTime,
    closeTime: initial.closeTime,
    decisionTargetMinutes: String(initial.decisionTargetMinutes),
    holdLimitMinutes: String(initial.holdLimitMinutes),
    revisionHoldPolicy: initial.revisionHoldPolicy,
    revisionHoldMinutes: initial.revisionHoldMinutes ? String(initial.revisionHoldMinutes) : "",
    bookingBufferMinutes: String(initial.bookingBufferMinutes),
    scheduleFreshnessDays: String(initial.scheduleFreshnessDays),
    requireFreshSchedule: initial.requireFreshSchedule,
    requireOrgPosition: initial.requireOrgPosition,
    allowDemoRoomData: initial.allowDemoRoomData,
    memoDocumentPrefix: initial.memoDocumentPrefix,
    memoTemplateKind: initial.memoTemplateKind,
    memoOfficialTemplatePath: initial.memoOfficialTemplatePath ?? "",
    dataRetentionDays: initial.dataRetentionDays ? String(initial.dataRetentionDays) : "",
    confirmConfiguration: initial.isConfirmed,
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        setNotice(null);
        setLoading(true);
        try {
          const response = await fetch("/api/admin/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              timezone: form.timezone,
              workdays: form.workdays,
              openTime: form.openTime,
              closeTime: form.closeTime,
              decisionTargetMinutes: Number(form.decisionTargetMinutes),
              holdLimitMinutes: Number(form.holdLimitMinutes),
              revisionHoldPolicy: form.revisionHoldPolicy,
              revisionHoldMinutes: form.revisionHoldMinutes ? Number(form.revisionHoldMinutes) : null,
              bookingBufferMinutes: Number(form.bookingBufferMinutes),
              scheduleFreshnessDays: Number(form.scheduleFreshnessDays),
              requireFreshSchedule: form.requireFreshSchedule,
              requireOrgPosition: form.requireOrgPosition,
              allowDemoRoomData: form.allowDemoRoomData,
              memoDocumentPrefix: form.memoDocumentPrefix,
              memoTemplateKind: form.memoTemplateKind,
              memoOfficialTemplatePath: form.memoOfficialTemplatePath || null,
              dataRetentionDays: form.dataRetentionDays ? Number(form.dataRetentionDays) : null,
              confirmConfiguration: form.confirmConfiguration,
            }),
          });
          const payload = (await response.json()) as {
            error?: { message?: string; details?: { issues?: Array<{ path: string; message: string }> } };
          };
          if (!response.ok) {
            const issue = payload.error?.details?.issues?.[0];
            throw new Error(issue ? `${issue.path}: ${issue.message}` : payload.error?.message ?? "Gagal menyimpan konfigurasi.");
          }
          setNotice("Konfigurasi operasional tersimpan. Tenggat pengajuan terbuka telah dihitung ulang.");
          router.refresh();
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Gagal menyimpan konfigurasi.");
        } finally {
          setLoading(false);
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={initial.isConfirmed ? "success" : "warning"}>
          {initial.isConfirmed ? "Ditandai sudah dikonfirmasi" : "BELUM dikonfirmasi kampus"}
        </Badge>
        <Badge tone="neutral">Zona waktu resmi harus ditetapkan kampus</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="timezone" className="field-label">Zona waktu</label>
          <input
            id="timezone"
            className="field-input"
            list="timezone-options"
            value={form.timezone}
            onChange={(event) => setForm({ ...form, timezone: event.target.value })}
            required
          />
          <datalist id="timezone-options">
            <option value="Asia/Makassar" />
            <option value="Asia/Jakarta" />
            <option value="Asia/Singapore" />
          </datalist>
        </div>
        <div>
          <label htmlFor="openTime" className="field-label">Jam buka</label>
          <input
            id="openTime"
            type="time"
            className="field-input"
            value={form.openTime}
            onChange={(event) => setForm({ ...form, openTime: event.target.value })}
            required
          />
        </div>
        <div>
          <label htmlFor="closeTime" className="field-label">Jam tutup</label>
          <input
            id="closeTime"
            type="time"
            className="field-input"
            value={form.closeTime}
            onChange={(event) => setForm({ ...form, closeTime: event.target.value })}
            required
          />
        </div>
        <div>
          <label htmlFor="buffer" className="field-label">Buffer antarbooking (menit)</label>
          <input
            id="buffer"
            type="number"
            min={0}
            max={240}
            className="field-input"
            value={form.bookingBufferMinutes}
            onChange={(event) => setForm({ ...form, bookingBufferMinutes: event.target.value })}
          />
        </div>
        <div>
          <label htmlFor="target" className="field-label">Target keputusan (menit operasional)</label>
          <input
            id="target"
            type="number"
            min={1}
            className="field-input"
            value={form.decisionTargetMinutes}
            onChange={(event) => setForm({ ...form, decisionTargetMinutes: event.target.value })}
          />
        </div>
        <div>
          <label htmlFor="hold" className="field-label">Batas penahanan slot (menit operasional)</label>
          <input
            id="hold"
            type="number"
            min={1}
            className="field-input"
            value={form.holdLimitMinutes}
            onChange={(event) => setForm({ ...form, holdLimitMinutes: event.target.value })}
          />
        </div>
        <div>
          <label htmlFor="freshness" className="field-label">Kesegaran data jadwal (hari)</label>
          <input
            id="freshness"
            type="number"
            min={1}
            className="field-input"
            value={form.scheduleFreshnessDays}
            onChange={(event) => setForm({ ...form, scheduleFreshnessDays: event.target.value })}
          />
        </div>
        <div>
          <label htmlFor="revisionPolicy" className="field-label">Kebijakan slot saat revisi</label>
          <select
            id="revisionPolicy"
            className="field-input"
            value={form.revisionHoldPolicy}
            onChange={(event) =>
              setForm({ ...form, revisionHoldPolicy: event.target.value as "release" | "hold_limited" })
            }
          >
            <option value="release">Lepas slot (rekomendasi PRD)</option>
            <option value="hold_limited">Tahan terbatas</option>
          </select>
          <p className="mt-1 text-[0.68rem] leading-relaxed text-muted">
            Kebijakan ini belum diputuskan kampus. Opsi default melepas slot agar tidak menahan tanpa batas.
          </p>
        </div>
        {form.revisionHoldPolicy === "hold_limited" ? (
          <div>
            <label htmlFor="revisionHold" className="field-label">Batas penahanan revisi (menit)</label>
            <input
              id="revisionHold"
              type="number"
              min={1}
              className="field-input"
              value={form.revisionHoldMinutes}
              onChange={(event) => setForm({ ...form, revisionHoldMinutes: event.target.value })}
            />
          </div>
        ) : null}
        <div>
          <label htmlFor="memoPrefix" className="field-label">Prefix nomor dokumen DEMO</label>
          <input
            id="memoPrefix"
            className="field-input"
            value={form.memoDocumentPrefix}
            onChange={(event) => setForm({ ...form, memoDocumentPrefix: event.target.value })}
          />
        </div>
        <div>
          <label htmlFor="memoKind" className="field-label">Template Internal Memo</label>
          <select
            id="memoKind"
            className="field-input"
            value={form.memoTemplateKind}
            onChange={(event) => setForm({ ...form, memoTemplateKind: event.target.value as "demo" | "official" })}
          >
            <option value="demo">DEMO — belum resmi</option>
            <option value="official">Template resmi kampus</option>
          </select>
          <p className="mt-1 text-[0.68rem] leading-relaxed text-muted">
            Template resmi wajib disediakan kampus beserta mapping field. Jika tidak lengkap, pembuatan memo gagal tanpa
            membatalkan booking.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="memoPath" className="field-label">Path template resmi (opsional; server-side)</label>
          <input
            id="memoPath"
            className="field-input"
            value={form.memoOfficialTemplatePath}
            onChange={(event) => setForm({ ...form, memoOfficialTemplatePath: event.target.value })}
            placeholder="/path/ke/internal-memo.pdf (mapping: .fields.json)"
          />
        </div>
        <div>
          <label htmlFor="retention" className="field-label">Retensi data (hari, opsional)</label>
          <input
            id="retention"
            type="number"
            min={1}
            className="field-input"
            value={form.dataRetentionDays}
            onChange={(event) => setForm({ ...form, dataRetentionDays: event.target.value })}
            placeholder="Belum ditetapkan kampus"
          />
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="field-label">Hari operasional</legend>
          <div className="flex flex-wrap gap-2">
            {[
              [1, "Senin"],
              [2, "Selasa"],
              [3, "Rabu"],
              [4, "Kamis"],
              [5, "Jumat"],
              [6, "Sabtu"],
              [7, "Minggu"],
            ].map(([day, label]) => (
              <label
                key={day}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                  form.workdays.includes(Number(day))
                    ? "border-brand-600 bg-brand-50 text-brand-900"
                    : "border-line bg-surface text-ink-soft"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[var(--color-brand-700)]"
                  checked={form.workdays.includes(Number(day))}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      workdays: event.target.checked
                        ? [...form.workdays, Number(day)].sort()
                        : form.workdays.filter((value) => value !== Number(day)),
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="grid gap-3 rounded-xl border border-line bg-paper p-4 text-sm text-ink-soft sm:grid-cols-2">
        <Toggle
          label="Wajibkan data jadwal segar"
          checked={form.requireFreshSchedule}
          onChange={(value) => setForm({ ...form, requireFreshSchedule: value })}
          hint="Menolak pengajuan jika impor jadwal melewati batas kesegaran."
        />
        <Toggle
          label="Wajibkan jabatan organisasi"
          checked={form.requireOrgPosition}
          onChange={(value) => setForm({ ...form, requireOrgPosition: value })}
          hint="Pemohon harus mengisi jabatan/peran."
        />
        <Toggle
          label="Izinkan data ruangan DEMO"
          checked={form.allowDemoRoomData}
          onChange={(value) => setForm({ ...form, allowDemoRoomData: value })}
          hint="Hanya untuk pengembangan. Matikan pada produksi agar data belum terverifikasi memblokir booking."
        />
        <Toggle
          label="Tandai konfigurasi telah dikonfirmasi kampus"
          checked={form.confirmConfiguration}
          onChange={(value) => setForm({ ...form, confirmConfiguration: value })}
          hint="Hanya centang setelah ada penetapan resmi. Tindakan ini dicatat audit."
        />
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <Button type="submit" disabled={loading || form.workdays.length === 0}>
        {loading ? "Menyimpan…" : "Simpan konfigurasi"}
      </Button>
    </form>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint: string;
}) {
  return (
    <label className="flex items-start gap-2">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-[var(--color-brand-700)]"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted">{hint}</span>
      </span>
    </label>
  );
}
