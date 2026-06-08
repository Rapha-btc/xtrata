#!/usr/bin/env node
/**
 * Verify that the deployed legacy contracts match local live sources and expose
 * the function interfaces that xtrata-v3.2.2 migration depends on.
 *
 * Usage:
 *   node scripts/mainnet-v3.2.2-verify-legacy.mjs
 *   XTRATA_MAINNET_HIRO_API_KEY=<key> node scripts/mainnet-v3.2.2-verify-legacy.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const API_URL = (process.env.XTRATA_MAINNET_API_URL ?? 'https://api.hiro.so').replace(/\/$/, '');
const API_KEY = process.env.XTRATA_MAINNET_HIRO_API_KEY ?? '';
const DEPLOYER = process.env.XTRATA_DEPLOYER ?? 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const root = new URL('../', import.meta.url);
const path = (relative) => new URL(relative, root).pathname;

const sha256Hex = (text) => createHash('sha256').update(text).digest('hex');

const headers = () => {
  const result = { 'content-type': 'application/json' };
  if (API_KEY) result['x-api-key'] = API_KEY;
  return result;
};

// Functions xtrata-v3.2.2 calls cross-contract during migration, plus the
// preflight reads used to compute the continuity next-id.
const REQUIRED_FUNCTIONS = [
  { name: 'get-inscription-meta',   kind: 'read-only', note: 'migrate meta — tuple shape must match' },
  { name: 'get-token-uri-raw',      kind: 'read-only', note: 'migrate token URI' },
  { name: 'get-dependencies',       kind: 'read-only', note: 'migrate dependencies' },
  { name: 'get-chunk',              kind: 'read-only', note: 'chunk fallback reader' },
  { name: 'get-chunk-batch',        kind: 'read-only', note: 'chunk batch fallback reader' },
  { name: 'transfer',               kind: 'public',    note: 'escrow transfer into v3.2.2' },
  { name: 'get-last-token-id',      kind: 'read-only', note: 'continuity next-id computation' },
  { name: 'get-next-token-id',      kind: 'read-only', note: 'continuity next-id computation' },
  { name: 'is-paused',              kind: 'read-only', note: 'pause-gating in handover sequence' },
  { name: 'get-admin',              kind: 'read-only', note: 'admin address verification' }
];

// Tuple shape that migrate-from-v1 and migrate-from-v2-1-0 destructure from
// get-inscription-meta. All seven fields must be present.
const REQUIRED_META_FIELDS = [
  'owner',
  'creator',
  'mime-type',
  'total-size',
  'total-chunks',
  'sealed',
  'final-hash'
];

const LEGACY = [
  {
    name: 'xtrata-v1-1-1',
    address: DEPLOYER,
    localPath: 'contracts/live/xtrata-v1.1.1.clar',
    usedBy: 'migrate-from-v1'
  },
  {
    name: 'xtrata-v2-1-0',
    address: DEPLOYER,
    localPath: 'contracts/live/xtrata-v2.1.0.clar',
    usedBy: 'migrate-from-v2-1-0'
  }
];

// ---------------------------------------------------------------------------
// Fetch deployed source from Hiro API
// ---------------------------------------------------------------------------
async function fetchDeployedSource(address, name) {
  const url = `${API_URL}/v2/contracts/source/${address}/${name}`;
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${address}.${name} source fetch failed (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }
  const json = await response.json();
  // Hiro /v2/contracts/source returns { source: string, publish_height, proof }
  if (typeof json.source !== 'string') {
    throw new Error(`Unexpected response shape from /v2/contracts/source: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json.source;
}

// ---------------------------------------------------------------------------
// Extract function definitions from Clarity source
// ---------------------------------------------------------------------------
function extractFunctions(source) {
  const results = {};
  // Match define-public, define-read-only, define-private function headers.
  // Captures the entire parenthesised signature on the opening line.
  const pattern = /\((define-(?:public|read-only|private))\s+\((\S+)((?:\s+[^)]+)*)\)/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const kind = match[1].replace('define-', '');
    const fnName = match[2];
    const params = match[3].trim();
    results[fnName] = { kind, params, raw: match[0] };
  }
  return results;
}

// Locate the InscriptionMeta map definition and extract field names
function extractMetaFields(source) {
  const match = source.match(/define-map\s+InscriptionMeta\s+uint\s*\{([^}]+)\}/s);
  if (!match) return null;
  return match[1]
    .split(',')
    .map((field) => field.trim().split(/[\s:]/)[0].trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Verify one legacy contract
// ---------------------------------------------------------------------------
async function verifyLegacy(legacy) {
  const result = {
    name: legacy.name,
    contract: `${legacy.address}.${legacy.name}`,
    usedBy: legacy.usedBy,
    localPath: legacy.localPath,
    localHash: null,
    deployedHash: null,
    hashMatch: null,
    deployedFetchError: null,
    functionChecks: [],
    metaFields: null,
    metaFieldsOk: null,
    ok: false
  };

  // Local source
  let localSource;
  try {
    localSource = readFileSync(path(legacy.localPath), 'utf8');
    result.localHash = sha256Hex(localSource);
  } catch (error) {
    result.deployedFetchError = `Local file not found: ${legacy.localPath}`;
    return result;
  }

  // On-chain source
  let deployedSource;
  try {
    deployedSource = await fetchDeployedSource(legacy.address, legacy.name);
    result.deployedHash = sha256Hex(deployedSource);
    result.hashMatch = result.localHash === result.deployedHash;
  } catch (error) {
    result.deployedFetchError = error instanceof Error ? error.message : String(error);
    return result;
  }

  // Extract function signatures from deployed source (authoritative)
  const deployedFns = extractFunctions(deployedSource);
  const localFns = extractFunctions(localSource);

  for (const req of REQUIRED_FUNCTIONS) {
    const deployed = deployedFns[req.name];
    const local = localFns[req.name];
    result.functionChecks.push({
      name: req.name,
      note: req.note,
      expectedKind: req.kind,
      presentDeployed: Boolean(deployed),
      presentLocal: Boolean(local),
      kindMatchDeployed: deployed ? deployed.kind === req.kind : false,
      kindMatchLocal: local ? local.kind === req.kind : false,
      deployedSignature: deployed?.raw ?? null,
      localSignature: local?.raw ?? null,
      signatureMatch: deployed && local ? deployed.params === local.params : null
    });
  }

  // InscriptionMeta tuple shape (check deployed)
  const deployedMetaFields = extractMetaFields(deployedSource);
  result.metaFields = deployedMetaFields;
  result.metaFieldsOk = deployedMetaFields
    ? REQUIRED_META_FIELDS.every((field) => deployedMetaFields.includes(field))
    : false;

  result.ok =
    result.hashMatch === true &&
    result.metaFieldsOk === true &&
    result.functionChecks.every((check) => check.presentDeployed && check.kindMatchDeployed);

  return result;
}

// ---------------------------------------------------------------------------
// Render report
// ---------------------------------------------------------------------------
function renderReport(results) {
  const separator = '─'.repeat(72);
  let out = '';
  out += `\n${'═'.repeat(72)}\n`;
  out += `  Xtrata v3.2.2 — Legacy Source Verification\n`;
  out += `  Generated: ${new Date().toISOString()}\n`;
  out += `  API: ${API_URL}  Key: ${API_KEY ? 'configured' : 'not configured'}\n`;
  out += `${'═'.repeat(72)}\n`;

  for (const result of results) {
    out += `\n${separator}\n`;
    out += `  Contract: ${result.contract}\n`;
    out += `  Used by:  ${result.usedBy}\n`;
    out += `  Local:    ${result.localPath}\n`;
    out += `${separator}\n`;

    if (result.deployedFetchError) {
      out += `  ERROR: ${result.deployedFetchError}\n`;
      continue;
    }

    const hashStatus = result.hashMatch
      ? '✓ MATCH'
      : result.hashMatch === false
        ? '✗ MISMATCH — local file differs from on-chain bytecode'
        : '? unknown';
    out += `\n  Source hash\n`;
    out += `    Local    : ${result.localHash}\n`;
    out += `    Deployed : ${result.deployedHash}\n`;
    out += `    Status   : ${hashStatus}\n`;

    out += `\n  InscriptionMeta tuple fields (deployed)\n`;
    if (result.metaFields) {
      for (const field of REQUIRED_META_FIELDS) {
        const present = result.metaFields.includes(field);
        out += `    ${present ? '✓' : '✗'} ${field}\n`;
      }
    } else {
      out += `    ✗ InscriptionMeta map not found in deployed source\n`;
    }

    out += `\n  Migration-relevant function checks\n`;
    out += `  ${'Function'.padEnd(26)} ${'Kind'.padEnd(12)} ${'Deployed'.padEnd(10)} ${'Local'.padEnd(10)} Sig match\n`;
    out += `  ${'-'.repeat(70)}\n`;
    for (const check of result.functionChecks) {
      const dep = check.presentDeployed ? (check.kindMatchDeployed ? '✓ present' : '✗ wrong kind') : '✗ missing';
      const loc = check.presentLocal ? (check.kindMatchLocal ? '✓' : '✗ kind') : '✗ missing';
      const sig = check.signatureMatch === null ? '—' : check.signatureMatch ? '✓' : '✗ differ';
      out += `  ${check.name.padEnd(26)} ${(check.expectedKind).padEnd(12)} ${dep.padEnd(10)} ${loc.padEnd(10)} ${sig}\n`;
    }

    if (result.hashMatch === false) {
      out += `\n  Signature diff (local vs deployed) for changed functions:\n`;
      for (const check of result.functionChecks) {
        if (check.signatureMatch === false) {
          out += `    ${check.name}:\n`;
          out += `      local    : ${check.localSignature}\n`;
          out += `      deployed : ${check.deployedSignature}\n`;
        }
      }
    }

    const status = result.ok ? '✓ VERIFIED' : '✗ NEEDS ATTENTION';
    out += `\n  Overall: ${status}\n`;
  }

  out += `\n${'═'.repeat(72)}\n`;
  const allOk = results.every((result) => result.ok);
  out += `  Summary: ${allOk ? '✓ Both legacy contracts verified — safe to proceed' : '✗ One or more checks failed — review before deployment'}\n`;
  out += `${'═'.repeat(72)}\n\n`;
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const results = [];
for (const legacy of LEGACY) {
  process.stdout.write(`Checking ${legacy.address}.${legacy.name} … `);
  const result = await verifyLegacy(legacy);
  process.stdout.write(result.ok ? 'OK\n' : result.deployedFetchError ? 'ERROR\n' : 'ISSUES\n');
  results.push(result);
}

console.log(renderReport(results));
console.log(JSON.stringify(results, null, 2));
