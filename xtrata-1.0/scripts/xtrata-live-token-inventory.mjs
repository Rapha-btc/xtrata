#!/usr/bin/env node
import fs from 'node:fs/promises';
import {
  cvToHex,
  cvToJSON,
  hexToCV,
  uintCV
} from '@stacks/transactions';

const API_BASE = process.env.HIRO_API_BASE ?? 'https://api.hiro.so';
const SENDER = process.env.STACKS_READONLY_SENDER ?? 'SP000000000000000000002Q6VF78';
const START_ID = Number(process.env.START_ID ?? 1);
const END_ID = Number(process.env.END_ID ?? 300);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 3);
const RETRIES = Number(process.env.RETRIES ?? 4);
const RETRY_BASE_MS = Number(process.env.RETRY_BASE_MS ?? 350);
const OUTPUT_JSON = process.env.OUTPUT_JSON ?? 'reports/xtrata-live-token-inventory-1-300.json';
const OUTPUT_MD = process.env.OUTPUT_MD ?? 'reports/xtrata-live-token-inventory-1-300.md';

const contracts = [
  {
    label: 'v1.1.0',
    address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
    name: 'xtrata-v1-1-0'
  },
  {
    label: 'v1.1.1',
    address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
    name: 'xtrata-v1-1-1'
  },
  {
    label: 'v2.1.0',
    address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
    name: 'xtrata-v2-1-0'
  },
  {
    label: 'v2.1.1',
    address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
    name: 'xtrata-v2-1-1'
  }
].map((contract) => ({
  ...contract,
  id: `${contract.address}.${contract.name}`
}));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryAfterMs(response, payload) {
  const header = response.headers.get('retry-after');
  if (header && /^\d+$/.test(header)) {
    return (Number(header) + 1) * 1000;
  }
  const text = [
    payload?.cause,
    payload?.error,
    payload?.reason,
    payload?.raw
  ].filter(Boolean).join('\n');
  const match = text.match(/try again in\s+(\d+)\s+seconds/i);
  return match ? (Number(match[1]) + 1) * 1000 : null;
}

function clarityArg(cv) {
  return cvToHex(cv);
}

function normalizeResultHex(value) {
  return value.startsWith('0x') ? value : `0x${value}`;
}

async function callReadOnly(contract, functionName, args) {
  const url = `${API_BASE}/v2/contracts/call-read/${contract.address}/${contract.name}/${functionName}`;
  const body = {
    sender: SENDER,
    arguments: args.map(clarityArg)
  };

  let lastError;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { raw: text };
      }
      if (!response.ok || payload.okay === false) {
        const reason = payload.cause ?? payload.error ?? payload.reason ?? payload.raw ?? response.statusText;
        const error = new Error(`${response.status} ${response.statusText}: ${reason}`);
        error.retryAfterMs = retryAfterMs(response, payload);
        throw error;
      }
      if (!payload.result) {
        throw new Error(`Missing read-only result: ${JSON.stringify(payload).slice(0, 500)}`);
      }
      const cv = hexToCV(normalizeResultHex(payload.result));
      return { cv, json: cvToJSON(cv), raw: payload };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable = /429|500|502|503|504|fetch failed|ECONNRESET|ETIMEDOUT/i.test(message);
      if (!retryable || attempt === RETRIES) {
        throw error;
      }
      const advisedDelay = error?.retryAfterMs;
      await sleep(advisedDelay ?? RETRY_BASE_MS * 2 ** attempt);
    }
  }
  throw lastError;
}

function unwrapResponse(json) {
  if (json?.success === true) return json.value;
  if (json?.success === false) return null;
  return json;
}

function optionalValue(json) {
  const value = unwrapResponse(json);
  if (!value || value.value === null || value.type === '(optional none)') return null;
  return value.value ?? value;
}

function primitive(json) {
  if (!json) return null;
  if (typeof json !== 'object') return json;
  if (json.value === null || json.value === undefined) return null;
  return json.value;
}

function tupleField(tupleJson, field) {
  const tuple = optionalValue(tupleJson);
  return tuple?.value?.[field] ?? null;
}

function fieldAsString(tupleJson, field) {
  const entry = tupleField(tupleJson, field);
  const value = primitive(entry);
  return value === null || value === undefined ? null : String(value);
}

function fieldAsNumber(tupleJson, field) {
  const value = fieldAsString(tupleJson, field);
  return value === null ? null : Number(value);
}

function displayError(error) {
  return error instanceof Error ? error.message : String(error);
}

function ranges(ids) {
  if (ids.length === 0) return '';
  const sorted = [...ids].sort((a, b) => a - b);
  const parts = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const id of sorted.slice(1)) {
    if (id === prev + 1) {
      prev = id;
      continue;
    }
    parts.push(start === prev ? String(start) : `${start}-${prev}`);
    start = id;
    prev = id;
  }
  parts.push(start === prev ? String(start) : `${start}-${prev}`);
  return parts.join(', ');
}

function gaps(found) {
  const foundSet = new Set(found);
  const missing = [];
  for (let id = START_ID; id <= END_ID; id += 1) {
    if (!foundSet.has(id)) missing.push(id);
  }
  return ranges(missing);
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

async function tokenExists(contract, tokenId) {
  try {
    const result = await callReadOnly(contract, 'get-owner', [uintCV(tokenId)]);
    const owner = optionalValue(result.json);
    return {
      exists: owner !== null,
      owner: owner?.value ?? null,
      error: null
    };
  } catch (error) {
    return {
      exists: false,
      owner: null,
      error: displayError(error)
    };
  }
}

async function safeRead(contract, functionName, args) {
  try {
    return { ok: true, result: await callReadOnly(contract, functionName, args), error: null };
  } catch (error) {
    return { ok: false, result: null, error: displayError(error) };
  }
}

async function tokenDetails(contract, tokenId, owner) {
  const [tokenUri, rawUri, meta] = await Promise.all([
    safeRead(contract, 'get-token-uri', [uintCV(tokenId)]),
    safeRead(contract, 'get-token-uri-raw', [uintCV(tokenId)]),
    safeRead(contract, 'get-inscription-meta', [uintCV(tokenId)])
  ]);

  const uri =
    (tokenUri.ok ? primitive(optionalValue(tokenUri.result.json)) : null) ??
    (rawUri.ok ? primitive(optionalValue(rawUri.result.json)) : null);

  const metaJson = meta.ok ? meta.result.json : null;
  const totalChunks = metaJson ? fieldAsNumber(metaJson, 'total-chunks') : null;
  const chunk0 =
    totalChunks && totalChunks > 0
      ? await safeRead(contract, 'get-chunk', [uintCV(tokenId), uintCV(0)])
      : null;
  const chunkReadable =
    chunk0 === null
      ? false
      : chunk0.ok && optionalValue(chunk0.result.json) !== null;

  return {
    contract: contract.id,
    contractLabel: contract.label,
    contractName: contract.name,
    tokenId,
    exists: true,
    owner,
    tokenUri: uri,
    totalSize: metaJson ? fieldAsNumber(metaJson, 'total-size') : null,
    totalChunks,
    finalHash: metaJson ? fieldAsString(metaJson, 'final-hash') : null,
    metadataReadable: meta.ok && optionalValue(metaJson) !== null,
    chunksReadable: chunkReadable,
    readErrors: {
      tokenUri: tokenUri.error,
      tokenUriRaw: rawUri.error,
      meta: meta.error,
      chunk0: chunk0?.error ?? null
    }
  };
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(' |')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell ?? '').replaceAll('\n', ' ')).join(' | ')} |`)
  ].join('\n');
}

function makeMarkdown(report) {
  const lines = [];
  lines.push('# Xtrata Live Token Inventory 1-300');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`API: ${report.apiBase}`);
  lines.push(`Range: ${report.range.start}-${report.range.end}`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push(markdownTable(
    ['Contract', 'Found', 'Token IDs Found', 'Gaps'],
    report.contracts.map((entry) => [
      entry.contract,
      entry.foundCount,
      entry.foundIds.length > 0 ? ranges(entry.foundIds) : 'none',
      entry.foundIds.length === report.range.end - report.range.start + 1 ? 'none' : gaps(entry.foundIds)
    ])
  ));
  lines.push('');

  lines.push('## Token ID Matrix');
  lines.push('');
  lines.push(markdownTable(
    ['Token ID', 'v1.1.0', 'v1.1.1', 'v2.1.0', 'v2.1.1', 'Notes'],
    report.matrix.map((row) => [
      row.tokenId,
      row['v1.1.0'] ? 'yes' : 'no',
      row['v1.1.1'] ? 'yes' : 'no',
      row['v2.1.0'] ? 'yes' : 'no',
      row['v2.1.1'] ? 'yes' : 'no',
      row.notes
    ])
  ));
  lines.push('');

  lines.push('## Collisions');
  lines.push('');
  if (report.collisions.length === 0) {
    lines.push('No token ID collisions were found in the scanned range.');
  } else {
    lines.push(markdownTable(
      ['Token ID', 'Contracts', 'Owners'],
      report.collisions.map((collision) => [
        collision.tokenId,
        collision.contracts.join(', '),
        collision.owners.map((owner) => `${owner.contract}: ${owner.owner}`).join('; ')
      ])
    ));
  }
  lines.push('');

  lines.push('## Failed Contracts');
  lines.push('');
  if (report.failedContracts.length === 0) {
    lines.push('No contract-level failures were detected.');
  } else {
    lines.push(markdownTable(
      ['Contract', 'Error'],
      report.failedContracts.map((entry) => [entry.contract, entry.error])
    ));
  }
  lines.push('');

  lines.push('## Full Token List');
  lines.push('');
  if (report.tokens.length === 0) {
    lines.push('No tokens found.');
  } else {
    lines.push(markdownTable(
      ['Contract', 'Token ID', 'Owner', 'Token URI', 'Total Size', 'Total Chunks', 'Final Hash', 'Metadata Readable', 'Chunks Readable'],
      report.tokens.map((token) => [
        token.contract,
        token.tokenId,
        token.owner,
        token.tokenUri ?? '',
        token.totalSize ?? '',
        token.totalChunks ?? '',
        token.finalHash ?? '',
        token.metadataReadable ? 'yes' : 'no',
        token.chunksReadable ? 'yes' : 'no'
      ])
    ));
  }
  lines.push('');

  lines.push('## Migration Planning Notes');
  lines.push('');
  lines.push('- Same-ID migration into one v3 contract will collide for any token ID that exists on more than one source contract.');
  lines.push('- Escrow/wrapper migration can avoid re-uploading bytes, but v3 must record the source contract for migrated chunks.');
  lines.push('- Existing v1/v2 token IDs should be treated as contract-qualified IDs until migrated.');
  lines.push('- If collisions exist, migration needs either a collision policy, separate v3 namespaces, or non-same-ID remapping with an explicit source map.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function main() {
  await fs.mkdir('reports', { recursive: true });
  const tokens = [];
  const failedContracts = [];
  const contractSummaries = [];

  for (const contract of contracts) {
    console.log(`Scanning ${contract.id} token IDs ${START_ID}-${END_ID}`);
    const preflight = await tokenExists(contract, START_ID);
    if (preflight.error && /not found|NoSuchContract|Contract.*does not exist|No contract|Failed to execute/i.test(preflight.error)) {
      failedContracts.push({ contract: contract.id, error: preflight.error });
      contractSummaries.push({
        contract: contract.id,
        label: contract.label,
        foundCount: 0,
        foundIds: [],
        scanErrors: [{ tokenId: START_ID, error: preflight.error }]
      });
      continue;
    }

    const ids = [];
    for (let id = START_ID; id <= END_ID; id += 1) ids.push(id);
    const ownerRows = await mapLimit(ids, CONCURRENCY, async (tokenId) => {
      const row = tokenId === START_ID ? preflight : await tokenExists(contract, tokenId);
      if ((tokenId - START_ID + 1) % 50 === 0) {
        console.log(`  ${contract.label}: checked through ${tokenId}`);
      }
      return { tokenId, ...row };
    });

    const found = ownerRows.filter((row) => row.exists);
    const scanErrors = ownerRows
      .filter((row) => row.error)
      .map((row) => ({ tokenId: row.tokenId, error: row.error }));
    const details = await mapLimit(found, CONCURRENCY, async (row) =>
      tokenDetails(contract, row.tokenId, row.owner)
    );
    tokens.push(...details);
    contractSummaries.push({
      contract: contract.id,
      label: contract.label,
      foundCount: details.length,
      foundIds: details.map((row) => row.tokenId).sort((a, b) => a - b),
      scanErrors
    });
  }

  tokens.sort((a, b) =>
    a.tokenId - b.tokenId || a.contract.localeCompare(b.contract)
  );

  const matrix = [];
  for (let tokenId = START_ID; tokenId <= END_ID; tokenId += 1) {
    const row = { tokenId, notes: '' };
    for (const contract of contracts) {
      const hit = tokens.find((token) => token.tokenId === tokenId && token.contractLabel === contract.label);
      row[contract.label] = hit
        ? {
            owner: hit.owner,
            tokenUri: hit.tokenUri,
            totalSize: hit.totalSize,
            totalChunks: hit.totalChunks,
            finalHash: hit.finalHash
          }
        : null;
    }
    const hits = contracts.filter((contract) => row[contract.label]);
    if (hits.length === 1) {
      const hit = row[hits[0].label];
      row.notes = `owner ${hit.owner}`;
    } else if (hits.length > 1) {
      row.notes = `collision: ${hits.map((contract) => contract.label).join(', ')}`;
    }
    matrix.push(row);
  }

  const collisions = matrix
    .filter((row) => contracts.filter((contract) => row[contract.label]).length > 1)
    .map((row) => ({
      tokenId: row.tokenId,
      contracts: contracts.filter((contract) => row[contract.label]).map((contract) => contract.id),
      owners: contracts
        .filter((contract) => row[contract.label])
        .map((contract) => ({ contract: contract.id, owner: row[contract.label].owner }))
    }));

  const report = {
    generatedAt: new Date().toISOString(),
    apiBase: API_BASE,
    range: { start: START_ID, end: END_ID },
    contracts: contractSummaries,
    failedContracts,
    tokens,
    matrix,
    collisions
  };

  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(OUTPUT_MD, makeMarkdown(report));

  console.log(`Wrote ${OUTPUT_JSON}`);
  console.log(`Wrote ${OUTPUT_MD}`);
  console.log(`Found ${tokens.length} token records and ${collisions.length} token ID collisions.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
