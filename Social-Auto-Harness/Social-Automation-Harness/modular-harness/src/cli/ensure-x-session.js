#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { ChromeAppleScriptAdapter } from "../browser/chromeAppleScriptAdapter.js";
import { resolveBrowserPersona } from "../browser/profileRegistry.js";
import { DEFAULT_X_URL, ensureXSession } from "../session/ensureXSession.js";

function getArg(prefix) {
  const entry = process.argv.find((value) => value.startsWith(`${prefix}=`));
  return entry ? entry.slice(prefix.length + 1) : null;
}

async function main() {
  const expectedHandle = getArg("--handle");
  if (!expectedHandle) {
    throw new Error("Missing required argument: --handle=@expectedUser");
  }

  const persona = getArg("--persona");
  const browserName = getArg("--browser") ?? "Google Chrome";
  const targetUrl = getArg("--url") ?? DEFAULT_X_URL;
  const personaProfile = persona ? await resolveBrowserPersona(persona) : null;
  const adapter = new ChromeAppleScriptAdapter({
    browserName: personaProfile?.browserName ?? browserName,
  });
  const result = await ensureXSession({
    adapter,
    expectedHandle,
    personaProfile,
    targetUrl,
  });

  console.log(`Browser: ${personaProfile?.browserName ?? browserName}`);
  console.log(`Action: ${result.action}`);
  if (result.profileDirectory) {
    console.log(`Profile directory: ${result.profileDirectory}`);
  }
  console.log(`Expected handle: @${result.expectedHandle}`);
  console.log(`Confirmed handle: @${result.actualHandle}`);
  console.log(`URL: ${result.state.url}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("ensure-x-session failed:", error?.message ?? error);
    process.exit(1);
  });
}
