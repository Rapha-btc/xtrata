import path from "node:path";

import { readJson } from "./lib/fs.js";

const SUPPORTED_SOURCE_TYPES = new Set(["google-search", "gpt-web-search", "x-search"]);
const SUPPORTED_X_MODES = new Set(["live", "latest"]);

export const DEFAULT_NARRATE_JOB = Object.freeze({
  name: "Narrate Lead Discovery",
  objective:
    "Find public signals of audiobook cost pain, production friction, or demand for scalable multi-voice narration.",
  persona: null,
  account: null,
  timeWindowDays: 30,
  maxResultsPerQuery: 5,
  maxTotalQueries: 8,
  maxCollectedItems: 40,
  maxEnrichmentTasks: 4,
  maxDraftTasks: 4,
  queryPauseMs: 1500,
  stagePauseMs: 1200,
  maxHeapUsedMb: 512,
  chatgptWaitBudgetMs: 240000,
  chatgptPollMs: 1000,
  chatgptReuseReplyThreadForRepairs: true,
  enrichAboveScore: 70,
  draftAboveScore: 80,
  finalLeadLimit: 12,
  queryFamilies: [
    "cost-pain",
    "workflow-pain",
    "commercial-intent",
    "multi-voice",
    "publisher-backlist",
    "ai-openness",
  ],
});

function normalizeString(value, fieldName) {
  const normalized = value?.toString().trim() ?? "";
  if (!normalized) throw new TypeError(`${fieldName} must be a non-empty string.`);
  return normalized;
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) return null;
  const normalized = value.toString().trim();
  return normalized || null;
}

function normalizePositiveInteger(value, fallback, fieldName) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new TypeError(`${fieldName} must be a positive integer.`);
  }
  return parsed;
}

function normalizeBoolean(value, fallback = true) {
  if (value === undefined) return fallback;
  return Boolean(value);
}

function normalizeFamilies(value, defaultFamilies, fieldName) {
  const families = Array.isArray(value) && value.length > 0 ? value : defaultFamilies;
  return families.map((family, index) => normalizeString(family, `${fieldName}[${index}]`));
}

function normalizeSource(rawSource, sourceIndex, defaultFamilies) {
  if (!rawSource || typeof rawSource !== "object" || Array.isArray(rawSource)) {
    throw new TypeError(`sources[${sourceIndex}] must be an object.`);
  }

  const type = normalizeString(rawSource.type, `sources[${sourceIndex}].type`);
  if (!SUPPORTED_SOURCE_TYPES.has(type)) {
    throw new Error(`Unsupported source type "${type}".`);
  }

  const source = {
    type,
    label: normalizeString(rawSource.label, `sources[${sourceIndex}].label`),
    families: normalizeFamilies(rawSource.families, defaultFamilies, `sources[${sourceIndex}].families`),
    maxQueries: normalizePositiveInteger(rawSource.maxQueries, 4, `sources[${sourceIndex}].maxQueries`),
    enabled: normalizeBoolean(rawSource.enabled, true),
  };

  if (type === "google-search") {
    return {
      ...source,
      siteFilters: Array.isArray(rawSource.siteFilters)
        ? rawSource.siteFilters
            .map((entry, filterIndex) =>
              normalizeOptionalString(entry) ?? (() => {
                throw new TypeError(`sources[${sourceIndex}].siteFilters[${filterIndex}] must be a string.`);
              })()
            )
        : [],
    };
  }

  if (type === "gpt-web-search") {
    return source;
  }

  const mode = normalizeOptionalString(rawSource.mode) ?? "live";
  if (!SUPPORTED_X_MODES.has(mode)) {
    throw new TypeError(`sources[${sourceIndex}].mode must be "live" or "latest".`);
  }

  return {
    ...source,
    mode,
  };
}

export function normalizeNarrateJob(rawJob, { jobFilePath = null } = {}) {
  if (!rawJob || typeof rawJob !== "object" || Array.isArray(rawJob)) {
    throw new TypeError("Narrate job must be a JSON object.");
  }

  const defaultFamilies = normalizeFamilies(
    rawJob.queryFamilies,
    DEFAULT_NARRATE_JOB.queryFamilies,
    "queryFamilies"
  );

  if (!Array.isArray(rawJob.sources) || rawJob.sources.length === 0) {
    throw new TypeError("Narrate job sources must be a non-empty array.");
  }

  return {
    name: normalizeString(rawJob.name ?? DEFAULT_NARRATE_JOB.name, "name"),
    objective: normalizeString(rawJob.objective ?? DEFAULT_NARRATE_JOB.objective, "objective"),
    persona: normalizeOptionalString(rawJob.persona),
    account: normalizeOptionalString(rawJob.account),
    timeWindowDays: normalizePositiveInteger(
      rawJob.timeWindowDays,
      DEFAULT_NARRATE_JOB.timeWindowDays,
      "timeWindowDays"
    ),
    maxResultsPerQuery: normalizePositiveInteger(
      rawJob.maxResultsPerQuery,
      DEFAULT_NARRATE_JOB.maxResultsPerQuery,
      "maxResultsPerQuery"
    ),
    maxTotalQueries: normalizePositiveInteger(
      rawJob.maxTotalQueries,
      DEFAULT_NARRATE_JOB.maxTotalQueries,
      "maxTotalQueries"
    ),
    maxCollectedItems: normalizePositiveInteger(
      rawJob.maxCollectedItems,
      DEFAULT_NARRATE_JOB.maxCollectedItems,
      "maxCollectedItems"
    ),
    maxEnrichmentTasks: normalizePositiveInteger(
      rawJob.maxEnrichmentTasks,
      DEFAULT_NARRATE_JOB.maxEnrichmentTasks,
      "maxEnrichmentTasks"
    ),
    maxDraftTasks: normalizePositiveInteger(
      rawJob.maxDraftTasks,
      DEFAULT_NARRATE_JOB.maxDraftTasks,
      "maxDraftTasks"
    ),
    queryPauseMs: normalizePositiveInteger(
      rawJob.queryPauseMs,
      DEFAULT_NARRATE_JOB.queryPauseMs,
      "queryPauseMs"
    ),
    stagePauseMs: normalizePositiveInteger(
      rawJob.stagePauseMs,
      DEFAULT_NARRATE_JOB.stagePauseMs,
      "stagePauseMs"
    ),
    maxHeapUsedMb: normalizePositiveInteger(
      rawJob.maxHeapUsedMb,
      DEFAULT_NARRATE_JOB.maxHeapUsedMb,
      "maxHeapUsedMb"
    ),
    chatgptWaitBudgetMs: normalizePositiveInteger(
      rawJob.chatgptWaitBudgetMs,
      DEFAULT_NARRATE_JOB.chatgptWaitBudgetMs,
      "chatgptWaitBudgetMs"
    ),
    chatgptPollMs: normalizePositiveInteger(
      rawJob.chatgptPollMs,
      DEFAULT_NARRATE_JOB.chatgptPollMs,
      "chatgptPollMs"
    ),
    chatgptReuseReplyThreadForRepairs: normalizeBoolean(
      rawJob.chatgptReuseReplyThreadForRepairs,
      DEFAULT_NARRATE_JOB.chatgptReuseReplyThreadForRepairs
    ),
    enrichAboveScore: normalizePositiveInteger(
      rawJob.enrichAboveScore,
      DEFAULT_NARRATE_JOB.enrichAboveScore,
      "enrichAboveScore"
    ),
    draftAboveScore: normalizePositiveInteger(
      rawJob.draftAboveScore,
      DEFAULT_NARRATE_JOB.draftAboveScore,
      "draftAboveScore"
    ),
    finalLeadLimit: normalizePositiveInteger(
      rawJob.finalLeadLimit,
      DEFAULT_NARRATE_JOB.finalLeadLimit,
      "finalLeadLimit"
    ),
    queryFamilies: defaultFamilies,
    sources: rawJob.sources.map((source, index) => normalizeSource(source, index, defaultFamilies)),
    jobFilePath: jobFilePath ? path.resolve(jobFilePath) : null,
  };
}

export async function readNarrateJob(jobFilePath) {
  if (!jobFilePath?.toString().trim()) {
    throw new TypeError("jobFilePath is required.");
  }

  const resolvedPath = path.resolve(jobFilePath);
  const rawJob = await readJson(resolvedPath);
  return normalizeNarrateJob(rawJob, { jobFilePath: resolvedPath });
}
