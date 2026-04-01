import {
  CHATGPT_SESSION_PROBE_SCRIPT,
  ensureChatGPTSession,
  normalizeAccountHint,
  parseProbeResult as parseSessionProbeResult,
} from "../session/ensureChatGPTSession.js";

export const CHATGPT_REPLY_PROBE_SCRIPT = `(() => {
  const normalizeText = (value) =>
    (value || "")
      .replace(/\\u00a0/g, " ")
      .replace(/\\r\\n/g, "\\n")
      .replace(/[ \\t]+\\n/g, "\\n")
      .replace(/\\n{3,}/g, "\\n\\n")
      .trim();
  const replyNodes = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
  const replies = replyNodes
    .map((node) => normalizeText(node.innerText || node.textContent || ""))
    .filter(Boolean);
  const buttonLabels = [...document.querySelectorAll("button")]
    .map((button) =>
      normalizeText(
        button.getAttribute("aria-label") ||
          button.getAttribute("title") ||
          button.getAttribute("data-testid") ||
          button.textContent ||
          ""
      )
    )
    .filter(Boolean);
  const generating =
    buttonLabels.some((value) => /^(stop generating|stop streaming|stop response)$/i.test(value)) ||
    Boolean(
      document.querySelector(
        'button[aria-label*="Stop" i], button[title*="Stop" i], button[data-testid*="stop"]'
      )
    );

  return JSON.stringify({
    url: window.location.href,
    title: document.title,
    replyCount: replies.length,
    replyText: replies.at(-1) || null,
    generating,
  });
})()`;

export function buildChatGPTSubmitPromptScript(prompt) {
  return `(() => {
    const promptText = ${JSON.stringify(prompt)};
    const normalizeText = (value) => (value || "").replace(/\\s+/g, " ").trim();
    const composer =
      document.querySelector("#prompt-textarea") ||
      document.querySelector("textarea") ||
      document.querySelector('[contenteditable="true"]');

    if (!composer) {
      return JSON.stringify({
        ok: false,
        reason: "composer-not-found",
        retryable: true,
        url: window.location.href,
        title: document.title,
      });
    }

    const assignValue = (element, value) => {
      if ("value" in element) {
        const prototype = Object.getPrototypeOf(element);
        const descriptor =
          Object.getOwnPropertyDescriptor(prototype, "value") ||
          Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement?.prototype ?? {}, "value") ||
          Object.getOwnPropertyDescriptor(window.HTMLInputElement?.prototype ?? {}, "value");
        if (descriptor?.set) {
          descriptor.set.call(element, value);
        } else {
          element.value = value;
        }
      } else {
        element.textContent = value;
      }
    };

    composer.focus();
    assignValue(composer, promptText);
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    composer.dispatchEvent(new Event("change", { bubbles: true }));

    const sendButton = [...document.querySelectorAll("button")].find((button) => {
      const label = normalizeText(
        button.getAttribute("aria-label") ||
          button.getAttribute("title") ||
          button.getAttribute("data-testid") ||
          button.textContent ||
          ""
      );

      return /send/i.test(label) && !/(voice|microphone|search)/i.test(label);
    });

    if (!sendButton) {
      return JSON.stringify({
        ok: false,
        reason: "send-button-not-found",
        retryable: true,
        composerTag: composer.tagName,
        url: window.location.href,
        title: document.title,
      });
    }

    if (sendButton.disabled || sendButton.getAttribute("aria-disabled") === "true") {
      return JSON.stringify({
        ok: false,
        reason: "send-button-not-ready",
        retryable: true,
        composerTag: composer.tagName,
        url: window.location.href,
        title: document.title,
      });
    }

    sendButton.click();

    return JSON.stringify({
      ok: true,
      retryable: false,
      composerTag: composer.tagName,
      submittedPromptLength: promptText.length,
      url: window.location.href,
      title: document.title,
    });
  })()`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeReplyText(value) {
  return value
    ?.replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim() || null;
}

export function parseSubmitResult(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, reason: "empty-submit-result", retryable: true };
  }

  return JSON.parse(raw);
}

export function parseReplyProbeResult(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) {
    return { replyCount: 0, replyText: null, generating: false };
  }

  return JSON.parse(raw);
}

export function isNewReply(baselineState, currentState) {
  const baselineCount = baselineState?.replyCount ?? 0;
  const currentCount = currentState?.replyCount ?? 0;
  if (currentCount > baselineCount) return true;

  const baselineReplyText = normalizeReplyText(baselineState?.replyText);
  const currentReplyText = normalizeReplyText(currentState?.replyText);
  return Boolean(currentReplyText) && currentReplyText !== baselineReplyText;
}

function buildSubmitError(state) {
  const reason = state?.reason ?? "unknown-submit-error";
  return new Error(`ChatGPT prompt submission failed: ${reason}.`);
}

function buildReplyTimeoutError(state) {
  const reason = state?.generating
    ? "ChatGPT was still generating when the wait budget expired."
    : "No new ChatGPT reply was detected before the wait budget expired.";

  return new Error(reason);
}

function matchesExpectedAccountHint(expectedAccountHint, state) {
  const normalizedExpected = normalizeAccountHint(expectedAccountHint);
  if (!normalizedExpected) return true;

  return Boolean(
    state?.accountHints?.some((value) => normalizeAccountHint(value) === normalizedExpected)
  );
}

async function resolveChatGPTSession({
  adapter,
  expectedAccountHint,
  personaProfile,
  targetUrl,
  sessionMaxChecks,
  sessionWaitMs,
  existingSession = null,
} = {}) {
  const reusableTab = existingSession?.tab;
  if (reusableTab?.windowId && reusableTab?.tabIndex) {
    try {
      await adapter.activateTab(reusableTab);
      const state = parseSessionProbeResult(await adapter.evaluateActiveTab(CHATGPT_SESSION_PROBE_SCRIPT));
      if (state.loggedIn && matchesExpectedAccountHint(expectedAccountHint, state)) {
        return {
          ...existingSession,
          action: "continued-existing-session-tab",
          state,
          tab: reusableTab,
          windowId: reusableTab.windowId ?? existingSession?.windowId ?? null,
        };
      }
    } catch {
      // Fall back to the normal session resolver.
    }
  }

  return ensureChatGPTSession({
    adapter,
    expectedAccountHint,
    personaProfile,
    targetUrl,
    maxChecks: sessionMaxChecks,
    waitMs: sessionWaitMs,
  });
}

export async function sendPromptAndReadReply({
  adapter,
  prompt,
  expectedAccountHint = null,
  personaProfile = null,
  targetUrl,
  existingSession = null,
  sessionMaxChecks = 5,
  sessionWaitMs = 500,
  submitMaxChecks = 3,
  submitWaitMs = 500,
  replyMaxChecks = 60,
  replyWaitMs = 1000,
  stableChecks = 2,
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");
  if (!prompt?.trim()) throw new TypeError("prompt is required.");

  const normalizedStableChecks = Math.max(1, stableChecks);
  const session = await resolveChatGPTSession({
    adapter,
    expectedAccountHint,
    personaProfile,
    targetUrl,
    existingSession,
    sessionMaxChecks,
    sessionWaitMs,
  });

  const baselineState = parseReplyProbeResult(await adapter.evaluateActiveTab(CHATGPT_REPLY_PROBE_SCRIPT));

  let submitState = null;
  const submitScript = buildChatGPTSubmitPromptScript(prompt);
  for (let attempt = 1; attempt <= submitMaxChecks; attempt += 1) {
    submitState = parseSubmitResult(await adapter.evaluateActiveTab(submitScript));
    if (submitState.ok) break;

    if (attempt < submitMaxChecks) {
      if (typeof adapter.wait === "function") {
        await adapter.wait(submitWaitMs);
      } else {
        await sleep(submitWaitMs);
      }
    }
  }

  if (!submitState?.ok) {
    throw buildSubmitError(submitState);
  }

  let lastReplyState = baselineState;
  let lastReplyText = null;
  let stableCount = 0;

  for (let attempt = 1; attempt <= replyMaxChecks; attempt += 1) {
    lastReplyState = parseReplyProbeResult(await adapter.evaluateActiveTab(CHATGPT_REPLY_PROBE_SCRIPT));
    const hasNewReply = isNewReply(baselineState, lastReplyState);
    const currentReplyText = normalizeReplyText(lastReplyState.replyText);

    if (hasNewReply && currentReplyText) {
      if (!lastReplyState.generating) {
        stableCount = currentReplyText === lastReplyText ? stableCount + 1 : 1;
        lastReplyText = currentReplyText;
        if (stableCount >= normalizedStableChecks) {
          return {
            ok: true,
            session,
            submit: submitState,
            prompt,
            replyText: currentReplyText,
            replyState: lastReplyState,
          };
        }
      } else {
        lastReplyText = currentReplyText;
        stableCount = 0;
      }
    }

    if (attempt < replyMaxChecks) {
      if (typeof adapter.wait === "function") {
        await adapter.wait(replyWaitMs);
      } else {
        await sleep(replyWaitMs);
      }
    }
  }

  throw buildReplyTimeoutError(lastReplyState);
}
