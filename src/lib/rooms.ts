import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "./db";
import { AppError } from "./errors";
import { writeAudit } from "./audit";
import { markConflictsNotified, notifyPostApprovalConflicts, recordPostApprovalConflicts } from "./conflicts";
import type { Room, RoomCategory, SessionUser } from "./types";

type RoomRow = {
  id: string;
  code: string;
  name: string;
  category: RoomCategory;
  capacity: number | null;
  capacity_verified: boolean;
  facilities: string[];
  facilities_verified: boolean;
  description: string | null;
  location: string | null;
  image_path: string | null;
  image_note: string | null;
  is_active: boolean;
  status_note: string | null;
  is_demo_data: boolean;
  data_source: string;
  verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type RestrictionRow = {
  id: string;
  room_id: string;
  start_at: Date;
  end_at: Date;
  restriction_type: "closure" | "maintenance" | "restriction";
  reason: string;
  created_at: Date;
  room_code: string;
  room_name: string;
  created_by_name: string | null;
};

export function mapRoom(row: RoomRow): Room {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    capacity: row.capacity,
    capacityVerified: row.capacity_verified,
    facilities: row.facilities,
    facilitiesVerified: row.facilities_verified,
    description: row.description,
    location: row.location,
    imagePath: row.image_path,
    imageNote: row.image_note,
    isActive: row.is_active,
    statusNote: row.status_note,
    isDemoData: row.is_demo_data,
    dataSource: row.data_source,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listRooms(filters: {
  search?: string;
  category?: RoomCategory;
  minCapacity?: number;
  facility?: string;
  includeInactive?: boolean;
} = {}): Promise<Room[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (!filters.includeInactive) where.push("is_active = true");
  if (filters.search) {
    params.push(`%${filters.search.trim()}%`);
    where.push(`(name ILIKE $${params.length} OR code ILIKE $${params.length} OR location ILIKE $${params.length})`);
  }
  if (filters.category) {
    params.push(filters.category);
    where.push(`category = $${params.length}`);
  }
  if (filters.minCapacity) {
    params.push(filters.minCapacity);
    where.push(`capacity IS NOT NULL AND capacity >= $${params.length}`);
  }
  if (filters.facility) {
    params.push(filters.facility);
    where.push(`$${params.length} = ANY(facilities)`);
  }
  const rows = await query<RoomRow>(
    `SELECT * FROM rooms ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY category, name`,
    params,
  );
  return rows.map(mapRoom);
}

export async function getRoomById(
  id: string,
  includeInactive = false,
  client?: Pick<PoolClient, "query">,
): Promise<Room | null> {
  const sql = `SELECT * FROM rooms WHERE id = $1 ${includeInactive ? "" : "AND is_active = true"}`;
  if (client) {
    const result = await client.query<RoomRow>(sql, [id]);
    return result.rows[0] ? mapRoom(result.rows[0]) : null;
  }
  const row = await queryOne<RoomRow>(sql, [id]);
  return row ? mapRoom(row) : null;
}

export async function getRoomByCode(code: string): Promise<Room | null> {
  const row = await queryOne<RoomRow>("SELECT * FROM rooms WHERE code = $1", [code]);
  return row ? mapRoom(row) : null;
}

export type RoomInput = {
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
};

export async function createRoom(input: RoomInput, actor: SessionUser): Promise<Room> {
  return withTransaction(async (client) => {
    const existing = await client.query("SELECT id FROM rooms WHERE code = $1", [input.code]);
    if (existing.rows[0]) throw new AppError("CONFLICT", "Kode ruangan sudah digunakan.");
    const result = await client.query<RoomRow>(
      `INSERT INTO rooms
        (code, name, category, capacity, capacity_verified, facilities, facilities_verified,
         description, location, image_path, image_note, is_active, is_demo_data, data_source, verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'CAMPUS_INPUT',$15)
       RETURNING *`,
      [
        input.code.trim().toUpperCase(),
        input.name.trim(),
        input.category,
        input.capacity,
        input.capacityVerified,
        input.facilities,
        input.facilitiesVerified,
        input.description,
        input.location,
        input.imagePath,
        input.imageNote,
        input.isActive,
        input.isDemoData,
        input.capacityVerified || input.facilitiesVerified ? new Date() : null,
      ],
    );
    const room = result.rows[0];
    await writeAudit(client, {
      actorId: actor.id,
      actorLabel: actor.fullName,
      action: "room.created",
      entityType: "room",
      entityId: room.id,
      newState: input,
    });
    return mapRoom(room);
  });
}

export async function updateRoom(id: string, input: RoomInput, actor: SessionUser): Promise<Room> {
  return withTransaction(async (client) => {
    const before = await client.query<RoomRow>("SELECT * FROM rooms WHERE id = $1 FOR UPDATE", [id]);
    if (!before.rows[0]) throw new AppError("NOT_FOUND", "Ruangan tidak ditemukan.");
    if (before.rows[0].code !== input.code) {
      const duplicate = await client.query("SELECT id FROM rooms WHERE code = $1 AND id <> $2", [
        input.code,
        id,
      ]);
      if (duplicate.rows[0]) throw new AppError("CONFLICT", "Kode ruangan sudah digunakan.");
    }
    const result = await client.query<RoomRow>(
      `UPDATE rooms SET
         code = $2, name = $3, category = $4, capacity = $5, capacity_verified = $6,
         facilities = $7, facilities_verified = $8, description = $9, location = $10,
         image_path = $11, image_note = $12, is_active = $13,
         status_note = CASE WHEN $13 THEN NULL ELSE status_note END,
         is_demo_data = $14,
         data_source = 'CAMPUS_INPUT',
         verified_at = CASE WHEN $6 OR $8 THEN now() ELSE verified_at END
       WHERE id = $1
       RETURNING *`,
      [
        id,
        input.code.trim().toUpperCase(),
        input.name.trim(),
        input.category,
        input.capacity,
        input.capacityVerified,
        input.facilities,
        input.facilitiesVerified,
        input.description,
        input.location,
        input.imagePath,
        input.imageNote,
        input.isActive,
        input.isDemoData,
      ],
    );
    await writeAudit(client, {
      actorId: actor.id,
      actorLabel: actor.fullName,
      action: "room.updated",
      entityType: "room",
      entityId: id,
      previousState: before.rows[0],
      newState: input,
    });
    return mapRoom(result.rows[0]);
  });
}

export async function setRoomOperationalStatus(
  id: string,
  input: { isActive: boolean; note: string },
  actor: SessionUser,
): Promise<Room> {
  if (actor.role !== "academic") {
    throw new AppError("FORBIDDEN", "Hanya Akademik yang dapat mengubah status operasional ruangan.");
  }
  const note = input.note.trim();
  if (note.length > 500) {
    throw new AppError("VALIDATION_ERROR", "Keterangan masalah ruangan terlalu panjang (maksimal 500 karakter).");
  }
  if (!input.isActive && note.length < 5) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Keterangan masalah ruangan wajib diisi minimal 5 karakter saat menonaktifkan ruangan.",
    );
  }

  return withTransaction(async (client) => {
    const before = await client.query<RoomRow>("SELECT * FROM rooms WHERE id = $1 FOR UPDATE", [id]);
    if (!before.rows[0]) throw new AppError("NOT_FOUND", "Ruangan tidak ditemukan.");

    const statusNote = input.isActive ? null : note;
    const result = await client.query<RoomRow>(
      `UPDATE rooms
          SET is_active = $2, status_note = $3
        WHERE id = $1
        RETURNING *`,
      [id, input.isActive, statusNote],
    );

    await writeAudit(client, {
      actorId: actor.id,
      actorLabel: actor.fullName,
      action: input.isActive ? "room.activated" : "room.deactivated",
      entityType: "room",
      entityId: id,
      previousState: {
        isActive: before.rows[0].is_active,
        statusNote: before.rows[0].status_note,
      },
      newState: { isActive: input.isActive, statusNote },
      reason: statusNote,
    });

    return mapRoom(result.rows[0]);
  });
}

export async function listRestrictions(roomId?: string): Promise<RestrictionRow[]> {
  const params: unknown[] = [];
  let where = "";
  if (roomId) {
    params.push(roomId);
    where = "WHERE r.room_id = $1";
  }
  return query<RestrictionRow>(
    `SELECT r.id, r.room_id, r.start_at, r.end_at, r.restriction_type, r.reason, r.created_at,
            ro.code AS room_code, ro.name AS room_name, u.full_name AS created_by_name
       FROM room_restrictions r
       JOIN rooms ro ON ro.id = r.room_id
       LEFT JOIN users u ON u.id = r.created_by
       ${where}
      ORDER BY r.start_at DESC
      LIMIT 200`,
    params,
  );
}

export async function createRestriction(
  input: {
    roomId: string;
    startAt: Date;
    endAt: Date;
    restrictionType: "closure" | "maintenance" | "restriction";
    reason: string;
  },
  actor: SessionUser,
): Promise<{ id: string; conflictsDetected: number }> {
  if (input.endAt <= input.startAt) {
    throw new AppError("VALIDATION_ERROR", "Waktu selesai pembatasan harus setelah waktu mulai.");
  }
  const result = await withTransaction(async (client) => {
    const room = await client.query("SELECT id, name FROM rooms WHERE id = $1 FOR UPDATE", [input.roomId]);
    if (!room.rows[0]) throw new AppError("NOT_FOUND", "Ruangan tidak ditemukan.");

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO room_restrictions (room_id, start_at, end_at, restriction_type, reason, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [input.roomId, input.startAt, input.endAt, input.restrictionType, input.reason.trim(), actor.id],
    );

    const overlapping = await client.query<{ id: string }>(
      `SELECT id FROM booking_requests
        WHERE room_id = $1
          AND status IN ('approved', 'cancellation_requested')
          AND tstzrange(start_at, end_at, '[)') && tstzrange($2, $3, '[)')`,
      [input.roomId, input.startAt, input.endAt],
    );

    const conflicts = await recordPostApprovalConflicts(client, {
      candidateBookingIds: overlapping.rows.map((row) => row.id),
      conflictType: "room_restriction",
      sourceEntityType: "room_restriction",
      sourceEntityId: inserted.rows[0].id,
      sourceChange: `Pembatasan ${input.restrictionType} ditambahkan pengelola fasilitas`,
      details: { reason: input.reason, startAt: input.startAt, endAt: input.endAt },
    });

    await writeAudit(client, {
      actorId: actor.id,
      actorLabel: actor.fullName,
      action: "room.restriction_created",
      entityType: "room_restriction",
      entityId: inserted.rows[0].id,
      newState: input,
      reason: input.reason,
    });

    return { id: inserted.rows[0].id, conflicts };
  });

  await notifyPostApprovalConflicts(result.conflicts);
  await markConflictsNotified(result.conflicts.map((conflict) => conflict.bookingId));
  return { id: result.id, conflictsDetected: result.conflicts.length };
}

export async function deleteRestriction(id: string, actor: SessionUser): Promise<void> {
  await withTransaction(async (client) => {
    const before = await client.query("SELECT * FROM room_restrictions WHERE id = $1 FOR UPDATE", [id]);
    if (!before.rows[0]) throw new AppError("NOT_FOUND", "Pembatasan tidak ditemukan.");
    await client.query("DELETE FROM room_restrictions WHERE id = $1", [id]);
    await writeAudit(client, {
      actorId: actor.id,
      actorLabel: actor.fullName,
      action: "room.restriction_deleted",
      entityType: "room_restriction",
      entityId: id,
      previousState: before.rows[0],
    });
  });
}
