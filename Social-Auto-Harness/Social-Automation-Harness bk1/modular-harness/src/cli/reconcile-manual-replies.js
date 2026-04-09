#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { reconcileManualReplyOutcomes } from "../audit/reconcileManualReplyOutcomes.js";
import { ChromeAppleScriptAdapter } from "../browser/chromeAppleScriptAdapter.js";
import { resolveBrowserPersona } from "../browser/profileRegistry.js";

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
  const draftFile = getArg("--draft-file");
  const queueFile = getArg("--queue-file");
  const writeFilePath = getArg("--write-file");
  const persona = getArg("--persona");
  const browserName = getArg("--browser") ?? "Google Chrome";
  const expectedHandle = getArg("--handle") ?? null;
  const baseDir = path.resolve(getArg("--base-dir") ?? process.cwd());

  if (!draftFile) {
    throw new Error("Missing required argument: --draft-file=/abs/path/to/reply-drafts.json");
  }

  const [draftResult, queueResult, personaProfile] = await Promise.all([
    readJsonObject(draftFile),
    queueFile ? readJsonObject(queueFile) : Promise.resolve(null),
    persona ? resolveBrowserPersona(persona) : Promise.resolve(null),
  ]);

  const adapter = new ChromeAppleScriptAdapter({
    browserName: personaProfile?.browserName ?? browserName,
  });
  const result = await reconcileManualReplyOutcomes({
    adapter,
    draftResult,
    queueResult,
    baseDir,
    expectedHandle: expectedHandle ?? personaProfile?.xHandle ?? null,
    personaProfile,
  });

  const output = {
    generatedAt: new Date().toISOString(),
    inspectedCount: result.inspectedCount,
    reconciledCount: result.reconciledCount,
    alreadyPostedCount: result.alreadyPostedCount,
    unresolvedCount: result.unresolvedCount,
    outcomes: result.outcomes,
  };

  if (writeFilePath) {
    await writeFile(path.resolve(writeFilePath), `${JSON.stringify(output, null, 2)}\n`, "utf8");
    console.log(`Wrote reply reconciliation summary to ${path.resolve(writeFilePath)}`);
  } else {
    console.log(JSON.stringify(output, null, 2));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("reconcile-manual-replies failed:", error?.message ?? error);
    process.exit(1);
  });
}
