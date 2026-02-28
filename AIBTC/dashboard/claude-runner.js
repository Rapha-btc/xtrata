// dashboard/claude-runner.js
const { spawn } = require('child_process');

const CLAUDE_BIN = '/Users/melophonic/.local/bin/claude';
const LOG_LIMIT = 500;
const activityRing = [];

// Kill timeouts per phase type (ms)
const TIMEOUTS = {
  research: 5 * 60 * 1000,    // 5 min — Sonnet pulse should complete in ~2 min
  inscription: 20 * 60 * 1000  // 20 min — Opus inscription is heavier
};

function addToRing(entry) {
  activityRing.push(entry);
  if (activityRing.length > LOG_LIMIT) activityRing.shift();
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

  // Tool result — brief acknowledgement
  if (evt.type === 'tool_result') {
    return null; // suppress verbose tool results
  }

  // Final result
  if (evt.type === 'result') {
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
    const args = [
      '-p',
      '--verbose',
      '--output-format', 'stream-json',
      '--model', model,
      '--max-budget-usd', String(budget),
      '--dangerously-skip-permissions',
      prompt
    ];

    const proc = spawn(CLAUDE_BIN, args, {
      cwd,
      env: {
        ...process.env,
        PATH: `/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.HOME}/.local/bin:${process.env.PATH}`
      },
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
          const entry = { timestamp: new Date().toISOString(), ...parsed };
          addToRing(entry);
          if (onLine) onLine(parsed.type, parsed.line);
        }
      }
    });
    proc.stdout.on('end', () => {
      if (stdoutBuf.trim()) {
        output.push(stdoutBuf);
        const parsed = parseStreamEvent(stdoutBuf);
        if (parsed) {
          addToRing({ timestamp: new Date().toISOString(), ...parsed });
          if (onLine) onLine(parsed.type, parsed.line);
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
        const err = new Error(`Claude exited with code ${code}`);
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
