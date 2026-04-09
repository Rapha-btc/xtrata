function extractOutputText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string" && content.text.trim()) {
        return content.text.trim();
      }
      if (content.type === "refusal" && content.refusal) {
        throw new Error(`OpenAI refusal: ${content.refusal}`);
      }
    }
  }

  throw new Error("OpenAI response did not contain output_text.");
}

export async function createStructuredResponse({
  model,
  system,
  user,
  schemaName,
  schema,
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          schema,
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  const outputText = extractOutputText(payload);

  return {
    data: JSON.parse(outputText),
    raw: payload,
    usage: payload.usage ?? null,
    model: payload.model ?? model,
  };
}
