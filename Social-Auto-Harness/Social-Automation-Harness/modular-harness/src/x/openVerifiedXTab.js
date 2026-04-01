import { DEFAULT_X_URL, ensureXSession } from "../session/ensureXSession.js";

export function pickMatchingXTab(tabs, matchTab, preferredWindowId = null) {
  const matcher = typeof matchTab === "function" ? matchTab : () => false;
  const matchingTabs = tabs.filter((tab) => matcher(tab));

  if (Number.isFinite(preferredWindowId)) {
    const preferredTab = matchingTabs.find((tab) => tab.windowId === preferredWindowId);
    if (preferredTab) return preferredTab;
  }

  return matchingTabs[0] ?? null;
}

export async function openVerifiedXTab({
  adapter,
  expectedHandle = null,
  personaProfile = null,
  targetUrl,
  matchTab = null,
  sessionMaxChecks = 3,
  sessionWaitMs = 250,
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");
  if (!targetUrl?.trim()) throw new TypeError("targetUrl is required.");

  const resolvedExpectedHandle = expectedHandle ?? personaProfile?.xHandle ?? null;
  if (!resolvedExpectedHandle) {
    throw new TypeError("expectedHandle or personaProfile.xHandle is required.");
  }

  const session = await ensureXSession({
    adapter,
    expectedHandle: resolvedExpectedHandle,
    personaProfile,
    targetUrl: personaProfile?.bootstrapUrl ?? DEFAULT_X_URL,
    maxChecks: sessionMaxChecks,
    waitMs: sessionWaitMs,
  });

  const preferredWindowId = session.windowId ?? session.tab?.windowId ?? null;

  let matchingTab = null;
  try {
    matchingTab = pickMatchingXTab(await adapter.listTabs(), matchTab, preferredWindowId);
  } catch {
    matchingTab = null;
  }

  if (matchingTab) {
    try {
      await adapter.activateTab(matchingTab);
      return {
        ok: true,
        action: "activated-existing-matching-tab",
        session,
        tab: matchingTab,
      };
    } catch {
      matchingTab = null;
    }
  }

  let tab = null;
  if (personaProfile && typeof adapter.openTabInFrontWindow === "function") {
    tab = await adapter.openTabInFrontWindow(targetUrl);
  } else {
    tab = await adapter.openTab(targetUrl);
  }

  return {
    ok: true,
    action: "opened-new-tab",
    session,
    tab,
  };
}
