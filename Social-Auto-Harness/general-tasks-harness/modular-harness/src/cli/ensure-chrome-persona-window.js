#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { ChromeAppleScriptAdapter } from "../browser/chromeAppleScriptAdapter.js";
import { ensureChromePersonaWindow } from "../browser/ensureChromePersonaWindow.js";
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

  const resolvedPersona = await resolveBrowserPersona(persona);
  const adapter = new ChromeAppleScriptAdapter({
    browserName: resolvedPersona.browserName,
  });

  const result = await ensureChromePersonaWindow({
    adapter,
    persona: resolvedPersona.persona,
    profileDirectory: resolvedPersona.profileDirectory,
    expectedXHandle: resolvedPersona.xHandle,
    targetUrl: resolvedPersona.bootstrapUrl,
  });

  console.log(`Browser: ${resolvedPersona.browserName}`);
  console.log(`Persona: ${resolvedPersona.persona}`);
  console.log(`Action: ${result.action}`);
  console.log(`Profile directory: ${result.profileDirectory}`);
  console.log(`Confirmed X handle: @${result.actualXHandle}`);
  console.log(`URL: ${result.state.url}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("ensure-chrome-persona-window failed:", error?.message ?? error);
    process.exit(1);
  });
}
