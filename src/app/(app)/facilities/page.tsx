import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Building2, CalendarDays, Upload } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getFacilityDashboard, listPostApprovalConflicts } from "@/lib/reports";
import { listRestrictions, listRooms } from "@/lib/rooms";
import { getSettings } from "@/lib/settings";
import { dateKeyInTimezone } from "@/lib/operational-clock";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { RoomManager, type RoomAdminRow } from "@/components/room-manager";
import { RestrictionManager, type RestrictionRow } from "@/components/restriction-manager";
import { formatDate, formatDateTime, RESTRICTION_LABELS } from "@/lib/format";

export const metadata = { title: "Kelola Fasilitas" };

export default async function FacilitiesPage() {
  const user = await requireUser();
  if (user.role !== "facility_manager") redirect(user.role === "admin_it" ? "/admin" : "/dashboard");
  const [settings, dashboard, rooms, restrictions, conflicts] = await Promise.all([
    getSettings(),
    getFacilityDashboard(),
    listRooms({ includeInactive: true }),
    listRestrictions(),
    listPostApprovalConflicts(),
  ]);
  const timezone = settings.timezone;

  const roomRows: RoomAdminRow[] = rooms.map((room) => ({
    id: room.id,
    code: room.code,
    name: room.name,
    category: room.category,
    capacity: room.capacity,
    capacityVerified: room.capacityVerified,
    facilities: room.facilities,
    facilitiesVerified: room.facilitiesVerified,
    description: room.description,
    location: room.location,
    imagePath: room.imagePath,
    imageNote: room.imageNote,
    isActive: room.isActive,
    isDemoData: room.isDemoData,
    dataSource: room.dataSource,
  }));

  const restrictionRows: RestrictionRow[] = restrictions.map((restriction) => ({
    id: restriction.id,
    roomName: restriction.room_name,
    roomCode: restriction.room_code,
    startLabel: formatDateTime(restriction.start_at, timezone),
    endLabel: formatDateTime(restriction.end_at, timezone),
    type: restriction.restriction_type,
    reason: restriction.reason,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Pengelola Fasilitas"
        title="Data ruangan & pembatasan"
        description="Kelola kapasitas, fasilitas, penutupan, dan pemeliharaan. Pengelola fasilitas tidak otomatis memiliki kewenangan persetujuan booking."
        actions={
          <>
            <Link href="/facilities/import" className={buttonClass("secondary", "md")}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              Impor jadwal
            </Link>
            <Link href="/facilities/calendar" className={buttonClass("secondary", "md")}>
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              Kalender
            </Link>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total ruangan" value={dashboard.totalRooms} icon={<Building2 className="h-5 w-5" />} tone="brand" />
        <StatCard label="Aktif" value={dashboard.activeRooms} />
        <StatCard
          label="Data belum terverifikasi"
          value={dashboard.unverifiedRooms}
          hint={`${dashboard.demoRooms} ruangan berlabel DEMO`}
          tone={dashboard.unverifiedRooms > 0 ? "accent" : "default"}
        />
        <StatCard
          label="Pembatasan mendatang"
          value={dashboard.upcomingRestrictions}
          hint={`Data jadwal: ${dashboard.freshness.lastImportAt ? formatDate(dashboard.freshness.lastImportAt, timezone) : "belum ada impor"}`}
          tone={dashboard.freshness.isStale ? "danger" : "default"}
        />
      </section>

      {dashboard.freshness.isStale ? (
        <Alert tone="warning" className="mt-5" title="Data jadwal perlu diperbarui">
          {dashboard.freshness.lastImportAt
            ? `Impor terakhir ${formatDateTime(dashboard.freshness.lastImportAt, timezone)} (${dashboard.freshness.daysSince} hari lalu), melewati kebijakan ${dashboard.freshness.freshnessDays} hari.`
            : "Belum ada impor jadwal yang tercatat."}{" "}
          Pengajuan baru akan ditolak sampai jadwal diperbarui.{" "}
          <Link href="/facilities/import" className="underline">
            Impor sekarang
          </Link>
          .
        </Alert>
      ) : null}

      {conflicts.length > 0 ? (
        <Card className="mt-5">
          <CardHeader
            title="Konflik pasca-persetujuan"
            description="Booking tidak dibatalkan otomatis. Akademik perlu meninjau."
            action={<Badge tone="warning">{conflicts.length} belum selesai</Badge>}
          />
          <ul className="divide-y divide-line">
            {conflicts.map((conflict) => (
              <li key={conflict.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3 text-sm">
                <div>
                  <p className="font-semibold text-ink">{conflict.activity_name}</p>
                  <p className="text-xs text-muted">
                    {conflict.room_name} • {formatDateTime(conflict.start_at, timezone)}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">{conflict.source_change}</p>
                </div>
                <Badge tone="warning">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  {conflict.conflict_type === "class_schedule" ? "Jadwal kuliah" : "Pembatasan"}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="mt-6">
        <RoomManager rooms={roomRows} />
      </div>

      <div className="mt-8">
        <RestrictionManager
          rooms={rooms.filter((room) => room.isActive).map((room) => ({ id: room.id, name: room.name, code: room.code }))}
          restrictions={restrictionRows}
          defaultDate={dateKeyInTimezone(new Date(), timezone)}
        />
      </div>

      <Card className="mt-6">
        <CardHeader title="Catatan data DEMO" />
        <div className="px-5 py-4 text-sm leading-relaxed text-muted">
          Data ruangan saat ini menggunakan nama dan foto dari website IDB Bali, tetapi kapasitas/fasilitas operasional
          masih berlabel DEMO. Verifikasi melalui formulir di atas sebelum digunakan untuk keputusan resmi. Tipe
          pembatasan: {Object.values(RESTRICTION_LABELS).join(", ")}.
        </div>
      </Card>
    </>
  );
}
