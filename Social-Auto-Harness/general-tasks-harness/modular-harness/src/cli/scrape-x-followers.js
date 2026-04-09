import { writeFile } from "node:fs/promises";
import path from "node:path";

import { ChromeAppleScriptAdapter } from "../browser/chromeAppleScriptAdapter.js";
import { resolveBrowserPersona } from "../browser/profileRegistry.js";
import { scrapeXFollowers } from "../x/scrapeXFollowers.js";

function readOption(argv, optionName) {
  const option = argv.find((value) => value.startsWith(`${optionName}=`));
  return option ? option.slice(optionName.length + 1) : null;
}

const argv = process.argv.slice(2);
const persona = readOption(argv, "--persona");
const explicitHandle = readOption(argv, "--handle");
const sourceHandle = readOption(argv, "--source");
const writeFilePath = readOption(argv, "--write-file");

if (!sourceHandle?.trim()) {
  console.error("scrape-x-followers failed: --source is required.");
  process.exit(1);
}

let personaProfile = null;
if (persona) {
  try {
    personaProfile = await resolveBrowserPersona(persona);
  } catch (error) {
    console.error(`scrape-x-followers failed: ${error.message}`);
    process.exit(1);
  }
}

try {
  const adapter = new ChromeAppleScriptAdapter();
  const result = await scrapeXFollowers({
    adapter,
    sourceHandle,
    expectedHandle: explicitHandle ?? personaProfile?.xHandle ?? null,
    personaProfile,
  });

  const output = JSON.stringify(result.candidates, null, 2);
  if (writeFilePath) {
    await writeFile(path.resolve(writeFilePath), `${output}\n`, "utf8");
    console.log(`Wrote ${result.candidates.length} follower candidates to ${path.resolve(writeFilePath)}`);
    if (result.candidates.length === 0) {
      console.log(`Followers URL: ${result.state?.url ?? result.followersUrl}`);
      console.log(`Loading: ${result.state?.loading ? "yes" : "no"}`);
      console.log(`Candidate cells seen: ${result.state?.candidateCellCount ?? 0}`);
      console.log(`Profile anchors seen: ${result.state?.profileAnchorCount ?? 0}`);
      if (result.state?.emptyStateText) {
        console.log(`Empty state: ${result.state.emptyStateText}`);
      }
      if (Array.isArray(result.state?.sampledProfileLinks) && result.state.sampledProfileLinks.length > 0) {
        console.log(`Sample profile links: ${result.state.sampledProfileLinks.join(", ")}`);
      }
    }
  } else {
    console.log(output);
  }
} catch (error) {
  console.error(`scrape-x-followers failed: ${error.message}`);
  process.exitCode = 1;
}
