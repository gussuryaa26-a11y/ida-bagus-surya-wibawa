import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listOrganizations, listUsers } from "@/lib/users";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { UserManager, type UserView } from "@/components/user-manager";

export const metadata = { title: "Akun Pengguna" };

export default async function AdminUsersPage() {
  const user = await requireUser();
  if (user.role !== "admin_it") redirect("/dashboard");
  const [users, organizations] = await Promise.all([listUsers(), listOrganizations(true)]);
  const rows: UserView[] = users.map((item) => ({
    id: item.id,
    fullName: item.fullName,
    loginId: item.loginId,
    role: item.role,
    isActive: item.isActive,
    nim: item.nim,
    programStudy: item.programStudy,
    organizationId: item.organizationId,
    organizationName: item.organizationName,
    orgPosition: item.orgPosition,
    isDemo: item.isDemo,
  }));

  return (
    <>
      <div className="mb-4">
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Kembali ke Admin
        </Link>
      </div>
      <PageHeader
        eyebrow="Admin IT"
        title="Akun & role"
        description="Kelola akun, status aktif, afiliasi organisasi, dan role sesuai penetapan resmi. Setiap perubahan dicatat."
      />
      <Alert tone="info" className="mb-5">
        Admin IT tidak otomatis memiliki kewenangan menyetujui pengajuan. Hanya role Bagian Akademik yang dapat
        memutuskan booking.
      </Alert>
      <UserManager
        users={rows}
        organizations={organizations.map((org) => ({ id: org.id, name: org.name, code: org.code }))}
      />
    </>
  );
}
