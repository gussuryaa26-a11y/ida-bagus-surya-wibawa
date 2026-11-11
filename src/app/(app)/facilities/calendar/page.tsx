import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listCalendarEntries } from "@/lib/calendar";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui/page-header";
import { CalendarManager, type CalendarEntryView } from "@/components/calendar-manager";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Kalender Akademik" };

export default async function CalendarPage() {
  const user = await requireUser();
  if (!["academic", "facility_manager"].includes(user.role)) redirect("/dashboard");
  const [settings, entries] = await Promise.all([getSettings(), listCalendarEntries()]);
  const timezone = settings.timezone;
  const backHref = user.role === "academic" ? "/academic" : "/facilities";

  const rows: CalendarEntryView[] = entries.map((entry) => ({
    id: entry.id,
    periodStart: entry.periodStart,
    periodEnd: entry.periodEnd,
    calendarType: entry.calendarType,
    description: entry.description,
    regularClassesEnabled: entry.regularClassesEnabled,
    sourceOrAuthority: entry.sourceOrAuthority,
    updatedLabel: formatDateTime(entry.updatedAt, timezone),
    updatedBy: entry.updatedByName,
  }));

  return (
    <>
      <div className="mb-4">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Kembali
        </Link>
      </div>
      <PageHeader
        eyebrow="Kalender & Jam Operasional"
        title="Kalender akademik"
        description="Kelola semester, hari libur, periode libur, dan pengecualian. Perubahan memicu perhitungan ulang tenggat pengajuan yang masih terbuka."
      />
      <CalendarManager entries={rows} />
    </>
  );
}
