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

function buildFallbackDraft(lead) {
  const anchor =
    lead.detectedSignals.find((entry) => entry.type === "cost-pain")?.matchedPhrase ??
    lead.detectedSignals.find((entry) => entry.type === "multi-voice")?.matchedPhrase ??
    "audiobook production friction";
  const subject =
    lead.leadType === "publisher"
      ? `A lower-lift way to test more audio titles`
      : `A faster way to test audiobook demand`;
  const body = [
    `Hi ${lead.personOrCompany},`,
    "",
    `I came across your recent signal around ${anchor}.`,
    "",
    `Narrate AI helps teams test audiobook production with a lower-cost, faster-turnaround workflow, especially where multi-voice coverage or backlist activation matters.`,
    "",
    "If useful, I can share a short sample workflow and an example of how we would pilot one title before expanding.",
    "",
    "Best,",
    "Narrate AI",
  ].join("\n");

  return {
    channel: "email",
    subject,
    body,
    dmVariant: `Saw your note about ${anchor}. We help teams test audiobook production faster and more affordably. Happy to send a short pilot workflow if useful.`,
    personalizationReason: `Anchored on ${anchor}.`,
  };
}

export function buildOutreachPrompt({ job, lead } = {}) {
  return [
    "You are the messaging agent for Narrate AI.",
    "Draft a concise cold outreach note that leads with the buyer's pain relief, not generic AI hype.",
    "Keep it practical and low-pressure.",
    "Mention a pilot or sample-first workflow when appropriate.",
    `Objective: ${job.objective}`,
    `Lead context:\n${JSON.stringify({
      personOrCompany: lead.personOrCompany,
      leadType: lead.leadType,
      totalScore: lead.totalScore,
      detectedSignals: lead.detectedSignals,
      enrichment: lead.enrichment ?? null,
      evidence: lead.evidence,
    }, null, 2)}`,
  ].join("\n\n");
}

export function buildOutreachSchemaDescription() {
  return [
    "Return a JSON object with exactly these keys:",
    "- channel: string",
    "- subject: string",
    "- body: string",
    "- dmVariant: string",
    "- personalizationReason: string",
  ].join("\n");
}

function validateOutreachShape(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Outreach draft result must be a JSON object.";
  }

  for (const key of ["channel", "subject", "body", "dmVariant", "personalizationReason"]) {
    if (typeof value[key] !== "string") {
      return `Outreach draft result must include a string "${key}".`;
    }
  }

  return true;
}

function normalizeDraft(value) {
  return {
    channel: normalizeString(value.channel, "email"),
    subject: normalizeString(value.subject, "Narrate AI pilot"),
    body: normalizeString(value.body, ""),
    dmVariant: normalizeString(value.dmVariant, ""),
    personalizationReason: normalizeString(value.personalizationReason, ""),
  };
}

export async function draftOutreach({
  adapter,
  job,
  lead,
  personaProfile = null,
  expectedAccountHint = null,
  sendPromptForJsonFn = sendPromptForJson,
  allowFallback = true,
  ...jsonReplyOptions
} = {}) {
  try {
    const jsonResult = await sendPromptForJsonFn({
      adapter,
      prompt: buildOutreachPrompt({ job, lead }),
      expectedAccountHint,
      personaProfile,
      schemaDescription: buildOutreachSchemaDescription(),
      expectedType: "object",
      requiredKeys: ["channel", "subject", "body", "dmVariant", "personalizationReason"],
      validate: validateOutreachShape,
      forceNewTab: false,
      progressLabel: `narrate-outreach:${lead.personOrCompany}`,
      ...jsonReplyOptions,
    });

    return {
      leadId: lead.leadId,
      messageVersion: "v1",
      status: "drafted",
      value: normalizeDraft(jsonResult.value),
      rawResult: jsonResult,
    };
  } catch (error) {
    if (!allowFallback) throw error;

    return {
      leadId: lead.leadId,
      messageVersion: "v1-fallback",
      status: "drafted",
      value: buildFallbackDraft(lead),
      rawResult: {
        fallback: true,
        errorMessage: error?.message ?? String(error),
      },
    };
  }
}
