#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { runTopicReport } from "../research/runTopicReport.js";

function readOption(argv, optionName) {
  const option = argv.find((value) => value.startsWith(`${optionName}=`));
  return option ? option.slice(optionName.length + 1) : null;
}

export async function runTopicReportCli({
  argv = process.argv.slice(2),
  dependencies = {},
} = {}) {
  const jobFilePath = readOption(argv, "--job-file");
  const runId = readOption(argv, "--run-id");
  const browserName = readOption(argv, "--browser") ?? "Google Chrome";
  const chatgptWaitBudgetMs = readOption(argv, "--chatgpt-wait-budget-ms");
  const chatgptPollMs = readOption(argv, "--chatgpt-poll-ms");

  if (!jobFilePath?.trim()) {
    throw new Error("Missing required argument: --job-file=/abs/path/to/job.json");
  }

  const result = await runTopicReport({
    jobFilePath,
    runId,
    browserName,
    chatgptWaitBudgetMs,
    chatgptPollMs,
    ...dependencies,
  });

  console.log(`Wrote topic report to ${result.files.reportMarkdown}`);
  console.log(`Run dir: ${result.runDir}`);
  console.log(`Topic: ${result.job.topic}`);
  console.log(`Collected: ${result.manifest.counts.collected}`);
  console.log(`Analyzed: ${result.manifest.counts.analyzed}`);
  console.log(`Shortlisted: ${result.manifest.counts.shortlisted}`);
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runTopicReportCli().catch((error) => {
    console.error("run-topic-report failed:", error?.message ?? error);
    process.exit(1);
  });
}
