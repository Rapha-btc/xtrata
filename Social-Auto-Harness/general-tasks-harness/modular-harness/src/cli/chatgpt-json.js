#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { ChromeAppleScriptAdapter } from "../browser/chromeAppleScriptAdapter.js";
import { resolveBrowserPersona } from "../browser/profileRegistry.js";
import { sendPromptForJson } from "../chatgpt/sendPromptForJson.js";

function getArg(prefix) {
  const entry = process.argv.find((value) => value.startsWith(`${prefix}=`));
  return entry ? entry.slice(prefix.length + 1) : null;
}

function parseCsvArg(value) {
  return value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean) ?? [];
}

async function main() {
  const prompt = getArg("--prompt");
  if (!prompt) {
    throw new Error('Missing required argument: --prompt="Your prompt text"');
  }

  const browserName = getArg("--browser") ?? "Google Chrome";
  const persona = getArg("--persona");
  const expectedAccountHint = getArg("--account") ?? null;
  const schemaDescription = getArg("--schema") ?? null;
  const expectedType = getArg("--type") ?? null;
  const requiredKeys = parseCsvArg(getArg("--require-keys"));

  const personaProfile = persona ? await resolveBrowserPersona(persona) : null;
  const adapter = new ChromeAppleScriptAdapter({
    browserName: personaProfile?.browserName ?? browserName,
  });
  const result = await sendPromptForJson({
    adapter,
    prompt,
    expectedAccountHint,
    personaProfile,
    schemaDescription,
    expectedType,
    requiredKeys,
  });

  console.log(`Browser: ${personaProfile?.browserName ?? browserName}`);
  if (personaProfile) {
    console.log(`Persona: ${personaProfile.persona}`);
  }
  console.log(`Session action: ${result.session.action}`);
  console.log(`URL: ${result.replyState.url}`);
  console.log("JSON:");
  console.log(JSON.stringify(result.value, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("chatgpt-json failed:", error?.message ?? error);
    process.exit(1);
  });
}
