import "./load-env";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const port = Number(process.env.DEV_DB_PORT ?? 55432);
const databaseDir = path.resolve(process.env.DEV_DB_DIR ?? ".data/pg");
const user = process.env.DEV_DB_USER ?? "postgres";
const password = process.env.DEV_DB_PASSWORD ?? "postgres";
const database = process.env.DEV_DB_NAME ?? "simpar";

const postgres = new EmbeddedPostgres({
  databaseDir,
  user,
  password,
  port,
  persistent: true,
});

let stopped = false;

async function stop(): Promise<void> {
  if (stopped) return;
  stopped = true;
  console.log("\n[simpar] menghentikan PostgreSQL development...");
  try {
    await postgres.stop();
  } catch (error) {
    console.error("[simpar] gagal menghentikan PostgreSQL", error);
  }
  process.exit(0);
}

async function main() {
  console.log(`[simpar] data dir: ${databaseDir}`);
  try {
    await postgres.initialise();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already|exists|non-empty/i.test(message)) throw error;
    console.log("[simpar] cluster PostgreSQL sudah ada, melanjutkan.");
  }
  await postgres.start();
  try {
    await postgres.createDatabase(database);
    console.log(`[simpar] database "${database}" dibuat.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists/i.test(message)) throw error;
    console.log(`[simpar] database "${database}" sudah ada.`);
  }
  console.log(`[simpar] PostgreSQL berjalan di 127.0.0.1:${port} (db: ${database})`);
  console.log(
    `[simpar] DATABASE_URL=postgresql://${user}:${password}@127.0.0.1:${port}/${database}`,
  );
  console.log("[simpar] Tekan Ctrl+C untuk berhenti.");
  await new Promise<void>(() => undefined);
}

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

main().catch((error) => {
  console.error("[simpar] gagal menjalankan PostgreSQL development", error);
  process.exit(1);
});

