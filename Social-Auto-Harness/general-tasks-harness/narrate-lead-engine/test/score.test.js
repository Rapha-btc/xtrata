import assert from "node:assert/strict";
import test from "node:test";

import { scoreSourceItem } from "../src/score.js";

test("scoreSourceItem prioritizes pain, fit, and buyer signals", () => {
  const lead = scoreSourceItem({
    itemId: "src-1",
    sourceType: "google-search",
    sourceLabel: "Open web",
    query: "\"cost of producing an audiobook\"",
    platform: "open-web",
    url: "https://examplepress.com/blog/backlist-audiobook-rollout",
    title: "Small press exploring backlist audiobook rollout",
    excerpt: "We need a cheaper audiobook production path for dialogue-heavy fiction.",
    rawText: "Small press exploring cheaper audiobook production and multiple voices for fiction.",
    publishedAt: "2026-04-05T12:00:00.000Z",
  }, { now: new Date("2026-04-12T00:00:00.000Z") });

  assert.equal(lead.leadType, "publisher");
  assert.ok(lead.totalScore >= 75);
  assert.equal(lead.status, "hot");
});

test("scoreSourceItem penalizes anti-ai signals", () => {
  const lead = scoreSourceItem({
    itemId: "src-2",
    sourceType: "google-search",
    sourceLabel: "Open web",
    query: "\"AI narration\" author",
    platform: "open-web",
    url: "https://example.com/opinion",
    title: "Why I will never use AI voices",
    excerpt: "AI is theft and I hate AI narration.",
    rawText: "I hate AI narration and will never use AI voices.",
    publishedAt: "2026-04-05T12:00:00.000Z",
  }, { now: new Date("2026-04-12T00:00:00.000Z") });

  assert.ok(lead.riskScore >= 18);
  assert.ok(lead.totalScore < 60);
});
