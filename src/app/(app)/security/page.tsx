import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listSecuritySchedule } from "@/lib/reports";
import { getSettings } from "@/lib/settings";
import { addDaysToDateKey, dateKeyInTimezone } from "@/lib/operational-clock";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateRange } from "@/lib/format";

export const metadata = { title: "Jadwal Keamanan" };

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (user.role !== "security") redirect("/dashboard");
  const settings = await getSettings();
  const params = await searchParams;
  const first = (key: string) => (Array.isArray(params[key]) ? params[key]?.[0] : params[key]);
  const today = dateKeyInTimezone(new Date(), settings.timezone);
  const from = first("from") || today;
  const to = first("to") || addDaysToDateKey(today, 30);
  const schedule = await listSecuritySchedule(from, to, settings.timezone);

  return (
    <>
      <PageHeader
        eyebrow="Petugas Keamanan"
        title="Jadwal booking terkonfirmasi"
        description="Hanya informasi operasional minimum: nama kegiatan, ruangan, tanggal, dan waktu. Data identitas mahasiswa tidak ditampilkan."
        actions={<Badge tone="brand"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />Akses terbatas</Badge>}
      />

      {from > to ? (
        <Alert tone="danger" className="mb-5">Tanggal awal tidak boleh setelah tanggal akhir.</Alert>
      ) : null}

      <Card className="mb-5">
        <form method="get" className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label htmlFor="from" className="field-label">Dari tanggal</label>
            <input id="from" name="from" type="date" defaultValue={from} className="field-input" />
          </div>
          <div>
            <label htmlFor="to" className="field-label">Sampai tanggal</label>
            <input id="to" name="to" type="date" defaultValue={to} className="field-input" />
          </div>
          <button type="submit" className={buttonClass("primary", "md")}>Tampilkan jadwal</button>
        </form>
      </Card>

      <Card>
        {schedule.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            Tidak ada booking terkonfirmasi pada rentang tanggal ini.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table min-w-[44rem]">
              <thead>
                <tr>
                  <th>Kegiatan</th>
                  <th>Ruangan</th>
                  <th>Tanggal & waktu</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((booking) => (
                  <tr key={booking.id}>
                    <td className="font-medium text-ink">{booking.activity_name}</td>
                    <td>{booking.room_name} <span className="text-xs text-muted">({booking.room_code})</span></td>
                    <td className="text-ink-soft">{formatDateRange(booking.start_at, booking.end_at, settings.timezone)}</td>
                    <td>
                      <Badge tone="success">Terkonfirmasi</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-4 text-xs leading-relaxed text-muted">
        Halaman ini tidak menampilkan NIM, kontak pribadi, detail profil mahasiswa, organisasi, atau catatan keputusan.
        Petugas keamanan tidak dapat mengubah booking.
      </p>
    </>
  );
}
