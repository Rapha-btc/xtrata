#!/usr/bin/env node

import { DB_PATH, getStateSummary, withDb } from "../lib/db.js";
import { ensureProjectDirs } from "../lib/paths.js";

async function main() {
  await ensureProjectDirs();

  const summary = withDb((db) => getStateSummary(db));
  console.log(`Initialized SQLite state at ${DB_PATH}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("DB init failed:", error);
  process.exit(1);
});
