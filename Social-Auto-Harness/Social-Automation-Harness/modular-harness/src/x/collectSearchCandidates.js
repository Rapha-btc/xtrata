import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { evaluateFollowCandidates, evaluateThreadCandidates } from "../policy/sharedRulesEngine.js";
import { normalizeGovernanceUrl } from "../governance/loadGovernanceState.js";
import { normalizeHandle } from "../session/xSessionSignals.js";

function coerceCount(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeTimestamp(value) {
  if (!value?.toString().trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.toString().trim();
  }

  return parsed.toISOString();
}

function toAtHandle(value) {
  const normalized = normalizeHandle(value);
  return normalized ? `@${normalized}` : null;
}

function extractStatusId(url) {
  const match = url?.match(/\/status\/(\d+)/i);
  return match?.[1] ?? null;
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizeThreadText(raw) {
  return (
    raw?.text ??
    raw?.content ??
    raw?.body ??
    raw?.postText ??
    raw?.tweetText ??
    ""
  )
    .toString()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeThreadCandidate(rawCandidate) {
  if (!rawCandidate || typeof rawCandidate !== "object") return null;

  const url = normalizeGovernanceUrl(
    rawCandidate.url ?? rawCandidate.threadUrl ?? rawCandidate.tweetUrl ?? rawCandidate.link
  );
  const author = toAtHandle(
    rawCandidate.author ?? rawCandidate.authorHandle ?? rawCandidate.author_handle ?? rawCandidate.handle
  );

  if (!url || !author) {
    return null;
  }

  return {
    id: rawCandidate.id?.toString().trim() || extractStatusId(url),
    url,
    author,
    text: normalizeThreadText(rawCandidate) || null,
    postedAt: normalizeTimestamp(
      rawCandidate.postedAt ??
        rawCandidate.posted_at ??
        rawCandidate.timestamp ??
        rawCandidate.createdAt
    ),
    source: rawCandidate.source?.toString().trim() || null,
    searchQuery: rawCandidate.searchQuery?.toString().trim() || null,
    authorBio: rawCandidate.authorBio ?? rawCandidate.bio ?? null,
    authorBioObserved:
      rawCandidate.authorBioObserved ??
      rawCandidate.bioObserved ??
      (rawCandidate.authorBio !== undefined || rawCandidate.bio !== undefined),
    authorFollowers: coerceCount(rawCandidate.authorFollowers ?? rawCandidate.followers),
    authorFollowing: coerceCount(rawCandidate.authorFollowing ?? rawCandidate.following),
    authorPostCount: coerceCount(rawCandidate.authorPostCount ?? rawCandidate.postCount ?? rawCandidate.post_count),
  };
}

export function normalizeFollowCandidate(rawCandidate) {
  if (!rawCandidate || typeof rawCandidate !== "object") return null;

  const handle = toAtHandle(rawCandidate.handle ?? rawCandidate.author ?? rawCandidate.username);
  if (!handle) {
    return null;
  }

  return {
    handle,
    bio:
      rawCandidate.bio === undefined && rawCandidate.description === undefined
        ? null
        : (rawCandidate.bio ?? rawCandidate.description ?? "")
            .toString()
            .replace(/\s+/g, " ")
            .trim(),
    bioObserved:
      rawCandidate.bioObserved ??
      (rawCandidate.bio !== undefined || rawCandidate.description !== undefined),
    followers: coerceCount(rawCandidate.followers ?? rawCandidate.followerCount),
    following: coerceCount(rawCandidate.following ?? rawCandidate.followingCount),
    postCount: coerceCount(rawCandidate.postCount ?? rawCandidate.post_count ?? rawCandidate.tweetCount),
    source: rawCandidate.source?.toString().trim() || null,
  };
}

async function writeJsonFile(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function collectSearchCandidates({
  threadCandidates = [],
  followCandidates = [],
  governanceState = null,
  outputDir = process.cwd(),
  threadLimit = 20,
  followLimit = 40,
  writeFiles = true,
} = {}) {
  const normalizedThreadCandidates = uniqueBy(
    threadCandidates.map(normalizeThreadCandidate).filter(Boolean),
    (candidate) => candidate.url ?? candidate.id
  );
  const normalizedFollowCandidates = uniqueBy(
    followCandidates.map(normalizeFollowCandidate).filter(Boolean),
    (candidate) => normalizeHandle(candidate.handle)
  );

  const threadEvaluation = governanceState
    ? evaluateThreadCandidates({ candidates: normalizedThreadCandidates, governanceState })
    : {
        evaluations: [],
        acceptedCandidates: normalizedThreadCandidates,
        rejectedCandidates: [],
        cooldownHits: 0,
        cooldownRatio: 0,
        diversityGateTriggered: false,
        shouldChangeSearchTerms: false,
      };
  const followEvaluation = governanceState
    ? evaluateFollowCandidates({ candidates: normalizedFollowCandidates, governanceState })
    : {
        evaluations: [],
        acceptedCandidates: normalizedFollowCandidates,
        rejectedCandidates: [],
      };

  const selectedThreadCandidates = threadEvaluation.acceptedCandidates.slice(0, threadLimit);
  const selectedFollowCandidates = followEvaluation.acceptedCandidates.slice(0, followLimit);
  const threadOutputPath = path.join(outputDir, "thread-candidates.json");
  const followOutputPath = path.join(outputDir, "follow-candidates.json");

  if (writeFiles) {
    await mkdir(outputDir, { recursive: true });
    await writeJsonFile(threadOutputPath, selectedThreadCandidates);
    await writeJsonFile(followOutputPath, selectedFollowCandidates);
  }

  return {
    threadCandidates: selectedThreadCandidates,
    followCandidates: selectedFollowCandidates,
    threadReport: {
      totalRaw: threadCandidates.length,
      normalized: normalizedThreadCandidates.length,
      accepted: threadEvaluation.acceptedCandidates.length,
      written: selectedThreadCandidates.length,
      rejected: threadEvaluation.rejectedCandidates,
      cooldownRatio: threadEvaluation.cooldownRatio,
      diversityGateTriggered: threadEvaluation.diversityGateTriggered,
      shouldChangeSearchTerms: threadEvaluation.shouldChangeSearchTerms,
    },
    followReport: {
      totalRaw: followCandidates.length,
      normalized: normalizedFollowCandidates.length,
      accepted: followEvaluation.acceptedCandidates.length,
      written: selectedFollowCandidates.length,
      rejected: followEvaluation.rejectedCandidates,
    },
    files: writeFiles
      ? {
          threadCandidates: threadOutputPath,
          followCandidates: followOutputPath,
        }
      : null,
  };
}
