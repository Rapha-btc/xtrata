import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const CONFIG_DIR = path.join(REPO_ROOT, "config");
export const OUTPUT_DIR = path.join(REPO_ROOT, "output");
export const RUNS_DIR = path.join(OUTPUT_DIR, "runs");
export const RESEARCH_RUNS_DIR = path.join(OUTPUT_DIR, "research-runs");
export const STATE_DIR = path.join(REPO_ROOT, "state");
export const PROMPTS_DIR = path.join(REPO_ROOT, "prompts");

export function repoPath(...segments) {
  return path.join(REPO_ROOT, ...segments);
}

export function getRunId(now = new Date()) {
  return now.toISOString().replace(/:/g, "-");
}

export function getRunDir(runId) {
  return path.join(RUNS_DIR, runId);
}

export function getResearchRunDir(runId) {
  return path.join(RESEARCH_RUNS_DIR, runId);
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function ensureProjectDirs() {
  await Promise.all([
    ensureDir(CONFIG_DIR),
    ensureDir(OUTPUT_DIR),
    ensureDir(RUNS_DIR),
    ensureDir(RESEARCH_RUNS_DIR),
    ensureDir(STATE_DIR),
    ensureDir(PROMPTS_DIR),
  ]);
}

export async function getLatestRunId() {
  const entries = await fs.readdir(RUNS_DIR, { withFileTypes: true }).catch(() => []);
  const runIds = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return runIds.at(-1) ?? null;
}

export async function resolveRunId(preferredRunId = null) {
  if (preferredRunId) return preferredRunId;
  return getLatestRunId();
}
