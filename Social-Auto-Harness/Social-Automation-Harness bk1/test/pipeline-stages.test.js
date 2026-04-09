import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { runCollect } from "../src/cli/run-collect.js";
import { runDraftStage } from "../src/lib/drafting.js";
import { getRunDir } from "../src/lib/paths.js";
import { runScoreStage } from "../src/lib/scoring.js";
import { uniqueRunId } from "../testing/helpers.js";

async function readFixture(name) {
  const fixturePath = new URL(`./fixtures/${name}`, import.meta.url);
  return JSON.parse(await fs.readFile(fixturePath, "utf8"));
}

test("runScoreStage dry-run scores fixture posts in memory", async () => {
  const posts = await readFixture("filtered-posts.json");
  const result = await runScoreStage({
    runId: uniqueRunId("score"),
    dryRun: true,
    posts,
  });

  assert.equal(result.summary.model, "heuristic-dry-run");
  assert.equal(result.summary.scored_posts, 3);
  assert.equal(result.summary.top_posts, 2);
  assert.deepEqual(result.top_posts.map((post) => post.post_id), ["demo-1", "demo-2"]);
});

test("runDraftStage dry-run drafts replies from scored fixture posts", async () => {
  const posts = await readFixture("filtered-posts.json");
  const scoreResult = await runScoreStage({
    runId: uniqueRunId("score"),
    dryRun: true,
    posts,
  });

  const draftResult = await runDraftStage({
    runId: uniqueRunId("draft"),
    dryRun: true,
    topPosts: scoreResult.top_posts,
  });

  assert.equal(draftResult.summary.model, "heuristic-dry-run");
  assert.equal(draftResult.summary.drafts_created, 2);
  assert.ok(draftResult.drafts.every((draft) => draft.reply.length <= 220));
  assert.ok(draftResult.drafts.every((draft) => /Xtrata/i.test(draft.reply)));
});

test("runCollect dry-run fails fast on malformed collection-results.json", async (t) => {
  const runId = uniqueRunId("collect-invalid");
  const runDir = getRunDir(runId);

  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, "collection-results.json"), "{", "utf8");
  t.after(async () => {
    await fs.rm(runDir, { recursive: true, force: true });
  });

  await assert.rejects(() => runCollect({ runId, dryRun: true }), SyntaxError);
});
