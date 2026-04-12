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

function isOptionalString(value) {
  return value === null || value === undefined || typeof value === "string";
}

export function buildGptLeadSearchPrompt({ job, queryPlan } = {}) {
  return [
    "Use web search before answering.",
    "You are the discovery agent for Narrate AI.",
    `Objective: ${job.objective}`,
    `Search query: ${queryPlan.query}`,
    `Return up to ${job.maxResultsPerQuery} public-web results that look like real audiobook leads, not generic commentary.`,
    "Prioritize explicit cost pain, workflow pain, publisher/backlist intent, multi-voice fiction needs, and AI-openness signals.",
    "Prefer people or organizations that could plausibly buy or trial audiobook production.",
    "Skip broad SEO listicles unless they expose a clear named prospect or buyer signal.",
  ].join("\n\n");
}

export function buildGptLeadSearchSchemaDescription(maxItems) {
  return [
    "Return a JSON object with exactly these top-level keys:",
    "- summary: string",
    `- items: array with at most ${maxItems} objects`,
    "Each item must include:",
    "- title: string",
    "- url: string or null",
    "- sourceName: string",
    "- publishedAt: string or null",
    "- authorName: string or null",
    "- excerpt: string",
    "- rawText: string or null",
    "- matchedSignals: array of strings",
    "- leadHint: string or null",
    "- whyRelevant: string",
  ].join("\n");
}

function validateGptLeadSearchShape(value, maxItems) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "GPT lead-search result must be a JSON object.";
  }

  if (!Array.isArray(value.items)) {
    return 'GPT lead-search result must include an "items" array.';
  }

  if (value.items.length > maxItems) {
    return `GPT lead-search result must include at most ${maxItems} items.`;
  }

  for (let index = 0; index < value.items.length; index += 1) {
    const item = value.items[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return `GPT lead-search item ${index} must be an object.`;
    }
    if (typeof item.title !== "string") {
      return `GPT lead-search item ${index} must include a string "title".`;
    }
    if (!isOptionalString(item.url)) {
      return `GPT lead-search item ${index} must include a string or null "url".`;
    }
    if (typeof item.sourceName !== "string") {
      return `GPT lead-search item ${index} must include a string "sourceName".`;
    }
    if (!isOptionalString(item.publishedAt)) {
      return `GPT lead-search item ${index} must include a string or null "publishedAt".`;
    }
    if (!isOptionalString(item.authorName)) {
      return `GPT lead-search item ${index} must include a string or null "authorName".`;
    }
    if (typeof item.excerpt !== "string") {
      return `GPT lead-search item ${index} must include a string "excerpt".`;
    }
    if (!isOptionalString(item.rawText)) {
      return `GPT lead-search item ${index} must include a string or null "rawText".`;
    }
    if (!Array.isArray(item.matchedSignals) || item.matchedSignals.some((entry) => typeof entry !== "string")) {
      return `GPT lead-search item ${index} must include a string array "matchedSignals".`;
    }
    if (!isOptionalString(item.leadHint)) {
      return `GPT lead-search item ${index} must include a string or null "leadHint".`;
    }
    if (typeof item.whyRelevant !== "string") {
      return `GPT lead-search item ${index} must include a string "whyRelevant".`;
    }
  }

  return true;
}

function normalizeGptLeadSearchValue(value, query) {
  return {
    summary: normalizeString(value?.summary, "No summary returned."),
    items: (value?.items ?? []).map((item) => ({
      platform: "open-web",
      url: normalizeOptionalString(item.url),
      title: normalizeString(item.title, "Untitled result"),
      excerpt: normalizeString(item.excerpt, "No excerpt returned."),
      rawText: normalizeOptionalString(item.rawText) ?? normalizeString(item.excerpt, ""),
      sourceName: normalizeString(item.sourceName, "Unknown source"),
      publishedAt: normalizeOptionalString(item.publishedAt),
      authorName: normalizeOptionalString(item.authorName),
      matchedSignals: unique((item.matchedSignals ?? []).map((entry) => normalizeString(entry)).filter(Boolean)),
      leadHint: normalizeOptionalString(item.leadHint),
      whyRelevant: normalizeString(item.whyRelevant, "No relevance note returned."),
      searchQuery: query,
    })),
  };
}

export async function collectGptWebSearchSource({
  source,
  queryPlan,
  job,
  adapter,
  personaProfile = null,
  expectedAccountHint = null,
  sendPromptForJsonFn = sendPromptForJson,
  ...jsonReplyOptions
} = {}) {
  const jsonResult = await sendPromptForJsonFn({
    adapter,
    prompt: buildGptLeadSearchPrompt({ job, queryPlan }),
    expectedAccountHint,
    personaProfile,
    schemaDescription: buildGptLeadSearchSchemaDescription(job.maxResultsPerQuery),
    expectedType: "object",
    requiredKeys: ["summary", "items"],
    validate(value) {
      return validateGptLeadSearchShape(value, job.maxResultsPerQuery);
    },
    forceNewTab: true,
    progressLabel: `narrate-gpt-search:${source.label}`,
    ...jsonReplyOptions,
  });

  const normalized = normalizeGptLeadSearchValue(jsonResult.value, queryPlan.query);

  return {
    sourceType: source.type,
    sourceLabel: source.label,
    queryPlan,
    collectedCount: normalized.items.length,
    items: normalized.items,
    rawResult: {
      ...jsonResult,
      value: normalized,
    },
  };
}
