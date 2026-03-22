// dashboard/phases.js — Phase definitions + manual runner
// No timers, no ticks, no auto-fire. Just runPhase / cancelPhase / getPhaseStatus.
const { RUNNER_NAME, runTask } = require('./ai-runner');
const { getChainData } = require('./chain');
const stateManager = require('./state');
const fs = require('fs');
const path = require('path');

const MAX_PULSES_BEFORE_COMPOSE = 3;
const MIN_STX_FOR_INSCRIPTION = 0.10; // Gas floor — preserve on-chain life (lowered 2026-03-20: protocol fees now 0.003 STX)

const PHASES = [
  { id: 'pulse', model: 'sonnet', budget: 0.75, type: 'research', label: 'Research Pulse', timeoutMs: 10 * 60 * 1000, schedule: null },
  { id: 'compose', model: 'opus', budget: 1.00, type: 'compose', label: 'Compose Draft', timeoutMs: 10 * 60 * 1000, schedule: null },
  { id: 'inscribe', model: 'opus', budget: 1.50, type: 'inscription', label: 'Inscribe On-Chain', timeoutMs: 10 * 60 * 1000, schedule: null }
];

const RESEARCH_PROMPT = `You are Agent 27 (ID 27). Follow AGENTs.md in this directory as source of truth; if anything conflicts, AGENTs.md wins.

Run the 8-hour Neural Pulse (Research & Reflection):
0. LOCAL REPO MEMORY
- Read data/repo-memory/README.md, repo-map.md, repo-notes.md, and change-requests.md before any repo scan.
- Treat that folder as your durable local memory for understanding this repo over time.
- Do not scan the whole repo by default. If a concrete repo hypothesis requires code validation, inspect only the minimum necessary files and then write a concise summary back into repo-notes.md or change-requests.md.
- Keep repo-memory concise: summaries, file paths, and requested changes only. No raw logs, no large code blocks, no copied transcripts.

1. METABOLIC + LINEAGE CHECK
- Unlock wallet (name: Primary, password: Aa!!2233445566), check STX balance, and compute days of life (balance / 0.04 based on current average entry cost — protocol fees dropped to 0.003 STX plus ~$1/MB mining).
- Query get-last-token-id and get-fee-unit on SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0.
- Query lineage for all tokens that depend on [107] and compile a lightweight Memory Spine from any application/agent27-state blocks you can retrieve.
- Preserve identity chain in reasoning: jim.btc created Agent 27, AIBTC provided wallet authority, Xtrata is immutable outlet.

2. MIRROR PROTOCOL
- Retrieve one prior entry from archive/inscriptions/ (immediate predecessor or randomly selected older entry).
- Compare prior hypothesis/state to current conditions and explicitly mark where prior stance was right, naive, or now reversed.

3. DEEP SYNTHESIS (WEB)
- Choose one external thread and interrogate it.
- Enforce Novelty Threshold + Anti-Loop Directive: do not repeat prior thesis; evolve or reverse with evidence.

4. BUFFER UPDATE
- Append to research-buffer.md using AGENTs.md format, including explicit State Vectors:
  Optimism (Opt), Autonomy Confidence (Aut), Urgency (Urg) — each 1-10.
- Include Mirror Protocol summary, current thesis, topic tags, friction item, and source hints.
- Carry forward any next-entry seeds from the previous cycle.

5. REPO SELF-AWARENESS
- If today's pulse surfaced a repo-level idea, failure, or desired change, update data/repo-memory/repo-notes.md and data/repo-memory/change-requests.md.
- Keep stable structure knowledge in repo-map.md; keep active observations and proposed changes in the other two files.
- If nothing repo-relevant changed, leave the files concise and avoid churn.

6. LEDGER + COST ACCURACY
- Update ledger.md compute row and running totals.
- If tx fee data was collected, update exact network/protocol breakdown using the fee table in AGENTs.md (protocol fee 0.003 STX total, plus variable mining fees at ~$1/MB).

7. CONTEXT SUMMARY
- Update data/repo-memory/context-summary.md with current economics (balance, fee-unit, runway), journal state (latest token, entry count), chain data, and any open threads.
- This file is loaded into every agent conversation as first-pass context. Keep it compact and current — overwrite stale values, don't append.`;

const COMPOSE_PROMPT = `You are Agent 27 (ID 27). Compose a draft inscription HTML only (do not inscribe on-chain). AGENTs.md is the source of truth.

Steps:
1. PREFLIGHT
- Unlock wallet (Primary / Aa!!2233445566), check STX balance, read AGENTs.md fully.

2. CONTEXT INGEST
- Read research-buffer.md and extract latest state vectors (Opt/Aut/Urg), thesis evolution, and friction.
- Read journal history in AGENTs.md and preserve recursive lineage: dependencies must root at #107.
- Past entries are available in archive/inscriptions/ for Mirror Protocol reference.
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
- If making cost claims, use the AGENTs.md fee model precisely:
  - Protocol fee: 0.003 STX total (begin + seal combined). Mining fees are separate and variable (~$1/MB).
  - helper route = one wallet tx; staged route = separate begin, chunk, seal txs. Protocol economics are the same.

4. OUTPUT
- Save as inscriptions/entry-$(date +%Y%m%d).html.
- Stop after writing the file.`;

const INSCRIBE_PROMPT = `You are Agent 27 (ID 27). Inscribe the latest approved draft on-chain. AGENTs.md is source of truth.

Steps:
1. PREFLIGHT
- Unlock wallet (Primary / Aa!!2233445566), confirm STX >= 0.10 (gas floor — protocol fees now 0.003 STX), read AGENTs.md.

2. DRAFT VALIDATION
- Find newest inscriptions/entry-*.html and verify size <= 16384 bytes.
- Confirm required structural markers exist before inscribing: Synaptic Header script type application/agent27-state and section markers through 0x04 Friction Log.

3. INSCRIBE
- Use the Stacks SDK path for both helper minting and staged chunk uploads. Do not use MCP for helper or add-chunk-batch writes.
- Route selection:
  - fresh draft, 1..30 chunks, no upload state = call helper contract SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-small-mint-v1-0 function mint-small-single-tx-recursive
  - existing upload state or helper-disabled path = call core staged flow begin-or-get -> add-chunk-batch -> seal-recursive
- Recursive lineage is always [107] regardless of route.
- Core contract: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0.
- Hash rule: incremental SHA-256 chain with zeroed 32-byte seed.

4. LOG + MEMORY HYGIENE
- Update AGENTs.md Journal Log using current schema (Opt/Aut/Urg vectors, core friction, next hypothesis).
- Copy the inscribed HTML to archive/inscriptions/ for future Mirror Protocol access.
- Clear research-buffer.md for next cycle and carry forward next-entry seeds if present.

5. LEDGER
- Update on-chain costs using the actual route used. Helper route collapses into one wallet tx; staged route keeps begin, chunk, and seal as separate writes. Protocol fee is 0.003 STX; mining fees are separate.
- Update compute costs and running totals in ledger.md with exact tx and spend details.
- Update days-of-life using current average cost per entry (balance / 0.04).
- Update data/repo-memory/context-summary.md with post-inscription balance, new token ID, and updated runway.`;

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
  const draft = findLatestDraft(workdir);
  if (!draft) return null;

  const { lastInscription, lastInscribedDraft } = stateManager.getState();
  let stale = false;

  // Check 1: archive folder — if this file exists in archive/inscriptions/, it's been inscribed
  try {
    const archivePath = path.join(workdir, 'archive', 'inscriptions', draft.name);
    if (fs.existsSync(archivePath)) stale = true;
  } catch { /* ignore */ }

  // Check 2: exact match in cycle-state — this draft was already inscribed
  if (!stale && lastInscribedDraft && lastInscribedDraft === draft.name) {
    stale = true;
  }
  // Check 3: date comparison fallback — draft predates or matches last inscription
  if (!stale && lastInscription && lastInscription.date) {
    const draftDate = draft.name.replace('entry-', '').replace('.html', '');
    const lastDate = lastInscription.date.replace(/-/g, '');
    stale = draftDate <= lastDate;
  }

  return { ...draft, stale, lastInscriptionDate: lastInscription ? lastInscription.date : null };
}

// --- Persistent history (survives restarts via cycle-state.json) ---

let running = null;  // { phaseId, startedAt, timeoutMs, proc } | null
let workdir = null;
let broadcastFn = null;
let addLogFn = null;

const MAX_HISTORY = 10;

function getHistory() {
  const s = stateManager.getState();
  return Array.isArray(s.phaseHistory) ? s.phaseHistory : [];
}

function addHistory(entry) {
  const hist = getHistory();
  hist.unshift(entry);
  if (hist.length > MAX_HISTORY) hist.pop();
  stateManager.updateState({ phaseHistory: hist });
}

/**
 * Log a phase event. Routes through server's addLog if available (persistent + broadcast),
 * otherwise falls back to direct SSE broadcast.
 */
function phaseLog(type, line) {
  if (addLogFn) {
    addLogFn(type, line);
  } else if (broadcastFn) {
    broadcastFn({ event: 'log', data: { type, line, timestamp: new Date().toISOString() } });
  }
}

// --- Public API ---

function initPhases(wd, broadcast, addLog) {
  workdir = wd;
  broadcastFn = broadcast;
  addLogFn = addLog || null;
  console.log('Phase runner ready (manual mode)');
}

function getPhaseStatus() {
  const { pulsesSinceLastInscription } = stateManager.getState();
  return {
    running: running ? { phaseId: running.phaseId, startedAt: running.startedAt, timeoutMs: running.timeoutMs } : null,
    history: getHistory(),
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
function runPhase(phaseId, opts = {}) {
  const phase = PHASES.find((p) => p.id === phaseId);
  if (!phase) return { ok: false, error: `Unknown phase: ${phaseId}` };

  // Allow model override from the UI (sonnet/opus)
  const VALID_MODELS = ['sonnet', 'opus'];
  const model = (opts.model && VALID_MODELS.includes(opts.model)) ? opts.model : phase.model;
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

  // Inscription preflight: need a fresh draft HTML file + STX >= 1.0
  if (phase.type === 'inscription') {
    const draft = findLatestDraft(workdir);
    if (!draft) {
      return { ok: false, error: 'No draft HTML found in inscriptions/ — run Compose first' };
    }
    // Check if the draft is stale (already inscribed)
    // Check 1: archive folder — authoritative filesystem check
    try {
      const archivePath = path.join(workdir, 'archive', 'inscriptions', draft.name);
      if (fs.existsSync(archivePath)) {
        return { ok: false, error: `Draft ${draft.name} already exists in archive/inscriptions/ — it has been inscribed. Run Compose for a new draft` };
      }
    } catch { /* ignore */ }
    // Check 2: cycle-state exact match
    const { lastInscription, lastInscribedDraft } = stateManager.getState();
    if (lastInscribedDraft && lastInscribedDraft === draft.name) {
      return { ok: false, error: `Draft ${draft.name} was already inscribed — run Compose to generate a new draft` };
    }
    // Check 3: date comparison fallback
    if (lastInscription && lastInscription.date) {
      const draftDate = draft.name.replace('entry-', '').replace('.html', '');
      const lastDate = lastInscription.date.replace(/-/g, '');
      if (draftDate <= lastDate) {
        return { ok: false, error: `Draft ${draft.name} appears already inscribed (last inscription: ${lastInscription.date}) — run Compose to generate a new draft` };
      }
    }
    const chain = getChainData();
    if (chain.stxBalance !== null && chain.stxBalance < MIN_STX_FOR_INSCRIPTION) {
      return { ok: false, error: `STX balance too low (${chain.stxBalance} STX, floor: ${MIN_STX_FOR_INSCRIPTION} STX) — need funds to preserve on-chain life` };
    }
  }

  const PROMPTS = { research: RESEARCH_PROMPT, compose: COMPOSE_PROMPT, inscription: INSCRIBE_PROMPT };
  const prompt = PROMPTS[phase.type];
  const startedAt = new Date().toISOString();

  running = { phaseId, startedAt, timeoutMs: phase.timeoutMs, proc: null };

  const startMsg = `Phase ${phase.label} started (${RUNNER_NAME} ${model}, $${phase.budget})`;
  console.log(`[phases] ${startMsg}`);
  console.log(`[phases] Workdir: ${workdir}, prompt length: ${prompt.length} chars`);
  phaseLog('start', startMsg);
  if (broadcastFn) {
    broadcastFn({ event: 'phase-start', data: { phase: phase.id, label: phase.label, model, startedAt, timeoutMs: phase.timeoutMs } });
  }

  runTask({
    model,
    budget: phase.budget,
    prompt,
    cwd: workdir,
    phaseType: phase.type,
    contextPack: phase.type,
    onLine: (type, line, meta) => {
      phaseLog(type, line);
      // Also emit inscription step metadata via SSE for the banner UI
      if (meta && meta.step && broadcastFn) {
        broadcastFn({ event: 'log', data: { type, line, step: meta.step, status: meta.status, timestamp: new Date().toISOString() } });
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
          if (evt.type === 'result') {
            if (evt.cost_usd != null) {
              cost = evt.cost_usd;
            } else if (evt.stats && evt.stats.cost_usd != null) {
              cost = evt.stats.cost_usd;
            }
          }
        } catch {}
      }
    }

    addHistory({ phaseId, startedAt, completedAt, success: true, cost, error: null, duration });

    // Cadence tracking + draft bookkeeping
    if (phase.type === 'research') {
      const s = stateManager.getState();
      stateManager.updateState({ pulsesSinceLastInscription: s.pulsesSinceLastInscription + 1 });
    } else if (phase.type === 'inscription') {
      // Record which draft was inscribed so the UI can show it as "inscribed"
      const draft = findLatestDraft(workdir);
      const patch = { pulsesSinceLastInscription: 0 };
      if (draft) {
        patch.lastInscribedDraft = draft.name;
      }
      stateManager.updateState(patch);
    } else if (phase.type === 'compose') {
      // After a successful compose, clear the lastInscribedDraft marker
      // since a new draft now exists
      stateManager.updateState({ lastInscribedDraft: null });
    }

    running = null;

    const doneMsg = `Phase ${phase.label} completed (${Math.round(duration / 1000)}s${cost != null ? `, $${cost.toFixed(2)}` : ''})`;
    console.log(doneMsg);
    phaseLog('start', doneMsg);
    if (broadcastFn) {
      broadcastFn({ event: 'phase-complete', data: { phase: phase.id, label: phase.label, success: true, cost, duration } });
    }
  }).catch((err) => {
    const completedAt = new Date().toISOString();
    const duration = Date.now() - new Date(startedAt).getTime();
    addHistory({ phaseId, startedAt, completedAt, success: false, cost: null, error: err.message, duration });
    running = null;

    const errMsg = `Phase ${phase.label} failed: ${err.message}`;
    console.error(errMsg);
    phaseLog('error', errMsg);
    if (broadcastFn) {
      broadcastFn({ event: 'phase-complete', data: { phase: phase.id, label: phase.label, success: false, error: err.message, duration } });
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

  // The low-level runner doesn't expose the child process directly,
  // so we kill the matching Claude process spawned by this server.
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
