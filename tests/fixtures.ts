import { query, withTransaction } from "@/lib/db";
import { addDaysToDateKey, combineDateAndTime, dateKeyInTimezone } from "@/lib/operational-clock";
import type { SessionUser } from "@/lib/types";

export const IDS = {
  org: "11111111-1111-4111-8111-111111111111",
  student1: "22222222-2222-4222-8222-222222222221",
  student2: "22222222-2222-4222-8222-222222222222",
  academic: "33333333-3333-4333-8333-333333333331",
  facility: "33333333-3333-4333-8333-333333333332",
  security: "33333333-3333-4333-8333-333333333333",
  admin: "33333333-3333-4333-8333-333333333334",
  roomA: "44444444-4444-4444-8444-444444444441",
  roomB: "44444444-4444-4444-8444-444444444442",
  roomC: "44444444-4444-4444-8444-444444444443",
  roomUnverified: "44444444-4444-4444-8444-444444444444",
  roomIncubator: "44444444-4444-4444-8444-444444444445",
  importId: "55555555-5555-4555-8555-555555555551",
  scheduleId: "55555555-5555-4555-8555-555555555552",
};

const TIMEZONE = "Asia/Makassar";

function nextWeekdayKey(startOffset: number, weekday: number): string {
  let dateKey = addDaysToDateKey(dateKeyInTimezone(new Date(), TIMEZONE), startOffset);
  for (let i = 0; i < 14; i += 1) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const isoDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7;
    if (isoDay === weekday) return dateKey;
    dateKey = addDaysToDateKey(dateKey, 1);
  }
  return dateKey;
}

export const TEST_DATE = nextWeekdayKey(7, 1);
export const HOLIDAY_DATE = addDaysToDateKey(TEST_DATE, 7);
export const TEST_START = combineDateAndTime(TEST_DATE, "10:00", TIMEZONE);
export const TEST_END = combineDateAndTime(TEST_DATE, "12:00", TIMEZONE);

export const student1: SessionUser = {
  id: IDS.student1,
  fullName: "Mahasiswa Satu",
  loginId: "20240001",
  role: "student",
  nim: "20240001",
  programStudy: "DKV",
  faculty: "Fakultas Desain",
  organizationId: IDS.org,
  organizationName: "BEM Test",
  organizationCode: "BEM",
  orgPosition: "Ketua",
  contactEmail: "student1@test.local",
  contactPhone: "081200000001",
  isDemo: false,
};

export const student2: SessionUser = {
  ...student1,
  id: IDS.student2,
  fullName: "Mahasiswa Dua",
  loginId: "20240002",
  nim: "20240002",
};

export const academicUser: SessionUser = {
  ...student1,
  id: IDS.academic,
  fullName: "Akademik Test",
  loginId: "akademik",
  role: "academic",
  nim: null,
  organizationId: null,
  organizationName: null,
  organizationCode: null,
  orgPosition: null,
};

export const facilityUser: SessionUser = {
  ...academicUser,
  id: IDS.facility,
  fullName: "Fasilitas Test",
  loginId: "fasilitas",
  role: "facility_manager",
};

export const securityUser: SessionUser = {
  ...academicUser,
  id: IDS.security,
  fullName: "Keamanan Test",
  loginId: "keamanan",
  role: "security",
};

export const adminUser: SessionUser = {
  ...academicUser,
  id: IDS.admin,
  fullName: "Admin Test",
  loginId: "admin",
  role: "admin_it",
};

const TABLES = [
  "post_approval_conflicts",
  "internal_memos",
  "booking_cancellations",
  "booking_requests",
  "notifications",
  "audit_logs",
  "class_schedules",
  "schedule_imports",
  "room_restrictions",
  "operational_exceptions",
  "academic_calendar",
  "rooms",
  "users",
  "organizations",
  "sessions",
];

export async function resetDatabase(): Promise<void> {
  await query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  await query(
    `INSERT INTO operational_settings
       (id, timezone, workdays, open_time, close_time, decision_target_minutes,
        hold_limit_minutes, revision_hold_policy, booking_buffer_minutes,
        schedule_freshness_days, require_fresh_schedule, require_org_position,
        allow_demo_room_data, memo_template_kind, memo_document_prefix, is_confirmed)
     VALUES (1, 'Asia/Makassar', '{1,2,3,4,5}', '08:00', '16:00', 60, 180,
             'release', 0, 120, true, true, false, 'demo', 'DEMO', false)
     ON CONFLICT (id) DO NOTHING`,
  );
  await query(
    `UPDATE operational_settings SET
       timezone = $1,
       workdays = '{1,2,3,4,5}',
       open_time = '08:00',
       close_time = '16:00',
       decision_target_minutes = 60,
       hold_limit_minutes = 180,
       revision_hold_policy = 'release',
       revision_hold_minutes = NULL,
       booking_buffer_minutes = 0,
       schedule_freshness_days = 120,
       require_fresh_schedule = true,
       require_org_position = true,
       allow_demo_room_data = false,
       notification_channels = '{in_app}',
       memo_template_kind = 'demo',
       memo_official_template_path = NULL,
       memo_document_prefix = 'DEMO',
       data_retention_days = NULL,
       is_confirmed = false,
       confirmed_by = NULL,
       confirmed_at = NULL,
       updated_by = NULL
     WHERE id = 1`,
    [TIMEZONE],
  );

  await query(
    `INSERT INTO organizations (id, name, code, is_active, is_demo, source)
     VALUES ($1, 'BEM Test', 'BEM', true, false, 'TEST_FIXTURE')`,
    [IDS.org],
  );

  const users: Array<[string, string, string, string, string, string | null, string | null]> = [
    [IDS.student1, "Mahasiswa Satu", "20240001", "student", IDS.org, "Ketua", "20240001"],
    [IDS.student2, "Mahasiswa Dua", "20240002", "student", IDS.org, "Sekretaris", "20240002"],
    [IDS.academic, "Akademik Test", "akademik", "academic", "", "", null],
    [IDS.facility, "Fasilitas Test", "fasilitas", "facility_manager", "", "", null],
    [IDS.security, "Keamanan Test", "keamanan", "security", "", "", null],
    [IDS.admin, "Admin Test", "admin", "admin_it", "", "", null],
  ];
  for (const user of users) {
    await query(
      `INSERT INTO users (id, full_name, login_id, password_hash, role, is_active, organization_id, org_position, nim)
       VALUES ($1,$2,$3,'x',$4,true,NULLIF($5,'')::uuid,$6,$7)`,
      [user[0], user[1], user[2], user[3], user[4], user[5], user[6]],
    );
  }

  await query(
    `INSERT INTO rooms
       (id, code, name, category, capacity, capacity_verified, facilities, facilities_verified,
        description, is_active, is_demo_data, data_source)
     VALUES
       ($1,'A-101','Ruang A', 'classroom', 40, true, '{ac,wifi,proyektor}', true, 'Ruang kelas uji.', true, false, 'TEST_FIXTURE'),
       ($2,'B-201','Aula B', 'hall', 100, true, '{ac,wifi,sound_system}', true, 'Aula uji.', true, false, 'TEST_FIXTURE'),
       ($3,'C-301','Ruang C', 'multipurpose', 50, true, '{ac,wifi,meja}', true, 'Ruang serbaguna uji.', true, false, 'TEST_FIXTURE'),
       ($4,'D-401','Ruang D', 'classroom', NULL, false, '{}', false, 'Data belum diverifikasi.', true, false, 'TEST_FIXTURE'),
       ($5,'INKUBATOR','Ruang Inkubator Bisnis', 'multipurpose', 6, true, '{ac,wifi,proyektor,meja,kursi}', true, 'Ruang Inkubator Bisnis uji.', true, false, 'TEST_FIXTURE')`,
    [IDS.roomA, IDS.roomB, IDS.roomC, IDS.roomUnverified, IDS.roomIncubator],
  );

  await query(
    `INSERT INTO schedule_imports
       (id, filename, source, source_version, imported_by, status, total_rows, success_rows, failed_rows, details, completed_at)
     VALUES ($1, 'test.csv', 'TEST_FIXTURE', 'v1', $2, 'success', 1, 1, 0, '[]'::jsonb, now())`,
    [IDS.importId, IDS.facility],
  );

  const effectiveFrom = addDaysToDateKey(dateKeyInTimezone(new Date(), TIMEZONE), -30);
  const effectiveUntil = addDaysToDateKey(dateKeyInTimezone(new Date(), TIMEZONE), 400);
  await query(
    `INSERT INTO class_schedules
       (id, room_id, day_of_week, start_time, end_time, effective_from, effective_until,
        semester_label, course_name, source_version, import_id, last_imported_at)
     VALUES ($1,$2,1,'08:00','10:00',$3::date,$4::date,'Ganjil','Kelas Uji','v1',$5,now())`,
    [IDS.scheduleId, IDS.roomA, effectiveFrom, effectiveUntil, IDS.importId],
  );

  await query(
    `INSERT INTO academic_calendar
       (period_start, period_end, calendar_type, description, regular_classes_enabled, source_or_authority)
     VALUES ($1::date, $1::date, 'holiday', 'Libur uji', false, 'TEST_FIXTURE')`,
    [HOLIDAY_DATE],
  );
}

export async function setSettings(overrides: Record<string, unknown>): Promise<void> {
  const entries = Object.entries(overrides);
  if (entries.length === 0) return;
  await withTransaction(async (client) => {
    const fields = entries.map(([key], index) => `${key} = $${index + 1}`).join(", ");
    await client.query(`UPDATE operational_settings SET ${fields} WHERE id = 1`, entries.map(([, value]) => value));
  });
}

export async function countRows(table: string): Promise<number> {
  const rows = await query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`);
  return Number(rows[0]?.count ?? 0);
}
