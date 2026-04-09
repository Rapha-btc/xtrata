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
  const readComposerText = (element) =>
    normalizeText(
      !element
        ? ""
        : "value" in element
          ? element.value
          : element.innerText || element.textContent || ""
    );
  const isVisible = (element) => Boolean(element && element.getClientRects().length > 0);
  const readButtonLabel = (button) =>
    normalizeText(
      button?.getAttribute("aria-label") ||
        button?.getAttribute("title") ||
        button?.getAttribute("data-testid") ||
        button?.textContent ||
        ""
    );
  const composer =
    document.querySelector("#prompt-textarea") ||
    document.querySelector("textarea") ||
    document.querySelector('[contenteditable="true"]');
  const composerText = readComposerText(composer);
  const composerForm = composer?.closest("form") || null;
  const candidateButtons = [
    ...(composerForm ? [...composerForm.querySelectorAll("button")] : []),
    ...document.querySelectorAll("button"),
  ];
  const sendButton =
    candidateButtons.find((button) => {
      const label = readButtonLabel(button);
      return isVisible(button) && /send/i.test(label) && !/(voice|microphone|search)/i.test(label);
    }) || null;
  const replyNodes = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
  const replies = replyNodes
    .map((node) => normalizeText(node.innerText || node.textContent || ""))
    .filter(Boolean);
  const buttonLabels = [...document.querySelectorAll("button")]
    .map((button) => readButtonLabel(button))
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
    composerFound: Boolean(composer),
    composerTextLength: composerText.length,
    sendButtonFound: Boolean(sendButton),
    sendButtonLabel: readButtonLabel(sendButton),
    sendButtonReady: Boolean(
      sendButton &&
        !sendButton.disabled &&
        sendButton.getAttribute("aria-disabled") !== "true"
    ),
  });
})()`;

export function buildChatGPTSubmitPromptScript(prompt) {
  return `(() => {
    const promptText = ${JSON.stringify(prompt)};
    const normalizeText = (value) => (value || "").replace(/\\s+/g, " ").trim();
    const isVisible = (element) => Boolean(element && element.getClientRects().length > 0);
    const readButtonLabel = (button) =>
      normalizeText(
        button?.getAttribute("aria-label") ||
          button?.getAttribute("title") ||
          button?.getAttribute("data-testid") ||
          button?.textContent ||
          ""
      );
    const readComposerText = (element) =>
      normalizeText(
        !element
          ? ""
          : "value" in element
            ? element.value
            : element.innerText || element.textContent || ""
      );
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
    const composerText = readComposerText(composer);

    if (!composerText) {
      return JSON.stringify({
        ok: false,
        reason: "composer-fill-failed",
        retryable: true,
        composerTag: composer.tagName,
        url: window.location.href,
        title: document.title,
      });
    }

    const composerForm = composer.closest("form");
    const sendButton =
      [
        ...(composerForm ? [...composerForm.querySelectorAll("button")] : []),
        ...document.querySelectorAll("button"),
      ].find((button) => {
        const label = readButtonLabel(button);
        return isVisible(button) && /send/i.test(label) && !/(voice|microphone|search)/i.test(label);
      }) || null;
    const sendButtonLabel = readButtonLabel(sendButton);

    if (!sendButton) {
      return JSON.stringify({
        ok: false,
        reason: "send-button-not-found",
        retryable: true,
        composerTag: composer.tagName,
        composerTextLength: composerText.length,
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
        composerTextLength: composerText.length,
        sendButtonLabel,
        url: window.location.href,
        title: document.title,
      });
    }

    sendButton.click();

    return JSON.stringify({
      ok: true,
      retryable: false,
      composerTag: composer.tagName,
      composerTextLength: composerText.length,
      sendButtonLabel,
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
    return {
      replyCount: 0,
      replyText: null,
      generating: false,
      composerFound: false,
      composerTextLength: 0,
      sendButtonFound: false,
      sendButtonLabel: null,
      sendButtonReady: false,
    };
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

function detectSubmitConfirmationReason({
  baselineState,
  submitState,
  currentState,
} = {}) {
  if (currentState?.generating) return "generating";
  if (isNewReply(baselineState, currentState)) return "new-reply";

  const submittedComposerLength = Number.isFinite(submitState?.composerTextLength)
    ? Math.max(0, Math.round(submitState.composerTextLength))
    : 0;
  const currentComposerLength = Number.isFinite(currentState?.composerTextLength)
    ? Math.max(0, Math.round(currentState.composerTextLength))
    : 0;

  if (submittedComposerLength > 0 && currentComposerLength === 0) {
    return "composer-cleared";
  }

  return null;
}

function buildReplyTimeoutError(
  state,
  {
    replyMaxChecks = null,
    replyWaitMs = null,
  } = {}
) {
  const budgetMs =
    Number.isFinite(replyMaxChecks) && Number.isFinite(replyWaitMs)
      ? Math.max(0, Math.round(replyMaxChecks * replyWaitMs))
      : null;
  const suffix = budgetMs === null ? "." : ` after waiting ${budgetMs} ms.`;
  const reason = state?.generating
    ? `ChatGPT was still generating when the wait budget expired${suffix}`
    : `No new ChatGPT reply was detected before the wait budget expired${suffix}`;

  return new Error(reason);
}

function matchesExpectedAccountHint(expectedAccountHint, state) {
  const normalizedExpected = normalizeAccountHint(expectedAccountHint);
  if (!normalizedExpected) return true;

  return Boolean(
    state?.accountHints?.some((value) => normalizeAccountHint(value) === normalizedExpected)
  );
}

async function emitProgress(onProgress, event) {
  if (typeof onProgress !== "function") return;

  try {
    await onProgress(event);
  } catch {
    // Progress logging must never break the prompt flow.
  }
}

async function waitForSubmitConfirmation({
  adapter,
  baselineState,
  submitState,
  submitConfirmMaxChecks,
  submitConfirmWaitMs,
} = {}) {
  let lastState = baselineState;

  for (let attempt = 1; attempt <= submitConfirmMaxChecks; attempt += 1) {
    lastState = parseReplyProbeResult(await adapter.evaluateActiveTab(CHATGPT_REPLY_PROBE_SCRIPT));
    const reason = detectSubmitConfirmationReason({
      baselineState,
      submitState,
      currentState: lastState,
    });

    if (reason) {
      return {
        ok: true,
        reason,
        state: lastState,
        checks: attempt,
      };
    }

    if (attempt < submitConfirmMaxChecks) {
      if (typeof adapter.wait === "function") {
        await adapter.wait(submitConfirmWaitMs);
      } else {
        await sleep(submitConfirmWaitMs);
      }
    }
  }

  return {
    ok: false,
    reason: "submit-not-confirmed",
    state: lastState,
    checks: submitConfirmMaxChecks,
  };
}

async function resolveChatGPTSession({
  adapter,
  expectedAccountHint,
  personaProfile,
  targetUrl,
  forceNewTab = false,
  sessionMaxChecks,
  sessionWaitMs,
  existingSession = null,
} = {}) {
  if (forceNewTab) {
    return ensureChatGPTSession({
      adapter,
      expectedAccountHint,
      personaProfile,
      targetUrl,
      forceNewTab: true,
      maxChecks: sessionMaxChecks,
      waitMs: sessionWaitMs,
    });
  }

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
  forceNewTab = false,
  existingSession = null,
  sessionMaxChecks = 5,
  sessionWaitMs = 500,
  submitMaxChecks = 3,
  submitWaitMs = 500,
  submitConfirmMaxChecks = 8,
  submitConfirmWaitMs = 500,
  replyMaxChecks = 60,
  replyWaitMs = 1000,
  stableChecks = 2,
  onProgress = null,
  progressLabel = null,
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");
  if (!prompt?.trim()) throw new TypeError("prompt is required.");

  const normalizedStableChecks = Math.max(1, stableChecks);
  const session = await resolveChatGPTSession({
    adapter,
    expectedAccountHint,
    personaProfile,
    targetUrl,
    forceNewTab,
    existingSession,
    sessionMaxChecks,
    sessionWaitMs,
  });
  await emitProgress(onProgress, {
    stage: "chatgpt-session",
    action: "ready",
    label: progressLabel,
    details: {
      sessionAction: session?.action ?? null,
      url: session?.state?.url ?? session?.tab?.url ?? null,
    },
  });

  const baselineState = parseReplyProbeResult(await adapter.evaluateActiveTab(CHATGPT_REPLY_PROBE_SCRIPT));

  let submitState = null;
  let confirmedReplyState = null;
  const submitScript = buildChatGPTSubmitPromptScript(prompt);
  for (let attempt = 1; attempt <= submitMaxChecks; attempt += 1) {
    await emitProgress(onProgress, {
      stage: "chatgpt-submit",
      action: "attempt",
      label: progressLabel,
      details: {
        attempt,
        maxAttempts: submitMaxChecks,
        promptLength: prompt.length,
      },
    });
    submitState = parseSubmitResult(await adapter.evaluateActiveTab(submitScript));
    if (submitState.ok) {
      const confirmation = await waitForSubmitConfirmation({
        adapter,
        baselineState,
        submitState,
        submitConfirmMaxChecks,
        submitConfirmWaitMs,
      });

      if (confirmation.ok) {
        confirmedReplyState = confirmation.state;
        await emitProgress(onProgress, {
          stage: "chatgpt-submit",
          action: "confirmed",
          label: progressLabel,
          details: {
            attempt,
            confirmationReason: confirmation.reason,
            confirmationChecks: confirmation.checks,
            sendButtonLabel: submitState?.sendButtonLabel ?? null,
            url: confirmation.state?.url ?? submitState?.url ?? null,
          },
        });
        break;
      }

      submitState = {
        ...submitState,
        ok: false,
        reason: confirmation.reason,
        replyState: confirmation.state,
      };
    }

    await emitProgress(onProgress, {
      stage: "chatgpt-submit",
      action: attempt < submitMaxChecks ? "retry" : "failed",
      label: progressLabel,
      details: {
        attempt,
        maxAttempts: submitMaxChecks,
        reason: submitState?.reason ?? "unknown-submit-error",
        sendButtonLabel: submitState?.sendButtonLabel ?? null,
        url: submitState?.replyState?.url ?? submitState?.url ?? null,
      },
    });

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

  const heartbeatEveryChecks = Math.max(1, Math.ceil(30_000 / Math.max(1, replyWaitMs)));
  let lastReplyState = confirmedReplyState ?? baselineState;
  let lastReplyText = null;
  let stableCount = 0;

  for (let attempt = 1; attempt <= replyMaxChecks; attempt += 1) {
    if (attempt > 1 || !confirmedReplyState) {
      lastReplyState = parseReplyProbeResult(await adapter.evaluateActiveTab(CHATGPT_REPLY_PROBE_SCRIPT));
    }
    const hasNewReply = isNewReply(baselineState, lastReplyState);
    const currentReplyText = normalizeReplyText(lastReplyState.replyText);

    if (attempt === 1 || attempt % heartbeatEveryChecks === 0) {
      await emitProgress(onProgress, {
        stage: "chatgpt-reply",
        action: "waiting",
        label: progressLabel,
        details: {
          attempt,
          maxChecks: replyMaxChecks,
          elapsedMs: Math.max(0, (attempt - 1) * replyWaitMs),
          generating: lastReplyState?.generating ?? false,
          replyCount: lastReplyState?.replyCount ?? 0,
          url: lastReplyState?.url ?? null,
        },
      });
    }

    if (hasNewReply && currentReplyText) {
      if (!lastReplyState.generating) {
        stableCount = currentReplyText === lastReplyText ? stableCount + 1 : 1;
        lastReplyText = currentReplyText;
        if (stableCount >= normalizedStableChecks) {
          await emitProgress(onProgress, {
            stage: "chatgpt-reply",
            action: "complete",
            label: progressLabel,
            details: {
              checks: attempt,
              replyLength: currentReplyText.length,
              url: lastReplyState?.url ?? null,
            },
          });
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

  await emitProgress(onProgress, {
    stage: "chatgpt-reply",
    action: "timeout",
    label: progressLabel,
    details: {
      maxChecks: replyMaxChecks,
      budgetMs: Math.max(0, Math.round(replyMaxChecks * replyWaitMs)),
      generating: lastReplyState?.generating ?? false,
      replyCount: lastReplyState?.replyCount ?? 0,
      url: lastReplyState?.url ?? null,
    },
  });
  throw buildReplyTimeoutError(lastReplyState, {
    replyMaxChecks,
    replyWaitMs,
  });
}
