import { afterAll } from "vitest";
import { closePool } from "@/lib/db";

afterAll(async () => {
  await closePool();
});
