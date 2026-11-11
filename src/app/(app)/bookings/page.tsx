import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2, Filter, ClipboardList } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listMyBookings } from "@/lib/bookings";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { BOOKING_STATUSES, type BookingStatus } from "@/lib/types";
import { STATUS_LABELS, formatDateRange, formatDateTime } from "@/lib/format";

export const metadata = { title: "Pengajuan Saya" };

export default async function MyBookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (user.role !== "student") redirect("/dashboard");
  const [settings, params] = await Promise.all([getSettings(), searchParams]);
  const first = (key: string) => (Array.isArray(params[key]) ? params[key]?.[0] : params[key]);
  const statusParam = first("status") as BookingStatus | undefined;
  const status = BOOKING_STATUSES.includes(statusParam as BookingStatus) ? statusParam : undefined;
  const search = first("q") ?? "";
  const bookings = await listMyBookings(user.id, { status, search: search || undefined });

  return (
    <>
      <PageHeader
        eyebrow="Riwayat & Status"
        title="Pengajuan saya"
        description="Seluruh pengajuan organisasi yang Anda buat, termasuk yang menunggu keputusan, disetujui, perlu revisi, atau kedaluwarsa."
        actions={
          <Link href="/bookings/new" className={buttonClass("primary", "md")}>
            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
            Pengajuan baru
          </Link>
        }
      />

      <Card className="mb-5">
        <form method="get" className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-48 flex-1">
            <label htmlFor="q" className="field-label">
              Cari
            </label>
            <input id="q" name="q" defaultValue={search} placeholder="Nama kegiatan atau ruangan" className="field-input" />
          </div>
          <div className="w-full sm:w-56">
            <label htmlFor="status" className="field-label">
              Status
            </label>
            <select id="status" name="status" defaultValue={status ?? ""} className="field-input">
              <option value="">Semua status</option>
              {BOOKING_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={buttonClass("secondary", "md")}>
            <Filter className="h-4 w-4" aria-hidden="true" />
            Terapkan
          </button>
          <Link href="/bookings" className={buttonClass("ghost", "md")}>
            Reset
          </Link>
        </form>
      </Card>

      <Card>
        {bookings.length === 0 ? (
          <EmptyState
            title="Belum ada pengajuan"
            description="Pengajuan yang tersimpan akan muncul di sini beserta status dan tenggatnya."
            icon={<ClipboardList className="h-5 w-5" />}
            action={
              <Link href="/bookings/new" className={buttonClass("primary", "sm")}>
                Mulai pengajuan
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table min-w-[56rem]">
              <thead>
                <tr>
                  <th>Kegiatan</th>
                  <th>Ruangan</th>
                  <th>Jadwal kegiatan</th>
                  <th>Diajukan</th>
                  <th>Status</th>
                  <th aria-label="Tindakan" />
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.id}>
                    <td>
                      <Link href={`/bookings/${booking.id}`} className="font-semibold text-ink hover:text-brand-700">
                        {booking.activityName}
                      </Link>
                      <p className="text-xs text-muted">
                        {booking.participantCount} peserta • {booking.organizationName}
                      </p>
                    </td>
                    <td>
                      <p className="font-medium text-ink">{booking.roomName}</p>
                      <p className="text-xs text-muted">{booking.roomCode}</p>
                    </td>
                    <td className="text-ink-soft">{formatDateRange(booking.startAt, booking.endAt, settings.timezone)}</td>
                    <td className="text-ink-soft">{formatDateTime(booking.submittedAt, settings.timezone)}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={booking.status} />
                        {booking.capacityReviewRequired ? (
                          <Badge tone="warning">Validasi kapasitas</Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="text-right">
                      <Link href={`/bookings/${booking.id}`} className={buttonClass("secondary", "sm")}>
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
