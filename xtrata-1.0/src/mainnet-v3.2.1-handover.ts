import {
  boolCV,
  bufferCV,
  listCV,
  PostConditionMode,
  principalCV,
  stringAsciiCV,
  uintCV,
  type ClarityValue
} from '@stacks/transactions';
import { toStacksNetwork } from './lib/network/stacks';
import {
  connectWallet,
  disconnectWallet,
  showContractCall,
  showContractDeploy
} from './lib/wallet/connect';
import type { WalletSession } from './lib/wallet/types';

type HandoverReport = {
  expectedAdmin: string;
  apiUrl: string;
  royaltyRecipient: string;
  recommendation: string;
  contracts: Record<string, { address: string; name: string; role: string }>;
  source: {
    core: string;
    coreSha256: string;
    v2_1_1: string;
    v2_1_1Sha256: string;
    announcement: string;
    announcementSha256: string;
  };
  announcement: {
    mime: string;
    tokenUri: string;
    bytes: number;
    chunks: number;
    finalHashHex: string;
    chunkHex: string[];
  };
  nextId: {
    computedNextId: number;
  };
  handoverState: {
    currentLiveContract: string;
    currentLivePaused: boolean;
    setNextIdAllowed: boolean;
  };
  failures: string[];
  warnings: string[];
};

type TxLog = {
  label: string;
  txId: string;
  submittedAt: string;
};

const app = document.querySelector<HTMLDivElement>('#app');
const logsKey = 'xtrata-mainnet-v3.2.1-handover-txs';
let report: HandoverReport | null = null;
let session: WalletSession = { isConnected: false };
let txLogs: TxLog[] = JSON.parse(localStorage.getItem(logsKey) ?? '[]') as TxLog[];

const appDetails = {
  name: 'Xtrata Mainnet Handover',
  icon: `${window.location.origin}/favicon.svg`
};

const network = toStacksNetwork('mainnet');

const bytesFromHex = (hex: string) => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
};

const normalizeTxId = (payload: { txId?: string; txid?: string }) =>
  payload.txId ?? payload.txid ?? '';

const saveTx = (label: string, txId: string) => {
  txLogs = [
    ...txLogs,
    {
      label,
      txId,
      submittedAt: new Date().toISOString()
    }
  ];
  localStorage.setItem(logsKey, JSON.stringify(txLogs, null, 2));
  render();
};

const callWallet = (label: string, options: {
  contractAddress: string;
  contractName: string;
  functionName: string;
  functionArgs: ClarityValue[];
  postConditionMode?: PostConditionMode;
}) =>
  new Promise<void>((resolve, reject) => {
    if (!session.isConnected || !report) {
      reject(new Error('Connect the Xverse signer first.'));
      return;
    }
    showContractCall({
      ...options,
      appDetails,
      network,
      stxAddress: report.expectedAdmin,
      onFinish: (payload) => {
        const txId = normalizeTxId(payload);
        if (!txId) {
          reject(new Error('Wallet response did not include a transaction id.'));
          return;
        }
        saveTx(label, txId);
        resolve();
      },
      onCancel: () => reject(new Error(`${label} was cancelled.`))
    });
  });

const deployCore = async () => {
  if (!report) return;
  const source = await fetch(`/${report.source.core}`).then((entry) => entry.text());
  await new Promise<void>((resolve, reject) => {
    showContractDeploy({
      contractName: 'xtrata-v3-2-1',
      codeBody: source,
      clarityVersion: 3,
      appDetails,
      network,
      stxAddress: report.expectedAdmin,
      onFinish: (payload) => {
        const txId = normalizeTxId(payload);
        if (!txId) {
          reject(new Error('Wallet response did not include a transaction id.'));
          return;
        }
        saveTx('deploy xtrata-v3-2-1', txId);
        resolve();
      },
      onCancel: () => reject(new Error('Deploy was cancelled.'))
    });
  });
};

const deployV211Dependency = async () => {
  if (!report) return;
  const source = await fetch(`/${report.source.v2_1_1}`).then((entry) => entry.text());
  await new Promise<void>((resolve, reject) => {
    showContractDeploy({
      contractName: 'xtrata-v2-1-1',
      codeBody: source,
      clarityVersion: 2,
      appDetails,
      network,
      stxAddress: report.expectedAdmin,
      onFinish: (payload) => {
        const txId = normalizeTxId(payload);
        if (!txId) {
          reject(new Error('Wallet response did not include a transaction id.'));
          return;
        }
        saveTx('deploy xtrata-v2-1-1 migration dependency', txId);
        resolve();
      },
      onCancel: () => reject(new Error('v2.1.1 dependency deploy was cancelled.'))
    });
  });
};

const pauseLiveCore = () => {
  if (!report) return Promise.resolve();
  const live = report.contracts.v2_1_0;
  return callWallet('pause current live xtrata-v2-1-0', {
    contractAddress: live.address,
    contractName: live.name,
    functionName: 'set-paused',
    functionArgs: [boolCV(true)]
  });
};

const setNextId = () => {
  if (!report) return Promise.resolve();
  if (!report.handoverState.setNextIdAllowed) {
    throw new Error(
      'set-next-id is blocked by this report. Pause the current live core, wait for confirmation, run npm run mainnet:v3.2.1:preflight, then refresh this page.'
    );
  }
  const core = report.contracts.core;
  return callWallet(`set v3.2.1 next-id ${report.nextId.computedNextId}`, {
    contractAddress: core.address,
    contractName: core.name,
    functionName: 'set-next-id',
    functionArgs: [uintCV(report.nextId.computedNextId)]
  });
};

const setRoyaltyRecipient = () => {
  if (!report) return Promise.resolve();
  const core = report.contracts.core;
  return callWallet(`set royalty recipient ${report.royaltyRecipient}`, {
    contractAddress: core.address,
    contractName: core.name,
    functionName: 'set-royalty-recipient',
    functionArgs: [principalCV(report.royaltyRecipient)]
  });
};

const unpauseCore = () => {
  if (!report) return Promise.resolve();
  const core = report.contracts.core;
  return callWallet('unpause xtrata-v3-2-1', {
    contractAddress: core.address,
    contractName: core.name,
    functionName: 'set-paused',
    functionArgs: [boolCV(false)]
  });
};

const mintAnnouncement = () => {
  if (!report) return Promise.resolve();
  const core = report.contracts.core;
  return callWallet('mint v3.2.1 announcement inscription', {
    contractAddress: core.address,
    contractName: core.name,
    functionName: 'mint-single-tx',
    functionArgs: [
      bufferCV(bytesFromHex(report.announcement.finalHashHex)),
      stringAsciiCV(report.announcement.mime),
      uintCV(report.announcement.bytes),
      listCV(report.announcement.chunkHex.map((chunk) => bufferCV(bytesFromHex(chunk)))),
      stringAsciiCV(report.announcement.tokenUri)
    ],
    postConditionMode: PostConditionMode.Allow
  });
};

const connect = async () => {
  session = await connectWallet(appDetails);
  if (!session.isConnected) {
    throw new Error('Wallet connection was cancelled.');
  }
  if (report && session.address !== report.expectedAdmin) {
    await disconnectWallet();
    session = { isConnected: false };
    throw new Error(`Connected ${session.address}; expected ${report.expectedAdmin}.`);
  }
  render();
};

const renderList = (items: string[], className: string) =>
  items.length
    ? `<ul class="${className}">${items.map((entry) => `<li>${entry}</li>`).join('')}</ul>`
    : '<p>None</p>';

const render = () => {
  if (!app || !report) return;
  const blocked = report.failures.length > 0 || session.address !== report.expectedAdmin;
  const setNextIdBlocked = blocked || !report.handoverState.setNextIdAllowed;
  app.innerHTML = `
    <div class="toolbar">
      <div>
        <strong>${session.isConnected ? session.address : 'No wallet connected'}</strong>
        <div class="step-note">Expected: ${report.expectedAdmin}</div>
      </div>
      <button id="connect">${session.isConnected ? 'Reconnect Wallet' : 'Connect Xverse'}</button>
    </div>

    <section class="grid">
      <div class="panel">
        <h2>Preflight</h2>
        <dl class="kv">
          <dt>Recommendation</dt><dd>${report.recommendation}</dd>
          <dt>Next ID</dt><dd>${report.nextId.computedNextId}</dd>
          <dt>Live paused</dt><dd>${report.handoverState.currentLivePaused ? 'yes' : 'no'}</dd>
          <dt>Set next ID</dt><dd>${report.handoverState.setNextIdAllowed ? 'allowed' : 'blocked until post-pause preflight'}</dd>
          <dt>Royalty</dt><dd>${report.royaltyRecipient}</dd>
          <dt>Core hash</dt><dd><code>${report.source.coreSha256}</code></dd>
          <dt>v2.1.1 hash</dt><dd><code>${report.source.v2_1_1Sha256}</code></dd>
        </dl>
      </div>
      <div class="panel">
        <h2>Announcement</h2>
        <dl class="kv">
          <dt>Bytes</dt><dd>${report.announcement.bytes}</dd>
          <dt>Chunks</dt><dd>${report.announcement.chunks}</dd>
          <dt>MIME</dt><dd>${report.announcement.mime}</dd>
          <dt>Final hash</dt><dd><code>${report.announcement.finalHashHex}</code></dd>
        </dl>
      </div>
    </section>

    <section class="panel">
      <h2>Checks</h2>
      <strong>Warnings</strong>
      ${renderList(report.warnings, 'warn')}
      <strong>Failures</strong>
      ${renderList(report.failures, 'fail')}
    </section>

    <section class="panel">
      <h2>Xverse Signature Steps</h2>
      ${[
        ['deploy-v211', 'Deploy xtrata-v2-1-1 dependency', 'Deploys with Clarity 2 because this legacy source uses as-contract. It deploys paused and is not the live app target.'],
        ['deploy', 'Deploy xtrata-v3-2-1', 'Use contracts/live/xtrata-v3.2.1.clar. Skip only if already deployed and source-hash verified.'],
        ['pause', 'Pause current live v2.1.0 core', 'Freezes new v2 native mints while preserving transfer/migration safety.'],
        ['next', `Set v3.2.1 next-id to ${report.nextId.computedNextId}`, 'One-shot continuity step. Requires a fresh report showing the current live core is paused.'],
        ['royalty', `Set royalty recipient to ${report.royaltyRecipient}`, 'Confirms protocol fee recipient before public use.'],
        ['unpause', 'Unpause v3.2.1 core', 'Enables the new core for minting.'],
        ['mint', 'Mint announcement inscription', 'Uses core mint-single-tx directly; no helper contract required.']
      ].map(([id, title, note]) => `
        <div class="step">
          <div>
            <div class="step-title">${title}</div>
            <div class="step-note">${note}</div>
          </div>
          <button id="${id}" ${id === 'next' ? (setNextIdBlocked ? 'disabled' : '') : (blocked ? 'disabled' : '')}>Sign</button>
        </div>`).join('')}
    </section>

    <section class="panel">
      <h2>Submitted Transactions</h2>
      <pre>${txLogs.length ? JSON.stringify(txLogs, null, 2) : 'No transactions submitted from this browser yet.'}</pre>
    </section>
  `;

  document.querySelector<HTMLButtonElement>('#connect')?.addEventListener('click', () => void connect().catch(showError));
  document.querySelector<HTMLButtonElement>('#deploy-v211')?.addEventListener('click', () => void deployV211Dependency().catch(showError));
  document.querySelector<HTMLButtonElement>('#deploy')?.addEventListener('click', () => void deployCore().catch(showError));
  document.querySelector<HTMLButtonElement>('#pause')?.addEventListener('click', () => void pauseLiveCore().catch(showError));
  document.querySelector<HTMLButtonElement>('#next')?.addEventListener('click', () => void setNextId().catch(showError));
  document.querySelector<HTMLButtonElement>('#royalty')?.addEventListener('click', () => void setRoyaltyRecipient().catch(showError));
  document.querySelector<HTMLButtonElement>('#unpause')?.addEventListener('click', () => void unpauseCore().catch(showError));
  document.querySelector<HTMLButtonElement>('#mint')?.addEventListener('click', () => void mintAnnouncement().catch(showError));
};

const showError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  window.alert(message);
};

const load = async () => {
  report = await fetch('/reports/mainnet-v3.2.1-handover.json').then((entry) => {
    if (!entry.ok) {
      throw new Error('Run npm run mainnet:v3.2.1:preflight before opening the handover UI.');
    }
    return entry.json() as Promise<HandoverReport>;
  });
  render();
};

void load().catch(showError);
