import { query, queryOne, withTransaction } from "./db";
import { AppError } from "./errors";
import { writeAudit } from "./audit";
import { hashPassword } from "./auth";
import { USER_ROLES, type SessionUser, type UserRole } from "./types";

export type UserListRow = {
  id: string;
  fullName: string;
  loginId: string;
  role: UserRole;
  isActive: boolean;
  nim: string | null;
  programStudy: string | null;
  faculty: string | null;
  organizationId: string | null;
  organizationName: string | null;
  orgPosition: string | null;
  contactEmail: string | null;
  isDemo: boolean;
  createdAt: Date;
};

type UserDbRow = {
  id: string;
  full_name: string;
  login_id: string;
  role: UserRole;
  is_active: boolean;
  nim: string | null;
  program_study: string | null;
  faculty: string | null;
  organization_id: string | null;
  organization_name: string | null;
  org_position: string | null;
  contact_email: string | null;
  is_demo: boolean;
  created_at: Date;
};

function mapUser(row: UserDbRow): UserListRow {
  return {
    id: row.id,
    fullName: row.full_name,
    loginId: row.login_id,
    role: row.role,
    isActive: row.is_active,
    nim: row.nim,
    programStudy: row.program_study,
    faculty: row.faculty,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    orgPosition: row.org_position,
    contactEmail: row.contact_email,
    isDemo: row.is_demo,
    createdAt: row.created_at,
  };
}

export async function listUsers(filters: { search?: string; role?: UserRole } = {}): Promise<UserListRow[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (filters.search) {
    params.push(`%${filters.search.trim()}%`);
    where.push(`(u.full_name ILIKE $${params.length} OR u.login_id ILIKE $${params.length})`);
  }
  if (filters.role) {
    params.push(filters.role);
    where.push(`u.role = $${params.length}`);
  }
  const rows = await query<UserDbRow>(
    `SELECT u.id, u.full_name, u.login_id, u.role, u.is_active, u.nim, u.program_study,
            u.faculty, u.organization_id, u.org_position, u.contact_email, u.is_demo, u.created_at,
            o.name AS organization_name
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY u.role, u.full_name`,
    params,
  );
  return rows.map(mapUser);
}

export async function listOrganizations(includeInactive = false) {
  return query<{
    id: string;
    name: string;
    code: string;
    is_active: boolean;
    is_demo: boolean;
    source: string;
  }>(
    `SELECT id, name, code, is_active, is_demo, source
       FROM organizations
      ${includeInactive ? "" : "WHERE is_active = true"}
      ORDER BY name`,
  );
}

export type ProfileInput = {
  fullName: string;
  programStudy: string | null;
  faculty: string | null;
  orgPosition: string | null;
  contactEmail: string | null;
};

export async function updateProfile(user: SessionUser, input: ProfileInput): Promise<void> {
  if (input.fullName.trim().length < 3) {
    throw new AppError("VALIDATION_ERROR", "Nama lengkap minimal 3 karakter.");
  }
  if (input.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail)) {
    throw new AppError("VALIDATION_ERROR", "Format kontak email tidak valid.");
  }
  await withTransaction(async (client) => {
    const before = await client.query("SELECT full_name, program_study, faculty, org_position, contact_email FROM users WHERE id = $1", [
      user.id,
    ]);
    await client.query(
      `UPDATE users SET full_name = $2, program_study = $3, faculty = $4, org_position = $5, contact_email = $6
        WHERE id = $1`,
      [
        user.id,
        input.fullName.trim(),
        input.programStudy?.trim() || null,
        input.faculty?.trim() || null,
        input.orgPosition?.trim() || null,
        input.contactEmail?.trim() || null,
      ],
    );
    await writeAudit(client, {
      actorId: user.id,
      actorLabel: user.fullName,
      action: "profile.updated",
      entityType: "user",
      entityId: user.id,
      previousState: before.rows[0],
      newState: input,
    });
  });
}

export type CreateUserInput = {
  fullName: string;
  loginId: string;
  password: string;
  role: UserRole;
  nim: string | null;
  programStudy: string | null;
  faculty: string | null;
  organizationId: string | null;
  orgPosition: string | null;
  contactEmail: string | null;
};

export async function createUser(input: CreateUserInput, actor: SessionUser): Promise<UserListRow> {
  if (!USER_ROLES.includes(input.role)) throw new AppError("VALIDATION_ERROR", "Role tidak valid.");
  if (input.password.length < 8) throw new AppError("VALIDATION_ERROR", "Kata sandi minimal 8 karakter.");
  if (!/^[A-Za-z0-9._@-]{3,64}$/.test(input.loginId)) {
    throw new AppError("VALIDATION_ERROR", "ID login hanya boleh huruf, angka, titik, garis bawah, @, atau tanda hubung.");
  }
  if (input.role === "student" && !input.organizationId) {
    throw new AppError("VALIDATION_ERROR", "Mahasiswa wajib memiliki organisasi resmi.");
  }
  const passwordHash = await hashPassword(input.password);
  return withTransaction(async (client) => {
    const existing = await client.query("SELECT id FROM users WHERE login_id = $1", [input.loginId]);
    if (existing.rows[0]) throw new AppError("CONFLICT", "ID login sudah digunakan.");
    const inserted = await client.query<UserDbRow>(
      `INSERT INTO users
         (full_name, login_id, password_hash, role, nim, program_study, faculty,
          organization_id, org_position, contact_email, is_demo, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,true)
       RETURNING id, full_name, login_id, role, is_active, nim, program_study, faculty,
                 organization_id, org_position, contact_email, is_demo, created_at,
                 NULL::text AS organization_name`,
      [
        input.fullName.trim(),
        input.loginId.trim(),
        passwordHash,
        input.role,
        input.nim?.trim() || null,
        input.programStudy?.trim() || null,
        input.faculty?.trim() || null,
        input.organizationId || null,
        input.orgPosition?.trim() || null,
        input.contactEmail?.trim() || null,
      ],
    );
    await writeAudit(client, {
      actorId: actor.id,
      actorLabel: actor.fullName,
      action: "user.created",
      entityType: "user",
      entityId: inserted.rows[0].id,
      newState: { ...input, password: undefined },
    });
    return mapUser(inserted.rows[0]);
  });
}

export type UpdateUserInput = {
  role?: UserRole;
  isActive?: boolean;
  organizationId?: string | null;
  orgPosition?: string | null;
  contactEmail?: string | null;
};

export async function adminUpdateUser(
  userId: string,
  input: UpdateUserInput,
  actor: SessionUser,
): Promise<void> {
  if (userId === actor.id && input.isActive === false) {
    throw new AppError("BUSINESS_RULE", "Anda tidak dapat menonaktifkan akun sendiri.");
  }
  if (userId === actor.id && input.role && input.role !== "admin_it") {
    throw new AppError("BUSINESS_RULE", "Anda tidak dapat menurunkan role akun sendiri.");
  }
  if (input.role && !USER_ROLES.includes(input.role)) {
    throw new AppError("VALIDATION_ERROR", "Role tidak valid.");
  }
  await withTransaction(async (client) => {
    const before = await client.query<UserDbRow>(
      `SELECT id, full_name, login_id, role, is_active, nim, program_study, faculty,
              organization_id, org_position, contact_email, is_demo, created_at,
              NULL::text AS organization_name
         FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    if (!before.rows[0]) throw new AppError("NOT_FOUND", "Pengguna tidak ditemukan.");
    const current = before.rows[0];
    const nextRole = input.role ?? current.role;
    const nextActive = input.isActive ?? current.is_active;
    const nextOrg = input.organizationId === undefined ? current.organization_id : input.organizationId;
    if (nextRole === "student" && !nextOrg) {
      throw new AppError("VALIDATION_ERROR", "Mahasiswa wajib memiliki organisasi resmi.");
    }
    await client.query(
      `UPDATE users SET role = $2, is_active = $3, organization_id = $4, org_position = $5, contact_email = $6
        WHERE id = $1`,
      [
        userId,
        nextRole,
        nextActive,
        nextOrg,
        input.orgPosition === undefined ? current.org_position : input.orgPosition,
        input.contactEmail === undefined ? current.contact_email : input.contactEmail,
      ],
    );
    await writeAudit(client, {
      actorId: actor.id,
      actorLabel: actor.fullName,
      action: "user.updated",
      entityType: "user",
      entityId: userId,
      previousState: {
        role: current.role,
        isActive: current.is_active,
        organizationId: current.organization_id,
        orgPosition: current.org_position,
      },
      newState: input,
      reason: "Perubahan akun/role oleh Admin IT",
    });
  });
}

export async function adminResetPassword(
  userId: string,
  newPassword: string,
  actor: SessionUser,
): Promise<void> {
  if (newPassword.length < 8) throw new AppError("VALIDATION_ERROR", "Kata sandi minimal 8 karakter.");
  const passwordHash = await hashPassword(newPassword);
  await withTransaction(async (client) => {
    const before = await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    if (!before.rows[0]) throw new AppError("NOT_FOUND", "Pengguna tidak ditemukan.");
    await client.query("UPDATE users SET password_hash = $2 WHERE id = $1", [userId, passwordHash]);
    await client.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await writeAudit(client, {
      actorId: actor.id,
      actorLabel: actor.fullName,
      action: "user.password_reset",
      entityType: "user",
      entityId: userId,
      reason: "Reset kata sandi oleh Admin IT",
    });
  });
}

export async function getUserForAdmin(id: string): Promise<UserListRow | null> {
  const row = await queryOne<UserDbRow>(
    `SELECT u.id, u.full_name, u.login_id, u.role, u.is_active, u.nim, u.program_study,
            u.faculty, u.organization_id, u.org_position, u.contact_email, u.is_demo, u.created_at,
            o.name AS organization_name
       FROM users u LEFT JOIN organizations o ON o.id = u.organization_id
      WHERE u.id = $1`,
    [id],
  );
  return row ? mapUser(row) : null;
}

export type OrganizationOption = {
  id: string;
  name: string;
  code: string;
};

/** Daftar organisasi aktif untuk pilihan pada form pengajuan (DEMO). */
export async function listActiveOrganizations(): Promise<OrganizationOption[]> {
  const rows = await query<{ id: string; name: string; code: string }>(
    "SELECT id, name, code FROM organizations WHERE is_active = true ORDER BY name",
  );
  return rows;
}
