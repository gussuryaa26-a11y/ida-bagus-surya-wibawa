import Link from "next/link";
import { CalendarSearch, DoorOpen, Filter, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listRooms } from "@/lib/rooms";
import { listRoomAvailability } from "@/lib/recommendation";
import { getScheduleFreshness } from "@/lib/schedule-import";
import { getSettings } from "@/lib/settings";
import { AppError } from "@/lib/errors";
import { defaultAvailabilityWindow, isPastDateTime } from "@/lib/operational-clock";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { RoomCard } from "@/components/room-card";
import { RoomSelectionStatus } from "@/components/room-selection-status";
import { RoomStatusManager } from "@/components/room-status-manager";
import { AvailabilityDateRangeFields } from "@/components/availability-date-range-fields";
import { getRoomSelectionState, sortRoomsByAvailability } from "@/lib/room-selection";
import { CATEGORY_LABELS, FACILITY_LABELS, formatDateTime } from "@/lib/format";
import { FACILITIES, ROOM_CATEGORIES, type RoomCategory } from "@/lib/types";

export const metadata = { title: "Ruangan Kampus" };

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const canBook = user.role === "student";
  const [params, settings] = await Promise.all([searchParams, getSettings()]);
  const first = (key: string) => (Array.isArray(params[key]) ? params[key]?.[0] : params[key]);

  const defaultWindow = defaultAvailabilityWindow(
    new Date(),
    settings.timezone,
    settings.openTime,
    settings.closeTime,
  );
  const isStudent = user.role === "student";
  const date = first("date") || (isStudent ? "" : defaultWindow.date);
  const startTime = first("startTime") || (isStudent ? "" : defaultWindow.startTime);
  const endTime = first("endTime") || (isStudent ? "" : defaultWindow.endTime);
  const needsSchedule = isStudent && (!date || !startTime || !endTime);
  const search = first("q") || "";
  const category = first("category") as RoomCategory | undefined;
  const minCapacity = first("minCapacity");
  const facility = first("facility") || "";

  let timeError: string | null = null;
  if (!needsSchedule) {
    timeError = isPastDateTime(date, startTime, settings.timezone)
      ? "Tanggal dan waktu mulai tidak boleh di masa lalu. Pilih waktu setelah sekarang."
      : endTime <= startTime
        ? "Waktu selesai harus setelah waktu mulai."
        : null;
  }

  const [rooms, availability, freshness] = await Promise.all([
    listRooms({
      search: search || undefined,
      category: ROOM_CATEGORIES.includes(category as RoomCategory) ? category : undefined,
      minCapacity: minCapacity ? Number(minCapacity) : undefined,
      facility: facility || undefined,
      includeInactive: user.role === "academic" || user.role === "student",
    }),
    needsSchedule || timeError
      ? Promise.resolve({ results: [], timezone: settings.timezone })
      : listRoomAvailability({
          date,
          startTime,
          endTime,
        }).catch((error: unknown) => {
          timeError =
            error instanceof AppError ? error.message : "Ketersediaan tidak dapat diperiksa saat ini.";
          return { results: [], timezone: settings.timezone };
        }),
    getScheduleFreshness(),
  ]);

  const availabilityByRoom = new Map(availability.results.map((result) => [result.room.id, result]));
  const orderedRooms =
    user.role === "student" ? sortRoomsByAvailability(rooms, availabilityByRoom) : rooms;

  return (
    <>
      <PageHeader
        eyebrow="Daftar & Pencarian"
        title="Ruangan kampus IDB Bali"
        description="Ketersediaan bersifat informatif berdasarkan jadwal kuliah, booking aktif, penahanan slot, dan pembatasan yang tercatat — bukan klaim ruangan kosong secara fisik."
        actions={
          canBook ? (
            <Link href="/bookings/new" className={buttonClass("primary", "md")}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Ajukan dengan rekomendasi
            </Link>
          ) : undefined
        }
      />

      {canBook ? (
        <div className="mb-6 rounded-card border border-brand-200 bg-brand-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="flex items-center gap-2 text-[0.72rem] font-bold uppercase tracking-[0.12em] text-brand-700">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Rekomendasi untuk kegiatanmu
              </p>
              <p className="mt-1 text-sm leading-relaxed text-brand-900/80">
                Rekomendasi deterministik berdasarkan jenis kegiatan, jumlah peserta, fasilitas, kapasitas terverifikasi,
                dan ketersediaan. Isi keperluan kegiatan pada alur pengajuan untuk melihat ruangan yang paling sesuai.
              </p>
            </div>
            <Link href="/bookings/new" className={buttonClass("accent", "sm")}>
              Mulai rekomendasi
            </Link>
          </div>
        </div>
      ) : null}

      <Card className="mb-6">
        <form method="get" className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-7">
          <div className="xl:col-span-2">
            <label htmlFor="q" className="field-label">
              Cari ruangan
            </label>
            <input id="q" name="q" defaultValue={search} placeholder="Nama, kode, atau lokasi" className="field-input" />
          </div>
          <div>
            <label htmlFor="category" className="field-label">
              Kategori
            </label>
            <select id="category" name="category" defaultValue={category ?? ""} className="field-input">
              <option value="">Semua</option>
              {ROOM_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="minCapacity" className="field-label">
              Kapasitas min.
            </label>
            <input
              id="minCapacity"
              name="minCapacity"
              type="number"
              min={1}
              defaultValue={minCapacity ?? ""}
              className="field-input"
            />
          </div>
          <div>
            <label htmlFor="facility" className="field-label">
              Fasilitas
            </label>
            <select id="facility" name="facility" defaultValue={facility} className="field-input">
              <option value="">Semua</option>
              {FACILITIES.map((value) => (
                <option key={value} value={value}>
                  {FACILITY_LABELS[value] ?? value}
                </option>
              ))}
            </select>
          </div>
          <AvailabilityDateRangeFields
            timezone={settings.timezone}
            initialDate={date}
            initialStartTime={startTime}
            initialEndTime={endTime}
            idPrefix="rooms-filter"
            dateLabel="Tanggal cek"
            timeWrapperClassName="grid grid-cols-2 gap-2"
          />
          <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-7">
            <button type="submit" className={buttonClass("primary", "md")}>
              <Filter className="h-4 w-4" aria-hidden="true" />
              Terapkan filter & cek ketersediaan
            </button>
            <Link href="/rooms" className={buttonClass("ghost", "md")}>
              Reset
            </Link>
          </div>
        </form>
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {needsSchedule ? (
            <Badge tone="neutral">Tanggal & waktu belum dipilih</Badge>
          ) : (
            <Badge tone="brand">
              <CalendarSearch className="h-3.5 w-3.5" aria-hidden="true" />
              Cek: {date} • {startTime}–{endTime}
            </Badge>
          )}
          <Badge tone={freshness.isStale ? "warning" : "success"}>
            {freshness.lastImportAt
              ? `Jadwal diperbarui ${formatDateTime(freshness.lastImportAt, settings.timezone)}`
              : "Belum ada impor jadwal"}
          </Badge>
        </div>
        <p className="text-xs text-muted">
          {needsSchedule
            ? "Ketersediaan belum dicek"
            : timeError
              ? "Perbaiki tanggal/jam"
              : `${rooms.length} ruangan ditampilkan`}
        </p>
      </div>

      {freshness.isStale ? (
        <Alert tone="warning" className="mb-5">
          Data jadwal melewati kebijakan kesegaran {freshness.freshnessDays} hari. Pengajuan baru akan ditolak sampai
          pengelola memperbarui jadwal, kecuali kebijakan diubah Akademik/Admin.
        </Alert>
      ) : null}

      {timeError ? (
        <Alert tone="danger" className="mb-5" title="Waktu tidak valid">
          {timeError}
        </Alert>
      ) : null}

      {needsSchedule ? (
        <Card className="p-10 text-center">
          <CalendarSearch className="mx-auto h-8 w-8 text-brand-600" aria-hidden="true" />
          <p className="mt-3 font-display text-lg font-semibold text-ink">Tentukan tanggal dan waktu</p>
          <p className="mt-1 text-sm text-muted">
            Masukkan tanggal, jam mulai, dan jam selesai untuk melihat ketersediaan ruangan.
          </p>
        </Card>
      ) : timeError ? (
        <Card className="p-10 text-center">
          <CalendarSearch className="mx-auto h-8 w-8 text-brand-600" aria-hidden="true" />
          <p className="mt-3 font-display text-lg font-semibold text-ink">Perbaiki tanggal dan jam</p>
          <p className="mt-1 text-sm text-muted">
            Pilih tanggal hari ini atau setelahnya, lalu gunakan jam setelah waktu sekarang.
          </p>
        </Card>
      ) : rooms.length === 0 ? (
        <Card className="p-10 text-center">
          <DoorOpen className="mx-auto h-8 w-8 text-brand-600" aria-hidden="true" />
          <p className="mt-3 font-display text-lg font-semibold text-ink">Tidak ada ruangan yang cocok</p>
          <p className="mt-1 text-sm text-muted">Ubah kata kunci atau filter pencarian.</p>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {orderedRooms.map((room) => {
            const result =
              availabilityByRoom.get(room.id) ??
              (!room.isActive
                ? {
                    available: false,
                    code: "room_inactive" as const,
                    label: "Ruangan tidak aktif",
                    reasons: [
                      room.statusNote
                        ? `Ruangan dinonaktifkan: ${room.statusNote}`
                        : "Ruangan dinonaktifkan.",
                    ],
                    blockReason: "room_inactive" as const,
                    capacity: null,
                  }
                : undefined);
            const selection = getRoomSelectionState(result);
            return (
              <RoomCard
                key={room.id}
                room={room}
                availability={result}
                imageLink={`/rooms/${room.id}`}
                footer={
                  user.role === "academic" ? (
                    <RoomStatusManager
                      roomId={room.id}
                      roomName={room.name}
                      isActive={room.isActive}
                      statusNote={room.statusNote}
                      compact
                    />
                  ) : canBook && selection.selectable ? (
                    <Link
                      href={`/bookings/new?roomId=${room.id}&date=${date}&startTime=${startTime}&endTime=${endTime}`}
                      className={buttonClass("secondary", "sm", "w-full")}
                    >
                      Pilih Ruangan
                    </Link>
                  ) : (
                    <RoomSelectionStatus
                      state={
                        canBook
                          ? selection
                          : { ...selection, selectable: false, label: selection.statusLabel }
                      }
                    />
                  )
                }
              />
            );
          })}
        </div>
      )}
    </>
  );
}
