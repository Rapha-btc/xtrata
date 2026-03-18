---
name: xtrata-transfer
description: >
  Teach any AI agent to transfer a Xtrata inscription (SIP-009 NFT) between
  wallets on the Stacks blockchain. Covers ownership verification, transaction
  construction, confirmation, and post-transfer validation.
version: "1.0"
contract: SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0
standalone: true
---

# Xtrata Transfer Skill

## 1. Scope

This skill is for transferring one Xtrata inscription between Stacks addresses.

Use it when the request is:
- "send inscription 42 to SP1ABC..."
- "transfer my Xtrata token to another wallet"

Do not use this skill for minting. Use:
- `skill-inscribe` for one-item minting
- `skill-batch-mint` for multi-item minting

## 2. Contract Reference

| Key | Value |
|-----|-------|
| Contract | `SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0` |
| Function | `transfer(id: uint, sender: principal, recipient: principal)` |
| SIP-009 | Standard NFT transfer — works while contract writes are paused |
| No protocol fee | Transfers have no Xtrata protocol fee |
| Network fee | Standard Stacks transaction fee applies |

Network endpoints:
- Mainnet: `https://stacks-node-api.mainnet.stacks.co`
- Fallback: `https://api.mainnet.hiro.so`

## 3. Required Imports

```js
const {
  makeContractCall, broadcastTransaction, callReadOnlyFunction,
  uintCV, principalCV,
  PostConditionMode, AnchorMode,
  cvToJSON, getNonce,
  createNonFungiblePostCondition, NonFungibleConditionCode
} = require('@stacks/transactions');
const { StacksMainnet } = require('@stacks/network');

const network = new StacksMainnet();
const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
```

## 4. Pre-Transfer Checks

Before transferring, verify:

1. **Token exists and is sealed:**
```js
async function getInscriptionMeta(tokenId, sender) {
  const r = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'get-inscription-meta',
    functionArgs: [uintCV(BigInt(tokenId))],
    senderAddress: sender,
    network
  });
  return cvToJSON(r);
}
```

2. **Sender is current owner:**
```js
async function getOwner(tokenId, sender) {
  const r = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'get-owner',
    functionArgs: [uintCV(BigInt(tokenId))],
    senderAddress: sender,
    network
  });
  const json = cvToJSON(r);
  return json.value?.value?.value || null;
}
```

3. **Recipient address is valid Stacks principal** (starts with `SP` on mainnet).

Pre-transfer checklist:
- Token exists: `get-inscription-meta` returns data
- Token is sealed: `sealed` is `true`
- Caller is owner: `get-owner` matches sender address
- Recipient is valid: different from sender, valid Stacks address

## 5. User Confirmation

Always present the transfer plan and get explicit confirmation:

```text
Transfer Plan
-------------
Token ID:    42
From:        SP1ABC...
To:          SP2DEF...
MIME type:   text/html
Size:        8,751 bytes
Network fee: ~0.001 STX (no protocol fee)

Proceed? (yes/no)
```

## 6. Transfer Transaction

```js
async function transferInscription({
  tokenId, sender, recipient, senderKey
}) {
  const id = BigInt(tokenId);

  // Verify ownership
  const owner = await getOwner(tokenId, sender);
  if (owner !== sender) {
    throw new Error(`Not the owner. Current owner: ${owner}`);
  }

  const tx = await makeContractCall({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'transfer',
    functionArgs: [
      uintCV(id),
      principalCV(sender),
      principalCV(recipient)
    ],
    senderKey,
    network,
    postConditions: [],
    postConditionMode: PostConditionMode.Deny,
    anchorMode: AnchorMode.Any
  });

  const result = await broadcastTransaction(tx, network);
  if (result.error) throw new Error(`${result.error}: ${result.reason}`);
  return result.txid || result;
}
```

## 7. Confirmation and Validation

```js
async function waitForTx(txid) {
  const url = `${network.coreApiUrl}/extended/v1/tx/${txid}`;
  for (let i = 0; i < 60; i++) {
    const res = await fetch(url);
    const data = await res.json();
    if (data.tx_status === 'success') return data;
    if (data.tx_status === 'abort_by_response' ||
        data.tx_status === 'abort_by_post_condition')
      throw new Error(`TX failed: ${data.tx_status}`);
    await new Promise(r => setTimeout(r, 10000));
  }
  throw new Error(`TX not confirmed in time: ${txid}`);
}
```

After confirmation, verify the new owner:

```js
const newOwner = await getOwner(tokenId, sender);
if (newOwner !== recipient) {
  throw new Error(`Transfer verification failed. Owner is ${newOwner}`);
}
```

## 8. Error Codes

| Code | Name | Resolution |
|---:|---|---|
| `u100` | ERR-NOT-AUTHORIZED | Sender is not the token owner |
| `u101` | ERR-NOT-FOUND | Token ID does not exist |

Transaction-level failures:
- `abort_by_post_condition`: should not happen (no STX post-conditions on transfer)
- `ConflictingNonceInMempool`: fetch latest nonce, retry
- `NotEnoughFunds`: need STX for network fee only

## 9. AIBTC MCP Tool Note

For AIBTC agents, transfers are safe through MCP `call_contract` because the
`transfer` function has no `list(buff)` arguments. The buffer-corruption issue
does not apply here.

MCP tool mapping:
- Pre-checks: `call_read_only_function`
- Transfer: `call_contract`
- Status: `get_transaction_status`

## 10. Structured Result

```json
{
  "action": "transfer",
  "tokenId": 42,
  "from": "SP1ABC...",
  "to": "SP2DEF...",
  "txid": "0x...",
  "verified": true
}
```

## 11. Safety Rules

- Never transfer without verifying ownership first.
- Always get user confirmation before broadcasting.
- Validate the recipient address format.
- Confirm the transfer succeeded by re-reading the owner.
- Transfers work even when the contract is paused for writes.
- There is no undo — transfers are final on confirmation.
