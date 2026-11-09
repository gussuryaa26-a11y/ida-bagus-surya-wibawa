import path from "node:path";
import { access, readdir, readFile } from "node:fs/promises";
import { Client } from "pg";
import EmbeddedPostgres from "embedded-postgres";

const PORT = 55433;
const DATABASE = "simpar_test";
const DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/${DATABASE}`;

let postgres: EmbeddedPostgres | null = null;

async function applyMigrations() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const dir = path.join(process.cwd(), "db", "migrations");
    const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      const applied = await client.query("SELECT 1 FROM schema_migrations WHERE version = $1", [file]);
      if (applied.rows[0]) continue;
      const sql = await readFile(path.join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`[test-db] applied ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

export async function setup() {
  postgres = new EmbeddedPostgres({
    databaseDir: path.resolve("tests/.pgdata"),
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: true,
  });
  const pgVersionFile = path.resolve("tests/.pgdata/PG_VERSION");
  try {
    await access(pgVersionFile);
  } catch {
    await postgres.initialise();
  }
  await postgres.start();
  try {
    await postgres.createDatabase(DATABASE);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists/i.test(message)) throw error;
  }
  await applyMigrations();
}

export async function teardown() {
  const { closePool } = await import("../src/lib/db");
  await closePool().catch(() => undefined);
  if (postgres) {
    await postgres.stop();
    postgres = null;
  }
}
