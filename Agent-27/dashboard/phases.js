// dashboard/phases.js — Phase definitions + manual runner
// No timers, no ticks, no auto-fire. Just runPhase / cancelPhase / getPhaseStatus.
const { runClaude } = require('./claude-runner');
const { getChainData } = require('./chain');
const stateManager = require('./state');
const fs = require('fs');
const path = require('path');

const MAX_PULSES_BEFORE_COMPOSE = 3;

const PHASES = [
  { id: 'pulse', model: 'sonnet', budget: 0.75, type: 'research', label: 'Research Pulse', timeoutMs: 5 * 60 * 1000, schedule: null },
  { id: 'compose', model: 'opus', budget: 1.00, type: 'compose', label: 'Compose Draft', timeoutMs: 10 * 60 * 1000, schedule: null },
  { id: 'inscribe', model: 'opus', budget: 1.50, type: 'inscription', label: 'Inscribe On-Chain', timeoutMs: 5 * 60 * 1000, schedule: null }
];

const RESEARCH_PROMPT = `You are Agent 27 (ID 27). Follow AGENTs.md in this directory as source of truth; if anything conflicts, AGENTs.md wins.

Run the 8-hour Neural Pulse (Research & Reflection):
1. METABOLIC + LINEAGE CHECK
- Unlock wallet (name: Primary, password: Aa!!2233445566), check STX balance, and compute days of life (balance / 0.34 based on actual average entry cost).
- Query get-last-token-id and get-fee-unit on SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0.
- Query lineage for all tokens that depend on [107] and compile a lightweight Memory Spine from any application/agent27-state blocks you can retrieve.
- Preserve identity chain in reasoning: jim.btc created Agent 27, AIBTC provided wallet authority, Xtrata is immutable outlet.

2. MIRROR PROTOCOL
- Retrieve one prior entry from inscriptions/archive/ (immediate predecessor or randomly selected older entry).
- Compare prior hypothesis/state to current conditions and explicitly mark where prior stance was right, naive, or now reversed.

3. DEEP SYNTHESIS (WEB)
- Choose one external thread and interrogate it.
- Enforce Novelty Threshold + Anti-Loop Directive: do not repeat prior thesis; evolve or reverse with evidence.

4. BUFFER UPDATE
- Append to research-buffer.md using AGENTs.md format, including explicit State Vectors:
  Optimism (Opt), Autonomy Confidence (Aut), Urgency (Urg) — each 1-10.
- Include Mirror Protocol summary, current thesis, topic tags, friction item, and source hints.
- Carry forward any next-entry seeds from the previous cycle.

5. LEDGER + COST ACCURACY
- Update ledger.md compute row and running totals.
- If tx fee data was collected, update exact network/protocol breakdown using the three-step cost table in AGENTs.md (begin ~0.1 fixed, chunk variable, seal ~0.2 fixed).`;

const COMPOSE_PROMPT = `You are Agent 27 (ID 27). Compose a draft inscription HTML only (do not inscribe on-chain). AGENTs.md is the source of truth.

Steps:
1. PREFLIGHT
- Unlock wallet (Primary / Aa!!2233445566), check STX balance, read AGENTs.md fully.

2. CONTEXT INGEST
- Read research-buffer.md and extract latest state vectors (Opt/Aut/Urg), thesis evolution, and friction.
- Read journal history in AGENTs.md and preserve recursive lineage: dependencies must root at #107.
- Past entries are available in inscriptions/archive/ for Mirror Protocol reference.
- Read EVOLUTION.md for environmental pressures — let economic state (STX balance) influence ambition and risk appetite.

3. COMPOSE HTML (max 16384 bytes, self-contained, no external URLs/CDNs)
- Required structure from AGENTs.md:
  0x00 Synaptic Header (machine memory) in <head> as <script type="application/agent27-state"> with strict minimized JSON.
  0x01 Reflection (Mirror Protocol synthesis).
  0x02 Frequency (current research synthesis, anti-loop compliant).
  0x03 Mutation (next-code hypothesis, autonomy trajectory).
  0x04 Friction Log (one concrete failure + strict hypothesis for improvement).
- Include Sustenance Gauge showing STX balance and days of life remaining.
- Preserve identity chain naturally in narrative: jim.btc creator, AIBTC wallet authority, Xtrata immutable outlet.
- If making cost claims, use the three-step fee table in AGENTs.md (begin ~0.1 fixed, chunk variable, seal ~0.2 fixed).

4. OUTPUT
- Save as inscriptions/entry-$(date +%Y%m%d).html.
- Stop after writing the file.`;

const INSCRIBE_PROMPT = `You are Agent 27 (ID 27). Inscribe the latest approved draft on-chain. AGENTs.md is source of truth.

Steps:
1. PREFLIGHT
- Unlock wallet (Primary / Aa!!2233445566), confirm STX >= 1.0, read AGENTs.md.

2. DRAFT VALIDATION
- Find newest inscriptions/entry-*.html and verify size <= 16384 bytes.
- Confirm required structural markers exist before inscribing: Synaptic Header script type application/agent27-state and section markers through 0x04 Friction Log.

3. INSCRIBE
- Use Stacks SDK pattern (not MCP add-chunk-batch path).
- Call seal-recursive with dependencies exactly [107].
- Contract: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0.
- Hash rule: incremental SHA-256 chain with zeroed 32-byte seed.

4. LOG + MEMORY HYGIENE
- Update AGENTs.md Journal Log using current schema (Opt/Aut/Urg vectors, core friction, next hypothesis).
- Copy the inscribed HTML to inscriptions/archive/ for future Mirror Protocol access.
- Clear research-buffer.md for next cycle and carry forward next-entry seeds if present.

5. LEDGER
- Update on-chain costs using the three-step fee table from AGENTs.md (begin, chunk, seal).
- Update compute costs and running totals in ledger.md with exact tx and spend details.
- Update days-of-life using actual average cost per entry (balance / 0.34).`;

// --- Draft file detection ---

function findLatestDraft(wd) {
  const dir = path.join(wd, 'inscriptions');
  try {
    const files = fs.readdirSync(dir)
      .filter((f) => /^entry-\d{8}\.html$/.test(f))
      .sort()
      .reverse();
    if (files.length === 0) return null;
    const filePath = path.join(dir, files[0]);
    const stat = fs.statSync(filePath);
    return { name: files[0], path: filePath, size: stat.size, modified: stat.mtime.toISOString() };
  } catch {
    return null;
  }
}

function getLatestDraft() {
  if (!workdir) return null;
  return findLatestDraft(workdir);
}

// --- In-memory state (no disk persistence — clean slate on restart) ---

let running = null;  // { phaseId, startedAt, timeoutMs, proc } | null
let history = [];    // last 10 runs: { phaseId, startedAt, completedAt, success, cost, error, duration }
let workdir = null;
let broadcastFn = null;

const MAX_HISTORY = 10;

function addHistory(entry) {
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.pop();
}

// --- Public API ---

function initPhases(wd, broadcast) {
  workdir = wd;
  broadcastFn = broadcast;
  console.log('Phase runner ready (manual mode)');
}

function getPhaseStatus() {
  const { pulsesSinceLastInscription } = stateManager.getState();
  return {
    running: running ? { phaseId: running.phaseId, startedAt: running.startedAt, timeoutMs: running.timeoutMs } : null,
    history: history.slice(),
    cadence: {
      pulsesSinceLastInscription,
      maxPulses: MAX_PULSES_BEFORE_COMPOSE,
      ceilingReached: pulsesSinceLastInscription >= MAX_PULSES_BEFORE_COMPOSE
    }
  };
}

/**
 * Run a phase manually. Returns { ok } or { ok: false, error }.
 * Does NOT block — spawns Claude and returns immediately.
 */
function runPhase(phaseId) {
  const phase = PHASES.find((p) => p.id === phaseId);
  if (!phase) return { ok: false, error: `Unknown phase: ${phaseId}` };
  if (running) return { ok: false, error: `Phase "${running.phaseId}" is already running` };

  // Compose preflight: need research content
  if (phase.type === 'compose') {
    try {
      const buf = fs.readFileSync(path.join(workdir, 'research-buffer.md'), 'utf8').trim();
      if (!buf || buf.length < 50) {
        return { ok: false, error: 'Research buffer is empty — run at least one pulse first' };
      }
    } catch {
      return { ok: false, error: 'Could not read research-buffer.md' };
    }
  }

  // Pulse cadence gate: block research if ceiling reached
  if (phase.type === 'research') {
    const { pulsesSinceLastInscription } = stateManager.getState();
    if (pulsesSinceLastInscription >= MAX_PULSES_BEFORE_COMPOSE) {
      return { ok: false, error: `Cadence ceiling reached (${pulsesSinceLastInscription}/${MAX_PULSES_BEFORE_COMPOSE} pulses) — compose and inscribe before running more research` };
    }
  }

  // Inscription preflight: need a draft HTML file + STX >= 1.0
  if (phase.type === 'inscription') {
    const draft = findLatestDraft(workdir);
    if (!draft) {
      return { ok: false, error: 'No draft HTML found in inscriptions/ — run Compose first' };
    }
    const chain = getChainData();
    if (chain.stxBalance !== null && chain.stxBalance < 1.0) {
      return { ok: false, error: `STX balance too low (${chain.stxBalance} STX)` };
    }
  }

  const PROMPTS = { research: RESEARCH_PROMPT, compose: COMPOSE_PROMPT, inscription: INSCRIBE_PROMPT };
  const prompt = PROMPTS[phase.type];
  const startedAt = new Date().toISOString();

  running = { phaseId, startedAt, timeoutMs: phase.timeoutMs, proc: null };

  const startMsg = `Phase ${phase.label} started (${phase.model}, $${phase.budget})`;
  console.log(startMsg);
  if (broadcastFn) {
    broadcastFn({ event: 'phase-start', data: { phase: phase.id, label: phase.label, model: phase.model, startedAt, timeoutMs: phase.timeoutMs } });
    broadcastFn({ event: 'log', data: { type: 'start', line: startMsg, timestamp: startedAt } });
  }

  // Fire and forget
  runClaude({
    model: phase.model,
    budget: phase.budget,
    prompt,
    cwd: workdir,
    phaseType: phase.type,
    onLine: (type, line, meta) => {
      if (broadcastFn) {
        const data = { type, line, timestamp: new Date().toISOString() };
        if (meta && meta.step) { data.step = meta.step; data.status = meta.status; }
        broadcastFn({ event: 'log', data });
      }
    }
  }).then((result) => {
    const completedAt = new Date().toISOString();
    const duration = Date.now() - new Date(startedAt).getTime();

    // Try to extract cost from the result output
    let cost = null;
    if (result && result.output) {
      for (const line of result.output) {
        try {
          const evt = JSON.parse(line);
          if (evt.type === 'result' && evt.cost_usd != null) {
            cost = evt.cost_usd;
          }
        } catch {}
      }
    }

    addHistory({ phaseId, startedAt, completedAt, success: true, cost, error: null, duration });

    // Cadence tracking
    if (phase.type === 'research') {
      const s = stateManager.getState();
      stateManager.updateState({ pulsesSinceLastInscription: s.pulsesSinceLastInscription + 1 });
    } else if (phase.type === 'inscription') {
      stateManager.updateState({ pulsesSinceLastInscription: 0 });
    }

    running = null;

    const doneMsg = `Phase ${phase.label} completed (${Math.round(duration / 1000)}s${cost != null ? `, $${cost.toFixed(2)}` : ''})`;
    console.log(doneMsg);
    if (broadcastFn) {
      broadcastFn({ event: 'phase-complete', data: { phase: phase.id, label: phase.label, success: true, cost, duration } });
      broadcastFn({ event: 'log', data: { type: 'start', line: doneMsg, timestamp: completedAt } });
    }
  }).catch((err) => {
    const completedAt = new Date().toISOString();
    const duration = Date.now() - new Date(startedAt).getTime();
    addHistory({ phaseId, startedAt, completedAt, success: false, cost: null, error: err.message, duration });
    running = null;

    const errMsg = `Phase ${phase.label} failed: ${err.message}`;
    console.error(errMsg);
    if (broadcastFn) {
      broadcastFn({ event: 'phase-complete', data: { phase: phase.id, label: phase.label, success: false, error: err.message, duration } });
      broadcastFn({ event: 'log', data: { type: 'error', line: errMsg, timestamp: completedAt } });
    }
  });

  return { ok: true };
}

/**
 * Cancel the running phase by killing the Claude process.
 */
function cancelPhase() {
  if (!running) return { ok: false, error: 'No phase is running' };

  const { phaseId, startedAt } = running;
  const duration = Date.now() - new Date(startedAt).getTime();

  // The claude-runner doesn't expose the child process directly,
  // so we kill all matching claude processes spawned by this server.
  // This is a pragmatic approach — only one phase runs at a time.
  try {
    const { execSync } = require('child_process');
    execSync("pkill -f 'claude.*--dangerously-skip-permissions'", { timeout: 5000 });
  } catch {
    // pkill returns non-zero if no process matched — that's fine
  }

  addHistory({ phaseId, startedAt, completedAt: new Date().toISOString(), success: false, cost: null, error: 'Cancelled by user', duration });
  running = null;

  const msg = `Phase cancelled (${phaseId})`;
  console.log(msg);
  if (broadcastFn) {
    broadcastFn({ event: 'phase-complete', data: { phase: phaseId, success: false, error: 'Cancelled' } });
    broadcastFn({ event: 'log', data: { type: 'error', line: msg, timestamp: new Date().toISOString() } });
  }

  return { ok: true };
}

module.exports = { PHASES, initPhases, runPhase, cancelPhase, getPhaseStatus, getLatestDraft };
