#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { ChromeAppleScriptAdapter } from "../browser/chromeAppleScriptAdapter.js";
import { resolveBrowserPersona } from "../browser/profileRegistry.js";
import {
  DEFAULT_CHATGPT_URL,
  ensureChatGPTSession,
} from "../session/ensureChatGPTSession.js";

function getArg(prefix) {
  const entry = process.argv.find((value) => value.startsWith(`${prefix}=`));
  return entry ? entry.slice(prefix.length + 1) : null;
}

async function main() {
  const expectedAccountHint = getArg("--account");
  const persona = getArg("--persona");
  const browserName = getArg("--browser") ?? "Google Chrome";
  const targetUrl = getArg("--url") ?? DEFAULT_CHATGPT_URL;
  const personaProfile = persona ? await resolveBrowserPersona(persona) : null;
  const adapter = new ChromeAppleScriptAdapter({
    browserName: personaProfile?.browserName ?? browserName,
  });
  const result = await ensureChatGPTSession({
    adapter,
    expectedAccountHint,
    personaProfile,
    targetUrl,
  });

  console.log(`Browser: ${personaProfile?.browserName ?? browserName}`);
  console.log(`Action: ${result.action}`);
  if (personaProfile) {
    console.log(`Persona: ${personaProfile.persona}`);
    console.log(`Profile directory: ${personaProfile.profileDirectory}`);
  }
  console.log("Logged in: yes");
  if (result.expectedAccountHint) {
    console.log(`Expected account hint: ${result.expectedAccountHint}`);
  }
  if (result.actualAccountHint) {
    console.log(`Confirmed account hint: ${result.actualAccountHint}`);
  }
  console.log(`URL: ${result.state.url}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("ensure-chatgpt-session failed:", error?.message ?? error);
    process.exit(1);
  });
}
