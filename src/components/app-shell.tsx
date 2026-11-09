"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu, X } from "lucide-react";
import clsx from "clsx";
import { Logo } from "@/components/ui/logo";
import { LogoutButton } from "@/components/logout-button";
import { ROLE_LABELS, initials } from "@/lib/format";
import type { UserRole } from "@/lib/types";

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: number;
};

export function AppShell({
  children,
  user,
  navItems,
  unreadCount,
  configUnconfirmed,
  demoBanner,
}: {
  children: ReactNode;
  user: { fullName: string; role: UserRole; organizationName: string | null };
  navItems: NavItem[];
  unreadCount: number;
  configUnconfirmed: boolean;
  demoBanner: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Hanya satu item yang boleh aktif: pilih href paling spesifik yang cocok.
  // Contoh: "/bookings/new" harus mengaktifkan "Ajukan Peminjaman" saja,
  // bukan juga "Pengajuan Saya" (/bookings) yang merupakan induknya.
  const activeHref =
    navItems
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

  const isActive = (href: string) => href === activeHref;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pb-5 pt-6">
        <Logo />
        <button
          type="button"
          className="rounded-full p-2 text-muted hover:bg-brand-50 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Tutup menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mx-5 mb-5 rounded-xl border border-line bg-paper/70 px-3 py-2.5">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-muted">Masuk sebagai</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-ink">{ROLE_LABELS[user.role]}</p>
        {user.organizationName ? (
          <p className="truncate text-xs text-muted">{user.organizationName}</p>
        ) : null}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="Navigasi utama">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-50 text-brand-900 shadow-[inset_3px_0_0_0_var(--color-brand-600)]"
                  : "text-ink-soft hover:bg-paper hover:text-brand-900",
              )}
            >
              <span className={clsx("shrink-0", active ? "text-brand-700" : "text-muted group-hover:text-brand-700")}>
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className="rounded-full bg-accent-500 px-1.5 py-0.5 text-[0.65rem] font-bold text-ink">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line p-4">
        <div className="flex items-center gap-3 rounded-xl px-1 py-1">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-900 text-xs font-bold text-white">
            {initials(user.fullName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{user.fullName}</p>
            <p className="truncate text-xs text-muted">{user.organizationName ?? ROLE_LABELS[user.role]}</p>
          </div>
        </div>
        <div className="mt-2">
          <LogoutButton />
        </div>
        <p className="mt-3 px-1 text-[0.62rem] leading-relaxed text-muted">
          SIMPAR • Sistem internal non-komersial. Data DEMO bukan data resmi kampus.
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[18rem_1fr]">
      <aside className="hidden border-r border-line bg-surface lg:sticky lg:top-0 lg:block lg:h-screen">
        {sidebar}
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/40"
            aria-label="Tutup menu"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-[19rem] max-w-[92vw] border-r border-line bg-surface shadow-2xl">
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur sm:px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-full border border-line bg-surface p-2 text-ink-soft hover:bg-brand-50 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Buka menu navigasi"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="lg:hidden">
              <Logo compact />
            </div>
            <p className="hidden text-sm text-muted lg:block">
              Sistem Peminjaman Ruangan Kampus — IDB Bali
            </p>
          </div>
          <Link
            href="/notifications"
            className="relative inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-soft hover:border-brand-600 hover:text-brand-900"
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Notifikasi</span>
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 text-[0.65rem] font-bold text-ink">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </Link>
        </header>

        {(configUnconfirmed || demoBanner) && (
          <div className="border-b border-accent-300 bg-warning-100 px-4 py-2 text-center text-[0.78rem] font-medium text-warning-700 sm:px-6 lg:px-10">
            {configUnconfirmed
              ? "Mode DEMO — jam operasional, kalender, ruangan, dan kapasitas belum dikonfirmasi kampus. "
              : ""}
            {demoBanner ? "Sebagian data ruangan berlabel DEMO dan bukan data resmi." : ""}
          </div>
        )}

        <main className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
        <footer className="px-4 pb-8 text-center text-[0.7rem] text-muted sm:px-6 lg:px-10">
          SIMPAR — sistem internal kampus, tanpa pembayaran/monetisasi. Ketersediaan berdasarkan data jadwal
          tercatat, bukan okupansi fisik.
        </footer>
      </div>
    </div>
  );
}
