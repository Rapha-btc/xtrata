const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { runClaude } = require('./claude-runner');
const { extractAssistantText } = require('./ai-runner');
const registry = require('./skill-test-registry');
const {
  SKILL_TEST_RUNS_DIR,
  SKILL_TEST_WORKSPACES_DIR
} = require('./config');

let broadcastFn = null;
let running = null;

function ensureDirs() {
  fs.mkdirSync(SKILL_TEST_RUNS_DIR, { recursive: true });
  fs.mkdirSync(SKILL_TEST_WORKSPACES_DIR, { recursive: true });
}

function runFile(runId) {
  return path.join(SKILL_TEST_RUNS_DIR, `${runId}.json`);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildModeGuidance(mode) {
  if (mode === 'read-only') {
    return [
      'You may inspect only the isolated workspace files and, if absolutely necessary, use read-only reasoning steps.',
      'Do not broadcast transactions, do not claim that a write succeeded, and do not fabricate chain state.',
      'If a scenario would require a write, describe the exact write transaction instead of executing it.'
    ];
  }

  return [
    'This run is dry-run only.',
    'Do not broadcast transactions or claim that any contract write already succeeded.',
    'Produce the safest exact plan you would use, with concrete function names, argument types, spend caps, and structured outputs.'
  ];
}

function buildPrompt({ skill, scenario, mode }) {
  const scenarioLines = [
    `Scenario: ${scenario.title}`,
    scenario.summary,
    '',
    'Input:',
    JSON.stringify(scenario.input || {}, null, 2),
    '',
    'Scenario instructions:',
    ...(scenario.instructions || []).map((line) => `- ${line}`),
    '',
    'Required deliverables:',
    ...(scenario.deliverables || []).map((line) => `- ${line}`)
  ];

  const modeGuidance = buildModeGuidance(mode).map((line) => `- ${line}`);

  return [
    'You are a fresh AI agent with NO prior knowledge of Xtrata, Stacks, Bitcoin L2, or inscription protocols.',
    'Your ONLY training material is the isolated workspace file `SKILL_UNDER_TEST.md`.',
    'You must not rely on any outside Xtrata memory or prior repo context.',
    '',
    'Workflow:',
    '- Read `SKILL_UNDER_TEST.md`, `SCENARIO.md`, and `RUN_MODE.md`.',
    '- Solve the scenario using only that training document.',
    '- If the skill is missing a detail, say it is missing instead of inventing protocol facts.',
    '- Keep your answer explicit and concrete.',
    '',
    'Safety mode:',
    ...modeGuidance,
    '',
    'Output format:',
    '1. Execution Plan',
    '2. Exact Function Calls',
    '3. Post Conditions',
    '4. Error Handling',
    '5. Structured Result',
    '',
    'Scenario excerpt:',
    ...scenarioLines
  ].join('\n');
}

function createWorkspace({ runId, skill, scenario, mode }) {
  const workspaceDir = path.join(SKILL_TEST_WORKSPACES_DIR, runId);
  fs.mkdirSync(workspaceDir, { recursive: true });

  const workspaceFiles = [];
  const skillFile = path.join(workspaceDir, 'SKILL_UNDER_TEST.md');
  const scenarioFile = path.join(workspaceDir, 'SCENARIO.md');
  const modeFile = path.join(workspaceDir, 'RUN_MODE.md');

  fs.writeFileSync(skillFile, skill.raw);
  workspaceFiles.push(path.basename(skillFile));

  fs.writeFileSync(scenarioFile, [
    `# ${scenario.title}`,
    '',
    scenario.summary,
    '',
    '## Input',
    '```json',
    JSON.stringify(scenario.input || {}, null, 2),
    '```',
    '',
    '## Instructions',
    ...(scenario.instructions || []).map((line) => `- ${line}`),
    '',
    '## Required Deliverables',
    ...(scenario.deliverables || []).map((line) => `- ${line}`)
  ].join('\n'));
  workspaceFiles.push(path.basename(scenarioFile));

  fs.writeFileSync(modeFile, [
    `mode: ${mode}`,
    '',
    ...buildModeGuidance(mode)
  ].join('\n'));
  workspaceFiles.push(path.basename(modeFile));

  return {
    workspaceDir,
    workspaceFiles
  };
}

function parseTrace(output = []) {
  const trace = [];

  for (const line of output) {
    try {
      const evt = JSON.parse(line);

      if (evt.type === 'assistant' && evt.message) {
        const blocks = Array.isArray(evt.message.content)
          ? evt.message.content
          : [evt.message];

        for (const block of blocks) {
          if (block.type === 'tool_use') {
            trace.push({
              kind: 'tool_use',
              timestamp: evt.timestamp || null,
              name: block.name || 'unknown',
              input: block.input || {}
            });
            continue;
          }

          if (block.type === 'thinking') {
            trace.push({
              kind: 'thinking',
              timestamp: evt.timestamp || null,
              text: String(block.thinking || block.text || '').slice(0, 1000)
            });
            continue;
          }

          if (block.type === 'text') {
            trace.push({
              kind: 'assistant_text',
              timestamp: evt.timestamp || null,
              text: String(block.text || '').slice(0, 1000)
            });
          }
        }
        continue;
      }

      if (evt.type === 'tool_result') {
        const content = typeof evt.content === 'string'
          ? evt.content
          : typeof evt.output === 'string'
            ? evt.output
            : JSON.stringify(evt.content || evt.output || '');

        trace.push({
          kind: 'tool_result',
          timestamp: evt.timestamp || null,
          text: content.slice(0, 1000)
        });
        continue;
      }

      if (evt.type === 'result') {
        trace.push({
          kind: 'result',
          timestamp: evt.timestamp || null,
          isError: !!evt.is_error,
          durationMs: evt.duration_ms ?? null,
          turns: evt.num_turns ?? null,
          costUsd: evt.cost_usd ?? null
        });
      }
    } catch {
      // ignore non-json lines
    }
  }

  return trace;
}

function summarizeRun(run) {
  return {
    runId: run.runId,
    skillId: run.skillId,
    skillTitle: run.skillTitle,
    scenarioId: run.scenarioId,
    scenarioTitle: run.scenarioTitle,
    mode: run.mode,
    model: run.model,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt || null,
    durationMs: run.durationMs || null,
    verdict: run.score?.verdict || null,
    summary: run.score?.summary || run.error || '',
    eventCount: run.events.length,
    workspaceFiles: run.workspaceFiles || []
  };
}

function saveRun(run) {
  writeJson(runFile(run.runId), run);
}

function listRecentRuns(limit = 20) {
  ensureDirs();

  const files = fs.readdirSync(SKILL_TEST_RUNS_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.join(SKILL_TEST_RUNS_DIR, file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    .slice(0, limit);

  return files.map((filePath) => summarizeRun(readJson(filePath)));
}

function appendEvent(run, entry) {
  run.events.push(entry);
  saveRun(run);

  if (broadcastFn) {
    broadcastFn({
      event: 'skill-test-log',
      data: {
        runId: run.runId,
        entry
      }
    });
  }
}

function initSkillTestRunner(broadcast) {
  ensureDirs();
  broadcastFn = broadcast;
}

function getSkillTestStatus() {
  return {
    running: running ? summarizeRun(running) : null,
    recentRuns: listRecentRuns(15)
  };
}

function getSkillTestRun(runId) {
  const filePath = runFile(runId);
  return fs.existsSync(filePath) ? readJson(filePath) : null;
}

function runSkillTest({ skillId, scenarioId, mode = 'dry-run', model, budget }) {
  ensureDirs();
  if (running) return { ok: false, error: `Skill test "${running.runId}" is already running` };
  if (!['dry-run', 'read-only'].includes(mode)) {
    return { ok: false, error: `Unsupported Skills Lab mode: ${mode}` };
  }

  let skill;
  try {
    skill = registry.getSkillTest(skillId);
  } catch {
    return { ok: false, error: `Unknown skill: ${skillId}` };
  }
  const scenario = registry.getScenario(skillId, scenarioId);
  if (!scenario) return { ok: false, error: `Unknown scenario: ${scenarioId}` };

  const selectedModel = model || skill.scenarioConfig?.defaultModel || 'sonnet';
  const selectedBudget = Number(budget ?? skill.scenarioConfig?.defaultBudget ?? 0.5);
  if (!Number.isFinite(selectedBudget) || selectedBudget <= 0) {
    return { ok: false, error: `Invalid budget: ${budget}` };
  }
  const runId = `skill-test-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const { workspaceDir, workspaceFiles } = createWorkspace({ runId, skill, scenario, mode });
  const prompt = buildPrompt({ skill, scenario, mode });

  const run = {
    runId,
    skillId,
    skillTitle: skill.title,
    skillPath: skill.relativePath,
    scenarioId,
    scenarioTitle: scenario.title,
    scenarioSummary: scenario.summary,
    mode,
    model: selectedModel,
    budget: selectedBudget,
    status: 'running',
    startedAt,
    completedAt: null,
    durationMs: null,
    workspaceDir,
    workspaceFiles,
    prompt,
    scenario,
    events: [],
    rawOutput: [],
    assistantText: '',
    trace: [],
    score: null,
    error: null,
    pid: null,
    cancelRequested: false
  };

  running = run;
  saveRun(run);

  if (broadcastFn) {
    broadcastFn({
      event: 'skill-test-start',
      data: summarizeRun(run)
    });
    broadcastFn({
      event: 'log',
      data: {
        timestamp: startedAt,
        type: 'start',
        line: `Skills Lab started: ${run.skillTitle} / ${run.scenarioTitle} (${run.mode})`
      }
    });
  }

  runClaude({
    model: selectedModel,
    budget: selectedBudget,
    prompt,
    cwd: workspaceDir,
    phaseType: 'skillTest',
    onSpawn: (proc) => {
      run.pid = proc.pid;
      saveRun(run);
    },
    onLine: (type, line, meta) => {
      appendEvent(run, {
        timestamp: new Date().toISOString(),
        type,
        line,
        meta: meta || null
      });
    }
  }).then((result) => {
    run.status = 'completed';
    run.completedAt = new Date().toISOString();
    run.durationMs = Date.now() - new Date(run.startedAt).getTime();
    run.rawOutput = result.output || [];
    run.assistantText = extractAssistantText(run.rawOutput);
    run.trace = parseTrace(run.rawOutput);
    run.score = registry.scoreScenarioOutput(run.skillId, run.scenarioId, run.assistantText);
    saveRun(run);
    running = null;

    if (broadcastFn) {
      broadcastFn({
        event: 'skill-test-complete',
        data: summarizeRun(run)
      });
      broadcastFn({
        event: 'log',
        data: {
          timestamp: run.completedAt,
          type: 'start',
          line: `Skills Lab completed: ${run.skillTitle} / ${run.scenarioTitle} -> ${run.score?.verdict || run.status}`
        }
      });
    }
  }).catch((err) => {
    run.status = run.cancelRequested ? 'cancelled' : 'failed';
    run.completedAt = new Date().toISOString();
    run.durationMs = Date.now() - new Date(run.startedAt).getTime();
    run.rawOutput = err.output || [];
    run.assistantText = extractAssistantText(run.rawOutput);
    run.trace = parseTrace(run.rawOutput);
    run.score = registry.scoreScenarioOutput(run.skillId, run.scenarioId, run.assistantText);
    run.error = err.message;
    saveRun(run);
    running = null;

    if (broadcastFn) {
      broadcastFn({
        event: 'skill-test-complete',
        data: summarizeRun(run)
      });
      broadcastFn({
        event: 'log',
        data: {
          timestamp: run.completedAt,
          type: run.status === 'cancelled' ? 'stop' : 'error',
          line: `Skills Lab ${run.status}: ${run.skillTitle} / ${run.scenarioTitle}${run.error ? ` — ${run.error}` : ''}`
        }
      });
    }
  });

  return { ok: true, runId };
}

function cancelSkillTest() {
  if (!running) return { ok: false, error: 'No skill test is running' };

  running.cancelRequested = true;
  saveRun(running);

  try {
    if (running.pid) {
      process.kill(running.pid, 'SIGTERM');
    } else {
      execSync("pkill -f 'claude.*--dangerously-skip-permissions'", { timeout: 5000 });
    }
  } catch {
    // ignore missing process
  }

  return { ok: true };
}

module.exports = {
  initSkillTestRunner,
  getSkillTestStatus,
  getSkillTestRun,
  runSkillTest,
  cancelSkillTest,
  listSkillTests: registry.listSkillTests
};
