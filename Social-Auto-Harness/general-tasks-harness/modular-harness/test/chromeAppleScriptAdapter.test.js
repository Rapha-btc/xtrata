import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeChromeAutomationError,
  parseChromeTabList,
} from "../src/browser/chromeAppleScriptAdapter.js";

test("parseChromeTabList parses AppleScript tab output into structured tab refs", () => {
  const result = parseChromeTabList([
    "101||1||Home / X||https://x.com/home",
    "101||2||ChatGPT||https://chatgpt.com/",
    "102||1||Gemini||https://gemini.google.com/app",
  ].join("\n"));

  assert.deepEqual(result, [
    { windowId: 101, tabIndex: 1, title: "Home / X", url: "https://x.com/home" },
    { windowId: 101, tabIndex: 2, title: "ChatGPT", url: "https://chatgpt.com/" },
    { windowId: 102, tabIndex: 1, title: "Gemini", url: "https://gemini.google.com/app" },
  ]);
});

test("parseChromeTabList ignores blank or invalid lines", () => {
  const result = parseChromeTabList("\nnot-a-tab-line\n101||2||ChatGPT||https://chatgpt.com/\n");

  assert.deepEqual(result, [
    { windowId: 101, tabIndex: 2, title: "ChatGPT", url: "https://chatgpt.com/" },
  ]);
});

test("normalizeChromeAutomationError explains how to enable JavaScript from Apple Events", () => {
  const original = new Error("Google Chrome got an error");
  original.stderr =
    'execution error: Google Chrome got an error: Executing JavaScript through AppleScript is turned off. To turn it on, from the menu bar, go to View > Developer > Allow JavaScript from Apple Events.';

  const result = normalizeChromeAutomationError(original, "Google Chrome");

  assert.match(result.message, /Allow JavaScript from Apple Events/);
  assert.match(result.message, /npm run harness:x-session/);
  assert.equal(result.cause, original);
});
