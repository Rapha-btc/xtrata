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
  console.log(`[ai-runner] runTask starting: model=${model}, budget=${budget}, phaseType=${phaseType}, contextPack=${contextPack || phaseType}`);

  let pack;
  try {
    pack = buildContextPack({
      workdir: cwd,
      pack: contextPack || phaseType,
      extraFiles
    });
    console.log(`[ai-runner] Context pack built: ${pack.name}, ${pack.files.length} files, prompt ${pack.prompt.length} chars`);
  } catch (err) {
    console.error(`[ai-runner] Context pack FAILED:`, err.message);
    if (onLine) onLine('error', `[context] Build failed: ${err.message}`);
    throw err;
  }

  if (onLine) {
    onLine('stdout', `[context] ${pack.summary}`);
  }

  const fullPrompt = `${pack.prompt}\n\nTask Instructions:\n${prompt}`;
  console.log(`[ai-runner] Spawning Claude: prompt ${fullPrompt.length} chars, model ${model}`);

  let result;
  try {
    result = await runClaude({
      model,
      budget,
      prompt: fullPrompt,
      cwd,
      phaseType,
      onLine
    });
    console.log(`[ai-runner] Claude completed: ${result.output.length} output lines, code ${result.code}`);
  } catch (err) {
    console.error(`[ai-runner] Claude runner FAILED:`, err.message);
    if (onLine) onLine('error', `[runner] ${err.message}`);
    throw err;
  }

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
