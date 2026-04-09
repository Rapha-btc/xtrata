#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ChromeAppleScriptAdapter } from "../browser/chromeAppleScriptAdapter.js";
import { resolveBrowserPersona } from "../browser/profileRegistry.js";
import { prepareReplyComposer } from "../x/replyComposer.js";

function getArg(prefix) {
  const entry = process.argv.find((value) => value.startsWith(`${prefix}=`));
  return entry ? entry.slice(prefix.length + 1) : null;
}

async function resolveDraftSelection(draftFilePath, draftIndex = 0) {
  const parsed = JSON.parse(await readFile(path.resolve(draftFilePath), "utf8"));
  const enrichedDrafts = Array.isArray(parsed?.enrichedDrafts) ? parsed.enrichedDrafts : null;
  const plainDrafts = Array.isArray(parsed?.value?.drafts) ? parsed.value.drafts : null;
  const source = enrichedDrafts ?? plainDrafts;

  if (!Array.isArray(source) || source.length === 0) {
    throw new Error(`${draftFilePath} did not contain any drafts.`);
  }

  const selected = source[draftIndex];
  if (!selected) {
    throw new Error(`${draftFilePath} does not contain draft index ${draftIndex}.`);
  }
  if (selected.ready === false) {
    throw new Error(`Draft index ${draftIndex} is marked not ready.`);
  }

  return selected;
}

async function main() {
  const persona = getArg("--persona");
  const browserName = getArg("--browser") ?? "Google Chrome";
  const expectedHandle = getArg("--handle") ?? null;
  const tweetUrlArg = getArg("--tweet-url");
  const replyTextArg = getArg("--reply-text");
  const draftFile = getArg("--draft-file");
  const draftIndex = Number.parseInt(getArg("--draft-index") ?? "0", 10);
  const writeFilePath = getArg("--write-file");

  let selectedDraft = null;
  if (draftFile) {
    selectedDraft = await resolveDraftSelection(draftFile, Number.isFinite(draftIndex) ? draftIndex : 0);
  }

  const tweetUrl = tweetUrlArg ?? selectedDraft?.url ?? selectedDraft?.target?.url ?? null;
  const replyText = replyTextArg ?? selectedDraft?.replyText ?? null;
  if (!tweetUrl) {
    throw new Error("Missing required argument: --tweet-url=... or provide --draft-file=...");
  }
  if (!replyText?.trim()) {
    throw new Error("Missing required argument: --reply-text=... or provide a draft file with replyText.");
  }

  const personaProfile = persona ? await resolveBrowserPersona(persona) : null;
  const adapter = new ChromeAppleScriptAdapter({
    browserName: personaProfile?.browserName ?? browserName,
  });
  const result = await prepareReplyComposer({
    adapter,
    tweetUrl,
    replyText,
    expectedHandle: expectedHandle ?? personaProfile?.xHandle ?? null,
    personaProfile,
  });

  const output = {
    generatedAt: new Date().toISOString(),
    tweetUrl: result.tweetUrl,
    navigationAction: result.navigation.action,
    openAction: result.opened.action,
    expectedText: result.expectedText,
    filledText: result.state.composerText,
    textMatches: result.textMatches,
    characterCount: result.state.characterCount,
    canSubmit: result.state.canSubmit,
    state: result.state,
  };

  if (writeFilePath) {
    await writeFile(path.resolve(writeFilePath), `${JSON.stringify(output, null, 2)}\n`, "utf8");
    console.log(`Prepared reply composer for ${result.tweetUrl} and wrote state to ${path.resolve(writeFilePath)}`);
  } else {
    console.log(JSON.stringify(output, null, 2));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("prepare-reply-composer failed:", error?.message ?? error);
    process.exit(1);
  });
}
