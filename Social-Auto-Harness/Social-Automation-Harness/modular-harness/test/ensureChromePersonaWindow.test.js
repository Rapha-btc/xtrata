import assert from "node:assert/strict";
import test from "node:test";

import { ensureChromePersonaWindow } from "../src/browser/ensureChromePersonaWindow.js";

class FakeBrowserAdapter {
  constructor({
    tabs = [],
    probeResults = [],
    listTabsError = null,
    activateTabErrors = [],
    activeTab = null,
  } = {}) {
    this.tabs = tabs;
    this.probeResults = [...probeResults];
    this.listTabsError = listTabsError;
    this.activateTabErrors = [...activateTabErrors];
    this.activeTab = activeTab;
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

  async openProfileWindow({ profileDirectory, url }) {
    const tab = { windowId: null, tabIndex: null, url, profileDirectory };
    this.calls.push(["openProfileWindow", { profileDirectory, url }]);
    return tab;
  }

  async getActiveTab() {
    this.calls.push(["getActiveTab"]);
    return this.activeTab;
  }

  async evaluateActiveTab() {
    this.calls.push(["evaluateActiveTab"]);
    return (
      this.probeResults.shift() ??
      JSON.stringify({ loggedIn: false, handle: null, url: "https://x.com/home" })
    );
  }

  async wait(ms) {
    this.calls.push(["wait", ms]);
  }
}

test("ensureChromePersonaWindow reuses an existing verified X window for the persona", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [
      { windowId: 1, tabIndex: 1, url: "https://x.com/home" },
      { windowId: 2, tabIndex: 1, url: "https://chatgpt.com/" },
    ],
    activeTab: { windowId: 1, tabIndex: 1, url: "https://x.com/home" },
    probeResults: [
      JSON.stringify({
        loggedIn: true,
        handle: "@xtratalayers",
        url: "https://x.com/home",
      }),
    ],
  });

  const result = await ensureChromePersonaWindow({
    adapter,
    persona: "xtrata",
    profileDirectory: "Profile 3",
    expectedXHandle: "@xtratalayers",
    maxChecks: 1,
  });

  assert.equal(result.action, "activated-existing-window");
  assert.equal(result.actualXHandle, "xtratalayers");
  assert.equal(result.windowId, 1);
  assert.deepEqual(adapter.calls.map(([name]) => name), [
    "ensureBrowserApp",
    "listTabs",
    "activateTab",
    "evaluateActiveTab",
    "getActiveTab",
  ]);
});

test("ensureChromePersonaWindow skips stale tab refs and opens a new profile window when needed", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 1, tabIndex: 1, url: "https://x.com/home" }],
    activateTabErrors: [new Error("Chrome tab not found")],
    probeResults: [
      JSON.stringify({
        loggedIn: true,
        handle: "@xtratalayers",
        url: "https://x.com/home",
      }),
    ],
  });

  const result = await ensureChromePersonaWindow({
    adapter,
    persona: "xtrata",
    profileDirectory: "Profile 3",
    expectedXHandle: "@xtratalayers",
    maxChecks: 1,
  });

  assert.equal(result.action, "opened-profile-window");
  assert.deepEqual(adapter.calls.map(([name]) => name), [
    "ensureBrowserApp",
    "listTabs",
    "activateTab",
    "openProfileWindow",
    "evaluateActiveTab",
  ]);
});

test("ensureChromePersonaWindow opens a new profile window when existing X tabs belong to a different user", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 1, tabIndex: 1, url: "https://x.com/home" }],
    probeResults: [
      JSON.stringify({
        loggedIn: true,
        handle: "@wronguser",
        url: "https://x.com/home",
      }),
      JSON.stringify({
        loggedIn: true,
        handle: "@xtratalayers",
        url: "https://x.com/home",
      }),
    ],
  });

  const result = await ensureChromePersonaWindow({
    adapter,
    persona: "xtrata",
    profileDirectory: "Profile 3",
    expectedXHandle: "@xtratalayers",
    maxChecks: 1,
  });

  assert.equal(result.action, "opened-profile-window");
  assert.equal(result.actualXHandle, "xtratalayers");
  assert.deepEqual(adapter.calls.map(([name]) => name), [
    "ensureBrowserApp",
    "listTabs",
    "activateTab",
    "evaluateActiveTab",
    "openProfileWindow",
    "evaluateActiveTab",
  ]);
});

test("ensureChromePersonaWindow throws when the opened profile window still does not verify", async () => {
  const adapter = new FakeBrowserAdapter({
    probeResults: [
      JSON.stringify({
        loggedIn: false,
        handle: null,
        url: "https://x.com/home",
      }),
    ],
  });

  await assert.rejects(
    () =>
      ensureChromePersonaWindow({
        adapter,
        persona: "xtrata",
        profileDirectory: "Profile 3",
        expectedXHandle: "@xtratalayers",
        maxChecks: 1,
      }),
    /Chrome persona "xtrata" could not be verified\./
  );
});
