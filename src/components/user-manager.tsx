"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ROLE_LABELS } from "@/lib/format";
import { USER_ROLES, type UserRole } from "@/lib/types";

export type UserView = {
  id: string;
  fullName: string;
  loginId: string;
  role: UserRole;
  isActive: boolean;
  nim: string | null;
  programStudy: string | null;
  organizationId: string | null;
  organizationName: string | null;
  orgPosition: string | null;
  isDemo: boolean;
};

type OrgView = { id: string; name: string; code: string };

export function UserManager({ users, organizations }: { users: UserView[]; organizations: OrgView[] }) {
  const router = useRouter();
  const createRef = useRef<HTMLDialogElement>(null);
  const editRef = useRef<HTMLDialogElement>(null);
  const passwordRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<UserView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [createForm, setCreateForm] = useState({
    fullName: "",
    loginId: "",
    password: "",
    role: "student" as UserRole,
    nim: "",
    programStudy: "",
    organizationId: "",
    orgPosition: "",
    contactEmail: "",
  });
  const [editForm, setEditForm] = useState({
    role: "student" as UserRole,
    isActive: true,
    organizationId: "",
    orgPosition: "",
  });
  const [newPassword, setNewPassword] = useState("");

  function openEdit(user: UserView) {
    setEditing(user);
    setError(null);
    setEditForm({
      role: user.role,
      isActive: user.isActive,
      organizationId: user.organizationId ?? "",
      orgPosition: user.orgPosition ?? "",
    });
    editRef.current?.showModal();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">Akun pengguna</h2>
          <p className="text-sm text-muted">Perubahan role dan status akun dicatat pada audit trail.</p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setError(null);
            setCreateForm({
              fullName: "",
              loginId: "",
              password: "",
              role: "student",
              nim: "",
              programStudy: "",
              organizationId: organizations[0]?.id ?? "",
              orgPosition: "",
              contactEmail: "",
            });
            createRef.current?.showModal();
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Tambah akun
        </Button>
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="admin-table min-w-[58rem]">
          <thead>
            <tr>
              <th>Nama</th>
              <th>ID login</th>
              <th>Role</th>
              <th>Organisasi</th>
              <th>Status</th>
              <th>Data</th>
              <th aria-label="Tindakan" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <p className="font-semibold text-ink">{user.fullName}</p>
                  <p className="text-xs text-muted">{user.nim ? `NIM ${user.nim}` : user.programStudy ?? "—"}</p>
                </td>
                <td className="font-mono text-xs text-ink-soft">{user.loginId}</td>
                <td><Badge tone="brand">{ROLE_LABELS[user.role]}</Badge></td>
                <td className="text-xs text-ink-soft">
                  {user.organizationName ?? "—"}
                  {user.orgPosition ? <p className="text-muted">{user.orgPosition}</p> : null}
                </td>
                <td>
                  <Badge tone={user.isActive ? "success" : "danger"}>{user.isActive ? "Aktif" : "Nonaktif"}</Badge>
                </td>
                <td>
                  <Badge tone={user.isDemo ? "warning" : "neutral"}>{user.isDemo ? "DEMO" : "Kampus"}</Badge>
                </td>
                <td>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => openEdit(user)}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(user);
                        setNewPassword("");
                        setError(null);
                        passwordRef.current?.showModal();
                      }}
                    >
                      <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                      Reset
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dialog ref={createRef} className="w-[min(96vw,44rem)] rounded-2xl border border-line bg-surface p-0 shadow-2xl backdrop:bg-ink/40">
        <form
          className="p-6"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setLoading(true);
            try {
              const response = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...createForm,
                  nim: createForm.nim || null,
                  programStudy: createForm.programStudy || null,
                  organizationId: createForm.organizationId || null,
                  orgPosition: createForm.orgPosition || null,
                  contactEmail: createForm.contactEmail || null,
                }),
              });
              const payload = (await response.json()) as { error?: { message?: string } };
              if (!response.ok) throw new Error(payload.error?.message ?? "Gagal membuat akun.");
              createRef.current?.close();
              router.refresh();
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Gagal membuat akun.");
            } finally {
              setLoading(false);
            }
          }}
        >
          <h2 className="font-display text-xl font-semibold text-ink">Tambah akun</h2>
          <p className="mt-1 text-sm text-muted">Gunakan kata sandi sementara dan minta pengguna menggantinya.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Nama lengkap" id="new-name">
              <input id="new-name" className="field-input" value={createForm.fullName} onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })} required minLength={3} />
            </Field>
            <Field label="NIM / ID login" id="new-login">
              <input id="new-login" className="field-input" value={createForm.loginId} onChange={(e) => setCreateForm({ ...createForm, loginId: e.target.value })} required minLength={3} />
            </Field>
            <Field label="Kata sandi awal" id="new-password">
              <input id="new-password" type="password" className="field-input" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required minLength={8} />
            </Field>
            <Field label="Role" id="new-role">
              <select id="new-role" className="field-input" value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as UserRole })}>
                {USER_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
              </select>
            </Field>
            <Field label="NIM" id="new-nim">
              <input id="new-nim" className="field-input" value={createForm.nim} onChange={(e) => setCreateForm({ ...createForm, nim: e.target.value })} />
            </Field>
            <Field label="Program studi" id="new-prodi">
              <input id="new-prodi" className="field-input" value={createForm.programStudy} onChange={(e) => setCreateForm({ ...createForm, programStudy: e.target.value })} />
            </Field>
            <Field label="Organisasi" id="new-org">
              <select id="new-org" className="field-input" value={createForm.organizationId} onChange={(e) => setCreateForm({ ...createForm, organizationId: e.target.value })}>
                <option value="">— Tidak ada —</option>
                {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
            </Field>
            <Field label="Jabatan organisasi" id="new-position">
              <input id="new-position" className="field-input" value={createForm.orgPosition} onChange={(e) => setCreateForm({ ...createForm, orgPosition: e.target.value })} />
            </Field>
            <Field label="Kontak email" id="new-email">
              <input id="new-email" type="email" className="field-input" value={createForm.contactEmail} onChange={(e) => setCreateForm({ ...createForm, contactEmail: e.target.value })} />
            </Field>
          </div>
          {error ? <Alert tone="danger" className="mt-4">{error}</Alert> : null}
          <DialogActions onCancel={() => createRef.current?.close()} loading={loading} submitLabel="Buat akun" />
        </form>
      </dialog>

      <dialog ref={editRef} className="w-[min(96vw,32rem)] rounded-2xl border border-line bg-surface p-0 shadow-2xl backdrop:bg-ink/40">
        <form
          className="p-6"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!editing) return;
            setError(null);
            setLoading(true);
            try {
              const response = await fetch(`/api/admin/users/${editing.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  role: editForm.role,
                  isActive: editForm.isActive,
                  organizationId: editForm.organizationId || null,
                  orgPosition: editForm.orgPosition || null,
                }),
              });
              const payload = (await response.json()) as { error?: { message?: string } };
              if (!response.ok) throw new Error(payload.error?.message ?? "Gagal memperbarui akun.");
              editRef.current?.close();
              router.refresh();
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Gagal memperbarui akun.");
            } finally {
              setLoading(false);
            }
          }}
        >
          <h2 className="font-display text-xl font-semibold text-ink">Ubah akun</h2>
          <p className="mt-1 text-sm text-muted">{editing?.fullName} • {editing?.loginId}</p>
          <div className="mt-4 space-y-4">
            <Field label="Role" id="edit-role">
              <select id="edit-role" className="field-input" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}>
                {USER_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
              </select>
            </Field>
            <Field label="Organisasi" id="edit-org">
              <select id="edit-org" className="field-input" value={editForm.organizationId} onChange={(e) => setEditForm({ ...editForm, organizationId: e.target.value })}>
                <option value="">— Tidak ada —</option>
                {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
            </Field>
            <Field label="Jabatan organisasi" id="edit-position">
              <input id="edit-position" className="field-input" value={editForm.orgPosition} onChange={(e) => setEditForm({ ...editForm, orgPosition: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand-700)]" checked={editForm.isActive} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })} />
              Akun aktif
            </label>
          </div>
          {error ? <Alert tone="danger" className="mt-4">{error}</Alert> : null}
          <DialogActions onCancel={() => editRef.current?.close()} loading={loading} submitLabel="Simpan perubahan" />
        </form>
      </dialog>

      <dialog ref={passwordRef} className="w-[min(96vw,28rem)] rounded-2xl border border-line bg-surface p-0 shadow-2xl backdrop:bg-ink/40">
        <form
          className="p-6"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!editing) return;
            setError(null);
            setLoading(true);
            try {
              const response = await fetch(`/api/admin/users/${editing.id}/password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: newPassword }),
              });
              const payload = (await response.json()) as { error?: { message?: string } };
              if (!response.ok) throw new Error(payload.error?.message ?? "Gagal mereset kata sandi.");
              passwordRef.current?.close();
              router.refresh();
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Gagal mereset kata sandi.");
            } finally {
              setLoading(false);
            }
          }}
        >
          <h2 className="font-display text-xl font-semibold text-ink">Reset kata sandi</h2>
          <p className="mt-1 text-sm text-muted">{editing?.fullName} • semua sesi aktif akan dihapus.</p>
          <div className="mt-4">
            <label htmlFor="reset-password" className="field-label">Kata sandi baru</label>
            <input id="reset-password" type="password" className="field-input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </div>
          {error ? <Alert tone="danger" className="mt-4">{error}</Alert> : null}
          <DialogActions onCancel={() => passwordRef.current?.close()} loading={loading} submitLabel="Reset kata sandi" />
        </form>
      </dialog>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      {children}
    </div>
  );
}

function DialogActions({ onCancel, loading, submitLabel }: { onCancel: () => void; loading: boolean; submitLabel: string }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>Batal</Button>
      <Button type="submit" size="sm" disabled={loading}>{loading ? "Menyimpan…" : submitLabel}</Button>
    </div>
  );
}
