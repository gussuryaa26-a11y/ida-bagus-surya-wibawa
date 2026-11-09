import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SIMPAR — Sistem Peminjaman Ruangan Kampus IDB Bali",
    template: "%s | SIMPAR IDB Bali",
  },
  description:
    "Sistem internal non-komersial untuk pengajuan peminjaman ruangan kegiatan organisasi resmi kampus IDB Bali.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
