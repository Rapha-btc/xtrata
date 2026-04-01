import { normalizeGovernanceUrl } from "../governance/loadGovernanceState.js";
import { normalizeHandle } from "../session/xSessionSignals.js";

export const BOT_HANDLE_PATTERN = /^[A-Z][a-z]+[A-Z][a-z]+\.(?:org|net|app|io)$/;
export const NO_BIO_ALPHANUMERIC_HANDLE_PATTERN = /^(?=.*[a-z])(?=.*\d)[a-z0-9_]+$/i;

const SPAM_BIO_PATTERN =
  /airdrop|giveaway|promo|promotion|marketing|growth|dm\b|inbox|whatsapp|telegram|100x|guaranteed|earn money|click here/i;

function normalizeDateBoundary(value) {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T23:59:59.999Z`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function buildGovernanceLookups(governanceState, now) {
  const currentDate = now instanceof Date ? now : new Date(now ?? Date.now());
  const cooldownAuthors = new Map(
    (governanceState?.diversity?.cooldownAuthors ?? [])
      .filter((entry) => {
        const boundary = normalizeDateBoundary(entry.cooldownExpires);
        return !boundary || boundary.getTime() >= currentDate.getTime();
      })
      .map((entry) => [entry.normalizedAuthor, entry])
      .filter(([normalizedAuthor]) => Boolean(normalizedAuthor))
  );
  const excludedAccounts = new Map(
    (governanceState?.diversity?.excludedAccounts ?? [])
      .map((entry) => [entry.normalizedAccount, entry])
      .filter(([normalizedAccount]) => Boolean(normalizedAccount))
  );
  const postedThreads = new Map(
    (governanceState?.postedThreads?.threads ?? [])
      .map((entry) => [entry.normalizedUrl, entry])
      .filter(([normalizedUrl]) => Boolean(normalizedUrl))
  );
  const followedAccounts = new Set(governanceState?.followedAccounts?.handles ?? []);

  return {
    cooldownAuthors,
    excludedAccounts,
    postedThreads,
    followedAccounts,
  };
}

function collectAuthorStats(candidate) {
  const bioValue = candidate.authorBio ?? candidate.bio ?? null;
  const bioObserved =
    candidate.authorBioObserved ??
    candidate.bioObserved ??
    (candidate.authorBio !== undefined || candidate.bio !== undefined);

  return {
    handle: candidate.author ?? candidate.handle ?? null,
    bio: bioValue,
    bioObserved: Boolean(bioObserved),
    followers:
      Number(candidate.authorFollowers ?? candidate.followers) >= 0
        ? Number(candidate.authorFollowers ?? candidate.followers)
        : null,
    following:
      Number(candidate.authorFollowing ?? candidate.following) >= 0
        ? Number(candidate.authorFollowing ?? candidate.following)
        : null,
    postCount:
      Number(candidate.authorPostCount ?? candidate.postCount) >= 0
        ? Number(candidate.authorPostCount ?? candidate.postCount)
        : null,
  };
}

export function looksSpammyBio(bio) {
  return SPAM_BIO_PATTERN.test(bio ?? "");
}

export function evaluateBotCandidate(candidate) {
  const normalizedHandle = normalizeHandle(candidate?.handle);
  const handleForPattern = (candidate?.handle ?? "").replace(/^@/, "");
  const reasons = [];

  if (BOT_HANDLE_PATTERN.test(handleForPattern)) {
    reasons.push("bot-handle-pattern");
  }

  if (Number.isFinite(candidate?.postCount) && candidate.postCount < 10) {
    reasons.push("low-post-count");
  }

  if (looksSpammyBio(candidate?.bio)) {
    reasons.push("spam-bio");
  }

  if (
    Number.isFinite(candidate?.following) &&
    Number.isFinite(candidate?.followers) &&
    candidate.following >= 5000 &&
    candidate.followers < 50
  ) {
    reasons.push("high-following-low-follower");
  }

  const bioKnownEmpty =
    candidate?.bioObserved === true &&
    (candidate?.bio === null || candidate?.bio === undefined || !candidate?.bio.trim());

  if (bioKnownEmpty && normalizedHandle && NO_BIO_ALPHANUMERIC_HANDLE_PATTERN.test(normalizedHandle)) {
    reasons.push("no-bio-alphanumeric-handle");
  }

  return {
    blocked: reasons.length > 0,
    normalizedHandle,
    reasons,
  };
}

export function evaluateThreadCandidate({ candidate, governanceState, now } = {}) {
  const lookups = buildGovernanceLookups(governanceState, now);
  const normalizedAuthor = normalizeHandle(candidate?.author);
  const normalizedUrl = normalizeGovernanceUrl(candidate?.url);
  const botEvaluation = evaluateBotCandidate(collectAuthorStats(candidate));
  const rejectedReasons = [...botEvaluation.reasons];

  if (normalizedUrl && lookups.postedThreads.has(normalizedUrl)) {
    rejectedReasons.push("already-replied-thread");
  }

  if (normalizedAuthor && lookups.cooldownAuthors.has(normalizedAuthor)) {
    rejectedReasons.push("author-in-cooldown");
  }

  if (normalizedAuthor && lookups.excludedAccounts.has(normalizedAuthor)) {
    rejectedReasons.push("noise-exclusion");
  }

  return {
    candidate,
    allowed: rejectedReasons.length === 0,
    rejectedReasons,
    matchedCooldownEntry: normalizedAuthor ? lookups.cooldownAuthors.get(normalizedAuthor) ?? null : null,
    matchedPostedThread: normalizedUrl ? lookups.postedThreads.get(normalizedUrl) ?? null : null,
    matchedNoiseEntry: normalizedAuthor ? lookups.excludedAccounts.get(normalizedAuthor) ?? null : null,
  };
}

export function evaluateThreadCandidates({ candidates = [], governanceState, now } = {}) {
  const evaluations = candidates.map((candidate) => evaluateThreadCandidate({ candidate, governanceState, now }));
  const cooldownHits = evaluations.filter((evaluation) =>
    evaluation.rejectedReasons.includes("author-in-cooldown")
  ).length;
  const cooldownRatio = evaluations.length === 0 ? 0 : cooldownHits / evaluations.length;

  return {
    evaluations,
    acceptedCandidates: evaluations.filter((evaluation) => evaluation.allowed).map((evaluation) => evaluation.candidate),
    rejectedCandidates: evaluations
      .filter((evaluation) => !evaluation.allowed)
      .map(({ candidate, rejectedReasons }) => ({ candidate, rejectedReasons })),
    cooldownHits,
    cooldownRatio,
    diversityGateTriggered: cooldownRatio > 0.3,
    shouldChangeSearchTerms: cooldownRatio > 0.3,
  };
}

export function evaluateFollowCandidate({ candidate, governanceState, now } = {}) {
  const lookups = buildGovernanceLookups(governanceState, now);
  const normalizedHandle = normalizeHandle(candidate?.handle);
  const botEvaluation = evaluateBotCandidate(candidate);
  const rejectedReasons = [...botEvaluation.reasons];

  if (!normalizedHandle) {
    rejectedReasons.push("missing-handle");
  }

  if (normalizedHandle && lookups.followedAccounts.has(normalizedHandle)) {
    rejectedReasons.push("already-followed");
  }

  if (normalizedHandle && lookups.excludedAccounts.has(normalizedHandle)) {
    rejectedReasons.push("noise-exclusion");
  }

  return {
    candidate,
    allowed: rejectedReasons.length === 0,
    rejectedReasons,
  };
}

export function evaluateFollowCandidates({ candidates = [], governanceState, now } = {}) {
  const evaluations = candidates.map((candidate) => evaluateFollowCandidate({ candidate, governanceState, now }));

  return {
    evaluations,
    acceptedCandidates: evaluations.filter((evaluation) => evaluation.allowed).map((evaluation) => evaluation.candidate),
    rejectedCandidates: evaluations
      .filter((evaluation) => !evaluation.allowed)
      .map(({ candidate, rejectedReasons }) => ({ candidate, rejectedReasons })),
  };
}
