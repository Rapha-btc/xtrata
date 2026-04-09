import assert from "node:assert/strict";
import test from "node:test";

import {
  buildJsonRepairPrompt,
  buildJsonOnlyPrompt,
  extractJsonText,
  parseJsonReply,
  sendPromptForJson,
  validateJsonValue,
} from "../src/chatgpt/sendPromptForJson.js";

test("buildJsonOnlyPrompt appends strict JSON instructions and schema guidance", () => {
  const prompt = buildJsonOnlyPrompt("Return the latest stats.", {
    schemaDescription: 'Object with keys "ok" and "count".',
  });

  assert.match(prompt, /Return exactly one valid JSON value and nothing else\./);
  assert.match(prompt, /Object with keys "ok" and "count"\./);
});

test("buildJsonRepairPrompt carries forward the schema and prior failure context", () => {
  const prompt = buildJsonRepairPrompt("Return the latest stats.", {
    schemaDescription: 'Object with keys "ok" and "count".',
    previousErrorMessage: "ChatGPT reply did not contain valid JSON.",
    previousReplyText: "Sure, here is a summary.",
  });

  assert.match(prompt, /previous reply was not valid JSON/i);
  assert.match(prompt, /ChatGPT reply did not contain valid JSON\./);
  assert.match(prompt, /Sure, here is a summary\./);
  assert.match(prompt, /Object with keys "ok" and "count"\./);
});

test("extractJsonText pulls JSON from a fenced code block", () => {
  const jsonText = extractJsonText("Here you go:\n```json\n{\"ok\":true}\n```\nDone.");
  assert.equal(jsonText, "{\"ok\":true}");
});

test("extractJsonText pulls JSON embedded in explanatory prose", () => {
  const jsonText = extractJsonText("Result follows:\n{\"ok\":true,\"count\":2}\nThat is the object.");
  assert.equal(jsonText, "{\"ok\":true,\"count\":2}");
});

test("extractJsonText repairs raw newlines inside JSON strings", () => {
  const jsonText = extractJsonText("{\"ok\":true,\"message\":\"Line 1\nLine 2\"}");
  assert.equal(jsonText, "{\"ok\":true,\"message\":\"Line 1\\nLine 2\"}");
});

test("parseJsonReply parses the extracted JSON value", () => {
  const result = parseJsonReply("```json\n[1, 2, 3]\n```");
  assert.deepEqual(result, {
    jsonText: "[1, 2, 3]",
    value: [1, 2, 3],
  });
});

test("validateJsonValue enforces expected type, required keys, and custom rules", () => {
  assert.deepEqual(
    validateJsonValue({ ok: true, count: 2 }, {
      expectedType: "object",
      requiredKeys: ["ok", "count"],
      validate(value) {
        return value.count > 0 || "count must be positive";
      },
    }),
    { ok: true, count: 2 }
  );

  assert.throws(
    () => validateJsonValue(["a"], { expectedType: "object" }),
    /Expected JSON type "object", but received "array"\./
  );

  assert.throws(
    () => validateJsonValue({ ok: true }, { requiredKeys: ["ok", "count"] }),
    /JSON result is missing required keys: count\./
  );
});

test("sendPromptForJson parses fenced JSON and validates the result", async () => {
  let capturedPrompt = null;
  const result = await sendPromptForJson({
    adapter: {},
    prompt: "Return a health payload.",
    expectedType: "object",
    requiredKeys: ["ok", "source"],
    schemaDescription: 'Object with keys "ok" (boolean) and "source" (string).',
    async sendPromptAndReadReplyFn({ prompt }) {
      capturedPrompt = prompt;
      return {
        session: { action: "opened-new-tab" },
        submit: { ok: true },
        replyState: { url: "https://chatgpt.com/c/1" },
        replyText: "```json\n{\"ok\":true,\"source\":\"chatgpt\"}\n```",
      };
    },
  });

  assert.match(capturedPrompt, /Return exactly one valid JSON value and nothing else\./);
  assert.equal(result.session.action, "opened-new-tab");
  assert.deepEqual(result.value, { ok: true, source: "chatgpt" });
  assert.equal(result.jsonText, "{\"ok\":true,\"source\":\"chatgpt\"}");
});

test("sendPromptForJson throws when no valid JSON can be extracted", async () => {
  await assert.rejects(
    () =>
      sendPromptForJson({
        adapter: {},
        prompt: "Return JSON.",
        maxJsonAttempts: 1,
        async sendPromptAndReadReplyFn() {
          return {
            session: { action: "opened-new-tab" },
            submit: { ok: true },
            replyState: { url: "https://chatgpt.com/c/2" },
            replyText: "Sure, I can help with that.",
          };
        },
      }),
    /ChatGPT reply did not contain valid JSON\./
  );
});

test("sendPromptForJson retries with a repair prompt after invalid JSON", async () => {
  const calls = [];
  const result = await sendPromptForJson({
    adapter: {},
    prompt: "Return JSON.",
    expectedType: "object",
    requiredKeys: ["ok", "count"],
    async sendPromptAndReadReplyFn(options) {
      calls.push(options);
      if (calls.length === 1) {
        return {
          session: { action: "opened-new-tab" },
          submit: { ok: true },
          replyState: { url: "https://chatgpt.com/c/retry-1" },
          replyText: "Sure, I can help with that.",
        };
      }

      return {
        session: { action: "opened-new-tab" },
        submit: { ok: true },
        replyState: { url: "https://chatgpt.com/c/retry-2" },
        replyText: "{\"ok\":true,\"count\":2}",
      };
    },
  });

  assert.equal(calls.length, 2);
  assert.match(calls[1].prompt, /previous reply was not valid json/i);
  assert.equal(calls[1].forceNewTab, true);
  assert.equal(calls[1].existingSession, null);
  assert.equal(calls[1].targetUrl, undefined);
  assert.deepEqual(result.value, { ok: true, count: 2 });
});

test("sendPromptForJson emits invalid-reply events for malformed replies", async () => {
  const invalidReplies = [];

  const result = await sendPromptForJson({
    adapter: {},
    prompt: "Return JSON.",
    expectedType: "object",
    requiredKeys: ["ok", "count"],
    async onInvalidReply(event) {
      invalidReplies.push(event);
    },
    async sendPromptAndReadReplyFn({ prompt }) {
      if (/previous reply was not valid json/i.test(prompt)) {
        return {
          session: { action: "opened-new-tab" },
          submit: { ok: true },
          replyState: { url: "https://chatgpt.com/c/retry-2" },
          replyText: "{\"ok\":true,\"count\":2}",
        };
      }

      return {
        session: { action: "opened-new-tab" },
        submit: { ok: true },
        replyState: { url: "https://chatgpt.com/c/retry-1" },
        replyText: "Sure, I can help with that.",
      };
    },
  });

  assert.deepEqual(result.value, { ok: true, count: 2 });
  assert.equal(invalidReplies.length, 1);
  assert.equal(invalidReplies[0].kind, "invalid-json");
  assert.equal(invalidReplies[0].attempt, 1);
  assert.equal(invalidReplies[0].isFinalAttempt, false);
  assert.match(invalidReplies[0].errorMessage, /did not contain valid JSON/i);
  assert.match(invalidReplies[0].rawReplyText, /help with that/i);
});

test("sendPromptForJson rejects a repair attempt that reuses the previous reply text", async () => {
  await assert.rejects(
    () =>
      sendPromptForJson({
        adapter: {},
        prompt: "Return JSON.",
        maxJsonAttempts: 2,
        async sendPromptAndReadReplyFn({ prompt }) {
          if (/previous reply was not valid json/i.test(prompt)) {
            return {
              session: { action: "opened-new-tab" },
              submit: { ok: true },
              replyState: { url: "https://chatgpt.com/c/retry-2" },
              replyText: "Sure, I can help with that.",
            };
          }

          return {
            session: { action: "opened-new-tab" },
            submit: { ok: true },
            replyState: { url: "https://chatgpt.com/c/retry-1" },
            replyText: "Sure, I can help with that.",
          };
        },
      }),
    /ChatGPT repair attempt returned the previous reply again\. after 2 attempts\./
  );
});

test("sendPromptForJson throws when validation fails", async () => {
  await assert.rejects(
    () =>
      sendPromptForJson({
        adapter: {},
        prompt: "Return JSON.",
        expectedType: "object",
        requiredKeys: ["ok", "count"],
        async sendPromptAndReadReplyFn({ prompt }) {
          if (/previous reply was not valid json/i.test(prompt)) {
            return {
              session: { action: "opened-new-tab" },
              submit: { ok: true },
              replyState: { url: "https://chatgpt.com/c/3b" },
              replyText: "{\"ok\":true,\"extra\":1}",
            };
          }

          return {
            session: { action: "opened-new-tab" },
            submit: { ok: true },
            replyState: { url: "https://chatgpt.com/c/3" },
            replyText: "{\"ok\":true}",
          };
        },
      }),
    /JSON result is missing required keys: count\./
  );
});

test("sendPromptForJson includes attempt count when retries are exhausted", async () => {
  await assert.rejects(
    () =>
      sendPromptForJson({
        adapter: {},
        prompt: "Return JSON.",
        maxJsonAttempts: 2,
        async sendPromptAndReadReplyFn({ prompt }) {
          if (/previous reply was not valid json/i.test(prompt)) {
            return {
              session: { action: "opened-new-tab" },
              submit: { ok: true },
              replyState: { url: "https://chatgpt.com/c/fail-2" },
              replyText: "Still not valid JSON here either.",
            };
          }

          return {
            session: { action: "opened-new-tab" },
            submit: { ok: true },
            replyState: { url: "https://chatgpt.com/c/fail" },
            replyText: "Still not JSON.",
          };
        },
      }),
    /ChatGPT reply did not contain valid JSON\. after 2 attempts\./
  );
});
