import { normalizeGovernanceUrl } from "../governance/loadGovernanceState.js";
import { DEFAULT_X_URL, pickXTab } from "../session/xSessionSignals.js";
import { ensureChromePersonaWindow } from "./ensureChromePersonaWindow.js";

const CHATGPT_TAB_URL_PATTERN = /^https?:\/\/(?:(?:www\.)?chatgpt\.com|chat\.openai\.com)(?:\/|$)/i;

function normalizeCount(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function tabKey(tab) {
  return `${tab.windowId}:${tab.tabIndex}:${tab.url ?? ""}`;
}

function isChatGPTTab(tab) {
  return CHATGPT_TAB_URL_PATTERN.test(tab?.url ?? "");
}

function compareByTabIndex(left, right) {
  return (left?.tabIndex ?? 0) - (right?.tabIndex ?? 0);
}

function compareXPreservation(left, right, preferredUrl = null) {
  const normalizedPreferredUrl = normalizeGovernanceUrl(preferredUrl);
  const normalizedLeftUrl = normalizeGovernanceUrl(left?.url ?? null);
  const normalizedRightUrl = normalizeGovernanceUrl(right?.url ?? null);
  const leftPreferred = normalizedPreferredUrl && normalizedLeftUrl === normalizedPreferredUrl ? 1 : 0;
  const rightPreferred = normalizedPreferredUrl && normalizedRightUrl === normalizedPreferredUrl ? 1 : 0;
  if (leftPreferred !== rightPreferred) {
    return rightPreferred - leftPreferred;
  }

  const leftHome = /^https?:\/\/(www\.)?x\.com\/home(?:[/?#]|$)/i.test(left?.url ?? "") ? 1 : 0;
  const rightHome = /^https?:\/\/(www\.)?x\.com\/home(?:[/?#]|$)/i.test(right?.url ?? "") ? 1 : 0;
  if (leftHome !== rightHome) {
    return rightHome - leftHome;
  }

  return compareByTabIndex(left, right);
}

export function planPersonaTabCleanup({
  tabs = [],
  windowId,
  preferredXUrl = DEFAULT_X_URL,
  keepXTabs = 1,
  keepChatGPTTabs = 1,
} = {}) {
  if (!Number.isFinite(windowId)) {
    throw new TypeError("windowId is required.");
  }

  const normalizedKeepXTabs = normalizeCount(keepXTabs, 1);
  const normalizedKeepChatGPTTabs = normalizeCount(keepChatGPTTabs, 1);
  const windowTabs = tabs.filter((tab) => tab?.windowId === windowId).sort(compareByTabIndex);
  const xTabs = windowTabs.filter((tab) => pickXTab([tab]));
  const chatgptTabs = windowTabs.filter(isChatGPTTab);
  const keptXTabs = [...xTabs]
    .sort((left, right) => compareXPreservation(left, right, preferredXUrl))
    .slice(0, normalizedKeepXTabs);
  const keptChatGPTTabs = [...chatgptTabs].sort(compareByTabIndex).slice(0, normalizedKeepChatGPTTabs);
  const keptTabKeys = new Set([...keptXTabs, ...keptChatGPTTabs].map(tabKey));
  const tabsToClose = windowTabs
    .filter((tab) => (pickXTab([tab]) || isChatGPTTab(tab)) && !keptTabKeys.has(tabKey(tab)))
    .sort((left, right) => (right?.tabIndex ?? 0) - (left?.tabIndex ?? 0));

  return {
    windowId,
    keptXTabs,
    keptChatGPTTabs,
    tabsToClose,
    xTabCount: xTabs.length,
    chatgptTabCount: chatgptTabs.length,
  };
}

export async function cleanupPersonaTabs({
  adapter,
  personaProfile,
  expectedXHandle = null,
  keepXTabs = 1,
  keepChatGPTTabs = 1,
  targetUrl = DEFAULT_X_URL,
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");
  if (!personaProfile?.profileDirectory) {
    throw new TypeError("personaProfile.profileDirectory is required.");
  }
  if (!personaProfile?.xHandle && !expectedXHandle) {
    throw new TypeError("personaProfile.xHandle or expectedXHandle is required.");
  }
  if (typeof adapter.closeTab !== "function") {
    throw new TypeError("adapter.closeTab is required.");
  }

  const personaWindow = await ensureChromePersonaWindow({
    adapter,
    persona: personaProfile.persona,
    profileDirectory: personaProfile.profileDirectory,
    expectedXHandle: expectedXHandle ?? personaProfile.xHandle,
    targetUrl: personaProfile.bootstrapUrl ?? targetUrl,
  });
  const tabs = await adapter.listTabs();
  const plan = planPersonaTabCleanup({
    tabs,
    windowId: personaWindow.windowId ?? personaWindow.tab?.windowId,
    preferredXUrl: personaProfile.bootstrapUrl ?? targetUrl,
    keepXTabs,
    keepChatGPTTabs,
  });
  const closedTabs = [];

  for (const tab of plan.tabsToClose) {
    await adapter.closeTab(tab);
    closedTabs.push(tab);
  }

  return {
    ok: true,
    persona: personaProfile.persona ?? null,
    windowId: plan.windowId,
    keptXTabs: plan.keptXTabs,
    keptChatGPTTabs: plan.keptChatGPTTabs,
    closedTabs,
    xTabCountBefore: plan.xTabCount,
    chatgptTabCountBefore: plan.chatgptTabCount,
  };
}
