import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, initials } from "@/lib/format";

export const metadata = { title: "Profil" };

export default async function ProfilePage() {
  const user = await requireUser();
  const isStudent = user.role === "student";

  return (
    <>
      <PageHeader
        eyebrow="Profil"
        title={isStudent ? "Profil mahasiswa" : "Profil pengguna"}
        description={
          isStudent
            ? "Data profil dibaca dari direktori akademik kampus. Pada demo ini, data disediakan oleh seed DEMO dan belum terhubung ke SIAKAD asli."
            : "Data akun internal SIMPAR. Perubahan data di luar aplikasi dilakukan oleh Admin IT kampus."
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title={isStudent ? "Data civitas akademika" : "Identitas akun"}
            description={isStudent ? "Hanya data berikut yang ditampilkan pada profil mahasiswa." : undefined}
            action={<Badge tone={user.isDemo ? "warning" : "success"}>{user.isDemo ? "DEMO" : "Akun kampus"}</Badge>}
          />

          <div className="flex items-center gap-4 border-b border-line px-5 py-5">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-900 text-lg font-bold text-white">
              {initials(user.fullName)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-xl font-semibold text-ink">{user.fullName}</p>
              <p className="text-sm text-muted">
                {isStudent
                  ? `${user.nim ?? user.loginId} • ${user.programStudy ?? "Program studi belum tercatat"}`
                  : `${ROLE_LABELS[user.role]} • ${user.loginId}`}
              </p>
            </div>
          </div>

          <dl className="divide-y divide-line px-5">
            <ProfileRow label="Nama lengkap" value={user.fullName} />
            {isStudent ? (
              <>
                <ProfileRow label="NIM" value={user.nim ?? user.loginId} />
                <ProfileRow label="Program studi" value={user.programStudy ?? "Belum tercatat"} />
                <ProfileRow label="Email terdaftar" value={user.contactEmail ?? "Belum tercatat"} />
                <ProfileRow label="No. telepon terdaftar" value={user.contactPhone ?? "Belum tercatat"} />
              </>
            ) : (
              <>
                <ProfileRow label="ID login" value={user.loginId} />
                <ProfileRow label="Peran" value={ROLE_LABELS[user.role]} />
                <ProfileRow label="Email terdaftar" value={user.contactEmail ?? "Belum tercatat"} />
                <ProfileRow label="No. telepon terdaftar" value={user.contactPhone ?? "Belum tercatat"} />
              </>
            )}
          </dl>
        </Card>

        <div className="space-y-5">
          <div className="rounded-card border border-line bg-surface p-4 text-xs leading-relaxed text-muted">
            <p className="font-semibold text-ink-soft">Sumber data (DEMO)</p>
            <p className="mt-1">
              Pada sistem kampus sesungguhnya, nama, NIM, program studi, email, dan nomor telepon dibaca langsung dari
              direktori civitas akademika. Data pada demo ini dibuat untuk NIM <strong>20240001–20240100</strong> dan
              bukan data resmi.
            </p>
            <p className="mt-2">
              Profil bersifat hanya-baca. Perbaikan data akademik dilakukan melalui layanan akademik kampus, bukan
              diubah sendiri di SIMPAR.
            </p>
          </div>

          <div className="rounded-card border border-brand-200 bg-brand-50 p-4 text-xs leading-relaxed text-brand-900">
            <p className="font-semibold">Organisasi pada pengajuan</p>
            <p className="mt-1">
              Organisasi yang Anda wakili diisi langsung pada form pengajuan. Bagian Akademik melihat organisasi yang
              Anda isi pada pengajuan tersebut, beserta NIM dan program studi Anda.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-3.5 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd className="break-words text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}
