import { ensureChromePersonaWindow } from "../browser/ensureChromePersonaWindow.js";
import {
  DEFAULT_X_URL,
  X_SESSION_PROBE_SCRIPT,
  normalizeHandle,
  parseXProbeResult as parseProbeResult,
  pickXTab,
} from "./xSessionSignals.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSessionError(expectedHandle, state) {
  if (!state?.loggedIn) {
    return new Error(`No logged-in X session detected for expected handle @${expectedHandle}.`);
  }

  const actualHandle = normalizeHandle(state.handle) ?? "unknown";
  return new Error(`Expected X handle @${expectedHandle}, but found @${actualHandle}.`);
}

export async function ensureXSession({
  adapter,
  expectedHandle,
  personaProfile = null,
  targetUrl = DEFAULT_X_URL,
  maxChecks = 3,
  waitMs = 250,
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");

  const normalizedExpectedHandle = normalizeHandle(expectedHandle);
  if (!normalizedExpectedHandle) {
    throw new TypeError("expectedHandle is required.");
  }

  if (personaProfile) {
    const result = await ensureChromePersonaWindow({
      adapter,
      persona: personaProfile.persona,
      profileDirectory: personaProfile.profileDirectory,
      expectedXHandle: normalizedExpectedHandle,
      targetUrl,
      maxChecks,
      waitMs,
    });

    return {
      ok: true,
      action: result.action,
      expectedHandle: normalizedExpectedHandle,
      actualHandle: result.actualXHandle,
      state: result.state,
      tab: result.tab,
      windowId: result.windowId ?? result.tab?.windowId ?? null,
      persona: result.persona,
      profileDirectory: result.profileDirectory,
    };
  }

  await adapter.ensureBrowserApp();

  let tab = null;
  let action = "opened-new-tab";

  try {
    tab = pickXTab(await adapter.listTabs());
  } catch {
    tab = null;
  }

  if (tab) {
    try {
      await adapter.activateTab(tab);
      action = "activated-existing-tab";
    } catch {
      tab = await adapter.openTab(targetUrl);
      action = "opened-new-tab";
    }
  } else {
    tab = await adapter.openTab(targetUrl);
  }

  let lastState = null;
  for (let attempt = 1; attempt <= maxChecks; attempt += 1) {
    lastState = parseProbeResult(await adapter.evaluateActiveTab(X_SESSION_PROBE_SCRIPT));
    if (lastState.loggedIn && normalizeHandle(lastState.handle) === normalizedExpectedHandle) {
      return {
        ok: true,
        action,
        expectedHandle: normalizedExpectedHandle,
        actualHandle: normalizeHandle(lastState.handle),
        state: lastState,
        tab,
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

  throw buildSessionError(normalizedExpectedHandle, lastState);
}

export {
  DEFAULT_X_URL,
  X_SESSION_PROBE_SCRIPT,
  normalizeHandle,
  parseProbeResult,
  pickXTab,
};
