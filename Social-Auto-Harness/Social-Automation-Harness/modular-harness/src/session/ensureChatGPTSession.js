import { ensureChromePersonaWindow } from "../browser/ensureChromePersonaWindow.js";
import { DEFAULT_X_URL } from "./xSessionSignals.js";

export const DEFAULT_CHATGPT_URL = "https://chatgpt.com/";

const CHATGPT_TAB_URL_PATTERN = /^https?:\/\/(?:(?:www\.)?chatgpt\.com|chat\.openai\.com)(?:\/|$)/i;

export const CHATGPT_SESSION_PROBE_SCRIPT = `(() => {
  const normalizeText = (value) => (value || "").replace(/\\s+/g, " ").trim();
  const unique = (values) => [...new Set(values.map(normalizeText).filter(Boolean))];
  const readText = (selector) =>
    [...document.querySelectorAll(selector)].map((node) => normalizeText(node.textContent || ""));
  const readAttr = (selector, attr) =>
    [...document.querySelectorAll(selector)].map((node) => normalizeText(node.getAttribute(attr) || ""));
  const uiTexts = unique([
    ...readText("button"),
    ...readText("a"),
    ...readText("nav button"),
    ...readText("nav a"),
    ...readAttr("[aria-label]", "aria-label"),
    ...readAttr("[title]", "title"),
  ]);
  const accountCandidateTexts = unique([
    ...readText('button[aria-haspopup="menu"]'),
    ...readText('[data-testid*="account"]'),
    ...readText('[data-testid*="user"]'),
    ...readText('[aria-label*="Account" i]'),
    ...readText('[aria-label*="Profile" i]'),
    ...readAttr('[aria-label*="Account" i]', "aria-label"),
    ...readAttr('[aria-label*="Profile" i]', "aria-label"),
    ...readAttr('button[aria-haspopup="menu"]', "aria-label"),
  ]);
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/ig;
  const emails = unique(
    accountCandidateTexts.flatMap((value) => {
      const matches = value.match(emailPattern);
      return matches ? matches : [];
    })
  );
  const ignoredLabels = /^(new chat|search chats|library|sora|explore gpts|settings|help|upgrade|my plan|log in|sign up|home|projects|chatgpt)$/i;
  const accountHints = unique([
    ...emails,
    ...accountCandidateTexts.filter((value) => !ignoredLabels.test(value) && value.length <= 80),
  ]);
  const authTexts = uiTexts.filter((value) =>
    /^(log in|sign up|continue with google|continue with microsoft|continue with apple)$/i.test(value)
  );
  const accountMenuFound = Boolean(
    document.querySelector(
      'button[aria-haspopup="menu"], [data-testid*="account"], [data-testid*="user"], [aria-label*="Account" i], [aria-label*="Profile" i]'
    )
  );
  const composerFound = Boolean(
    document.querySelector("#prompt-textarea, textarea, [contenteditable='true']")
  );
  const sendButtonFound = Boolean(
    document.querySelector('[data-testid*="send"], button[aria-label*="Send"], button[aria-label*="send"]')
  );
  const conversationLinkFound = [...document.querySelectorAll("a[href]")].some((node) =>
    /^\\/c\\//.test(node.getAttribute("href") || "")
  );
  const authPath = /\\/auth(\\/|$)/i.test(window.location.pathname);
  const loggedIn =
    !authPath && (composerFound || sendButtonFound || conversationLinkFound || accountMenuFound);

  return JSON.stringify({
    url: window.location.href,
    title: document.title,
    loggedIn,
    authPath,
    authTexts,
    accountHints,
    accountMenuFound,
    composerFound,
    sendButtonFound,
    conversationLinkFound,
  });
})()`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeAccountHint(value) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() || null;
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function pickDefaultAccountHint(accountHints = []) {
  return accountHints.find((value) => looksLikeEmail(normalizeAccountHint(value) ?? "")) ?? null;
}

export function parseProbeResult(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) {
    return { loggedIn: false, accountHints: [], authTexts: [] };
  }

  return JSON.parse(raw);
}

export function pickChatGPTTab(tabs) {
  return tabs.find((tab) => CHATGPT_TAB_URL_PATTERN.test(tab.url));
}

function pickChatGPTTabInWindow(tabs, windowId) {
  if (!Number.isFinite(windowId)) return null;
  return tabs.find(
    (tab) => tab.windowId === windowId && CHATGPT_TAB_URL_PATTERN.test(tab.url)
  );
}

function findMatchingAccountHint(expectedAccountHint, state) {
  const normalizedExpected = normalizeAccountHint(expectedAccountHint);
  if (!normalizedExpected) return null;

  return (
    state?.accountHints?.find((value) => normalizeAccountHint(value) === normalizedExpected) ?? null
  );
}

function buildSessionError(expectedAccountHint, state) {
  if (!state?.loggedIn) {
    return new Error("No logged-in ChatGPT session detected.");
  }

  if (!expectedAccountHint) {
    return new Error("A ChatGPT session is open, but it could not be confirmed.");
  }

  const actualAccountHint = state?.accountHints?.[0] ?? "unknown";
  return new Error(
    `Expected ChatGPT account hint "${expectedAccountHint}", but found "${actualAccountHint}".`
  );
}

export async function ensureChatGPTSession({
  adapter,
  expectedAccountHint = null,
  personaProfile = null,
  targetUrl = DEFAULT_CHATGPT_URL,
  maxChecks = 5,
  waitMs = 500,
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");

  const normalizedExpectedAccountHint = normalizeAccountHint(expectedAccountHint);
  let personaWindow = null;

  if (personaProfile) {
    if (!personaProfile.xHandle) {
      throw new TypeError("personaProfile.xHandle is required.");
    }

    personaWindow = await ensureChromePersonaWindow({
      adapter,
      persona: personaProfile.persona,
      profileDirectory: personaProfile.profileDirectory,
      expectedXHandle: personaProfile.xHandle,
      targetUrl: personaProfile.bootstrapUrl ?? DEFAULT_X_URL,
      maxChecks: personaProfile.maxChecks ?? 3,
      waitMs: personaProfile.waitMs ?? 250,
    });
  }

  await adapter.ensureBrowserApp();

  let tab = null;
  let action = "opened-new-tab";
  let tabs = [];
  const personaWindowId = personaWindow?.windowId ?? personaWindow?.tab?.windowId ?? null;

  try {
    tabs = await adapter.listTabs();
    tab = personaWindowId ? pickChatGPTTabInWindow(tabs, personaWindowId) : pickChatGPTTab(tabs);
  } catch {
    tabs = [];
    tab = null;
  }

  if (tab) {
    try {
      await adapter.activateTab(tab);
      action = "activated-existing-tab";
    } catch {
      if (personaProfile && typeof adapter.openTabInFrontWindow === "function") {
        tab = await adapter.openTabInFrontWindow(targetUrl);
      } else if (Number.isFinite(personaWindowId) && typeof adapter.openTabInWindow === "function") {
        tab = await adapter.openTabInWindow({ windowId: personaWindowId, url: targetUrl });
      } else {
        tab = await adapter.openTab(targetUrl);
      }
      action = "opened-new-tab";
    }
  } else {
    if (personaProfile && typeof adapter.openTabInFrontWindow === "function") {
      tab = await adapter.openTabInFrontWindow(targetUrl);
    } else if (Number.isFinite(personaWindowId) && typeof adapter.openTabInWindow === "function") {
      tab = await adapter.openTabInWindow({ windowId: personaWindowId, url: targetUrl });
    } else {
      tab = await adapter.openTab(targetUrl);
    }
  }

  let lastState = null;
  for (let attempt = 1; attempt <= maxChecks; attempt += 1) {
    lastState = parseProbeResult(await adapter.evaluateActiveTab(CHATGPT_SESSION_PROBE_SCRIPT));
    const matchedAccountHint = findMatchingAccountHint(normalizedExpectedAccountHint, lastState);
    if (lastState.loggedIn && (!normalizedExpectedAccountHint || matchedAccountHint)) {
      return {
        ok: true,
        action,
        expectedAccountHint: normalizedExpectedAccountHint,
        actualAccountHint: normalizeAccountHint(
          matchedAccountHint ?? pickDefaultAccountHint(lastState.accountHints)
        ),
        state: lastState,
        tab,
        windowId: tab?.windowId ?? personaWindowId ?? null,
      };
    }

    if (attempt < maxChecks) {
      if (typeof adapter.wait === "function") {
        await adapter.wait(waitMs);
      } else {
        await sleep(waitMs);
      }
    }
  }

  throw buildSessionError(normalizedExpectedAccountHint, lastState);
}
