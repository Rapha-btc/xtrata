import os from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";

export const DEFAULT_PERSONA_REGISTRY_PATH = new URL("../../config/browser-personas.json", import.meta.url);

export function getChromeLocalStatePath(browserName = "Google Chrome", homeDir = os.homedir()) {
  const appSupportByBrowser = {
    "Google Chrome": "Google/Chrome",
    "Google Chrome Beta": "Google/Chrome Beta",
    "Google Chrome Canary": "Google/Chrome Canary",
  };
  const appSupportPath = appSupportByBrowser[browserName];
  if (!appSupportPath) {
    throw new Error(`Unsupported Chrome-family browser for profile resolution: ${browserName}.`);
  }

  return path.join(homeDir, "Library", "Application Support", appSupportPath, "Local State");
}

async function readJsonFile(filePath) {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

function normalizeName(value) {
  return value?.trim().toLowerCase() || null;
}

export function resolveChromeProfileDirectory(profileName, localState) {
  const normalizedProfileName = normalizeName(profileName);
  if (!normalizedProfileName) return null;

  const infoCache = localState?.profile?.info_cache ?? {};
  for (const [profileDirectory, info] of Object.entries(infoCache)) {
    if (normalizeName(info?.name) === normalizedProfileName) {
      return profileDirectory;
    }
  }

  return null;
}

export async function loadPersonaRegistry(registryPath = DEFAULT_PERSONA_REGISTRY_PATH) {
  return readJsonFile(registryPath);
}

export async function loadChromeLocalState(localStatePath) {
  return readJsonFile(localStatePath);
}

export async function resolveBrowserPersona(persona, {
  registry = null,
  registryPath = DEFAULT_PERSONA_REGISTRY_PATH,
  localState = null,
  localStatePath = null,
} = {}) {
  if (typeof persona !== "string" || !persona.trim()) {
    throw new TypeError("persona must be a non-empty string.");
  }

  const personaRegistry = registry ?? (await loadPersonaRegistry(registryPath));
  const personaEntry = personaRegistry?.[persona];
  if (!personaEntry) {
    throw new Error(`Browser persona "${persona}" was not found in the persona registry.`);
  }

  const browserName = personaEntry.browserName ?? "Google Chrome";
  const profileDirectory =
    personaEntry.profileDirectory ??
    resolveChromeProfileDirectory(
      personaEntry.profileName,
      localState ?? (await loadChromeLocalState(localStatePath ?? getChromeLocalStatePath(browserName)))
    );

  if (!profileDirectory) {
    throw new Error(
      `Could not resolve a Chrome profile directory for persona "${persona}". Set "profileDirectory" or a matching "profileName" in the persona registry.`
    );
  }

  return {
    persona,
    browserName,
    profileName: personaEntry.profileName ?? null,
    profileDirectory,
    xHandle: personaEntry.xHandle ?? null,
    bootstrapUrl: personaEntry.bootstrapUrl ?? null,
  };
}
