#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeCandidateCollection } from "../analysis/analyzeCandidateCollection.js";
import { ChromeAppleScriptAdapter } from "../browser/chromeAppleScriptAdapter.js";
import { resolveBrowserPersona } from "../browser/profileRegistry.js";
import { loadGovernanceState } from "../governance/loadGovernanceState.js";

function getArg(prefix) {
  const entry = process.argv.find((value) => value.startsWith(`${prefix}=`));
  return entry ? entry.slice(prefix.length + 1) : null;
}

async function readJsonArray(filePath) {
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new TypeError(`${filePath} must contain a JSON array.`);
  }
  return parsed;
}

async function main() {
  const candidateType = getArg("--type");
  const inputFile = getArg("--input-file");
  const writeFilePath = getArg("--write-file");
  const persona = getArg("--persona");
  const browserName = getArg("--browser") ?? "Google Chrome";
  const expectedAccountHint = getArg("--account") ?? null;
  const baseDir = path.resolve(getArg("--base-dir") ?? process.cwd());
  const maxCandidates = Number.parseInt(getArg("--max-candidates") ?? "100", 10);
  const batchSize = Number.parseInt(getArg("--batch-size") ?? "25", 10);
  const finalSynthesisLimit = Number.parseInt(getArg("--final-synthesis-limit") ?? "25", 10);

  if (!candidateType) {
    throw new Error('Missing required argument: --type=thread|follow');
  }
  if (!inputFile) {
    throw new Error('Missing required argument: --input-file=/abs/path/to/candidates.json');
  }

  const [candidates, governanceState, personaProfile] = await Promise.all([
    readJsonArray(path.resolve(inputFile)),
    loadGovernanceState({ baseDir }),
    persona ? resolveBrowserPersona(persona) : Promise.resolve(null),
  ]);

  const adapter = new ChromeAppleScriptAdapter({
    browserName: personaProfile?.browserName ?? browserName,
  });
  const result = await analyzeCandidateCollection({
    adapter,
    candidateType,
    candidates,
    governanceState,
    expectedAccountHint,
    personaProfile,
    maxCandidates: Number.isFinite(maxCandidates) ? maxCandidates : 100,
    batchSize: Number.isFinite(batchSize) ? batchSize : 25,
    finalSynthesisLimit: Number.isFinite(finalSynthesisLimit) ? finalSynthesisLimit : 25,
  });

  const output = {
    generatedAt: new Date().toISOString(),
    candidateType: result.candidateType,
    inputCount: result.inputCount,
    analyzedCount: result.analyzedCount,
    governanceSummary: result.governanceSummary,
    batchSummaries: result.batchSummaries,
    synthesisResult: result.synthesisResult,
    value: result.value,
    enrichedAnalyses: result.enrichedAnalyses,
  };

  if (writeFilePath) {
    await writeFile(path.resolve(writeFilePath), `${JSON.stringify(output, null, 2)}\n`, "utf8");
    console.log(`Wrote ${result.candidateType} analysis for ${result.analyzedCount} candidates to ${path.resolve(writeFilePath)}`);
  } else {
    console.log(JSON.stringify(output, null, 2));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("analyze-candidate-batch failed:", error?.message ?? error);
    process.exit(1);
  });
}
