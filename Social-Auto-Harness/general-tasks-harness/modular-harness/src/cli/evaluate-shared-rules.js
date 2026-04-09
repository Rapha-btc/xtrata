import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadGovernanceState } from "../governance/loadGovernanceState.js";
import { evaluateFollowCandidates, evaluateThreadCandidates } from "../policy/sharedRulesEngine.js";

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
const threadsFile = readOption(argv, "--threads-file");
const followsFile = readOption(argv, "--follows-file");

try {
  const governanceState = await loadGovernanceState({ baseDir });
  const [threadCandidates, followCandidates] = await Promise.all([
    readJsonArray(threadsFile ? path.resolve(threadsFile) : null),
    readJsonArray(followsFile ? path.resolve(followsFile) : null),
  ]);

  const threadReport = evaluateThreadCandidates({ candidates: threadCandidates, governanceState });
  const followReport = evaluateFollowCandidates({ candidates: followCandidates, governanceState });

  console.log(
    JSON.stringify(
      {
        threads: {
          total: threadCandidates.length,
          accepted: threadReport.acceptedCandidates.length,
          rejected: threadReport.rejectedCandidates.length,
          cooldownRatio: threadReport.cooldownRatio,
          diversityGateTriggered: threadReport.diversityGateTriggered,
        },
        follows: {
          total: followCandidates.length,
          accepted: followReport.acceptedCandidates.length,
          rejected: followReport.rejectedCandidates.length,
        },
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(`evaluate-shared-rules failed: ${error.message}`);
  process.exitCode = 1;
}
