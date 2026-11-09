import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock3, FileText, Info, TimerOff } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getBookingById } from "@/lib/bookings";
import { getMemoForBooking } from "@/lib/memos";
import { getClockConfig, getSettings } from "@/lib/settings";
import { formatCapacityPercentage, getCapacityPercentage } from "@/lib/capacity";
import { operationalMinutesBetween } from "@/lib/operational-clock";
import { listAuditLogs } from "@/lib/reports";
import { query, queryOne } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { BookingDecisionForm } from "@/components/decision-forms";
import {
  ACTIVITY_LABELS,
  actionLabel,
  facilityLabels,
  formatDateRange,
  formatDateTime,
  formatMinutes,
} from "@/lib/format";
import type { ActivityType } from "@/lib/types";

export const metadata = { title: "Tinjau Pengajuan" };

export default async function AcademicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.role !== "academic") redirect("/dashboard");
  const { id } = await params;
  const booking = await getBookingById(id);
  if (!booking) notFound();

  const [settings, config, memo, audit, decisionUser, conflicts] = await Promise.all([
    getSettings(),
    getClockConfig(),
    getMemoForBooking(id),
    listAuditLogs({ entityType: "booking_request", entityId: id, limit: 50 }),
    booking.decisionBy
      ? queryOne<{ full_name: string }>("SELECT full_name FROM users WHERE id = $1", [booking.decisionBy])
      : Promise.resolve(null),
    query<{ id: string; conflict_type: string; source_change: string; created_at: Date }>(
      "SELECT id, conflict_type, source_change, created_at FROM post_approval_conflicts WHERE booking_id = $1 AND resolved_at IS NULL",
      [id],
    ),
  ]);
  const timezone = settings.timezone;
  const now = new Date();
  const targetRemaining = operationalMinutesBetween(now, booking.decisionTargetAt, config);
  const holdRemaining = operationalMinutesBetween(now, booking.holdExpiresAt, config);
  const overdue = booking.status === "pending_academic" && booking.decisionTargetAt.getTime() <= now.getTime();
  const expiringSoon = booking.status === "pending_academic" && holdRemaining <= 60;
  const capacityPercentage =
    booking.capacityPercentageSnapshot ??
    getCapacityPercentage(booking.participantCount, booking.roomCapacity);

  return (
    <>
      <div className="mb-4">
        <Link href="/academic" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Kembali ke antrean
        </Link>
      </div>

      <PageHeader
        eyebrow={`Keputusan Akademik • ${booking.id.slice(0, 8).toUpperCase()}`}
        title={booking.activityName}
        description={`${booking.organizationName} • ${booking.roomName} • ${formatDateRange(booking.startAt, booking.endAt, timezone)}`}
        actions={
          <>
            <StatusBadge status={booking.status} />
            {booking.capacityReviewRequired ? <Badge tone="warning">Validasi kapasitas</Badge> : null}
          </>
        }
      />

      {booking.capacityReviewRequired && booking.status === "pending_academic" ? (
        <Alert tone="warning" className="mb-5" title="Perlu validasi kapasitas">
          Jumlah peserta {booking.participantCount} orang
          {capacityPercentage !== null
            ? ` (${formatCapacityPercentage(capacityPercentage)}% dari kapasitas ${
                booking.roomCapacity ?? "ruangan"
              } orang)`
            : ""}{" "}
          melebihi kapasitas ruangan. Pengajuan ini ditandai untuk validasi tambahan; menyetujui pengajuan berarti
          menerima jumlah peserta tersebut.
        </Alert>
      ) : null}

      {conflicts.length > 0 ? (
        <Alert tone="warning" className="mb-5" title="Konflik pasca-persetujuan">
          {conflicts.length} konflik terdeteksi setelah persetujuan. Sistem tidak membatalkan booking otomatis.{" "}
          {conflicts.map((conflict) => conflict.source_change).join("; ")}
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Detail kegiatan" />
            <dl className="grid gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2">
              <Item label="Organisasi">{booking.organizationName}{booking.organizationCode ? ` (${booking.organizationCode})` : ""}</Item>
              <Item label="Jabatan pemohon">{booking.orgPositionSnapshot ?? "—"}</Item>
              <Item label="Pemohon">
                {booking.requesterName} {booking.requesterNim ? `• NIM ${booking.requesterNim}` : ""}
              </Item>
              <Item label="Program studi">{booking.requesterProgramStudy ?? "—"}</Item>
              <Item label="Kontak pemohon">
                {[booking.requesterPhone, booking.requesterEmail].filter(Boolean).join(" • ") || "—"}
              </Item>
              <Item label="Jenis kegiatan">{ACTIVITY_LABELS[booking.activityType as ActivityType] ?? booking.activityType}</Item>
              <Item label="Jumlah peserta">{booking.participantCount} orang</Item>
              <Item label="Kapasitas ruangan">
                {booking.roomCapacity ? `${booking.roomCapacity} orang` : "Belum diketahui"}
                {capacityPercentage !== null
                  ? ` • ${formatCapacityPercentage(capacityPercentage)}% dari kapasitas`
                  : ""}
              </Item>
              <Item label="Ruangan">{booking.roomName} ({booking.roomCode})</Item>
              <Item label="Waktu">{formatDateRange(booking.startAt, booking.endAt, timezone)}</Item>
              <Item label="Fasilitas">
                {booking.requiredFacilities.length ? facilityLabels(booking.requiredFacilities) : "Tidak ada kebutuhan khusus"}
              </Item>
              <Item label="Diajukan">{formatDateTime(booking.submittedAt, timezone)}</Item>
              <Item label="Keputusan">
                {booking.decisionAt
                  ? `${formatDateTime(booking.decisionAt, timezone)}${decisionUser ? ` • ${decisionUser.full_name}` : ""}`
                  : "Belum ada"}
              </Item>
              <div className="sm:col-span-2">
                <dt className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-muted">Tujuan kegiatan</dt>
                <dd className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{booking.activityPurpose}</dd>
              </div>
              {booking.decisionReason ? (
                <div className="sm:col-span-2">
                  <dt className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-muted">Catatan keputusan</dt>
                  <dd className="mt-1 rounded-xl bg-paper px-3 py-2 text-sm text-ink-soft">{booking.decisionReason}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          {memo ? (
            <Card>
              <CardHeader title="Internal Memo" />
              <div className="px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={memo.templateKind === "demo" ? "warning" : "brand"}>
                    {memo.templateKind === "demo" ? "DEMO — belum resmi" : "Template resmi"}
                  </Badge>
                  <Badge tone={memo.generationStatus === "ready" ? "success" : memo.generationStatus === "failed" ? "danger" : "warning"}>
                    {memo.generationStatus}
                  </Badge>
                </div>
                {memo.generationStatus === "ready" ? (
                  <a href={`/api/internal-memos/${memo.id}/download`} className={buttonClass("secondary", "sm", "mt-3")}>
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    Unduh PDF
                  </a>
                ) : memo.errorMessage ? (
                  <p className="mt-2 rounded-lg bg-danger-100 px-3 py-2 text-xs text-danger-700">{memo.errorMessage}</p>
                ) : null}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Audit trail" description="Aktor, tindakan, status, alasan, dan waktu server." />
            {audit.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">Belum ada catatan audit.</p>
            ) : (
              <ul className="divide-y divide-line">
                {audit.map((log) => (
                  <li key={log.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-ink">{actionLabel(log.action)}</p>
                      <span className="text-xs text-muted">{formatDateTime(log.created_at, timezone)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {log.actor_name ?? log.actor_label ?? "sistem"}
                      {log.reason ? ` • ${log.reason}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Status & tenggat" />
            <div className="space-y-3 px-5 py-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted">Status</span>
                <StatusBadge status={booking.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Slot ditahan</span>
                <span className="font-semibold text-ink">{booking.slotHeld ? "Ya" : "Tidak"}</span>
              </div>
              {booking.status === "pending_academic" ? (
                <>
                  <div className={`rounded-xl border px-3 py-2.5 ${overdue ? "border-danger-700/20 bg-danger-100" : "border-line bg-paper"}`}>
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                      Target 1 jam operasional
                    </p>
                    <p className={`mt-1 font-semibold ${overdue ? "text-danger-700" : "text-ink"}`}>
                      {formatDateTime(booking.decisionTargetAt, timezone)}
                    </p>
                    <p className="text-xs text-muted">
                      {overdue ? "Terlambat" : `± ${formatMinutes(targetRemaining)} tersisa`}
                    </p>
                  </div>
                  <div className={`rounded-xl border px-3 py-2.5 ${expiringSoon ? "border-danger-700/20 bg-danger-100" : "border-line bg-paper"}`}>
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                      <TimerOff className="h-3.5 w-3.5" aria-hidden="true" />
                      Batas penahanan slot
                    </p>
                    <p className={`mt-1 font-semibold ${expiringSoon ? "text-danger-700" : "text-ink"}`}>
                      {formatDateTime(booking.holdExpiresAt, timezone)}
                    </p>
                    <p className="text-xs text-muted">± {formatMinutes(holdRemaining)} operasional tersisa</p>
                  </div>
                </>
              ) : null}
            </div>
          </Card>

          {booking.status === "pending_academic" ? (
            <Card>
              <CardHeader title="Beri keputusan" description="Aksi ini dicatat dengan aktor dan waktu server." />
              <div className="px-5 py-4">
                <BookingDecisionForm bookingId={booking.id} />
              </div>
            </Card>
          ) : null}

          {booking.status === "cancelled" ? (
            <Alert tone="info" className="text-xs" title="Dibatalkan oleh pemohon">
              Pengajuan dibatalkan sebelum keputusan Akademik. Slot ruangan telah dilepas.
            </Alert>
          ) : null}

          {booking.status !== "pending_academic" && booking.status !== "cancelled" ? (
            <Alert tone="info" className="text-xs">
              Pengajuan ini tidak lagi menunggu keputusan. Perubahan status hanya melalui alur resmi dan tercatat pada
              audit trail.
            </Alert>
          ) : null}

          <div className="rounded-card border border-line bg-surface p-4 text-xs leading-relaxed text-muted">
            <p className="flex items-center gap-1.5 font-semibold text-ink-soft">
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
              Kewenangan
            </p>
            <p className="mt-1">
              Hanya pengguna dengan role Bagian Akademik yang dapat menyetujui, menolak, dan meminta revisi. Admin IT
              tidak otomatis memiliki kewenangan ini.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}
