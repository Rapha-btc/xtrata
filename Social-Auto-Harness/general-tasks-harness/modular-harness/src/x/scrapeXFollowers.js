import { normalizeHandle } from "../session/xSessionSignals.js";
import { openVerifiedXTab } from "./openVerifiedXTab.js";

const FOLLOWERS_URL_PATTERN = /^https?:\/\/(www\.)?x\.com\/[^/?#]+\/followers(?:\/|$|\?)/i;

export function buildXFollowersUrl(sourceHandle) {
  const normalized = normalizeHandle(sourceHandle);
  if (!normalized) throw new TypeError("sourceHandle is required.");

  return `https://x.com/${normalized}/followers`;
}

export function matchesXFollowersTab(sourceHandle) {
  const normalized = normalizeHandle(sourceHandle);
  if (!normalized) throw new TypeError("sourceHandle is required.");

  return (tab) => {
    if (!FOLLOWERS_URL_PATTERN.test(tab?.url ?? "")) return false;

    try {
      const current = new URL(tab.url);
      const [, handle, page] = current.pathname.split("/");
      return normalizeHandle(handle) === normalized && page === "followers";
    } catch {
      return false;
    }
  };
}

export function buildXFollowersProbeScript(maxResults = 40) {
  return `(() => {
    const maxResults = ${Number(maxResults) || 40};
    const normalizeText = (value) => (value || "").replace(/\\s+/g, " ").trim();
    const reservedPaths = new Set([
      "home",
      "explore",
      "notifications",
      "messages",
      "search",
      "settings",
      "compose",
      "login",
      "signup",
      "i",
    ]);
    const toAbsoluteUrl = (href) => {
      if (!href) return null;
      try {
        return new URL(href, window.location.origin).toString();
      } catch {
        return null;
      }
    };
    const uniqueElements = (nodes) => {
      const seen = new Set();
      const unique = [];
      for (const node of nodes) {
        if (!node || seen.has(node)) continue;
        seen.add(node);
        unique.push(node);
      }
      return unique;
    };
    const primaryColumn = document.querySelector('[data-testid="primaryColumn"]') || document.body;
    const sourceHandleNormalized = ((window.location.pathname.split("/")[1] || "").replace(/^@/, "")).toLowerCase();
    const readHandle = (cell) => {
      const anchors = [...cell.querySelectorAll('a[href^="/"]')];
      for (const anchor of anchors) {
        const href = anchor.getAttribute("href") || "";
        if (/^\\/[^/]+$/.test(href)) {
          const candidate = href.slice(1);
          if (!reservedPaths.has(candidate.toLowerCase()) && candidate.toLowerCase() !== sourceHandleNormalized) {
            return "@" + candidate;
          }
        }
      }
      const handleText = [...cell.querySelectorAll("span")]
        .map((node) => normalizeText(node.textContent || ""))
        .find((value) => /^@[^\\s/]+$/.test(value));
      return handleText || null;
    };
    const readProfileUrl = (cell) =>
      toAbsoluteUrl(
        [...cell.querySelectorAll('a[href^="/"]')]
          .find((anchor) => {
            const href = anchor.getAttribute("href") || "";
            return (
              /^\\/[^/]+$/.test(href) &&
              !reservedPaths.has(href.slice(1).toLowerCase()) &&
              href.slice(1).toLowerCase() !== sourceHandleNormalized
            );
          })
          ?.getAttribute("href")
      ) || null;
    const readBio = (cell) =>
      normalizeText(
        cell.querySelector('[data-testid="UserDescription"]')?.innerText ||
          cell.querySelector('[data-testid="UserCell"] [dir="auto"]')?.innerText ||
          cell.querySelector('[dir="auto"] span')?.innerText ||
          ""
      ) || "";
    const profileAnchors = uniqueElements(
      [...primaryColumn.querySelectorAll('a[href^="/"]')].filter((anchor) => {
        const href = anchor.getAttribute("href") || "";
        if (!/^\\/[^/]+$/.test(href)) return false;
        const candidate = href.slice(1).toLowerCase();
        return !reservedPaths.has(candidate) && candidate !== sourceHandleNormalized;
      })
    );
    const cells = uniqueElements([
      ...primaryColumn.querySelectorAll('[data-testid="UserCell"]'),
      ...primaryColumn.querySelectorAll('[data-testid="cellInnerDiv"]'),
      ...profileAnchors
        .map((anchor) => anchor.closest('[data-testid="UserCell"], [data-testid="cellInnerDiv"]'))
        .filter(Boolean),
    ]);
    const users = [];
    const seenHandles = new Set();
    const pushUser = (handle, bio, bioObserved, profileUrl) => {
      const normalizedHandle = (handle || "").replace(/^@/, "").toLowerCase();
      if (!normalizedHandle || seenHandles.has(normalizedHandle)) return;
      seenHandles.add(normalizedHandle);
      users.push({
        handle: "@" + normalizedHandle,
        bio: bio || "",
        bioObserved: Boolean(bioObserved),
        profileUrl: profileUrl || null,
      });
    };
    for (const cell of cells) {
      const handle = readHandle(cell);
      if (!handle) continue;
      const profileUrl = readProfileUrl(cell);
      if (!profileUrl) continue;
      pushUser(handle, readBio(cell), true, profileUrl);
      if (users.length >= maxResults) break;
    }
    if (users.length < maxResults) {
      for (const anchor of profileAnchors) {
        const href = anchor.getAttribute("href") || "";
        const handle = /^\\/[^/]+$/.test(href) ? "@" + href.slice(1) : null;
        if (!handle) continue;
        const container =
          anchor.closest('[data-testid="UserCell"], [data-testid="cellInnerDiv"], section, article, div') ||
          anchor.parentElement;
        const bioNode = container?.querySelector('[data-testid="UserDescription"]');
        pushUser(
          handle,
          normalizeText(bioNode?.innerText || ""),
          Boolean(bioNode),
          toAbsoluteUrl(href)
        );
        if (users.length >= maxResults) break;
      }
    }
    const loading = Boolean(
      document.querySelector('[role="progressbar"], [aria-label*="Loading" i], [data-testid="primaryColumn"] [aria-busy="true"]')
    );
    const primaryText = normalizeText(primaryColumn.innerText || "");
    const emptyStateText =
      [
        "Nothing to see here",
        "This account has no followers",
        "When someone follows this account, they'll show up here",
        "You’re unable to view these followers",
        "These followers are protected",
      ].find((value) => primaryText.toLowerCase().includes(value.toLowerCase())) || null;
    return JSON.stringify({
      url: window.location.href,
      title: document.title,
      sourceHandle: "@" + ((window.location.pathname.split("/")[1] || "").replace(/^@/, "")),
      followerCount: users.length,
      candidateCellCount: cells.length,
      profileAnchorCount: profileAnchors.length,
      sampledProfileLinks: [...new Set(users.map((user) => user.profileUrl).filter(Boolean))].slice(0, 5),
      emptyStateText,
      loading,
      users,
    });
  })()`;
}

export function parseXFollowersProbeResult(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) {
    return {
      url: null,
      title: "",
      sourceHandle: null,
      followerCount: 0,
      candidateCellCount: 0,
      profileAnchorCount: 0,
      sampledProfileLinks: [],
      emptyStateText: null,
      loading: false,
      users: [],
    };
  }

  return JSON.parse(raw);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeXFollowers({
  adapter,
  sourceHandle,
  expectedHandle = null,
  personaProfile = null,
  maxResults = 40,
  maxChecks = 5,
  waitMs = 1000,
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");

  const normalizedSourceHandle = normalizeHandle(sourceHandle);
  if (!normalizedSourceHandle) {
    throw new TypeError("sourceHandle is required.");
  }

  const targetUrl = buildXFollowersUrl(normalizedSourceHandle);
  const navigation = await openVerifiedXTab({
    adapter,
    expectedHandle,
    personaProfile,
    targetUrl,
    matchTab: matchesXFollowersTab(normalizedSourceHandle),
  });

  const probeScript = buildXFollowersProbeScript(maxResults);
  let lastState = null;

  for (let attempt = 1; attempt <= maxChecks; attempt += 1) {
    lastState = parseXFollowersProbeResult(await adapter.evaluateActiveTab(probeScript));
    if (lastState.followerCount > 0 || lastState.emptyStateText) {
      return {
        ok: true,
        navigation,
        sourceHandle: `@${normalizedSourceHandle}`,
        followersUrl: targetUrl,
        candidates: lastState.users ?? [],
        state: lastState,
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

  return {
    ok: true,
    navigation,
    sourceHandle: `@${normalizedSourceHandle}`,
    followersUrl: targetUrl,
    candidates: lastState?.users ?? [],
    state: lastState,
  };
}
