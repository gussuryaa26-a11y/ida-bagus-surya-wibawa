import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";
import { query, queryOne } from "./db";
import { AppError } from "./errors";
import { getAuthSecret, isProduction } from "./env";
import type { SessionUser, UserRole } from "./types";

export const SESSION_COOKIE = "simpar_session";
const SESSION_TTL_HOURS = 12;
const BCRYPT_ROUNDS = 12;

type UserRow = {
  id: string;
  full_name: string;
  login_id: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  nim: string | null;
  program_study: string | null;
  faculty: string | null;
  organization_id: string | null;
  organization_name: string | null;
  organization_code: string | null;
  org_position: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_demo: boolean;
};

const USER_SELECT = `
  SELECT u.id, u.full_name, u.login_id, u.password_hash, u.role, u.is_active,
         u.nim, u.program_study, u.faculty, u.organization_id, u.org_position,
         u.contact_email, u.contact_phone, u.is_demo,
         o.name AS organization_name, o.code AS organization_code
    FROM users u
    LEFT JOIN organizations o ON o.id = u.organization_id
`;

function mapUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    fullName: row.full_name,
    loginId: row.login_id,
    role: row.role,
    nim: row.nim,
    programStudy: row.program_study,
    faculty: row.faculty,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationCode: row.organization_code,
    orgPosition: row.org_position,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    isDemo: row.is_demo,
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(`${token}:${getAuthSecret()}`).digest("hex");
}

export type SessionMeta = {
  userAgent?: string | null;
  ipAddress?: string | null;
};

export async function createSession(userId: string, meta: SessionMeta = {}): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, expiresAt, meta.userAgent ?? null, meta.ipAddress ?? null],
  );

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await query("DELETE FROM sessions WHERE token_hash = $1", [hashSessionToken(token)]);
  }
  jar.delete(SESSION_COOKIE);
}

async function findUserByToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const row = await queryOne<UserRow & { expires_at: Date; session_id: string }>(
    `SELECT s.id AS session_id, s.expires_at,
            u.id, u.full_name, u.login_id, u.password_hash, u.role, u.is_active,
            u.nim, u.program_study, u.faculty, u.organization_id, u.org_position,
            u.contact_email, u.contact_phone, u.is_demo,
            o.name AS organization_name, o.code AS organization_code
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN organizations o ON o.id = u.organization_id
      WHERE s.token_hash = $1`,
    [hashSessionToken(token)],
  );
  if (!row) return null;
  if (row.expires_at.getTime() <= Date.now() || !row.is_active) {
    await query("DELETE FROM sessions WHERE id = $1", [row.session_id]);
    return null;
  }
  void query("UPDATE sessions SET last_seen_at = now() WHERE id = $1", [row.session_id]).catch(
    () => undefined,
  );
  return mapUser(row);
}

/**
 * Layout dan page sama-sama memanggil `requireUser()`. `cache()` memastikan
 * query sesi hanya sekali per request, bukan sekali per komponen server.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  return findUserByToken(jar.get(SESSION_COOKIE)?.value);
});

export async function getSessionUserFromRequest(request: NextRequest | Request): Promise<SessionUser | null> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.slice(SESSION_COOKIE.length + 1));
  return findUserByToken(value);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireApiUser(request: NextRequest | Request): Promise<SessionUser> {
  const user = await getSessionUserFromRequest(request);
  if (!user) throw new AppError("UNAUTHENTICATED", "Sesi tidak valid atau sudah berakhir. Silakan login kembali.");
  return user;
}

export function hasRole(user: SessionUser, roles: UserRole[]): boolean {
  return roles.includes(user.role);
}

export function requireRole(user: SessionUser, roles: UserRole[]): void {
  if (!hasRole(user, roles)) {
    throw new AppError("FORBIDDEN", "Anda tidak memiliki kewenangan untuk tindakan ini.");
  }
}

export async function authenticate(
  loginId: string,
  password: string,
): Promise<SessionUser> {
  const row = await queryOne<UserRow>(`${USER_SELECT} WHERE u.login_id = $1`, [loginId.trim()]);
  if (!row || !row.is_active) {
    throw new AppError("UNAUTHENTICATED", "Kredensial tidak valid atau akun tidak aktif.");
  }
  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) {
    throw new AppError("UNAUTHENTICATED", "Kredensial tidak valid atau akun tidak aktif.");
  }
  return mapUser(row);
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("host");
  try {
    if (!host || new URL(origin).host !== host) {
      throw new AppError("FORBIDDEN", "Permintaan lintas situs ditolak.");
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("FORBIDDEN", "Origin permintaan tidak valid.");
  }
}

export function dashboardPathForRole(role: UserRole): string {
  switch (role) {
    case "academic":
      return "/academic";
    case "facility_manager":
      return "/facilities";
    case "security":
      return "/security";
    case "admin_it":
      return "/admin";
    case "student":
    default:
      return "/dashboard";
  }
}

export async function getUserById(id: string): Promise<SessionUser | null> {
  const row = await queryOne<UserRow>(`${USER_SELECT} WHERE u.id = $1`, [id]);
  return row ? mapUser(row) : null;
}
