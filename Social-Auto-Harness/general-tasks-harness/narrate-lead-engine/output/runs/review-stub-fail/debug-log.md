# Narrate Debug Log - review-stub-fail

Generated: 2026-04-12T23:12:23.363Z
Status: failed

## Failure

- Message: ChatGPT reply did not contain valid JSON. after 2 attempts.

## Counts

- queriesPlanned: 1
- collected: 0
- normalized: 0
- leads: 0
- drafted: 0

## Timeline

- 2026-04-12T23:12:23.360Z [progress] lead-engine:start runId="review-stub-fail" runDir="/Users/melophonic/Documents/GitHub/xtrata/Social-Auto-Harness/general-tasks-harness/narrate-lead-engine/output/runs/review-stub-fail" jobFilePath="/Users/melophonic/Documents/GitHub/xtrata/Social-Auto-Harness/general-tasks-harness/narrate-lead-engine/jobs/safe-smoke-test.json"
- 2026-04-12T23:12:23.362Z [progress] lead-engine:job-loaded sourceCount=1 queryCount=1 persona=null chatgptReplyMaxChecks=240 chatgptReplyWaitMs=1000 rssMb=47.8 heapUsedMb=5.6 heapTotalMb=7.4 externalMb=2.1 arrayBuffersMb=0.1
- 2026-04-12T23:12:23.362Z [invalid-reply] kind=invalid-json attempt=2 label="stub-failure" files={"rawReplyFile":"/Users/melophonic/Documents/GitHub/xtrata/Social-Auto-Harness/general-tasks-harness/narrate-lead-engine/output/runs/review-stub-fail/invalid-replies/001-invalid-json.raw.txt","promptFile":"/Users/melophonic/Documents/GitHub/xtrata/Social-Auto-Harness/general-tasks-harness/narrate-lead-engine/output/runs/review-stub-fail/invalid-replies/001-invalid-json.prompt.txt","metaFile":"/Users/melophonic/Documents/GitHub/xtrata/Social-Auto-Harness/general-tasks-harness/narrate-lead-engine/output/runs/review-stub-fail/invalid-replies/001-invalid-json.meta.json"}
- 2026-04-12T23:12:23.363Z [progress] lead-engine:failed message="ChatGPT reply did not contain valid JSON. after 2 attempts." rssMb=48 heapUsedMb=5.7 heapTotalMb=7.4 externalMb=2.1 arrayBuffersMb=0.1
