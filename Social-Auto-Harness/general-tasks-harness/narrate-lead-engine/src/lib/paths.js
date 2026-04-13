import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const APP_ROOT = path.resolve(__dirname, "..", "..");
export const OUTPUT_DIR = path.join(APP_ROOT, "output");
export const RUNS_DIR = path.join(OUTPUT_DIR, "runs");
export const STATE_DIR = path.join(APP_ROOT, "state");
export const DB_PATH = path.join(STATE_DIR, "narrate-leads.db");
export const PUBLIC_DIR = path.join(APP_ROOT, "public");
export const JOBS_DIR = path.join(APP_ROOT, "jobs");

export function appPath(...segments) {
  return path.join(APP_ROOT, ...segments);
}

export function getRunId(now = new Date()) {
  return now.toISOString().replace(/:/g, "-");
}

export function getRunDir(runId, runsDir = RUNS_DIR) {
  return path.join(runsDir, runId);
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function ensureAppDirs() {
  await Promise.all([
    ensureDir(OUTPUT_DIR),
    ensureDir(RUNS_DIR),
    ensureDir(STATE_DIR),
  ]);
}
