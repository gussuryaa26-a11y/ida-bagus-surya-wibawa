import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Clock3 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getScheduleFreshness, listClassSchedules, listImportHistory } from "@/lib/schedule-import";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { ScheduleImportForm } from "@/components/schedule-import-form";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Impor Jadwal" };

const DAY_LABELS = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

export default async function ImportSchedulePage() {
  const user = await requireUser();
  if (!["facility_manager", "academic", "admin_it"].includes(user.role)) redirect("/dashboard");
  const [settings, freshness, history, schedules] = await Promise.all([
    getSettings(),
    getScheduleFreshness(),
    listImportHistory(),
    listClassSchedules(undefined, 50),
  ]);
  const timezone = settings.timezone;
  const backHref = user.role === "academic" ? "/academic" : user.role === "admin_it" ? "/admin" : "/facilities";

  return (
    <>
      <div className="mb-4">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Kembali
        </Link>
      </div>

      <PageHeader
        eyebrow="MVP — Impor Excel/CSV"
        title="Impor jadwal perkuliahan"
        description="MVP tidak terintegrasi langsung dengan sistem akademik. Impor divalidasi per baris, dicatat sumber/versinya, dan tidak merusak jadwal aktif jika ada baris invalid."
        actions={
          <Link href="/facilities/calendar" className={buttonClass("secondary", "md")}>
            Kelola kalender akademik
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <Badge tone={freshness.isStale ? "warning" : "success"}>
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          {freshness.lastImportAt
            ? `Impor terakhir ${formatDateTime(freshness.lastImportAt, timezone)}`
            : "Belum ada impor"}
        </Badge>
        <Badge tone="brand">Kebijakan kesegaran {freshness.freshnessDays} hari</Badge>
        {freshness.isStale ? <Badge tone="danger">Data dianggap perlu diperbarui</Badge> : null}
      </div>

      {freshness.isStale ? (
        <Alert tone="warning" className="mb-5">
          Selama data dianggap tidak segar, pengajuan baru akan ditolak oleh validasi server (kebijakan{" "}
          <code>require_fresh_schedule</code>). Impor jadwal terbaru untuk mengaktifkan kembali pengajuan.
        </Alert>
      ) : null}

      <ScheduleImportForm />

      <Card className="mt-6">
        <CardHeader title="Riwayat impor" description="Sumber, versi, petugas, waktu, dan hasil per baris." />
        {history.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">Belum ada riwayat impor.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table min-w-[56rem]">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>File</th>
                  <th>Sumber / versi</th>
                  <th>Petugas</th>
                  <th>Status</th>
                  <th>Baris</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id}>
                    <td className="text-ink-soft">{formatDateTime(entry.created_at, timezone)}</td>
                    <td className="font-medium text-ink">{entry.filename}</td>
                    <td className="text-ink-soft">
                      {entry.source} • {entry.source_version}
                    </td>
                    <td className="text-ink-soft">{entry.imported_by_name ?? "—"}</td>
                    <td>
                      <Badge tone={entry.status === "success" ? "success" : entry.status === "partial" ? "warning" : "danger"}>
                        {entry.status}
                      </Badge>
                    </td>
                    <td className="text-ink-soft">
                      {entry.success_rows} berhasil / {entry.failed_rows} gagal / {entry.total_rows} total
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Jadwal aktif (contoh)" description="Menampilkan hingga 50 baris jadwal yang tersimpan." />
        {schedules.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">Belum ada jadwal.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table min-w-[52rem]">
              <thead>
                <tr>
                  <th>Ruangan</th>
                  <th>Hari</th>
                  <th>Jam</th>
                  <th>Berlaku</th>
                  <th>Semester</th>
                  <th>Versi</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((schedule) => (
                  <tr key={schedule.id}>
                    <td className="font-medium text-ink">
                      {schedule.room_name} <span className="text-xs text-muted">({schedule.room_code})</span>
                    </td>
                    <td>{DAY_LABELS[schedule.day_of_week]}</td>
                    <td>{schedule.start_time.slice(0, 5)}–{schedule.end_time.slice(0, 5)}</td>
                    <td className="text-ink-soft">{schedule.effective_from} – {schedule.effective_until}</td>
                    <td className="text-ink-soft">{schedule.semester_label}</td>
                    <td className="text-xs text-muted">{schedule.source_version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Alert tone="info" className="mt-6" title="Catatan operasional">
        Impor bersifat idempotent terhadap baris identik (duplikat ditolak). Baris invalid dilaporkan dan dilewati;
        gunakan mode ketat jika kampus menghendaki seluruh impor dibatalkan saat ada satu baris bermasalah. Hari libur
        tidak otomatis membuat ruangan tersedia.
      </Alert>
    </>
  );
}
