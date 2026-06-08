#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import {
  bufferCV,
  cvToHex,
  cvToJSON,
  hexToCV,
  principalCV,
  uintCV
} from '@stacks/transactions';

const mode = process.argv[2] ?? 'preflight';
const root = new URL('../', import.meta.url);
const path = (relative) => new URL(relative, root);

const EXPECTED_ADMIN = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const API_URL = (process.env.XTRATA_MAINNET_API_URL ?? 'https://api.hiro.so').replace(/\/$/, '');
const API_KEY = process.env.XTRATA_MAINNET_HIRO_API_KEY ?? '';
const ROYALTY_RECIPIENT = process.env.XTRATA_MAINNET_ROYALTY_RECIPIENT ?? EXPECTED_ADMIN;
const CHUNK_SIZE = 16 * 1024;
const REPORT_JSON = path('reports/mainnet-v3.2.1-handover.json');
const REPORT_MD = path('reports/mainnet-v3.2.1-handover.md');
const ANNOUNCEMENT_PATH = 'docs/mainnet-v3.2.1-announcement-inscription.md';
const CORE_SOURCE_PATH = 'contracts/live/xtrata-v3.2.1.clar';
const V2_1_1_SOURCE_PATH = 'contracts/live/xtrata-v2.1.1.clar';

const contracts = {
  v1_1_1: {
    address: EXPECTED_ADMIN,
    name: 'xtrata-v1-1-1',
    role: 'legacy'
  },
  v2_1_0: {
    address: EXPECTED_ADMIN,
    name: 'xtrata-v2-1-0',
    role: 'current-live'
  },
  v2_1_1: {
    address: EXPECTED_ADMIN,
    name: 'xtrata-v2-1-1',
    role: 'migration-dependency'
  },
  core: {
    address: EXPECTED_ADMIN,
    name: 'xtrata-v3-2-1',
    role: 'new-core'
  }
};

const headers = () => {
  const result = { 'content-type': 'application/json' };
  if (API_KEY) {
    result['x-api-key'] = API_KEY;
  }
  return result;
};

const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

const chunkBytes = (bytes) => {
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    chunks.push(bytes.subarray(offset, offset + CHUNK_SIZE));
  }
  return chunks.length > 0 ? chunks : [Buffer.alloc(0)];
};

const xtrataRollingHash = (chunks) => {
  let digest = Buffer.alloc(32, 0);
  for (const chunk of chunks) {
    digest = createHash('sha256')
      .update(Buffer.concat([digest, Buffer.from(chunk)]))
      .digest();
  }
  return digest;
};

const cvJsonValue = (json) => {
  if (!json) {
    return undefined;
  }
  if (
    json.type === 'responseOk' ||
    json.type === 'optional' ||
    String(json.type).startsWith('(response ')
  ) {
    return cvJsonValue(json.value);
  }
  if (json.type === 'uint') {
    return Number(json.value);
  }
  if (json.type === 'principal' || json.type === 'bool') {
    return json.value;
  }
  if (json.type === '(optional none)') {
    return null;
  }
  if (json.type === '(optional uint)' || json.type === '(optional principal)') {
    return json.value ? cvJsonValue(json.value) : null;
  }
  return json.value ?? json;
};

const decodeReadResult = (hex) => {
  const json = cvToJSON(hexToCV(hex));
  return {
    raw: hex,
    json,
    value: cvJsonValue(json)
  };
};

const readOnly = async (contract, functionName, args = []) => {
  const url = `${API_URL}/v2/contracts/call-read/${contract.address}/${contract.name}/${functionName}`;
  const body = JSON.stringify({
    sender: EXPECTED_ADMIN,
    arguments: args.map((entry) => cvToHex(entry))
  });
  const response = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${contract.address}.${contract.name}.${functionName} returned non-JSON: ${text.slice(0, 180)}`);
  }
  if (!response.ok || !payload.okay) {
    throw new Error(`${contract.address}.${contract.name}.${functionName} failed: ${JSON.stringify(payload)}`);
  }
  return decodeReadResult(payload.result);
};

const tryRead = async (contract, functionName, args = []) => {
  try {
    return {
      ok: true,
      ...(await readOnly(contract, functionName, args))
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

const collectContractReads = async (contract, functions) => {
  const entries = await Promise.all(
    functions.map(async (fn) => [fn, await tryRead(contract, fn)])
  );
  return Object.fromEntries(entries);
};

const contractId = (contract) => `${contract.address}.${contract.name}`;

const getNumeric = (reads, key) => {
  const entry = reads?.[key];
  return entry?.ok && typeof entry.value === 'number' ? entry.value : null;
};

const getPrincipal = (reads, key) => {
  const entry = reads?.[key];
  return entry?.ok && typeof entry.value === 'string' ? entry.value : null;
};

const buildReport = async () => {
  const failures = [];
  const warnings = [];
  const now = new Date().toISOString();

  const coreSource = readFileSync(path(CORE_SOURCE_PATH), 'utf8');
  const v211Source = readFileSync(path(V2_1_1_SOURCE_PATH), 'utf8');
  const announcementBytes = readFileSync(path(ANNOUNCEMENT_PATH));
  const announcementChunks = chunkBytes(announcementBytes);
  const announcementHash = xtrataRollingHash(announcementChunks);

  const legacyReadFns = [
    'get-admin',
    'is-paused',
    'get-next-token-id',
    'get-last-token-id',
    'get-royalty-recipient',
    'get-fee-unit'
  ];
  const coreReadFns = [
    ...legacyReadFns,
    'get-minted-count',
    'get-begin-fee-unit',
    'get-upload-chunk-fee-unit',
    'get-upload-batch-fee-unit',
    'get-seal-fee-unit',
    'get-single-tx-fee-unit'
  ];

  const reads = {};
  for (const [key, contract] of Object.entries(contracts)) {
    reads[key] = await collectContractReads(
      contract,
      key === 'core' ? coreReadFns : legacyReadFns
    );
  }

  const legacyValues = Object.entries(contracts)
    .filter(([, contract]) => ['legacy', 'current-live', 'migration-dependency'].includes(contract.role))
    .map(([key]) => {
      const next = getNumeric(reads[key], 'get-next-token-id');
      const last = getNumeric(reads[key], 'get-last-token-id');
      return {
        key,
        contract: contractId(contracts[key]),
        next,
        last,
        candidate: Math.max(next ?? 0, (last ?? -1) + 1)
      };
    });

  const computedNextId = Math.max(...legacyValues.map((entry) => entry.candidate));
  const highestLegacyLastId = Math.max(...legacyValues.map((entry) => entry.last ?? -1));
  const coreAdmin = getPrincipal(reads.core, 'get-admin');
  const oldAdmin = getPrincipal(reads.v2_1_0, 'get-admin');
  const coreNextId = getNumeric(reads.core, 'get-next-token-id');
  const coreLastId = getNumeric(reads.core, 'get-last-token-id');
  const coreMintedCount = getNumeric(reads.core, 'get-minted-count');
  const currentLivePaused = reads.v2_1_0['is-paused']?.ok
    ? reads.v2_1_0['is-paused'].value === true
    : false;

  if (oldAdmin && oldAdmin !== EXPECTED_ADMIN) {
    failures.push(`Current live core admin is ${oldAdmin}, expected ${EXPECTED_ADMIN}.`);
  }
  if (!reads.v2_1_1['get-admin'].ok) {
    warnings.push('xtrata-v2-1-1 is not deployed on mainnet. Deploy it first as an empty paused migration dependency because xtrata-v3.2.1 references it.');
  }
  if (!reads.core['get-admin'].ok) {
    warnings.push('New core is not readable yet. Deploy xtrata-v3-2-1 from contracts/live/xtrata-v3.2.1.clar, then rerun preflight before setup.');
  } else if (coreAdmin !== EXPECTED_ADMIN) {
    failures.push(`New core admin is ${coreAdmin}, expected ${EXPECTED_ADMIN}.`);
  }
  if (coreMintedCount !== null && coreMintedCount !== 0) {
    failures.push(`New core minted-count is ${coreMintedCount}; set-next-id must happen before any native mint.`);
  }
  if (coreNextId !== null && coreNextId !== 0 && coreNextId !== computedNextId) {
    warnings.push(`New core next-id is ${coreNextId}. If set-next-id already ran, confirm it matches the computed continuity target ${computedNextId}.`);
  }
  if (coreLastId !== null && coreLastId >= 0) {
    warnings.push(`New core last-token-id is ${coreLastId}; verify this is expected before any handover mint.`);
  }
  if (computedNextId <= highestLegacyLastId) {
    failures.push(`Computed next ID ${computedNextId} does not dominate highest legacy last ID ${highestLegacyLastId}.`);
  }
  if (announcementChunks.length > 32) {
    failures.push(`Announcement inscription is ${announcementChunks.length} chunks; core mint-single-tx limit is 32.`);
  }
  if (!ROYALTY_RECIPIENT || ROYALTY_RECIPIENT === '<mainnet-royalty-address>') {
    failures.push('Set XTRATA_MAINNET_ROYALTY_RECIPIENT before setup.');
  }
  if (reads.core['get-admin'].ok && !currentLivePaused) {
    warnings.push('Current live xtrata-v2-1-0 is not paused. Pause it, wait for confirmation, then rerun preflight before set-next-id.');
  }

  const recommendation =
    failures.length > 0
      ? 'blocked'
      : reads.core['get-admin'].ok
        ? currentLivePaused
          ? 'ready for Xverse setup and announcement signatures'
          : 'ready to pause current live core with Xverse'
        : reads.v2_1_1['get-admin'].ok
          ? 'ready to deploy core with Xverse'
          : 'ready to deploy v2.1.1 dependency with Xverse';

  return {
    generated: now,
    network: 'mainnet',
    apiUrl: API_URL,
    hiroApiKey: API_KEY ? 'configured' : 'not configured',
    expectedAdmin: EXPECTED_ADMIN,
    signerWallet: 'Xverse',
    signerBns: 'Xtrata.btc',
    royaltyRecipient: ROYALTY_RECIPIENT,
    recommendation,
    contracts,
    source: {
      core: CORE_SOURCE_PATH,
      coreSha256: sha256Hex(Buffer.from(coreSource, 'utf8')),
      coreClarityVersion: 3,
      v2_1_1: V2_1_1_SOURCE_PATH,
      v2_1_1Sha256: sha256Hex(Buffer.from(v211Source, 'utf8')),
      v2_1_1ClarityVersion: 2,
      announcement: ANNOUNCEMENT_PATH,
      announcementSha256: sha256Hex(announcementBytes)
    },
    announcement: {
      mime: 'text/markdown',
      tokenUri: 'data:text/markdown,xtrata-v3.2.1-mainnet-handover',
      bytes: announcementBytes.length,
      chunkSize: CHUNK_SIZE,
      chunks: announcementChunks.length,
      finalHashHex: announcementHash.toString('hex'),
      chunkHex: announcementChunks.map((chunk) => Buffer.from(chunk).toString('hex'))
    },
    nextId: {
      legacyValues,
      highestLegacyLastId,
      computedNextId
    },
    handoverState: {
      currentLiveContract: contractId(contracts.v2_1_0),
      currentLivePaused,
      setNextIdAllowed: currentLivePaused && reads.core['get-admin'].ok
    },
    reads,
    failures,
    warnings
  };
};

const writeReport = (report) => {
  mkdirSync(path('reports'), { recursive: true });
  writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(REPORT_MD, renderMarkdown(report));
  console.log(`Wrote ${REPORT_JSON.pathname}`);
  console.log(`Wrote ${REPORT_MD.pathname}`);
  console.log(`Recommendation: ${report.recommendation}`);
};

const renderRead = (entry) => {
  if (!entry) return '';
  if (!entry.ok) return `failed: ${entry.error}`;
  return String(entry.value);
};

const renderMarkdown = (report) => `# Xtrata v3.2.1 Mainnet Handover

Generated: ${report.generated}

## Summary

- Network: ${report.network}
- API URL: ${report.apiUrl}
- Hiro API key: ${report.hiroApiKey}
- Signer wallet: ${report.signerWallet}
- Signer BNS: ${report.signerBns}
- Expected signer/admin: ${report.expectedAdmin}
- Royalty recipient: ${report.royaltyRecipient}
- Recommendation: ${report.recommendation}

## Contracts

| Key | Contract | Role |
|---|---|---|
${Object.entries(report.contracts)
  .map(([key, contract]) => `| ${key} | ${contractId(contract)} | ${contract.role} |`)
  .join('\n')}

## Source

- Mainnet core source: \`${report.source.core}\`
- Mainnet core Clarity version: ${report.source.coreClarityVersion}
- Core source SHA-256: \`${report.source.coreSha256}\`
- v2.1.1 dependency source: \`${report.source.v2_1_1}\`
- v2.1.1 dependency Clarity version: ${report.source.v2_1_1ClarityVersion}
- v2.1.1 dependency SHA-256: \`${report.source.v2_1_1Sha256}\`
- Announcement source: \`${report.source.announcement}\`
- Announcement SHA-256: \`${report.source.announcementSha256}\`
- Announcement final Xtrata hash: \`${report.announcement.finalHashHex}\`
- Announcement bytes/chunks: ${report.announcement.bytes} bytes / ${report.announcement.chunks} chunk(s)

## Next ID

| Source | Next | Last | Candidate |
|---|---:|---:|---:|
${report.nextId.legacyValues
  .map((entry) => `| ${entry.contract} | ${entry.next ?? 'n/a'} | ${entry.last ?? 'n/a'} | ${entry.candidate} |`)
  .join('\n')}

Computed v3.2.1 next-id: **${report.nextId.computedNextId}**

Set-next-id allowed from this report: **${report.handoverState.setNextIdAllowed ? 'yes' : 'no'}**

Current live paused in this report: **${report.handoverState.currentLivePaused ? 'yes' : 'no'}**

## Read-Only State

| Contract | Admin | Paused | Next | Last | Minted Count |
|---|---|---|---:|---:|---:|
${Object.entries(report.reads)
  .map(([key, reads]) => `| ${contractId(report.contracts[key])} | ${renderRead(reads['get-admin'])} | ${renderRead(reads['is-paused'])} | ${renderRead(reads['get-next-token-id'])} | ${renderRead(reads['get-last-token-id'])} | ${renderRead(reads['get-minted-count'])} |`)
  .join('\n')}

## Xverse Handover Order

1. Deploy \`xtrata-v2-1-1\` from \`${report.source.v2_1_1}\` if it is not deployed.
2. Deploy \`xtrata-v3-2-1\` from \`${report.source.core}\` if it is not deployed.
3. Pause \`${contractId(report.contracts.v2_1_0)}\`.
4. Wait for the pause transaction to confirm.
5. Rerun \`npm run mainnet:v3.2.1:preflight\` and refresh the UI.
6. Only if this report says set-next-id allowed, call \`set-next-id u${report.nextId.computedNextId}\` on \`${contractId(report.contracts.core)}\`.
7. Call \`set-royalty-recipient '${report.royaltyRecipient}\`.
8. Unpause \`${contractId(report.contracts.core)}\`.
9. Mint the announcement with core \`mint-single-tx\`.
10. Rerun preflight/report and reconstruct the announcement.

## Warnings

${report.warnings.length ? report.warnings.map((entry) => `- ${entry}`).join('\n') : '- None'}

## Failures

${report.failures.length ? report.failures.map((entry) => `- ${entry}`).join('\n') : '- None'}
`;

const runPreflight = async () => {
  const report = await buildReport();
  writeReport(report);
};

const runUi = async () => {
  await runPreflight();
  const vite = spawn(
    'npx',
    ['vite', '--host', '127.0.0.1', '--open', '/web/mainnet-v3.2.1-handover.html'],
    {
      cwd: root.pathname,
      stdio: 'inherit'
    }
  );
  vite.on('exit', (code) => {
    process.exit(code ?? 0);
  });
};

const runReport = () => {
  if (!existsSync(REPORT_JSON)) {
    throw new Error('No mainnet handover report exists. Run npm run mainnet:v3.2.1:preflight first.');
  }
  const report = JSON.parse(readFileSync(REPORT_JSON, 'utf8'));
  writeFileSync(REPORT_MD, renderMarkdown(report));
  console.log(readFileSync(REPORT_MD, 'utf8'));
};

if (mode === 'preflight' || mode === 'handover') {
  await runPreflight();
} else if (mode === 'ui') {
  await runUi();
} else if (mode === 'report') {
  runReport();
} else {
  console.error(`Unknown mode "${mode}". Use preflight, handover, ui, or report.`);
  process.exit(1);
}
