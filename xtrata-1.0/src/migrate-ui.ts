import { uintCV, callReadOnlyFunction, cvToJSON, PostConditionMode } from '@stacks/transactions';
import { toStacksNetwork } from './lib/network/stacks';
import { getApiBaseUrls } from './lib/network/config';
import {
  connectWallet,
  disconnectWallet,
  showContractCall
} from './lib/wallet/connect';
import type { WalletSession } from './lib/wallet/types';

const DEPLOYER = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CORE = 'xtrata-v3-2-3';
const ASSET = 'xtrata-inscription';
// Route every Hiro call through the dev/prod /hiro proxy, which injects the
// HIRO_API_KEY server-side (avoids browser rate limits).
const apiBase = getApiBaseUrls('mainnet')[0];
const network = toStacksNetwork('mainnet', apiBase);
// Explicit fee so migrations confirm promptly instead of stalling on a low
// wallet-estimated fee.
const FEE_USTX = 30000n;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Poll the proxy until the tx leaves the mempool; returns its final status.
const waitForTx = async (txid: string): Promise<'success' | 'failed'> => {
  const id = `0x${txid.replace(/^0x/, '')}`;
  for (;;) {
    await sleep(8000);
    try {
      const res = await fetch(`${apiBase}/extended/v1/tx/${id}`);
      if (!res.ok) continue;
      const json = (await res.json()) as { tx_status?: string };
      const st = json.tx_status;
      if (!st || st === 'pending') continue;
      return st === 'success' ? 'success' : 'failed';
    } catch {
      // network blip — keep polling
    }
  }
};

const appDetails = {
  name: 'Xtrata Migration',
  icon: `${window.location.origin}/favicon.svg`
};

const SOURCES: Record<string, { name: string; fn: string; label: string }> = {
  v1: { name: 'xtrata-v1-1-1', fn: 'migrate-from-v1', label: 'v1 (xtrata-v1-1-1)' },
  v2: { name: 'xtrata-v2-1-0', fn: 'migrate-from-v2-1-0', label: 'v2 (xtrata-v2-1-0)' }
};

type State = {
  session: WalletSession;
  source: 'v1' | 'v2';
  eligible: bigint[];
  v3Minted: Set<string>;
  busyId: string | null;
  busyPhase: 'signing' | 'confirming' | null;
  scanning: boolean;
  log: string[];
};

const state: State = {
  session: { isConnected: false },
  source: 'v1',
  eligible: [],
  v3Minted: new Set(),
  busyId: null,
  busyPhase: null,
  scanning: false,
  log: []
};

const app = document.getElementById('app') as HTMLDivElement;

const note = (message: string) => {
  state.log.unshift(`${new Date().toLocaleTimeString()}  ${message}`);
  state.log = state.log.slice(0, 40);
  render();
};

const readOnly = async (contractName: string, functionName: string, args: ReturnType<typeof uintCV>[] = []) => {
  const res = await callReadOnlyFunction({
    contractAddress: DEPLOYER,
    contractName,
    functionName,
    functionArgs: args,
    senderAddress: DEPLOYER,
    network
  });
  return cvToJSON(res);
};

const uintFromJson = (json: unknown): number | null => {
  let v: unknown = json;
  while (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    v = (v as Record<string, unknown>).value;
  }
  return v == null ? null : Number(v);
};

// The set of token ids already minted on v3 (any of these would collide).
const loadV3Minted = async () => {
  const count = uintFromJson(await readOnly(CORE, 'get-minted-count')) ?? 0;
  const set = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    const id = uintFromJson(await readOnly(CORE, 'get-minted-id', [uintCV(BigInt(i))]));
    if (id != null) set.add(String(id));
  }
  return set;
};

// Token ids the connected wallet holds on the source contract (via Hiro API).
const loadOwnedIds = async (address: string, sourceName: string): Promise<bigint[]> => {
  const assetId = `${DEPLOYER}.${sourceName}::${ASSET}`;
  const ids: bigint[] = [];
  let offset = 0;
  for (;;) {
    const url = `${apiBase}/extended/v1/tokens/nft/holdings?principal=${address}&asset_identifiers=${encodeURIComponent(assetId)}&limit=200&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Holdings lookup failed (${res.status}).`);
    }
    const json = (await res.json()) as { total: number; results: Array<{ value: { repr?: string; hex?: string } }> };
    for (const entry of json.results ?? []) {
      const repr = entry.value?.repr ?? '';
      const m = repr.match(/^u(\d+)$/);
      if (m) ids.push(BigInt(m[1]));
    }
    offset += 200;
    if (offset >= (json.total ?? 0) || (json.results ?? []).length === 0) break;
  }
  return ids.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
};

const scan = async () => {
  if (!state.session.isConnected || !state.session.address) return;
  state.scanning = true;
  state.eligible = [];
  render();
  try {
    const sourceName = SOURCES[state.source].name;
    note(`Loading v3 minted ids…`);
    state.v3Minted = await loadV3Minted();
    note(`Loading your ${SOURCES[state.source].label} holdings…`);
    const owned = await loadOwnedIds(state.session.address, sourceName);
    state.eligible = owned.filter((id) => !state.v3Minted.has(id.toString()));
    note(`You own ${owned.length} on ${state.source}; ${owned.length - state.eligible.length} already on v3; ${state.eligible.length} eligible.`);
  } catch (error) {
    note(`Scan error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    state.scanning = false;
    render();
  }
};

const migrate = (id: bigint) =>
  new Promise<void>((resolve, reject) => {
    if (!state.session.isConnected || !state.session.address) {
      reject(new Error('Connect Xverse first.'));
      return;
    }
    state.busyId = id.toString();
    state.busyPhase = 'signing';
    render();
    showContractCall({
      contractAddress: DEPLOYER,
      contractName: CORE,
      functionName: SOURCES[state.source].fn,
      functionArgs: [uintCV(id)],
      // Migration transfers the legacy NFT (and a small begin-fee in STX) into
      // the core. Allow mode is required so those transfers aren't rejected by
      // the wallet's default deny post-conditions (which aborts the migration).
      postConditionMode: PostConditionMode.Allow,
      fee: FEE_USTX,
      appDetails,
      network,
      stxAddress: state.session.address,
      onFinish: (payload: unknown) => {
        const txId =
          (payload && typeof payload === 'object' && 'txId' in (payload as Record<string, unknown>)
            ? String((payload as Record<string, unknown>).txId)
            : '') || '';
        note(`#${id} submitted → ${txId || '(no txid)'}. Waiting for on-chain confirmation…`);
        state.busyPhase = 'confirming';
        render();
        // Only resolve once the tx has actually confirmed on-chain. This is what
        // lets "Migrate all" hold the next signature until this one settles.
        void (async () => {
          if (!txId) {
            note(`#${id}: wallet returned no txid; stopping.`);
            state.busyId = null;
            render();
            reject(new Error('no txid'));
            return;
          }
          const result = await waitForTx(txId);
          state.busyId = null;
          if (result === 'success') {
            note(`#${id} confirmed ✓`);
            state.v3Minted.add(id.toString());
            state.eligible = state.eligible.filter((value) => value !== id);
            render();
            resolve();
          } else {
            note(`#${id} FAILED on-chain (${txId}). Stopping the run.`);
            render();
            reject(new Error('tx failed'));
          }
        })();
      },
      onCancel: () => {
        note(`Cancelled #${id}.`);
        state.busyId = null;
        render();
        reject(new Error('cancelled'));
      }
    });
  });

const migrateAll = async () => {
  const queue = [...state.eligible];
  for (const id of queue) {
    try {
      await migrate(id);
    } catch {
      // stop the run if the user cancels a signature
      break;
    }
  }
};

const connect = async () => {
  state.session = await connectWallet({ appName: appDetails.name, appIcon: appDetails.icon });
  if (!state.session.isConnected) {
    note('Wallet connection cancelled.');
    return;
  }
  note(`Connected ${state.session.address}.`);
  await scan();
};

const disconnect = async () => {
  await disconnectWallet();
  state.session = { isConnected: false };
  state.eligible = [];
  render();
};

const render = () => {
  const connected = state.session.isConnected;
  app.innerHTML = `
    <section class="panel">
      <div class="toolbar">
        <div>${connected ? `Connected <code>${state.session.address}</code>` : 'Not connected'}</div>
        <div>
          ${connected
            ? '<button id="disconnect" class="secondary">Disconnect</button>'
            : '<button id="connect">Connect Xverse</button>'}
        </div>
      </div>
      <div class="row">
        <label>Source core:
          <select id="source" ${connected ? '' : 'disabled'}>
            <option value="v1" ${state.source === 'v1' ? 'selected' : ''}>${SOURCES.v1.label}</option>
            <option value="v2" ${state.source === 'v2' ? 'selected' : ''}>${SOURCES.v2.label}</option>
          </select>
        </label>
        <button id="scan" ${connected && !state.scanning ? '' : 'disabled'}>${state.scanning ? 'Scanning…' : 'Scan eligible'}</button>
        <button id="all" ${connected && state.eligible.length > 0 && !state.busyId ? '' : 'disabled'}>Migrate all (sign each)</button>
      </div>
      <p class="hint">Each migration is a separate Xverse signature. It moves your legacy token into the v3 core and mints the same id on <code>${CORE}</code>. Ids already on v3 are skipped.</p>
    </section>

    <section class="panel">
      <h2>Eligible tokens (${state.eligible.length})</h2>
      <div class="grid">
        ${state.eligible.length === 0
          ? '<p class="hint">None found — connect, pick a source, and Scan.</p>'
          : state.eligible
              .map(
                (id) => `
                <div class="tile">
                  <span>#${id.toString()}</span>
                  <button data-migrate="${id.toString()}" ${state.busyId ? 'disabled' : ''}>
                    ${state.busyId === id.toString()
                      ? state.busyPhase === 'confirming'
                        ? 'Confirming…'
                        : 'Signing…'
                      : 'Migrate'}
                  </button>
                </div>`
              )
              .join('')}
      </div>
    </section>

    <section class="panel">
      <h2>Activity</h2>
      <pre>${state.log.length ? state.log.join('\n') : 'No activity yet.'}</pre>
    </section>
  `;

  document.getElementById('connect')?.addEventListener('click', () => void connect().catch((e) => note(String(e))));
  document.getElementById('disconnect')?.addEventListener('click', () => void disconnect());
  document.getElementById('scan')?.addEventListener('click', () => void scan());
  document.getElementById('all')?.addEventListener('click', () => void migrateAll());
  document.getElementById('source')?.addEventListener('change', (event) => {
    state.source = (event.target as HTMLSelectElement).value as 'v1' | 'v2';
    state.eligible = [];
    render();
  });
  app.querySelectorAll<HTMLButtonElement>('[data-migrate]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = BigInt(button.dataset.migrate!);
      void migrate(id).catch((e) => note(String(e)));
    });
  });
};

render();
