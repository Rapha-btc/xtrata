// dashboard/chain.js
const { WALLET, CONTRACT_ADDRESS: CONTRACT, CONTRACT_NAME, HIRO_BASE } = require('./config');
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

let poller = null;
let chainData = { stxBalance: null, graphSize: null, feeUnit: null, lastPoll: null };

/**
 * Parse a Clarity uint response value.
 * Hiro returns { okay: true, result: "(ok u42)" } or "(ok u42)" shapes.
 */
function parseClarityUint(raw) {
  if (!raw) return null;
  const str = typeof raw === 'string' ? raw : (raw.result || raw.value || '');
  const match = str.match(/u(\d+)/);
  return match ? Number(match[1]) : null;
}

async function fetchStxBalance() {
  const res = await fetch(`${HIRO_BASE}/extended/v1/address/${WALLET}/stx`);
  if (!res.ok) throw new Error(`STX balance fetch failed: ${res.status}`);
  const data = await res.json();
  // balance is in micro-STX (1 STX = 1,000,000 uSTX)
  return Number(data.balance) / 1_000_000;
}

async function callReadOnly(functionName, args = []) {
  const res = await fetch(
    `${HIRO_BASE}/v2/contracts/call-read/${CONTRACT}/${CONTRACT_NAME}/${functionName}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: WALLET,
        arguments: args
      })
    }
  );
  if (!res.ok) throw new Error(`${functionName} call failed: ${res.status}`);
  return res.json();
}

async function pollChain(broadcast) {
  try {
    const [balance, tokenIdResp, feeResp] = await Promise.all([
      fetchStxBalance(),
      callReadOnly('get-last-token-id'),
      callReadOnly('get-fee-unit')
    ]);

    chainData = {
      stxBalance: balance,
      graphSize: parseClarityUint(tokenIdResp),
      feeUnit: parseClarityUint(feeResp),
      lastPoll: new Date().toISOString()
    };

    if (broadcast) {
      broadcast({ event: 'chain', data: chainData });
    }
  } catch (err) {
    console.error('Chain poll error:', err.message);
    chainData.error = err.message;
    chainData.lastPoll = new Date().toISOString();
  }
}

function startChainPoller(broadcast) {
  // Initial poll immediately
  pollChain(broadcast);
  poller = setInterval(() => pollChain(broadcast), POLL_INTERVAL);
  console.log('Chain poller started (5-min interval)');
}

function stopChainPoller() {
  if (poller) {
    clearInterval(poller);
    poller = null;
    console.log('Chain poller stopped');
  }
}

function getChainData() {
  return { ...chainData };
}

module.exports = { startChainPoller, stopChainPoller, getChainData };
