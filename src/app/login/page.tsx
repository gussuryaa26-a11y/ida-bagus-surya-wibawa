import Image from "next/image";
import { redirect } from "next/navigation";
import { CalendarCheck2, ClipboardCheck, DoorOpen } from "lucide-react";
import { dashboardPathForRole, getSessionUser } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";
import { Logo } from "@/components/ui/logo";

export const metadata = { title: "Masuk" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(dashboardPathForRole(user.role));

  return (
    <main className="grid min-h-screen lg:h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:overflow-hidden">
      <section className="flex flex-col bg-surface px-6 py-6 sm:px-10 lg:h-full lg:overflow-y-auto lg:px-14 lg:py-7">
        <Logo />
        <div className="mx-auto my-auto w-full max-w-lg py-4">
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.16em] text-brand-600">
            Sistem internal kampus
          </p>
          <h1 className="mt-1.5 font-display text-[2.05rem] font-semibold leading-[1.06] text-ink sm:text-[2.5rem]">
            Ruang untuk berkarya,
            <br />
            <span className="text-brand-700">terjadwal dengan tertib.</span>
          </h1>
          <p className="mt-2.5 max-w-md text-[0.9rem] leading-relaxed text-muted">
            Pengajuan ruangan organisasi mahasiswa IDB Bali secara transparan. Peminjaman pribadi tidak
            diperbolehkan.
          </p>

          <div className="mt-4">
            <LoginForm />
          </div>

        </div>

        <p className="mt-3 text-[0.64rem] leading-relaxed text-muted">
          Non-komersial • Tanpa pembayaran/iklan/monetisasi • Ketersediaan berdasarkan data jadwal tercatat,
          bukan okupansi fisik.
        </p>
      </section>

      <aside className="relative hidden overflow-hidden bg-brand-900 lg:block">
        <Image
          src="/rooms/aula.jpg"
          alt="Aula IDB Bali"
          fill
          priority
          sizes="50vw"
          className="object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-900 via-brand-900/50 to-brand-900/10" />
        <div className="relative flex h-full flex-col justify-center p-10 text-white xl:p-12">
          <div className="max-w-lg">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-accent-300">
              SIMPAR • IDB Bali
            </p>
            <h2 className="mt-2 font-display text-[1.85rem] font-semibold leading-[1.15]">
              Dari keperluan kegiatan, rekomendasi ruangan, hingga Internal Memo.
            </h2>
            <ul className="mt-6 space-y-3 text-sm text-brand-50">
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/12">
                  <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>
                  <strong className="block font-semibold text-white">Keperluan organisasi</strong>
                  Isi kegiatan dan kebutuhan fasilitas. Tanpa opsi peminjaman pribadi.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/12">
                  <DoorOpen className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>
                  <strong className="block font-semibold text-white">Rekomendasi ruangan</strong>
                  Kapasitas, fasilitas, jadwal kuliah, dan booking diperiksa server.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/12">
                  <CalendarCheck2 className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>
                  <strong className="block font-semibold text-white">Keputusan Akademik</strong>
                  Slot ditahan sementara; keputusan akhir tetap di Bagian Akademik.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </aside>
    </main>
  );
}
