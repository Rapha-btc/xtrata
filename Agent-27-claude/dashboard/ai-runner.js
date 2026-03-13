const { runClaude } = require('./claude-runner');
const { buildContextPack } = require('./context-builder');

const RUNNER_NAME = 'Claude';

function extractAssistantText(output = []) {
  let text = '';

  for (const line of output) {
    try {
      const evt = JSON.parse(line);

      // Claude CLI v2.x: {type:'assistant', message:{type:'message', content:[{type:'text',text:'...'}]}}
      if (evt.type === 'assistant' && evt.message) {
        const msg = evt.message;
        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text' && block.text) text += block.text;
          }
        } else if (msg.type === 'text' && msg.text) {
          // legacy flat format
          text += msg.text;
        }
      }

      // fallback: top-level message event
      if (evt.type === 'message' && evt.role === 'assistant') {
        if (Array.isArray(evt.content)) {
          for (const block of evt.content) {
            if (block.type === 'text' && block.text) text += block.text;
          }
        } else if (typeof evt.content === 'string') {
          text += evt.content;
        }
      }
    } catch {
      // ignore non-JSON lines
    }
  }

  return text;
}

async function runTask({
  model,
  budget,
  prompt,
  cwd,
  phaseType = 'research',
  contextPack,
  extraFiles,
  onLine
}) {
  const pack = buildContextPack({
    workdir: cwd,
    pack: contextPack || phaseType,
    extraFiles
  });

  if (onLine) {
    onLine('stdout', `[context] ${pack.summary}`);
  }

  const result = await runClaude({
    model,
    budget,
    prompt: `${pack.prompt}\n\nTask Instructions:\n${prompt}`,
    cwd,
    phaseType,
    onLine
  });

  return {
    ...result,
    text: extractAssistantText(result.output),
    contextPack: {
      name: pack.name,
      files: pack.files,
      excluded: pack.excluded
    }
  };
}

module.exports = {
  RUNNER_NAME,
  runTask,
  extractAssistantText
};
