#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ChromeAppleScriptAdapter } from "../browser/chromeAppleScriptAdapter.js";
import { resolveBrowserPersona } from "../browser/profileRegistry.js";
import { draftReplyCandidates } from "../drafting/draftReplyCandidates.js";
import { loadGovernanceState } from "../governance/loadGovernanceState.js";

function getArg(prefix) {
  const entry = process.argv.find((value) => value.startsWith(`${prefix}=`));
  return entry ? entry.slice(prefix.length + 1) : null;
}

async function readJsonObject(filePath) {
  const parsed = JSON.parse(await readFile(path.resolve(filePath), "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError(`${filePath} must contain a JSON object.`);
  }
  return parsed;
}

async function main() {
  const opportunityReportFile = getArg("--opportunity-report-file");
  const writeFilePath = getArg("--write-file");
  const persona = getArg("--persona");
  const browserName = getArg("--browser") ?? "Google Chrome";
  const expectedAccountHint = getArg("--account") ?? null;
  const baseDir = path.resolve(getArg("--base-dir") ?? process.cwd());
  const maxDrafts = Number.parseInt(getArg("--max-drafts") ?? "3", 10);
  const minSafetyScore = Number.parseInt(getArg("--min-safety-score") ?? "70", 10);

  if (!opportunityReportFile) {
    throw new Error("Missing required argument: --opportunity-report-file=/abs/path/to/opportunity-report.json");
  }

  const [opportunityReport, governanceState, personaProfile] = await Promise.all([
    readJsonObject(opportunityReportFile),
    loadGovernanceState({ baseDir }),
    persona ? resolveBrowserPersona(persona) : Promise.resolve(null),
  ]);

  const adapter = new ChromeAppleScriptAdapter({
    browserName: personaProfile?.browserName ?? browserName,
  });
  const result = await draftReplyCandidates({
    adapter,
    opportunityReport,
    governanceState,
    expectedAccountHint,
    personaProfile,
    maxDrafts: Number.isFinite(maxDrafts) ? maxDrafts : 3,
    minSafetyScore: Number.isFinite(minSafetyScore) ? minSafetyScore : 70,
  });

  const output = {
    generatedAt: new Date().toISOString(),
    inputCount: result.inputCount,
    draftedCount: result.draftedCount,
    governanceSummary: result.governanceSummary,
    value: result.value,
    draftTargets: result.draftTargets,
    enrichedDrafts: result.enrichedDrafts,
  };

  if (writeFilePath) {
    await writeFile(path.resolve(writeFilePath), `${JSON.stringify(output, null, 2)}\n`, "utf8");
    console.log(`Wrote reply drafts for ${result.draftedCount} targets to ${path.resolve(writeFilePath)}`);
  } else {
    console.log(JSON.stringify(output, null, 2));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("draft-reply-candidates failed:", error?.message ?? error);
    process.exit(1);
  });
}
