// dashboard/chain.js
const { WALLET, CONTRACT_ADDRESS: CONTRACT, CONTRACT_NAME, HIRO_BASE } = require('./config');
const FULL_POLL_INTERVAL = 2 * 60 * 1000; // 2 minutes — full chain poll (balances + contract + txs)
const BALANCE_POLL_INTERVAL = 60 * 1000;  // 60 seconds — lightweight balance-only refresh

const SBTC_CONTRACT = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token::sbtc-token';

let poller = null;
let balancePoller = null;
let chainData = { stxBalance: null, sbtcBalance: null, graphSize: null, feeUnit: null, lastPoll: null, transactions: [] };
let afterPollHooks = []; // callbacks invoked after each successful chain poll

/**
 * Parse a Clarity uint response value.
 * Handles both text format "(ok u173)" and hex format "0x0701...00ad".
 */
function parseClarityUint(raw) {
  if (!raw) return null;
  const str = typeof raw === 'string' ? raw : (raw.result || raw.value || '');
  if (!str) return null;

  // Text format: u173 or (ok u173)
  const textMatch = str.match(/u(\d+)/);
  if (textMatch) return Number(textMatch[1]);

  // Hex format from Hiro API: 0x07 (ok) 01 (uint128) + 16 bytes big-endian
  // or 0x01 (uint128) + 16 bytes big-endian
  const hex = str.replace('0x', '');
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length >= 34) {
    // Find the uint128 tag (0x01) — skip the ok wrapper (0x07) if present
    let offset = 0;
    if (hex.slice(0, 2) === '07') offset = 2; // skip ok tag
    if (hex.slice(offset, offset + 2) === '01') {
      const uint128Hex = hex.slice(offset + 2, offset + 34);
      return Number(BigInt('0x' + uint128Hex));
    }
  }

  return null;
}

async function fetchStxBalance() {
  const res = await fetch(`${HIRO_BASE}/extended/v1/address/${WALLET}/stx`);
  if (!res.ok) throw new Error(`STX balance fetch failed: ${res.status}`);
  const data = await res.json();
  return Number(data.balance) / 1_000_000;
}

async function fetchSbtcBalance() {
  try {
    const res = await fetch(`${HIRO_BASE}/extended/v1/address/${WALLET}/balances`);
    if (!res.ok) return 0;
    const data = await res.json();
    const sbtc = data.fungible_tokens[SBTC_CONTRACT];
    return sbtc ? Number(sbtc.balance) : 0;
  } catch {
    return 0;
  }
}

async function fetchTransactions() {
  try {
    const res = await fetch(`${HIRO_BASE}/extended/v1/address/${WALLET}/transactions?limit=20`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.results.map(tx => ({
      txid: tx.tx_id,
      time: tx.burn_block_time_iso || tx.parent_burn_block_time_iso || new Date().toISOString(),
      type: tx.tx_type,
      status: tx.tx_status,
      fee: Number(tx.fee_rate),
      sender: tx.sender_address,
      contractCall: tx.contract_call ? `${tx.contract_call.contract_id}.${tx.contract_call.function_name}` : null,
      stxTransfers: tx.stx_transfers || [],
      ftTransfers: tx.ft_transfers || []
    }));
  } catch {
    return [];
  }
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
    const [balance, sbtc, tokenIdResp, feeResp, txs] = await Promise.all([
      fetchStxBalance(),
      fetchSbtcBalance(),
      callReadOnly('get-last-token-id'),
      callReadOnly('get-fee-unit'),
      fetchTransactions()
    ]);

    chainData = {
      stxBalance: balance,
      sbtcBalance: sbtc,
      graphSize: parseClarityUint(tokenIdResp),
      feeUnit: parseClarityUint(feeResp),
      transactions: txs,
      lastPoll: new Date().toISOString()
    };

    if (broadcast) {
      broadcast({ event: 'chain', data: chainData });
    }

    // Run registered post-poll hooks (inbox sync, etc.)
    for (const hook of afterPollHooks) {
      try { await hook(chainData, broadcast); } catch (e) {
        console.error('[chain] Post-poll hook error:', e.message);
      }
    }
  } catch (err) {
    console.error('Chain poll error:', err.message);
    chainData.error = err.message;
    chainData.lastPoll = new Date().toISOString();
  }
}

async function pollBalances(broadcast) {
  try {
    const [balance, sbtc] = await Promise.all([
      fetchStxBalance(),
      fetchSbtcBalance()
    ]);
    const changed = chainData.stxBalance !== balance || chainData.sbtcBalance !== sbtc;
    chainData.stxBalance = balance;
    chainData.sbtcBalance = sbtc;
    chainData.lastPoll = new Date().toISOString();
    if (changed && broadcast) {
      broadcast({ event: 'chain', data: chainData });
    }
  } catch (err) {
    console.error('Balance poll error:', err.message);
  }
}

function startChainPoller(broadcast) {
  // Initial full poll immediately
  pollChain(broadcast);
  poller = setInterval(() => pollChain(broadcast), FULL_POLL_INTERVAL);
  // Lightweight balance refresh between full polls
  balancePoller = setInterval(() => pollBalances(broadcast), BALANCE_POLL_INTERVAL);
  console.log('Chain poller started (full: 2min, balances: 60s)');
}

function stopChainPoller() {
  if (poller) {
    clearInterval(poller);
    poller = null;
  }
  if (balancePoller) {
    clearInterval(balancePoller);
    balancePoller = null;
  }
  console.log('Chain poller stopped');
}

function getChainData() {
  return { ...chainData };
}

/** Register a callback to run after each chain poll. fn(chainData, broadcast) */
function onAfterPoll(fn) {
  if (typeof fn === 'function') afterPollHooks.push(fn);
}

module.exports = {
  startChainPoller,
  stopChainPoller,
  getChainData,
  fetchStxBalance,
  callReadOnly,
  parseClarityUint,
  onAfterPoll
};
