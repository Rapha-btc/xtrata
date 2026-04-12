import fs from "node:fs/promises";

export async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

export async function writeText(filePath, value) {
  await fs.writeFile(filePath, value, "utf8");
}

export async function readJson(filePath) {
  const raw = await readText(filePath);
  return JSON.parse(raw);
}

export async function readJsonIfExists(filePath, fallback = null) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return fallback;
  }
}

export async function writeJson(filePath, value) {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
