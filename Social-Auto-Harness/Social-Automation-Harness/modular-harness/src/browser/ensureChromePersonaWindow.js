import {
  DEFAULT_X_URL,
  X_SESSION_PROBE_SCRIPT,
  normalizeHandle,
  parseXProbeResult,
  pickXTab,
} from "../session/xSessionSignals.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPersonaVerification({
  adapter,
  expectedXHandle,
  maxChecks,
  waitMs,
}) {
  let lastState = null;

  for (let attempt = 1; attempt <= maxChecks; attempt += 1) {
    lastState = parseXProbeResult(await adapter.evaluateActiveTab(X_SESSION_PROBE_SCRIPT));
    if (lastState.loggedIn && normalizeHandle(lastState.handle) === expectedXHandle) {
      return { ok: true, state: lastState };
    }

    if (attempt < maxChecks) {
      if (typeof adapter.wait === "function") {
        await adapter.wait(waitMs);
      } else {
        await sleep(waitMs);
      }
    }
  }

  return { ok: false, state: lastState };
}

async function readActiveTab(adapter, fallbackTab = null) {
  if (typeof adapter.getActiveTab !== "function") {
    return fallbackTab;
  }

  try {
    return (await adapter.getActiveTab()) ?? fallbackTab;
  } catch {
    return fallbackTab;
  }
}

function buildPersonaWindowError(persona, expectedXHandle, state) {
  if (!state?.loggedIn) {
    return new Error(
      `Chrome persona "${persona}" could not be verified. No logged-in X session detected for @${expectedXHandle}.`
    );
  }

  const actualHandle = normalizeHandle(state.handle) ?? "unknown";
  return new Error(
    `Chrome persona "${persona}" could not be verified. Expected X handle @${expectedXHandle}, but found @${actualHandle}.`
  );
}

export async function ensureChromePersonaWindow({
  adapter,
  persona,
  profileDirectory,
  expectedXHandle,
  targetUrl = DEFAULT_X_URL,
  maxChecks = 3,
  waitMs = 250,
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");

  const normalizedExpectedXHandle = normalizeHandle(expectedXHandle);
  if (!normalizedExpectedXHandle) {
    throw new TypeError("expectedXHandle is required.");
  }

  if (!profileDirectory?.trim()) {
    throw new TypeError("profileDirectory is required.");
  }

  if (typeof adapter.openProfileWindow !== "function") {
    throw new TypeError("adapter.openProfileWindow is required.");
  }

  await adapter.ensureBrowserApp();

  let candidateTabs = [];
  try {
    candidateTabs = (await adapter.listTabs()).filter((tab) => pickXTab([tab]));
  } catch {
    candidateTabs = [];
  }

  for (const tab of candidateTabs) {
    try {
      await adapter.activateTab(tab);
    } catch {
      continue;
    }

    const verification = await waitForPersonaVerification({
      adapter,
      expectedXHandle: normalizedExpectedXHandle,
      maxChecks,
      waitMs,
    });

    if (verification.ok) {
      const activeTab = await readActiveTab(adapter, tab);
      return {
        ok: true,
        persona: persona ?? null,
        action: "activated-existing-window",
        profileDirectory,
        expectedXHandle: normalizedExpectedXHandle,
        actualXHandle: normalizeHandle(verification.state.handle),
        state: verification.state,
        tab: activeTab,
        windowId: activeTab?.windowId ?? tab?.windowId ?? null,
      };
    }
  }

  const tab = await adapter.openProfileWindow({
    profileDirectory,
    url: targetUrl,
  });

  const verification = await waitForPersonaVerification({
    adapter,
    expectedXHandle: normalizedExpectedXHandle,
    maxChecks,
    waitMs,
  });

  if (!verification.ok) {
    throw buildPersonaWindowError(persona ?? profileDirectory, normalizedExpectedXHandle, verification.state);
  }

  return {
    ok: true,
    persona: persona ?? null,
    action: "opened-profile-window",
    profileDirectory,
    expectedXHandle: normalizedExpectedXHandle,
    actualXHandle: normalizeHandle(verification.state.handle),
    state: verification.state,
    tab,
    windowId: tab?.windowId ?? null,
  };
}
