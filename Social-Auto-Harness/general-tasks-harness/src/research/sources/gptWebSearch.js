import { sendPromptForJson } from "../../../modular-harness/src/chatgpt/sendPromptForJson.js";

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function normalizeString(value, fallback = "") {
  const normalized = value?.toString().replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) return null;
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function isOptionalString(value) {
  return value === null || value === undefined || typeof value === "string";
}

export function buildGptWebSearchPrompt({ job, source } = {}) {
  return [
    "Use web search before answering.",
    "You are collecting research leads for an overnight topic report.",
    `Topic: ${job.topic}`,
    `Objective: ${job.objective}`,
    `Research angle: ${source.query}`,
    `Return up to ${job.maxItemsPerSource} high-signal results.`,
    "Prioritize current or upcoming hackathons, grants, accelerators, demo days, builder programs, bounties, and competitions when they are relevant to the objective.",
    "Prefer official pages, reputable ecosystem posts, or clearly attributable program announcements.",
    "Skip stale, low-detail, duplicate, or weakly relevant results.",
    "For every item, include the official or most useful URL when available and explain briefly why it is relevant.",
  ].join("\n\n");
}

export function buildGptWebSearchSchemaDescription(maxItems) {
  return [
    "Return a JSON object with exactly these top-level keys:",
    "- summary: string",
    `- items: array with at most ${maxItems} objects`,
    "Each item must include:",
    "- title: string",
    "- url: string or null",
    "- sourceName: string",
    "- publishedAt: string or null",
    "- author: string or null",
    "- snippet: string",
    "- bodyText: string or null",
    "- whyRelevant: string",
    "- riskFlags: array of strings",
  ].join("\n");
}

function validateGptWebSearchShape(value, maxItems) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "GPT web search result must be a JSON object.";
  }

  if (typeof value.summary !== "string") {
    return 'GPT web search result must include a string "summary".';
  }

  if (!Array.isArray(value.items)) {
    return 'GPT web search result must include an "items" array.';
  }

  if (value.items.length > maxItems) {
    return `GPT web search result must include at most ${maxItems} items.`;
  }

  for (let index = 0; index < value.items.length; index += 1) {
    const item = value.items[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return `GPT web search item ${index} must be an object.`;
    }

    if (typeof item.title !== "string") {
      return `GPT web search item ${index} must include a string "title".`;
    }

    if (!isOptionalString(item.url)) {
      return `GPT web search item ${index} must include a string or null "url".`;
    }

    if (typeof item.sourceName !== "string") {
      return `GPT web search item ${index} must include a string "sourceName".`;
    }

    if (!isOptionalString(item.publishedAt)) {
      return `GPT web search item ${index} must include a string or null "publishedAt".`;
    }

    if (!isOptionalString(item.author)) {
      return `GPT web search item ${index} must include a string or null "author".`;
    }

    if (typeof item.snippet !== "string") {
      return `GPT web search item ${index} must include a string "snippet".`;
    }

    if (!isOptionalString(item.bodyText)) {
      return `GPT web search item ${index} must include a string or null "bodyText".`;
    }

    if (typeof item.whyRelevant !== "string") {
      return `GPT web search item ${index} must include a string "whyRelevant".`;
    }

    if (!Array.isArray(item.riskFlags) || item.riskFlags.some((entry) => typeof entry !== "string")) {
      return `GPT web search item ${index} must include a string array "riskFlags".`;
    }
  }

  return true;
}

export function normalizeGptWebSearchValue(value, { maxItems } = {}) {
  const items = (value?.items ?? [])
    .slice(0, maxItems)
    .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => ({
      title: normalizeString(entry.title, "Untitled result"),
      url: normalizeOptionalString(entry.url),
      sourceName: normalizeString(entry.sourceName, "Unknown source"),
      publishedAt: normalizeOptionalString(entry.publishedAt),
      author: normalizeOptionalString(entry.author),
      snippet: normalizeString(entry.snippet, "No snippet returned."),
      bodyText: normalizeOptionalString(entry.bodyText),
      whyRelevant: normalizeString(entry.whyRelevant, "No relevance note returned."),
      riskFlags: unique((entry.riskFlags ?? []).map((flag) => normalizeString(flag)).filter(Boolean)),
    }));

  return {
    summary: normalizeString(value?.summary, "No collection summary returned."),
    itemCount: normalizeInteger(items.length, 0),
    items,
  };
}

export async function collectGptWebSearchSource({
  source,
  job,
  adapter,
  expectedAccountHint = null,
  personaProfile = null,
  sendPromptForJsonFn = sendPromptForJson,
  onProgress = null,
  ...jsonReplyOptions
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");
  if (!source || typeof source !== "object") throw new TypeError("source is required.");
  if (!job || typeof job !== "object") throw new TypeError("job is required.");

  const prompt = buildGptWebSearchPrompt({ job, source });
  const jsonResult = await sendPromptForJsonFn({
    adapter,
    prompt,
    expectedAccountHint,
    personaProfile,
    schemaDescription: buildGptWebSearchSchemaDescription(job.maxItemsPerSource),
    expectedType: "object",
    requiredKeys: ["summary", "items"],
    validate(value) {
      return validateGptWebSearchShape(value, job.maxItemsPerSource);
    },
    forceNewTab: true,
    onProgress,
    progressLabel: `research-source:${source.label ?? source.type}`,
    ...jsonReplyOptions,
  });

  const normalizedValue = normalizeGptWebSearchValue(jsonResult.value, {
    maxItems: job.maxItemsPerSource,
  });

  return {
    source,
    sourceType: source.type,
    collectedCount: normalizedValue.items.length,
    rawResult: {
      ...jsonResult,
      value: normalizedValue,
    },
  };
}
