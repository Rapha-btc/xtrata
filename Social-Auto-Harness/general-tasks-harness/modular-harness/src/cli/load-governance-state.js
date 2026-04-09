import path from "node:path";

import { loadGovernanceState } from "../governance/loadGovernanceState.js";

function readOption(argv, optionName) {
  const option = argv.find((value) => value.startsWith(`${optionName}=`));
  return option ? option.slice(optionName.length + 1) : null;
}

const argv = process.argv.slice(2);
const baseDir = path.resolve(readOption(argv, "--base-dir") ?? process.cwd());
const createMissingPendingImprovements = argv.includes("--create-missing-pending");

try {
  const governanceState = await loadGovernanceState({
    baseDir,
    createMissingPendingImprovements,
  });

  console.log(
    JSON.stringify(
      {
        baseDir: governanceState.baseDir,
        currentMode: governanceState.mode.currentMode,
        currentConfigKeys: Object.keys(governanceState.mode.currentConfig),
        cooldownAuthors: governanceState.diversity.cooldownAuthors.length,
        lastStrategyUsed: governanceState.diversity.lastStrategyUsed,
        lastStandaloneAngle: governanceState.diversity.lastStandaloneAngle,
        followedAccounts: governanceState.followedAccounts.handles.length,
        pendingImprovements: governanceState.pendingImprovements.pendingItems.length,
        warnings: governanceState.warnings,
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(`load-governance-state failed: ${error.message}`);
  process.exitCode = 1;
}
