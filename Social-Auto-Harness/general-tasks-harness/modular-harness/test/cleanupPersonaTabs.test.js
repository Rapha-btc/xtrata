import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanupPersonaTabs,
  planPersonaTabCleanup,
} from "../src/browser/cleanupPersonaTabs.js";

class FakeBrowserAdapter {
  constructor({ tabs = [], probeResults = [] } = {}) {
    this.tabs = [...tabs];
    this.probeResults = [...probeResults];
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
    return tab;
  }

  async evaluateActiveTab() {
    this.calls.push(["evaluateActiveTab"]);
    return (
      this.probeResults.shift() ??
      JSON.stringify({ loggedIn: true, handle: "@xtratalayers", url: "https://x.com/home" })
    );
  }

  async closeTab(tab) {
    this.calls.push(["closeTab", tab]);
  }
}

test("planPersonaTabCleanup keeps one X tab and one ChatGPT tab in the verified window", () => {
  const plan = planPersonaTabCleanup({
    windowId: 1,
    preferredXUrl: "https://x.com/home",
    tabs: [
      { windowId: 1, tabIndex: 1, url: "https://x.com/home" },
      { windowId: 1, tabIndex: 2, url: "https://chatgpt.com/" },
      { windowId: 1, tabIndex: 3, url: "https://x.com/search?q=btc&src=typed_query&f=live" },
      { windowId: 1, tabIndex: 4, url: "https://x.com/example/status/123" },
      { windowId: 1, tabIndex: 5, url: "https://chatgpt.com/c/abc" },
      { windowId: 1, tabIndex: 6, url: "https://example.com/" },
    ],
  });

  assert.deepEqual(
    plan.keptXTabs.map((tab) => tab.tabIndex),
    [1]
  );
  assert.deepEqual(
    plan.keptChatGPTTabs.map((tab) => tab.tabIndex),
    [2]
  );
  assert.deepEqual(
    plan.tabsToClose.map((tab) => tab.tabIndex),
    [5, 4, 3]
  );
});

test("cleanupPersonaTabs closes extra X and ChatGPT tabs in reverse tab order", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [
      { windowId: 1, tabIndex: 1, url: "https://x.com/home" },
      { windowId: 1, tabIndex: 2, url: "https://chatgpt.com/" },
      { windowId: 1, tabIndex: 3, url: "https://x.com/search?q=btc&src=typed_query&f=live" },
      { windowId: 1, tabIndex: 4, url: "https://x.com/example/status/123" },
      { windowId: 1, tabIndex: 5, url: "https://chatgpt.com/c/abc" },
      { windowId: 1, tabIndex: 6, url: "https://example.com/" },
    ],
    probeResults: [JSON.stringify({ loggedIn: true, handle: "@xtratalayers", url: "https://x.com/home" })],
  });

  const result = await cleanupPersonaTabs({
    adapter,
    personaProfile: {
      persona: "xtrata",
      profileDirectory: "Profile 2",
      xHandle: "@xtratalayers",
      bootstrapUrl: "https://x.com/home",
    },
  });

  assert.equal(result.closedTabs.length, 3);
  assert.deepEqual(
    result.closedTabs.map((tab) => tab.tabIndex),
    [5, 4, 3]
  );
  assert.deepEqual(
    adapter.calls.filter(([name]) => name === "closeTab").map(([, tab]) => tab.tabIndex),
    [5, 4, 3]
  );
});
