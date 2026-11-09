import { query } from "./db";
import { getClockConfig } from "./settings";
import { addDaysToDateKey, combineDateAndTime, dateKeyInTimezone, operationalMinutesBetween } from "./operational-clock";
import { countUnreadNotifications } from "./notifications";
import { getScheduleFreshness } from "./schedule-import";
import type { BookingWithRelations } from "./types";
import { listMyBookings, listMyUpcomingBookings, listAcademicQueue } from "./bookings";

export type StudentDashboard = {
  counts: Record<string, number>;
  pending: Awaited<ReturnType<typeof listMyBookings>>;
  upcoming: Awaited<ReturnType<typeof listMyBookings>>;
  recent: Awaited<ReturnType<typeof listMyBookings>>;
  unreadNotifications: number;
  decisionTargetHours: number;
  holdLimitHours: number;
};

export async function getStudentDashboard(userId: string): Promise<StudentDashboard> {
  const countsRows = await query<{ status: string; count: string }>(
    `SELECT status, count(*)::text AS count FROM booking_requests WHERE requester_id = $1 GROUP BY status`,
    [userId],
  );
  const counts: Record<string, number> = {};
  for (const row of countsRows) counts[row.status] = Number(row.count);

  const pending = await listMyBookings(userId, { status: "pending_academic" });
  const upcoming = await listMyUpcomingBookings(userId);
  const recent = await listMyBookings(userId);
  const settings = await getClockConfig();
  return {
    counts,
    pending,
    upcoming,
    recent: recent.slice(0, 8),
    unreadNotifications: await countUnreadNotifications(userId),
    decisionTargetHours: settings.settings.decisionTargetMinutes / 60,
    holdLimitHours: settings.settings.holdLimitMinutes / 60,
  };
}

export type AcademicQueueItem = BookingWithRelations & {
  operationalMinutesToTarget: number;
  operationalMinutesToExpiry: number;
  overdue: boolean;
  expiringSoon: boolean;
};

export async function getAcademicDashboard(now: Date = new Date()): Promise<{
  queue: AcademicQueueItem[];
  pendingCount: number;
  overdueCount: number;
  expiringSoonCount: number;
  conflictCount: number;
  decisionsToday: number;
}> {
  const config = await getClockConfig(undefined, now);
  const queueRows = await listAcademicQueue();
  const queue: AcademicQueueItem[] = queueRows.map((booking) => {
    const minutesToTarget = operationalMinutesBetween(now, booking.decisionTargetAt, config);
    const minutesToExpiry = operationalMinutesBetween(now, booking.holdExpiresAt, config);
    const overdue =
      booking.status === "pending_academic" && booking.decisionTargetAt.getTime() <= now.getTime();
    return {
      ...booking,
      operationalMinutesToTarget: Math.round(minutesToTarget),
      operationalMinutesToExpiry: Math.round(minutesToExpiry),
      overdue,
      expiringSoon: booking.status === "pending_academic" && minutesToExpiry <= 60,
    };
  });

  const conflictRows = await query<{ count: string }>(
    "SELECT count(*)::text AS count FROM post_approval_conflicts WHERE resolved_at IS NULL",
  );
  const campusDate = dateKeyInTimezone(now, config.settings.timezone);
  const startOfCampusDay = combineDateAndTime(campusDate, "00:00", config.settings.timezone);
  const decisionsRows = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM booking_requests
      WHERE decision_at IS NOT NULL AND decision_at >= $1`,
    [startOfCampusDay],
  );

  return {
    queue,
    pendingCount: queue.filter((item) => item.status === "pending_academic").length,
    overdueCount: queue.filter((item) => item.overdue).length,
    expiringSoonCount: queue.filter((item) => item.expiringSoon).length,
    conflictCount: Number(conflictRows[0]?.count ?? 0),
    decisionsToday: Number(decisionsRows[0]?.count ?? 0),
  };
}

export async function getFacilityDashboard() {
  const roomRows = await query<{
    total: string;
    active: string;
    unverified: string;
    demo: string;
  }>(`SELECT count(*)::text AS total,
             count(*) FILTER (WHERE is_active)::text AS active,
             count(*) FILTER (WHERE NOT capacity_verified OR NOT facilities_verified)::text AS unverified,
             count(*) FILTER (WHERE is_demo_data)::text AS demo
        FROM rooms`);
  const restrictionRows = await query<{ count: string }>(
    "SELECT count(*)::text AS count FROM room_restrictions WHERE end_at >= now()",
  );
  const conflictRows = await query<{ count: string }>(
    "SELECT count(*)::text AS count FROM post_approval_conflicts WHERE resolved_at IS NULL",
  );
  const freshness = await getScheduleFreshness();
  return {
    totalRooms: Number(roomRows[0]?.total ?? 0),
    activeRooms: Number(roomRows[0]?.active ?? 0),
    unverifiedRooms: Number(roomRows[0]?.unverified ?? 0),
    demoRooms: Number(roomRows[0]?.demo ?? 0),
    upcomingRestrictions: Number(restrictionRows[0]?.count ?? 0),
    unresolvedConflicts: Number(conflictRows[0]?.count ?? 0),
    freshness,
  };
}

export async function listSecuritySchedule(
  from: string,
  to: string,
  timezone = "Asia/Makassar",
) {
  const rangeStart = combineDateAndTime(from, "00:00", timezone);
  const rangeEnd = combineDateAndTime(addDaysToDateKey(to, 1), "00:00", timezone);
  return query<{
    id: string;
    activity_name: string;
    room_name: string;
    room_code: string;
    start_at: Date;
    end_at: Date;
    status: string;
  }>(
    `SELECT b.id, b.activity_name, r.name AS room_name, r.code AS room_code,
            b.start_at, b.end_at, b.status
       FROM booking_requests b
       JOIN rooms r ON r.id = b.room_id
      WHERE b.status = 'approved'
        AND b.start_at >= $1
        AND b.start_at < $2
      ORDER BY b.start_at ASC`,
    [rangeStart, rangeEnd],
  );
}

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  actor_label: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  previous_state: unknown;
  new_state: unknown;
  reason: string | null;
  correlation_id: string | null;
  created_at: Date;
  actor_name: string | null;
};

export async function listAuditLogs(filters: {
  entityType?: string;
  entityId?: string;
  action?: string;
  search?: string;
  limit?: number;
} = {}): Promise<AuditLogRow[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (filters.entityType) {
    params.push(filters.entityType);
    where.push(`a.entity_type = $${params.length}`);
  }
  if (filters.entityId) {
    params.push(filters.entityId);
    where.push(`a.entity_id = $${params.length}`);
  }
  if (filters.action) {
    params.push(`%${filters.action}%`);
    where.push(`a.action ILIKE $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search.trim()}%`);
    where.push(`(a.action ILIKE $${params.length} OR a.reason ILIKE $${params.length} OR a.actor_label ILIKE $${params.length})`);
  }
  params.push(filters.limit ?? 100);
  return query<AuditLogRow>(
    `SELECT a.*, u.full_name AS actor_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY a.created_at DESC
      LIMIT $${params.length}`,
    params,
  );
}

export async function listPostApprovalConflicts() {
  return query<{
    id: string;
    booking_id: string;
    conflict_type: string;
    source_entity_type: string;
    source_change: string;
    details: unknown;
    notified_at: Date | null;
    resolved_at: Date | null;
    created_at: Date;
    activity_name: string;
    room_name: string;
    start_at: Date;
    end_at: Date;
  }>(
    `SELECT c.id, c.booking_id, c.conflict_type, c.source_entity_type, c.source_change, c.details,
            c.notified_at, c.resolved_at, c.created_at,
            b.activity_name, r.name AS room_name, b.start_at, b.end_at
       FROM post_approval_conflicts c
       JOIN booking_requests b ON b.id = c.booking_id
       JOIN rooms r ON r.id = b.room_id
      WHERE c.resolved_at IS NULL
      ORDER BY c.created_at DESC
      LIMIT 100`,
  );
}
