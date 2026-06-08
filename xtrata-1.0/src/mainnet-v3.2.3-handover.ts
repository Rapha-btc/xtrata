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

type TryResult = { ok: boolean; value?: unknown; error?: string };

type HandoverReport = {
  generatedAt: string;
  network: string;
  apiUrl: string;
  core: {
    address: string;
    name: string;
    contract: string;
    clarityVersion: number;
  };
  source: {
    path: string;
    sha256: string;
    bytes: number;
    clarityVersion: number;
  };
  royaltyRecipient: string;
  announcement: {
    bytes: number;
    chunks: number;
    mime: string;
    tokenUri: string;
    finalHashHex: string;
    chunkHex: string[];
  };
  currentLivePaused: boolean | null;
  recommendedNextId: number | null;
  coreState: {
    deploymentStatus: 'absent' | 'deployed' | 'unknown';
    paused: TryResult;
    royaltyRecipient: TryResult;
    nextTokenId: TryResult;
  };
  royaltyConfigured: boolean;
  offsetConfigured: boolean;
  setNextIdReady: boolean;
  launchReady: boolean;
  failures: string[];
  warnings: string[];
};

type TxLog = {
  label: string;
  txId: string;
  submittedAt: string;
};

const app = document.querySelector<HTMLDivElement>('#app');
const logsKey = 'xtrata-mainnet-v3.2.3-handover-txs';
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
      stxAddress: report.core.address,
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
  const source = await fetch(`/${report.source.path}`).then((entry) => entry.text());
  await new Promise<void>((resolve, reject) => {
    showContractDeploy({
      contractName: report!.core.name,
      codeBody: source,
      clarityVersion: 3,
      appDetails,
      network,
      stxAddress: report!.core.address,
      onFinish: (payload) => {
        const txId = normalizeTxId(payload);
        if (!txId) {
          reject(new Error('Wallet response did not include a transaction id.'));
          return;
        }
        saveTx(`deploy ${report!.core.name}`, txId);
        resolve();
      },
      onCancel: () => reject(new Error('Deploy was cancelled.'))
    });
  });
};

const pauseLiveCore = () => {
  if (!report) return Promise.resolve();
  return callWallet('pause current live xtrata-v2-1-0', {
    contractAddress: report.core.address,
    contractName: 'xtrata-v2-1-0',
    functionName: 'set-paused',
    functionArgs: [boolCV(true)]
  });
};

const setNextId = () => {
  if (!report) return Promise.resolve();
  if (!report.setNextIdReady) {
    throw new Error(
      'set-next-id is blocked by this report. Pause the current live core, wait for confirmation, run npm run mainnet:v3.2.3:preflight, then refresh this page.'
    );
  }
  return callWallet(`set v3.2.3 next-id ${report.recommendedNextId}`, {
    contractAddress: report.core.address,
    contractName: report.core.name,
    functionName: 'set-next-id',
    functionArgs: [uintCV(report.recommendedNextId ?? 0)]
  });
};

const setRoyaltyRecipient = () => {
  if (!report) return Promise.resolve();
  return callWallet(`set royalty recipient ${report.royaltyRecipient}`, {
    contractAddress: report.core.address,
    contractName: report.core.name,
    functionName: 'set-royalty-recipient',
    functionArgs: [principalCV(report.royaltyRecipient)]
  });
};

const unpauseCore = () => {
  if (!report) return Promise.resolve();
  return callWallet('unpause xtrata-v3-2-3', {
    contractAddress: report.core.address,
    contractName: report.core.name,
    functionName: 'set-paused',
    functionArgs: [boolCV(false)]
  });
};

const mintAnnouncement = () => {
  if (!report) return Promise.resolve();
  return callWallet('mint v3.2.3 announcement inscription', {
    contractAddress: report.core.address,
    contractName: report.core.name,
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
  if (report && session.address !== report.core.address) {
    await disconnectWallet();
    session = { isConnected: false };
    throw new Error(`Connected ${session.address}; expected ${report.core.address}.`);
  }
  render();
};

const renderList = (items: string[], className: string) =>
  items.length
    ? `<ul class="${className}">${items.map((entry) => `<li>${entry}</li>`).join('')}</ul>`
    : '<p>None</p>';

const render = () => {
  if (!app || !report) return;
  const blocked = report.failures.length > 0 || session.address !== report.core.address;
  const setNextIdBlocked = blocked || !report.setNextIdReady;
  app.innerHTML = `
    <div class="toolbar">
      <div>
        <strong>${session.isConnected ? session.address : 'No wallet connected'}</strong>
        <div class="step-note">Expected: ${report.core.address}</div>
      </div>
      <button id="connect">${session.isConnected ? 'Reconnect Wallet' : 'Connect Xverse'}</button>
    </div>

    <section class="grid">
      <div class="panel">
        <h2>Preflight</h2>
        <dl class="kv">
          <dt>Next ID</dt><dd>${report.recommendedNextId ?? 'unavailable'}</dd>
          <dt>Live paused</dt><dd>${report.currentLivePaused ? 'yes' : 'no'}</dd>
          <dt>Set next ID</dt><dd>${report.setNextIdReady ? 'allowed' : 'blocked until post-pause preflight'}</dd>
          <dt>Royalty</dt><dd>${report.royaltyRecipient}</dd>
          <dt>Core hash</dt><dd><code>${report.source.sha256}</code></dd>
          <dt>Clarity</dt><dd>${report.source.clarityVersion}</dd>
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
        ['deploy', 'Deploy xtrata-v3-2-3', 'Deploys as Clarity 3. Skip only if already deployed and source-hash verified.'],
        ['pause', 'Pause current live v2.1.0 core', 'Freezes new v2 native mints while preserving transfer and migration safety.'],
        ['next', `Set v3.2.3 next-id to ${report.recommendedNextId ?? '?'}`, 'One-shot continuity step. Requires a fresh report showing the current live core is paused.'],
        ['royalty', `Set royalty recipient to ${report.royaltyRecipient}`, 'Confirms protocol fee recipient before public use.'],
        ['unpause', 'Unpause v3.2.3 core', 'Enables the new core for minting.'],
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
  report = await fetch('/reports/mainnet-v3.2.3-handover.json').then((entry) => {
    if (!entry.ok) {
      throw new Error('Run npm run mainnet:v3.2.3:preflight before opening the handover UI.');
    }
    return entry.json() as Promise<HandoverReport>;
  });
  render();
};

void load().catch(showError);
