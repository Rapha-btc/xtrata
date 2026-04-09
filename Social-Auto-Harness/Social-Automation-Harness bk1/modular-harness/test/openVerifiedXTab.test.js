import assert from "node:assert/strict";
import test from "node:test";

import { openVerifiedXTab, pickMatchingXTab } from "../src/x/openVerifiedXTab.js";

class FakeBrowserAdapter {
  constructor({
    tabs = [],
    probeResults = [],
    listTabsError = null,
    activateTabErrors = [],
  } = {}) {
    this.tabs = tabs;
    this.probeResults = [...probeResults];
    this.listTabsError = listTabsError;
    this.activateTabErrors = [...activateTabErrors];
    this.calls = [];
  }

  async ensureBrowserApp() {
    this.calls.push(["ensureBrowserApp"]);
  }

  async listTabs() {
    this.calls.push(["listTabs"]);
    if (this.listTabsError) throw this.listTabsError;
    return this.tabs;
  }

  async activateTab(tab) {
    this.calls.push(["activateTab", tab]);
    const error = this.activateTabErrors.shift() ?? null;
    if (error) throw error;
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
    const tab = { windowId: 1, tabIndex: 3, url };
    this.calls.push(["openTabInFrontWindow", url]);
    return tab;
  }

  async evaluateActiveTab() {
    this.calls.push(["evaluateActiveTab"]);
    return (
      this.probeResults.shift() ??
      JSON.stringify({ loggedIn: true, handle: "@xtratalayers", url: "https://x.com/home" })
    );
  }
}

test("pickMatchingXTab prefers a matching tab in the verified window", () => {
  const tab = pickMatchingXTab(
    [
      { windowId: 2, tabIndex: 1, url: "https://x.com/search?q=btc&src=typed_query&f=live" },
      { windowId: 1, tabIndex: 2, url: "https://x.com/search?q=btc&src=typed_query&f=live" },
    ],
    (candidate) => candidate.url.includes("search?q=btc"),
    1
  );

  assert.deepEqual(tab, {
    windowId: 1,
    tabIndex: 2,
    url: "https://x.com/search?q=btc&src=typed_query&f=live",
  });
});

test("openVerifiedXTab reuses an existing matching tab in the verified persona window", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [
      { windowId: 1, tabIndex: 1, url: "https://x.com/home" },
      { windowId: 1, tabIndex: 2, url: "https://x.com/search?q=btc&src=typed_query&f=live" },
    ],
    probeResults: [JSON.stringify({ loggedIn: true, handle: "@xtratalayers", url: "https://x.com/home" })],
  });

  const result = await openVerifiedXTab({
    adapter,
    expectedHandle: "@xtratalayers",
    personaProfile: {
      persona: "xtrata",
      profileDirectory: "Profile 2",
      xHandle: "@xtratalayers",
      bootstrapUrl: "https://x.com/home",
    },
    targetUrl: "https://x.com/search?q=btc&src=typed_query&f=live",
    matchTab: (tab) => tab.url.includes("search?q=btc"),
  });

  assert.equal(result.action, "activated-existing-matching-tab");
  assert.equal(result.tab.tabIndex, 2);
  assert.deepEqual(adapter.calls.map(([name]) => name), [
    "ensureBrowserApp",
    "listTabs",
    "activateTab",
    "evaluateActiveTab",
    "listTabs",
    "activateTab",
  ]);
});

test("openVerifiedXTab opens a new tab in the front verified window when no match exists", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 1, tabIndex: 1, url: "https://x.com/home" }],
    probeResults: [JSON.stringify({ loggedIn: true, handle: "@xtratalayers", url: "https://x.com/home" })],
  });

  const result = await openVerifiedXTab({
    adapter,
    expectedHandle: "@xtratalayers",
    personaProfile: {
      persona: "xtrata",
      profileDirectory: "Profile 2",
      xHandle: "@xtratalayers",
      bootstrapUrl: "https://x.com/home",
    },
    targetUrl: "https://x.com/search?q=btc&src=typed_query&f=live",
    matchTab: (tab) => tab.url.includes("search?q=btc"),
  });

  assert.equal(result.action, "opened-new-tab");
  assert.equal(result.tab.windowId, 1);
  assert.deepEqual(adapter.calls.map(([name]) => name), [
    "ensureBrowserApp",
    "listTabs",
    "activateTab",
    "evaluateActiveTab",
    "listTabs",
    "openTabInFrontWindow",
  ]);
});
