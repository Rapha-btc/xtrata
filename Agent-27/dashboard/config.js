// dashboard/config.js — Shared constants for Agent 27
// Single source of truth for values duplicated across chain.js, phases.js, server.js.
// inscribe-entry.cjs maintains its own copy (runs standalone outside the dashboard).

const path = require('path');

const WALLET = 'SP15T1W26JTNS26VG17HM468KW7TQD3124KTYA9EJ';
const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
const GENESIS_TOKEN = 107;
const HIRO_BASE = 'https://stacks-node-api.mainnet.stacks.co';

// Directories
const WORKDIR = path.resolve(__dirname, '..');
const INSCRIPTIONS_DIR = path.join(WORKDIR, 'inscriptions');
const ARCHIVE_DIR = path.join(INSCRIPTIONS_DIR, 'archive');

// Cost model (updated from actual Entry 1-3 data)
const AVG_COST_PER_ENTRY = 0.34; // STX — used for days-of-life calculation
const MAX_ENTRY_BYTES = 16384;

module.exports = {
  WALLET,
  CONTRACT_ADDRESS,
  CONTRACT_NAME,
  GENESIS_TOKEN,
  HIRO_BASE,
  WORKDIR,
  INSCRIPTIONS_DIR,
  ARCHIVE_DIR,
  AVG_COST_PER_ENTRY,
  MAX_ENTRY_BYTES
};
