import path from "node:path";
import { defineConfig } from "vitest/config";

const TEST_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:55433/simpar_test";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
    sequence: { concurrent: false },
    hookTimeout: 120_000,
    testTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DATABASE_URL,
      AUTH_SECRET: "test-auth-secret-at-least-sixteen-chars",
      INTERNAL_JOB_TOKEN: "test-job-token",
      MEMO_STORAGE_DIR: path.resolve(__dirname, "tests/.memos"),
    },
  },
});
