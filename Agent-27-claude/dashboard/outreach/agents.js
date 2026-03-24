// dashboard/outreach/agents.js — Agent registry + unified lookup
const fs = require('fs');
const path = require('path');
const { REGISTERED_AGENTS_FILE, LEGACY_REGISTERED_AGENTS_FILE, HIRO_BASE } = require('../config');
const store = require('./store');

function loadAgentsRegistry(registryFile, legacyFile) {
  for (const filePath of [registryFile || REGISTERED_AGENTS_FILE, legacyFile || LEGACY_REGISTERED_AGENTS_FILE]) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return [];
}

function saveAgentsRegistry(registryFile, agents) {
  const file = registryFile || REGISTERED_AGENTS_FILE;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(agents, null, 2));
}

/**
 * Canonical agent lookup — accepts numeric ID, STX address, or display name.
 * Returns { agent, memory } or null.
 */
function resolveAgent(query) {
  const q = String(query || '').trim();
  if (!q) return null;

  const agents = loadAgentsRegistry();
  const allMemory = store.parseOutreachAgentMemory();

  // Try by ID
  let agent = agents.find(a => String(a.id) === q);
  // Try by STX address
  if (!agent) agent = agents.find(a => a.stxAddress === q);
  // Try by display name
  if (!agent) agent = agents.find(a =>
    (a.displayName || '').toLowerCase() === q.toLowerCase() ||
    (a.name || '').toLowerCase() === q.toLowerCase()
  );

  if (!agent) return null;

  // Resolve memory by agent ID then stxAddress
  const memory = allMemory[String(agent.id)]
    || (agent.stxAddress ? allMemory[agent.stxAddress] : null)
    || store.getOutreachAgentMemory(String(agent.id))
    || null;

  return { agent, memory };
}

async function discoverAgents(registryFile) {
  try {
    const nextIdRes = await fetch(`${HIRO_BASE}/v2/contracts/call-read/SP1NMR7MY0TJ1QA7WQBZ6504KC79PZNTRQH4YGFJD/identity-registry-v2/get-last-token-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: 'SP15T1W26JTNS26VG17HM468KW7TQD3124KTYA9EJ', arguments: [] })
    });
    const nextIdData = await nextIdRes.json();
    const resultHex = nextIdData.result || '';
    const totalAgents = resultHex
      ? parseInt(Buffer.from(resultHex.replace('0x','').slice(4), 'hex').readBigUInt64BE(8).toString())
      : 0;

    console.log(`Discovering ${totalAgents} agents...`);
    const agents = [];

    const uint128Arg = (n) => {
      const b = Buffer.alloc(16);
      b.writeBigUInt64BE(0n, 0);
      b.writeBigUInt64BE(BigInt(n), 8);
      return '0x01' + b.toString('hex');
    };
    const c32 = require('c32check');
    const readFn = async (fn, args) => {
      const res = await fetch(`${HIRO_BASE}/v2/contracts/call-read/SP1NMR7MY0TJ1QA7WQBZ6504KC79PZNTRQH4YGFJD/identity-registry-v2/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: 'SP15T1W26JTNS26VG17HM468KW7TQD3124KTYA9EJ', arguments: args })
      });
      return res.json();
    };
    const decodeOwner = (hex) => {
      if (!hex || hex === '0x09') return null;
      try {
        const h = hex.replace('0x', '');
        const hash160 = h.slice(8, 48);
        return c32.c32address(22, hash160);
      } catch { return null; }
    };
    const decodeUri = (hex) => {
      if (!hex || hex === '0x09') return '';
      try {
        const buf = Buffer.from(hex.replace('0x', ''), 'hex');
        let off = 0;
        if (buf[off] === 0x07) off++;
        if (buf[off] === 0x0a) off++;
        if (buf[off] === 0x0d) off++;
        const len = buf.readUInt32BE(off); off += 4;
        return buf.slice(off, off + len).toString('utf8');
      } catch { return ''; }
    };

    for (let id = 1; id <= totalAgents; id++) {
      try {
        const arg = uint128Arg(id);
        const [ownerData, uriData] = await Promise.all([
          readFn('get-owner', [arg]),
          readFn('get-token-uri', [arg])
        ]);
        const stxAddress = decodeOwner(ownerData.result);
        if (!stxAddress) continue;
        const uri = decodeUri(uriData.result);
        agents.push({
          id,
          name: `Agent #${id}`,
          stxAddress,
          btcAddress: '',
          description: uri || ''
        });
        await new Promise(r => setTimeout(r, 120));
      } catch (e) {
        console.error(`Failed to fetch agent #${id}:`, e.message);
      }
    }

    if (agents.length > 0) {
      saveAgentsRegistry(registryFile || REGISTERED_AGENTS_FILE, agents);
      console.log(`Discovered and saved ${agents.length} real agents.`);
    }
    return agents;
  } catch (err) {
    console.error('Discovery failed:', err.message);
    return null;
  }
}

module.exports = {
  loadAgentsRegistry,
  saveAgentsRegistry,
  discoverAgents,
  resolveAgent
};
