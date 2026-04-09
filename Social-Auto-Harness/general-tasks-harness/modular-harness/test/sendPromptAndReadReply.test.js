import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChatGPTSubmitPromptScript,
  isNewReply,
  normalizeReplyText,
  parseReplyProbeResult,
  parseSubmitResult,
  sendPromptAndReadReply,
} from "../src/chatgpt/sendPromptAndReadReply.js";

function classifyScript(script) {
  if (script.includes("accountMenuFound")) return "session-probe";
  if (script.includes("submittedPromptLength")) return "submit-prompt";
  if (script.includes("replyCount")) return "reply-probe";
  return "unknown";
}

class FakeBrowserAdapter {
  constructor({ tabs = [], evaluationResults = [], listTabsError = null, activateTabError = null } = {}) {
    this.tabs = tabs;
    this.evaluationResults = [...evaluationResults];
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

  async evaluateActiveTab(script) {
    this.calls.push(["evaluateActiveTab", classifyScript(script)]);
    return this.evaluationResults.shift();
  }

  async wait(ms) {
    this.calls.push(["wait", ms]);
  }
}

test("normalizeReplyText trims and normalizes whitespace", () => {
  assert.equal(normalizeReplyText(" Line 1 \r\n\r\n\r\nLine 2 "), "Line 1\n\nLine 2");
});

test("parseSubmitResult and parseReplyProbeResult accept text or raw objects", () => {
  assert.deepEqual(parseSubmitResult('{"ok":true,"reason":null}'), { ok: true, reason: null });
  assert.deepEqual(parseSubmitResult({ ok: false, reason: "x" }), { ok: false, reason: "x" });

  assert.deepEqual(parseReplyProbeResult('{"replyCount":1,"replyText":"hi"}'), {
    replyCount: 1,
    replyText: "hi",
  });
  assert.deepEqual(parseReplyProbeResult({ replyCount: 0, replyText: null }), {
    replyCount: 0,
    replyText: null,
  });
});

test("isNewReply detects a new assistant reply by count or changed text", () => {
  assert.equal(
    isNewReply({ replyCount: 1, replyText: "old" }, { replyCount: 2, replyText: "new" }),
    true
  );
  assert.equal(
    isNewReply({ replyCount: 1, replyText: "old" }, { replyCount: 1, replyText: "different" }),
    true
  );
  assert.equal(
    isNewReply({ replyCount: 1, replyText: "old" }, { replyCount: 1, replyText: "old" }),
    false
  );
});

test("buildChatGPTSubmitPromptScript embeds the prompt text safely", () => {
  const script = buildChatGPTSubmitPromptScript('Say "hello"');
  assert.match(script, /Say \\"hello\\"/);
  assert.match(script, /submittedPromptLength/);
});

test("sendPromptAndReadReply submits a prompt and returns a stable new assistant reply", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 1, tabIndex: 1, url: "https://chatgpt.com/" }],
    evaluationResults: [
      JSON.stringify({ loggedIn: true, accountHints: [], composerFound: true, url: "https://chatgpt.com/" }),
      JSON.stringify({ replyCount: 1, replyText: "Older answer", generating: false, url: "https://chatgpt.com/c/1" }),
      JSON.stringify({ ok: true, retryable: false, submittedPromptLength: 12, url: "https://chatgpt.com/c/1" }),
      JSON.stringify({ replyCount: 2, replyText: "New answer draft", generating: true, url: "https://chatgpt.com/c/1" }),
      JSON.stringify({ replyCount: 2, replyText: "New answer final", generating: false, url: "https://chatgpt.com/c/1" }),
      JSON.stringify({ replyCount: 2, replyText: "New answer final", generating: false, url: "https://chatgpt.com/c/1" }),
    ],
  });

  const result = await sendPromptAndReadReply({
    adapter,
    prompt: "Write a reply",
    replyWaitMs: 10,
    stableChecks: 2,
  });

  assert.equal(result.replyText, "New answer final");
  assert.equal(result.session.action, "activated-existing-tab");
  assert.deepEqual(adapter.calls.map(([name, detail]) => [name, detail]), [
    ["ensureBrowserApp", undefined],
    ["listTabs", undefined],
    ["activateTab", { windowId: 1, tabIndex: 1, url: "https://chatgpt.com/" }],
    ["evaluateActiveTab", "session-probe"],
    ["evaluateActiveTab", "reply-probe"],
    ["evaluateActiveTab", "submit-prompt"],
    ["evaluateActiveTab", "reply-probe"],
    ["wait", 10],
    ["evaluateActiveTab", "reply-probe"],
    ["wait", 10],
    ["evaluateActiveTab", "reply-probe"],
  ]);
});

test("sendPromptAndReadReply retries prompt submission while the send button is not ready", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 1, tabIndex: 1, url: "https://chatgpt.com/" }],
    evaluationResults: [
      JSON.stringify({ loggedIn: true, accountHints: [], composerFound: true, url: "https://chatgpt.com/" }),
      JSON.stringify({ replyCount: 0, replyText: null, generating: false, url: "https://chatgpt.com/" }),
      JSON.stringify({ ok: false, reason: "send-button-not-ready", retryable: true, url: "https://chatgpt.com/" }),
      JSON.stringify({ ok: true, retryable: false, submittedPromptLength: 5, url: "https://chatgpt.com/" }),
      JSON.stringify({ replyCount: 1, replyText: "Done", generating: false, url: "https://chatgpt.com/c/2" }),
    ],
  });

  const result = await sendPromptAndReadReply({
    adapter,
    prompt: "Hello",
    submitWaitMs: 10,
    replyMaxChecks: 1,
    stableChecks: 1,
  });

  assert.equal(result.replyText, "Done");
  assert.deepEqual(adapter.calls.map(([name, detail]) => [name, detail]), [
    ["ensureBrowserApp", undefined],
    ["listTabs", undefined],
    ["activateTab", { windowId: 1, tabIndex: 1, url: "https://chatgpt.com/" }],
    ["evaluateActiveTab", "session-probe"],
    ["evaluateActiveTab", "reply-probe"],
    ["evaluateActiveTab", "submit-prompt"],
    ["wait", 10],
    ["evaluateActiveTab", "submit-prompt"],
    ["evaluateActiveTab", "reply-probe"],
  ]);
});

test("sendPromptAndReadReply can continue in the same existing ChatGPT tab", async () => {
  const adapter = new FakeBrowserAdapter({
    evaluationResults: [
      JSON.stringify({ loggedIn: true, accountHints: [], composerFound: true, url: "https://chatgpt.com/c/1" }),
      JSON.stringify({ replyCount: 1, replyText: "Older answer", generating: false, url: "https://chatgpt.com/c/1" }),
      JSON.stringify({ ok: true, retryable: false, submittedPromptLength: 13, url: "https://chatgpt.com/c/1" }),
      JSON.stringify({ replyCount: 2, replyText: "New answer final", generating: false, url: "https://chatgpt.com/c/1" }),
    ],
  });

  const result = await sendPromptAndReadReply({
    adapter,
    prompt: "Repair output",
    existingSession: {
      action: "activated-existing-tab",
      tab: { windowId: 1, tabIndex: 3, url: "https://chatgpt.com/c/1" },
      windowId: 1,
    },
    replyMaxChecks: 1,
    stableChecks: 1,
  });

  assert.equal(result.replyText, "New answer final");
  assert.equal(result.session.action, "continued-existing-session-tab");
  assert.deepEqual(adapter.calls.map(([name, detail]) => [name, detail]), [
    ["activateTab", { windowId: 1, tabIndex: 3, url: "https://chatgpt.com/c/1" }],
    ["evaluateActiveTab", "session-probe"],
    ["evaluateActiveTab", "reply-probe"],
    ["evaluateActiveTab", "submit-prompt"],
    ["evaluateActiveTab", "reply-probe"],
  ]);
});

test("sendPromptAndReadReply throws when prompt submission never succeeds", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 1, tabIndex: 1, url: "https://chatgpt.com/" }],
    evaluationResults: [
      JSON.stringify({ loggedIn: true, accountHints: [], composerFound: true, url: "https://chatgpt.com/" }),
      JSON.stringify({ replyCount: 0, replyText: null, generating: false, url: "https://chatgpt.com/" }),
      JSON.stringify({ ok: false, reason: "composer-not-found", retryable: true, url: "https://chatgpt.com/" }),
    ],
  });

  await assert.rejects(
    () =>
      sendPromptAndReadReply({
        adapter,
        prompt: "Hello",
        submitMaxChecks: 1,
      }),
    /ChatGPT prompt submission failed: composer-not-found\./
  );
});

test("sendPromptAndReadReply throws when no new reply arrives before timeout", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 1, tabIndex: 1, url: "https://chatgpt.com/" }],
    evaluationResults: [
      JSON.stringify({ loggedIn: true, accountHints: [], composerFound: true, url: "https://chatgpt.com/" }),
      JSON.stringify({ replyCount: 1, replyText: "Older answer", generating: false, url: "https://chatgpt.com/c/3" }),
      JSON.stringify({ ok: true, retryable: false, submittedPromptLength: 5, url: "https://chatgpt.com/c/3" }),
      JSON.stringify({ replyCount: 1, replyText: "Older answer", generating: true, url: "https://chatgpt.com/c/3" }),
      JSON.stringify({ replyCount: 1, replyText: "Older answer", generating: true, url: "https://chatgpt.com/c/3" }),
    ],
  });

  await assert.rejects(
    () =>
      sendPromptAndReadReply({
        adapter,
        prompt: "Hello",
        replyMaxChecks: 2,
        replyWaitMs: 10,
      }),
    /ChatGPT was still generating when the wait budget expired after waiting 20 ms\./
  );
});

test("sendPromptAndReadReply throws quickly when the prompt is pasted but never actually submits", async () => {
  const adapter = new FakeBrowserAdapter({
    tabs: [{ windowId: 1, tabIndex: 1, url: "https://chatgpt.com/" }],
    evaluationResults: [
      JSON.stringify({ loggedIn: true, accountHints: [], composerFound: true, url: "https://chatgpt.com/" }),
      JSON.stringify({ replyCount: 1, replyText: "Older answer", generating: false, composerTextLength: 0, url: "https://chatgpt.com/c/4" }),
      JSON.stringify({
        ok: true,
        retryable: false,
        submittedPromptLength: 5,
        composerTextLength: 5,
        sendButtonLabel: "Send prompt",
        url: "https://chatgpt.com/c/4",
      }),
      JSON.stringify({ replyCount: 1, replyText: "Older answer", generating: false, composerTextLength: 5, url: "https://chatgpt.com/c/4" }),
      JSON.stringify({ replyCount: 1, replyText: "Older answer", generating: false, composerTextLength: 5, url: "https://chatgpt.com/c/4" }),
    ],
  });

  await assert.rejects(
    () =>
      sendPromptAndReadReply({
        adapter,
        prompt: "Hello",
        submitMaxChecks: 1,
        submitConfirmMaxChecks: 2,
        submitConfirmWaitMs: 10,
      }),
    /ChatGPT prompt submission failed: submit-not-confirmed\./
  );
});
