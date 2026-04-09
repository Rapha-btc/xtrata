import { sendPromptAndReadReply } from "./sendPromptAndReadReply.js";

function detectJsonType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeJsonControlCharacters(candidate) {
  let normalized = "";
  let inString = false;
  let escaping = false;

  for (let index = 0; index < candidate.length; index += 1) {
    const char = candidate[index];

    if (inString) {
      if (escaping) {
        normalized += char;
        escaping = false;
        continue;
      }

      if (char === "\\") {
        normalized += char;
        escaping = true;
        continue;
      }

      if (char === "\"") {
        normalized += char;
        inString = false;
        continue;
      }

      if (char === "\n") {
        normalized += "\\n";
        continue;
      }

      if (char === "\r") {
        normalized += "\\r";
        continue;
      }

      if (char === "\t") {
        normalized += "\\t";
        continue;
      }

      normalized += char;
      continue;
    }

    if (char === "\"") {
      normalized += char;
      inString = true;
      continue;
    }

    normalized += char;
  }

  return normalized.replace(/;\s*$/, "");
}

function extractCodeFenceCandidates(text) {
  const candidates = [];
  const codeFencePattern = /```(?:json|JSON)?\s*([\s\S]*?)```/g;

  let match = codeFencePattern.exec(text);
  while (match) {
    const body = match[1]?.trim();
    if (body) candidates.push(body);
    match = codeFencePattern.exec(text);
  }

  return candidates;
}

function findBalancedJsonCandidate(text) {
  for (let start = 0; start < text.length; start += 1) {
    const opening = text[start];
    if (opening !== "{" && opening !== "[") continue;

    const stack = [opening];
    let inString = false;
    let escaping = false;

    for (let index = start + 1; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaping) {
          escaping = false;
        } else if (char === "\\") {
          escaping = true;
        } else if (char === "\"") {
          inString = false;
        }

        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }

      if (char === "{" || char === "[") {
        stack.push(char);
        continue;
      }

      if (char === "}" || char === "]") {
        const last = stack.at(-1);
        const matches =
          (char === "}" && last === "{") ||
          (char === "]" && last === "[");

        if (!matches) break;

        stack.pop();
        if (stack.length === 0) {
          return text.slice(start, index + 1).trim();
        }
      }
    }
  }

  return null;
}

function parseJsonCandidate(candidate) {
  try {
    return {
      jsonText: candidate,
      value: JSON.parse(candidate),
    };
  } catch (error) {
    const normalizedCandidate = normalizeJsonControlCharacters(candidate);
    if (normalizedCandidate !== candidate) {
      return {
        jsonText: normalizedCandidate,
        value: JSON.parse(normalizedCandidate),
      };
    }

    throw error;
  }
}

export function buildJsonOnlyPrompt(prompt, { schemaDescription = null } = {}) {
  const parts = [
    prompt.trim(),
    "Return exactly one valid JSON value and nothing else.",
    "Do not wrap the JSON in markdown fences.",
    "Do not add explanation before or after the JSON.",
  ];

  if (schemaDescription?.trim()) {
    parts.push(`JSON schema requirements:\n${schemaDescription.trim()}`);
  }

  return parts.join("\n\n");
}

export function buildJsonRepairPrompt(
  prompt,
  {
    schemaDescription = null,
    previousReplyText = null,
    previousErrorMessage = null,
  } = {}
) {
  const parts = [
    "Your previous reply was not valid JSON for the requested schema.",
    prompt.trim(),
    "Return exactly one valid JSON value and nothing else.",
    "Do not wrap the JSON in markdown fences.",
    "Do not add explanation before or after the JSON.",
  ];

  if (previousErrorMessage?.trim()) {
    parts.push(`Previous validation error:\n${previousErrorMessage.trim()}`);
  }

  if (previousReplyText?.trim()) {
    parts.push(`Previous invalid reply:\n${previousReplyText.trim().slice(0, 1500)}`);
  }

  if (schemaDescription?.trim()) {
    parts.push(`JSON schema requirements:\n${schemaDescription.trim()}`);
  }

  return parts.join("\n\n");
}

export function extractJsonText(replyText) {
  const normalizedReply = replyText?.trim();
  if (!normalizedReply) {
    throw new Error("ChatGPT reply did not contain valid JSON.");
  }

  const candidates = unique([
    normalizedReply,
    ...extractCodeFenceCandidates(normalizedReply),
    findBalancedJsonCandidate(normalizedReply),
  ]);

  for (const candidate of candidates) {
    try {
      return parseJsonCandidate(candidate).jsonText;
    } catch {
      continue;
    }
  }

  throw new Error("ChatGPT reply did not contain valid JSON.");
}

export function parseJsonReply(replyText) {
  const jsonText = extractJsonText(replyText);
  return {
    jsonText,
    value: parseJsonCandidate(jsonText).value,
  };
}

export function validateJsonValue(
  value,
  { expectedType = null, requiredKeys = [], validate = null } = {}
) {
  const actualType = detectJsonType(value);

  if (expectedType && actualType !== expectedType) {
    throw new Error(`Expected JSON type "${expectedType}", but received "${actualType}".`);
  }

  if (requiredKeys.length > 0) {
    if (actualType !== "object") {
      throw new Error("Required-key validation needs a JSON object result.");
    }

    const missingKeys = requiredKeys.filter((key) => !(key in value));
    if (missingKeys.length > 0) {
      throw new Error(`JSON result is missing required keys: ${missingKeys.join(", ")}.`);
    }
  }

  if (typeof validate === "function") {
    const result = validate(value);
    if (result === false) {
      throw new Error("Custom JSON validation failed.");
    }

    if (typeof result === "string" && result.trim()) {
      throw new Error(result.trim());
    }
  }

  return value;
}

export async function sendPromptForJson({
  adapter,
  prompt,
  expectedAccountHint = null,
  personaProfile = null,
  targetUrl,
  schemaDescription = null,
  expectedType = null,
  requiredKeys = [],
  validate = null,
  sendPromptAndReadReplyFn = sendPromptAndReadReply,
  maxJsonAttempts = 2,
  ...replyOptions
} = {}) {
  if (!adapter) throw new TypeError("adapter is required.");
  if (!prompt?.trim()) throw new TypeError("prompt is required.");

  const totalAttempts = Math.max(1, Number.isFinite(maxJsonAttempts) ? maxJsonAttempts : 2);
  let lastError = null;
  let lastReply = null;
  let lastDispatchedPrompt = buildJsonOnlyPrompt(prompt, { schemaDescription });

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    const dispatchedPrompt =
      attempt === 1
        ? buildJsonOnlyPrompt(prompt, { schemaDescription })
        : buildJsonRepairPrompt(prompt, {
            schemaDescription,
            previousReplyText: lastReply?.replyText ?? null,
            previousErrorMessage: lastError?.message ?? null,
          });
    lastDispatchedPrompt = dispatchedPrompt;

    const reply = await sendPromptAndReadReplyFn({
      adapter,
      prompt: dispatchedPrompt,
      expectedAccountHint,
      personaProfile,
      targetUrl: attempt > 1 ? lastReply?.replyState?.url ?? targetUrl : targetUrl,
      existingSession: attempt > 1 ? lastReply?.session ?? null : null,
      ...replyOptions,
    });
    lastReply = reply;

    try {
      const { jsonText, value } = parseJsonReply(reply.replyText);
      validateJsonValue(value, {
        expectedType,
        requiredKeys,
        validate,
      });

      return {
        ok: true,
        prompt: prompt.trim(),
        dispatchedPrompt,
        jsonText,
        value,
        rawReplyText: reply.replyText,
        session: reply.session,
        submit: reply.submit,
        replyState: reply.replyState,
      };
    } catch (error) {
      lastError = error;
      if (attempt >= totalAttempts) {
        const finalError = new Error(
          `${error.message} after ${totalAttempts} attempt${totalAttempts === 1 ? "" : "s"}.`
        );
        finalError.cause = error;
        finalError.rawReplyText = reply?.replyText ?? null;
        finalError.dispatchedPrompt = lastDispatchedPrompt;
        throw finalError;
      }
    }
  }

  throw lastError ?? new Error("ChatGPT JSON request failed.");
}
