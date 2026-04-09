import path from "node:path";

import { readJson } from "../lib/fs.js";

export const RESEARCH_JOB_DEFAULTS = Object.freeze({
  timeWindowHours: 24,
  maxItemsPerSource: 100,
  analysisBatchSize: 10,
  finalSynthesisLimit: 25,
  outputFormat: "markdown",
  reportInstructions: "",
  persona: null,
  account: null,
});

const SUPPORTED_SOURCE_TYPES = new Set(["x-search", "gpt-web-search"]);
const SUPPORTED_X_SEARCH_MODES = new Set(["live", "latest"]);

function normalizeNonEmptyString(value, fieldName) {
  const normalized = value?.toString().trim() ?? "";
  if (!normalized) {
    throw new TypeError(`${fieldName} must be a non-empty string.`);
  }
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

export function normalizeResearchSource(source, sourceIndex) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError(`sources[${sourceIndex}] must be an object.`);
  }

  const type = normalizeNonEmptyString(source.type, `sources[${sourceIndex}].type`);
  if (!SUPPORTED_SOURCE_TYPES.has(type)) {
    throw new Error(`Unsupported research source type "${type}".`);
  }

  if (type === "x-search") {
    const mode = normalizeOptionalString(source.mode) ?? "live";
    if (!SUPPORTED_X_SEARCH_MODES.has(mode)) {
      throw new TypeError(`sources[${sourceIndex}].mode must be "live" or "latest".`);
    }

    return {
      type,
      label: normalizeNonEmptyString(source.label, `sources[${sourceIndex}].label`),
      query: normalizeNonEmptyString(source.query, `sources[${sourceIndex}].query`),
      mode,
    };
  }

  if (type === "gpt-web-search") {
    return {
      type,
      label: normalizeNonEmptyString(source.label, `sources[${sourceIndex}].label`),
      query: normalizeNonEmptyString(source.query, `sources[${sourceIndex}].query`),
    };
  }

  throw new Error(`Unsupported research source type "${type}".`);
}

export function normalizeResearchJob(rawJob, { jobFilePath = null } = {}) {
  if (!rawJob || typeof rawJob !== "object" || Array.isArray(rawJob)) {
    throw new TypeError("Research job must be a JSON object.");
  }

  const sources = rawJob.sources;
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new TypeError("Research job sources must be a non-empty array.");
  }

  const outputFormat = normalizeOptionalString(rawJob.outputFormat) ?? RESEARCH_JOB_DEFAULTS.outputFormat;
  if (outputFormat !== "markdown") {
    throw new TypeError('Research job outputFormat must equal "markdown".');
  }

  return {
    topic: normalizeNonEmptyString(rawJob.topic, "topic"),
    objective: normalizeNonEmptyString(rawJob.objective, "objective"),
    timeWindowHours: normalizePositiveInteger(
      rawJob.timeWindowHours,
      RESEARCH_JOB_DEFAULTS.timeWindowHours,
      "timeWindowHours"
    ),
    maxItemsPerSource: normalizePositiveInteger(
      rawJob.maxItemsPerSource,
      RESEARCH_JOB_DEFAULTS.maxItemsPerSource,
      "maxItemsPerSource"
    ),
    analysisBatchSize: normalizePositiveInteger(
      rawJob.analysisBatchSize,
      RESEARCH_JOB_DEFAULTS.analysisBatchSize,
      "analysisBatchSize"
    ),
    finalSynthesisLimit: normalizePositiveInteger(
      rawJob.finalSynthesisLimit,
      RESEARCH_JOB_DEFAULTS.finalSynthesisLimit,
      "finalSynthesisLimit"
    ),
    outputFormat,
    reportInstructions: rawJob.reportInstructions === undefined ? "" : String(rawJob.reportInstructions).trim(),
    persona: normalizeOptionalString(rawJob.persona),
    account: normalizeOptionalString(rawJob.account),
    sources: sources.map((source, sourceIndex) => normalizeResearchSource(source, sourceIndex)),
    jobFilePath: jobFilePath ? path.resolve(jobFilePath) : null,
  };
}

export async function readResearchJob(jobFilePath) {
  if (!jobFilePath?.toString().trim()) {
    throw new TypeError("jobFilePath is required.");
  }

  const resolvedPath = path.resolve(jobFilePath);
  const rawJob = await readJson(resolvedPath);
  return normalizeResearchJob(rawJob, { jobFilePath: resolvedPath });
}
