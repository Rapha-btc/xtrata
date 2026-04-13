function truncate(value, maxLength = 180) {
  const normalized = value?.toString().replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function summarizeObject(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      preview: value.slice(0, 3).map((entry) => summarizeValue(entry)),
    };
  }

  const summary = {};
  for (const key of [
    "windowId",
    "tabIndex",
    "url",
    "title",
    "action",
    "reason",
    "query",
    "resultCount",
    "replyCount",
    "replyText",
    "searchUrl",
    "collectedCount",
    "loggedIn",
    "composerFound",
    "sendButtonReady",
    "sendButtonLabel",
    "submitStrategy",
    "submitReason",
    "resubmissionSkipped",
    "generating",
  ]) {
    if (!(key in value)) continue;
    summary[key] = summarizeValue(value[key]);
  }

  if (Object.keys(summary).length === 0) {
    return {
      type: "object",
      keys: Object.keys(value).slice(0, 10),
    };
  }

  return summary;
}

export function summarizeValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return truncate(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  return summarizeObject(value);
}

export function createTracedAdapter(adapter, { recordEvent }) {
  if (!adapter) throw new TypeError("adapter is required.");
  if (typeof recordEvent !== "function") throw new TypeError("recordEvent is required.");

  const tracedMethodNames = [
    "ensureBrowserApp",
    "listTabs",
    "activateTab",
    "openTab",
    "openTabInWindow",
    "openTabInFrontWindow",
    "openProfileWindow",
    "closeTab",
    "getActiveTab",
    "evaluateActiveTab",
    "wait",
  ];

  const tracedAdapter = Object.create(Object.getPrototypeOf(adapter));

  for (const key of Reflect.ownKeys(adapter)) {
    if (typeof key === "string" && !(key in tracedAdapter)) {
      tracedAdapter[key] = adapter[key];
    }
  }

  for (const methodName of tracedMethodNames) {
    if (typeof adapter[methodName] !== "function") continue;

    tracedAdapter[methodName] = async (...args) => {
      const startedAt = Date.now();
      await recordEvent({
        kind: "adapter",
        phase: "start",
        method: methodName,
        args: args.map((arg) => summarizeValue(arg)),
      });

      try {
        const result = await adapter[methodName](...args);
        await recordEvent({
          kind: "adapter",
          phase: "finish",
          method: methodName,
          durationMs: Date.now() - startedAt,
          status: "ok",
          result: summarizeValue(result),
        });
        return result;
      } catch (error) {
        await recordEvent({
          kind: "adapter",
          phase: "finish",
          method: methodName,
          durationMs: Date.now() - startedAt,
          status: "error",
          error: {
            name: error?.name ?? "Error",
            message: truncate(error?.message ?? String(error), 400),
          },
        });
        throw error;
      }
    };
  }

  return tracedAdapter;
}

function renderProgressEvent(event) {
  return `- ${event.timestamp} [progress] ${event.stage}:${event.action} ${Object.entries(event.details ?? {})
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ")}`.trim();
}

function renderAdapterEvent(event) {
  if (event.phase === "start") {
    return `- ${event.timestamp} [adapter:start] ${event.method} args=${JSON.stringify(event.args ?? [])}`;
  }

  if (event.status === "error") {
    return `- ${event.timestamp} [adapter:error] ${event.method} durationMs=${event.durationMs} message=${JSON.stringify(event.error?.message ?? "unknown")}`;
  }

  return `- ${event.timestamp} [adapter:finish] ${event.method} durationMs=${event.durationMs} result=${JSON.stringify(event.result ?? null)}`;
}

function renderInvalidReplyEvent(event) {
  return `- ${event.timestamp} [invalid-reply] kind=${event.kindName} attempt=${event.attempt} label=${JSON.stringify(event.label ?? null)} files=${JSON.stringify(event.files ?? null)}`;
}

export function renderDebugLogMarkdown({
  runId,
  events = [],
  manifest = null,
  error = null,
} = {}) {
  const lines = [
    `# Narrate Debug Log - ${runId ?? "unknown-run"}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    `Status: ${manifest?.status ?? (error ? "failed" : "unknown")}`,
    "",
  ];

  if (error) {
    lines.push("## Failure", "", `- Message: ${error.error?.message ?? "Unknown error"}`);
    if (error.error?.helpfulHint) {
      lines.push(`- Helpful hint: ${error.error.helpfulHint}`);
    }
    lines.push("");
  }

  if (manifest?.counts) {
    lines.push(
      "## Counts",
      "",
      ...Object.entries(manifest.counts).map(([key, value]) => `- ${key}: ${value}`),
      ""
    );
  }

  lines.push("## Timeline", "");

  if (events.length === 0) {
    lines.push("- No debug events captured.", "");
    return `${lines.join("\n").trimEnd()}\n`;
  }

  for (const event of events) {
    if (event.kind === "progress") {
      lines.push(renderProgressEvent(event));
      continue;
    }
    if (event.kind === "adapter") {
      lines.push(renderAdapterEvent(event));
      continue;
    }
    if (event.kind === "invalid-reply-artifact") {
      lines.push(renderInvalidReplyEvent(event));
      continue;
    }
    lines.push(`- ${event.timestamp} [${event.kind}] ${JSON.stringify(event)}`);
  }

  lines.push("");
  return `${lines.join("\n").trimEnd()}\n`;
}
