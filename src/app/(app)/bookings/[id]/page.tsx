import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ClipboardCheck,
  Clock3,
  Download,
  FileText,
  Gavel,
  Info,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getBookingForUser } from "@/lib/bookings";
import { getMemoForBooking } from "@/lib/memos";
import { getClockConfig, getSettings } from "@/lib/settings";
import { formatCapacityPercentage, getCapacityPercentage } from "@/lib/capacity";
import { operationalMinutesBetween } from "@/lib/operational-clock";
import { listAuditLogs } from "@/lib/reports";
import { queryOne } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { CancelPendingButton } from "@/components/cancel-pending-button";
import { MemoRetryButton } from "@/components/memo-retry-button";
import {
  ACTIVITY_LABELS,
  actionLabel,
  facilityLabels,
  formatDateRange,
  formatDateTime,
  formatMinutes,
} from "@/lib/format";
import type { ActivityType } from "@/lib/types";

export const metadata = { title: "Detail Pengajuan" };

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const booking = await getBookingForUser(id, user);
  if (!booking) notFound();

  const [settings, config, memo, decisionUser] = await Promise.all([
    getSettings(),
    getClockConfig(),
    getMemoForBooking(id),
    booking.decisionBy
      ? queryOne<{ full_name: string }>("SELECT full_name FROM users WHERE id = $1", [booking.decisionBy])
      : Promise.resolve(null),
  ]);
  const audit =
    user.role === "academic"
      ? await listAuditLogs({ entityType: "booking_request", entityId: id, limit: 30 })
      : [];
  const query = await searchParams;
  const submitted = query.submitted === "1";
  const timezone = settings.timezone;
  const now = new Date();
  const isOwner = booking.requesterId === user.id;
  const targetRemaining = operationalMinutesBetween(now, booking.decisionTargetAt, config);
  const holdRemaining = operationalMinutesBetween(now, booking.holdExpiresAt, config);
  const overdue = booking.status === "pending_academic" && booking.decisionTargetAt.getTime() <= now.getTime();
  const capacityPercentage =
    booking.capacityPercentageSnapshot ??
    getCapacityPercentage(booking.participantCount, booking.roomCapacity);
  const cancelledBeforeApproval = booking.status === "cancelled" && booking.cancelledAt !== null;

  const timeline = [
    {
      label: "Pengajuan tersimpan",
      at: booking.submittedAt,
      detail: `Target keputusan ${formatDateTime(booking.decisionTargetAt, timezone)} • batas penahanan ${formatDateTime(
        booking.holdExpiresAt,
        timezone,
      )}`,
      icon: <ClipboardCheck className="h-4 w-4" />,
    },
    ...(booking.decisionAt
      ? [
          {
            label:
              booking.status === "approved"
                ? "Disetujui Bagian Akademik"
                : booking.status === "rejected"
                  ? "Ditolak Bagian Akademik"
                  : booking.status === "revision_requested"
                    ? "Revisi diminta"
                    : "Keputusan Akademik",
            at: booking.decisionAt,
            detail: booking.decisionReason ?? "—",
            icon: <Gavel className="h-4 w-4" />,
          },
        ]
      : []),
    ...(booking.status === "cancelled" && booking.cancelledAt
      ? [
          {
            label: "Dibatalkan oleh pemohon",
            at: booking.cancelledAt,
            detail: booking.cancellationReason ?? "Dibatalkan sebelum keputusan Akademik.",
            icon: <RotateCcw className="h-4 w-4" />,
          },
        ]
      : []),
    ...(memo?.generatedAt
      ? [
          {
            label: "Internal Memo dibuat",
            at: memo.generatedAt,
            detail: memo.templateKind === "demo" ? "Template DEMO — belum resmi" : "Template resmi",
            icon: <FileText className="h-4 w-4" />,
          },
        ]
      : []),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <>
      <div className="mb-4">
        <Link
          href={user.role === "academic" ? "/academic" : "/bookings"}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {user.role === "academic" ? "Kembali ke antrean Akademik" : "Kembali ke pengajuan saya"}
        </Link>
      </div>

      {submitted ? (
        <Alert tone="success" className="mb-5" title="Pengajuan berhasil dikirim">
          Slot ditahan sementara dan pengajuan masuk antrean Bagian Akademik. Pantau status dan batas waktu di halaman
          ini.
        </Alert>
      ) : null}

      {booking.capacityReviewRequired &&
      (booking.status === "pending_academic" || booking.status === "revision_requested") ? (
        <Alert tone="warning" className="mb-5" title="Perlu validasi kapasitas">
          Jumlah peserta {booking.participantCount} orang
          {capacityPercentage !== null
            ? ` (${formatCapacityPercentage(capacityPercentage)}% dari kapasitas ${
                booking.roomCapacity ?? "ruangan"
              } orang)`
            : ""}{" "}
          melebihi kapasitas ruangan. Pengajuan tetap menunggu keputusan Bagian Akademik dan belum dianggap disetujui.
        </Alert>
      ) : null}

      <PageHeader
        eyebrow={`Pengajuan • ${booking.id.slice(0, 8).toUpperCase()}`}
        title={booking.activityName}
        description={`${booking.organizationName}${booking.organizationCode ? ` (${booking.organizationCode})` : ""} • ${booking.roomName} • ${formatDateRange(
          booking.startAt,
          booking.endAt,
          timezone,
        )}`}
        actions={
          <>
            <StatusBadge status={booking.status} />
            {booking.capacityReviewRequired ? <Badge tone="warning">Validasi kapasitas</Badge> : null}
            {user.role === "academic" && booking.status === "pending_academic" ? (
              <Link href={`/academic/${booking.id}`} className={buttonClass("primary", "sm")}>
                <Gavel className="h-4 w-4" aria-hidden="true" />
                Buka panel keputusan
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Detail kegiatan" description="Data yang dinilai Bagian Akademik." />
            <dl className="grid gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2">
              <DetailItem label="Organisasi">{booking.organizationName}</DetailItem>
              <DetailItem label="Jabatan pemohon">{booking.orgPositionSnapshot ?? "—"}</DetailItem>
              <DetailItem label="Pemohon">
                {booking.requesterName}
                {booking.requesterNim ? ` • NIM ${booking.requesterNim}` : ""}
              </DetailItem>
              <DetailItem label="Program studi">{booking.requesterProgramStudy ?? "—"}</DetailItem>
              {user.role === "academic" ? (
                <DetailItem label="Kontak pemohon">
                  {[booking.requesterPhone, booking.requesterEmail].filter(Boolean).join(" • ") || "—"}
                </DetailItem>
              ) : null}
              <DetailItem label="Jenis kegiatan">{ACTIVITY_LABELS[booking.activityType as ActivityType] ?? booking.activityType}</DetailItem>
              <DetailItem label="Jumlah peserta">{booking.participantCount} orang</DetailItem>
              <DetailItem label="Kapasitas ruangan">
                {booking.roomCapacity ? `${booking.roomCapacity} orang` : "Belum diketahui"}
                {capacityPercentage !== null
                  ? ` • ${formatCapacityPercentage(capacityPercentage)}% dari kapasitas`
                  : ""}
              </DetailItem>
              <DetailItem label="Ruangan">
                {booking.roomName} ({booking.roomCode})
              </DetailItem>
              <DetailItem label="Waktu">{formatDateRange(booking.startAt, booking.endAt, timezone)}</DetailItem>
              <DetailItem label="Fasilitas">
                {booking.requiredFacilities.length ? facilityLabels(booking.requiredFacilities) : "Tidak ada kebutuhan khusus"}
              </DetailItem>
              <DetailItem label="Diputuskan">
                {booking.decisionAt ? `${formatDateTime(booking.decisionAt, timezone)}${decisionUser ? ` • ${decisionUser.full_name}` : ""}` : "Belum diputuskan"}
              </DetailItem>
              <div className="sm:col-span-2">
                <dt className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-muted">Tujuan kegiatan</dt>
                <dd className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{booking.activityPurpose}</dd>
              </div>
              {booking.decisionReason ? (
                <div className="sm:col-span-2">
                  <dt className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-muted">Catatan keputusan</dt>
                  <dd className="mt-1 rounded-xl bg-paper px-3 py-2 text-sm leading-relaxed text-ink-soft">
                    {booking.decisionReason}
                  </dd>
                </div>
              ) : null}
            </dl>
          </Card>

          {booking.status === "cancelled" ? (
            <Card>
              <CardHeader
                title="Pengajuan dibatalkan"
                description="Dibatalkan oleh pemohon sebelum keputusan Akademik."
                action={<Badge tone="neutral">Slot dilepas</Badge>}
              />
              <div className="px-5 py-4 text-sm leading-relaxed text-ink-soft">
                <p>
                  Dibatalkan{" "}
                  {booking.cancelledAt ? formatDateTime(booking.cancelledAt, timezone) : "sebelum keputusan Akademik"}.
                </p>
                {booking.cancellationReason ? (
                  <p className="mt-2 rounded-xl bg-paper px-3 py-2">Alasan: {booking.cancellationReason}</p>
                ) : null}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Internal Memo"
              description="Dokumen hanya dibuat setelah booking disetujui. Kegagalan dokumen tidak membatalkan booking."
            />
            <div className="px-5 py-5">
              {cancelledBeforeApproval ? (
                <p className="text-sm text-muted">
                  Internal Memo tidak dibuat karena pengajuan dibatalkan sebelum persetujuan Akademik.
                </p>
              ) : booking.status === "approved" || booking.status === "cancellation_requested" || booking.status === "cancelled" ? (
                memo ? (
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={memo.templateKind === "demo" ? "warning" : "brand"}>
                          {memo.templateKind === "demo" ? "DEMO — belum resmi" : "Template resmi"}
                        </Badge>
                        <Badge tone={memo.generationStatus === "ready" ? "success" : memo.generationStatus === "failed" ? "danger" : "warning"}>
                          {memo.generationStatus === "ready"
                            ? "Siap diunduh"
                            : memo.generationStatus === "failed"
                              ? "Gagal dibuat"
                              : "Sedang diproses"}
                        </Badge>
                        <span className="text-xs text-muted">Versi dokumen {memo.documentVersion}</span>
                      </div>
                      <p className="mt-2 text-sm text-ink-soft">
                        {memo.documentNumber ? `Nomor: ${memo.documentNumber} (bukan nomor resmi)` : "Nomor resmi belum tersedia."}
                      </p>
                      {memo.generatedAt ? (
                        <p className="text-xs text-muted">Dibuat {formatDateTime(memo.generatedAt, timezone)}</p>
                      ) : null}
                      {memo.errorMessage ? (
                        <p className="mt-2 rounded-lg bg-danger-100 px-3 py-2 text-xs text-danger-700">
                          {memo.errorMessage}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-start gap-2">
                      {memo.generationStatus === "ready" ? (
                        <a href={`/api/internal-memos/${memo.id}/download`} className={buttonClass("primary", "sm")}>
                          <Download className="h-4 w-4" aria-hidden="true" />
                          Unduh PDF
                        </a>
                      ) : null}
                      {memo.generationStatus === "failed" && isOwner ? <MemoRetryButton bookingId={booking.id} /> : null}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted">Memo belum dibuat. Sistem akan mencoba membuat setelah persetujuan.</p>
                    {isOwner ? <MemoRetryButton bookingId={booking.id} /> : null}
                  </div>
                )
              ) : (
                <p className="text-sm text-muted">Internal Memo hanya tersedia setelah booking disetujui Bagian Akademik.</p>
              )}
            </div>
          </Card>

          {user.role === "academic" && audit.length > 0 ? (
            <Card>
              <CardHeader title="Audit trail pengajuan" description="Catatan tindakan penting (tidak dapat diubah pengguna biasa)." />
              <ul className="divide-y divide-line">
                {audit.map((log) => (
                  <li key={log.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-ink">{actionLabel(log.action)}</p>
                      <span className="text-xs text-muted">{formatDateTime(log.created_at, timezone)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      Aktor: {log.actor_name ?? log.actor_label ?? "sistem"}
                      {log.reason ? ` • ${log.reason}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Status & tenggat" />
            <div className="space-y-4 px-5 py-5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">Status</span>
                <StatusBadge status={booking.status} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">Slot ditahan</span>
                <span className="font-semibold text-ink">{booking.slotHeld ? "Ya" : "Tidak"}</span>
              </div>

              {booking.status === "pending_academic" ? (
                <>
                  <div className="rounded-xl border border-line bg-paper px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                      Target keputusan
                    </p>
                    <p className="mt-1 font-semibold text-ink">{formatDateTime(booking.decisionTargetAt, timezone)}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {overdue ? "Melewati target" : `± ${formatMinutes(targetRemaining)} operasional tersisa`}
                    </p>
                  </div>
                  <div className="rounded-xl border border-line bg-paper px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                      Batas penahanan slot
                    </p>
                    <p className="mt-1 font-semibold text-ink">{formatDateTime(booking.holdExpiresAt, timezone)}</p>
                    <p className="mt-0.5 text-xs text-muted">± {formatMinutes(holdRemaining)} operasional tersisa</p>
                  </div>
                  <p className="text-xs leading-relaxed text-muted">
                    Timer hanya berjalan pada jam operasional Akademik. Job kedaluwarsa berjalan di server; keputusan yang
                    sudah tersimpan tidak ditimpa.
                  </p>
                  <p className="text-xs leading-relaxed text-muted">
                    Selama masih menunggu keputusan Akademik, Anda dapat membatalkan pengajuan ini. Slot ruangan akan
                    langsung dilepas.
                  </p>
                  {isOwner ? (
                    <div className="border-t border-line pt-3">
                      <CancelPendingButton bookingId={booking.id} />
                    </div>
                  ) : null}
                </>
              ) : null}

              {booking.status === "revision_requested" ? (
                <>
                  <Alert tone="warning" className="text-xs">
                    {booking.decisionReason ?? "Akademik meminta revisi."}
                  </Alert>
                  {booking.revisionDeadlineAt ? (
                    <p className="text-xs text-muted">
                      Batas penahanan revisi: {formatDateTime(booking.revisionDeadlineAt, timezone)}
                    </p>
                  ) : (
                    <p className="text-xs text-muted">Slot telah dilepas. Pengiriman ulang akan memeriksa ketersediaan.</p>
                  )}
                </>
              ) : null}

              {booking.status === "approved" ? (
                <Alert tone="success" className="text-xs" title="Booking terkonfirmasi">
                  Booking sudah disetujui Akademik. Pembatalan tidak dapat dilakukan setelah persetujuan.
                </Alert>
              ) : null}

              {booking.status === "cancelled" ? (
                <Alert tone="info" className="text-xs" title="Pengajuan dibatalkan">
                  Pengajuan dibatalkan oleh pemohon sebelum keputusan Akademik. Slot ruangan telah dilepas.
                </Alert>
              ) : null}

              {booking.status === "expired" ? (
                <Alert tone="warning" className="text-xs" title="Pengajuan kedaluwarsa">
                  Slot telah dilepas. Silakan ajukan kembali dengan memeriksa ketersediaan terbaru.
                </Alert>
              ) : null}

              {booking.status === "rejected" ? (
                <Alert tone="danger" className="text-xs" title="Pengajuan ditolak">
                  {booking.decisionReason ?? "Slot telah dilepas setelah keputusan tersimpan."}
                </Alert>
              ) : null}
            </div>

            {booking.status === "revision_requested" && isOwner ? (
              <div className="border-t border-line px-5 py-4">
                <Link href={`/bookings/${booking.id}/revise`} className={buttonClass("primary", "sm", "w-full")}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Perbaiki pengajuan
                </Link>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Linimasa" />
            <ol className="space-y-4 px-5 py-5">
              {timeline.map((item, index) => (
                <li key={`${item.label}-${index}`} className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                    {item.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{item.label}</p>
                    <p className="text-xs text-muted">{formatDateTime(item.at, timezone)}</p>
                    <p className="mt-0.5 break-words text-xs leading-relaxed text-muted">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <div className="rounded-card border border-line bg-surface p-4 text-xs leading-relaxed text-muted">
            <p className="flex items-center gap-1.5 font-semibold text-ink-soft">
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
              Data demo & privasi
            </p>
            <p className="mt-1">
              {booking.status === "pending_academic" || booking.status === "revision_requested"
                ? "Status ini dapat berubah menjadi kedaluwarsa jika batas penahanan terlewati. "
                : ""}
              Data pada halaman ini hanya dapat diakses pemohon dan Bagian Akademik yang berwenang.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}
