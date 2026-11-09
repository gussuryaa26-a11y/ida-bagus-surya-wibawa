import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Clock3, Database, ShieldCheck, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getFacilityDashboard, listAuditLogs, listPostApprovalConflicts } from "@/lib/reports";
import { queryOne } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { SettingsForm } from "@/components/settings-form";
import { RunJobButton } from "@/components/run-job-button";
import { actionLabel, formatDateTime } from "@/lib/format";

export const metadata = { title: "Admin & Konfigurasi" };

export default async function AdminPage() {
  const user = await requireUser();
  if (user.role !== "admin_it") redirect("/dashboard");
  const [settings, audit, conflicts, facility, users, bookings] = await Promise.all([
    getSettings(),
    listAuditLogs({ limit: 40 }),
    listPostApprovalConflicts(),
    getFacilityDashboard(),
    queryOne<{ total: string; active: string }>(
      "SELECT count(*)::text AS total, count(*) FILTER (WHERE is_active)::text AS active FROM users",
    ),
    queryOne<{ total: string; pending: string }>(
      "SELECT count(*)::text AS total, count(*) FILTER (WHERE status = 'pending_academic')::text AS pending FROM booking_requests",
    ),
  ]);
  const timezone = settings.timezone;

  return (
    <>
      <PageHeader
        eyebrow="Admin IT"
        title="Konfigurasi teknis & operasional"
        description="Admin IT mengelola akun dan konfigurasi teknis. Akses administratif tidak otomatis memberi kewenangan menyetujui peminjaman."
        actions={
          <Link href="/admin/users" className={buttonClass("primary", "md")}>
            <Users className="h-4 w-4" aria-hidden="true" />
            Kelola akun
          </Link>
        }
      />

      {!settings.isConfirmed ? (
        <Alert tone="warning" className="mb-5" title="Konfigurasi operasional belum dikonfirmasi">
          Jam operasional, kalender, data ruangan, dan kapasitas masih berstatus DEMO/belum disahkan. Jangan menganggap
          nilai ini sebagai kebijakan resmi kampus.
        </Alert>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Akun" value={users?.total ?? 0} hint={`${users?.active ?? 0} aktif`} icon={<Users className="h-5 w-5" />} tone="brand" />
        <StatCard label="Pengajuan" value={bookings?.total ?? 0} hint={`${bookings?.pending ?? 0} menunggu`} icon={<Clock3 className="h-5 w-5" />} />
        <StatCard label="Ruangan" value={facility.totalRooms} hint={`${facility.unverifiedRooms} data belum terverifikasi`} icon={<Database className="h-5 w-5" />} />
        <StatCard label="Konflik pasca-setuju" value={conflicts.length} icon={<AlertTriangle className="h-5 w-5" />} tone={conflicts.length ? "danger" : "default"} />
        <StatCard
          label="Kesegaran jadwal"
          value={facility.freshness.isStale ? "Perlu update" : "Segar"}
          hint={facility.freshness.lastImportAt ? `Terakhir ${formatDateTime(facility.freshness.lastImportAt, timezone)}` : "Belum ada impor"}
          tone={facility.freshness.isStale ? "accent" : "success"}
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Konfigurasi operasional"
            description="Perubahan memicu perhitungan ulang tenggat pengajuan terbuka dan dicatat pada audit trail."
          />
          <div className="px-5 py-5">
            <SettingsForm initial={settings} />
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Job tenggat & kedaluwarsa" description="Idempotent; aman dijalankan berulang." />
            <div className="space-y-3 px-5 py-4 text-sm">
              <p className="leading-relaxed text-muted">
                Scheduler persisten belum dikonfigurasi dalam lingkungan ini. Untuk produksi, panggil endpoint internal
                secara berkala dengan bearer token <code>INTERNAL_JOB_TOKEN</code>, atau jalankan{" "}
                <code>npm run job:deadlines</code> melalui cron/launchd.
              </p>
              <RunJobButton />
              <p className="text-xs text-muted">
                Token job tidak ditampilkan di UI. Job juga dapat dipicu oleh Admin IT melalui sesi login.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Status keamanan" />
            <ul className="space-y-3 px-5 py-4 text-sm text-ink-soft">
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-700" aria-hidden="true" />
                Sesi HttpOnly, SameSite=Lax; kata sandi di-hash bcrypt; otorisasi dicek di server.
              </li>
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-700" aria-hidden="true" />
                Audit log append-only (trigger database menolak update/delete).
              </li>
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-700" aria-hidden="true" />
                Pencegahan double booking memakai transaksi, advisory lock per ruangan, dan exclusion constraint.
              </li>
            </ul>
          </Card>

          {conflicts.length > 0 ? (
            <Card>
              <CardHeader title="Konflik belum selesai" action={<Badge tone="warning">{conflicts.length}</Badge>} />
              <ul className="divide-y divide-line text-sm">
                {conflicts.slice(0, 8).map((conflict) => (
                  <li key={conflict.id} className="px-5 py-3">
                    <p className="font-medium text-ink">{conflict.activity_name}</p>
                    <p className="text-xs text-muted">
                      {conflict.room_name} • {conflict.source_change}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Audit trail terbaru"
          description="Aktor, tindakan, alasan, dan waktu server. Tidak dapat diubah pengguna biasa."
          action={<Link href="/admin/users" className="text-sm font-semibold text-brand-700 hover:underline">Akun</Link>}
        />
        <div className="overflow-x-auto">
          <table className="admin-table min-w-[52rem]">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Aktor</th>
                <th>Tindakan</th>
                <th>Entitas</th>
                <th>Alasan</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((log) => (
                <tr key={log.id}>
                  <td className="text-ink-soft">{formatDateTime(log.created_at, timezone)}</td>
                  <td>{log.actor_name ?? log.actor_label ?? "sistem"}</td>
                  <td className="font-medium text-ink">{actionLabel(log.action)}</td>
                  <td className="text-xs text-muted">{log.entity_type}</td>
                  <td className="max-w-72 text-xs text-muted">{log.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
