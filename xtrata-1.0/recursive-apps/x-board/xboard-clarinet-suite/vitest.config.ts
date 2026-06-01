import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "clarinet",
    pool: "forks",
    fileParallelism: false,
    testTimeout: 30000
  }
});
