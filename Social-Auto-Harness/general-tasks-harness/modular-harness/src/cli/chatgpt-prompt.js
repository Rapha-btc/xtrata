#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { ChromeAppleScriptAdapter } from "../browser/chromeAppleScriptAdapter.js";
import { resolveBrowserPersona } from "../browser/profileRegistry.js";
import { sendPromptAndReadReply } from "../chatgpt/sendPromptAndReadReply.js";

function getArg(prefix) {
  const entry = process.argv.find((value) => value.startsWith(`${prefix}=`));
  return entry ? entry.slice(prefix.length + 1) : null;
}

async function main() {
  const prompt = getArg("--prompt");
  if (!prompt) {
    throw new Error('Missing required argument: --prompt="Your prompt text"');
  }

  const browserName = getArg("--browser") ?? "Google Chrome";
  const expectedAccountHint = getArg("--account") ?? null;
  const persona = getArg("--persona");
  const personaProfile = persona ? await resolveBrowserPersona(persona) : null;
  const adapter = new ChromeAppleScriptAdapter({
    browserName: personaProfile?.browserName ?? browserName,
  });
  const result = await sendPromptAndReadReply({
    adapter,
    prompt,
    expectedAccountHint,
    personaProfile,
  });

  console.log(`Browser: ${personaProfile?.browserName ?? browserName}`);
  if (personaProfile) {
    console.log(`Persona: ${personaProfile.persona}`);
  }
  console.log(`Session action: ${result.session.action}`);
  console.log(`URL: ${result.replyState.url}`);
  console.log("Reply:");
  console.log(result.replyText);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("chatgpt-prompt failed:", error?.message ?? error);
    process.exit(1);
  });
}
