"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

type Issue = { rowNumber: number; roomCode: string; errors: string[] };
type SampleRow = {
  rowNumber: number;
  roomCode: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveUntil: string;
  semesterLabel: string;
  courseName: string | null;
};

type PreviewResponse = {
  mode: "preview";
  filename: string;
  totalRows: number;
  validRows: number;
  issues: Issue[];
  sample: SampleRow[];
};

type CommitResponse = {
  importId: string;
  status: "success" | "partial" | "failed";
  totalRows: number;
  successRows: number;
  failedRows: number;
  issues: Issue[];
  conflictsDetected: number;
};

const TEMPLATE = `room_code,day_of_week,start_time,end_time,effective_from,effective_until,semester_label,course_name
KELAS-A11,Senin,08:00,10:00,2026-07-01,2027-04-30,Ganjil,Struktur Dasar Desain
KELAS-A11,Rabu,10:00,12:00,2026-07-01,2027-04-30,Ganjil,Tipografi
LAB-KOMPUTER,Senin,13:00,15:00,2026-07-01,2027-04-30,Ganjil,Praktikum Web`;

export function ScheduleImportForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("");
  const [sourceVersion, setSourceVersion] = useState("");
  const [strict, setStrict] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<CommitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"preview" | "commit" | null>(null);

  async function submit(mode: "preview" | "commit") {
    if (!file) {
      setError("Pilih file CSV/XLSX terlebih dahulu.");
      return;
    }
    if (source.trim().length < 3 || !sourceVersion.trim()) {
      setError("Sumber dan versi sumber wajib diisi untuk menjaga ketertelusuran impor.");
      return;
    }
    setError(null);
    setResult(null);
    setLoading(mode);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("source", source);
      formData.set("sourceVersion", sourceVersion);
      formData.set("mode", mode);
      formData.set("strict", String(strict));
      const response = await fetch("/api/admin/schedules/import", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as (PreviewResponse | CommitResponse) & {
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(payload.error?.message ?? "Impor gagal.");
      if (mode === "preview") {
        setPreview(payload as PreviewResponse);
      } else {
        setResult(payload as CommitResponse);
        setPreview(null);
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impor gagal.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Unggah jadwal</h2>
            <p className="mt-1 text-sm text-muted">Format .csv atau .xlsx, maksimal 5 MB. Pratinjau wajib sebelum komit.</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const blob = new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = "template-jadwal-simpar.csv";
              anchor.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Unduh template CSV
          </Button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="schedule-file" className="field-label">File jadwal</label>
            <input
              id="schedule-file"
              type="file"
              accept=".csv,.xlsx,.xlsm"
              className="field-input"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                setResult(null);
              }}
            />
            {file ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                {file.name} • {(file.size / 1024).toFixed(1)} KB
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="schedule-source" className="field-label">Sumber data</label>
            <input
              id="schedule-source"
              className="field-input"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="Contoh: BAAK IDB Bali"
            />
          </div>
          <div>
            <label htmlFor="schedule-version" className="field-label">Versi sumber</label>
            <input
              id="schedule-version"
              className="field-input"
              value={sourceVersion}
              onChange={(event) => setSourceVersion(event.target.value)}
              placeholder="Contoh: ganjil-2026-v1"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-soft sm:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-brand-700)]"
              checked={strict}
              onChange={(event) => setStrict(event.target.checked)}
            />
            Mode ketat: batalkan seluruh impor jika ada satu baris tidak valid
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-line bg-paper p-3 text-xs leading-relaxed text-muted">
          Kolom wajib: <code>room_code</code>, <code>day_of_week</code> (1–7 atau nama hari), <code>start_time</code>,{" "}
          <code>end_time</code>, <code>effective_from</code>, <code>effective_until</code>, <code>semester_label</code>.
          Kolom opsional: <code>course_name</code>. Baris duplikat dan ruangan tidak dikenal akan dilaporkan.
        </div>

        {error ? <Alert tone="danger" className="mt-4">{error}</Alert> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => submit("preview")} disabled={loading !== null}>
            {loading === "preview" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Pratinjau validasi
          </Button>
          <Button onClick={() => submit("commit")} disabled={loading !== null || !preview}>
            {loading === "commit" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
            Impor baris valid
          </Button>
        </div>
      </div>

      {preview ? (
        <div className="card-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg font-semibold text-ink">Hasil pratinjau</h3>
            <div className="flex gap-2">
              <Badge tone="success">{preview.validRows} valid</Badge>
              <Badge tone={preview.issues.length ? "danger" : "neutral"}>{preview.issues.length} bermasalah</Badge>
              <Badge tone="brand">{preview.totalRows} total baris</Badge>
            </div>
          </div>
          {preview.issues.length > 0 ? (
            <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-danger-700/20 bg-danger-100 p-3 text-xs text-danger-700">
              <p className="font-semibold">Baris yang tidak akan diimpor:</p>
              <ul className="mt-1 space-y-1">
                {preview.issues.slice(0, 100).map((issue) => (
                  <li key={`${issue.rowNumber}-${issue.roomCode}`}>
                    Baris {issue.rowNumber} ({issue.roomCode || "tanpa kode ruangan"}): {issue.errors.join(" ")}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Alert tone="success" className="mt-3">Semua baris valid. Lanjutkan impor.</Alert>
          )}

          <div className="mt-3 overflow-x-auto">
            <table className="admin-table min-w-[52rem]">
              <thead>
                <tr>
                  <th>Baris</th>
                  <th>Ruangan</th>
                  <th>Hari</th>
                  <th>Jam</th>
                  <th>Berlaku</th>
                  <th>Semester</th>
                </tr>
              </thead>
              <tbody>
                {preview.sample.slice(0, 20).map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td className="font-medium text-ink">{row.roomCode}</td>
                    <td>{row.dayOfWeek}</td>
                    <td>{row.startTime}–{row.endTime}</td>
                    <td>{row.effectiveFrom} – {row.effectiveUntil}</td>
                    <td>{row.semesterLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="card-surface p-5">
          <h3 className="font-display text-lg font-semibold text-ink">Hasil impor</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone={result.status === "success" ? "success" : result.status === "partial" ? "warning" : "danger"}>
              {result.status === "success" ? "Berhasil" : result.status === "partial" ? "Sebagian berhasil" : "Gagal"}
            </Badge>
            <Badge tone="success">{result.successRows} baris tersimpan</Badge>
            <Badge tone="danger">{result.failedRows} gagal</Badge>
            {result.conflictsDetected > 0 ? <Badge tone="warning">{result.conflictsDetected} konflik pasca-persetujuan</Badge> : null}
          </div>
          <p className="mt-2 text-sm text-muted">
            Impor tercatat dengan petugas, sumber, versi, waktu, dan rincian baris. Data valid tidak rusak oleh baris
            invalid.
          </p>
        </div>
      ) : null}
    </div>
  );
}
