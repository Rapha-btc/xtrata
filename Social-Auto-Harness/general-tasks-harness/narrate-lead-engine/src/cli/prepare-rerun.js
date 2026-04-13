import { prepareRerun } from "../rerunPlanner.js";

function readOption(argv, optionName) {
  const option = argv.find((value) => value.startsWith(`${optionName}=`));
  return option ? option.slice(optionName.length + 1) : null;
}

function hasFlag(argv, flagName) {
  return argv.includes(flagName);
}

export async function prepareRerunCli({
  argv = process.argv.slice(2),
} = {}) {
  const runId = readOption(argv, "--run-id");

  if (!runId?.trim()) {
    throw new Error("prepare-rerun failed: --run-id is required.");
  }

  return prepareRerun({
    runId,
    outputJobPath: readOption(argv, "--output-job"),
    outputPlanPath: readOption(argv, "--output-plan"),
    overwrite: hasFlag(argv, "--overwrite"),
  });
}

const isDirectExecution = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isDirectExecution) {
  prepareRerunCli()
    .then((result) => {
      console.log(
        JSON.stringify(
          {
            runId: result.runId,
            runDir: result.runDir,
            preparedJobPath: result.preparedJobPath,
            preparedPlanPath: result.preparedPlanPath,
            review: result.review,
            preparedPlan: result.preparedPlan,
          },
          null,
          2
        )
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
