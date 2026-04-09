import fs from "fs/promises";

function isMissingFileError(error) {
  return error?.code === "ENOENT";
}

export async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

export async function readTextIfExists(filePath, fallback = null) {
  try {
    return await readText(filePath);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
    return fallback;
  }
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
    if (!isMissingFileError(error)) throw error;
    return fallback;
  }
}

export async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}
