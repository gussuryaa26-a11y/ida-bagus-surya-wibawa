import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, Filter, Gavel, TimerOff } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getAcademicDashboard } from "@/lib/reports";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { BOOKING_STATUSES, type BookingStatus } from "@/lib/types";
import { STATUS_LABELS, formatDateRange, formatDateTime, formatMinutes } from "@/lib/format";

export const metadata = { title: "Dashboard Akademik" };

export default async function AcademicDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (user.role !== "academic") redirect("/dashboard");
  const settings = await getSettings();
  const params = await searchParams;
  const first = (key: string) => (Array.isArray(params[key]) ? params[key]?.[0] : params[key]);
  const dashboard = await getAcademicDashboard();
  const statusFilter = first("status") as BookingStatus | undefined;
  const search = (first("q") ?? "").toLowerCase();
  const dateFilter = first("date") ?? "";
  const overdueOnly = first("overdue") === "1";

  const queue = dashboard.queue.filter((item) => {
    if (statusFilter && item.status !== statusFilter) return false;
    if (overdueOnly && !item.overdue) return false;
    if (dateFilter) {
      const local = new Intl.DateTimeFormat("en-CA", { timeZone: settings.timezone }).format(item.startAt);
      if (local !== dateFilter) return false;
    }
    if (search) {
      const haystack = `${item.activityName} ${item.organizationName} ${item.roomName} ${item.requesterName}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  return (
    <>
      <PageHeader
        eyebrow="Bagian Akademik"
        title="Antrean keputusan"
        description="Tinjau pengajuan berdasarkan urgensi. Keputusan akhir berada pada Bagian Akademik; Admin IT tidak otomatis memiliki kewenangan ini."
        actions={
          <Link href="/academic?overdue=1" className={buttonClass("secondary", "md")}>
            <TimerOff className="h-4 w-4" aria-hidden="true" />
            Lihat yang terlambat
          </Link>
        }
      />

      {!settings.isConfirmed ? (
        <Alert tone="warning" className="mb-5">
          Konfigurasi jam operasional masih DEMO dan belum dikonfirmasi kampus. Perhitungan target dan penahanan
          mengikuti konfigurasi tersebut.
        </Alert>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Ringkasan antrean">
        <StatCard label="Menunggu" value={dashboard.pendingCount} icon={<Clock3 className="h-5 w-5" />} tone="brand" />
        <StatCard
          label="Terlambat"
          value={dashboard.overdueCount}
          hint="Target 1 jam operasional"
          icon={<TimerOff className="h-5 w-5" />}
          tone={dashboard.overdueCount > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Mendekati habis"
          value={dashboard.expiringSoonCount}
          hint="≤ 1 jam operasional tersisa"
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={dashboard.expiringSoonCount > 0 ? "accent" : "default"}
        />
        <StatCard label="Konflik" value={dashboard.conflictCount} icon={<Gavel className="h-5 w-5" />} />
        <StatCard label="Keputusan hari ini" value={dashboard.decisionsToday} icon={<CheckCircle2 className="h-5 w-5" />} />
      </section>

      <Card className="mt-6">
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <div className="min-w-48 flex-1">
            <label htmlFor="q" className="field-label">
              Cari
            </label>
            <input id="q" name="q" defaultValue={first("q") ?? ""} placeholder="Kegiatan, organisasi, ruangan, pemohon" className="field-input" />
          </div>
          <div className="w-full sm:w-52">
            <label htmlFor="status" className="field-label">
              Status
            </label>
            <select id="status" name="status" defaultValue={statusFilter ?? ""} className="field-input">
              <option value="">Prioritas aktif</option>
              {BOOKING_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-44">
            <label htmlFor="date" className="field-label">
              Tanggal kegiatan
            </label>
            <input id="date" name="date" type="date" defaultValue={dateFilter} className="field-input" />
          </div>
          <label className="flex items-center gap-2 pb-2.5 text-sm text-ink-soft">
            <input type="checkbox" name="overdue" value="1" defaultChecked={overdueOnly} className="h-4 w-4 accent-[var(--color-brand-700)]" />
            Hanya terlambat
          </label>
          <button type="submit" className={buttonClass("secondary", "md")}>
            <Filter className="h-4 w-4" aria-hidden="true" />
            Terapkan
          </button>
          <Link href="/academic" className={buttonClass("ghost", "md")}>
            Reset
          </Link>
        </form>

        {queue.length === 0 ? (
          <EmptyState
            title="Antrean kosong"
            description="Tidak ada pengajuan yang cocok dengan filter saat ini."
            icon={<CalendarClock className="h-5 w-5" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table min-w-[64rem]">
              <thead>
                <tr>
                  <th>Prioritas</th>
                  <th>Kegiatan / organisasi</th>
                  <th>Ruangan & waktu</th>
                  <th>Diajukan</th>
                  <th>Target keputusan</th>
                  <th>Sisa penahanan</th>
                  <th>Status</th>
                  <th aria-label="Tindakan" />
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="flex flex-col gap-1">
                        {item.overdue ? <Badge tone="danger">Terlambat</Badge> : null}
                        {item.expiringSoon && !item.overdue ? <Badge tone="warning">Mendekati habis</Badge> : null}
                        {!item.overdue && !item.expiringSoon ? <Badge tone="success">Dalam target</Badge> : null}
                        {item.capacityReviewRequired ? (
                          <Badge tone="warning">Validasi kapasitas</Badge>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <Link href={`/academic/${item.id}`} className="font-semibold text-ink hover:text-brand-700">
                        {item.activityName}
                      </Link>
                      <p className="text-xs text-muted">{item.organizationName}</p>
                      <p className="text-xs text-muted">Oleh {item.requesterName}</p>
                    </td>
                    <td>
                      <p className="font-medium text-ink">{item.roomName}</p>
                      <p className="text-xs text-muted">{formatDateRange(item.startAt, item.endAt, settings.timezone)}</p>
                    </td>
                    <td className="text-ink-soft">{formatDateTime(item.submittedAt, settings.timezone)}</td>
                    <td>
                      <p className={item.overdue ? "font-semibold text-danger-700" : "text-ink-soft"}>
                        {formatDateTime(item.decisionTargetAt, settings.timezone)}
                      </p>
                      <p className="text-xs text-muted">
                        {item.status === "pending_academic"
                          ? item.overdue
                            ? "Target terlewati"
                            : `± ${formatMinutes(item.operationalMinutesToTarget)} tersisa`
                          : "—"}
                      </p>
                    </td>
                    <td>
                      {item.status === "pending_academic" ? (
                        <>
                          <p className="text-ink-soft">{formatDateTime(item.holdExpiresAt, settings.timezone)}</p>
                          <p className={item.expiringSoon ? "text-xs font-semibold text-danger-700" : "text-xs text-muted"}>
                            ± {formatMinutes(item.operationalMinutesToExpiry)}
                          </p>
                        </>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="text-right">
                      <Link href={`/academic/${item.id}`} className={buttonClass("primary", "sm")}>
                        Tinjau
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {dashboard.conflictCount > 0 ? (
        <Alert tone="warning" className="mt-5" title="Konflik pasca-persetujuan terdeteksi">
          {dashboard.conflictCount} konflik belum diselesaikan. Konflik tidak membatalkan booking secara otomatis; tinjau
          data jadwal/pembatasan dan tentukan tindakan sesuai kebijakan kampus.
        </Alert>
      ) : null}
    </>
  );
}
