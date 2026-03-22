// dashboard/config.js — Shared constants and repo paths for Agent 27

const path = require('path');

const WALLET = 'SP15T1W26JTNS26VG17HM468KW7TQD3124KTYA9EJ';
const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
const HELPER_CONTRACT_NAME = 'xtrata-small-mint-v1-0';
const GENESIS_TOKEN = 107;
const HIRO_BASE = 'https://api.mainnet.hiro.so';
const MAX_SMALL_MINT_CHUNKS = 30;

// Directories
const WORKDIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(WORKDIR, 'data');
const RUNTIME_DIR = path.join(DATA_DIR, 'runtime');
const OUTREACH_DIR = path.join(DATA_DIR, 'outreach');
const REPO_MEMORY_DIR = path.join(DATA_DIR, 'repo-memory');
const SKILL_TESTS_DIR = path.join(DATA_DIR, 'skill-tests');
const SKILL_TEST_SCENARIOS_DIR = path.join(SKILL_TESTS_DIR, 'scenarios');
const SKILL_TEST_RUNS_DIR = path.join(SKILL_TESTS_DIR, 'runs');
const SKILL_TEST_WORKSPACES_DIR = path.join(SKILL_TESTS_DIR, 'workspaces');
const ARCHIVE_DIR = path.join(WORKDIR, 'archive');
const INSCRIPTIONS_DIR = path.join(WORKDIR, 'inscriptions');
const INSCRIPTION_ARCHIVE_DIR = path.join(ARCHIVE_DIR, 'inscriptions');
const LOG_ARCHIVE_DIR = path.join(ARCHIVE_DIR, 'logs');
const LEGACY_DIR = path.join(ARCHIVE_DIR, 'legacy');
const SKILLS_DIR = path.join(WORKDIR, 'skills');
const BVST_BUNDLE_DIR = path.join(WORKDIR, 'TASKS', 'BVST-on-chain-framework');
const XTRATA_CANARY_BUNDLE_DIR = path.join(WORKDIR, 'TASKS', 'xtrata-canary-release');

// Runtime data files
const CYCLE_STATE_FILE = path.join(RUNTIME_DIR, 'cycle-state.json');
const REGISTERED_AGENTS_FILE = path.join(RUNTIME_DIR, 'registered-agents.json');
const OUTREACH_DRAFT_FILE = path.join(OUTREACH_DIR, 'draft.json');
const OUTREACH_HISTORY_FILE = path.join(OUTREACH_DIR, 'history.json');
const OUTREACH_AGENT_MEMORY_FILE = path.join(OUTREACH_DIR, 'agent-memory.json');
const OUTREACH_REPLY_QUEUE_FILE = path.join(OUTREACH_DIR, 'reply-queue.json');
const OUTREACH_AMBASSADOR_BRIEF_FILE = path.join(WORKDIR, 'docs', 'agent-27-ambassador-brief.md');

// Legacy file locations used for migration fallback.
const LEGACY_CYCLE_STATE_FILE = path.join(WORKDIR, 'dashboard', 'cycle-state.json');
const LEGACY_REGISTERED_AGENTS_FILE = path.join(WORKDIR, 'dashboard', 'registered-agents.json');
const LEGACY_OUTREACH_DRAFT_FILE = path.join(WORKDIR, 'outreach-draft.json');
const LEGACY_OUTREACH_HISTORY_FILE = path.join(WORKDIR, 'outreach-history.json');
const LEGACY_INSCRIPTION_ARCHIVE_DIR = path.join(INSCRIPTIONS_DIR, 'archive');

// Cost model (updated 2026-03-20: protocol fees dropped to 0.003 STX)
const AVG_COST_PER_ENTRY = 0.04; // STX — protocol 0.003 + mining ~0.01-0.05 for 16KB
const MAX_ENTRY_BYTES = 16384;

const CONTEXT_EXCLUDE_PATTERNS = [
  'node_modules/',
  'dashboard/node_modules/',
  'archive/logs/',
  'archive/legacy/',
  'data/runtime/',
  'data/outreach/',
  '*.heapsnapshot',
  '*.log',
  'package-lock.json',
  'dashboard/package-lock.json'
];

module.exports = {
  WALLET,
  CONTRACT_ADDRESS,
  CONTRACT_NAME,
  HELPER_CONTRACT_NAME,
  GENESIS_TOKEN,
  HIRO_BASE,
  MAX_SMALL_MINT_CHUNKS,
  WORKDIR,
  DATA_DIR,
  RUNTIME_DIR,
  OUTREACH_DIR,
  REPO_MEMORY_DIR,
  SKILL_TESTS_DIR,
  SKILL_TEST_SCENARIOS_DIR,
  SKILL_TEST_RUNS_DIR,
  SKILL_TEST_WORKSPACES_DIR,
  ARCHIVE_DIR,
  INSCRIPTIONS_DIR,
  INSCRIPTION_ARCHIVE_DIR,
  LOG_ARCHIVE_DIR,
  LEGACY_DIR,
  SKILLS_DIR,
  BVST_BUNDLE_DIR,
  XTRATA_CANARY_BUNDLE_DIR,
  CYCLE_STATE_FILE,
  REGISTERED_AGENTS_FILE,
  OUTREACH_DRAFT_FILE,
  OUTREACH_HISTORY_FILE,
  OUTREACH_AGENT_MEMORY_FILE,
  OUTREACH_REPLY_QUEUE_FILE,
  OUTREACH_AMBASSADOR_BRIEF_FILE,
  LEGACY_CYCLE_STATE_FILE,
  LEGACY_REGISTERED_AGENTS_FILE,
  LEGACY_OUTREACH_DRAFT_FILE,
  LEGACY_OUTREACH_HISTORY_FILE,
  LEGACY_INSCRIPTION_ARCHIVE_DIR,
  AVG_COST_PER_ENTRY,
  MAX_ENTRY_BYTES,
  CONTEXT_EXCLUDE_PATTERNS
};
