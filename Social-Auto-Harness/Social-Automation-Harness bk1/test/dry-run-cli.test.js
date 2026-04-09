import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import test from "node:test";

import { DB_PATH, dbExists, getStateSummary, withDb } from "../src/lib/db.js";
import { getRunDir, REPO_ROOT } from "../src/lib/paths.js";
import { EMPTY_STATE_SUMMARY, uniqueRunId } from "../testing/helpers.js";

test("run-all dry-run does not create a run directory or mutate sqlite state", () => {
  const runId = uniqueRunId("dry-run");
  const runDir = getRunDir(runId);
  const beforeSummary = withDb(
    (db) => getStateSummary(db),
    { readOnly: true, fallback: EMPTY_STATE_SUMMARY }
  );
  const beforeMtime = dbExists() ? statSync(DB_PATH).mtimeMs : null;

  const result = spawnSync(
    process.execPath,
    ["src/cli/run-all.js", "--dry-run", `--run-id=${runId}`],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Dry run: yes \(no files written\)/);
  assert.equal(existsSync(runDir), false);

  const afterSummary = withDb(
    (db) => getStateSummary(db),
    { readOnly: true, fallback: EMPTY_STATE_SUMMARY }
  );
  assert.deepEqual(afterSummary, beforeSummary);

  if (beforeMtime !== null) {
    assert.equal(statSync(DB_PATH).mtimeMs, beforeMtime);
  }
});
