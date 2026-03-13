// dashboard/chain.js
const { WALLET, CONTRACT_ADDRESS: CONTRACT, CONTRACT_NAME, HIRO_BASE } = require('./config');
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

const SBTC_CONTRACT = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token::sbtc-token';

let poller = null;
let chainData = { stxBalance: null, sbtcBalance: null, graphSize: null, feeUnit: null, lastPoll: null, transactions: [] };

/**
 * Parse a Clarity uint response value.
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
