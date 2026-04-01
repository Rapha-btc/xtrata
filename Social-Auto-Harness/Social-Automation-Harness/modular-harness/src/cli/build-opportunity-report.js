#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildOpportunityReport } from "../reporting/buildOpportunityReport.js";
import { loadGovernanceState } from "../governance/loadGovernanceState.js";

function getArg(prefix) {
  const entry = process.argv.find((value) => value.startsWith(`${prefix}=`));
  return entry ? entry.slice(prefix.length + 1) : null;
}

async function readJsonValue(filePath, fallback = null) {
  if (!filePath) return fallback;
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}

async function main() {
  const baseDir = path.resolve(getArg("--base-dir") ?? process.cwd());
  const threadsFile = getArg("--threads-file");
  const followsFile = getArg("--follows-file");
  const threadAnalysisFile = getArg("--thread-analysis-file");
  const followAnalysisFile = getArg("--follow-analysis-file");
  const writeFilePath = getArg("--write-file");

  const [governanceState, threadCandidates, followCandidates, threadAnalysis, followAnalysis] = await Promise.all([
    loadGovernanceState({ baseDir }),
    readJsonValue(threadsFile, []),
    readJsonValue(followsFile, []),
    readJsonValue(threadAnalysisFile, null),
    readJsonValue(followAnalysisFile, null),
  ]);

  if (!Array.isArray(threadCandidates)) {
    throw new TypeError("--threads-file must contain a JSON array.");
  }
  if (!Array.isArray(followCandidates)) {
    throw new TypeError("--follows-file must contain a JSON array.");
  }

  const report = buildOpportunityReport({
    governanceState,
    threadCandidates,
    followCandidates,
    threadAnalysisResult: threadAnalysis,
    followAnalysisResult: followAnalysis,
    sourceFiles: {
      threadsFile: threadsFile ? path.resolve(threadsFile) : null,
      followsFile: followsFile ? path.resolve(followsFile) : null,
      threadAnalysisFile: threadAnalysisFile ? path.resolve(threadAnalysisFile) : null,
      followAnalysisFile: followAnalysisFile ? path.resolve(followAnalysisFile) : null,
    },
  });

  if (writeFilePath) {
    await writeFile(path.resolve(writeFilePath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Wrote opportunity report to ${path.resolve(writeFilePath)}`);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("build-opportunity-report failed:", error?.message ?? error);
    process.exit(1);
  });
}
