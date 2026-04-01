import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureXSession,
  normalizeHandle,
  parseProbeResult,
  pickXTab,
} from "../src/session/ensureXSession.js";

class FakeBrowserAdapter {
  constructor({ tabs = [], probeResults = [], listTabsError = null, activateTabError = null } = {}) {
    this.tabs = tabs;
    this.probeResults = [...probeResults];
    this.listTabsError = listTabsError;
    this.activateTabError = activateTabError;
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
    if (this.activateTabError) throw this.activateTabError;
  }

  async openTab(url) {
    const tab = { windowId: 1, tabIndex: 1, url };
    this.calls.push(["openTab", url]);
    this.tabs.push(tab);
    return tab;
  }

  async evaluateActiveTab() {
    this.calls.push(["evaluateActiveTab"]);
    return this.probeResults.shift() ?? JSON.stringify({ loggedIn: false, handle: null, texts: [] });
  }

  async wait(ms) {
    this.calls.push(["wait", ms]);
  }
}

test("normalizeHandle strips @ and lowercases the handle", () => {
  assert.equal(normalizeHandle("@XtrataLayers"), "xtratalayers");
  assert.equal(normalizeHandle("  NOXtoshi "), "noxtoshi");
});

test("parseProbeResult accepts either JSON text or a raw object", () => {
  assert.deepEqual(parseProbeResult("{\"loggedIn\":true,\"handle\":\"@user\"}"), {
    loggedIn: true,
    handle: "@user",
  });

  assert.deepEqual(parseProbeResult({ loggedIn: false, handle: null }), {
    loggedIn: false,
    handle: null,
  });
});

test("pickXTab selects the first x.com tab", () => {
  const tab = pickXTab([
    { windowId: 1, tabIndex: 1, url: "https://example.com" },
    { windowId: 2, tabIndex: 3, url: "https://x.com/home" },
    { windowId: 3, tabIndex: 1, url: "https://x.com/messages" },
  ]);

  assert.deepEqual(tab, { windowId: 2, tabIndex: 3, url: "https://x.com/home" });
});

test("ensureXSession activates an existing x.com tab and confirms the expected handle", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 2, tabIndex: 3, url: "https://x.com/home" }],
    probeResults: [
      JSON.stringify({
        loggedIn: true,
        handle: "@XtrataLayers",
        url: "https://x.com/home",
      }),
    ],
  });

  const result = await ensureXSession({
    adapter,
    expectedHandle: "@xtratalayers",
  });

  assert.equal(result.action, "activated-existing-tab");
  assert.equal(result.actualHandle, "xtratalayers");
  assert.deepEqual(adapter.calls.map(([name]) => name), [
    "ensureBrowserApp",
    "listTabs",
    "activateTab",
    "evaluateActiveTab",
  ]);
});

test("ensureXSession opens a new x.com tab when none exists", async () => {
  const adapter = new FakeBrowserAdapter({
    probeResults: [
      JSON.stringify({
        loggedIn: true,
        handle: "@XtrataLayers",
        url: "https://x.com/home",
      }),
    ],
  });

  const result = await ensureXSession({
    adapter,
    expectedHandle: "XtrataLayers",
  });

  assert.equal(result.action, "opened-new-tab");
  assert.equal(result.tab.url, "https://x.com/home");
  assert.deepEqual(adapter.calls.map(([name]) => name), [
    "ensureBrowserApp",
    "listTabs",
    "openTab",
    "evaluateActiveTab",
  ]);
});

test("ensureXSession falls back to opening a new tab when tab scanning fails", async () => {
  const adapter = new FakeBrowserAdapter({
    listTabsError: new Error("Chrome tab scan failed"),
    probeResults: [
      JSON.stringify({
        loggedIn: true,
        handle: "@XtrataLayers",
        url: "https://x.com/home",
      }),
    ],
  });

  const result = await ensureXSession({
    adapter,
    expectedHandle: "@xtratalayers",
  });

  assert.equal(result.action, "opened-new-tab");
  assert.deepEqual(adapter.calls.map(([name]) => name), [
    "ensureBrowserApp",
    "listTabs",
    "openTab",
    "evaluateActiveTab",
  ]);
});

test("ensureXSession falls back to opening a new tab when activating a stale tab fails", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 2, tabIndex: 3, url: "https://x.com/home" }],
    activateTabError: new Error("Chrome tab not found"),
    probeResults: [
      JSON.stringify({
        loggedIn: true,
        handle: "@XtrataLayers",
        url: "https://x.com/home",
      }),
    ],
  });

  const result = await ensureXSession({
    adapter,
    expectedHandle: "@xtratalayers",
  });

  assert.equal(result.action, "opened-new-tab");
  assert.equal(result.tab.url, "https://x.com/home");
  assert.deepEqual(adapter.calls.map(([name]) => name), [
    "ensureBrowserApp",
    "listTabs",
    "activateTab",
    "openTab",
    "evaluateActiveTab",
  ]);
});

test("ensureXSession retries while the page loads and then succeeds", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 1, tabIndex: 1, url: "https://x.com/home" }],
    probeResults: [
      JSON.stringify({ loggedIn: false, handle: null, url: "https://x.com/home" }),
      JSON.stringify({ loggedIn: true, handle: "@XtrataLayers", url: "https://x.com/home" }),
    ],
  });

  const result = await ensureXSession({
    adapter,
    expectedHandle: "@xtratalayers",
    maxChecks: 2,
    waitMs: 10,
  });

  assert.equal(result.actualHandle, "xtratalayers");
  assert.deepEqual(adapter.calls.map(([name]) => name), [
    "ensureBrowserApp",
    "listTabs",
    "activateTab",
    "evaluateActiveTab",
    "wait",
    "evaluateActiveTab",
  ]);
});

test("ensureXSession throws when the logged-in handle does not match", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 1, tabIndex: 1, url: "https://x.com/home" }],
    probeResults: [
      JSON.stringify({ loggedIn: true, handle: "@wronguser", url: "https://x.com/home" }),
    ],
  });

  await assert.rejects(
    () => ensureXSession({ adapter, expectedHandle: "@xtratalayers", maxChecks: 1 }),
    /Expected X handle @xtratalayers, but found @wronguser\./
  );
});
