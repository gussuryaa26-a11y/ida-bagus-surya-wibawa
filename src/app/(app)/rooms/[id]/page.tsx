import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarSearch, DoorOpen, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getRoomById } from "@/lib/rooms";
import { checkRoomAvailability } from "@/lib/availability";
import { getScheduleFreshness } from "@/lib/schedule-import";
import { getSettings } from "@/lib/settings";
import {
  combineDateAndTime,
  defaultAvailabilityWindow,
  isPastDateTime,
} from "@/lib/operational-clock";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { RoomSelectionStatus } from "@/components/room-selection-status";
import { RoomStatusManager } from "@/components/room-status-manager";
import { AvailabilityDateRangeFields } from "@/components/availability-date-range-fields";
import { getRoomSelectionState } from "@/lib/room-selection";
import { CATEGORY_LABELS, FACILITY_LABELS, formatDateTime } from "@/lib/format";

export const metadata = { title: "Detail Ruangan" };

export default async function RoomDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const canBook = user.role === "student";
  const { id } = await params;
  const room = await getRoomById(id, true);
  if (!room) notFound();
  const settings = await getSettings();
  const timezone = settings.timezone;
  const query = await searchParams;
  const first = (key: string) => (Array.isArray(query[key]) ? query[key]?.[0] : query[key]);
  const defaultWindow = defaultAvailabilityWindow(
    new Date(),
    timezone,
    settings.openTime,
    settings.closeTime,
  );
  const date = first("date") || defaultWindow.date;
  const startTime = first("startTime") || defaultWindow.startTime;
  const endTime = first("endTime") || defaultWindow.endTime;
  const freshness = await getScheduleFreshness();

  let availability = null;
  let timeError: string | null = null;
  try {
    const startAt = combineDateAndTime(date, startTime, timezone);
    const endAt = combineDateAndTime(date, endTime, timezone);
    if (isPastDateTime(date, startTime, timezone)) {
      timeError = "Tanggal dan waktu mulai tidak boleh di masa lalu. Pilih waktu setelah sekarang.";
    } else if (endAt <= startAt) {
      timeError = "Waktu selesai harus setelah waktu mulai.";
    } else {
      availability = await checkRoomAvailability({ roomId: room.id, startAt, endAt });
    }
  } catch {
    timeError = "Rentang waktu tidak valid.";
  }
  const selection = availability ? getRoomSelectionState(availability) : null;

  return (
    <>
      <div className="mb-4">
        <Link href="/rooms" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Kembali ke daftar ruangan
        </Link>
      </div>

      <PageHeader
        eyebrow={CATEGORY_LABELS[room.category]}
        title={room.name}
        description={[`Kode ${room.code}`, room.location ? `Lokasi: ${room.location}` : null]
          .filter(Boolean)
          .join(" • ")}
        actions={
          !room.isActive ? (
            <Badge tone="danger">Ruangan tidak aktif</Badge>
          ) : timeError ? (
            <Badge tone="danger">Waktu tidak valid</Badge>
          ) : canBook ? (
            selection && !selection.selectable ? (
              <RoomSelectionStatus state={selection} className="sm:w-auto sm:min-w-56" />
            ) : (
              <Link
                href={`/bookings/new?roomId=${room.id}&date=${date}&startTime=${startTime}&endTime=${endTime}`}
                className={buttonClass("primary", "md")}
              >
                <DoorOpen className="h-4 w-4" aria-hidden="true" />
                Pilih Ruangan
              </Link>
            )
          ) : selection ? (
            <RoomSelectionStatus
              state={{ ...selection, selectable: false, label: selection.statusLabel }}
              className="sm:w-auto sm:min-w-56"
            />
          ) : null
        }
      />

      {!room.isActive ? (
        <Alert tone="danger" className="mb-5" title="Ruangan tidak aktif">
          {room.statusNote ?? "Ruangan sedang tidak aktif."} Pengajuan baru akan ditolak server.
        </Alert>
      ) : null}
      {room.isDemoData ? (
        <Alert tone="warning" className="mb-5">
          Data kapasitas/fasilitas ruangan ini masih DEMO dan belum diverifikasi kampus. Sistem menampilkan penanda DEMO
          pada kapasitas.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <div className="card-surface overflow-hidden">
            <div className="relative aspect-[16/9] bg-brand-100">
              {room.imagePath ? (
                <Image
                  src={room.imagePath}
                  alt={`Foto ${room.name}`}
                  fill
                  sizes="(max-width: 1024px) 100vw, 65vw"
                  className="object-cover"
                  priority
                />
              ) : (
                <div className="flex h-full items-center justify-center text-brand-700">
                  <DoorOpen className="h-12 w-12" aria-hidden="true" />
                </div>
              )}
              <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                <Badge tone="brand" className="bg-surface/95">{CATEGORY_LABELS[room.category]}</Badge>
                {selection ? (
                  <Badge tone={selection.tone} className="bg-surface/95">
                    {selection.statusLabel}
                  </Badge>
                ) : null}
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm leading-relaxed text-ink-soft">{room.description}</p>
              {room.imageNote ? <p className="mt-2 text-xs text-muted">{room.imageNote}</p> : null}
            </div>
          </div>

          <div className="card-surface p-5">
            <h2 className="font-display text-lg font-semibold text-ink">Fasilitas tercatat</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {room.facilities.length === 0 ? (
                <p className="text-sm text-muted">Data fasilitas belum diketahui.</p>
              ) : (
                room.facilities.map((facility) => (
                  <Badge key={facility} tone="neutral">
                    {FACILITY_LABELS[facility] ?? facility}
                  </Badge>
                ))
              )}
            </div>
            <p className="mt-3 text-xs text-muted">
              {room.facilitiesVerified ? "Data fasilitas terverifikasi." : "Data fasilitas belum diverifikasi kampus."}
            </p>
          </div>
        </div>

        <aside className="space-y-5">
          <div className="card-surface p-5">
            <h2 className="font-display text-lg font-semibold text-ink">Kapasitas</h2>
            <p className="mt-2 flex items-center gap-2 font-display text-2xl font-semibold text-ink">
              <Users className="h-5 w-5 text-brand-700" aria-hidden="true" />
              {room.capacity ? `${room.capacity} orang` : "Belum diketahui"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {room.capacityVerified
                ? "Terverifikasi kampus."
                : room.isDemoData
                  ? "DEMO — belum diverifikasi kampus."
                  : "Belum diverifikasi kampus."}
            </p>
          </div>

          {user.role === "academic" ? (
            <RoomStatusManager
              roomId={room.id}
              roomName={room.name}
              isActive={room.isActive}
              statusNote={room.statusNote}
            />
          ) : null}

          <div className="card-surface p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <CalendarSearch className="h-4 w-4 text-brand-700" aria-hidden="true" />
              Cek ketersediaan
            </h2>
            <form method="get" className="mt-3 grid grid-cols-2 gap-2">
              <AvailabilityDateRangeFields
                timezone={timezone}
                initialDate={date}
                initialStartTime={startTime}
                initialEndTime={endTime}
                idPrefix="room-detail"
                dateWrapperClassName="col-span-2"
                timeWrapperClassName="contents"
              />
              <button type="submit" className={buttonClass("secondary", "sm", "col-span-2")}>
                Periksa ketersediaan
              </button>
            </form>
            {timeError ? (
              <p className="mt-3 text-xs text-danger-700">{timeError}</p>
            ) : availability ? (
              <div className="mt-3 rounded-xl bg-paper px-3 py-2.5 text-sm">
                <p className="font-semibold text-ink">{selection?.statusLabel ?? availability.label}</p>
                <ul className="mt-1 space-y-1 text-xs leading-relaxed text-muted">
                  {availability.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-3 text-xs text-danger-700">Rentang waktu tidak valid.</p>
            )}
            <p className="mt-3 text-[0.68rem] leading-relaxed text-muted">
              Status informatif berdasarkan data tercatat. Server memeriksa ulang saat pengajuan dikirim.
            </p>
          </div>

          <div className="rounded-card border border-line bg-surface p-4 text-xs leading-relaxed text-muted">
            <p className="font-semibold text-ink-soft">Pembaruan data</p>
            <p className="mt-1">
              {freshness.lastImportAt
                ? `Jadwal terakhir diimpor ${formatDateTime(freshness.lastImportAt, timezone)}.`
                : "Belum ada impor jadwal yang tercatat."}
            </p>
            <p className="mt-1">
              {freshness.isStale
                ? `Data melewati batas kesegaran ${freshness.freshnessDays} hari; pengajuan baru dapat ditolak.`
                : "Data jadwal masih dalam batas kesegaran."}
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
