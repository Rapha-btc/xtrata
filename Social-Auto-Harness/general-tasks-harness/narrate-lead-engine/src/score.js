import { createHash } from "node:crypto";

const SIGNAL_RULES = [
  { type: "cost-pain", weight: 14, pattern: /\b(?:too expensive|expensive|costly|affordable|budget|cheaper|cost of producing an audiobook)\b/i },
  { type: "workflow-pain", weight: 10, pattern: /\b(?:how to make an audiobook|how do i make an audiobook|audiobook production|production workflow|need audiobook production)\b/i },
  { type: "multi-voice", weight: 12, pattern: /\b(?:multiple voices|different character voices|character voices|full cast|dialogue-heavy|dramatized audio)\b/i },
  { type: "commercial-intent", weight: 14, pattern: /\b(?:seeking audiobook narrator|looking for audiobook narrator|audio rights|backlist|rollout|publisher audiobook production)\b/i },
  { type: "ai-openness", weight: 10, pattern: /\b(?:ai narration|ai voice|text to speech|using ai|ai tools|hybrid workflow)\b/i },
  { type: "accessibility", weight: 6, pattern: /\b(?:accessibility|accessible edition|audio edition)\b/i },
];

const BUYER_RULES = [
  { leadType: "publisher", score: 24, pattern: /\b(?:publisher|imprint|small press|rights manager|rights catalog)\b/i },
  { leadType: "rights-holder", score: 20, pattern: /\b(?:rights holder|rights catalog|audio rights)\b/i },
  { leadType: "producer", score: 18, pattern: /\b(?:producer|production manager|audio producer)\b/i },
  { leadType: "author", score: 16, pattern: /\b(?:author|novelist|writer|self-publishing|kdp|indie author)\b/i },
];

const FICTION_FIT_RULES = [
  /\b(?:fantasy|romance|ya|young adult|thriller|litrpg|children's fiction|childrens fiction|fiction series)\b/i,
  /\b(?:series|dialogue-heavy|character voices)\b/i,
];

const RISK_RULES = [
  { flag: "anti-ai", score: 18, pattern: /\b(?:anti ai|against ai|hate ai|never use ai|ai is theft|stolen voices)\b/i },
  { flag: "student-or-academic", score: 10, pattern: /\b(?:student project|homework|thesis|research paper|academic question)\b/i },
  { flag: "generic-discussion", score: 8, pattern: /\b(?:what is an audiobook|history of audiobooks|definition of audiobook)\b/i },
];

function normalizeText(value) {
  return value?.toString().replace(/\s+/g, " ").trim() ?? "";
}

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function hashValue(value) {
  return createHash("sha1").update(value).digest("hex");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseDateScore(publishedAt, now = new Date()) {
  if (!publishedAt) return 8;

  const normalizedNow = now instanceof Date ? now : new Date(now);
  const parsed = new Date(publishedAt);
  if (Number.isNaN(parsed.getTime())) return 8;

  const ageDays = (normalizedNow.getTime() - parsed.getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays <= 7) return 18;
  if (ageDays <= 30) return 14;
  if (ageDays <= 90) return 10;
  if (ageDays <= 730) return 6;
  return 2;
}

function inferPersonOrCompany(item) {
  if (item.authorName) return item.authorName;
  if (item.title) return item.title;
  if (item.url) {
    try {
      return new URL(item.url).hostname.replace(/^www\./, "");
    } catch {
      return item.url;
    }
  }
  return "Unknown prospect";
}

function inferWebsite(item) {
  if (!item.url) return null;
  try {
    const url = new URL(item.url);
    if (["reddit.com", "x.com", "twitter.com", "linkedin.com"].some((entry) => url.hostname.includes(entry))) {
      return null;
    }
    return `${url.protocol}//${url.hostname}/`;
  } catch {
    return null;
  }
}

export function extractLeadSignals(item) {
  const haystack = normalizeText([item.title, item.excerpt, item.rawText, item.query, item.url].filter(Boolean).join(" "));

  const matchedSignals = [];
  let painScore = 0;
  let fitScore = 0;
  let aiOpennessScore = 0;

  for (const rule of SIGNAL_RULES) {
    const match = haystack.match(rule.pattern);
    if (!match) continue;
    matchedSignals.push({
      type: rule.type,
      matchedPhrase: normalizeText(match[0]),
      confidence: rule.weight,
    });
    if (rule.type === "cost-pain" || rule.type === "workflow-pain" || rule.type === "commercial-intent") {
      painScore += rule.weight;
    }
    if (rule.type === "multi-voice" || rule.type === "commercial-intent" || rule.type === "accessibility") {
      fitScore += rule.weight;
    }
    if (rule.type === "ai-openness") {
      aiOpennessScore += rule.weight;
    }
  }

  if (FICTION_FIT_RULES.some((pattern) => pattern.test(haystack))) {
    fitScore += 8;
    matchedSignals.push({
      type: "fiction-fit",
      matchedPhrase: "fiction-or-series-fit",
      confidence: 8,
    });
  }

  return {
    matchedSignals,
    painScore: clamp(painScore, 0, 35),
    fitScore: clamp(fitScore, 0, 25),
    aiOpennessScore: clamp(aiOpennessScore, 0, 20),
  };
}

export function classifyLeadType(item) {
  const haystack = normalizeText([item.title, item.excerpt, item.rawText, item.url].filter(Boolean).join(" "));

  for (const rule of BUYER_RULES) {
    if (rule.pattern.test(haystack)) {
      return {
        leadType: rule.leadType,
        buyerLikelihoodScore: rule.score,
      };
    }
  }

  return {
    leadType: "unknown",
    buyerLikelihoodScore: 8,
  };
}

export function detectRisk(item) {
  const haystack = normalizeText([item.title, item.excerpt, item.rawText].filter(Boolean).join(" "));
  const riskFlags = [];
  let riskScore = 0;

  for (const rule of RISK_RULES) {
    if (!rule.pattern.test(haystack)) continue;
    riskFlags.push(rule.flag);
    riskScore += rule.score;
  }

  return {
    riskFlags: unique(riskFlags),
    riskScore: clamp(riskScore, 0, 30),
  };
}

export function estimateReachability(item) {
  let score = 0;

  if (item.platform === "open-web") score += 10;
  if (item.platform === "reddit") score += 6;
  if (item.platform === "x") score += 5;
  if (inferWebsite(item)) score += 6;
  if (/contact|rights|submissions/i.test(normalizeText([item.title, item.excerpt, item.url].join(" ")))) {
    score += 4;
  }

  return clamp(score, 0, 20);
}

function determineStatus(totalScore) {
  if (totalScore >= 75) return "hot";
  if (totalScore >= 60) return "warm";
  if (totalScore >= 45) return "maybe";
  return "discard";
}

export function scoreSourceItem(item, { now = new Date() } = {}) {
  const signalSummary = extractLeadSignals(item);
  const buyer = classifyLeadType(item);
  const risk = detectRisk(item);
  const freshnessScore = parseDateScore(item.publishedAt, now);
  const reachabilityScore = estimateReachability(item);
  const totalScore = clamp(
    signalSummary.painScore +
      signalSummary.fitScore +
      signalSummary.aiOpennessScore +
      buyer.buyerLikelihoodScore +
      freshnessScore +
      reachabilityScore -
      risk.riskScore,
    0,
    100
  );

  return {
    leadId: `narrate-lead-${hashValue(item.itemId).slice(0, 16)}`,
    sourceItemId: item.itemId,
    personOrCompany: inferPersonOrCompany(item),
    leadType: buyer.leadType,
    website: inferWebsite(item),
    email: null,
    contactPath: null,
    socialHandle: item.authorName && item.authorName.startsWith("@") ? item.authorName : null,
    fitScore: signalSummary.fitScore,
    painScore: signalSummary.painScore,
    aiOpennessScore: signalSummary.aiOpennessScore,
    reachabilityScore,
    freshnessScore,
    buyerLikelihoodScore: buyer.buyerLikelihoodScore,
    riskScore: risk.riskScore,
    totalScore,
    status: determineStatus(totalScore),
    qualification:
      totalScore >= 75 ? "ready-to-enrich" : totalScore >= 60 ? "qualified" : totalScore >= 45 ? "review" : "skip",
    detectedSignals: signalSummary.matchedSignals,
    riskFlags: risk.riskFlags,
    evidence: {
      title: item.title,
      excerpt: item.excerpt,
      rawText: item.rawText,
      query: item.query,
      url: item.url,
      sourceType: item.sourceType,
      sourceLabel: item.sourceLabel,
      platform: item.platform,
      publishedAt: item.publishedAt,
    },
  };
}

export function scoreSourceItems(items = [], options = {}) {
  return items
    .map((item) => scoreSourceItem(item, options))
    .sort((left, right) => right.totalScore - left.totalScore)
    .filter((lead) => lead.status !== "discard");
}
