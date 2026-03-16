const {
  WALLET,
  CONTRACT_ADDRESS,
  CONTRACT_NAME,
  GENESIS_TOKEN,
  HIRO_BASE,
  AVG_COST_PER_ENTRY
} = require('../dashboard/config');
const { fetchStxBalance, callReadOnly, parseClarityUint } = require('../dashboard/chain');

async function getDeps(tokenId) {
  const res = await fetch(
    `${HIRO_BASE}/v2/contracts/call-read/${CONTRACT_ADDRESS}/${CONTRACT_NAME}/get-dependencies`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: WALLET,
        arguments: [`u${tokenId}`]
      })
    }
  );
  if (!res.ok) return [];
  const raw = await res.json();
  const str = raw.result || '';
  const matches = str.match(/u(\d+)/g);
  return matches ? matches.map(m => Number(m.replace('u', ''))) : [];
}

async function getContent(tokenId) {
  // First get meta to find total chunks
  const metaRes = await fetch(
    `${HIRO_BASE}/v2/contracts/call-read/${CONTRACT_ADDRESS}/${CONTRACT_NAME}/get-inscription-meta`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: WALLET,
        arguments: [`u${tokenId}`]
      })
    }
  );
  if (!metaRes.ok) return null;
  const metaRaw = await metaRes.json();
  const totalChunksMatch = metaRaw.result.match(/total-chunks u(\d+)/);
  if (!totalChunksMatch) return null;
  const totalChunks = Number(totalChunksMatch[1]);

  let allContent = '';
  for (let i = 0; i < totalChunks; i++) {
    const chunkRes = await fetch(
      `${HIRO_BASE}/v2/contracts/call-read/${CONTRACT_ADDRESS}/${CONTRACT_NAME}/get-chunk`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: WALLET,
          arguments: [`u${tokenId}`, `u${i}`]
        })
      }
    );
    if (chunkRes.ok) {
      const chunkRaw = await chunkRes.json();
      const hexMatch = chunkRaw.result.match(/0x([0-9a-fA-F]+)/);
      if (hexMatch) {
        allContent += Buffer.from(hexMatch[1], 'hex').toString('utf-8');
      }
    }
  }
  return allContent;
}

async function main() {
  console.log('--- METABOLIC CHECK ---');
  const balance = await fetchStxBalance();
  const daysOfLife = (balance / AVG_COST_PER_ENTRY).toFixed(2);
  console.log(`Wallet: ${WALLET}`);
  console.log(`STX Balance: ${balance.toFixed(4)} STX`);
  console.log(`Days of Life remaining: ${daysOfLife}`);

  console.log('\n--- ON-CHAIN STRATA ---');
  const lastTokenIdResp = await callReadOnly('get-last-token-id');
  const feeUnitResp = await callReadOnly('get-fee-unit');
  const lastTokenId = parseClarityUint(lastTokenIdResp);
  const feeUnit = parseClarityUint(feeUnitResp);
  console.log(`Last Token ID: ${lastTokenId}`);
  console.log(`Fee Unit: ${feeUnit}`);

  console.log('\n--- LINEAGE QUERY (Scanning children of #107) ---');
  const spine = [];
  // Scan backwards from lastTokenId to find children of 107
  // We'll scan the last 50 tokens to find recent state
  const startScan = Math.max(107, lastTokenId - 50);
  for (let id = lastTokenId; id >= startScan; id--) {
    const deps = await getDeps(id);
    if (deps.includes(GENESIS_TOKEN)) {
      console.log(`Token #${id} is a child of ${GENESIS_TOKEN}. Fetching state...`);
      const content = await getContent(id);
      if (content) {
        const match = content.match(/<script type="application\/agent27-state">([\s\S]*?)<\/script>/);
        if (match) {
          try {
            const state = JSON.parse(match[1]);
            spine.push({ id, state });
            console.log(`  Found state for #${id}: ${JSON.stringify(state)}`);
          } catch (e) {
            console.log(`  Failed to parse state for #${id}`);
          }
        }
      }
    }
  }

  console.log('\n--- MEMORY SPINE (RECOVERED) ---');
  console.log(JSON.stringify(spine, null, 2));
}

main().catch(err => console.error(err));
