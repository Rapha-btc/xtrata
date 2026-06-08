#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import {
  cvToHex,
  cvToJSON,
  hexToCV
} from '@stacks/transactions';

const mode = process.argv[2] ?? 'preflight';
const arg2 = process.argv[3];
const root = new URL('../', import.meta.url);
const path = (relative) => new URL(relative, root);

const API_URL = (process.env.XTRATA_MAINNET_API_URL ?? 'https://api.hiro.so').replace(/\/$/, '');
const API_KEY = process.env.XTRATA_MAINNET_HIRO_API_KEY ?? '';
const DEPLOYER = process.env.XTRATA_DEPLOYER ?? 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const ROYALTY_RECIPIENT = process.env.XTRATA_ROYALTY_RECIPIENT ?? DEPLOYER;
const CORE_NAME = process.env.XTRATA_CORE_NAME ?? 'xtrata-v3-2-3';
const REQUIRED_CLARITY_VERSION = 3;
const CORE_SOURCE_PATH = 'contracts/live/xtrata-v3.2.3.clar';
const ANNOUNCEMENT_PATH = 'docs/mainnet-v3.2.3-announcement-inscription.md';
const REPORT_JSON = path('reports/mainnet-v3.2.3-handover.json');
const REPORT_MD = path('reports/mainnet-v3.2.3-handover.md');
const MAX_API_ATTEMPTS = 3;
const CHUNK_SIZE = 16384;

const LEGACY = [
  {
    address: DEPLOYER,
    name: 'xtrata-v1-1-1',
    role: 'legacy',
    pauseBeforeHandover: false
  },
  {
    address: DEPLOYER,
    name: 'xtrata-v2-1-0',
    role: 'current-live',
    pauseBeforeHandover: true
  }
];

const contractId = (contract) => `${contract.address}.${contract.name}`;
const core = { address: DEPLOYER, name: CORE_NAME };
const headers = () => {
  const result = { 'content-type': 'application/json' };
  if (API_KEY) result['x-api-key'] = API_KEY;
  return result;
};
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const sha256Hex = (value) => createHash('sha256').update(value).digest('hex');

const cvValue = (json) => {
  if (!json) return undefined;
  const type = String(json.type);
  if (type === 'responseOk' || type === 'optional' || type.startsWith('(response ')) {
    return cvValue(json.value);
  }
  if (type === 'uint') return Number(json.value);
  if (type === 'principal' || type === 'bool') return json.value;
  if (type === '(optional none)') return null;
  if (type.startsWith('(optional')) return json.value ? cvValue(json.value) : null;
  return json.value ?? json;
};

const fetchWithRetry = async (url, init, label) => {
  let lastError;
  for (let attempt = 1; attempt <= MAX_API_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, init);
      const text = await response.text();
      if (response.status !== 429 && response.status < 500) {
        return { response, text };
      }
      const retryAfter = Number(response.headers.get('retry-after') ?? '1');
      lastError = new Error(`${label} HTTP ${response.status}: ${text.slice(0, 180)}`);
      if (attempt < MAX_API_ATTEMPTS) {
        await sleep(Math.min(Math.max(retryAfter, 1), 45) * 1000);
      }
    } catch (error) {
      lastError = error;
      if (attempt < MAX_API_ATTEMPTS) await sleep(attempt * 1000);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
};

const readOnly = async (contract, functionName, args = []) => {
  const url = `${API_URL}/v2/contracts/call-read/${contract.address}/${contract.name}/${functionName}`;
  const { response, text } = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        sender: DEPLOYER,
        arguments: args.map((entry) => cvToHex(entry))
      })
    },
    `${contract.name}.${functionName}`
  );
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${contract.name}.${functionName} returned non-JSON: ${text.slice(0, 180)}`);
  }
  if (!response.ok || !payload.okay) {
    throw new Error(`${contract.name}.${functionName} failed: ${JSON.stringify(payload)}`);
  }
  return cvValue(cvToJSON(hexToCV(payload.result)));
};

const tryRead = async (contract, functionName, args = []) => {
  try {
    return { ok: true, value: await readOnly(contract, functionName, args) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

const noSuchContract = (entry) =>
  !entry.ok && /NoSuchContract|No contract source data found|not found/i.test(entry.error ?? '');

const numericValue = (entry) =>
  entry?.ok && typeof entry.value === 'number' ? entry.value : null;

const booleanValue = (entry) =>
  entry?.ok && typeof entry.value === 'boolean' ? entry.value : null;

const principalValue = (entry) =>
  entry?.ok && typeof entry.value === 'string' ? entry.value : null;

const readLegacyState = async (legacy) => {
  const lastTokenId = await tryRead(legacy, 'get-last-token-id');
  const nextTokenId = await tryRead(legacy, 'get-next-token-id');
  const paused = await tryRead(legacy, 'is-paused');
  const admin = await tryRead(legacy, 'get-admin');
  const last = numericValue(lastTokenId);
  const next = numericValue(nextTokenId);
  const candidates = [];
  if (last !== null) candidates.push(last + 1);
  if (next !== null) candidates.push(next);
  return {
    ...legacy,
    contract: contractId(legacy),
    lastTokenId,
    nextTokenId,
    paused,
    admin,
    continuityCandidate: candidates.length > 0 ? Math.max(...candidates) : null,
    reachable: last !== null && next !== null
  };
};

const readCoreState = async () => {
  const contractInfo = await tryRead(core, 'get-contract-info');
  const deploymentStatus = contractInfo.ok
    ? 'deployed'
    : noSuchContract(contractInfo)
      ? 'absent'
      : 'unknown';

  if (deploymentStatus !== 'deployed') {
    return {
      contract: contractId(core),
      deploymentStatus,
      contractInfo,
      admin: { ok: false, error: 'not read before deployment is confirmed' },
      nextTokenId: { ok: false, error: 'not read before deployment is confirmed' },
      mintedCount: { ok: false, error: 'not read before deployment is confirmed' },
      paused: { ok: false, error: 'not read before deployment is confirmed' },
      royaltyRecipient: { ok: false, error: 'not read before deployment is confirmed' }
    };
  }

  const admin = await tryRead(core, 'get-admin');
  const nextTokenId = await tryRead(core, 'get-next-token-id');
  const mintedCount = await tryRead(core, 'get-minted-count');
  const paused = await tryRead(core, 'is-paused');
  const royaltyRecipient = await tryRead(core, 'get-royalty-recipient');

  return {
    contract: contractId(core),
    deploymentStatus,
    contractInfo,
    admin,
    nextTokenId,
    mintedCount,
    paused,
    royaltyRecipient
  };
};

const inspectSource = (source) => {
  const failures = [];
  if (!source.includes("(impl-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)")) {
    failures.push('Core source does not have the mainnet SIP-009 implementation enabled.');
  }
  const asContractInConstant = source.split('\n').some((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith(';')) return false;
    if (!trimmed.startsWith('(define-constant')) return false;
    const codeOnly = trimmed.replace(/;;.*$/, '');
    return /\(as-contract\s+tx-sender\)/.test(codeOnly);
  });
  if (asContractInConstant) {
    failures.push('Core source uses (as-contract tx-sender) inside a define-constant; this fails analysis at deploy time. Inline it in function bodies instead.');
  }
  if (!source.includes('"xtrata-v3.2.3"')) {
    failures.push('Core source version string does not match xtrata-v3.2.3.');
  }
  if (!source.includes('(define-public (migrate-from-v2-1-0')) {
    failures.push('Core source is missing the v2.1.0 migration function.');
  }
  if (source.includes('(define-public (migrate-from-v2-1-1')) {
    failures.push('Core source still contains migrate-from-v2-1-1, which must be removed in v3.2.3.');
  }
  if (!source.includes('(define-private (single-tx-fee-for-chunks')) {
    failures.push('Core source is missing the single-tx fee computation.');
  }
  return failures;
};

const computeAnnouncement = (sourceText) => {
  const bytes = Buffer.from(sourceText, 'utf8');
  const chunks = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    chunks.push(bytes.slice(i, i + CHUNK_SIZE));
  }
  let running = Buffer.alloc(32, 0);
  for (const chunk of chunks) {
    running = createHash('sha256').update(Buffer.concat([running, chunk])).digest();
  }
  return {
    bytes: bytes.length,
    chunks: chunks.length,
    mime: 'text/markdown',
    tokenUri: `${DEPLOYER}.xtrata-v3-2-3`,
    finalHashHex: `0x${running.toString('hex')}`,
    chunkHex: chunks.map((chunk) => `0x${chunk.toString('hex')}`)
  };
};

async function preflight() {
  const warnings = [];
  const failures = [];
  const sourceText = readFileSync(path(CORE_SOURCE_PATH), 'utf8');
  failures.push(...inspectSource(sourceText));

  const announcementText = readFileSync(path(ANNOUNCEMENT_PATH), 'utf8');
  const announcement = computeAnnouncement(announcementText);

  const legacyState = [];
  for (const legacy of LEGACY) legacyState.push(await readLegacyState(legacy));

  const legacyReadsReady = legacyState.every((entry) => entry.reachable);
  if (!legacyReadsReady) {
    failures.push('Legacy next/last token IDs are not fully readable. Do not set the one-shot next ID.');
  }

  const continuityCandidates = legacyState
    .map((entry) => entry.continuityCandidate)
    .filter((entry) => typeof entry === 'number');
  const recommendedNextId = continuityCandidates.length > 0
    ? Math.max(...continuityCandidates)
    : null;

  const currentLive = legacyState.find((entry) => entry.role === 'current-live');
  const currentLivePaused = booleanValue(currentLive?.paused);
  const currentLiveAdmin = principalValue(currentLive?.admin);
  if (currentLiveAdmin && currentLiveAdmin !== DEPLOYER) {
    failures.push(`Current live admin is ${currentLiveAdmin}, expected ${DEPLOYER}.`);
  }

  const coreState = await readCoreState();
  if (coreState.deploymentStatus === 'unknown') {
    failures.push(`Could not establish whether ${contractId(core)} exists: ${coreState.contractInfo.error}`);
  }
  if (coreState.deploymentStatus === 'deployed') {
    const coreAdmin = principalValue(coreState.admin);
    if (coreAdmin !== DEPLOYER) failures.push(`New core admin is ${coreAdmin ?? 'unreadable'}, expected ${DEPLOYER}.`);
  }

  const corePristine =
    coreState.deploymentStatus === 'deployed' &&
    numericValue(coreState.nextTokenId) === 0 &&
    numericValue(coreState.mintedCount) === 0 &&
    booleanValue(coreState.paused) === true;
  const royaltyConfigured =
    principalValue(coreState.royaltyRecipient) === ROYALTY_RECIPIENT;
  const offsetConfigured =
    recommendedNextId !== null &&
    numericValue(coreState.nextTokenId) === recommendedNextId;

  if (currentLivePaused === false) {
    warnings.push('Current live v2.1.0 is not paused. Pause it after the new core deploy confirms, then rerun preflight.');
  }
  if (coreState.deploymentStatus === 'deployed' && !corePristine && !offsetConfigured) {
    warnings.push('New core is not in its initial paused u0 state. Review on-chain state before continuing.');
  }

  const deployReady =
    failures.filter((entry) => !entry.startsWith('Legacy next/last')).length === 0 &&
    coreState.deploymentStatus === 'absent';
  const setNextIdReady =
    failures.length === 0 &&
    corePristine &&
    currentLivePaused === true &&
    recommendedNextId !== null;
  const launchReady =
    failures.length === 0 &&
    coreState.deploymentStatus === 'deployed' &&
    offsetConfigured &&
    royaltyConfigured &&
    booleanValue(coreState.paused) === true;

  const report = {
    generatedAt: new Date().toISOString(),
    network: 'mainnet',
    apiUrl: API_URL,
    apiKey: API_KEY ? 'configured' : 'not configured',
    core: {
      ...core,
      contract: contractId(core),
      clarityVersion: REQUIRED_CLARITY_VERSION
    },
    source: {
      path: CORE_SOURCE_PATH,
      sha256: sha256Hex(sourceText),
      bytes: Buffer.byteLength(sourceText),
      clarityVersion: REQUIRED_CLARITY_VERSION
    },
    royaltyRecipient: ROYALTY_RECIPIENT,
    announcement,
    legacyState,
    currentLiveContract: currentLive?.contract ?? contractId(LEGACY[1]),
    currentLivePaused,
    recommendedNextId,
    legacyReadsReady,
    coreState,
    royaltyConfigured,
    offsetConfigured,
    deployReady,
    setNextIdReady,
    launchReady,
    failures,
    warnings
  };

  mkdirSync(path('reports'), { recursive: true });
  writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(REPORT_MD, renderMarkdown(report));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nRecommendation: ${recommendation(report)}`);
  return report;
}

const recommendation = (report) => {
  if (report.failures.length > 0 && report.coreState.deploymentStatus !== 'absent') return 'blocked';
  if (report.deployReady) return 'connect Xverse and deploy the Clarity 3 core';
  if (report.coreState.deploymentStatus !== 'deployed') return 'blocked until deployment status is known';
  if (report.currentLivePaused !== true) return 'pause xtrata-v2-1-0, wait for confirmation, then rerun preflight';
  if (!report.offsetConfigured) return `set the one-shot next ID to ${report.recommendedNextId}`;
  if (!report.royaltyConfigured) return 'set the royalty recipient';
  if (report.launchReady) return 'unpause xtrata-v3-2-3';
  return 'review the report before continuing';
};

function renderMarkdown(report) {
  const value = (entry) => entry?.ok ? String(entry.value) : 'unavailable';
  return `# Xtrata v3.2.3 Mainnet Handover

Generated: ${report.generatedAt}

- Core: \`${report.core.contract}\`
- Source: \`${report.source.path}\`
- Source SHA-256: \`${report.source.sha256}\`
- Required Clarity version: **${report.source.clarityVersion}**
- Deployment status: **${report.coreState.deploymentStatus}**
- Royalty recipient: \`${report.royaltyRecipient}\`
- Exact continuity next ID: **${report.recommendedNextId ?? 'unavailable'}**
- Recommendation: **${recommendation(report)}**

## Legacy State

| Contract | Role | Last | Next | Paused | Candidate |
|---|---|---:|---:|---|---:|
${report.legacyState.map((entry) => `| \`${entry.contract}\` | ${entry.role} | ${value(entry.lastTokenId)} | ${value(entry.nextTokenId)} | ${value(entry.paused)} | ${entry.continuityCandidate ?? 'n/a'} |`).join('\n')}

## Mainnet Sequence

1. Deploy only \`${report.core.name}\` from \`${report.source.path}\` through Xverse as Clarity 3.
2. Verify the mined transaction with \`npm run mainnet:v3.2.3:verify -- 0x<txid>\`.
3. Pause \`${report.currentLiveContract}\` and wait for confirmation.
4. Rerun \`npm run mainnet:v3.2.3:preflight\`. Use the exact post-pause next ID from that report.
5. Call \`set-next-id(u${report.recommendedNextId ?? '<post-pause-value>'})\` once.
6. Call \`set-royalty-recipient('${report.royaltyRecipient})\`.
7. Rerun preflight. Only when \`launchReady=true\`, call \`set-paused(false)\`.
8. Mint the announcement inscription via \`mint-single-tx\`.

The old 64-ID margin is removed. Pausing the live core and taking a fresh read closes the race deterministically.

## Announcement

- Bytes: ${report.announcement?.bytes ?? 'n/a'}
- Chunks: ${report.announcement?.chunks ?? 'n/a'}
- MIME: ${report.announcement?.mime ?? 'n/a'}
- Final hash: \`${report.announcement?.finalHashHex ?? 'n/a'}\`

## Failures

${report.failures.length ? report.failures.map((entry) => `- ${entry}`).join('\n') : '- None'}

## Warnings

${report.warnings.length ? report.warnings.map((entry) => `- ${entry}`).join('\n') : '- None'}
`;
}

async function verify(txid) {
  if (!txid || !/^0x[0-9a-f]{64}$/i.test(txid)) {
    throw new Error('Usage: npm run mainnet:v3.2.3:verify -- 0x<64-character-txid>');
  }
  const { response, text } = await fetchWithRetry(
    `${API_URL}/extended/v1/tx/${txid}`,
    { headers: headers() },
    `verify ${txid}`
  );
  if (!response.ok) throw new Error(`Transaction lookup failed: ${text.slice(0, 180)}`);
  const tx = JSON.parse(text);
  const sourceCode = tx.smart_contract?.source_code ?? '';
  const result = {
    txid,
    txStatus: tx.tx_status,
    txType: tx.tx_type,
    clarityVersion: tx.smart_contract?.clarity_version ?? null,
    contractId: tx.smart_contract?.contract_id ?? null,
    sourceSha256: sourceCode ? sha256Hex(sourceCode) : null,
    expectedContractId: contractId(core),
    expectedSourceSha256: sha256Hex(readFileSync(path(CORE_SOURCE_PATH), 'utf8'))
  };
  const problems = [];
  if (result.txStatus !== 'success') problems.push(`tx status is ${result.txStatus}, expected success`);
  if (result.txType !== 'smart_contract') problems.push(`tx type is ${result.txType}, expected smart_contract`);
  if (result.clarityVersion !== REQUIRED_CLARITY_VERSION) {
    problems.push(`Clarity version is ${result.clarityVersion}, expected ${REQUIRED_CLARITY_VERSION}`);
  }
  if (result.contractId !== result.expectedContractId) {
    problems.push(`contract ID is ${result.contractId}, expected ${result.expectedContractId}`);
  }
  if (result.sourceSha256 !== result.expectedSourceSha256) {
    problems.push(`source hash is ${result.sourceSha256}, expected ${result.expectedSourceSha256}`);
  }
  console.log(JSON.stringify({ ...result, problems }, null, 2));
  if (problems.length > 0) process.exitCode = 1;
}

async function openUi() {
  await preflight();
  const vite = spawn(
    'npx',
    ['vite', '--host', '127.0.0.1'],
    { cwd: root.pathname, stdio: 'inherit' }
  );
  vite.on('exit', (code) => process.exit(code ?? 0));
}

function printReport() {
  if (!existsSync(REPORT_JSON)) {
    throw new Error('No v3.2.3 handover report exists. Run the preflight first.');
  }
  const report = JSON.parse(readFileSync(REPORT_JSON, 'utf8'));
  writeFileSync(REPORT_MD, renderMarkdown(report));
  console.log(readFileSync(REPORT_MD, 'utf8'));
}

if (mode === 'preflight') await preflight();
else if (mode === 'verify') await verify(arg2);
else if (mode === 'ui') await openUi();
else if (mode === 'report') printReport();
else {
  console.error(`Unknown mode "${mode}". Use preflight, verify, ui, or report.`);
  process.exit(2);
}
