import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFillReplyComposerScript,
  buildOpenReplyComposerScript,
  buildXReplyComposerProbeScript,
  buildXStatusUrl,
  extractStatusIdFromUrl,
  fillReplyComposer,
  matchesXStatusTab,
  openReplyComposer,
  parseXReplyComposerActionResult,
  parseXReplyComposerProbeResult,
  prepareReplyComposer,
} from "../src/x/replyComposer.js";

function classifyScript(script) {
  if (script.includes("__xReplyComposerProbe")) return "composer-probe";
  if (script.includes("__xReplyComposerOpen")) return "composer-open";
  if (script.includes("__xReplyComposerFill")) return "composer-fill";
  if (script.includes("SideNav_AccountSwitcher_Button")) return "session-probe";
  return "unknown";
}

class FakeBrowserAdapter {
  constructor({ tabs = [], evaluationResults = [] } = {}) {
    this.tabs = tabs;
    this.evaluationResults = [...evaluationResults];
    this.calls = [];
  }

  async ensureBrowserApp() {
    this.calls.push(["ensureBrowserApp"]);
  }

  async listTabs() {
    this.calls.push(["listTabs"]);
    return this.tabs;
  }

  async activateTab(tab) {
    this.calls.push(["activateTab", tab]);
  }

  async openTab(url) {
    const tab = { windowId: null, tabIndex: null, url };
    this.calls.push(["openTab", url]);
    return tab;
  }

  async openProfileWindow({ profileDirectory, url }) {
    const tab = { windowId: 99, tabIndex: 1, url, profileDirectory };
    this.calls.push(["openProfileWindow", { profileDirectory, url }]);
    return tab;
  }

  async openTabInFrontWindow(url) {
    const tab = { windowId: 1, tabIndex: 2, url };
    this.calls.push(["openTabInFrontWindow", url]);
    return tab;
  }

  async evaluateActiveTab(script) {
    this.calls.push(["evaluateActiveTab", classifyScript(script)]);
    return this.evaluationResults.shift();
  }

  async wait(ms) {
    this.calls.push(["wait", ms]);
  }
}

test("extractStatusIdFromUrl and buildXStatusUrl normalize status URLs", () => {
  assert.equal(
    extractStatusIdFromUrl("https://x.com/example/status/1234567890?s=20"),
    "1234567890"
  );
  assert.equal(
    buildXStatusUrl("https://x.com/example/status/1234567890?s=20"),
    "https://x.com/example/status/1234567890"
  );
});

test("matchesXStatusTab matches tabs by status id", () => {
  const matcher = matchesXStatusTab("https://x.com/example/status/1234567890?s=20");
  assert.equal(matcher({ url: "https://x.com/other/status/1234567890" }), true);
  assert.equal(matcher({ url: "https://x.com/other/status/999" }), false);
});

test("probe and action parsers accept JSON text and default empty states", () => {
  assert.deepEqual(parseXReplyComposerProbeResult('{"composerFound":true,"composerText":"hi"}'), {
    composerFound: true,
    composerText: "hi",
  });
  assert.equal(parseXReplyComposerActionResult("").ok, false);
});

test("script builders embed expected markers", () => {
  assert.match(buildXReplyComposerProbeScript(), /__xReplyComposerProbe/);
  assert.match(buildOpenReplyComposerScript(), /__xReplyComposerOpen/);
  assert.match(buildFillReplyComposerScript("hello"), /__xReplyComposerFill/);
});

test("openReplyComposer reuses the matching status tab and opens the composer", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [
      { windowId: 1, tabIndex: 1, url: "https://x.com/home" },
      { windowId: 1, tabIndex: 2, url: "https://x.com/godfred_xcuz/status/2039385012219367739" },
    ],
    evaluationResults: [
      JSON.stringify({ loggedIn: true, handle: "@xtratalayers", url: "https://x.com/home" }),
      JSON.stringify({ composerFound: false, composerText: null, canSubmit: false, sendButtonFound: false }),
      JSON.stringify({ ok: true, action: "clicked-reply", composerFound: false, composerText: null, retryable: true }),
      JSON.stringify({ composerFound: true, composerText: null, canSubmit: false, sendButtonFound: true }),
    ],
  });

  const result = await openReplyComposer({
    adapter,
    tweetUrl: "https://x.com/godfred_xcuz/status/2039385012219367739",
    expectedHandle: "@xtratalayers",
    personaProfile: {
      persona: "xtrata",
      profileDirectory: "Profile 2",
      xHandle: "@xtratalayers",
      bootstrapUrl: "https://x.com/home",
    },
    waitMs: 10,
  });

  assert.equal(result.navigation.action, "activated-existing-matching-tab");
  assert.equal(result.state.composerFound, true);
  assert.deepEqual(adapter.calls.map(([name, detail]) => [name, detail]), [
    ["ensureBrowserApp", undefined],
    ["listTabs", undefined],
    ["activateTab", { windowId: 1, tabIndex: 1, url: "https://x.com/home" }],
    ["evaluateActiveTab", "session-probe"],
    ["listTabs", undefined],
    ["activateTab", { windowId: 1, tabIndex: 2, url: "https://x.com/godfred_xcuz/status/2039385012219367739" }],
    ["evaluateActiveTab", "composer-probe"],
    ["evaluateActiveTab", "composer-open"],
    ["wait", 10],
    ["evaluateActiveTab", "composer-probe"],
  ]);
});

test("fillReplyComposer fills the active composer and returns the filled state", async () => {
  const adapter = new FakeBrowserAdapter({
    evaluationResults: [
      JSON.stringify({
        ok: true,
        composerFound: true,
        composerText: "The Bitcoin L2 thesis is interesting.",
        characterCount: 35,
        sendButtonFound: true,
        canSubmit: true,
      }),
    ],
  });

  const result = await fillReplyComposer({
    adapter,
    replyText: "The Bitcoin L2 thesis is interesting.",
  });

  assert.equal(result.state.composerFound, true);
  assert.equal(result.state.canSubmit, true);
  assert.equal(result.textMatches, true);
  assert.deepEqual(adapter.calls.map(([name, detail]) => [name, detail]), [
    ["evaluateActiveTab", "composer-fill"],
  ]);
});

test("fillReplyComposer normalizes accidental line breaks before comparing composer text", async () => {
  const adapter = new FakeBrowserAdapter({
    evaluationResults: [
      JSON.stringify({
        ok: true,
        composerFound: true,
        composerText: "That builder gravity is real.",
        characterCount: 29,
        sendButtonFound: true,
        canSubmit: true,
      }),
    ],
  });

  const result = await fillReplyComposer({
    adapter,
    replyText: "That\n builder gravity is real.",
  });

  assert.equal(result.replyText, "That builder gravity is real.");
  assert.equal(result.state.composerText, "That builder gravity is real.");
  assert.equal(result.textMatches, true);
});

test("prepareReplyComposer opens, fills, and reads back the composer state without posting", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [
      { windowId: 1, tabIndex: 1, url: "https://x.com/home" },
      { windowId: 1, tabIndex: 2, url: "https://x.com/godfred_xcuz/status/2039385012219367739" },
    ],
    evaluationResults: [
      JSON.stringify({ loggedIn: true, handle: "@xtratalayers", url: "https://x.com/home" }),
      JSON.stringify({ composerFound: false, composerText: null, canSubmit: false, sendButtonFound: false }),
      JSON.stringify({ ok: true, action: "clicked-reply", composerFound: true, composerText: null, retryable: true, sendButtonFound: true, canSubmit: false }),
      JSON.stringify({
        ok: true,
        composerFound: true,
        composerText: "Interesting point. Permanent app data matters more once Bitcoin L2 builders start composing on shared state.",
        characterCount: 102,
        sendButtonFound: true,
        canSubmit: true,
      }),
      JSON.stringify({
        composerFound: true,
        composerText: "Interesting point. Permanent app data matters more once Bitcoin L2 builders start composing on shared state.",
        characterCount: 102,
        sendButtonFound: true,
        canSubmit: true,
      }),
    ],
  });

  const result = await prepareReplyComposer({
    adapter,
    tweetUrl: "https://x.com/godfred_xcuz/status/2039385012219367739",
    replyText:
      "Interesting point.\n Permanent app data matters more once Bitcoin L2 builders start composing on shared state.",
    expectedHandle: "@xtratalayers",
    personaProfile: {
      persona: "xtrata",
      profileDirectory: "Profile 2",
      xHandle: "@xtratalayers",
      bootstrapUrl: "https://x.com/home",
    },
  });

  assert.equal(result.state.composerFound, true);
  assert.equal(result.state.canSubmit, true);
  assert.equal(result.textMatches, true);
  assert.match(result.state.composerText, /Permanent app data matters more/);
  assert.doesNotMatch(result.state.composerText, /\n/);
});
