import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getBookingById } from "@/lib/bookings";
import { listRooms } from "@/lib/rooms";
import { getSettings } from "@/lib/settings";
import { dateKeyInTimezone, timeKeyInTimezone } from "@/lib/operational-clock";
import { listActiveOrganizations } from "@/lib/users";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { BookingWizard } from "@/components/booking-wizard";
import type { RoomCardRoom } from "@/components/room-card";
import type { ActivityType } from "@/lib/types";

export const metadata = { title: "Revisi Pengajuan" };

export default async function ReviseBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.role !== "student") redirect("/dashboard");
  const { id } = await params;
  const booking = await getBookingById(id);
  if (!booking || booking.requesterId !== user.id) notFound();
  if (booking.status !== "revision_requested") {
    redirect(`/bookings/${id}`);
  }
  const settings = await getSettings();
  const organizations = await listActiveOrganizations();
  const rooms = (await listRooms()).map<RoomCardRoom>((room) => ({
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

  return (
    <>
      <PageHeader
        eyebrow="Perbaikan Pengajuan"
        title="Revisi sesuai catatan Akademik"
        description="Perbaiki keperluan atau pilih ruangan/waktu lain. Server akan memeriksa ulang ketersediaan sebelum slot ditahan kembali."
        actions={
          <Link href={`/bookings/${id}`} className={buttonClass("secondary", "sm")}>
            Kembali ke detail
          </Link>
        }
      />
      {settings.revisionHoldPolicy === "release" ? (
        <Alert tone="info" className="mb-5">
          Kebijakan sementara: slot dilepas saat revisi diminta. Pengiriman ulang akan memeriksa konflik dan menahan slot
          baru jika tersedia.
        </Alert>
      ) : (
        <Alert tone="warning" className="mb-5">
          Kebijakan sementara: slot ditahan terbatas selama revisi. Batas konfigurasi dapat berubah dan belum tentu
          disahkan kampus.
        </Alert>
      )}
      <BookingWizard
        mode="revision"
        bookingId={booking.id}
        initialRooms={rooms}
        organizationName={user.organizationName}
        organizationOptions={organizations}
        orgPosition={user.orgPosition}
        revisionNote={booking.decisionReason}
        timezone={settings.timezone}
        initial={{
          organizationName: booking.organizationName,
          activityName: booking.activityName,
          activityPurpose: booking.activityPurpose,
          activityType: booking.activityType as ActivityType,
          participantCount: String(booking.participantCount),
          requiredFacilities: booking.requiredFacilities,
          date: dateKeyInTimezone(booking.startAt, settings.timezone),
          startTime: timeKeyInTimezone(booking.startAt, settings.timezone),
          endTime: timeKeyInTimezone(booking.endAt, settings.timezone),
          roomId: booking.roomId,
        }}
      />
    </>
  );
}
