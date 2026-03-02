// dashboard/claude-runner.js
const { spawn, spawnSync } = require('child_process');

const CLAUDE_BIN = '/Users/melophonic/.local/bin/claude';
const LOG_LIMIT = 500;
const activityRing = [];

// Kill timeouts per phase type (ms)
const TIMEOUTS = {
  research: 5 * 60 * 1000,     // 5 min — Sonnet pulse should complete in ~2 min
  compose: 10 * 60 * 1000,     // 10 min — Opus draft composition
  inscription: 5 * 60 * 1000   // 5 min — Opus on-chain inscription
};

function addToRing(entry) {
  activityRing.push(entry);
  if (activityRing.length > LOG_LIMIT) activityRing.shift();
}

function getRunnerEnv() {
  return {
    ...process.env,
    PATH: `/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.HOME}/.local/bin:${process.env.PATH}`
  };
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

    // Tool use — show what tool is being called
    if (msg.type === 'tool_use') {
      const name = msg.name || 'unknown';
      const input = msg.input || {};
      // Show the most useful detail per tool type
      if (name === 'Read') {
        return { type: 'stdout', line: `[tool] Read ${input.file_path || ''}` };
      }
      if (name === 'Write') {
        return { type: 'stdout', line: `[tool] Write ${input.file_path || ''}` };
      }
      if (name === 'Edit') {
        return { type: 'stdout', line: `[tool] Edit ${input.file_path || ''}` };
      }
      if (name === 'Bash') {
        const cmd = (input.command || '').substring(0, 120);
        return { type: 'stdout', line: `[tool] Bash: ${cmd}` };
      }
      if (name === 'WebSearch') {
        return { type: 'stdout', line: `[tool] WebSearch: ${input.query || ''}` };
      }
      if (name === 'WebFetch') {
        return { type: 'stdout', line: `[tool] WebFetch: ${input.url || ''}` };
      }
      if (name === 'Grep') {
        return { type: 'stdout', line: `[tool] Grep: "${input.pattern || ''}" in ${input.path || '.'}` };
      }
      if (name === 'Glob') {
        return { type: 'stdout', line: `[tool] Glob: ${input.pattern || ''}` };
      }
      // MCP tools
      if (name.startsWith('mcp__')) {
        const short = name.replace('mcp__aibtc__', '');
        const argStr = Object.entries(input).map(([k, v]) => `${k}=${String(v).substring(0, 40)}`).join(', ');
        return { type: 'stdout', line: `[mcp] ${short}(${argStr.substring(0, 100)})` };
      }
      return { type: 'stdout', line: `[tool] ${name}` };
    }

    // Thinking — tagged so the dashboard can show/hide
    if (msg.type === 'thinking') {
      const text = (msg.thinking || '').trim();
      if (!text) return null;
      const preview = text.length > 300 ? text.substring(0, 300) + '...' : text;
      return { type: 'thinking', line: preview };
    }

    // Text output — show a trimmed preview
    if (msg.type === 'text') {
      const text = (msg.text || '').trim();
      if (!text) return null;
      const preview = text.length > 200 ? text.substring(0, 200) + '...' : text;
      return { type: 'stdout', line: preview };
    }

    return null;
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
function runClaude({ model, budget, prompt, cwd, phaseType = 'research', onLine }) {
  return new Promise((resolve, reject) => {
    const auth = preflightAuthCheck();
    if (!auth.ok) {
      return reject(new Error(auth.reason));
    }

    const args = [
      '-p',
      '--verbose',
      '--output-format', 'stream-json',
      '--no-session-persistence',
      '--model', model,
      '--max-budget-usd', String(budget),
      '--dangerously-skip-permissions',
      prompt
    ];

    const proc = spawn(CLAUDE_BIN, args, {
      cwd,
      env: getRunnerEnv(),
      stdio: ['ignore', 'pipe', 'pipe']
    });

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
      addToRing({ timestamp: new Date().toISOString(), type: 'error', line: err.message });
      reject(err);
    });

    proc.on('close', (code) => {
      clearTimeout(killTimer);
      if (code === 0) {
        resolve({ code, output });
      } else {
        const detail = extractResultError(output);
        const suffix = detail ? `: ${detail}` : '';
        const err = new Error(`Claude exited with code ${code}${suffix}`);
        err.code = code;
        err.output = output;
        reject(err);
      }
    });
  });
}

function getActivityLog() {
  return [...activityRing];
}

module.exports = { runClaude, getActivityLog };
