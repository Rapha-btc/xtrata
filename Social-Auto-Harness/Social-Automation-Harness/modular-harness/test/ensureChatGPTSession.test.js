import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureChatGPTSession,
  normalizeAccountHint,
  parseProbeResult,
  pickChatGPTTab,
} from "../src/session/ensureChatGPTSession.js";

class FakeBrowserAdapter {
  constructor({
    tabs = [],
    probeResults = [],
    listTabsError = null,
    activateTabError = null,
    activeTab = null,
  } = {}) {
    this.tabs = tabs;
    this.probeResults = [...probeResults];
    this.listTabsError = listTabsError;
    this.activateTabError = activateTabError;
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
    if (this.activateTabError) throw this.activateTabError;
  }

  async openTab(url) {
    const tab = { windowId: 1, tabIndex: 1, url };
    this.calls.push(["openTab", url]);
    this.tabs.push(tab);
    return tab;
  }

  async openTabInWindow({ windowId, url }) {
    const tab = { windowId, tabIndex: 2, url };
    this.calls.push(["openTabInWindow", { windowId, url }]);
    this.tabs.push(tab);
    return tab;
  }

  async openTabInFrontWindow(url) {
    const windowId = this.activeTab?.windowId ?? 1;
    const tab = { windowId, tabIndex: 2, url };
    this.calls.push(["openTabInFrontWindow", url]);
    this.tabs.push(tab);
    return tab;
  }

  async openProfileWindow({ profileDirectory, url }) {
    const tab = { windowId: 99, tabIndex: 1, url, profileDirectory };
    this.calls.push(["openProfileWindow", { profileDirectory, url }]);
    this.activeTab = tab;
    this.tabs.push(tab);
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
      JSON.stringify({ loggedIn: false, accountHints: [], authTexts: [] })
    );
  }

  async wait(ms) {
    this.calls.push(["wait", ms]);
  }
}

test("normalizeAccountHint trims, collapses spaces, and lowercases text", () => {
  assert.equal(normalizeAccountHint("  Jane Doe  "), "jane doe");
  assert.equal(normalizeAccountHint("USER@EXAMPLE.COM"), "user@example.com");
});

test("parseProbeResult accepts either JSON text or a raw object", () => {
  assert.deepEqual(parseProbeResult("{\"loggedIn\":true,\"accountHints\":[\"user@example.com\"]}"), {
    loggedIn: true,
    accountHints: ["user@example.com"],
  });

  assert.deepEqual(parseProbeResult({ loggedIn: false, accountHints: [] }), {
    loggedIn: false,
    accountHints: [],
  });
});

test("pickChatGPTTab selects the first ChatGPT-compatible tab", () => {
  const tab = pickChatGPTTab([
    { windowId: 1, tabIndex: 1, url: "https://example.com" },
    { windowId: 2, tabIndex: 3, url: "https://chat.openai.com/" },
    { windowId: 3, tabIndex: 1, url: "https://chatgpt.com/" },
  ]);

  assert.deepEqual(tab, { windowId: 2, tabIndex: 3, url: "https://chat.openai.com/" });
});

test("ensureChatGPTSession activates an existing ChatGPT tab and confirms a logged-in session", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 2, tabIndex: 3, url: "https://chatgpt.com/" }],
    probeResults: [
      JSON.stringify({
        loggedIn: true,
        accountHints: ["user@example.com"],
        url: "https://chatgpt.com/",
      }),
    ],
  });

  const result = await ensureChatGPTSession({ adapter });

  assert.equal(result.action, "activated-existing-tab");
  assert.equal(result.actualAccountHint, "user@example.com");
  assert.deepEqual(adapter.calls.map(([name]) => name), [
    "ensureBrowserApp",
    "listTabs",
    "activateTab",
    "evaluateActiveTab",
  ]);
});

test("ensureChatGPTSession succeeds without an account hint when login state is otherwise clear", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 2, tabIndex: 3, url: "https://chatgpt.com/" }],
    probeResults: [
      JSON.stringify({
        loggedIn: true,
        accountHints: [],
        composerFound: true,
        url: "https://chatgpt.com/",
      }),
    ],
  });

  const result = await ensureChatGPTSession({ adapter });

  assert.equal(result.action, "activated-existing-tab");
  assert.equal(result.actualAccountHint, null);
});

test("ensureChatGPTSession opens a new ChatGPT tab when none exists", async () => {
  const adapter = new FakeBrowserAdapter({
    probeResults: [
      JSON.stringify({
        loggedIn: true,
        accountHints: ["user@example.com"],
        url: "https://chatgpt.com/",
      }),
    ],
  });

  const result = await ensureChatGPTSession({ adapter });

  assert.equal(result.action, "opened-new-tab");
  assert.equal(result.tab.url, "https://chatgpt.com/");
  assert.deepEqual(adapter.calls.map(([name]) => name), [
    "ensureBrowserApp",
    "listTabs",
    "openTab",
    "evaluateActiveTab",
  ]);
});

test("ensureChatGPTSession can force a fresh ChatGPT tab even when one already exists", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 2, tabIndex: 3, url: "https://chatgpt.com/" }],
    activeTab: { windowId: 1, tabIndex: 1, url: "https://x.com/home" },
    probeResults: [
      JSON.stringify({
        loggedIn: true,
        accountHints: ["user@example.com"],
        url: "https://chatgpt.com/",
      }),
    ],
  });

  const result = await ensureChatGPTSession({
    adapter,
    forceNewTab: true,
  });

  assert.equal(result.action, "opened-new-tab");
  assert.deepEqual(adapter.calls.map(([name]) => name), [
    "ensureBrowserApp",
    "openTab",
    "evaluateActiveTab",
  ]);
});

test("ensureChatGPTSession falls back to opening a new tab when tab activation fails", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 2, tabIndex: 3, url: "https://chatgpt.com/" }],
    activateTabError: new Error("Chrome tab not found"),
    probeResults: [
      JSON.stringify({
        loggedIn: true,
        accountHints: ["user@example.com"],
        url: "https://chatgpt.com/",
      }),
    ],
  });

  const result = await ensureChatGPTSession({ adapter });

  assert.equal(result.action, "opened-new-tab");
  assert.deepEqual(adapter.calls.map(([name]) => name), [
    "ensureBrowserApp",
    "listTabs",
    "activateTab",
    "openTab",
    "evaluateActiveTab",
  ]);
});

test("ensureChatGPTSession retries while the page loads and then succeeds", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 1, tabIndex: 1, url: "https://chatgpt.com/" }],
    probeResults: [
      JSON.stringify({ loggedIn: false, accountHints: [], url: "https://chatgpt.com/" }),
      JSON.stringify({
        loggedIn: true,
        accountHints: ["user@example.com"],
        url: "https://chatgpt.com/",
      }),
    ],
  });

  const result = await ensureChatGPTSession({
    adapter,
    maxChecks: 2,
    waitMs: 10,
  });

  assert.equal(result.actualAccountHint, "user@example.com");
  assert.deepEqual(adapter.calls.map(([name]) => name), [
    "ensureBrowserApp",
    "listTabs",
    "activateTab",
    "evaluateActiveTab",
    "wait",
    "evaluateActiveTab",
  ]);
});

test("ensureChatGPTSession supports matching an expected account hint", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 1, tabIndex: 1, url: "https://chatgpt.com/" }],
    probeResults: [
      JSON.stringify({
        loggedIn: true,
        accountHints: ["Jane Doe", "jane@example.com"],
        url: "https://chatgpt.com/",
      }),
    ],
  });

  const result = await ensureChatGPTSession({
    adapter,
    expectedAccountHint: "jane@example.com",
  });

  assert.equal(result.expectedAccountHint, "jane@example.com");
  assert.equal(result.actualAccountHint, "jane@example.com");
});

test("ensureChatGPTSession throws when the detected account does not match the expected hint", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 1, tabIndex: 1, url: "https://chatgpt.com/" }],
    probeResults: [
      JSON.stringify({
        loggedIn: true,
        accountHints: ["wrong@example.com"],
        url: "https://chatgpt.com/",
      }),
    ],
  });

  await assert.rejects(
    () =>
      ensureChatGPTSession({
        adapter,
        expectedAccountHint: "jane@example.com",
        maxChecks: 1,
      }),
    /Expected ChatGPT account hint "jane@example\.com", but found "wrong@example\.com"\./
  );
});

test("ensureChatGPTSession throws when no logged-in ChatGPT session is detected", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 1, tabIndex: 1, url: "https://chatgpt.com/" }],
    probeResults: [
      JSON.stringify({
        loggedIn: false,
        accountHints: [],
        authTexts: ["Log in", "Sign up"],
        url: "https://chatgpt.com/",
      }),
    ],
  });

  await assert.rejects(
    () => ensureChatGPTSession({ adapter, maxChecks: 1 }),
    /No logged-in ChatGPT session detected\./
  );
});

test("ensureChatGPTSession opens the ChatGPT tab inside the verified persona window", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 40, tabIndex: 1, url: "https://x.com/home" }],
    activeTab: { windowId: 40, tabIndex: 1, url: "https://x.com/home" },
    probeResults: [
      JSON.stringify({
        loggedIn: true,
        handle: "@xtratalayers",
        url: "https://x.com/home",
      }),
      JSON.stringify({
        loggedIn: true,
        accountHints: [],
        composerFound: true,
        url: "https://chatgpt.com/",
      }),
    ],
  });

  const result = await ensureChatGPTSession({
    adapter,
    personaProfile: {
      persona: "xtrata",
      profileDirectory: "Profile 3",
      xHandle: "@xtratalayers",
      bootstrapUrl: "https://x.com/home",
    },
    maxChecks: 1,
  });

  assert.equal(result.action, "opened-new-tab");
  assert.equal(result.windowId, 40);
  assert.deepEqual(adapter.calls.map(([name]) => name), [
    "ensureBrowserApp",
    "listTabs",
    "activateTab",
    "evaluateActiveTab",
    "getActiveTab",
    "ensureBrowserApp",
    "listTabs",
    "openTabInFrontWindow",
    "evaluateActiveTab",
  ]);
});

test("ensureChatGPTSession reuses a ChatGPT tab in the verified persona window instead of another window", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [
      { windowId: 40, tabIndex: 1, url: "https://x.com/home" },
      { windowId: 50, tabIndex: 1, url: "https://chatgpt.com/" },
      { windowId: 40, tabIndex: 2, url: "https://chatgpt.com/" },
    ],
    activeTab: { windowId: 40, tabIndex: 1, url: "https://x.com/home" },
    probeResults: [
      JSON.stringify({
        loggedIn: true,
        handle: "@xtratalayers",
        url: "https://x.com/home",
      }),
      JSON.stringify({
        loggedIn: true,
        accountHints: [],
        composerFound: true,
        url: "https://chatgpt.com/",
      }),
    ],
  });

  const result = await ensureChatGPTSession({
    adapter,
    personaProfile: {
      persona: "xtrata",
      profileDirectory: "Profile 3",
      xHandle: "@xtratalayers",
      bootstrapUrl: "https://x.com/home",
    },
    maxChecks: 1,
  });

  assert.equal(result.action, "activated-existing-tab");
  assert.equal(result.tab.windowId, 40);
  assert.equal(result.tab.tabIndex, 2);
  assert.deepEqual(adapter.calls.map(([name]) => name), [
    "ensureBrowserApp",
    "listTabs",
    "activateTab",
    "evaluateActiveTab",
    "getActiveTab",
    "ensureBrowserApp",
    "listTabs",
    "activateTab",
    "evaluateActiveTab",
  ]);
});
