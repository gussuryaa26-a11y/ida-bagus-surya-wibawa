"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function ProfileForm({
  initial,
}: {
  initial: {
    fullName: string;
    programStudy: string | null;
    faculty: string | null;
    orgPosition: string | null;
    contactEmail: string | null;
  };
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: initial.fullName,
    programStudy: initial.programStudy ?? "",
    faculty: initial.faculty ?? "",
    orgPosition: initial.orgPosition ?? "",
    contactEmail: initial.contactEmail ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        setNotice(null);
        setLoading(true);
        try {
          const response = await fetch("/api/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fullName: form.fullName,
              programStudy: form.programStudy || null,
              faculty: form.faculty || null,
              orgPosition: form.orgPosition || null,
              contactEmail: form.contactEmail || null,
            }),
          });
          const payload = (await response.json()) as { error?: { message?: string } };
          if (!response.ok) throw new Error(payload.error?.message ?? "Gagal menyimpan profil.");
          setNotice("Profil berhasil diperbarui.");
          router.refresh();
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Gagal menyimpan profil.");
        } finally {
          setLoading(false);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="profile-name" className="field-label">Nama lengkap</label>
          <input
            id="profile-name"
            className="field-input"
            value={form.fullName}
            onChange={(event) => setForm({ ...form, fullName: event.target.value })}
            required
            minLength={3}
          />
        </div>
        <div>
          <label htmlFor="profile-program" className="field-label">Program studi</label>
          <input
            id="profile-program"
            className="field-input"
            value={form.programStudy}
            onChange={(event) => setForm({ ...form, programStudy: event.target.value })}
          />
        </div>
        <div>
          <label htmlFor="profile-faculty" className="field-label">Fakultas/unit akademik</label>
          <input
            id="profile-faculty"
            className="field-input"
            value={form.faculty}
            onChange={(event) => setForm({ ...form, faculty: event.target.value })}
          />
        </div>
        <div>
          <label htmlFor="profile-position" className="field-label">Jabatan dalam organisasi</label>
          <input
            id="profile-position"
            className="field-input"
            value={form.orgPosition}
            onChange={(event) => setForm({ ...form, orgPosition: event.target.value })}
            placeholder="Contoh: Ketua / Sekretaris"
          />
        </div>
        <div>
          <label htmlFor="profile-contact" className="field-label">Kontak resmi</label>
          <input
            id="profile-contact"
            type="email"
            className="field-input"
            value={form.contactEmail}
            onChange={(event) => setForm({ ...form, contactEmail: event.target.value })}
          />
        </div>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <Button type="submit" disabled={loading}>
        {loading ? "Menyimpan…" : "Simpan profil"}
      </Button>
    </form>
  );
}
