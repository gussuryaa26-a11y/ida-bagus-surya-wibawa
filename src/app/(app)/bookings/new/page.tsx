import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listRooms } from "@/lib/rooms";
import { getSettings } from "@/lib/settings";
import { addDaysToDateKey, dateKeyInTimezone } from "@/lib/operational-clock";
import { listActiveOrganizations } from "@/lib/users";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { BookingWizard } from "@/components/booking-wizard";
import type { RoomCardRoom } from "@/components/room-card";

export const metadata = { title: "Ajukan Peminjaman" };

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (user.role !== "student") redirect("/dashboard");
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
  const params = await searchParams;
  const first = (key: string) => (Array.isArray(params[key]) ? params[key]?.[0] : params[key]);
  const tomorrow = addDaysToDateKey(dateKeyInTimezone(new Date(), settings.timezone), 1);
  const preselectedRoom = first("roomId");
  const roomExists = rooms.some((room) => room.id === preselectedRoom);

  return (
    <>
      <PageHeader
        eyebrow="Pengajuan Baru"
        title="Ajukan peminjaman ruangan"
        description="Tiga langkah: keperluan kegiatan, pemilihan ruangan dengan rekomendasi, lalu ringkasan. Validasi akhir dilakukan server."
      />
      {!user.organizationId ? (
        <Alert tone="warning" className="mb-5" title="Profil organisasi belum lengkap">
          Pengajuan tidak dapat dikirim tanpa organisasi resmi. Lengkapi profil atau hubungi Admin IT.
        </Alert>
      ) : null}
      {!settings.isConfirmed ? (
        <Alert tone="warning" className="mb-5">
          Konfigurasi jam operasional dan data ruangan masih DEMO. Jangan menganggap data ini sebagai data resmi kampus.
        </Alert>
      ) : null}
      <BookingWizard
        mode="create"
        initialRooms={rooms}
        organizationName={user.organizationName}
        organizationOptions={organizations}
        orgPosition={user.orgPosition}
        timezone={settings.timezone}
        initial={{
          date: first("date") || tomorrow,
          startTime: first("startTime") || "09:00",
          endTime: first("endTime") || "11:00",
          roomId: roomExists ? preselectedRoom : "",
        }}
      />
    </>
  );
}
