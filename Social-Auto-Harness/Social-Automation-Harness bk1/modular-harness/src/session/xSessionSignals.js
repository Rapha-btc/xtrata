export const DEFAULT_X_URL = "https://x.com/home";

export const X_SESSION_PROBE_SCRIPT = `(() => {
  const button = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
  const texts = button
    ? [...button.querySelectorAll('span')]
        .map((node) => (node.textContent || '').trim())
        .filter(Boolean)
    : [];
  const handle = texts.find((value) => value.startsWith('@')) || null;
  return JSON.stringify({
    url: window.location.href,
    title: document.title,
    loggedIn: Boolean(handle),
    handle,
    texts,
  });
})()`;

export function normalizeHandle(handle) {
  return handle?.replace(/^@/, "").trim().toLowerCase() || null;
}

export function parseXProbeResult(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) {
    return { loggedIn: false, handle: null, texts: [] };
  }

  return JSON.parse(raw);
}

export function pickXTab(tabs) {
  return tabs.find((tab) => /^https?:\/\/(www\.)?x\.com\//i.test(tab.url));
}
