import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveBrowserPersona,
  resolveChromeProfileDirectory,
} from "../src/browser/profileRegistry.js";

test("resolveChromeProfileDirectory matches the Chrome profile name case-insensitively", () => {
  const localState = {
    profile: {
      info_cache: {
        Default: { name: "Personal" },
        "Profile 3": { name: "xtrata" },
      },
    },
  };

  assert.equal(resolveChromeProfileDirectory("XTRATA", localState), "Profile 3");
});

test("resolveBrowserPersona prefers an explicit profile directory from the registry", async () => {
  const persona = await resolveBrowserPersona("xtrata", {
    registry: {
      xtrata: {
        browserName: "Google Chrome",
        profileDirectory: "Profile 7",
        xHandle: "@xtratalayers",
      },
    },
  });

  assert.deepEqual(persona, {
    persona: "xtrata",
    browserName: "Google Chrome",
    profileName: null,
    profileDirectory: "Profile 7",
    xHandle: "@xtratalayers",
    bootstrapUrl: null,
  });
});

test("resolveBrowserPersona resolves the Chrome profile directory from Local State", async () => {
  const persona = await resolveBrowserPersona("xtrata", {
    registry: {
      xtrata: {
        profileName: "xtrata",
        xHandle: "@xtratalayers",
        bootstrapUrl: "https://x.com/home",
      },
    },
    localState: {
      profile: {
        info_cache: {
          Default: { name: "Personal" },
          "Profile 3": { name: "xtrata" },
        },
      },
    },
  });

  assert.deepEqual(persona, {
    persona: "xtrata",
    browserName: "Google Chrome",
    profileName: "xtrata",
    profileDirectory: "Profile 3",
    xHandle: "@xtratalayers",
    bootstrapUrl: "https://x.com/home",
  });
});

test("resolveBrowserPersona throws when the persona is missing from the registry", async () => {
  await assert.rejects(
    () => resolveBrowserPersona("missing", { registry: {} }),
    /Browser persona "missing" was not found in the persona registry\./
  );
});

test("resolveBrowserPersona rejects non-string persona inputs early", async () => {
  await assert.rejects(
    () => resolveBrowserPersona({ persona: "xtrata" }, { registry: {} }),
    /persona must be a non-empty string\./
  );
});
