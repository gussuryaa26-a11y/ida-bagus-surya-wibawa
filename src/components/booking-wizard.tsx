"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import clsx from "clsx";
import { Button, buttonClass } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { RoomCard, type RoomCardRoom } from "@/components/room-card";
import { RoomSelectionStatus } from "@/components/room-selection-status";
import { FACILITY_LABELS, ACTIVITY_LABELS } from "@/lib/format";
import { formatCapacityPercentage } from "@/lib/capacity";
import { dateKeyInTimezone, isPastDateTime, timeKeyInTimezone } from "@/lib/operational-clock";
import { getRoomSelectionState } from "@/lib/room-selection";
import {
  ACTIVITY_TYPES,
  type ActivityType,
  type AvailabilityBlockReason,
  type AvailabilityCode,
  type CapacityAssessment,
} from "@/lib/types";

type FormState = {
  organizationName: string;
  activityName: string;
  activityPurpose: string;
  activityType: ActivityType;
  participantCount: string;
  requiredFacilities: string[];
  date: string;
  startTime: string;
  endTime: string;
  roomId: string;
};

type Candidate = {
  room: RoomCardRoom;
  available: boolean;
  code: AvailabilityCode;
  label: string;
  reasons: string[];
  blockReason: AvailabilityBlockReason | null;
  fitScore: number;
  recommendationReasons: string[];
  recommended: boolean;
  capacityFit: boolean;
  capacityAllowed: boolean;
  capacity: CapacityAssessment | null;
  facilitiesFit: boolean;
  categoryMatch: boolean;
};

export function BookingWizard({
  mode,
  bookingId,
  initialRooms,
  organizationName,
  organizationOptions,
  orgPosition,
  initial,
  revisionNote,
  timezone,
}: {
  mode: "create" | "revision";
  bookingId?: string;
  initialRooms: RoomCardRoom[];
  organizationName: string | null;
  organizationOptions: { id: string; name: string; code: string }[];
  orgPosition: string | null;
  initial?: Partial<FormState>;
  revisionNote?: string | null;
  timezone: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>({
    organizationName: initial?.organizationName ?? organizationName ?? "",
    activityName: initial?.activityName ?? "",
    activityPurpose: initial?.activityPurpose ?? "",
    activityType: initial?.activityType ?? "seminar",
    participantCount: initial?.participantCount ?? "",
    requiredFacilities: [],
    date: initial?.date ?? "",
    startTime: initial?.startTime ?? "09:00",
    endTime: initial?.endTime ?? "11:00",
    roomId: initial?.roomId ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [bestUnavailable, setBestUnavailable] = useState<Candidate | null>(null);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const selectedRoomIdRef = useRef(form.roomId);
  selectedRoomIdRef.current = form.roomId;
  const idempotencyKey = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `fallback-${Date.now()}`,
  );

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const interval = window.setInterval(update, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const today = now ? dateKeyInTimezone(now, timezone) : undefined;
  const minTime = now && form.date === today ? timeKeyInTimezone(now, timezone) : undefined;

  const allRooms = useMemo(() => {
    if (candidates) return candidates.map((candidate) => candidate.room);
    return initialRooms;
  }, [candidates, initialRooms]);

  const candidateByRoom = useMemo(() => {
    const map = new Map<string, Candidate>();
    for (const candidate of candidates ?? []) map.set(candidate.room.id, candidate);
    return map;
  }, [candidates]);

  const selectedCandidate = form.roomId ? candidateByRoom.get(form.roomId) : undefined;
  const selectedRoom = allRooms.find((room) => room.id === form.roomId);
  const capacityRejected = selectedCandidate?.capacity?.status === "rejected";
  const hasCapacityWarning = Boolean(
    candidates?.some((candidate) => candidate.available && candidate.capacity?.status === "warning"),
  );
  const recommended = (candidates ?? []).filter((candidate) => candidate.recommended && candidate.available);
  const availableAlternatives = (candidates ?? []).filter((candidate) => candidate.available && !candidate.recommended);
  const sortedAllRooms = useMemo(() => {
    const filtered = search
      ? allRooms.filter(
          (room) =>
            room.name.toLowerCase().includes(search.toLowerCase()) ||
            room.code.toLowerCase().includes(search.toLowerCase()),
        )
      : allRooms;
    return [...filtered].sort((a, b) => {
      const aAvailable = candidateByRoom.get(a.id)?.available ?? true;
      const bAvailable = candidateByRoom.get(b.id)?.available ?? true;
      if (aAvailable !== bAvailable) return aAvailable ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [allRooms, search, candidateByRoom]);

  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    setLoadingRooms(true);
    setRoomError(null);
    setSelectionNotice(null);
    fetch("/api/rooms/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activityType: form.activityType,
        participantCount: Number(form.participantCount),
        requiredFacilities: form.requiredFacilities,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
      }),
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          error?: { message?: string };
          candidates?: Candidate[];
          bestUnavailable?: Candidate | null;
        };
        if (!response.ok) throw new Error(payload.error?.message ?? "Gagal memuat rekomendasi ruangan.");
        if (cancelled) return;
        const nextCandidates = payload.candidates ?? [];
        setCandidates(nextCandidates);
        setBestUnavailable(payload.bestUnavailable ?? null);

        // A room preselected from the room list may no longer be available for
        // this time slot. Never keep an unavailable room selected.
        const selectedId = selectedRoomIdRef.current;
        const selected = selectedId
          ? nextCandidates.find((candidate) => candidate.room.id === selectedId)
          : undefined;
        if (selected && !selected.available) {
          const state = getRoomSelectionState(selected);
          setSelectionNotice(
            `Ruangan ${selected.room.name} tidak dapat dipilih: ${state.label}. Pilih ruangan lain yang tersedia.`,
          );
          setForm((current) =>
            current.roomId === selectedId ? { ...current, roomId: "" } : current,
          );
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setRoomError(error instanceof Error ? error.message : "Gagal memuat rekomendasi.");
      })
      .finally(() => {
        if (!cancelled) setLoadingRooms(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    step,
    form.activityType,
    form.participantCount,
    form.requiredFacilities,
    form.date,
    form.startTime,
    form.endTime,
  ]);

  function validateStep1(): boolean {
    const nextErrors: Record<string, string> = {};
    if (form.activityName.trim().length < 3) nextErrors.activityName = "Nama kegiatan minimal 3 karakter.";
    if (form.activityPurpose.trim().length < 10) nextErrors.activityPurpose = "Tujuan kegiatan minimal 10 karakter.";
    if (!Number.isInteger(Number(form.participantCount)) || Number(form.participantCount) <= 0) {
      nextErrors.participantCount = "Jumlah peserta harus lebih dari nol.";
    }
    const todayKey = dateKeyInTimezone(new Date(), timezone);
    if (!form.date) nextErrors.date = "Tanggal kegiatan wajib diisi.";
    else if (form.date < todayKey) nextErrors.date = "Tanggal kegiatan tidak boleh sebelum hari ini.";
    if (!form.startTime || !form.endTime) nextErrors.time = "Waktu mulai dan selesai wajib diisi.";
    else if (form.endTime <= form.startTime) nextErrors.time = "Waktu selesai harus setelah waktu mulai.";
    else if (!nextErrors.date && isPastDateTime(form.date, form.startTime, timezone)) {
      nextErrors.time = "Waktu mulai tidak boleh di masa lalu. Pilih waktu setelah sekarang.";
    }
    if (form.organizationName.trim().length < 3) {
      nextErrors.organizationName = "Isi nama organisasi yang Anda wakili (minimal 3 karakter).";
    }
    if (!organizationName) nextErrors.organization = "Profil organisasi belum lengkap.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function selectRoom(roomId: string) {
    setForm((current) => ({ ...current, roomId }));
    setSelectionNotice(null);
  }

  function validateStep2(): boolean {
    const nextErrors: Record<string, string> = {};
    const candidate = form.roomId ? candidateByRoom.get(form.roomId) : undefined;
    if (!form.roomId) {
      nextErrors.roomId = "Pilih satu ruangan yang tersedia untuk melanjutkan.";
    } else if (!candidate) {
      nextErrors.roomId = "Ketersediaan ruangan masih diperiksa. Tunggu sebentar lalu coba lagi.";
    } else if (!candidate.available) {
      nextErrors.roomId = `Ruangan ${candidate.room.name} tidak tersedia: ${
        getRoomSelectionState(candidate).label
      }. Pilih ruangan lain.`;
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function submit() {
    if (!confirmed) {
      setSubmitError("Centang pernyataan bahwa Anda memahami ketentuan sebelum mengirim.");
      return;
    }
    if (capacityRejected) {
      setSubmitError(
        selectedCandidate?.capacity?.reason ??
          "Jumlah peserta melebihi batas wajar. Pilih ruangan dengan kapasitas lebih besar.",
      );
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const endpoint =
        mode === "revision" ? `/api/booking-requests/${bookingId}/revision` : "/api/booking-requests";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(mode === "create" ? { "Idempotency-Key": idempotencyKey.current } : {}),
        },
        body: JSON.stringify({
          organizationName: form.organizationName,
          activityName: form.activityName,
          activityPurpose: form.activityPurpose,
          activityType: form.activityType,
          participantCount: Number(form.participantCount),
          requiredFacilities: form.requiredFacilities,
          roomId: form.roomId,
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
        }),
      });
      const payload = (await response.json()) as {
        error?: { message?: string };
        booking?: { id: string };
      };
      if (!response.ok) throw new Error(payload.error?.message ?? "Pengajuan gagal disimpan.");
      if (!payload.booking?.id) throw new Error("Server tidak mengembalikan pengajuan.");
      router.push(`/bookings/${payload.booking.id}?submitted=1`);
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Pengajuan gagal disimpan.");
    } finally {
      setSubmitting(false);
    }
  }

  const steps = [
    { number: 1, label: "Keperluan kegiatan" },
    { number: 2, label: "Pilih ruangan" },
    { number: 3, label: "Ringkasan & kirim" },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <ol className="mb-6 flex flex-wrap items-center gap-2 text-sm" aria-label="Langkah pengajuan">
        {steps.map((item, index) => {
          const active = step === item.number;
          const done = step > item.number;
          return (
            <li key={item.number} className="flex items-center gap-2">
              <div
                className={clsx(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5",
                  active
                    ? "border-brand-600 bg-brand-50 text-brand-900"
                    : done
                      ? "border-success-700/20 bg-success-100 text-success-700"
                      : "border-line bg-surface text-muted",
                )}
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={clsx(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[0.68rem] font-bold",
                    active ? "bg-brand-700 text-white" : done ? "bg-success-700 text-white" : "bg-line text-ink-soft",
                  )}
                >
                  {done ? <Check className="h-3 w-3" aria-hidden="true" /> : item.number}
                </span>
                <span className="font-semibold">{item.label}</span>
              </div>
              {index < steps.length - 1 ? <span className="hidden h-px w-4 bg-line-strong sm:block" /> : null}
            </li>
          );
        })}
      </ol>

      {revisionNote ? (
        <Alert tone="warning" className="mb-5" title="Catatan revisi dari Akademik">
          {revisionNote}
        </Alert>
      ) : null}

      {step === 1 ? (
        <section className="card-surface p-5 sm:p-6">
          <div className="mb-5 rounded-xl border border-brand-200 bg-brand-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-brand-900">Organisasi yang diwakili</p>
                <p className="mt-0.5 text-xs leading-relaxed text-brand-900/70">
                  Wajib diisi. Organisasi ini yang akan ditinjau Bagian Akademik, bukan hanya afiliasi pada profil.
                </p>
              </div>
              {orgPosition ? <Badge tone="brand">Jabatan: {orgPosition}</Badge> : null}
            </div>

            <div className="mt-3">
              <label htmlFor="organizationName" className="field-label">
                Nama organisasi <span className="text-danger-700">*</span>
              </label>
              <input
                id="organizationName"
                className="field-input bg-surface"
                value={form.organizationName}
                onChange={(event) => setForm({ ...form, organizationName: event.target.value })}
                list="organization-options"
                placeholder="Contoh: BEM IDB Bali"
                aria-invalid={Boolean(errors.organizationName)}
                aria-describedby="organizationName-help"
                maxLength={160}
                required
              />
              <datalist id="organization-options">
                {organizationOptions.map((organization) => (
                  <option key={organization.id} value={organization.name}>
                    {organization.code}
                  </option>
                ))}
              </datalist>
              {errors.organizationName ? (
                <p className="mt-1 text-xs text-danger-700">{errors.organizationName}</p>
              ) : (
                <p id="organizationName-help" className="mt-1 text-xs text-brand-900/70">
                  Pilih dari daftar organisasi kampus atau tulis nama organisasi Anda.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="activityName" className="field-label">
                Nama kegiatan <span className="text-danger-700">*</span>
              </label>
              <input
                id="activityName"
                className="field-input"
                value={form.activityName}
                onChange={(event) => setForm({ ...form, activityName: event.target.value })}
                aria-invalid={Boolean(errors.activityName)}
                placeholder="Contoh: Workshop Portofolio Desain"
                maxLength={160}
              />
              {errors.activityName ? <p className="mt-1 text-xs text-danger-700">{errors.activityName}</p> : null}
            </div>

            <div>
              <label htmlFor="activityType" className="field-label">
                Jenis kegiatan <span className="text-danger-700">*</span>
              </label>
              <select
                id="activityType"
                className="field-input"
                value={form.activityType}
                onChange={(event) => setForm({ ...form, activityType: event.target.value as ActivityType })}
              >
                {ACTIVITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {ACTIVITY_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="participantCount" className="field-label">
                Jumlah peserta <span className="text-danger-700">*</span>
              </label>
              <input
                id="participantCount"
                type="number"
                min={1}
                className="field-input"
                value={form.participantCount}
                onChange={(event) => setForm({ ...form, participantCount: event.target.value })}
                aria-invalid={Boolean(errors.participantCount)}
                placeholder="Contoh: 40"
              />
              {errors.participantCount ? <p className="mt-1 text-xs text-danger-700">{errors.participantCount}</p> : null}
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="activityPurpose" className="field-label">
                Tujuan / deskripsi kegiatan <span className="text-danger-700">*</span>
              </label>
              <textarea
                id="activityPurpose"
                className="field-input min-h-28"
                value={form.activityPurpose}
                onChange={(event) => setForm({ ...form, activityPurpose: event.target.value })}
                aria-invalid={Boolean(errors.activityPurpose)}
                placeholder="Jelaskan tujuan, agenda utama, dan siapa yang terlibat."
                maxLength={2000}
              />
              {errors.activityPurpose ? <p className="mt-1 text-xs text-danger-700">{errors.activityPurpose}</p> : null}
            </div>

            <div>
              <label htmlFor="date" className="field-label">
                Tanggal kegiatan <span className="text-danger-700">*</span>
              </label>
              <input
                id="date"
                type="date"
                min={today}
                className="field-input"
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
                aria-invalid={Boolean(errors.date)}
              />
              {errors.date ? <p className="mt-1 text-xs text-danger-700">{errors.date}</p> : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="startTime" className="field-label">
                  Mulai <span className="text-danger-700">*</span>
                </label>
                <input
                  id="startTime"
                  type="time"
                  min={minTime}
                  className="field-input"
                  value={form.startTime}
                  onChange={(event) => setForm({ ...form, startTime: event.target.value })}
                />
              </div>
              <div>
                <label htmlFor="endTime" className="field-label">
                  Selesai <span className="text-danger-700">*</span>
                </label>
                <input
                  id="endTime"
                  type="time"
                  min={form.startTime || minTime}
                  className="field-input"
                  value={form.endTime}
                  onChange={(event) => setForm({ ...form, endTime: event.target.value })}
                />
              </div>
            </div>
            {errors.time ? <p className="text-xs text-danger-700 sm:col-span-2">{errors.time}</p> : null}

          </div>

          {errors.organization ? <Alert tone="danger" className="mt-4">{errors.organization}</Alert> : null}

          <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-line pt-5">
            <Link href={mode === "revision" && bookingId ? `/bookings/${bookingId}` : "/dashboard"} className={buttonClass("secondary", "md")}>
              Batal
            </Link>
            <Button
              onClick={() => {
                if (validateStep1()) setStep(2);
              }}
              size="md"
            >
              Lanjut pilih ruangan
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-6">
          <div className="card-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-[0.72rem] font-bold uppercase tracking-[0.12em] text-brand-700">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Rekomendasi untuk kegiatanmu
                </p>
                <h2 className="mt-1 font-display text-2xl font-semibold text-ink">
                  Ruangan yang paling sesuai
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
                  {ACTIVITY_LABELS[form.activityType]} • {form.participantCount} peserta • {form.date} •{" "}
                  {form.startTime}–{form.endTime}. Rekomendasi deterministik, bukan persetujuan.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Ubah keperluan
              </Button>
            </div>

            {roomError ? <Alert tone="danger" className="mt-4">{roomError}</Alert> : null}
            {selectionNotice ? <Alert tone="warning" className="mt-4">{selectionNotice}</Alert> : null}
            {!loadingRooms && hasCapacityWarning ? (
              <Alert tone="warning" className="mt-4">
                Sebagian ruangan berada pada 101–120% kapasitas. Ruangan tersebut tetap dapat dipilih, tetapi
                pengajuan akan ditandai untuk validasi tambahan Bagian Akademik.
              </Alert>
            ) : null}
            {loadingRooms ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Memeriksa kapasitas, fasilitas, jadwal kuliah, booking, dan pembatasan…
              </div>
            ) : null}

            {!loadingRooms && bestUnavailable && recommended.length === 0 ? (
              <Alert tone="warning" className="mt-4" title="Paling sesuai tetapi tidak tersedia">
                {bestUnavailable.room.name}: {bestUnavailable.reasons[0] ?? bestUnavailable.label}. Lihat alternatif di
                bawah atau ubah waktu/kebutuhan.
              </Alert>
            ) : null}

            {!loadingRooms && candidates && recommended.length === 0 && availableAlternatives.length > 0 ? (
              <Alert tone="info" className="mt-4">
                Tidak ada ruangan yang memenuhi seluruh kriteria fasilitas/kapasitas. Alternatif tersedia ditampilkan di
                bawah; periksa alasan pada setiap kartu.
              </Alert>
            ) : null}

            {!loadingRooms && recommended.length > 0 ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {recommended.slice(0, 4).map((candidate) => {
                  const selection = getRoomSelectionState(candidate);
                  return (
                    <RoomCard
                      key={candidate.room.id}
                      room={candidate.room}
                      availability={candidate}
                      reasons={candidate.recommendationReasons}
                      selected={form.roomId === candidate.room.id}
                      compact
                      footer={
                        selection.selectable ? (
                          <Button
                            variant={form.roomId === candidate.room.id ? "accent" : "primary"}
                            size="sm"
                            className="w-full"
                            onClick={() => selectRoom(candidate.room.id)}
                          >
                            {form.roomId === candidate.room.id ? (
                              <>
                                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                                Ruangan Dipilih
                              </>
                            ) : (
                              "Pilih Ruangan"
                            )}
                          </Button>
                        ) : (
                          <RoomSelectionStatus state={selection} />
                        )
                      }
                    />
                  );
                })}
              </div>
            ) : null}

            {!loadingRooms && availableAlternatives.length > 0 ? (
              <div className="mt-5">
                <h3 className="text-sm font-bold uppercase tracking-[0.1em] text-muted">Alternatif tersedia</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {availableAlternatives.map((candidate) => (
                    <button
                      key={candidate.room.id}
                      type="button"
                      onClick={() => selectRoom(candidate.room.id)}
                      className={clsx(
                        "rounded-full border px-3 py-1.5 text-xs font-semibold",
                        form.roomId === candidate.room.id
                          ? "border-brand-600 bg-brand-50 text-brand-900"
                          : "border-line bg-surface text-ink-soft hover:border-brand-600",
                      )}
                    >
                      {candidate.room.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="card-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-semibold text-ink">Semua ruangan kampus</h2>
                <p className="mt-1 text-sm text-muted">
                  Semua ruangan dapat dilihat dan dipilih manual. Pilihan manual tetap tunduk pada validasi server.
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input
                  className="field-input pl-9"
                  placeholder="Cari nama atau kode ruangan"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Cari ruangan"
                />
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sortedAllRooms.map((room) => {
                const candidate = candidateByRoom.get(room.id);
                const selection = getRoomSelectionState(candidate);
                return (
                  <RoomCard
                    key={room.id}
                    room={room}
                    availability={candidate}
                    reasons={candidate?.recommendationReasons}
                    selected={form.roomId === room.id}
                    compact
                    footer={
                      selection.selectable ? (
                        <Button
                          variant={form.roomId === room.id ? "accent" : "secondary"}
                          size="sm"
                          className="w-full"
                          onClick={() => selectRoom(room.id)}
                        >
                          {form.roomId === room.id ? (
                            <>
                              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                              Ruangan Dipilih
                            </>
                          ) : (
                            "Pilih Ruangan"
                          )}
                        </Button>
                      ) : (
                        <RoomSelectionStatus state={selection} />
                      )
                    }
                  />
                );
              })}
            </div>
            {sortedAllRooms.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Tidak ada ruangan yang cocok dengan pencarian.</p>
            ) : null}

            {errors.roomId ? <Alert tone="danger" className="mt-4">{errors.roomId}</Alert> : null}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
              <Button variant="secondary" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Kembali
              </Button>
              <div className="flex items-center gap-3">
                {selectedRoom ? (
                  <p className="text-sm text-muted">
                    Dipilih: <strong className="font-semibold text-ink">{selectedRoom.name}</strong>
                  </p>
                ) : null}
                <Button
                  disabled={loadingRooms}
                  onClick={() => {
                    if (validateStep2()) setStep(3);
                  }}
                >
                  Lanjut ke ringkasan
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="card-surface p-5 sm:p-6">
            <h2 className="font-display text-2xl font-semibold text-ink">Ringkasan pengajuan</h2>
            <p className="mt-1 text-sm text-muted">
              Periksa kembali sebelum dikirim. Pengajuan akan masuk antrean Bagian Akademik dan slot ditahan sementara.
            </p>

            <dl className="mt-5 divide-y divide-line text-sm">
              <SummaryRow label="Organisasi">{form.organizationName || "—"}</SummaryRow>
              <SummaryRow label="Jabatan">{orgPosition ?? "—"}</SummaryRow>
              <SummaryRow label="Nama kegiatan">{form.activityName}</SummaryRow>
              <SummaryRow label="Jenis kegiatan">{ACTIVITY_LABELS[form.activityType]}</SummaryRow>
              <SummaryRow label="Jumlah peserta">{form.participantCount} orang</SummaryRow>
              <SummaryRow label="Tanggal">{form.date}</SummaryRow>
              <SummaryRow label="Waktu">
                {form.startTime}–{form.endTime}
              </SummaryRow>
              <SummaryRow label="Ruangan">{selectedRoom?.name ?? "—"}</SummaryRow>
              <SummaryRow label="Kapasitas ruangan">
                {selectedRoom?.capacity ? `${selectedRoom.capacity} orang` : "Belum diketahui"}
                {selectedCandidate?.capacity?.percentage != null
                  ? ` • ${formatCapacityPercentage(selectedCandidate.capacity.percentage)}% dari kapasitas`
                  : ""}
              </SummaryRow>
              <SummaryRow label="Fasilitas">
                {form.requiredFacilities.length
                  ? form.requiredFacilities.map((facility) => FACILITY_LABELS[facility] ?? facility).join(", ")
                  : "Tidak ada kebutuhan khusus"}
              </SummaryRow>
              <SummaryRow label="Tujuan kegiatan">
                <span className="whitespace-pre-line">{form.activityPurpose}</span>
              </SummaryRow>
            </dl>

            {selectedCandidate?.capacity?.status === "warning" ? (
              <Alert
                tone="warning"
                className="mt-4"
                title="Jumlah peserta melebihi kapasitas ruangan"
              >
                {selectedCandidate.capacity.reason} Pengajuan belum dianggap disetujui sampai Bagian Akademik
                memutuskan.
              </Alert>
            ) : null}

            {capacityRejected ? (
              <Alert
                tone="danger"
                className="mt-4"
                title="Pengajuan ditolak: kapasitas melebihi 120%"
              >
                {selectedCandidate?.capacity?.reason ??
                  "Jumlah peserta melebihi batas wajar. Pilih ruangan dengan kapasitas lebih besar."}
              </Alert>
            ) : null}

            {selectedCandidate &&
            !selectedCandidate.available &&
            selectedCandidate.capacity?.status !== "rejected" ? (
              <Alert
                tone="warning"
                className="mt-4"
                title={`Ruangan tidak tersedia: ${getRoomSelectionState(selectedCandidate).label}`}
              >
                {selectedCandidate.reasons[0]} Server akan memeriksa ulang dan dapat menolak pengajuan ini.
              </Alert>
            ) : null}

            <label className="mt-5 flex items-start gap-3 rounded-xl border border-line bg-paper px-4 py-3 text-sm leading-relaxed text-ink-soft">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--color-brand-700)]"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                Saya memahami bahwa rekomendasi bukan persetujuan, pengajuan hanya untuk kegiatan organisasi resmi, dan
                slot dapat kedaluwarsa jika melewati batas penahanan.
              </span>
            </label>

            {submitError ? <Alert tone="danger" className="mt-4">{submitError}</Alert> : null}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
              <Button variant="secondary" onClick={() => setStep(2)} disabled={submitting}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Kembali
              </Button>
              <Button variant="accent" size="lg" onClick={submit} disabled={submitting || capacityRejected}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                )}
                {submitting
                  ? "Menyimpan & menahan slot…"
                  : mode === "revision"
                    ? "Kirim ulang revisi"
                    : "Kirim pengajuan"}
              </Button>
            </div>
          </div>

          <aside className="space-y-4">
            {selectedRoom ? (
              <div className="card-surface overflow-hidden">
                {selectedRoom.imagePath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedRoom.imagePath} alt={selectedRoom.name} className="aspect-[16/10] w-full object-cover" />
                ) : null}
                <div className="p-4">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-brand-600">Ruangan dipilih</p>
                  <h3 className="mt-1 font-display text-xl font-semibold text-ink">{selectedRoom.name}</h3>
                  <p className="text-xs text-muted">{selectedRoom.code}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{selectedRoom.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge tone="brand">
                      Kapasitas {selectedRoom.capacity ?? "belum diketahui"}
                      {selectedRoom.capacity && !selectedRoom.capacityVerified ? " (DEMO)" : ""}
                    </Badge>
                    {selectedCandidate ? (
                      <Badge tone={selectedCandidate.available ? "success" : "danger"}>{selectedCandidate.label}</Badge>
                    ) : null}
                    {selectedCandidate?.capacity?.status === "warning" ? (
                      <Badge tone="warning">
                        {formatCapacityPercentage(selectedCandidate.capacity.percentage ?? 0)}% — validasi Akademik
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="rounded-card border border-accent-300 bg-warning-100 p-4 text-sm leading-relaxed text-warning-700">
              <p className="flex items-center gap-2 font-semibold">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                Setelah dikirim
              </p>
              <p className="mt-1">
                Akademik menerima antrean dengan target keputusan {""}
                satu jam operasional. Jika disetujui, Internal Memo dibuat dan dapat diunduh dari halaman pengajuan.
              </p>
            </div>
          </aside>
        </section>
      ) : null}
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
