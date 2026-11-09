import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FilePlus2,
  Info,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getStudentDashboard } from "@/lib/reports";
import { getClockConfig } from "@/lib/settings";
import { operationalMinutesBetween } from "@/lib/operational-clock";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { formatDateRange, formatDateTime, formatMinutes } from "@/lib/format";

export const metadata = { title: "Dashboard Mahasiswa" };

export default async function StudentDashboardPage() {
  const user = await requireUser();
  if (user.role !== "student") {
    redirect(
      user.role === "academic"
        ? "/academic"
        : user.role === "facility_manager"
          ? "/facilities"
          : user.role === "security"
            ? "/security"
            : "/admin",
    );
  }

  const [dashboard, config] = await Promise.all([getStudentDashboard(user.id), getClockConfig()]);
  const timezone = config.settings.timezone;
  const now = new Date();
  const firstName = user.fullName.split(" ")[0];

  return (
    <>
      <PageHeader
        eyebrow="Dashboard Mahasiswa"
        title={`Selamat datang, ${firstName}.`}
        description="Pantau pengajuan organisasi Anda, target keputusan Akademik, dan booking yang telah dikonfirmasi."
        actions={
          <Link href="/bookings/new" className={buttonClass("primary", "md")}>
            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
            Ajukan Peminjaman
          </Link>
        }
      />

      {!user.organizationId ? (
        <Alert tone="warning" className="mb-5" title="Profil organisasi belum lengkap">
          Pengajuan pribadi tidak diperbolehkan. Lengkapi afiliasi organisasi resmi melalui halaman{" "}
          <Link href="/profile" className="underline">
            Profil
          </Link>{" "}
          atau hubungi Admin IT.
        </Alert>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ringkasan pengajuan">
        <StatCard
          label="Menunggu keputusan"
          value={dashboard.counts.pending_academic ?? 0}
          hint={`Target Akademik ${config.settings.decisionTargetMinutes / 60} jam operasional`}
          icon={<Clock3 className="h-5 w-5" />}
          tone="brand"
        />
        <StatCard
          label="Disetujui"
          value={dashboard.counts.approved ?? 0}
          hint="Termasuk booking mendatang"
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="success"
        />
        <StatCard
          label="Perlu revisi"
          value={dashboard.counts.revision_requested ?? 0}
          hint="Periksa catatan Akademik"
          icon={<RotateCcw className="h-5 w-5" />}
          tone="accent"
        />
        <StatCard
          label="Ditolak / kedaluwarsa"
          value={(dashboard.counts.rejected ?? 0) + (dashboard.counts.expired ?? 0)}
          hint="Slot telah dilepas"
          icon={<XCircle className="h-5 w-5" />}
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Menunggu keputusan Akademik"
              description={`Slot ditahan maksimal ${config.settings.holdLimitMinutes / 60} jam operasional sejak pengajuan tersimpan.`}
              action={
                <Link href="/bookings?status=pending_academic" className="text-sm font-semibold text-brand-700 hover:underline">
                  Lihat semua
                </Link>
              }
            />
            {dashboard.pending.length === 0 ? (
              <EmptyState
                title="Tidak ada pengajuan menunggu"
                description="Pengajuan baru akan muncul di sini setelah tersimpan di server."
                icon={<Clock3 className="h-5 w-5" />}
                action={
                  <Link href="/bookings/new" className={buttonClass("secondary", "sm")}>
                    Buat pengajuan
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {dashboard.pending.map((booking) => {
                  const overdue = booking.decisionTargetAt.getTime() <= now.getTime();
                  const remaining = operationalMinutesBetween(now, booking.holdExpiresAt, config);
                  return (
                    <li key={booking.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/bookings/${booking.id}`} className="font-semibold text-ink hover:text-brand-700">
                              {booking.activityName}
                            </Link>
                            <StatusBadge status={booking.status} />
                            {overdue ? (
                              <span className="rounded-full bg-danger-100 px-2 py-0.5 text-[0.68rem] font-bold text-danger-700">
                                Melewati target 1 jam
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm text-muted">
                            {booking.roomName} • {formatDateRange(booking.startAt, booking.endAt, timezone)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                            <span>
                              Target keputusan:{" "}
                              <strong className="font-semibold text-ink-soft">
                                {formatDateTime(booking.decisionTargetAt, timezone)}
                              </strong>
                            </span>
                            <span>
                              Slot ditahan hingga:{" "}
                              <strong className="font-semibold text-ink-soft">
                                {formatDateTime(booking.holdExpiresAt, timezone)}
                              </strong>{" "}
                              (± {formatMinutes(remaining)} operasional tersisa)
                            </span>
                          </div>
                        </div>
                        <Link href={`/bookings/${booking.id}`} className={buttonClass("secondary", "sm")}>
                          Detail
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Booking mendatang"
              description="Hanya booking terkonfirmasi. Pembatalan hanya tersedia sebelum disetujui."
              action={
                <Link href="/bookings" className="text-sm font-semibold text-brand-700 hover:underline">
                  Riwayat
                </Link>
              }
            />
            {dashboard.upcoming.length === 0 ? (
              <EmptyState
                title="Belum ada booking mendatang"
                description="Setelah pengajuan disetujui, jadwal akan muncul di sini."
                icon={<CalendarClock className="h-5 w-5" />}
              />
            ) : (
              <ul className="divide-y divide-line">
                {dashboard.upcoming.map((booking) => (
                  <li key={booking.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                    <div>
                      <Link href={`/bookings/${booking.id}`} className="text-sm font-semibold text-ink hover:text-brand-700">
                        {booking.activityName}
                      </Link>
                      <p className="text-xs text-muted">
                        {booking.roomName} • {formatDateRange(booking.startAt, booking.endAt, timezone)}
                      </p>
                    </div>
                    <StatusBadge status={booking.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="bg-brand-900 px-5 py-5 text-white">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-accent-300">
                Ketentuan singkat
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold">Sebelum mengajukan</h2>
            </div>
            <ul className="space-y-3 px-5 py-5 text-sm leading-relaxed text-ink-soft">
              <li className="flex gap-2.5">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                Hanya untuk kegiatan organisasi resmi kampus. Tidak ada opsi peminjaman pribadi.
              </li>
              <li className="flex gap-2.5">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                Target keputusan {config.settings.decisionTargetMinutes / 60} jam operasional. Bukan persetujuan
                otomatis.
              </li>
              <li className="flex gap-2.5">
                <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                Slot ditahan {config.settings.holdLimitMinutes / 60} jam operasional. Jika terlewati, pengajuan
                dapat kedaluwarsa.
              </li>
              <li className="flex gap-2.5">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                Booking yang sudah disetujui tidak dapat dibatalkan. Batalkan pengajuan hanya selama masih menunggu
                keputusan Akademik.
              </li>
            </ul>
          </Card>

          <Card>
            <CardHeader title="Pengajuan terbaru" />
            {dashboard.recent.length === 0 ? (
              <EmptyState title="Belum ada pengajuan" description="Mulai dari keperluan kegiatan organisasi Anda." />
            ) : (
              <ul className="divide-y divide-line">
                {dashboard.recent.map((booking) => (
                  <li key={booking.id} className="px-5 py-3">
                    <Link href={`/bookings/${booking.id}`} className="block">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-ink">{booking.activityName}</span>
                        <StatusBadge status={booking.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {booking.roomName} • {formatDateTime(booking.submittedAt, timezone)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="rounded-card border border-brand-200 bg-brand-50 p-5">
            <p className="font-display text-base font-semibold text-brand-900">Butuh ruangan yang tepat?</p>
            <p className="mt-1 text-sm leading-relaxed text-brand-900/80">
              Lihat semua ruangan kampus beserta kapasitas, fasilitas, dan status jadwalnya.
            </p>
            <Link href="/rooms" className={buttonClass("secondary", "sm", "mt-3")}>
              Jelajahi ruangan
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
