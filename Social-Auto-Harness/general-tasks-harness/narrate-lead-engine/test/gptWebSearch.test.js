import assert from "node:assert/strict";
import test from "node:test";

import { buildGptLeadSearchPrompt } from "../src/sources/gptWebSearch.js";

test("buildGptLeadSearchPrompt forbids greetings and clarifying questions", () => {
  const prompt = buildGptLeadSearchPrompt({
    job: {
      objective: "Find audiobook production pain.",
      maxResultsPerQuery: 3,
    },
    queryPlan: {
      query: "\"audiobook\" expensive",
    },
  });

  assert.match(prompt, /Do not greet the user/i);
  assert.match(prompt, /do not ask clarifying questions/i);
  assert.match(prompt, /empty items array/i);
});
