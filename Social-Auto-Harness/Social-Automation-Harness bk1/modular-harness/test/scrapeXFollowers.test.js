import assert from "node:assert/strict";
import test from "node:test";

import {
  buildXFollowersProbeScript,
  buildXFollowersUrl,
  matchesXFollowersTab,
  parseXFollowersProbeResult,
  scrapeXFollowers,
} from "../src/x/scrapeXFollowers.js";

function classifyScript(script) {
  if (script.includes("loggedIn")) return "session-probe";
  if (script.includes("followerCount")) return "followers-probe";
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

  async openProfileWindow({ profileDirectory, url }) {
    const tab = { windowId: 99, tabIndex: 1, url, profileDirectory };
    this.calls.push(["openProfileWindow", { profileDirectory, url }]);
    this.tabs.push(tab);
    return tab;
  }

  async openTabInFrontWindow(url) {
    const tab = { windowId: 1, tabIndex: 2, url };
    this.calls.push(["openTabInFrontWindow", url]);
    this.tabs.push(tab);
    return tab;
  }

  async openTab(url) {
    const tab = { windowId: null, tabIndex: null, url };
    this.calls.push(["openTab", url]);
    this.tabs.push(tab);
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

test("buildXFollowersUrl canonicalizes the source handle", () => {
  assert.equal(buildXFollowersUrl("@NOXtoshi"), "https://x.com/noxtoshi/followers");
});

test("matchesXFollowersTab matches a followers tab for the requested source handle", () => {
  const matcher = matchesXFollowersTab("@NOXtoshi");
  assert.equal(matcher({ url: "https://x.com/noxtoshi/followers" }), true);
  assert.equal(matcher({ url: "https://x.com/prrfbeauty/followers" }), false);
});

test("buildXFollowersProbeScript embeds the requested follower cap", () => {
  const script = buildXFollowersProbeScript(25);
  assert.match(script, /const maxResults = 25;/);
  assert.match(script, /followerCount/);
});

test("parseXFollowersProbeResult accepts JSON text or raw objects", () => {
  assert.deepEqual(parseXFollowersProbeResult('{"followerCount":1,"users":[{"handle":"@x"}]}'), {
    followerCount: 1,
    users: [{ handle: "@x" }],
  });
  assert.deepEqual(parseXFollowersProbeResult({ followerCount: 0, users: [] }), {
    followerCount: 0,
    users: [],
  });
  assert.deepEqual(parseXFollowersProbeResult(""), {
    url: null,
    title: "",
    sourceHandle: null,
    followerCount: 0,
    candidateCellCount: 0,
    profileAnchorCount: 0,
    sampledProfileLinks: [],
    emptyStateText: null,
    loading: false,
    users: [],
  });
});

test("scrapeXFollowers opens a followers tab in the verified window and returns scraped user cells", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 1, tabIndex: 1, url: "https://x.com/home" }],
    evaluationResults: [
      JSON.stringify({ loggedIn: true, handle: "@xtratalayers", url: "https://x.com/home" }),
      JSON.stringify({ followerCount: 0, loading: true, candidateCellCount: 0, profileAnchorCount: 0, users: [] }),
      JSON.stringify({
        followerCount: 2,
        loading: false,
        candidateCellCount: 2,
        profileAnchorCount: 2,
        sampledProfileLinks: ["https://x.com/freshbuilder", "https://x.com/artfriend"],
        users: [
          { handle: "@freshbuilder", bio: "Stacks builder", bioObserved: true, profileUrl: "https://x.com/freshbuilder" },
          { handle: "@artfriend", bio: "On-chain artist", bioObserved: true, profileUrl: "https://x.com/artfriend" },
        ],
      }),
    ],
  });

  const result = await scrapeXFollowers({
    adapter,
    sourceHandle: "@NOXtoshi",
    expectedHandle: "@xtratalayers",
    personaProfile: {
      persona: "xtrata",
      profileDirectory: "Profile 2",
      xHandle: "@xtratalayers",
      bootstrapUrl: "https://x.com/home",
    },
    waitMs: 10,
  });

  assert.equal(result.navigation.action, "opened-new-tab");
  assert.equal(result.sourceHandle, "@noxtoshi");
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(adapter.calls.map(([name, detail]) => [name, detail]), [
    ["ensureBrowserApp", undefined],
    ["listTabs", undefined],
    ["activateTab", { windowId: 1, tabIndex: 1, url: "https://x.com/home" }],
    ["evaluateActiveTab", "session-probe"],
    ["listTabs", undefined],
    ["openTabInFrontWindow", "https://x.com/noxtoshi/followers"],
    ["evaluateActiveTab", "followers-probe"],
    ["wait", 10],
    ["evaluateActiveTab", "followers-probe"],
  ]);
});

test("scrapeXFollowers reuses an existing followers tab for the requested source", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [
      { windowId: 1, tabIndex: 1, url: "https://x.com/home" },
      { windowId: 1, tabIndex: 2, url: "https://x.com/noxtoshi/followers" },
    ],
    evaluationResults: [
      JSON.stringify({ loggedIn: true, handle: "@xtratalayers", url: "https://x.com/home" }),
      JSON.stringify({
        followerCount: 1,
        loading: false,
        candidateCellCount: 1,
        profileAnchorCount: 1,
        sampledProfileLinks: ["https://x.com/freshbuilder"],
        users: [{ handle: "@freshbuilder", bio: "Stacks builder", bioObserved: true, profileUrl: "https://x.com/freshbuilder" }],
      }),
    ],
  });

  const result = await scrapeXFollowers({
    adapter,
    sourceHandle: "@NOXtoshi",
    expectedHandle: "@xtratalayers",
    personaProfile: {
      persona: "xtrata",
      profileDirectory: "Profile 2",
      xHandle: "@xtratalayers",
      bootstrapUrl: "https://x.com/home",
    },
  });

  assert.equal(result.navigation.action, "activated-existing-matching-tab");
  assert.equal(result.candidates.length, 1);
});

test("scrapeXFollowers returns an explicit empty state without waiting for all retries", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 1, tabIndex: 1, url: "https://x.com/home" }],
    evaluationResults: [
      JSON.stringify({ loggedIn: true, handle: "@xtratalayers", url: "https://x.com/home" }),
      JSON.stringify({
        followerCount: 0,
        loading: false,
        candidateCellCount: 0,
        profileAnchorCount: 0,
        sampledProfileLinks: [],
        emptyStateText: "Nothing to see here",
        users: [],
      }),
    ],
  });

  const result = await scrapeXFollowers({
    adapter,
    sourceHandle: "@NOXtoshi",
    expectedHandle: "@xtratalayers",
    personaProfile: {
      persona: "xtrata",
      profileDirectory: "Profile 2",
      xHandle: "@xtratalayers",
      bootstrapUrl: "https://x.com/home",
    },
  });

  assert.equal(result.candidates.length, 0);
  assert.equal(result.state.emptyStateText, "Nothing to see here");
});
