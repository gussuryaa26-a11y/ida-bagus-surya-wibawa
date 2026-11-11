import type { ReactNode } from "react";
import {
  Bell,
  Building2,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  FilePlus2,
  Gauge,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { countUnreadNotifications } from "@/lib/notifications";
import { getSettings } from "@/lib/settings";
import { AppShell, type NavItem } from "@/components/app-shell";

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  // Query layout independen dijalankan bersamaan. Ini mengurangi waktu tunggu
  // saat berpindah menu karena shell tidak perlu menunggu query satu per satu.
  const pendingPromise =
    user.role === "student"
      ? queryOne<{ count: string }>(
          "SELECT count(*)::text AS count FROM booking_requests WHERE requester_id = $1 AND status = 'pending_academic'",
          [user.id],
        )
      : user.role === "academic"
        ? queryOne<{ count: string }>(
            "SELECT count(*)::text AS count FROM booking_requests WHERE status = 'pending_academic'",
          )
        : Promise.resolve(null);

  const [settings, unread, demoRow, pending] = await Promise.all([
    getSettings(),
    countUnreadNotifications(user.id),
    queryOne<{ exists: boolean }>("SELECT EXISTS(SELECT 1 FROM rooms WHERE is_demo_data = true) AS exists"),
    pendingPromise,
  ]);

  const icon = "h-[1.1rem] w-[1.1rem]";
  const common: NavItem[] = [
    { href: "/notifications", label: "Notifikasi", icon: <Bell className={icon} />, badge: unread || undefined },
    { href: "/profile", label: "Profil", icon: <UserRound className={icon} /> },
  ];

  let navItems: NavItem[] = [];

  if (user.role === "student") {
    navItems = [
      { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className={icon} /> },
      { href: "/bookings/new", label: "Ajukan Peminjaman", icon: <FilePlus2 className={icon} /> },
      { href: "/rooms", label: "Ruangan Kampus", icon: <DoorOpen className={icon} /> },
      {
        href: "/bookings",
        label: "Pengajuan Saya",
        icon: <ClipboardList className={icon} />,
        badge: Number(pending?.count ?? 0) || undefined,
      },
      ...common,
    ];
  } else if (user.role === "academic") {
    navItems = [
      { href: "/academic", label: "Dashboard Akademik", icon: <Gauge className={icon} />, badge: Number(pending?.count ?? 0) || undefined },
      { href: "/rooms", label: "Ruangan Kampus", icon: <DoorOpen className={icon} /> },
      { href: "/facilities/calendar", label: "Kalender Akademik", icon: <CalendarDays className={icon} /> },
      { href: "/facilities/import", label: "Impor Jadwal", icon: <Upload className={icon} /> },
      ...common,
    ];
  } else if (user.role === "facility_manager") {
    navItems = [
      { href: "/facilities", label: "Kelola Fasilitas", icon: <Building2 className={icon} /> },
      { href: "/facilities/import", label: "Impor Jadwal", icon: <Upload className={icon} /> },
      { href: "/facilities/calendar", label: "Kalender Akademik", icon: <CalendarDays className={icon} /> },
      { href: "/rooms", label: "Ruangan Kampus", icon: <DoorOpen className={icon} /> },
      ...common,
    ];
  } else if (user.role === "security") {
    navItems = [
      { href: "/security", label: "Jadwal Booking", icon: <ShieldCheck className={icon} /> },
      ...common,
    ];
  } else {
    navItems = [
      { href: "/admin", label: "Admin & Konfigurasi", icon: <Settings2 className={icon} /> },
      { href: "/admin/users", label: "Akun Pengguna", icon: <Users className={icon} /> },
      { href: "/rooms", label: "Ruangan Kampus", icon: <DoorOpen className={icon} /> },
      ...common,
    ];
  }

  return (
    <AppShell
      user={{ fullName: user.fullName, role: user.role, organizationName: user.organizationName }}
      navItems={navItems}
      unreadCount={unread}
      configUnconfirmed={!settings.isConfirmed}
      demoBanner={Boolean(demoRow?.exists)}
    >
      {children}
    </AppShell>
  );
}
