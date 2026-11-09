import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { Building2, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { AvailabilityResult, Room } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { formatCapacityPercentage } from "@/lib/capacity";
import { CATEGORY_LABELS, facilityLabels } from "@/lib/format";
import { getRoomSelectionState } from "@/lib/room-selection";
type RoomCardRoom = {
  id: string;
  code: string;
  name: string;
  category: Room["category"];
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

type RoomAvailability = Pick<
  AvailabilityResult,
  "available" | "code" | "label" | "reasons" | "blockReason" | "capacity"
>;

export type { RoomCardRoom };

export function RoomCard({
  room,
  availability,
  reasons,
  footer,
  compact = false,
  selected = false,
  imageLink,
}: {
  room: RoomCardRoom;
  availability?: RoomAvailability;
  reasons?: string[];
  footer?: ReactNode;
  compact?: boolean;
  selected?: boolean;
  imageLink?: string;
}) {
  const selection = availability ? getRoomSelectionState(availability) : null;
  const imageClassName = clsx(
    "object-cover",
    imageLink &&
      "motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:scale-[1.03]",
  );
  const imageContent = (
    <>
      {room.imagePath ? (
        <Image
          src={room.imagePath}
          alt={`Foto ${room.name}`}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className={imageClassName}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-brand-700">
          <Building2 className="h-10 w-10" aria-hidden="true" />
        </div>
      )}
      <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
        <Badge tone="brand" className="bg-surface/95">
          {CATEGORY_LABELS[room.category]}
        </Badge>
        {selection ? (
          <Badge tone={selection.tone} className="bg-surface/95">
            {selection.statusLabel}
          </Badge>
        ) : null}
        {availability?.available && availability.capacity?.status === "warning" ? (
          <Badge tone="warning" className="bg-surface/95">
            {formatCapacityPercentage(availability.capacity.percentage ?? 0)}% kapasitas
          </Badge>
        ) : null}
      </div>
      {!room.isActive ? (
        <div className="absolute inset-0 flex items-center justify-center bg-ink/55">
          <span className="rounded-full bg-surface px-4 py-2 text-sm font-semibold text-danger-700">
            Ruangan tidak aktif
          </span>
        </div>
      ) : null}
    </>
  );

  return (
    <article
      className={clsx(
        "flex h-full flex-col overflow-hidden rounded-card border bg-surface shadow-sm transition-colors",
        selected ? "border-brand-600 ring-2 ring-brand-200" : "border-line",
      )}
    >
      {imageLink ? (
        <Link
          href={imageLink}
          aria-label={`Lihat detail ${room.name}`}
          className={clsx(
            "group relative block w-full overflow-hidden bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-inset",
            compact ? "aspect-[16/9]" : "aspect-[16/10]",
          )}
        >
          {imageContent}
        </Link>
      ) : (
        <div className={clsx("relative w-full overflow-hidden bg-brand-100", compact ? "aspect-[16/9]" : "aspect-[16/10]")}>
          {imageContent}
        </div>
      )}

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-lg font-semibold leading-tight text-ink"><Link href={`/rooms/${room.id}`} className="hover:text-brand-700">{room.name}</Link></h3>
            <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-muted">
              {room.code}
              {room.location ? ` • ${room.location}` : ""}
            </p>
          </div>
        </div>

        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{room.description}</p>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-paper px-2.5 py-1.5">
            <dt className="text-muted">Kapasitas</dt>
            <dd className="flex items-center gap-1 font-semibold text-ink">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {room.capacity ? `${room.capacity} orang` : "Belum diketahui"}
              {room.capacity && !room.capacityVerified ? (
                <span className="ml-1 rounded bg-accent-100 px-1 text-[0.6rem] font-bold text-accent-700">
                  DEMO
                </span>
              ) : null}
            </dd>
          </div>
          <div className="rounded-lg bg-paper px-2.5 py-1.5">
            <dt className="text-muted">Fasilitas</dt>
            <dd className="truncate font-semibold text-ink" title={facilityLabels(room.facilities)}>
              {room.facilities.length ? facilityLabels(room.facilities) : "Belum diketahui"}
            </dd>
          </div>
        </dl>

        {availability?.available && availability.capacity?.status === "warning" && availability.capacity.reason ? (
          <p className="mt-3 rounded-lg border border-accent-300 bg-warning-100 px-2.5 py-1.5 text-xs leading-relaxed text-warning-700">
            <strong className="font-semibold">Perlu validasi kapasitas.</strong>{" "}
            {availability.capacity.reason}
          </p>
        ) : null}

        {reasons && reasons.length > 0 ? (
          <ul className="mt-3 space-y-1 text-xs leading-relaxed text-ink-soft">
            {reasons.slice(0, 3).map((reason) => (
              <li key={reason} className="flex gap-1.5">
                <span aria-hidden="true" className="mt-1 h-1 w-1 shrink-0 rounded-full bg-accent-500" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {availability && !availability.available && availability.reasons[0] ? (
          <p className="mt-2 rounded-lg bg-danger-100 px-2.5 py-1.5 text-xs leading-relaxed text-danger-700">
            {availability.reasons[0]}
          </p>
        ) : null}

        {room.imageNote ? <p className="mt-2 text-[0.66rem] leading-relaxed text-muted">{room.imageNote}</p> : null}

        {footer ? <div className="mt-auto pt-4">{footer}</div> : null}
      </div>
    </article>
  );
}
