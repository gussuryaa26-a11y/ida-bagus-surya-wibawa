const DEV_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:55432/simpar";

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return url;
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL wajib diisi pada environment produksi.");
  }
  return DEV_DATABASE_URL;
}

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET wajib diisi (minimal 16 karakter) pada environment produksi.");
  }
  return "simpar-development-only-secret";
}

export function getInternalJobToken(): string | null {
  return process.env.INTERNAL_JOB_TOKEN?.trim() || null;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
