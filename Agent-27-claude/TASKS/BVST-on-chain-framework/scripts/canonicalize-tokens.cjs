#!/usr/bin/env node
/**
 * canonicalize-tokens.cjs
 *
 * For every non-catalog module in module-index.json, queries the Xtrata contract
 * via get-id-by-hash to find the authoritative (first-ever) on-chain token ID for
 * that content hash. Adopts the canonical ID into token-map.runtime.json and
 * inscription-log.json, overwriting any stale locally-recorded IDs.
 *
 * This lets you resume inscription after a fragmented multi-run by grounding truth
 * in what the contract actually holds — ignoring which run produced it and whether
 * any duplicates exist.
 *
 * Usage:
 *   node TASKS/BVST-on-chain-framework/scripts/canonicalize-tokens.cjs
 *   node TASKS/BVST-on-chain-framework/scripts/canonicalize-tokens.cjs --dry-run
 *   node TASKS/BVST-on-chain-framework/scripts/canonicalize-tokens.cjs --verbose
 *
 * After running, execute:
 *   XTRATA_BUNDLE_ROOT=<path> node .../inscription-status.mjs
 * to verify the updated state before resuming auto-inscribe.
 */

'use strict';

try { require('dotenv').config(); } catch { /* optional */ }
try {
  const bundleRootArg = process.argv[2];
  if (bundleRootArg && !bundleRootArg.startsWith('--')) {
    require('dotenv').config({ path: require('path').join(bundleRootArg, '.env'), override: false });
  }
} catch { /* optional */ }

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  callReadOnlyFunction,
  cvToJSON,
  bufferCV,
  uintCV,
  getAddressFromPrivateKey,
  TransactionVersion
} = require('@stacks/transactions');
const { StacksMainnet } = require('@stacks/network');
const { deriveAgent27SenderKey } = require('../../../scripts/agent27-signer.cjs');

const CHUNK_SIZE = 16_384;
const CORE_CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CORE_CONTRACT_NAME = 'xtrata-v2-1-0';
const READ_RETRY = 5;
const RATE_LIMIT_DELAY_MS = 65_000;
const RETRY_BASE_MS = 2_000;

const dryRun = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');

// Bundle root: first non-flag arg, else default
const bundleRootArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const BUNDLE_ROOT = bundleRootArg
  ? path.resolve(bundleRootArg)
  : path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.join(BUNDLE_ROOT, 'workspace');

const senderKey = deriveAgent27SenderKey();
const senderAddress = getAddressFromPrivateKey(senderKey, TransactionVersion.Mainnet);

const hiroFetch = process.env.HIRO_API_KEY
  ? (url, init = {}) => fetch(url, { ...init, headers: { ...(init.headers || {}), 'x-api-key': process.env.HIRO_API_KEY } })
  : undefined;
const network = hiroFetch ? new StacksMainnet({ fetchFn: hiroFetch }) : new StacksMainnet();

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function readJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

function writeJson(absPath, value) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function callReadOnly(functionName, functionArgs) {
  for (let attempt = 1; attempt <= READ_RETRY; attempt++) {
    try {
      const result = await callReadOnlyFunction({
        contractAddress: CORE_CONTRACT_ADDRESS,
        contractName: CORE_CONTRACT_NAME,
        functionName,
        functionArgs,
        senderAddress,
        network
      });
      return cvToJSON(result);
    } catch (err) {
      const msg = err?.message || String(err);
      const isRateLimit = msg.includes('429') || msg.includes('Too Many') || msg.includes('Per-minute') || msg.includes('rate limit');
      const isTransient = isRateLimit || msg.includes('502') || msg.includes('503') || msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET');
      if (!isTransient || attempt === READ_RETRY) throw err;
      const delayMs = isRateLimit ? RATE_LIMIT_DELAY_MS : RETRY_BASE_MS * attempt;
      console.log(`  [retry] ${functionName} attempt ${attempt} failed (${msg.slice(0, 60)}), waiting ${Math.round(delayMs / 1000)}s...`);
      await sleep(delayMs);
    }
  }
}

function computeContentHash(filePath) {
  const buf = fs.readFileSync(filePath);
  const chunks = [];
  for (let offset = 0; offset < buf.length; offset += CHUNK_SIZE) {
    chunks.push(buf.subarray(offset, offset + CHUNK_SIZE));
  }
  let running = Buffer.alloc(32, 0);
  for (const chunk of chunks) {
    running = crypto.createHash('sha256').update(Buffer.concat([running, chunk])).digest();
  }
  return running; // Buffer (32 bytes)
}

async function getCanonicalTokenId(contentHash) {
  const json = await callReadOnly('get-id-by-hash', [bufferCV(contentHash)]);
  // Returns (some uint) or none
  if (!json || json.type === 'none' || json.value === null) return null;
  if (json.value?.type === 'uint') return Number(json.value.value);
  if (json.type === 'some' && json.value?.type === 'uint') return Number(json.value.value);
  return null;
}

async function getInscriptionMeta(tokenId) {
  const json = await callReadOnly('get-inscription-meta', [uintCV(BigInt(tokenId))]);
  if (!json || json.type === 'none') return null;
  const tuple = json.type === 'some' ? json.value : json;
  if (!tuple || tuple.type !== 'tuple') return null;
  return {
    creator: tuple.data?.creator?.value || tuple.value?.creator?.value || null,
    mimeType: tuple.data?.['mime-type']?.value || tuple.value?.['mime-type']?.value || null,
    tokenUri: tuple.data?.['token-uri']?.value || tuple.value?.['token-uri']?.value || null,
    totalSize: tuple.data?.['total-size']?.value || tuple.value?.['total-size']?.value || null,
    dependencyIds: (tuple.data?.['dependency-ids']?.value || tuple.value?.['dependency-ids']?.value || [])
      .map((d) => Number(d.value || d))
  };
}

async function getTokenTxInfo(tokenId) {
  // Use Hiro API to get txid + block_height for a token
  try {
    const apiBase = 'https://api.hiro.so';
    const url = `${apiBase}/extended/v1/contract/${CORE_CONTRACT_ADDRESS}.${CORE_CONTRACT_NAME}/events?limit=50&offset=0`;
    // Simpler: use the NFT endpoint to find the transaction for this token
    const nftUrl = `${apiBase}/extended/v1/tokens/nft/holdings?principal=${CORE_CONTRACT_ADDRESS}.${CORE_CONTRACT_NAME}&limit=1`;
    // Actually, use the tx lookup via asset identifier
    const txUrl = `${apiBase}/extended/v1/tokens/nft/history?asset_identifier=${CORE_CONTRACT_ADDRESS}.${CORE_CONTRACT_NAME}::inscription&value=${tokenId}&limit=1`;
    const headers = process.env.HIRO_API_KEY ? { 'x-api-key': process.env.HIRO_API_KEY } : {};
    const resp = await fetch(txUrl, { headers });
    if (!resp.ok) return null;
    const data = await resp.json();
    const result = data.results?.[0];
    if (!result) return null;
    return {
      txid: result.tx_id || null,
      block_height: result.block_height || null
    };
  } catch {
    return null;
  }
}

async function main() {
  console.log(`Bundle root: ${BUNDLE_ROOT}`);
  console.log(`Sender: ${senderAddress}`);
  console.log(`${dryRun ? '[DRY RUN] ' : ''}Canonicalizing token IDs from chain...\n`);

  const moduleIndexPath = path.join(BUNDLE_ROOT, 'verification', 'module-index.json');
  const tokenMapPath = path.join(BUNDLE_ROOT, 'configs', 'token-map.runtime.json');
  const inscriptionLogPath = path.join(BUNDLE_ROOT, 'verification', 'inscription-log.json');

  const moduleIndex = readJson(moduleIndexPath);
  const tokenMap = readJson(tokenMapPath);
  const inscriptionLog = fs.existsSync(inscriptionLogPath)
    ? readJson(inscriptionLogPath)
    : { version: 1, entries: [], minted_total: 0, remaining_total: moduleIndex.length, artifact_total: moduleIndex.length };

  const logByName = new Map((inscriptionLog.entries || []).map((e) => [e.name, e]));
  const tmEntries = tokenMap.entries || {};

  let adopted = 0;
  let updated = 0;
  let notFound = 0;
  let errors = 0;

  for (const record of moduleIndex) {
    if (record.kind === 'catalog') continue; // catalogs are rendered — handled by inscription pipeline

    const mime = record.mime_type || '';
    if (mime === 'application/wasm') {
      // WASM: use existing token-map entry if present (can't reliably compute incremental hash offline)
      if (verbose) console.log(`  WASM    ${record.name} — using existing token-map entry`);
      continue;
    }

    const absPath = path.join(WORKSPACE_ROOT, record.source_repo_path);
    if (!fs.existsSync(absPath)) {
      console.error(`  MISSING ${record.name} — source not found: ${absPath}`);
      errors++;
      continue;
    }

    let contentHash;
    try {
      contentHash = computeContentHash(absPath);
    } catch (err) {
      console.error(`  ERROR   ${record.name} — hash compute failed: ${err.message}`);
      errors++;
      continue;
    }

    let canonicalId;
    try {
      canonicalId = await getCanonicalTokenId(contentHash);
    } catch (err) {
      console.error(`  ERROR   ${record.name} — chain query failed: ${err.message}`);
      errors++;
      continue;
    }

    const currentTokenMapId = tmEntries[record.name]?.token_id ?? null;
    const currentLogEntry = logByName.get(record.name);

    if (canonicalId === null) {
      // Not yet on-chain
      if (tmEntries[record.name]?.token_id !== null) {
        if (verbose) console.log(`  WARN    ${record.name} — token-map says ${currentTokenMapId} but chain returned null for content hash`);
      } else {
        if (verbose) console.log(`  PENDING ${record.name} — not yet inscribed`);
      }
      notFound++;
      continue;
    }

    const hashHex = contentHash.toString('hex');
    const action = currentTokenMapId === null ? 'ADOPT' : (currentTokenMapId !== canonicalId ? 'UPDATE' : 'OK');

    if (action === 'OK') {
      if (verbose) console.log(`  OK      ${record.name} → token ${canonicalId}`);
      continue;
    }

    console.log(`  ${action}    ${record.name} → token ${canonicalId}${currentTokenMapId !== null ? ` (was ${currentTokenMapId})` : ''}`);

    if (!dryRun) {
      // Update token-map
      tmEntries[record.name] = {
        token_id: canonicalId,
        txid: tmEntries[record.name]?.txid || currentLogEntry?.txid || null,
        block_height: tmEntries[record.name]?.block_height || currentLogEntry?.block_height || null
      };

      // Fetch txid/block_height from chain if missing
      if (!tmEntries[record.name].txid || !tmEntries[record.name].block_height) {
        const txInfo = await getTokenTxInfo(canonicalId);
        if (txInfo) {
          tmEntries[record.name].txid = txInfo.txid;
          tmEntries[record.name].block_height = txInfo.block_height;
        }
      }

      // Fetch on-chain meta (deps, mime, uri) for inscription-log entry
      let meta = null;
      try { meta = await getInscriptionMeta(canonicalId); } catch { /* non-fatal */ }

      const logEntry = {
        name: record.name,
        kind: record.kind,
        token_id: canonicalId,
        txid: tmEntries[record.name].txid,
        block_height: tmEntries[record.name].block_height,
        sha256: hashHex,
        bytes: record.bytes,
        chunks: record.chunks,
        route: record.route,
        dependency_names: record.dependency_names || [],
        dependency_token_ids: meta?.dependencyIds || [],
        local_source_path: record.bundle_path,
        rendered_path: null,
        resolution_signature: null,
        recorded_at: new Date().toISOString(),
        _canonical: true
      };

      const existingIdx = inscriptionLog.entries.findIndex((e) => e.name === record.name);
      if (existingIdx >= 0) {
        inscriptionLog.entries[existingIdx] = logEntry;
      } else {
        inscriptionLog.entries.push(logEntry);
      }
    }

    if (action === 'ADOPT') adopted++;
    else updated++;
  }

  if (!dryRun) {
    tokenMap.entries = tmEntries;
    tokenMap.updated_at = new Date().toISOString();
    writeJson(tokenMapPath, tokenMap);

    inscriptionLog.minted_total = inscriptionLog.entries.length;
    inscriptionLog.artifact_total = moduleIndex.length;
    inscriptionLog.remaining_total = moduleIndex.length - inscriptionLog.entries.length;
    inscriptionLog.updated_at = new Date().toISOString();
    writeJson(inscriptionLogPath, inscriptionLog);

    console.log(`\nWrote token-map: ${tokenMapPath}`);
    console.log(`Wrote inscription-log: ${inscriptionLogPath}`);
  }

  console.log(`\n${ dryRun ? '[DRY RUN] ' : ''}adopted=${adopted}, updated=${updated}, not-yet-inscribed=${notFound}, errors=${errors}`);
  if (dryRun) console.log('(No files written — re-run without --dry-run to apply.)');
  else if (adopted + updated > 0) {
    console.log('\nNext: run inscription-status.mjs to verify, then resume auto-inscribe from the dashboard.');
  }

  if (errors > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exitCode = 1;
});
