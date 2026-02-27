// dashboard/claude-runner.js
const { spawn } = require('child_process');

const CLAUDE_BIN = '/Users/melophonic/.local/bin/claude';
const LOG_LIMIT = 500;
const activityRing = [];

// Kill timeouts per phase type (ms)
const TIMEOUTS = {
  research: 15 * 60 * 1000,
  inscription: 30 * 60 * 1000
};

function addToRing(entry) {
  activityRing.push(entry);
  if (activityRing.length > LOG_LIMIT) activityRing.shift();
}

/**
 * Spawn Claude CLI and stream output.
 * @param {object} opts
 * @param {string} opts.model - 'sonnet' or 'opus'
 * @param {number} opts.budget - max budget in USD
 * @param {string} opts.prompt - the full prompt string
 * @param {string} opts.cwd - working directory
 * @param {string} opts.phaseType - 'research' or 'inscription' (for timeout)
 * @param {function} opts.onLine - callback(type, line) for each output line
 * @returns {Promise<{code: number, output: string[]}>}
 */
function runClaude({ model, budget, prompt, cwd, phaseType = 'research', onLine }) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
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

    function handleData(stream, type) {
      let buffer = '';
      stream.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line
        for (const line of lines) {
          if (!line.trim()) continue;
          const entry = { timestamp: new Date().toISOString(), type, line };
          addToRing(entry);
          output.push(line);
          if (onLine) onLine(type, line);
        }
      });
      stream.on('end', () => {
        if (buffer.trim()) {
          const entry = { timestamp: new Date().toISOString(), type, line: buffer };
          addToRing(entry);
          output.push(buffer);
          if (onLine) onLine(type, buffer);
        }
      });
    }

    handleData(proc.stdout, 'stdout');
    handleData(proc.stderr, 'stderr');

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
