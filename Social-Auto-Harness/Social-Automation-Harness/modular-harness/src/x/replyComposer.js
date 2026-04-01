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
    const assignValue = (element, value) => {
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
      } else {
        element.textContent = value;
      }
    };
    composer.focus();
    assignValue(composer, desiredText);
    composer.dispatchEvent(new InputEvent('input', { bubbles: true, data: desiredText, inputType: 'insertText' }));
    composer.dispatchEvent(new Event('change', { bubbles: true }));
    return JSON.stringify(
      readState({
        ok: true,
        reason: null,
        retryable: false,
      })
    );
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
    if (lastState.ok && textMatches) {
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

  throw buildFillComposerError(lastState);
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
