import { runLeadEngine } from "../runLeadEngine.js";

function readOption(argv, optionName) {
  const option = argv.find((value) => value.startsWith(`${optionName}=`));
  return option ? option.slice(optionName.length + 1) : null;
}

export async function runLeadEngineCli({
  argv = process.argv.slice(2),
  dependencies = {},
} = {}) {
  const jobFilePath = readOption(argv, "--job-file");
  const runId = readOption(argv, "--run-id");

  if (!jobFilePath?.trim()) {
    throw new Error("run-job failed: --job-file is required.");
  }

  const result = await runLeadEngine({
    jobFilePath,
    runId,
    ...dependencies,
  });

  return result;
}

const isDirectExecution = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isDirectExecution) {
  runLeadEngineCli()
    .then((result) => {
      console.log(
        JSON.stringify(
          {
            runId: result.runId,
            runDir: result.runDir,
            counts: result.manifest.counts,
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
