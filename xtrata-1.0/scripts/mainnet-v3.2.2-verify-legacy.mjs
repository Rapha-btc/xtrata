#!/usr/bin/env node
/**
 * Verify that the deployed legacy contracts match local live sources and expose
 * the function interfaces that xtrata-v3.2.2 migration depends on.
 *
 * Usage:
 *   node scripts/mainnet-v3.2.2-verify-legacy.mjs
 *   XTRATA_MAINNET_HIRO_API_KEY=<key> node scripts/mainnet-v3.2.2-verify-legacy.mjs
 *
 * Exit code is 0 only when both contracts verify (interface + tuple shape, with
 * an exact-or-whitespace-only source match). A real source/interface drift, a
 * missing local file, or a fetch failure exits 1.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const API_URL = (process.env.XTRATA_MAINNET_API_URL ?? 'https://api.hiro.so').replace(/\/$/, '');
const API_KEY = process.env.XTRATA_MAINNET_HIRO_API_KEY ?? '';
const DEPLOYER = process.env.XTRATA_DEPLOYER ?? 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const root = new URL('../', import.meta.url);
const resolve = (relative) => new URL(relative, root).pathname;

const sha256Hex = (text) => createHash('sha256').update(text).digest('hex');

const headers = () => {
  const result = { 'content-type': 'application/json' };
  if (API_KEY) result['x-api-key'] = API_KEY;
  return result;
};

// Functions xtrata-v3.2.2 calls cross-contract during migration, plus the
// preflight reads used to compute the continuity next-id.
const REQUIRED_FUNCTIONS = [
  { name: 'get-inscription-meta', kind: 'read-only', note: 'migrate meta — tuple shape must match' },
  { name: 'get-token-uri-raw',    kind: 'read-only', note: 'migrate token URI' },
  { name: 'get-dependencies',     kind: 'read-only', note: 'migrate dependencies' },
  { name: 'get-chunk',            kind: 'read-only', note: 'chunk fallback reader' },
  { name: 'get-chunk-batch',      kind: 'read-only', note: 'chunk batch fallback reader' },
  { name: 'transfer',             kind: 'public',    note: 'escrow transfer into v3.2.2' },
  { name: 'get-last-token-id',    kind: 'read-only', note: 'continuity next-id computation' },
  { name: 'get-next-token-id',    kind: 'read-only', note: 'continuity next-id computation' },
  { name: 'is-paused',            kind: 'read-only', note: 'pause-gating in handover sequence' },
  { name: 'get-admin',            kind: 'read-only', note: 'admin address verification' }
];

// Tuple shape that migrate-from-v1 and migrate-from-v2-1-0 destructure from
// get-inscription-meta. All seven fields must be present.
const REQUIRED_META_FIELDS = [
  'owner', 'creator', 'mime-type', 'total-size', 'total-chunks', 'sealed', 'final-hash'
];

// Local source candidates per contract. The first that exists is used, so this
// tolerates both dotted (xtrata-v1.1.1.clar) and underscored (xtrata-v1_1_1.clar)
// filenames and a repo-root fallback. Override with XTRATA_LEGACY_DIR if needed.
const LEGACY_DIR = process.env.XTRATA_LEGACY_DIR ?? 'contracts/live';
const LEGACY = [
  {
    name: 'xtrata-v1-1-1',
    address: DEPLOYER,
    usedBy: 'migrate-from-v1',
    localCandidates: [
      `${LEGACY_DIR}/xtrata-v1.1.1.clar`,
      `${LEGACY_DIR}/xtrata-v1_1_1.clar`,
      'xtrata-v1_1_1.clar',
      'xtrata-v1.1.1.clar'
    ]
  },
  {
    name: 'xtrata-v2-1-0',
    address: DEPLOYER,
    usedBy: 'migrate-from-v2-1-0',
    localCandidates: [
      `${LEGACY_DIR}/xtrata-v2.1.0.clar`,
      `${LEGACY_DIR}/xtrata-v2_1_0.clar`,
      'xtrata-v2_1_0.clar',
      'xtrata-v2.1.0.clar'
    ]
  }
];

// ---------------------------------------------------------------------------
// Source-text helpers
// ---------------------------------------------------------------------------

// Whitespace-only normalisation: CRLF→LF, strip trailing per-line whitespace,
// collapse trailing blank lines. Two sources that differ only by these compile
// to identical bytecode, so a difference here is a warning, not a hard fail.
function normalizeWhitespace(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/, '\n')
    .trimEnd();
}

// Is the character index inside a `;` line comment?
function inLineComment(source, index) {
  const lineStart = source.lastIndexOf('\n', index - 1) + 1;
  const before = source.slice(lineStart, index);
  return before.includes(';');
}

// From an index pointing at an opening '(', return the substring up to and
// including its balanced closing ')'. Skips `;` line comments. Null if unbalanced.
function readBalanced(source, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const c = source[i];
    if (c === ';') {
      const nl = source.indexOf('\n', i);
      if (nl === -1) return null;
      i = nl;
      continue;
    }
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, i + 1);
    }
  }
  return null;
}

// Extract { name: { kind, params, signature } } for every define-public,
// define-read-only and define-private. Handles zero-arg functions, multi-line
// and nested-paren signatures, and skips commented-out definitions.
function extractFunctions(source) {
  const results = {};
  const headerRe = /\(define-(public|read-only|private)\s+\(/g;
  let m;
  while ((m = headerRe.exec(source)) !== null) {
    if (inLineComment(source, m.index)) continue;
    const kind = m[1];
    const sigOpen = headerRe.lastIndex - 1; // index of the signature's '('
    const sig = readBalanced(source, sigOpen);
    if (!sig) continue;
    const inner = sig.slice(1, -1); // strip the signature's outer parens
    const nameMatch = inner.match(/^\s*([^\s()]+)/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const params = inner.slice(nameMatch[0].length).trim().replace(/\s+/g, ' ');
    const signature = `(define-${kind} ${sig})`.replace(/\s+/g, ' ');
    if (!(name in results)) results[name] = { kind, params, signature };
  }
  return results;
}

// Field names of the InscriptionMeta map value tuple.
function extractMetaFields(source) {
  const idx = source.search(/\(define-map\s+InscriptionMeta\b/);
  if (idx === -1) return null;
  const open = source.indexOf('{', idx);
  if (open === -1) return null;
  let depth = 0;
  let close = -1;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) { close = i; break; }
    }
  }
  if (close === -1) return null;
  return source
    .slice(open + 1, close)
    .split(',')
    .map((field) => field.trim().split(/[\s:]/)[0].trim())
    .filter(Boolean);
}

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
  if (typeof json.source !== 'string') {
    throw new Error(`Unexpected /v2/contracts/source shape: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json.source;
}

// ---------------------------------------------------------------------------
// Verify one legacy contract
// ---------------------------------------------------------------------------
async function verifyLegacy(legacy) {
  const result = {
    name: legacy.name,
    contract: `${legacy.address}.${legacy.name}`,
    usedBy: legacy.usedBy,
    localPath: null,
    localHash: null,
    deployedHash: null,
    hashState: null, // 'exact' | 'whitespace-only' | 'mismatch'
    error: null,
    functionChecks: [],
    metaFields: null,
    metaFieldsOk: null,
    warnings: [],
    ok: false
  };

  const localPath = legacy.localCandidates.map(resolve).find((p) => existsSync(p));
  if (!localPath) {
    result.error =
      `No local source found. Looked for: ${legacy.localCandidates.join(', ')}. ` +
      `Place the deployed source there or set XTRATA_LEGACY_DIR.`;
    return result;
  }
  result.localPath = localPath;
  const localSource = readFileSync(localPath, 'utf8');
  result.localHash = sha256Hex(localSource);

  let deployedSource;
  try {
    deployedSource = await fetchDeployedSource(legacy.address, legacy.name);
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    return result;
  }
  result.deployedHash = sha256Hex(deployedSource);

  if (result.localHash === result.deployedHash) {
    result.hashState = 'exact';
  } else if (sha256Hex(normalizeWhitespace(localSource)) === sha256Hex(normalizeWhitespace(deployedSource))) {
    result.hashState = 'whitespace-only';
    result.warnings.push('Local and deployed sources differ only in whitespace/line-endings (same bytecode).');
  } else {
    result.hashState = 'mismatch';
  }

  const deployedFns = extractFunctions(deployedSource);
  const localFns = extractFunctions(localSource);

  for (const req of REQUIRED_FUNCTIONS) {
    const deployed = deployedFns[req.name];
    const local = localFns[req.name];
    const signatureMatch = deployed && local ? deployed.signature === local.signature : null;
    if (signatureMatch === false) {
      result.warnings.push(`Signature drift in ${req.name}: local "${local.signature}" vs deployed "${deployed.signature}".`);
    }
    result.functionChecks.push({
      name: req.name,
      note: req.note,
      expectedKind: req.kind,
      presentDeployed: Boolean(deployed),
      presentLocal: Boolean(local),
      kindMatchDeployed: deployed ? deployed.kind === req.kind : false,
      kindMatchLocal: local ? local.kind === req.kind : false,
      deployedSignature: deployed?.signature ?? null,
      localSignature: local?.signature ?? null,
      signatureMatch
    });
  }

  const deployedMetaFields = extractMetaFields(deployedSource);
  result.metaFields = deployedMetaFields;
  result.metaFieldsOk = deployedMetaFields
    ? REQUIRED_META_FIELDS.every((field) => deployedMetaFields.includes(field))
    : false;

  // ok: source matches (exact or whitespace-only), the deployed contract exposes
  // every required function with the right kind, and the meta tuple is intact.
  result.ok =
    result.hashState !== 'mismatch' &&
    result.metaFieldsOk === true &&
    result.functionChecks.every((c) => c.presentDeployed && c.kindMatchDeployed);

  return result;
}

// ---------------------------------------------------------------------------
// Render report
// ---------------------------------------------------------------------------
function renderReport(results) {
  const bar = '═'.repeat(72);
  const sep = '─'.repeat(72);
  let out = `\n${bar}\n  Xtrata v3.2.2 — Legacy Source Verification\n`;
  out += `  Generated: ${new Date().toISOString()}\n`;
  out += `  API: ${API_URL}  Key: ${API_KEY ? 'configured' : 'not configured'}\n${bar}\n`;

  for (const result of results) {
    out += `\n${sep}\n  Contract: ${result.contract}\n  Used by:  ${result.usedBy}\n`;
    out += `  Local:    ${result.localPath ?? '(not found)'}\n${sep}\n`;

    if (result.error) {
      out += `  ERROR: ${result.error}\n`;
      continue;
    }

    const hashStatus = {
      exact: '✓ exact match',
      'whitespace-only': '⚠ whitespace-only difference (same bytecode)',
      mismatch: '✗ MISMATCH — local source differs from on-chain'
    }[result.hashState];
    out += `\n  Source hash\n    Local    : ${result.localHash}\n    Deployed : ${result.deployedHash}\n    Status   : ${hashStatus}\n`;

    out += `\n  InscriptionMeta tuple fields (deployed)\n`;
    if (result.metaFields) {
      for (const field of REQUIRED_META_FIELDS) {
        out += `    ${result.metaFields.includes(field) ? '✓' : '✗'} ${field}\n`;
      }
    } else {
      out += `    ✗ InscriptionMeta map not found in deployed source\n`;
    }

    out += `\n  Migration-relevant function checks\n`;
    out += `  ${'Function'.padEnd(22)} ${'Kind'.padEnd(10)} ${'Deployed'.padEnd(14)} ${'Local'.padEnd(12)} Sig\n`;
    out += `  ${'-'.repeat(68)}\n`;
    for (const c of result.functionChecks) {
      const dep = c.presentDeployed ? (c.kindMatchDeployed ? '✓ present' : '✗ wrong kind') : '✗ missing';
      const loc = c.presentLocal ? (c.kindMatchLocal ? '✓' : '✗ kind') : '✗ missing';
      const sig = c.signatureMatch === null ? '—' : c.signatureMatch ? '✓' : '✗ differ';
      out += `  ${c.name.padEnd(22)} ${c.expectedKind.padEnd(10)} ${dep.padEnd(14)} ${loc.padEnd(12)} ${sig}\n`;
    }

    const sigDrift = result.functionChecks.filter((c) => c.signatureMatch === false);
    if (sigDrift.length) {
      out += `\n  Signature diff (local vs deployed):\n`;
      for (const c of sigDrift) {
        out += `    ${c.name}:\n      local    : ${c.localSignature}\n      deployed : ${c.deployedSignature}\n`;
      }
    }

    if (result.warnings.length) {
      out += `\n  Warnings\n`;
      for (const w of result.warnings) out += `    ⚠ ${w}\n`;
    }

    out += `\n  Overall: ${result.ok ? '✓ VERIFIED' : '✗ NEEDS ATTENTION'}\n`;
  }

  const allOk = results.every((r) => r.ok);
  out += `\n${bar}\n  Summary: ${allOk
    ? '✓ Both legacy contracts verified — interface and tuple shape match on-chain'
    : '✗ One or more checks failed — review before deployment'}\n${bar}\n`;
  return out;
}

// ---------------------------------------------------------------------------
// Main (only when run directly; helpers are importable for testing)
// ---------------------------------------------------------------------------
async function main() {
  const results = [];
  for (const legacy of LEGACY) {
    process.stdout.write(`Checking ${legacy.address}.${legacy.name} … `);
    const result = await verifyLegacy(legacy);
    process.stdout.write(result.ok ? 'OK\n' : result.error ? 'ERROR\n' : 'ISSUES\n');
    results.push(result);
  }
  console.log(renderReport(results));
  console.log(JSON.stringify(results, null, 2));
  if (!results.every((r) => r.ok)) process.exitCode = 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) await main();

export { extractFunctions, extractMetaFields, normalizeWhitespace, readBalanced, verifyLegacy };
