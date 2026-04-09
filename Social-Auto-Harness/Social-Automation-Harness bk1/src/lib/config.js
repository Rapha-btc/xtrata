import path from "path";

import { readJson } from "./fs.js";
import { CONFIG_DIR } from "./paths.js";

const CONFIG_FILES = [
  "mode.json",
  "filters.json",
  "keywords.json",
  "sources.json",
  "tone.json",
  "accounts.json",
];

export async function loadConfig() {
  const pairs = await Promise.all(
    CONFIG_FILES.map(async (name) => [name, await readJson(path.join(CONFIG_DIR, name))])
  );

  return Object.fromEntries(
    pairs.map(([name, value]) => [name.replace(/\.json$/, ""), value])
  );
}
