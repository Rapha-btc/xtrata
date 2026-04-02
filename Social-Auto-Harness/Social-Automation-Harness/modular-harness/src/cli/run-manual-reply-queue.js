#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ChromeAppleScriptAdapter } from "../browser/chromeAppleScriptAdapter.js";
import { resolveBrowserPersona } from "../browser/profileRegistry.js";
import { runManualReplyQueue } from "../execution/manualReplyQueue.js";

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
  const writeFilePath = getArg("--write-file");
  const persona = getArg("--persona");
  const browserName = getArg("--browser") ?? "Google Chrome";
  const expectedHandle = getArg("--handle") ?? null;
  const baseDir = path.resolve(getArg("--base-dir") ?? process.cwd());
  const startIndex = Number.parseInt(getArg("--start-index") ?? "0", 10);
  const maxReplies = Number.parseInt(getArg("--max-replies") ?? "3", 10);
  const sendTimeoutMs = Number.parseInt(getArg("--send-timeout-ms") ?? "180000", 10);
  const pollIntervalMs = Number.parseInt(getArg("--poll-interval-ms") ?? "1000", 10);
  const continueOnUnconfirmed = process.argv.includes("--continue-on-unconfirmed");

  if (!draftFile) {
    throw new Error("Missing required argument: --draft-file=/abs/path/to/reply-drafts.json");
  }

  const [draftResult, personaProfile] = await Promise.all([
    readJsonObject(draftFile),
    persona ? resolveBrowserPersona(persona) : Promise.resolve(null),
  ]);

  const adapter = new ChromeAppleScriptAdapter({
    browserName: personaProfile?.browserName ?? browserName,
  });
  const result = await runManualReplyQueue({
    adapter,
    draftResult,
    baseDir,
    expectedHandle: expectedHandle ?? personaProfile?.xHandle ?? null,
    personaProfile,
    startIndex,
    maxReplies,
    sendTimeoutMs,
    pollIntervalMs,
    continueOnUnconfirmed,
    async onDraftPrepared({ draft, totalDrafts }) {
      console.log(
        `Prepared draft ${draft.queueIndex + 1}/${totalDrafts} for ${draft.url}`
      );
      console.log(`Reply text: ${draft.replyText}`);
      console.log(
        `Waiting for you to click Reply in Chrome. Timeout: ${sendTimeoutMs}ms`
      );
    },
    async onDraftOutcome(outcome) {
      console.log(
        `Draft ${outcome.draftIndex ?? outcome.sourceIndex} status: ${outcome.status}`
      );
      if (outcome.status === "sent") {
        console.log(`Logged sent reply for ${outcome.tweetUrl}`);
      } else {
        console.log(`Stopped after unconfirmed manual action for ${outcome.tweetUrl}`);
      }
    },
  });

  const output = {
    generatedAt: new Date().toISOString(),
    processedCount: result.processedCount,
    sentCount: result.sentCount,
    stoppedEarly: result.stoppedEarly,
    requestedDraftCount: result.requestedDraftCount,
    outcomes: result.outcomes,
  };

  if (writeFilePath) {
    await writeFile(path.resolve(writeFilePath), `${JSON.stringify(output, null, 2)}\n`, "utf8");
    console.log(`Wrote manual reply queue summary to ${path.resolve(writeFilePath)}`);
  } else {
    console.log(JSON.stringify(output, null, 2));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("run-manual-reply-queue failed:", error?.message ?? error);
    process.exit(1);
  });
}
