import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runTopicReportCli } from "../src/cli/run-topic-report.js";

test("runTopicReportCli writes all topic-report artifacts under one research run directory", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "topic-report-cli-"));
  const researchRunsDir = path.join(tempDir, "research-runs");
  const jobFile = path.join(tempDir, "job.json");
  const runId = "topic-report-test-run";
  const capturedReplyOptions = [];
  const capturedProgress = [];

  try {
    await writeFile(
      jobFile,
      `${JSON.stringify({
        topic: "Bitcoin permanence",
        objective: "Summarize the strongest overnight signals.",
        persona: "xtrata",
        account: "research@example.com",
        reportInstructions: "Close with a short operator note.",
        sources: [
          {
            type: "x-search",
            label: "Builders",
            query: "bitcoin permanence",
            mode: "live",
          },
        ],
      }, null, 2)}\n`,
      "utf8"
    );

    const result = await runTopicReportCli({
      argv: [`--job-file=${jobFile}`, `--run-id=${runId}`],
      dependencies: {
        researchRunsDir,
        progressToConsole: false,
        async onProgress(entry) {
          capturedProgress.push(entry);
        },
        adapter: {},
        async resolveBrowserPersonaFn() {
          return {
            persona: "xtrata",
            browserName: "Google Chrome",
            profileDirectory: "Profile 2",
            xHandle: "@xtratalayers",
          };
        },
        async scrapeXSearchResultsFn() {
          return {
            candidates: [
              {
                url: "https://x.com/example/status/1",
                author: "@builder",
                text: "Durability matters.",
                postedAt: "2026-04-01T12:00:00.000Z",
              },
              {
                url: "https://x.com/example/status/2",
                author: "@artist",
                text: "Art needs persistence.",
                postedAt: "2026-04-01T12:05:00.000Z",
              },
            ],
          };
        },
        async sendPromptForJsonFn(options) {
          capturedReplyOptions.push({
            replyMaxChecks: options.replyMaxChecks,
            replyWaitMs: options.replyWaitMs,
          });

          if (options.prompt.includes("Shortlist:")) {
            return {
              value: {
                summary: "Final shortlist ready.",
                searchRefinementSuggestions: ["Try adjacent builder phrases"],
                analyses: [
                  {
                    shortlistIndex: 0,
                    itemIndex: 0,
                    recommendation: "prioritize",
                    relevanceScore: 95,
                    credibilityScore: 90,
                    noveltyScore: 80,
                    suggestedUse: "lead",
                    reasoning: "Best lead.",
                    keyTakeaway: "Durability was the clearest repeated theme.",
                    riskFlags: [],
                  },
                  {
                    shortlistIndex: 1,
                    itemIndex: 1,
                    recommendation: "consider",
                    relevanceScore: 80,
                    credibilityScore: 82,
                    noveltyScore: 72,
                    suggestedUse: "supporting",
                    reasoning: "Good support.",
                    keyTakeaway: "Creative accounts echoed the same need.",
                    riskFlags: [],
                  },
                ],
              },
              session: { action: "opened-new-tab", tab: { windowId: 1, tabIndex: 9 } },
              submit: { ok: true },
              replyState: { url: "https://chatgpt.com/c/final" },
            };
          }

          return {
            value: {
              summary: "Initial batch complete.",
              searchRefinementSuggestions: ["Try adjacent builder phrases"],
              analyses: [
                {
                  itemIndex: 0,
                  recommendation: "prioritize",
                  relevanceScore: 92,
                  credibilityScore: 88,
                  noveltyScore: 77,
                  suggestedUse: "lead",
                  reasoning: "Strong fit.",
                  keyTakeaway: "Durability matters.",
                  riskFlags: [],
                },
                {
                  itemIndex: 1,
                  recommendation: "consider",
                  relevanceScore: 78,
                  credibilityScore: 81,
                  noveltyScore: 70,
                  suggestedUse: "supporting",
                  reasoning: "Useful support.",
                  keyTakeaway: "Artists echoed the theme.",
                  riskFlags: [],
                },
              ],
            },
            session: { action: "opened-new-tab", tab: { windowId: 1, tabIndex: 2 } },
            submit: { ok: true },
            replyState: { url: "https://chatgpt.com/c/batch" },
          };
        },
      },
    });

    const runDir = path.join(researchRunsDir, runId);
    const expectedFiles = [
      "job.json",
      "progress.log",
      "collection.json",
      "normalized-items.json",
      "analysis.json",
      "report.json",
      "report.md",
      "manifest.json",
    ];

    await Promise.all(expectedFiles.map((fileName) => access(path.join(runDir, fileName))));
    assert.equal(result.runDir, runDir);

    const manifest = JSON.parse(await readFile(path.join(runDir, "manifest.json"), "utf8"));
    const reportMarkdown = await readFile(path.join(runDir, "report.md"), "utf8");
    const progressLog = await readFile(path.join(runDir, "progress.log"), "utf8");

    assert.equal(manifest.counts.collected, 2);
    assert.equal(manifest.counts.analyzed, 2);
    assert.equal(manifest.counts.shortlisted, 2);
    assert.equal(manifest.artifacts.progressLog, path.join(runDir, "progress.log"));
    assert.deepEqual(capturedReplyOptions, [
      { replyMaxChecks: 300, replyWaitMs: 1000 },
      { replyMaxChecks: 300, replyWaitMs: 1000 },
    ]);
    assert.ok(capturedProgress.some((entry) => entry.stage === "topic-report" && entry.action === "start"));
    assert.ok(capturedProgress.some((entry) => entry.stage === "research-source" && entry.action === "start"));
    assert.ok(capturedProgress.some((entry) => entry.stage === "research-analysis-synthesis" && entry.action === "complete"));
    assert.match(progressLog, /topic-report:start/);
    assert.match(progressLog, /research-source:start/);
    assert.match(progressLog, /research-analysis-synthesis:complete/);
    assert.match(progressLog, /topic-report:complete/);
    assert.match(reportMarkdown, /## Executive Summary/);
    assert.match(reportMarkdown, /## Appendix of Reviewed Items/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("runTopicReportCli forwards explicit ChatGPT wait-budget overrides", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "topic-report-cli-wait-"));
  const researchRunsDir = path.join(tempDir, "research-runs");
  const jobFile = path.join(tempDir, "job.json");
  const capturedReplyOptions = [];

  try {
    await writeFile(
      jobFile,
      `${JSON.stringify({
        topic: "Stacks hackathons",
        objective: "Find relevant builder programs.",
        persona: "xtrata",
        sources: [
          {
            type: "x-search",
            label: "Hackathons",
            query: "stacks hackathon",
            mode: "live",
          },
        ],
      }, null, 2)}\n`,
      "utf8"
    );

    await runTopicReportCli({
      argv: [
        `--job-file=${jobFile}`,
        "--chatgpt-wait-budget-ms=240000",
        "--chatgpt-poll-ms=2000",
      ],
      dependencies: {
        researchRunsDir,
        writeFiles: false,
        progressToConsole: false,
        adapter: {},
        async resolveBrowserPersonaFn() {
          return {
            persona: "xtrata",
            browserName: "Google Chrome",
            profileDirectory: "Profile 2",
            xHandle: "@xtratalayers",
          };
        },
        async scrapeXSearchResultsFn() {
          return {
            candidates: [
              {
                url: "https://x.com/example/status/1",
                author: "@builder",
                text: "Stacks hackathon lead",
                postedAt: "2026-04-01T12:00:00.000Z",
              },
            ],
          };
        },
        async sendPromptForJsonFn(options) {
          capturedReplyOptions.push({
            replyMaxChecks: options.replyMaxChecks,
            replyWaitMs: options.replyWaitMs,
          });

          if (options.prompt.includes("Shortlist:")) {
            return {
              value: {
                summary: "Final shortlist ready.",
                searchRefinementSuggestions: [],
                analyses: [
                  {
                    shortlistIndex: 0,
                    itemIndex: 0,
                    recommendation: "prioritize",
                    relevanceScore: 90,
                    credibilityScore: 85,
                    noveltyScore: 75,
                    suggestedUse: "lead",
                    reasoning: "Strong fit.",
                    keyTakeaway: "Relevant lead.",
                    riskFlags: [],
                  },
                ],
              },
              session: { action: "opened-new-tab", tab: { windowId: 1, tabIndex: 2 } },
              submit: { ok: true },
              replyState: { url: "https://chatgpt.com/c/final" },
            };
          }

          return {
            value: {
              summary: "Initial batch complete.",
              searchRefinementSuggestions: [],
              analyses: [
                {
                  itemIndex: 0,
                  recommendation: "prioritize",
                  relevanceScore: 90,
                  credibilityScore: 85,
                  noveltyScore: 75,
                  suggestedUse: "lead",
                  reasoning: "Strong fit.",
                  keyTakeaway: "Relevant lead.",
                  riskFlags: [],
                },
              ],
            },
            session: { action: "opened-new-tab", tab: { windowId: 1, tabIndex: 1 } },
            submit: { ok: true },
            replyState: { url: "https://chatgpt.com/c/batch" },
          };
        },
      },
    });

    assert.deepEqual(capturedReplyOptions, [
      { replyMaxChecks: 120, replyWaitMs: 2000 },
      { replyMaxChecks: 120, replyWaitMs: 2000 },
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("runTopicReportCli writes a progress log and partial artifacts when analysis fails mid-run", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "topic-report-cli-fail-"));
  const researchRunsDir = path.join(tempDir, "research-runs");
  const jobFile = path.join(tempDir, "job.json");
  const runId = "topic-report-failure-run";

  try {
    await writeFile(
      jobFile,
      `${JSON.stringify({
        topic: "Stacks hackathons",
        objective: "Find relevant builder programs.",
        persona: "xtrata",
        sources: [
          {
            type: "x-search",
            label: "Hackathons",
            query: "stacks hackathon",
            mode: "live",
          },
        ],
      }, null, 2)}\n`,
      "utf8"
    );

    await assert.rejects(
      () =>
        runTopicReportCli({
          argv: [`--job-file=${jobFile}`, `--run-id=${runId}`],
          dependencies: {
            researchRunsDir,
            progressToConsole: false,
            adapter: {},
            async resolveBrowserPersonaFn() {
              return {
                persona: "xtrata",
                browserName: "Google Chrome",
                profileDirectory: "Profile 2",
                xHandle: "@xtratalayers",
              };
            },
            async scrapeXSearchResultsFn() {
              return {
                candidates: [
                  {
                    url: "https://x.com/example/status/1",
                    author: "@builder",
                    text: "Stacks hackathon lead",
                    postedAt: "2026-04-01T12:00:00.000Z",
                  },
                ],
              };
            },
            async sendPromptForJsonFn(options) {
              await options.onInvalidReply?.({
                label: options.progressLabel,
                attempt: 1,
                maxAttempts: 2,
                kind: "invalid-json",
                errorMessage: "ChatGPT prompt submission failed: submit-not-confirmed.",
                rawReplyText: "Prompt stayed in composer.",
                dispatchedPrompt: options.prompt,
                replyUrl: "https://chatgpt.com/c/failure",
                sessionAction: "opened-new-tab",
                isFinalAttempt: true,
              });

              throw new Error("ChatGPT prompt submission failed: submit-not-confirmed.");
            },
          },
        }),
      /ChatGPT prompt submission failed: submit-not-confirmed\./
    );

    const runDir = path.join(researchRunsDir, runId);
    const progressLog = await readFile(path.join(runDir, "progress.log"), "utf8");
    const invalidReplyFiles = await readdir(path.join(runDir, "invalid-replies"));

    await access(path.join(runDir, "job.json"));
    await access(path.join(runDir, "collection.json"));
    await access(path.join(runDir, "normalized-items.json"));
    await assert.rejects(() => access(path.join(runDir, "analysis.json")));
    await assert.rejects(() => access(path.join(runDir, "manifest.json")));
    assert.ok(invalidReplyFiles.some((fileName) => fileName.endsWith(".raw.txt")));
    assert.ok(invalidReplyFiles.some((fileName) => fileName.endsWith(".prompt.txt")));
    assert.ok(invalidReplyFiles.some((fileName) => fileName.endsWith(".meta.json")));
    assert.match(progressLog, /topic-report:start/);
    assert.match(progressLog, /topic-report:collection-complete/);
    assert.match(progressLog, /topic-report:invalid-reply-captured/);
    assert.match(progressLog, /research-analysis-batch:error/);
    assert.match(progressLog, /topic-report:error/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
