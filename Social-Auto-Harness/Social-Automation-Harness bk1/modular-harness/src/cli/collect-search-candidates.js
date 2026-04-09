import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadGovernanceState } from "../governance/loadGovernanceState.js";
import { collectSearchCandidates } from "../x/collectSearchCandidates.js";

function readOption(argv, optionName) {
  const option = argv.find((value) => value.startsWith(`${optionName}=`));
  return option ? option.slice(optionName.length + 1) : null;
}

async function readJsonArray(filePath) {
  if (!filePath) return [];
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new TypeError(`${filePath} must contain a JSON array.`);
  }

  return parsed;
}

const argv = process.argv.slice(2);
const baseDir = path.resolve(readOption(argv, "--base-dir") ?? process.cwd());
const outputDir = path.resolve(readOption(argv, "--output-dir") ?? baseDir);
const threadsFile = readOption(argv, "--threads-file");
const followsFile = readOption(argv, "--follows-file");
const useGovernance = !argv.includes("--no-governance");

try {
  const [threadCandidates, followCandidates, governanceState] = await Promise.all([
    readJsonArray(threadsFile ? path.resolve(threadsFile) : null),
    readJsonArray(followsFile ? path.resolve(followsFile) : null),
    useGovernance ? loadGovernanceState({ baseDir }) : Promise.resolve(null),
  ]);

  const result = await collectSearchCandidates({
    threadCandidates,
    followCandidates,
    governanceState,
    outputDir,
  });

  console.log(
    JSON.stringify(
      {
        threadReport: result.threadReport,
        followReport: result.followReport,
        files: result.files,
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(`collect-search-candidates failed: ${error.message}`);
  process.exitCode = 1;
}
