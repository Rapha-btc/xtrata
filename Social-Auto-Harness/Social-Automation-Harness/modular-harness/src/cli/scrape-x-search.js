import { writeFile } from "node:fs/promises";
import path from "node:path";

import { ChromeAppleScriptAdapter } from "../browser/chromeAppleScriptAdapter.js";
import { resolveBrowserPersona } from "../browser/profileRegistry.js";
import { scrapeXSearchResults } from "../x/scrapeXSearchResults.js";

function readOption(argv, optionName) {
  const option = argv.find((value) => value.startsWith(`${optionName}=`));
  return option ? option.slice(optionName.length + 1) : null;
}

const argv = process.argv.slice(2);
const persona = readOption(argv, "--persona");
const explicitHandle = readOption(argv, "--handle");
const query = readOption(argv, "--query");
const mode = readOption(argv, "--mode") ?? "live";
const writeFilePath = readOption(argv, "--write-file");

if (!query?.trim()) {
  console.error("scrape-x-search failed: --query is required.");
  process.exit(1);
}

let personaProfile = null;
if (persona) {
  try {
    personaProfile = await resolveBrowserPersona(persona);
  } catch (error) {
    console.error(`scrape-x-search failed: ${error.message}`);
    process.exit(1);
  }
}

try {
  const adapter = new ChromeAppleScriptAdapter();
  const result = await scrapeXSearchResults({
    adapter,
    query,
    mode,
    expectedHandle: explicitHandle ?? personaProfile?.xHandle ?? null,
    personaProfile,
  });

  const output = JSON.stringify(result.candidates, null, 2);
  if (writeFilePath) {
    await writeFile(path.resolve(writeFilePath), `${output}\n`, "utf8");
    console.log(`Wrote ${result.candidates.length} search candidates to ${path.resolve(writeFilePath)}`);
  } else {
    console.log(output);
  }
} catch (error) {
  console.error(`scrape-x-search failed: ${error.message}`);
  process.exitCode = 1;
}
