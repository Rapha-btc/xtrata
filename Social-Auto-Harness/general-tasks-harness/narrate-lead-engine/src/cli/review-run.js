import { loadRunArtifacts } from "../runReview.js";

function readOption(argv, optionName) {
  const option = argv.find((value) => value.startsWith(`${optionName}=`));
  return option ? option.slice(optionName.length + 1) : null;
}

export async function reviewRunCli({
  argv = process.argv.slice(2),
} = {}) {
  const runId = readOption(argv, "--run-id");

  if (!runId?.trim()) {
    throw new Error("review-run failed: --run-id is required.");
  }

  return loadRunArtifacts({ runId });
}

const isDirectExecution = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isDirectExecution) {
  reviewRunCli()
    .then((result) => {
      console.log(
        JSON.stringify(
          {
            runId: result.runId,
            runDir: result.runDir,
            status: result.manifest?.status ?? null,
            review: result.review,
            error: result.error,
            artifacts: result.manifest?.artifacts ?? null,
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
