import "./load-env";
import { runDeadlineJob } from "../src/lib/deadlines";
import { closePool } from "../src/lib/db";

async function main() {
  const result = await runDeadlineJob();
  console.log(JSON.stringify(result, null, 2));
  await closePool();
}

main().catch(async (error) => {
  console.error("[deadlines] gagal", error);
  await closePool().catch(() => undefined);
  process.exit(1);
});
