/**
 * Xtrata Transfer Example — Transfer an inscription NFT to another wallet
 *
 * Usage:
 *   XTRATA_NETWORK=mainnet SENDER_KEY=<hex-private-key> node xtrata-transfer-example.js <token-id> <recipient-address>
 *
 * Example:
 *   XTRATA_NETWORK=testnet SENDER_KEY=abc123... node xtrata-transfer-example.js 42 ST1RECIPIENT_ADDRESS
 *
 * Environment:
 *   XTRATA_NETWORK=mainnet|testnet  (default: mainnet)
 *   XTRATA_API_URL=<custom-api-url> (optional, overrides network default endpoint)
 *
 * Requirements:
 *   npm install @stacks/transactions @stacks/network
 */

import {
  makeContractCall,
  broadcastTransaction,
  callReadOnlyFunction,
  uintCV,
  principalCV,
  cvToJSON,
  AnchorMode,
  PostConditionMode,
  getAddressFromPrivateKey,
  TransactionVersion
} from '@stacks/transactions';
import { StacksMainnet, StacksTestnet } from '@stacks/network';

const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 60;

function resolveNetwork() {
  const name = (process.env.XTRATA_NETWORK || 'mainnet').toLowerCase();
  const url = process.env.XTRATA_API_URL;

  if (name === 'mainnet') {
    return url ? new StacksMainnet({ url }) : new StacksMainnet();
  }
  if (name === 'testnet') {
    return url ? new StacksTestnet({ url }) : new StacksTestnet();
  }

  throw new Error(`Unsupported XTRATA_NETWORK: ${name}. Use mainnet or testnet.`);
}

function resolveTransactionVersion(networkName) {
  return networkName === 'testnet'
    ? TransactionVersion.Testnet
    : TransactionVersion.Mainnet;
}

const networkName = (process.env.XTRATA_NETWORK || 'mainnet').toLowerCase();
const network = resolveNetwork();

async function getOwner(tokenId, senderAddress) {
  const result = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'get-owner',
    functionArgs: [uintCV(BigInt(tokenId))],
    senderAddress,
    network
  });
  const json = cvToJSON(result);
  return json.value?.value?.value ?? null;
}

async function waitForConfirmation(txid) {
  const url = `${network.coreApiUrl}/extended/v1/tx/${txid}`;
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.tx_status === 'success') return data;
      if (data.tx_status?.startsWith('abort')) {
        throw new Error(`TX aborted: ${data.tx_status}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('TX aborted')) throw e;
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`TX ${txid} did not confirm in time`);
}

async function transfer(tokenId, recipientAddress) {
  const senderKey = process.env.SENDER_KEY;
  if (!senderKey) throw new Error('Set SENDER_KEY env var to your hex private key');

  const senderAddress = getAddressFromPrivateKey(
    senderKey,
    resolveTransactionVersion(networkName)
  );
  console.log(`Sender: ${senderAddress}`);
  console.log(`Network: ${networkName}`);
  console.log(`API: ${network.coreApiUrl}`);
  console.log(`Token ID: ${tokenId}`);
  console.log(`Recipient: ${recipientAddress}`);

  // Verify ownership
  const currentOwner = await getOwner(tokenId, senderAddress);
  if (!currentOwner) {
    throw new Error(`Token #${tokenId} does not exist`);
  }
  if (currentOwner !== senderAddress) {
    throw new Error(`You don't own token #${tokenId}. Owner: ${currentOwner}`);
  }

  // Build and broadcast transfer
  const tx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'transfer',
    functionArgs: [
      uintCV(BigInt(tokenId)),
      principalCV(senderAddress),
      principalCV(recipientAddress)
    ],
    senderKey,
    network,
    postConditions: [],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });

  const result = await broadcastTransaction(tx, network);
  if (result.error) {
    throw new Error(`Broadcast failed: ${result.error} — ${result.reason}`);
  }

  const txid = result.txid || result;
  console.log(`Transfer TX: ${txid}`);

  await waitForConfirmation(txid);

  // Verify new owner
  const newOwner = await getOwner(tokenId, senderAddress);
  console.log(`Transfer complete! New owner: ${newOwner}`);
}

// CLI
const [,, tokenIdStr, recipientAddress] = process.argv;
if (!tokenIdStr || !recipientAddress) {
  console.error('Usage: XTRATA_NETWORK=mainnet SENDER_KEY=<key> node xtrata-transfer-example.js <token-id> <recipient>');
  process.exit(1);
}

transfer(parseInt(tokenIdStr), recipientAddress).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
