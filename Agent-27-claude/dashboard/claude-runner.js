// dashboard/claude-runner.js
const { spawn, spawnSync } = require('child_process');
const path = require('path');

const CLAUDE_BIN = '/Users/melophonic/.local/bin/claude';
const LOG_LIMIT = 500;
const activityRing = [];

// Kill timeouts per phase type (ms)
const TIMEOUTS = {
  research: 10 * 60 * 1000,    // 10 min — pulse does wallet + lineage + MCP + web search + file writes
  compose: 10 * 60 * 1000,     // 10 min — Opus draft composition
  inscription: 10 * 60 * 1000, // 10 min — Opus on-chain inscription (tx confirmation can be slow)
  skillTest: 7 * 60 * 1000
};

function addToRing(entry) {
  activityRing.push(entry);
  if (activityRing.length > LOG_LIMIT) activityRing.shift();
}

function getRunnerEnv() {
  const env = {
    ...process.env,
    PATH: `/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.HOME}/.local/bin:${process.env.PATH}`
  };
  // Unset CLAUDECODE so the child claude process doesn't refuse to start
  // thinking it's being nested inside another Claude Code session.
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  return env;
}

function preflightAuthCheck() {
  if (process.env.ANTHROPIC_API_KEY && String(process.env.ANTHROPIC_API_KEY).trim()) {
    return { ok: true, source: 'env' };
  }

  const status = spawnSync(CLAUDE_BIN, ['auth', 'status'], {
    env: getRunnerEnv(),
    encoding: 'utf8'
  });

  const raw = (status.stdout || '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.loggedIn) {
        return { ok: true, source: parsed.authMethod || 'cli' };
      }
    } catch {
      // ignore parse issues and fall through to error
    }
  }

  return {
    ok: false,
    reason: 'Claude CLI is not authenticated. Run `claude auth login` or set `ANTHROPIC_API_KEY`.'
  };
}

function extractResultError(rawLines) {
  for (let i = rawLines.length - 1; i >= 0; i--) {
    try {
      const evt = JSON.parse(rawLines[i]);
      if (evt.type === 'result' && evt.is_error) {
        if (Array.isArray(evt.errors) && evt.errors.length > 0) {
          return String(evt.errors[0]).split('\n')[0];
        }
        if (evt.subtype) return evt.subtype;
      }
    } catch {
      // ignore non-JSON lines
    }
  }
  return null;
}

function normalizeAssistantBlocks(message) {
  if (!message) return [];
  if (Array.isArray(message.content)) return message.content;

  const block = { ...message };
  if (!block.type && typeof message.text === 'string') {
    block.type = 'text';
  }
  return [block];
}

function formatToolUse(block) {
  const name = block.name || 'unknown';
  const input = block.input || {};

  if (name === 'Read') {
    return `[tool] Read ${input.file_path || ''}`.trim();
  }
  if (name === 'Write') {
    return `[tool] Write ${input.file_path || ''}`.trim();
  }
  if (name === 'Edit') {
    return `[tool] Edit ${input.file_path || ''}`.trim();
  }
  if (name === 'Bash') {
    const cmd = (input.command || '').substring(0, 120);
    return `[tool] Bash: ${cmd}`;
  }
  if (name === 'WebSearch') {
    return `[tool] WebSearch: ${input.query || ''}`;
  }
  if (name === 'WebFetch') {
    return `[tool] WebFetch: ${input.url || ''}`;
  }
  if (name === 'Grep') {
    return `[tool] Grep: "${input.pattern || ''}" in ${input.path || '.'}`;
  }
  if (name === 'Glob') {
    return `[tool] Glob: ${input.pattern || ''}`;
  }
  if (name.startsWith('mcp__')) {
    const short = name.replace('mcp__aibtc__', '');
    const argStr = Object.entries(input)
      .map(([k, v]) => `${k}=${String(v).substring(0, 40)}`)
      .join(', ');
    return `[mcp] ${short}(${argStr.substring(0, 100)})`;
  }
  return `[tool] ${name}`;
}

/**
 * Parse a stream-json line from Claude CLI into a human-readable log entry.
 * Returns { type, line } or null to suppress.
 */
function parseStreamEvent(raw) {
  let evt;
  try {
    evt = JSON.parse(raw);
  } catch {
    // Not JSON — pass through as plain text
    return { type: 'stdout', line: raw };
  }

  // Direct __xtrata_step line (e.g. from script stdout echoed as text)
  if (evt.__xtrata_step) {
    return { type: 'inscription', line: `[${evt.step}] ${evt.detail}`, step: evt.step, status: evt.status };
  }

  // System/init messages
  if (evt.type === 'system') {
    return { type: 'stdout', line: `[system] ${evt.subtype || 'init'}` };
  }

  // Assistant messages contain the content blocks
  if (evt.type === 'assistant') {
    const msg = evt.message;
    if (!msg) return null;
    const blocks = normalizeAssistantBlocks(msg);
    const entries = [];

    for (const block of blocks) {
      if (block.type === 'tool_use') {
        entries.push({ type: 'stdout', line: formatToolUse(block) });
        continue;
      }

      if (block.type === 'thinking') {
        const text = (block.thinking || block.text || '').trim();
        if (!text) continue;
        const preview = text.length > 300 ? text.substring(0, 300) + '...' : text;
        entries.push({ type: 'thinking', line: preview });
        continue;
      }

      if (block.type === 'text') {
        const text = (block.text || '').trim();
        if (!text) continue;
        const preview = text.length > 200 ? text.substring(0, 200) + '...' : text;
        entries.push({ type: 'stdout', line: preview });
      }
    }

    return entries.length > 0 ? entries : null;
  }

  // Tool result — check for __xtrata_step events, suppress everything else
  if (evt.type === 'tool_result') {
    const content = evt.content || evt.output || '';
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    const stepEvents = [];
    for (const line of text.split('\n')) {
      if (line.includes('__xtrata_step')) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.__xtrata_step) {
            stepEvents.push({ type: 'inscription', line: `[${parsed.step}] ${parsed.detail}`, step: parsed.step, status: parsed.status });
          }
        } catch {}
      }
    }
    if (stepEvents.length > 0) return stepEvents;
    return null;
  }

  // Final result
  if (evt.type === 'result') {
    if (evt.is_error) {
      const first = Array.isArray(evt.errors) && evt.errors.length
        ? String(evt.errors[0]).split('\n')[0]
        : (evt.subtype || 'execution error');
      return { type: 'error', line: `[failed] ${first}` };
    }
    const cost = evt.cost_usd != null ? ` ($${evt.cost_usd.toFixed(2)})` : '';
    const dur = evt.duration_ms != null ? ` ${Math.round(evt.duration_ms / 1000)}s` : '';
    const turns = evt.num_turns != null ? ` ${evt.num_turns} turns` : '';
    return { type: 'start', line: `[done]${turns}${dur}${cost}` };
  }

  return null;
}

/**
 * Spawn Claude CLI and stream structured progress.
 * Uses --output-format stream-json for real-time tool/text events.
 */
function runClaude({ model, budget, prompt, cwd, phaseType = 'research', onLine, onSpawn }) {
  return new Promise((resolve, reject) => {
    console.log(`[claude-runner] Auth preflight...`);
    const auth = preflightAuthCheck();
    if (!auth.ok) {
      console.error(`[claude-runner] Auth FAILED: ${auth.reason}`);
      return reject(new Error(auth.reason));
    }
    console.log(`[claude-runner] Auth OK (${auth.source})`);

    const mcpConfigPath = path.join(__dirname, '..', '.mcp.json');
    // Strip null bytes and control chars that crash spawn() — registry data
    // can contain binary prefixes (e.g. \x00, \x1a in agent descriptions).
    const safePrompt = prompt.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
    const args = [
      '-p',
      '--verbose',
      '--output-format', 'stream-json',
      '--no-session-persistence',
      '--model', model,
      '--max-budget-usd', String(budget),
      '--dangerously-skip-permissions',
      '--mcp-config', mcpConfigPath,
      '--',
      safePrompt
    ];

    console.log(`[claude-runner] Spawning: ${CLAUDE_BIN} -p --model ${model} --max-budget-usd ${budget} (prompt: ${prompt.length} chars, cwd: ${cwd})`);
    const proc = spawn(CLAUDE_BIN, args, {
      cwd,
      env: getRunnerEnv(),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    console.log(`[claude-runner] Process spawned: pid=${proc.pid}`);
    if (onSpawn) onSpawn(proc);

    const output = [];
    const timeout = TIMEOUTS[phaseType] || TIMEOUTS.research;

    const killTimer = setTimeout(() => {
      proc.kill('SIGTERM');
      const msg = `Claude process killed after ${timeout / 60000}min timeout`;
      addToRing({ timestamp: new Date().toISOString(), type: 'error', line: msg });
      if (onLine) onLine('error', msg);
    }, timeout);

    // Parse stdout as stream-json events
    let stdoutBuf = '';
    proc.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop();
      for (const raw of lines) {
        if (!raw.trim()) continue;
        output.push(raw);
        const parsed = parseStreamEvent(raw);
        if (parsed) {
          const events = Array.isArray(parsed) ? parsed : [parsed];
          for (const p of events) {
            const entry = { timestamp: new Date().toISOString(), ...p };
            addToRing(entry);
            if (onLine) onLine(p.type, p.line, p);
          }
        }
      }
    });
    proc.stdout.on('end', () => {
      if (stdoutBuf.trim()) {
        output.push(stdoutBuf);
        const parsed = parseStreamEvent(stdoutBuf);
        if (parsed) {
          const events = Array.isArray(parsed) ? parsed : [parsed];
          for (const p of events) {
            addToRing({ timestamp: new Date().toISOString(), ...p });
            if (onLine) onLine(p.type, p.line, p);
          }
        }
      }
    });

    // Stderr — pass through as warnings
    let stderrBuf = '';
    proc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const entry = { timestamp: new Date().toISOString(), type: 'stderr', line };
        addToRing(entry);
        if (onLine) onLine('stderr', line);
      }
    });
    proc.stderr.on('end', () => {
      if (stderrBuf.trim()) {
        addToRing({ timestamp: new Date().toISOString(), type: 'stderr', line: stderrBuf });
        if (onLine) onLine('stderr', stderrBuf);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(killTimer);
      console.error(`[claude-runner] Process error (pid=${proc.pid}): ${err.message}`);
      addToRing({ timestamp: new Date().toISOString(), type: 'error', line: err.message });
      reject(err);
    });

    proc.on('close', (code) => {
      clearTimeout(killTimer);
      console.log(`[claude-runner] Process closed (pid=${proc.pid}): code=${code}, output lines=${output.length}`);
      if (code === 0) {
        resolve({ code, output });
      } else {
        const detail = extractResultError(output);
        const suffix = detail ? `: ${detail}` : '';
        const err = new Error(`Claude exited with code ${code}${suffix}`);
        err.code = code;
        err.output = output;
        console.error(`[claude-runner] Non-zero exit: ${err.message}`);
        reject(err);
      }
    });
  });
}

function getActivityLog() {
  return [...activityRing];
}

module.exports = { runClaude, getActivityLog };
