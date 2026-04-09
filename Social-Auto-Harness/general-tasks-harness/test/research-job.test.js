import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { normalizeResearchJob, readResearchJob } from "../src/research/job.js";

test("normalizeResearchJob applies defaults to a minimal valid job", () => {
  const job = normalizeResearchJob({
    topic: "Stacks builders",
    objective: "Summarize the strongest overnight conversations.",
    sources: [
      {
        type: "x-search",
        label: "Builders",
        query: "Stacks builder",
      },
    ],
  });

  assert.equal(job.timeWindowHours, 24);
  assert.equal(job.maxItemsPerSource, 100);
  assert.equal(job.analysisBatchSize, 10);
  assert.equal(job.finalSynthesisLimit, 25);
  assert.equal(job.outputFormat, "markdown");
  assert.equal(job.reportInstructions, "");
  assert.equal(job.persona, null);
  assert.equal(job.account, null);
  assert.equal(job.sources[0].mode, "live");
});

test("normalizeResearchJob rejects unsupported source types", () => {
  assert.throws(
    () =>
      normalizeResearchJob({
        topic: "Bitcoin",
        objective: "Summarize activity.",
        sources: [
          {
            type: "reddit",
            label: "Reddit",
            query: "bitcoin",
          },
        ],
      }),
    /Unsupported research source type "reddit"\./
  );
});

test("normalizeResearchJob supports gpt-web-search sources", () => {
  const job = normalizeResearchJob({
    topic: "Hackathons",
    objective: "Find relevant hackathons and programs.",
    sources: [
      {
        type: "gpt-web-search",
        label: "Web search",
        query: "web3 hackathons",
      },
    ],
  });

  assert.equal(job.sources[0].type, "gpt-web-search");
  assert.equal(job.sources[0].query, "web3 hackathons");
});

test("readResearchJob resolves the job file path and normalizes the payload", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "research-job-"));
  const jobFile = path.join(tempDir, "job.json");

  try {
    await writeFile(
      jobFile,
      JSON.stringify({
        topic: "Ordinals",
        objective: "Review the strongest overnight chatter.",
        sources: [
          {
            type: "x-search",
            label: "Ordinals",
            query: "ordinals",
            mode: "latest",
          },
        ],
      }),
      "utf8"
    );

    const job = await readResearchJob(jobFile);
    assert.equal(job.jobFilePath, jobFile);
    assert.equal(job.sources[0].mode, "latest");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
