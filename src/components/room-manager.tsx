"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { CATEGORY_LABELS, FACILITY_LABELS } from "@/lib/format";
import { FACILITIES, ROOM_CATEGORIES, type RoomCategory } from "@/lib/types";

export type RoomAdminRow = {
  id: string;
  code: string;
  name: string;
  category: RoomCategory;
  capacity: number | null;
  capacityVerified: boolean;
  facilities: string[];
  facilitiesVerified: boolean;
  description: string | null;
  location: string | null;
  imagePath: string | null;
  imageNote: string | null;
  isActive: boolean;
  isDemoData: boolean;
  dataSource: string;
};

type FormState = {
  code: string;
  name: string;
  category: RoomCategory;
  capacity: string;
  capacityVerified: boolean;
  facilities: string[];
  facilitiesVerified: boolean;
  description: string;
  location: string;
  imagePath: string;
  imageNote: string;
  isActive: boolean;
  isDemoData: boolean;
};

const EMPTY: FormState = {
  code: "",
  name: "",
  category: "classroom",
  capacity: "",
  capacityVerified: false,
  facilities: [],
  facilitiesVerified: false,
  description: "",
  location: "",
  imagePath: "",
  imageNote: "",
  isActive: true,
  isDemoData: true,
};

export function RoomManager({ rooms }: { rooms: RoomAdminRow[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<RoomAdminRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    dialogRef.current?.showModal();
  }

  function openEdit(room: RoomAdminRow) {
    setEditing(room);
    setForm({
      code: room.code,
      name: room.name,
      category: room.category,
      capacity: room.capacity ? String(room.capacity) : "",
      capacityVerified: room.capacityVerified,
      facilities: room.facilities,
      facilitiesVerified: room.facilitiesVerified,
      description: room.description ?? "",
      location: room.location ?? "",
      imagePath: room.imagePath ?? "",
      imageNote: room.imageNote ?? "",
      isActive: room.isActive,
      isDemoData: room.isDemoData,
    });
    setError(null);
    dialogRef.current?.showModal();
  }

  async function save() {
    setError(null);
    setLoading(true);
    try {
      const payload = {
        code: form.code,
        name: form.name,
        category: form.category,
        capacity: form.capacity ? Number(form.capacity) : null,
        capacityVerified: form.capacityVerified,
        facilities: form.facilities,
        facilitiesVerified: form.facilitiesVerified,
        description: form.description || null,
        location: form.location || null,
        imagePath: form.imagePath || null,
        imageNote: form.imageNote || null,
        isActive: form.isActive,
        isDemoData: form.isDemoData,
      };
      const response = await fetch(editing ? `/api/admin/rooms/${editing.id}` : "/api/admin/rooms", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Gagal menyimpan ruangan.");
      dialogRef.current?.close();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gagal menyimpan ruangan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">Data ruangan</h2>
          <p className="text-sm text-muted">Kapasitas/fasilitas yang belum diverifikasi ditandai DEMO atau belum diketahui.</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Tambah ruangan
        </Button>
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="admin-table min-w-[62rem]">
          <thead>
            <tr>
              <th>Ruangan</th>
              <th>Kategori</th>
              <th>Kapasitas</th>
              <th>Fasilitas</th>
              <th>Status data</th>
              <th>Aktif</th>
              <th aria-label="Tindakan" />
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id}>
                <td>
                  <p className="font-semibold text-ink">{room.name}</p>
                  <p className="text-xs text-muted">{room.code}{room.location ? ` • ${room.location}` : ""}</p>
                </td>
                <td className="text-ink-soft">{CATEGORY_LABELS[room.category]}</td>
                <td>
                  <p className="text-ink">{room.capacity ?? "Belum diketahui"}</p>
                  <p className="text-xs">
                    {room.capacityVerified ? (
                      <span className="text-success-700">Terverifikasi</span>
                    ) : (
                      <span className="text-accent-700">Belum diverifikasi</span>
                    )}
                  </p>
                </td>
                <td className="max-w-56 text-xs text-ink-soft">
                  {room.facilities.length
                    ? room.facilities.map((facility) => FACILITY_LABELS[facility] ?? facility).join(", ")
                    : "Belum diketahui"}
                  <p className={room.facilitiesVerified ? "text-success-700" : "text-accent-700"}>
                    {room.facilitiesVerified ? "Terverifikasi" : "Belum diverifikasi"}
                  </p>
                </td>
                <td>
                  <div className="flex flex-col items-start gap-1">
                    <Badge tone={room.isDemoData ? "warning" : "success"}>
                      {room.isDemoData ? "DEMO" : "Data kampus"}
                    </Badge>
                    <span className="text-[0.68rem] text-muted">{room.dataSource}</span>
                  </div>
                </td>
                <td>
                  <Badge tone={room.isActive ? "success" : "neutral"}>{room.isActive ? "Aktif" : "Nonaktif"}</Badge>
                </td>
                <td className="text-right">
                  <Button variant="secondary" size="sm" onClick={() => openEdit(room)}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dialog
        ref={dialogRef}
        className="w-[min(96vw,46rem)] rounded-2xl border border-line bg-surface p-0 shadow-2xl backdrop:bg-ink/40"
      >
        <form
          className="p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <h2 className="font-display text-xl font-semibold text-ink">
            {editing ? "Ubah ruangan" : "Tambah ruangan"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Jangan mengisi kapasitas/fasilitas resmi tanpa sumber. Tandai belum diverifikasi bila belum pasti.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="room-code" className="field-label">Kode</label>
              <input
                id="room-code"
                className="field-input"
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="room-name" className="field-label">Nama</label>
              <input
                id="room-name"
                className="field-input"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="room-category" className="field-label">Kategori</label>
              <select
                id="room-category"
                className="field-input"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value as RoomCategory })}
              >
                {ROOM_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="room-capacity" className="field-label">Kapasitas</label>
              <input
                id="room-capacity"
                type="number"
                min={1}
                className="field-input"
                value={form.capacity}
                onChange={(event) => setForm({ ...form, capacity: event.target.value })}
                placeholder="Kosongkan bila belum diketahui"
              />
              <label className="mt-1.5 flex items-center gap-2 text-xs text-ink-soft">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--color-brand-700)]"
                  checked={form.capacityVerified}
                  onChange={(event) => setForm({ ...form, capacityVerified: event.target.checked })}
                />
                Kapasitas terverifikasi pihak berwenang
              </label>
            </div>
            <div>
              <label htmlFor="room-location" className="field-label">Lokasi/lantai</label>
              <input
                id="room-location"
                className="field-input"
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
              />
            </div>
            <div>
              <label htmlFor="room-image" className="field-label">Path gambar (opsional)</label>
              <input
                id="room-image"
                className="field-input"
                value={form.imagePath}
                onChange={(event) => setForm({ ...form, imagePath: event.target.value })}
                placeholder="/rooms/nama-file.jpg"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="room-description" className="field-label">Deskripsi</label>
              <textarea
                id="room-description"
                className="field-input min-h-20"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="room-image-note" className="field-label">Catatan gambar</label>
              <input
                id="room-image-note"
                className="field-input"
                value={form.imageNote}
                onChange={(event) => setForm({ ...form, imageNote: event.target.value })}
              />
            </div>
            <fieldset className="sm:col-span-2">
              <legend className="field-label">Fasilitas</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {FACILITIES.map((facility) => (
                  <label key={facility} className="flex items-center gap-2 text-sm text-ink-soft">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--color-brand-700)]"
                      checked={form.facilities.includes(facility)}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          facilities: event.target.checked
                            ? [...form.facilities, facility]
                            : form.facilities.filter((item) => item !== facility),
                        })
                      }
                    />
                    {FACILITY_LABELS[facility] ?? facility}
                  </label>
                ))}
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-ink-soft">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--color-brand-700)]"
                  checked={form.facilitiesVerified}
                  onChange={(event) => setForm({ ...form, facilitiesVerified: event.target.checked })}
                />
                Data fasilitas terverifikasi pihak berwenang
              </label>
            </fieldset>
            <div className="flex flex-wrap gap-4 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--color-brand-700)]"
                  checked={form.isActive}
                  onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                />
                Ruangan aktif
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--color-brand-700)]"
                  checked={form.isDemoData}
                  onChange={(event) => setForm({ ...form, isDemoData: event.target.checked })}
                />
                Data operasional masih DEMO
              </label>
            </div>
          </div>

          {error ? <Alert tone="danger" className="mt-4">{error}</Alert> : null}

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => dialogRef.current?.close()} disabled={loading}>
              Batal
            </Button>
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Menyimpan…" : "Simpan ruangan"}
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
