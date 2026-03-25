/**
 * bump-nonces.cjs
 *
 * Replaces stuck low-fee pending transactions by submitting a no-op STX
 * self-transfer at each nonce with a higher fee, clearing the nonce queue.
 *
 * Usage:
 *   node scripts/bump-nonces.cjs              # bumps nonces 104-120 (default)
 *   node scripts/bump-nonces.cjs 104 120      # explicit start/end (inclusive)
 *   node scripts/bump-nonces.cjs 104 119      # just the unknown stuck ones
 *
 * The replacement fee defaults to 50,000 µSTX (0.05 STX).
 * Set BUMP_FEE_USTX env var to override, e.g. BUMP_FEE_USTX=100000
 */

'use strict';

const {
  makeSTXTokenTransfer,
  broadcastTransaction,
  getAddressFromPrivateKey,
  TransactionVersion,
  AnchorMode
} = require('@stacks/transactions');
const { StacksMainnet } = require('@stacks/network');
const { deriveAgent27SenderKey } = require('./agent27-signer.cjs');

const network = new StacksMainnet();
const senderKey = deriveAgent27SenderKey();
const senderAddress = getAddressFromPrivateKey(senderKey, TransactionVersion.Mainnet);

const BUMP_FEE = BigInt(process.env.BUMP_FEE_USTX || '50000'); // 0.05 STX default

const args = process.argv.slice(2);
const startNonce = BigInt(args[0] ?? '104');
const endNonce   = BigInt(args[1] ?? '120');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Burn address — standard Stacks null destination for no-op bumps
const BURN_ADDRESS = 'SP000000000000000000002Q6VF78';

async function bumpNonce(nonce) {
  const tx = await makeSTXTokenTransfer({
    recipient: BURN_ADDRESS,   // send 1 µSTX to burn address (no-op)
    amount: 1n,
    senderKey,
    network,
    nonce,
    fee: BUMP_FEE,
    anchorMode: AnchorMode.Any,
    memo: `nonce-bump-${nonce}`
  });

  const result = await broadcastTransaction(tx, network);

  if (result.error) {
    // "ConflictingNonceInMempool" means a higher-fee TX already exists — skip
    if (String(result.error).includes('ConflictingNonce') || String(result.reason).includes('NotEnoughFee')) {
      console.log(`  nonce ${nonce}: skipped — existing TX has equal or higher fee`);
    } else {
      console.error(`  nonce ${nonce}: ERROR — ${result.error} ${result.reason || ''}`);
    }
  } else {
    console.log(`  nonce ${nonce}: bumped → txid ${result.txid}`);
  }
}

async function main() {
  console.log(`Sender: ${senderAddress}`);
  console.log(`Bump fee: ${BUMP_FEE} µSTX (${Number(BUMP_FEE) / 1_000_000} STX)`);
  console.log(`Nonce range: ${startNonce} → ${endNonce} (${endNonce - startNonce + 1n} TXs)\n`);

  for (let nonce = startNonce; nonce <= endNonce; nonce++) {
    await bumpNonce(nonce);
    await sleep(300); // brief pause between broadcasts
  }

  console.log('\nAll bump TXs broadcast. Monitor with:');
  console.log(`  node -e "const {getNonce}=require('@stacks/transactions');const{StacksMainnet}=require('@stacks/network');getNonce('${senderAddress}',new StacksMainnet()).then(n=>console.log('pending nonce:',n.toString()))"`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
