import { Pool, types, type PoolClient, type QueryResultRow } from "pg";
import { getDatabaseUrl } from "./env";

// Keep calendar dates as YYYY-MM-DD strings; campus dates must not drift
// through the server's local timezone.
types.setTypeParser(1082, (value: string) => value);

const globalForPool = globalThis as unknown as {
  __simparPool?: Pool;
};

export function getPool(): Pool {
  if (!globalForPool.__simparPool) {
    globalForPool.__simparPool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: "simpar-idb-bali",
    });
  }
  return globalForPool.__simparPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, values);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, values);
  return rows[0] ?? null;
}

export type TxOptions = {
  isolation?: "read committed" | "repeatable read" | "serializable";
  readOnly?: boolean;
};

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  options: TxOptions = {},
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    if (options.isolation) {
      await client.query(`SET TRANSACTION ISOLATION LEVEL ${options.isolation.toUpperCase()}`);
    }
    if (options.readOnly) {
      await client.query("SET TRANSACTION READ ONLY");
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // rollback failures are surfaced by the original error
    }
    throw error;
  } finally {
    client.release();
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");
}

export function isExclusionViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23P01");
}

export async function closePool(): Promise<void> {
  if (globalForPool.__simparPool) {
    await globalForPool.__simparPool.end();
    globalForPool.__simparPool = undefined;
  }
}
