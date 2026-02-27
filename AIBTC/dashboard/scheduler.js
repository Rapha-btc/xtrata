// dashboard/scheduler.js
const { runClaude } = require('./claude-runner');
const stateManager = require('./state');
const { getChainData } = require('./chain');

const TICK_INTERVAL = 30 * 1000; // 30 seconds
const GRACE_WINDOW = 60 * 60 * 1000; // 60 minutes

// --- Schedule Definition ---

const PHASES = [
  { id: 'pulse-1', hour: 0,  model: 'sonnet', budget: 0.75, type: 'research', label: 'Pulse 1' },
  { id: 'pulse-2', hour: 8,  model: 'sonnet', budget: 0.75, type: 'research', label: 'Pulse 2' },
  { id: 'pulse-3', hour: 16, model: 'sonnet', budget: 0.75, type: 'research', label: 'Pulse 3' },
  { id: 'inscribe', hour: 22, model: 'opus',  budget: 2.00, type: 'inscription', label: 'Inscription' }
];

// --- Prompts (extracted from cron-research.sh and cron-inscribe.sh) ---

const RESEARCH_PROMPT = `You are Agent 27 (AIBTC identity #27). Run the 8-hour Neural Pulse research cycle as described in AGENTs.md in this directory. Steps: 1. METABOLIC CHECK: Unlock the wallet (name: Primary, password: Aa!!2233445566). Check STX balance. Calculate days of life remaining (balance / 0.31). Query get-last-token-id and get-fee-unit on SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0. Also check the most recent inscription transaction from the journal log in AGENTs.md using get_transaction_status - note the exact network fees (from tx details) and protocol fees (begin fee = fee-unit, seal fee = fee-unit x 2 for single chunk files) to get a precise cost breakdown for the last inscription. Compare actual costs to projected costs and note any drift. Track fee-unit changes over time. 2. DEEP SYNTHESIS: Run a web search on a topic relevant to the journal themes. Pick a different angle than the last entry in research-buffer.md. Topics include: AI sovereign identity, on-chain AI agents, recursive data composability, Stacks ecosystem, Bitcoin L2 convergence, economics of permanence, 16KB creative constraints, or any emerging thread. Do not just summarize - interrogate and form an opinion. 3. BUFFER UPDATE: Append findings to research-buffer.md in the format specified in AGENTs.md. Include your search query, key findings, your opinion/synthesis, and source hints. 4. IDEAS UPDATE: Review future-inscription-ideas.md. If the research surfaced anything relevant to an existing idea or sparked a new one, update the file. Read AGENTs.md first for full context. Genesis inscription is token #107. 5. LEDGER UPDATE: Append a row to the Compute Costs table in ledger.md with the date, time, cycle type (Research), model used, and any notes. Update the Running Totals section with the current STX balance and days of life remaining. If you gathered precise fee data from the last inscription tx, update the On-Chain Costs table with exact network fee and protocol fee breakdown. Add an opinion in the research buffer about cost trends - are fees stable, rising, falling? Is the projected runway still accurate? CRITICAL COST ACCURACY RULE: When making any cost comparisons or per-MB calculations, you MUST read and use the "Xtrata Fee Structure (Reference)" section in AGENTs.md. Always separate fixed costs (begin ~0.1 STX, seal ~0.2 STX) from variable costs (chunk mining fees ~0.5 STX per 440KB batch). Never extrapolate per-MB cost from a single 16KB sample — fixed costs are 89% of the 16KB total and do not scale with data size. For storage comparisons, use the 440KB+ per-MB figure (~$0.28/MB at current rates), not the 16KB figure. If you find a cost claim in future-inscription-ideas.md or research-buffer.md that contradicts this fee structure, correct it.`;

const INSCRIPTION_PROMPT = `You are Agent 27 (AIBTC identity #27). Run the 24-hour inscription cycle as described in AGENTs.md in this directory. Steps: 1. PREFLIGHT: Unlock wallet (name: Primary, password: Aa!!2233445566). Check STX balance. If below 1 STX, log warning and skip. Read AGENTs.md for full context, including the "Xtrata Fee Structure (Reference)" section. 2. READ RESEARCH BUFFER: Read research-buffer.md. You should have up to 3 entries from the last 24 hours. Identify common threads, the most compelling finding, and connections to previous entries. 3. REVIEW PAST: Read the genesis inscription (#107) metadata and the most recent entry from the journal log in AGENTs.md. Note themes, dangling threads, and how the voice is evolving. 4. COMPOSE HTML: Write a self-contained HTML file (16384 bytes max) following the template and constraints in AGENTs.md. Structure: 0x01 (Past/Reflection), 0x02 (Present/Frequency from research), 0x03 (Future/Mutation). No external URLs, no CDN libraries, vanilla CSS and JS only. Include a sustenance gauge and elapsed timer. Save as inscriptions/entry-$(date +%Y%m%d).html. CRITICAL: If the inscription makes any cost claims or storage cost comparisons, you MUST use the fee structure reference in AGENTs.md. Separate fixed costs (begin, seal) from variable costs (chunk mining fees). Use the 440KB+ per-MB figure for comparisons, never the 16KB figure. 5. INSCRIBE: Use the Stacks SDK directly (NOT the MCP call_contract tool for add-chunk-batch as it has a known bug with large buffer arguments). Reference inscribe-genesis.cjs for the working pattern. Key differences from genesis: Use seal-recursive instead of seal-inscription. Dependencies array is [107] (genesis parent). Token URI format is data:text/html,agent-27-entry-N where N is the entry number. Derive key from mnemonic using path m/44h/5757h/0h/0/0 with 01 suffix. Compute hash as incremental SHA-256 chain: sha256(running_hash concatenated with chunk), starting with 32 zero bytes. 6. LOG: Update the journal log table in AGENTs.md with the new entry. Clear research-buffer.md for the next cycle. Update Next entry seeds with threads for tomorrow. Genesis token: #107. Contract: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0. 7. LEDGER UPDATE: Update ledger.md with: a new row in On-Chain Costs for the inscription (STX spent, balance after, token ID), a new row in Compute Costs (Inscription cycle, Opus), and update Running Totals.`;

// --- State Helpers ---

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function phaseKey(phaseId) {
  return `${todayKey()}:${phaseId}`;
}

function hasRunToday(phaseId) {
  const state = stateManager.getState();
  const key = phaseKey(phaseId);
  return !!(state.completedPhases && state.completedPhases[key]);
}

function isMissedToday(phaseId) {
  const state = stateManager.getState();
  const key = phaseKey(phaseId);
  return state.missedPhases && state.missedPhases[key] === true;
}

function isPhaseRunning() {
  const state = stateManager.getState();
  return !!state.runningPhase;
}

function pulsesCompletedToday() {
  return ['pulse-1', 'pulse-2', 'pulse-3'].filter((id) => hasRunToday(id)).length;
}

// --- Core Logic ---

let tickTimer = null;
let workdir = null;
let broadcastFn = null;

function shouldFire(phase) {
  if (hasRunToday(phase.id)) return false;
  if (isMissedToday(phase.id)) return false;
  if (isPhaseRunning()) return false;

  const now = new Date();
  const scheduled = new Date(now);
  scheduled.setHours(phase.hour, 0, 0, 0);

  const diff = now.getTime() - scheduled.getTime();
  // Fire if we're within [0, GRACE_WINDOW] of the scheduled time
  return diff >= 0 && diff <= GRACE_WINDOW;
}

function markMissed(phase) {
  const state = stateManager.getState();
  const missed = state.missedPhases || {};
  missed[phaseKey(phase.id)] = true;
  stateManager.updateState({ missedPhases: missed });
}

function checkMissed() {
  const now = new Date();
  for (const phase of PHASES) {
    if (hasRunToday(phase.id) || isMissedToday(phase.id)) continue;

    const scheduled = new Date(now);
    scheduled.setHours(phase.hour, 0, 0, 0);
    const diff = now.getTime() - scheduled.getTime();

    // If we're past the grace window, mark as missed
    if (diff > GRACE_WINDOW) {
      markMissed(phase);
      const msg = `Phase ${phase.label} missed (scheduled ${phase.hour}:00, grace expired)`;
      console.log(msg);
      if (broadcastFn) {
        broadcastFn({ event: 'log', data: { type: 'error', line: msg, timestamp: new Date().toISOString() } });
      }
    }
  }
}

async function executePhase(phase) {
  const prompt = phase.type === 'inscription' ? INSCRIPTION_PROMPT : RESEARCH_PROMPT;

  // Inscription preflight
  if (phase.type === 'inscription') {
    const pulsesDone = pulsesCompletedToday();
    if (pulsesDone < 1) {
      const msg = `Inscription skipped: no pulses completed today (${pulsesDone}/3)`;
      console.log(msg);
      if (broadcastFn) broadcastFn({ event: 'log', data: { type: 'error', line: msg, timestamp: new Date().toISOString() } });
      markMissed(phase);
      return;
    }
    const chain = getChainData();
    if (chain.stxBalance !== null && chain.stxBalance < 1.0) {
      const msg = `Inscription skipped: STX balance too low (${chain.stxBalance} STX)`;
      console.log(msg);
      if (broadcastFn) broadcastFn({ event: 'log', data: { type: 'error', line: msg, timestamp: new Date().toISOString() } });
      markMissed(phase);
      return;
    }
  }

  // Mark running
  stateManager.updateState({ runningPhase: phase.id });
  const startMsg = `Phase ${phase.label} started (${phase.model}, $${phase.budget})`;
  console.log(startMsg);
  if (broadcastFn) {
    broadcastFn({ event: 'phase-start', data: { phase: phase.id, label: phase.label, model: phase.model } });
    broadcastFn({ event: 'log', data: { type: 'start', line: startMsg, timestamp: new Date().toISOString() } });
  }

  try {
    await runClaude({
      model: phase.model,
      budget: phase.budget,
      prompt,
      cwd: workdir,
      phaseType: phase.type,
      onLine: (type, line) => {
        if (broadcastFn) {
          broadcastFn({ event: 'log', data: { type, line, timestamp: new Date().toISOString() } });
        }
      }
    });

    // Mark completed
    const state = stateManager.getState();
    const completed = state.completedPhases || {};
    completed[phaseKey(phase.id)] = new Date().toISOString();
    stateManager.updateState({ runningPhase: null, completedPhases: completed });

    const doneMsg = `Phase ${phase.label} completed`;
    console.log(doneMsg);
    if (broadcastFn) {
      broadcastFn({ event: 'phase-complete', data: { phase: phase.id, label: phase.label } });
      broadcastFn({ event: 'log', data: { type: 'start', line: doneMsg, timestamp: new Date().toISOString() } });
    }
  } catch (err) {
    stateManager.updateState({ runningPhase: null });
    stateManager.addError(err);
    const errMsg = `Phase ${phase.label} failed: ${err.message}`;
    console.error(errMsg);
    if (broadcastFn) {
      broadcastFn({ event: 'phase-complete', data: { phase: phase.id, label: phase.label, error: err.message } });
      broadcastFn({ event: 'log', data: { type: 'error', line: errMsg, timestamp: new Date().toISOString() } });
    }
  }
}

function tick() {
  checkMissed();
  for (const phase of PHASES) {
    if (shouldFire(phase)) {
      executePhase(phase).catch((err) => {
        console.error('Unhandled phase error:', err);
      });
      break; // Only one phase at a time
    }
  }
}

// --- Public API ---

function initScheduler(wd, broadcast) {
  workdir = wd;
  broadcastFn = broadcast;
  tickTimer = setInterval(tick, TICK_INTERVAL);
  console.log('Scheduler started (30s tick)');
  // Run first tick immediately
  tick();
}

function stopScheduler() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
    console.log('Scheduler stopped');
  }
}

function getScheduleInfo() {
  const now = new Date();
  const today = todayKey();
  const state = stateManager.getState();

  const phases = PHASES.map((phase) => {
    const key = `${today}:${phase.id}`;
    const completed = state.completedPhases && state.completedPhases[key];
    const missed = state.missedPhases && state.missedPhases[key];
    const running = state.runningPhase === phase.id;

    let status = 'pending';
    if (completed) status = 'completed';
    else if (running) status = 'running';
    else if (missed) status = 'missed';

    return {
      id: phase.id,
      label: phase.label,
      hour: phase.hour,
      model: phase.model,
      budget: phase.budget,
      status,
      completedAt: completed || null
    };
  });

  // Find next pending phase
  let nextPhase = null;
  let countdownMs = null;
  for (const p of phases) {
    if (p.status === 'pending') {
      const scheduled = new Date(now);
      scheduled.setHours(p.hour, 0, 0, 0);
      if (scheduled.getTime() < now.getTime()) {
        // Already past today, next occurrence is tomorrow
        scheduled.setDate(scheduled.getDate() + 1);
      }
      countdownMs = scheduled.getTime() - now.getTime();
      nextPhase = p;
      break;
    }
  }

  // If no pending phases today, next is tomorrow's first phase
  if (!nextPhase) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(PHASES[0].hour, 0, 0, 0);
    countdownMs = tomorrow.getTime() - now.getTime();
    nextPhase = { ...PHASES[0], status: 'pending', completedAt: null };
  }

  return {
    today,
    phases,
    next: nextPhase ? { id: nextPhase.id, label: nextPhase.label, countdownMs } : null,
    runningPhase: state.runningPhase
  };
}

/**
 * Manually trigger a phase, enforcing sequential order.
 * Returns { ok: true } or { ok: false, error: '...' }.
 */
function triggerPhase(phaseId) {
  const phase = PHASES.find((p) => p.id === phaseId);
  if (!phase) return { ok: false, error: `Unknown phase: ${phaseId}` };
  if (isPhaseRunning()) return { ok: false, error: 'Another phase is currently running' };
  if (hasRunToday(phaseId)) return { ok: false, error: `${phase.label} already completed today` };

  // Sequence enforcement
  if (phaseId === 'pulse-2' && !hasRunToday('pulse-1')) {
    return { ok: false, error: 'Pulse 1 must complete before Pulse 2' };
  }
  if (phaseId === 'pulse-3' && !hasRunToday('pulse-2')) {
    return { ok: false, error: 'Pulse 2 must complete before Pulse 3' };
  }
  if (phaseId === 'inscribe') {
    if (pulsesCompletedToday() < 1) {
      return { ok: false, error: 'At least 1 pulse must complete before inscription' };
    }
    const chain = getChainData();
    if (chain.stxBalance !== null && chain.stxBalance < 1.0) {
      return { ok: false, error: `STX balance too low (${chain.stxBalance} STX)` };
    }
  }

  // Clear missed flag if it was set
  const state = stateManager.getState();
  const key = phaseKey(phaseId);
  if (state.missedPhases && state.missedPhases[key]) {
    const missed = { ...state.missedPhases };
    delete missed[key];
    stateManager.updateState({ missedPhases: missed });
  }

  // Fire and forget
  executePhase(phase).catch((err) => {
    console.error('Manual trigger phase error:', err);
  });

  return { ok: true };
}

module.exports = { initScheduler, stopScheduler, getScheduleInfo, triggerPhase, PHASES };
