import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readJsonIfExists } from "../src/lib/fs.js";

test("readJsonIfExists returns the fallback for a missing file", async () => {
  const missingPath = path.join(os.tmpdir(), `xtrata-missing-${Date.now()}.json`);
  const result = await readJsonIfExists(missingPath, []);

  assert.deepEqual(result, []);
});

test("readJsonIfExists throws for malformed JSON", async () => {
  const tempPath = path.join(os.tmpdir(), `xtrata-invalid-${Date.now()}.json`);
  await fs.writeFile(tempPath, "{", "utf8");

  try {
    await assert.rejects(() => readJsonIfExists(tempPath, []), SyntaxError);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
});
