import { sendPromptForJson } from "../../modular-harness/src/chatgpt/sendPromptForJson.js";

function normalizeString(value, fallback = "") {
  const normalized = value?.toString().replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) return null;
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeBoolean(value, fallback = false) {
  if (value === null || value === undefined) return fallback;
  return Boolean(value);
}

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function isOptionalString(value) {
  return value === null || value === undefined || typeof value === "string";
}

export function buildLeadEnrichmentPrompt({ job, lead } = {}) {
  return [
    "Use web search before answering.",
    "You are the enrichment agent for Narrate AI lead discovery.",
    `Objective: ${job.objective}`,
    "Use only public information.",
    "Find the most likely official website, contact path, and commercial context for this lead.",
    `Lead summary:\n${JSON.stringify({
      personOrCompany: lead.personOrCompany,
      leadType: lead.leadType,
      score: lead.totalScore,
      evidence: lead.evidence,
      detectedSignals: lead.detectedSignals,
      riskFlags: lead.riskFlags,
    }, null, 2)}`,
  ].join("\n\n");
}

export function buildLeadEnrichmentSchemaDescription() {
  return [
    "Return a JSON object with exactly these keys:",
    "- personOrCompany: string",
    "- leadType: string",
    "- website: string or null",
    "- email: string or null",
    "- contactPath: string or null",
    "- socialHandle: string or null",
    "- recentTitles: array of strings",
    "- genre: string or null",
    "- hasAudiobooks: boolean",
    "- accessibilityMentioned: boolean",
    "- multilingualMentioned: boolean",
    "- dramatizedAudioMentioned: boolean",
    "- backlistMentioned: boolean",
    "- multiCharacterFiction: boolean",
    "- aiAttitude: string or null",
    "- evidenceUrls: array of strings",
    "- notes: string",
  ].join("\n");
}

function validateLeadEnrichmentShape(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Lead enrichment result must be a JSON object.";
  }

  const stringKeys = ["personOrCompany", "leadType", "notes"];
  for (const key of stringKeys) {
    if (typeof value[key] !== "string") {
      return `Lead enrichment result must include a string "${key}".`;
    }
  }

  const optionalStringKeys = ["website", "email", "contactPath", "socialHandle", "genre", "aiAttitude"];
  for (const key of optionalStringKeys) {
    if (!isOptionalString(value[key])) {
      return `Lead enrichment result must include a string or null "${key}".`;
    }
  }

  if (!Array.isArray(value.recentTitles) || value.recentTitles.some((entry) => typeof entry !== "string")) {
    return 'Lead enrichment result must include a string array "recentTitles".';
  }

  if (!Array.isArray(value.evidenceUrls) || value.evidenceUrls.some((entry) => typeof entry !== "string")) {
    return 'Lead enrichment result must include a string array "evidenceUrls".';
  }

  return true;
}

export function normalizeLeadEnrichmentValue(value) {
  return {
    personOrCompany: normalizeString(value.personOrCompany, "Unknown prospect"),
    leadType: normalizeString(value.leadType, "unknown"),
    website: normalizeOptionalString(value.website),
    email: normalizeOptionalString(value.email),
    contactPath: normalizeOptionalString(value.contactPath),
    socialHandle: normalizeOptionalString(value.socialHandle),
    recentTitles: unique((value.recentTitles ?? []).map((entry) => normalizeString(entry)).filter(Boolean)),
    genre: normalizeOptionalString(value.genre),
    hasAudiobooks: normalizeBoolean(value.hasAudiobooks, false),
    accessibilityMentioned: normalizeBoolean(value.accessibilityMentioned, false),
    multilingualMentioned: normalizeBoolean(value.multilingualMentioned, false),
    dramatizedAudioMentioned: normalizeBoolean(value.dramatizedAudioMentioned, false),
    backlistMentioned: normalizeBoolean(value.backlistMentioned, false),
    multiCharacterFiction: normalizeBoolean(value.multiCharacterFiction, false),
    aiAttitude: normalizeOptionalString(value.aiAttitude),
    evidenceUrls: unique((value.evidenceUrls ?? []).map((entry) => normalizeString(entry)).filter(Boolean)),
    notes: normalizeString(value.notes, "No enrichment notes returned."),
  };
}

export function mergeLeadEnrichment(lead, enrichment) {
  if (!enrichment) return lead;

  const reachabilityBoost = enrichment.email ? 8 : enrichment.contactPath ? 5 : enrichment.website ? 3 : 0;
  const fitBoost =
    (enrichment.multiCharacterFiction ? 6 : 0) +
    (enrichment.backlistMentioned ? 4 : 0) +
    (enrichment.hasAudiobooks ? 2 : 0);
  const aiBoost =
    enrichment.aiAttitude && /\b(?:open|curious|positive|testing|hybrid)\b/i.test(enrichment.aiAttitude) ? 6 : 0;
  const riskPenalty =
    enrichment.aiAttitude && /\b(?:hostile|negative|anti)\b/i.test(enrichment.aiAttitude) ? 8 : 0;

  const updatedReachability = Math.max(lead.reachabilityScore, Math.min(20, lead.reachabilityScore + reachabilityBoost));
  const updatedFit = Math.min(25, lead.fitScore + fitBoost);
  const updatedAi = Math.min(20, lead.aiOpennessScore + aiBoost);
  const updatedRisk = Math.min(30, lead.riskScore + riskPenalty);
  const totalScore = Math.max(
    0,
    Math.min(
      100,
      lead.painScore +
        updatedFit +
        updatedAi +
        lead.buyerLikelihoodScore +
        lead.freshnessScore +
        updatedReachability -
        updatedRisk
    )
  );

  return {
    ...lead,
    personOrCompany: enrichment.personOrCompany || lead.personOrCompany,
    leadType: enrichment.leadType || lead.leadType,
    website: enrichment.website || lead.website,
    email: enrichment.email || lead.email,
    contactPath: enrichment.contactPath || lead.contactPath,
    socialHandle: enrichment.socialHandle || lead.socialHandle,
    fitScore: updatedFit,
    aiOpennessScore: updatedAi,
    reachabilityScore: updatedReachability,
    riskScore: updatedRisk,
    totalScore,
    status: totalScore >= 75 ? "hot" : totalScore >= 60 ? "warm" : "maybe",
    qualification: totalScore >= 75 ? "ready-to-draft" : totalScore >= 60 ? "qualified" : "review",
    enrichment,
  };
}

export async function enrichLead({
  adapter,
  job,
  lead,
  personaProfile = null,
  expectedAccountHint = null,
  sendPromptForJsonFn = sendPromptForJson,
  ...jsonReplyOptions
} = {}) {
  const jsonResult = await sendPromptForJsonFn({
    adapter,
    prompt: buildLeadEnrichmentPrompt({ job, lead }),
    expectedAccountHint,
    personaProfile,
    schemaDescription: buildLeadEnrichmentSchemaDescription(),
    expectedType: "object",
    requiredKeys: ["personOrCompany", "leadType", "notes"],
    validate: validateLeadEnrichmentShape,
    forceNewTab: true,
    progressLabel: `narrate-enrichment:${lead.personOrCompany}`,
    ...jsonReplyOptions,
  });

  return {
    leadId: lead.leadId,
    value: normalizeLeadEnrichmentValue(jsonResult.value),
    rawResult: jsonResult,
  };
}
