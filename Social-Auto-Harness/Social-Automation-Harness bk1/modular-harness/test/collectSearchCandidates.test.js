import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadGovernanceState } from "../src/governance/loadGovernanceState.js";
import {
  collectSearchCandidates,
  normalizeFollowCandidate,
  normalizeThreadCandidate,
} from "../src/x/collectSearchCandidates.js";

const fixtureDir = path.resolve("modular-harness/test/fixtures/governance");

test("normalizeThreadCandidate derives ids and canonical author handles", () => {
  const normalized = normalizeThreadCandidate({
    url: "https://x.com/FreshBuilder/status/1234567890123456789?ref=abc",
    author_handle: "FreshBuilder",
    text: "Hello world",
    posted_at: "2026-04-01T12:00:00Z",
    source: "x-search",
    searchQuery: "Stacks builders",
  });

  assert.deepEqual(normalized, {
    id: "1234567890123456789",
    url: "https://x.com/FreshBuilder/status/1234567890123456789",
    author: "@freshbuilder",
    text: "Hello world",
    postedAt: "2026-04-01T12:00:00.000Z",
    source: "x-search",
    searchQuery: "Stacks builders",
    authorBio: null,
    authorBioObserved: false,
    authorFollowers: null,
    authorFollowing: null,
    authorPostCount: null,
  });
});

test("normalizeFollowCandidate canonicalizes handles and numeric counts", () => {
  const normalized = normalizeFollowCandidate({
    username: "FreshBuilder",
    description: "Stacks builder",
    followers: "1,234",
    following: "567",
    tweetCount: "89",
  });

  assert.deepEqual(normalized, {
    handle: "@freshbuilder",
    bio: "Stacks builder",
    bioObserved: true,
    followers: 1234,
    following: 567,
    postCount: 89,
    source: null,
  });
});

test("collectSearchCandidates does not reject alphanumeric handles solely because thread bio is unknown", async () => {
  const governanceState = await loadGovernanceState({ baseDir: fixtureDir });
  const result = await collectSearchCandidates({
    governanceState,
    writeFiles: false,
    threadCandidates: [
      {
        url: "https://x.com/El_steph04/status/2039358356536561768",
        author: "@El_steph04",
        text: "Bitcoin L2 post",
      },
    ],
  });

  assert.equal(result.threadReport.accepted, 1);
  assert.deepEqual(result.threadReport.rejected, []);
});

test("collectSearchCandidates dedupes, filters, and writes candidate files", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "xtrata-candidates-"));

  try {
    const governanceState = await loadGovernanceState({ baseDir: fixtureDir });
    const result = await collectSearchCandidates({
      governanceState,
      outputDir: tempDir,
      threadCandidates: [
        {
          url: "https://x.com/example/status/1234567890",
          author: "@cooldownuser",
          text: "blocked by posted thread",
        },
        {
          url: "https://x.com/example/status/444",
          author: "@freshbuilder",
          text: "allowed",
          searchQuery: "Stacks builders",
        },
        {
          url: "https://x.com/example/status/444",
          author: "@freshbuilder",
          text: "duplicate",
        },
      ],
      followCandidates: [
        {
          handle: "@alreadyfollowed",
          bio: "builder",
          followers: 100,
          following: 50,
          postCount: 10,
        },
        {
          handle: "@freshbuilder",
          bio: "Stacks builder",
          followers: 150,
          following: 75,
          postCount: 20,
        },
      ],
    });

    const writtenThreads = JSON.parse(await readFile(path.join(tempDir, "thread-candidates.json"), "utf8"));
    const writtenFollows = JSON.parse(await readFile(path.join(tempDir, "follow-candidates.json"), "utf8"));

    assert.equal(result.threadReport.totalRaw, 3);
    assert.equal(result.threadReport.normalized, 2);
    assert.equal(result.threadReport.written, 1);
    assert.equal(result.followReport.written, 1);
    assert.equal(writtenThreads.length, 1);
    assert.equal(writtenThreads[0].author, "@freshbuilder");
    assert.equal(writtenThreads[0].searchQuery, "Stacks builders");
    assert.equal(writtenFollows.length, 1);
    assert.equal(writtenFollows[0].handle, "@freshbuilder");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
