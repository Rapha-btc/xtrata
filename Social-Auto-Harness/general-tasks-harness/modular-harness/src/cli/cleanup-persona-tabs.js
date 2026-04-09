#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { ChromeAppleScriptAdapter } from "../browser/chromeAppleScriptAdapter.js";
import { cleanupPersonaTabs } from "../browser/cleanupPersonaTabs.js";
import { resolveBrowserPersona } from "../browser/profileRegistry.js";

function getArg(prefix) {
  const entry = process.argv.find((value) => value.startsWith(`${prefix}=`));
  return entry ? entry.slice(prefix.length + 1) : null;
}

async function main() {
  const persona = getArg("--persona");
  if (!persona) {
    throw new Error("Missing required argument: --persona=xtrata");
  }

  const keepXTabs = Number.parseInt(getArg("--keep-x-tabs") ?? "1", 10);
  const keepChatGPTTabs = Number.parseInt(getArg("--keep-chatgpt-tabs") ?? "1", 10);
  const personaProfile = await resolveBrowserPersona(persona);
  const adapter = new ChromeAppleScriptAdapter({
    browserName: personaProfile.browserName,
  });
  const result = await cleanupPersonaTabs({
    adapter,
    personaProfile,
    keepXTabs,
    keepChatGPTTabs,
  });

  console.log(`Browser: ${personaProfile.browserName}`);
  console.log(`Persona: ${personaProfile.persona}`);
  console.log(`Window ID: ${result.windowId}`);
  console.log(`Closed tabs: ${result.closedTabs.length}`);
  console.log(`Kept X tabs: ${result.keptXTabs.length}`);
  console.log(`Kept ChatGPT tabs: ${result.keptChatGPTTabs.length}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("cleanup-persona-tabs failed:", error?.message ?? error);
    process.exit(1);
  });
}
