import { launchApplicationBinary, openApplicationUrl, runAppleScript } from "./appleScript.js";

const FIELD_SEPARATOR = "||";

function errorText(error) {
  return [error?.message, error?.stderr].filter(Boolean).join("\n");
}

function parseTabLine(line) {
  const [windowId, tabIndex, title = "", url = ""] = line.split(FIELD_SEPARATOR);
  return {
    windowId: Number(windowId),
    tabIndex: Number(tabIndex),
    title,
    url,
  };
}

export function parseChromeTabList(raw) {
  if (!raw) return [];

  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseTabLine)
    .filter((tab) => Number.isFinite(tab.windowId) && Number.isFinite(tab.tabIndex));
}

export function normalizeChromeAutomationError(error, browserName = "Google Chrome") {
  const text = errorText(error);
  if (/Allow JavaScript from Apple Events/i.test(text)) {
    const wrapped = new Error(
      `${browserName} is blocking page inspection. Enable "View > Developer > Allow JavaScript from Apple Events" in ${browserName}, then rerun \`npm run harness:x-session -- --handle=@yourhandle\`.`
    );
    wrapped.cause = error;
    return wrapped;
  }

  return error;
}

export class ChromeAppleScriptAdapter {
  constructor({ browserName = "Google Chrome" } = {}) {
    this.browserName = browserName;
  }

  async ensureBrowserApp() {
    await runAppleScript([
      "on run argv",
      "set browserName to item 1 of argv",
      "tell application browserName",
      "activate",
      "end tell",
      "return \"ok\"",
      "end run",
    ], [this.browserName]);
  }

  async listTabs() {
    const raw = await runAppleScript([
      "on run argv",
      "set browserName to item 1 of argv",
      "using terms from application \"Google Chrome\"",
      "set outputLines to {}",
      "tell application browserName",
      "if (count of windows) is 0 then return \"\"",
      "repeat with w in windows",
      "set currentWindow to contents of w",
      "set windowId to id of currentWindow",
      "set tabCounter to 0",
      "repeat with t in tabs of currentWindow",
      "set currentTab to contents of t",
      "set tabCounter to tabCounter + 1",
      `set end of outputLines to ((windowId as text) & "${FIELD_SEPARATOR}" & (tabCounter as text) & "${FIELD_SEPARATOR}" & (title of currentTab as text) & "${FIELD_SEPARATOR}" & (URL of currentTab as text))`,
      "end repeat",
      "end repeat",
      "end tell",
      "set AppleScript's text item delimiters to linefeed",
      "return outputLines as text",
      "end using terms from",
      "end run",
    ], [this.browserName]);

    return parseChromeTabList(raw);
  }

  async activateTab(tab) {
    await runAppleScript([
      "on run argv",
      "set browserName to item 1 of argv",
      "set targetWindowId to item 2 of argv as integer",
      "set targetTabIndex to item 3 of argv as integer",
      "using terms from application \"Google Chrome\"",
      "tell application browserName",
      "repeat with w in windows",
      "set currentWindow to contents of w",
      "if id of currentWindow is targetWindowId then",
      "set index of currentWindow to 1",
      "set active tab index of currentWindow to targetTabIndex",
      "activate",
      "return \"ok\"",
      "end if",
      "end repeat",
      "end tell",
      "end using terms from",
      "error \"Chrome tab not found\"",
      "end run",
    ], [this.browserName, String(tab.windowId), String(tab.tabIndex)]);
  }

  async openTab(url) {
    await openApplicationUrl(this.browserName, url);
    return {
      windowId: null,
      tabIndex: null,
      url,
    };
  }

  async closeTab(tab) {
    await runAppleScript([
      "on run argv",
      "set browserName to item 1 of argv",
      "set targetWindowId to item 2 of argv as integer",
      "set targetTabIndex to item 3 of argv as integer",
      "using terms from application \"Google Chrome\"",
      "tell application browserName",
      "repeat with w in windows",
      "set currentWindow to contents of w",
      "if id of currentWindow is targetWindowId then",
      "set tabCount to count of tabs of currentWindow",
      "if targetTabIndex < 1 or targetTabIndex > tabCount then error \"Chrome tab not found\"",
      "close (tab targetTabIndex of currentWindow)",
      "activate",
      "return \"ok\"",
      "end if",
      "end repeat",
      "end tell",
      "end using terms from",
      "error \"Chrome tab not found\"",
      "end run",
    ], [this.browserName, String(tab.windowId), String(tab.tabIndex)]);
  }

  async getActiveTab() {
    const raw = await runAppleScript([
      "on run argv",
      "set browserName to item 1 of argv",
      "using terms from application \"Google Chrome\"",
      "tell application browserName",
      "if (count of windows) is 0 then error \"Chrome window not found\"",
      "set frontWindowId to id of front window",
      "set frontTabIndex to active tab index of front window",
      "set frontTabUrl to URL of active tab of front window",
      "set frontTabTitle to title of active tab of front window",
      `return ((frontWindowId as text) & "${FIELD_SEPARATOR}" & (frontTabIndex as text) & "${FIELD_SEPARATOR}" & frontTabTitle & "${FIELD_SEPARATOR}" & frontTabUrl)`,
      "end tell",
      "end using terms from",
      "end run",
    ], [this.browserName]);

    return parseChromeTabList(raw)[0] ?? null;
  }

  async openTabInWindow({ windowId, url }) {
    const raw = await runAppleScript([
      "on run argv",
      "set browserName to item 1 of argv",
      "set targetWindowId to item 2 of argv as integer",
      "set targetUrl to item 3 of argv",
      "using terms from application \"Google Chrome\"",
      "tell application browserName",
      "repeat with w in windows",
      "set currentWindow to contents of w",
      "if id of currentWindow is targetWindowId then",
      "set newTab to make new tab at end of tabs of window id targetWindowId",
      "set URL of newTab to targetUrl",
      "set active tab index of window id targetWindowId to (count of tabs of window id targetWindowId)",
      "set index of window id targetWindowId to 1",
      "activate",
      "set newTabIndex to active tab index of window id targetWindowId",
      `return ((targetWindowId as text) & "${FIELD_SEPARATOR}" & (newTabIndex as text) & "${FIELD_SEPARATOR}" & (title of active tab of window id targetWindowId as text) & "${FIELD_SEPARATOR}" & (URL of active tab of window id targetWindowId as text))`,
      "end if",
      "end repeat",
      "end tell",
      "end using terms from",
      "error \"Chrome window not found\"",
      "end run",
    ], [this.browserName, String(windowId), url]);

    return parseChromeTabList(raw)[0] ?? {
      windowId,
      tabIndex: null,
      title: "",
      url,
    };
  }

  async openTabInFrontWindow(url) {
    const raw = await runAppleScript([
      "on run argv",
      "set browserName to item 1 of argv",
      "set targetUrl to item 2 of argv",
      "using terms from application \"Google Chrome\"",
      "tell application browserName",
      "if (count of windows) is 0 then error \"Chrome window not found\"",
      "set index of front window to 1",
      "activate",
      "tell front window",
      "set newTab to make new tab at end of tabs",
      "set URL of newTab to targetUrl",
      "set active tab index to (count of tabs)",
      "set frontWindowId to id",
      "set frontTabIndex to active tab index",
      `return ((frontWindowId as text) & "${FIELD_SEPARATOR}" & (frontTabIndex as text) & "${FIELD_SEPARATOR}" & (title of active tab as text) & "${FIELD_SEPARATOR}" & (URL of active tab as text))`,
      "end tell",
      "end tell",
      "end using terms from",
      "end run",
    ], [this.browserName, url]);

    return parseChromeTabList(raw)[0] ?? {
      windowId: null,
      tabIndex: null,
      title: "",
      url,
    };
  }

  async openProfileWindow({ profileDirectory, url }) {
    await launchApplicationBinary(this.browserName, [
      `--profile-directory=${profileDirectory}`,
      "--new-window",
      url,
    ]);
    const tab = await this.getActiveTab();
    return {
      ...(tab ?? {
        windowId: null,
        tabIndex: null,
        title: "",
        url,
      }),
      profileDirectory,
    };
  }

  async evaluateActiveTab(script) {
    try {
      return await runAppleScript([
        "on run argv",
        "set browserName to item 1 of argv",
        "set jsSource to item 2 of argv",
        "using terms from application \"Google Chrome\"",
        "tell application browserName",
        "activate",
        "return execute active tab of front window javascript jsSource",
        "end tell",
        "end using terms from",
        "end run",
      ], [this.browserName, script]);
    } catch (error) {
      throw normalizeChromeAutomationError(error, this.browserName);
    }
  }

  async wait(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
