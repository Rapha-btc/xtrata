import assert from "node:assert/strict";
import test from "node:test";

import { createTracedAdapter, renderDebugLogMarkdown } from "../src/debug.js";

test("createTracedAdapter records adapter start and finish events", async () => {
  const events = [];
  const adapter = createTracedAdapter(
    {
      async openTabInWindow({ windowId, url }) {
        return { windowId, tabIndex: 2, url };
      },
    },
    {
      async recordEvent(event) {
        events.push(event);
      },
    }
  );

  const result = await adapter.openTabInWindow({ windowId: 1, url: "https://example.com" });

  assert.equal(result.url, "https://example.com");
  assert.equal(events.length, 2);
  assert.equal(events[0].kind, "adapter");
  assert.equal(events[0].phase, "start");
  assert.equal(events[0].method, "openTabInWindow");
  assert.equal(events[1].phase, "finish");
  assert.equal(events[1].status, "ok");
});

test("renderDebugLogMarkdown renders progress and adapter events", () => {
  const markdown = renderDebugLogMarkdown({
    runId: "run-1",
    manifest: {
      status: "failed",
      counts: { queries: 1, collected: 0 },
    },
    error: {
      error: {
        message: "Boom",
        helpfulHint: "Try again safely.",
      },
    },
    events: [
      {
        kind: "progress",
        timestamp: "2026-04-13T10:00:00.000Z",
        stage: "lead-engine",
        action: "start",
        details: { runId: "run-1" },
      },
      {
        kind: "adapter",
        timestamp: "2026-04-13T10:00:01.000Z",
        phase: "finish",
        method: "openTab",
        durationMs: 321,
        status: "ok",
        result: { url: "https://example.com" },
      },
    ],
  });

  assert.match(markdown, /Narrate Debug Log - run-1/);
  assert.match(markdown, /Helpful hint: Try again safely\./);
  assert.match(markdown, /\[progress\] lead-engine:start/);
  assert.match(markdown, /\[adapter:finish\] openTab/);
});
