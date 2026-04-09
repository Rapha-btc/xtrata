import { openVerifiedXTab } from "./openVerifiedXTab.js";

const STATUS_URL_PATTERN = /^https?:\/\/(www\.)?x\.com\/[^/?#]+\/status\/(\d+)(?:\/|$|\?)/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeString(value, fallback = "") {
  const normalized = value?.toString().replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

export function extractStatusIdFromUrl(url) {
  const matched = (url ?? "").match(STATUS_URL_PATTERN);
  return matched?.[2] ?? null;
}

export function normalizeReplyDraftText(replyText) {
  return replyText
    ?.toString()
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim() || "";
}

function textsMatch(expectedText, actualText) {
  return normalizeReplyDraftText(expectedText) === normalizeReplyDraftText(actualText);
}

export function buildXStatusUrl(tweetUrl) {
  if (!tweetUrl?.trim()) throw new TypeError("tweetUrl is required.");

  const statusId = extractStatusIdFromUrl(tweetUrl);
  if (!statusId) {
    throw new TypeError("tweetUrl must be an x.com status URL.");
  }

  const parsed = new URL(tweetUrl);
  const [, handle] = parsed.pathname.split("/");
  return `https://x.com/${handle}/status/${statusId}`;
}

export function matchesXStatusTab(tweetUrl) {
  const expectedStatusId = extractStatusIdFromUrl(tweetUrl);
  if (!expectedStatusId) throw new TypeError("tweetUrl must be an x.com status URL.");

  return (tab) => extractStatusIdFromUrl(tab?.url ?? "") === expectedStatusId;
}

export function buildXReplyComposerProbeScript() {
  return `(() => {
    const __xReplyComposerProbe = true;
    const normalizeText = (value) =>
      (value || "")
        .replace(/\\u00a0/g, " ")
        .replace(/\\r\\n/g, "\\n")
        .replace(/[ \\t]+\\n/g, "\\n")
        .replace(/\\n{3,}/g, "\\n\\n")
        .trim();
    const readComposer = () =>
      document.querySelector(
        '[role="dialog"] [data-testid="tweetTextarea_0"], [role="dialog"] [role="textbox"], [data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"]'
      );
    const composer = readComposer();
    const sendButton =
      document.querySelector('[role="dialog"] [data-testid="tweetButton"]') ||
      document.querySelector('[data-testid="tweetButton"]') ||
      document.querySelector('[data-testid="tweetButtonInline"]');
    const replyButtons = [...document.querySelectorAll('[data-testid="reply"]')];
    const composerText = normalizeText(
      composer?.innerText || composer?.textContent || composer?.value || ""
    ) || null;
    return JSON.stringify({
      url: window.location.href,
      title: document.title,
      composerFound: Boolean(composer),
      composerText,
      characterCount: composerText ? composerText.length : 0,
      dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
      replyButtonFound: replyButtons.length > 0,
      sendButtonFound: Boolean(sendButton),
      canSubmit: Boolean(
        sendButton &&
          !sendButton.disabled &&
          sendButton.getAttribute('aria-disabled') !== 'true'
      ),
    });
  })()`;
}

export function buildOpenReplyComposerScript() {
  return `(() => {
    const __xReplyComposerOpen = true;
    const normalizeText = (value) =>
      (value || "")
        .replace(/\\u00a0/g, " ")
        .replace(/\\r\\n/g, "\\n")
        .replace(/[ \\t]+\\n/g, "\\n")
        .replace(/\\n{3,}/g, "\\n\\n")
        .trim();
    const snapshot = () => {
      const composer =
        document.querySelector('[role="dialog"] [data-testid="tweetTextarea_0"]') ||
        document.querySelector('[role="dialog"] [role="textbox"]') ||
        document.querySelector('[data-testid="tweetTextarea_0"]') ||
        document.querySelector('[role="textbox"][contenteditable="true"]');
      const sendButton =
        document.querySelector('[role="dialog"] [data-testid="tweetButton"]') ||
        document.querySelector('[data-testid="tweetButton"]') ||
        document.querySelector('[data-testid="tweetButtonInline"]');
      const composerText = normalizeText(
        composer?.innerText || composer?.textContent || composer?.value || ""
      ) || null;
      return {
        url: window.location.href,
        title: document.title,
        composerFound: Boolean(composer),
        composerText,
        characterCount: composerText ? composerText.length : 0,
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        replyButtonFound: Boolean(document.querySelector('[data-testid="reply"]')),
        sendButtonFound: Boolean(sendButton),
        canSubmit: Boolean(
          sendButton &&
            !sendButton.disabled &&
            sendButton.getAttribute('aria-disabled') !== 'true'
        ),
      };
    };
    const currentState = snapshot();
    if (currentState.composerFound) {
      return JSON.stringify({
        ok: true,
        action: 'already-open',
        retryable: false,
        ...currentState,
      });
    }
    const replyButton = [...document.querySelectorAll('[data-testid="reply"]')].find((node) => {
      const rect = node.getBoundingClientRect?.();
      return rect ? rect.width > 0 && rect.height > 0 : true;
    });
    if (!replyButton) {
      return JSON.stringify({
        ok: false,
        action: 'not-opened',
        reason: 'reply-button-not-found',
        retryable: true,
        ...currentState,
      });
    }
    replyButton.click();
    return JSON.stringify({
      ok: true,
      action: 'clicked-reply',
      retryable: true,
      ...snapshot(),
    });
  })()`;
}

export function buildFillReplyComposerScript(replyText) {
  return `(() => {
    const __xReplyComposerFill = true;
    const desiredText = ${JSON.stringify(normalizeReplyDraftText(replyText))};
    const normalizeText = (value) =>
      (value || "")
        .replace(/\\u00a0/g, " ")
        .replace(/\\r\\n/g, "\\n")
        .replace(/[ \\t]+\\n/g, "\\n")
        .replace(/\\n{3,}/g, "\\n\\n")
        .trim();
    const readComposer = () =>
      document.querySelector(
        '[role="dialog"] [data-testid="tweetTextarea_0"], [role="dialog"] [role="textbox"], [data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"]'
      );
    const readState = (extra = {}) => {
      const composer = readComposer();
      const sendButton =
        document.querySelector('[role="dialog"] [data-testid="tweetButton"]') ||
        document.querySelector('[data-testid="tweetButton"]') ||
        document.querySelector('[data-testid="tweetButtonInline"]');
      const composerText = normalizeText(
        composer?.innerText || composer?.textContent || composer?.value || ""
      ) || null;
      return {
        url: window.location.href,
        title: document.title,
        composerFound: Boolean(composer),
        composerText,
        characterCount: composerText ? composerText.length : 0,
        sendButtonFound: Boolean(sendButton),
        canSubmit: Boolean(
          sendButton &&
            !sendButton.disabled &&
            sendButton.getAttribute('aria-disabled') !== 'true'
        ),
        ...extra,
      };
    };
    const dispatchInput = (target, inputType = 'insertText') => {
      try {
        target.dispatchEvent(
          new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            data: desiredText,
            inputType,
          })
        );
      } catch {}
      try {
        target.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            data: desiredText,
            inputType,
          })
        );
      } catch {
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }
      target.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const composer = readComposer();
    if (!composer) {
      return JSON.stringify(
        readState({
          ok: false,
          reason: 'composer-not-found',
          retryable: true,
        })
      );
    }
    const assignPlainValue = (element, value) => {
      if ('value' in element) {
        const prototype = Object.getPrototypeOf(element);
        const descriptor =
          Object.getOwnPropertyDescriptor(prototype, 'value') ||
          Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement?.prototype ?? {}, 'value') ||
          Object.getOwnPropertyDescriptor(window.HTMLInputElement?.prototype ?? {}, 'value');
        if (descriptor?.set) {
          descriptor.set.call(element, value);
        } else {
          element.value = value;
        }
      }
    };
    const fillContentEditable = (element, value) => {
      const selection = window.getSelection?.();
      const range = document.createRange?.();
      if (!selection || !range) {
        element.textContent = value;
        return 'textContent-fallback';
      }

      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);

      let inserted = false;
      if (typeof document.execCommand === 'function') {
        try {
          document.execCommand('selectAll', false);
          inserted = Boolean(document.execCommand('insertText', false, value));
        } catch {
          inserted = false;
        }
      }

      if (!inserted) {
        range.deleteContents();
        range.insertNode(document.createTextNode(value));
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        return 'range-insert';
      }

      selection.removeAllRanges();
      return 'execCommand-insertText';
    };

    composer.focus();
    const fillMode =
      composer.isContentEditable && !('value' in composer)
        ? fillContentEditable(composer, desiredText)
        : (assignPlainValue(composer, desiredText), 'value-setter');
    dispatchInput(composer);
    composer.focus();
    return JSON.stringify(
      readState({
        ok: true,
        reason: null,
        retryable: false,
        fillMode,
      })
    );
  })()`;
}

export function buildObserveReplySendScript({ replyText, tweetUrl = null, expectedHandle = null } = {}) {
  const normalizedReplyText = normalizeReplyDraftText(replyText);
  const normalizedExpectedHandle = normalizeString(expectedHandle, "");
  const expectedStatusId = extractStatusIdFromUrl(tweetUrl);

  return `(() => {
    const __xReplyComposerObserveSend = true;
    const desiredText = ${JSON.stringify(normalizedReplyText)};
    const expectedHandle = ${JSON.stringify(normalizedExpectedHandle)};
    const expectedStatusId = ${JSON.stringify(expectedStatusId)};
    const normalizeText = (value) =>
      (value || "")
        .replace(/\\u00a0/g, " ")
        .replace(/\\r\\n/g, "\\n")
        .replace(/[ \\t]+\\n/g, "\\n")
        .replace(/\\n{3,}/g, "\\n\\n")
        .replace(/\\s+/g, " ")
        .trim();
    const normalizeHandle = (value) => {
      const normalized = normalizeText(value).toLowerCase();
      if (!normalized) return "";
      return normalized.startsWith('@') ? normalized : '@' + normalized;
    };
    const extractStatusId = (value) => {
      const matched = (value || "").match(/^https?:\\/\\/(?:www\\.)?x\\.com\\/[^/?#]+\\/status\\/(\\d+)(?:\\/|$|\\?)/i);
      return matched ? matched[1] : null;
    };
    const readComposer = () =>
      document.querySelector(
        '[role="dialog"] [data-testid="tweetTextarea_0"], [role="dialog"] [role="textbox"], [data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"]'
      );
    const sendButton =
      document.querySelector('[role="dialog"] [data-testid="tweetButton"]') ||
      document.querySelector('[data-testid="tweetButton"]') ||
      document.querySelector('[data-testid="tweetButtonInline"]');
    const composer = readComposer();
    const composerText = normalizeText(
      composer?.innerText || composer?.textContent || composer?.value || ""
    ) || null;
    const expectedHandleNeedle = normalizeHandle(expectedHandle);
    let matchingReplyText = null;
    let matchingReplyArticleHasExpectedHandle = false;
    let matchingReplyUrl = null;

    for (const article of document.querySelectorAll('article')) {
      const articleText = normalizeText(article.innerText || article.textContent || "");
      const tweetTextNode = [...article.querySelectorAll('[data-testid="tweetText"]')].find(
        (node) => normalizeText(node.innerText || node.textContent || "") === desiredText
      );
      if (!tweetTextNode) continue;

      const articleHasExpectedHandle =
        !expectedHandleNeedle || articleText.toLowerCase().includes(expectedHandleNeedle);
      if (!articleHasExpectedHandle) {
        continue;
      }

      matchingReplyText = normalizeText(tweetTextNode.innerText || tweetTextNode.textContent || "");
      matchingReplyArticleHasExpectedHandle = articleHasExpectedHandle;
      matchingReplyUrl =
        article.querySelector('a[href*="/status/"]')?.href ||
        article.querySelector('time')?.closest('a[href]')?.href ||
        null;
      break;
    }

    return JSON.stringify({
      url: window.location.href,
      title: document.title,
      onTargetThreadPage: !expectedStatusId || extractStatusId(window.location.href) === expectedStatusId,
      composerFound: Boolean(composer),
      dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
      composerText,
      characterCount: composerText ? composerText.length : 0,
      sendButtonFound: Boolean(sendButton),
      canSubmit: Boolean(
        sendButton &&
          !sendButton.disabled &&
          sendButton.getAttribute('aria-disabled') !== 'true'
      ),
      matchingReplyVisible: Boolean(matchingReplyText),
      matchingReplyText,
      matchingReplyUrl,
      matchingReplyArticleHasExpectedHandle,
    });
  })()`;
}

export function parseXReplyComposerProbeResult(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) {
    return {
      url: null,
      title: "",
      composerFound: false,
      composerText: null,
      characterCount: 0,
      dialogOpen: false,
      replyButtonFound: false,
      sendButtonFound: false,
      canSubmit: false,
    };
  }

  return JSON.parse(raw);
}

export function parseXReplyComposerActionResult(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) {
    return {
      ok: false,
      reason: "empty-action-result",
      retryable: true,
      composerFound: false,
      composerText: null,
      characterCount: 0,
      sendButtonFound: false,
      canSubmit: false,
    };
  }

  return JSON.parse(raw);
}

export function parseXReplySendObservationResult(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) {
    return {
      url: null,
      title: "",
      onTargetThreadPage: false,
      composerFound: false,
      dialogOpen: false,
      composerText: null,
      characterCount: 0,
      sendButtonFound: false,
      canSubmit: false,
      matchingReplyVisible: false,
      matchingReplyText: null,
      matchingReplyUrl: null,
      matchingReplyArticleHasExpectedHandle: false,
    };
  }

  return JSON.parse(raw);
}

function buildOpenComposerError(state) {
  const reason = state?.reason ?? "reply-composer-not-opened";
  return new Error(`X reply composer could not be opened: ${reason}.`);
}

function buildFillComposerError(state) {
  const reason = state?.reason ?? "reply-composer-fill-failed";
  return new Error(`X reply composer could not be filled: ${reason}.`);
}

export async function readReplyComposerState({ adapter } = {}) {
  if (!adapter) throw new TypeError("adapter is required.");
  return parseXReplyComposerProbeResult(await adapter.evaluateActiveTab(buildXReplyComposerProbeScript()));
}

export async function openReplyComposer({
  adapter,
  tweetUrl,
  expectedHandle = null,
  personaProfile = null,
  maxChecks = 5,
  waitMs = 750,
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");

  const targetUrl = buildXStatusUrl(tweetUrl);
  const navigation = await openVerifiedXTab({
    adapter,
    expectedHandle,
    personaProfile,
    targetUrl,
    matchTab: matchesXStatusTab(targetUrl),
  });

  let lastState = null;
  let lastAction = null;
  for (let attempt = 1; attempt <= maxChecks; attempt += 1) {
    lastState = await readReplyComposerState({ adapter });
    if (lastState.composerFound) {
      return {
        ok: true,
        tweetUrl: targetUrl,
        navigation,
        action: lastAction?.action ?? "already-open",
        state: lastState,
      };
    }

    lastAction = parseXReplyComposerActionResult(
      await adapter.evaluateActiveTab(buildOpenReplyComposerScript())
    );
    if (lastAction.composerFound) {
      return {
        ok: true,
        tweetUrl: targetUrl,
        navigation,
        action: lastAction.action ?? "clicked-reply",
        state: lastAction,
      };
    }

    if (!lastAction.ok && !lastAction.retryable) {
      throw buildOpenComposerError(lastAction);
    }

    if (attempt < maxChecks) {
      if (typeof adapter.wait === "function") {
        await adapter.wait(waitMs);
      } else {
        await sleep(waitMs);
      }
    }
  }

  throw buildOpenComposerError(lastAction ?? lastState);
}

export async function fillReplyComposer({
  adapter,
  replyText,
  maxChecks = 3,
  waitMs = 250,
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");

  const normalizedReplyText = normalizeReplyDraftText(replyText);
  if (!normalizedReplyText) {
    throw new TypeError("replyText is required.");
  }

  let lastState = null;
  const fillScript = buildFillReplyComposerScript(normalizedReplyText);

  for (let attempt = 1; attempt <= maxChecks; attempt += 1) {
    lastState = parseXReplyComposerActionResult(await adapter.evaluateActiveTab(fillScript));
    const textMatches = textsMatch(normalizedReplyText, lastState?.composerText ?? "");
    if (lastState.ok && textMatches && lastState?.canSubmit) {
      return {
        ok: true,
        replyText: normalizedReplyText,
        textMatches,
        state: {
          ...lastState,
          composerText: normalizeReplyDraftText(lastState?.composerText ?? ""),
        },
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

  if (lastState?.ok && textsMatch(normalizedReplyText, lastState?.composerText ?? "") && !lastState?.canSubmit) {
    lastState = {
      ...lastState,
      ok: false,
      reason: "reply-submit-disabled",
      retryable: true,
    };
  }

  throw buildFillComposerError(lastState);
}

export async function waitForManualReplySend({
  adapter,
  replyText,
  tweetUrl = null,
  expectedHandle = null,
  maxChecks = 180,
  waitMs = 1000,
  closeGraceChecks = 3,
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");

  const normalizedReplyText = normalizeReplyDraftText(replyText);
  if (!normalizedReplyText) {
    throw new TypeError("replyText is required.");
  }
  let lastState = null;
  let closedWithoutReplyChecks = 0;

  for (let attempt = 1; attempt <= maxChecks; attempt += 1) {
    lastState = await readReplySendObservationState({
      adapter,
      replyText: normalizedReplyText,
      tweetUrl,
      expectedHandle,
    });
    if (!lastState.dialogOpen && lastState.matchingReplyVisible) {
      return {
        ok: true,
        status: "sent",
        replyText: normalizedReplyText,
        attempts: attempt,
        state: lastState,
      };
    }

    if (!lastState.dialogOpen && !lastState.matchingReplyVisible) {
      if (lastState.onTargetThreadPage === false) {
        return {
          ok: false,
          status: "manual-action-not-confirmed",
          replyText: normalizedReplyText,
          attempts: attempt,
          state: lastState,
        };
      }

      closedWithoutReplyChecks += 1;
      if (closedWithoutReplyChecks < Math.max(1, closeGraceChecks)) {
        if (attempt < maxChecks) {
          if (typeof adapter.wait === "function") {
            await adapter.wait(waitMs);
          } else {
            await sleep(waitMs);
          }
          continue;
        }
      }

      return {
        ok: false,
        status: "declined-by-operator",
        replyText: normalizedReplyText,
        attempts: attempt,
        state: lastState,
      };
    }

    closedWithoutReplyChecks = 0;

    if (attempt < maxChecks) {
      if (typeof adapter.wait === "function") {
        await adapter.wait(waitMs);
      } else {
        await sleep(waitMs);
      }
    }
  }

  return {
    ok: false,
    status: lastState?.composerFound || lastState?.dialogOpen ? "timed-out-waiting-for-operator" : "manual-action-not-confirmed",
    replyText: normalizedReplyText,
    attempts: maxChecks,
    state: lastState,
  };
}

export async function readReplySendObservationState({
  adapter,
  replyText,
  tweetUrl = null,
  expectedHandle = null,
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");

  const normalizedReplyText = normalizeReplyDraftText(replyText);
  if (!normalizedReplyText) {
    throw new TypeError("replyText is required.");
  }

  const observationScript = buildObserveReplySendScript({
    replyText: normalizedReplyText,
    tweetUrl,
    expectedHandle,
  });

  return parseXReplySendObservationResult(await adapter.evaluateActiveTab(observationScript));
}

export async function prepareReplyComposer({
  adapter,
  tweetUrl,
  replyText,
  expectedHandle = null,
  personaProfile = null,
  openMaxChecks = 5,
  openWaitMs = 750,
  fillMaxChecks = 3,
  fillWaitMs = 250,
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");

  const opened = await openReplyComposer({
    adapter,
    tweetUrl,
    expectedHandle,
    personaProfile,
    maxChecks: openMaxChecks,
    waitMs: openWaitMs,
  });
  const filled = await fillReplyComposer({
    adapter,
    replyText,
    maxChecks: fillMaxChecks,
    waitMs: fillWaitMs,
  });
  const state = await readReplyComposerState({ adapter });
  const normalizedExpectedText = normalizeReplyDraftText(replyText);
  const normalizedComposerText = normalizeReplyDraftText(state?.composerText ?? "");
  const textMatches = textsMatch(normalizedExpectedText, normalizedComposerText);
  if (!textMatches || !state?.canSubmit) {
    throw buildFillComposerError({
      ...state,
      reason: !textMatches ? "reply-text-mismatch" : "reply-submit-disabled",
      retryable: true,
    });
  }

  return {
    ok: true,
    tweetUrl: opened.tweetUrl,
    navigation: opened.navigation,
    opened,
    filled,
    textMatches,
    expectedText: normalizedExpectedText,
    state: {
      ...state,
      composerText: normalizedComposerText,
    },
  };
}
