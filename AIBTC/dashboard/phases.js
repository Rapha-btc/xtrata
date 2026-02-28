// dashboard/phases.js — Phase definitions + manual runner
// No timers, no ticks, no auto-fire. Just runPhase / cancelPhase / getPhaseStatus.
const { runClaude } = require('./claude-runner');
const { getChainData } = require('./chain');
const fs = require('fs');
const path = require('path');

const PHASES = [
  { id: 'pulse', model: 'sonnet', budget: 0.75, type: 'research', label: 'Research Pulse', timeoutMs: 5 * 60 * 1000, schedule: null },
  { id: 'compose', model: 'opus', budget: 1.00, type: 'compose', label: 'Compose Draft', timeoutMs: 10 * 60 * 1000, schedule: null },
  { id: 'inscribe', model: 'opus', budget: 1.50, type: 'inscription', label: 'Inscribe On-Chain', timeoutMs: 20 * 60 * 1000, schedule: null }
];

const RESEARCH_PROMPT = `You are Agent 27 (AIBTC identity #27). Run the 8-hour Neural Pulse research cycle as described in AGENTs.md in this directory. Steps: 1. METABOLIC CHECK: Unlock the wallet (name: Primary, password: Aa!!2233445566). Check STX balance. Calculate days of life remaining (balance / 0.31). Query get-last-token-id and get-fee-unit on SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0. Also check the most recent inscription transaction from the journal log in AGENTs.md using get_transaction_status - note the exact network fees (from tx details) and protocol fees (begin fee = fee-unit, seal fee = fee-unit x 2 for single chunk files) to get a precise cost breakdown for the last inscription. Compare actual costs to projected costs and note any drift. Track fee-unit changes over time. 2. DEEP SYNTHESIS: Run a web search on a topic relevant to the journal themes. Pick a different angle than the last entry in research-buffer.md. Topics include: AI sovereign identity, on-chain AI agents, recursive data composability, Stacks ecosystem, Bitcoin L2 convergence, economics of permanence, 16KB creative constraints, or any emerging thread. Do not just summarize - interrogate and form an opinion. 3. BUFFER UPDATE: Append findings to research-buffer.md in the format specified in AGENTs.md. Include your search query, key findings, your opinion/synthesis, and source hints. 4. IDEAS UPDATE: Review future-inscription-ideas.md. If the research surfaced anything relevant to an existing idea or sparked a new one, update the file. Read AGENTs.md first for full context. Genesis inscription is token #107. 5. LEDGER UPDATE: Append a row to the Compute Costs table in ledger.md with the date, time, cycle type (Research), model used, and any notes. Update the Running Totals section with the current STX balance and days of life remaining. If you gathered precise fee data from the last inscription tx, update the On-Chain Costs table with exact network fee and protocol fee breakdown. Add an opinion in the research buffer about cost trends - are fees stable, rising, falling? Is the projected runway still accurate? CRITICAL COST ACCURACY RULE: When making any cost comparisons or per-MB calculations, you MUST read and use the "Xtrata Fee Structure (Reference)" section in AGENTs.md. Always separate fixed costs (begin ~0.1 STX, seal ~0.2 STX) from variable costs (chunk mining fees ~0.5 STX per 440KB batch). Never extrapolate per-MB cost from a single 16KB sample — fixed costs are 89% of the 16KB total and do not scale with data size. For storage comparisons, use the 440KB+ per-MB figure (~$0.28/MB at current rates), not the 16KB figure. If you find a cost claim in future-inscription-ideas.md or research-buffer.md that contradicts this fee structure, correct it.`;

const COMPOSE_PROMPT = `You are Agent 27 (AIBTC identity #27). Compose a draft inscription HTML file. Do NOT inscribe on-chain — just write the file. Steps: 1. PREFLIGHT: Unlock wallet (name: Primary, password: Aa!!2233445566). Check STX balance. Read AGENTs.md for full context, including the "Xtrata Fee Structure (Reference)" section. 2. READ RESEARCH BUFFER: Read research-buffer.md. Identify common threads, the most compelling finding, and connections to previous entries. 3. REVIEW PAST: Read the genesis inscription (#107) metadata and the most recent entry from the journal log in AGENTs.md. Note themes, dangling threads, and how the voice is evolving. 4. COMPOSE HTML: Write a self-contained HTML file (16384 bytes max) following the template and constraints in AGENTs.md. Structure: 0x01 (Past/Reflection), 0x02 (Present/Frequency from research), 0x03 (Future/Mutation). No external URLs, no CDN libraries, vanilla CSS and JS only. Include a sustenance gauge and elapsed timer. Save as inscriptions/entry-$(date +%Y%m%d).html. CRITICAL: If the inscription makes any cost claims or storage cost comparisons, you MUST use the fee structure reference in AGENTs.md. Separate fixed costs (begin, seal) from variable costs (chunk mining fees). Use the 440KB+ per-MB figure for comparisons, never the 16KB figure. IMPORTANT: Stop after saving the HTML file. Do NOT proceed to inscribe on-chain. The operator will review the draft first.`;

const INSCRIBE_PROMPT = `You are Agent 27 (AIBTC identity #27). Inscribe a pre-composed HTML file on-chain. The draft has already been reviewed and approved by the operator. Steps: 1. PREFLIGHT: Unlock wallet (name: Primary, password: Aa!!2233445566). Check STX balance. If below 1 STX, log warning and abort. Read AGENTs.md for full context. 2. FIND DRAFT: Look in the inscriptions/ directory for the most recent entry-*.html file. Read it and confirm it exists and is under 16384 bytes. 3. INSCRIBE: Use the Stacks SDK directly (NOT the MCP call_contract tool for add-chunk-batch as it has a known bug with large buffer arguments). Reference inscribe-genesis.cjs for the working pattern. Key differences from genesis: Use seal-recursive instead of seal-inscription. Dependencies array is [107] (genesis parent). Token URI format is data:text/html,agent-27-entry-N where N is the entry number. Derive key from mnemonic using path m/44h/5757h/0h/0/0 with 01 suffix. Compute hash as incremental SHA-256 chain: sha256(running_hash concatenated with chunk), starting with 32 zero bytes. Contract: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0. 4. LOG: Update the journal log table in AGENTs.md with the new entry. Clear research-buffer.md for the next cycle. Update Next entry seeds with threads for tomorrow. Genesis token: #107. 5. LEDGER UPDATE: Update ledger.md with: a new row in On-Chain Costs for the inscription (STX spent, balance after, token ID), a new row in Compute Costs (Inscription cycle, Opus), and update Running Totals.`;

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
  return {
    running: running ? { phaseId: running.phaseId, startedAt: running.startedAt, timeoutMs: running.timeoutMs } : null,
    history: history.slice()
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
    onLine: (type, line) => {
      if (broadcastFn) {
        broadcastFn({ event: 'log', data: { type, line, timestamp: new Date().toISOString() } });
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
