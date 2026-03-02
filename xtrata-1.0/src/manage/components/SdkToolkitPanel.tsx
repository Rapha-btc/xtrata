import { useEffect, useMemo, useState } from 'react';
import { resolveArtistDeployCoreTarget } from '../../lib/deploy/artist-deploy';
import {
  parseManageJsonResponse,
  toManageApiErrorMessage
} from '../lib/api-errors';
import { useManageWallet } from '../ManageWalletContext';
import InfoTooltip from './InfoTooltip';

type SdkToolkitPanelProps = {
  activeCollectionId?: string;
  activeCollectionLabel?: string;
};

type SdkTab = 'quickstart' | 'snippets' | 'advanced';

type CollectionRecord = {
  id: string;
  slug: string;
  display_name: string | null;
  state: string;
  contract_address: string | null;
  metadata?: Record<string, unknown> | null;
};

const SDK_DOCS_URL =
  'https://github.com/stxtrata/xtrata/tree/main/xtrata-1.0/docs/sdk';
const SDK_EXAMPLE_MARKETPLACE_URL =
  'https://github.com/stxtrata/xtrata/tree/main/xtrata-1.0/examples/xtrata-example-marketplace';
const ARTIST_GUIDE_URL =
  'https://github.com/stxtrata/xtrata/blob/main/xtrata-1.0/docs/artist-guides/collection-launch-guide.md';

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
};

const toText = (value: unknown) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

const resolveCollectionContractId = (collection: CollectionRecord | null) => {
  const metadata = toRecord(collection?.metadata);
  const contractAddress = toText(collection?.contract_address);
  const contractName = toText(metadata?.contractName);
  if (!contractAddress || !contractName) {
    return null;
  }
  return `${contractAddress}.${contractName}`;
};

export default function SdkToolkitPanel(props: SdkToolkitPanelProps) {
  const { walletSession } = useManageWallet();
  const [activeTab, setActiveTab] = useState<SdkTab>('quickstart');
  const [selectedCollection, setSelectedCollection] = useState<CollectionRecord | null>(
    null
  );
  const [loadingCollection, setLoadingCollection] = useState(false);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const normalizedCollectionId = props.activeCollectionId?.trim() ?? '';

  useEffect(() => {
    if (!normalizedCollectionId) {
      setSelectedCollection(null);
      setCollectionError(null);
      setLoadingCollection(false);
      return;
    }

    let cancelled = false;
    const loadCollection = async () => {
      setLoadingCollection(true);
      setCollectionError(null);
      try {
        const response = await fetch(
          `/collections/${encodeURIComponent(normalizedCollectionId)}`
        );
        const payload = await parseManageJsonResponse<CollectionRecord>(
          response,
          'SDK toolkit collection context'
        );
        if (!cancelled) {
          setSelectedCollection(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setSelectedCollection(null);
          setCollectionError(
            toManageApiErrorMessage(
              error,
              'Unable to load selected drop details for SDK snippets.'
            )
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingCollection(false);
        }
      }
    };
    void loadCollection();

    return () => {
      cancelled = true;
    };
  }, [normalizedCollectionId]);

  const fallbackCoreTarget = useMemo(
    () => resolveArtistDeployCoreTarget(walletSession.network ?? 'mainnet'),
    [walletSession.network]
  );

  const metadata = useMemo(
    () => toRecord(selectedCollection?.metadata),
    [selectedCollection]
  );
  const metadataCollection = useMemo(
    () => toRecord(metadata?.collection),
    [metadata]
  );

  const selectedCollectionName =
    toText(selectedCollection?.display_name) ||
    toText(metadataCollection?.name) ||
    props.activeCollectionLabel?.trim() ||
    'Your collection';

  const selectedCollectionSlug =
    toText(selectedCollection?.slug) || 'your-collection-slug';
  const selectedCollectionState = toText(selectedCollection?.state) || 'draft';
  const selectedCollectionContractId = resolveCollectionContractId(selectedCollection);
  const selectedCoreContractId =
    toText(metadata?.coreContractId) ||
    fallbackCoreTarget?.contractId ||
    'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0';
  const selectedSender =
    walletSession.address || fallbackCoreTarget?.address || 'SP...YOUR-ADDRESS';
  const selectedNetwork = walletSession.network ?? fallbackCoreTarget?.network ?? 'mainnet';

  const [collectionAddress, collectionContractName] = (
    selectedCollectionContractId ?? 'SP...COLLECTION-OWNER.xtrata-collection-your-drop'
  ).split('.');
  const [xtrataAddress, xtrataContractName] = selectedCoreContractId.split('.');

  const sdkStarterSnippet = useMemo(() => {
    const collectionContractLine = selectedCollectionContractId
      ? `  collectionContractId: '${selectedCollectionContractId}'`
      : "  // collectionContractId: 'SP...COLLECTION-OWNER.xtrata-collection-your-drop'";

    return `import { createSimpleSdk } from '@xtrata/sdk/simple';

const sdk = createSimpleSdk({
  senderAddress: '${selectedSender}',
  xtrataContractId: '${selectedCoreContractId}',
${collectionContractLine}
});

const [nextTokenId, collectionSnapshot] = await Promise.all([
  sdk.xtrata?.getNextTokenId(),
  sdk.collection?.getSnapshot()
]);

console.log({ nextTokenId, collectionSnapshot });`;
  }, [selectedCollectionContractId, selectedCoreContractId, selectedSender]);

  const sdkWorkflowSnippet = useMemo(
    () => `import { buildCollectionMintWorkflowPlan } from '@xtrata/sdk/workflows';

const plan = buildCollectionMintWorkflowPlan({
  contract: {
    address: '${collectionAddress || 'SP...COLLECTION-OWNER'}',
    contractName: '${collectionContractName || 'xtrata-collection-your-drop'}',
    network: '${selectedNetwork}'
  },
  xtrataContract: {
    address: '${xtrataAddress || 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'}',
    contractName: '${xtrataContractName || 'xtrata-v2-1-0'}',
    network: '${selectedNetwork}'
  },
  senderAddress: '${selectedSender}',
  payloadBytes: new Uint8Array([1, 2, 3]),
  expectedHash: new Uint8Array(32),
  mimeType: 'image/png',
  tokenUri: 'ipfs://example',
  mintPrice: 1_000_000n,
  protocolFeeMicroStx: 100_000n
});

console.log(plan.safety.summaryLines);
console.log(plan.flow.nextAction);`,
    [
      collectionAddress,
      collectionContractName,
      selectedNetwork,
      xtrataAddress,
      xtrataContractName,
      selectedSender
    ]
  );

  const handleCopy = async (label: string, value: string) => {
    try {
      if (
        typeof navigator === 'undefined' ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== 'function'
      ) {
        setCopyStatus('Clipboard is unavailable in this browser context.');
        return;
      }
      await navigator.clipboard.writeText(value);
      setCopyStatus(`${label} copied.`);
      window.setTimeout(() => {
        setCopyStatus((current) => (current === `${label} copied.` ? null : current));
      }, 1600);
    } catch {
      setCopyStatus('Could not copy text. You can still copy from the code block below.');
    }
  };

  return (
    <div className="sdk-toolkit">
      <div className="sdk-toolkit__intro">
        <p>
          Build your own marketplace, site, or game on top of Xtrata using the SDK.
          The same contract logic used in this portal is exposed as reusable tooling for
          third-party builders.
        </p>
        <p className="meta-value">
          Artist deploy/edit actions remain allowlist-gated in <code>/manage</code>.
          Read-only SDK integrations are open to any builder.
        </p>
      </div>

      <div className="mint-actions">
        <span className="info-label">
          <button
            className="button button--ghost button--mini"
            type="button"
            onClick={() => void handleCopy('Starter snippet', sdkStarterSnippet)}
          >
            Copy starter code
          </button>
          <InfoTooltip text="Copies a prefilled SDK bootstrap snippet using current wallet/drop context." />
        </span>
        <span className="info-label">
          <a
            className="button button--ghost button--mini"
            href={SDK_DOCS_URL}
            target="_blank"
            rel="noreferrer"
          >
            Open SDK docs
          </a>
          <InfoTooltip text="Opens official SDK docs and workflow references." />
        </span>
        <span className="info-label">
          <a
            className="button button--ghost button--mini"
            href={SDK_EXAMPLE_MARKETPLACE_URL}
            target="_blank"
            rel="noreferrer"
          >
            Open example repo
          </a>
          <InfoTooltip text="Example project showing marketplace integration patterns with the SDK." />
        </span>
      </div>

      {copyStatus && <p className="meta-value">{copyStatus}</p>}
      {collectionError && <div className="alert">{collectionError}</div>}

      <div className="sdk-toolkit__tabs" role="tablist" aria-label="SDK toolkit tabs">
        <span className="info-label">
          <button
            className={`button button--ghost button--mini${activeTab === 'quickstart' ? ' is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeTab === 'quickstart'}
            onClick={() => setActiveTab('quickstart')}
          >
            Quick start
          </button>
          <InfoTooltip text="High-level path for first-time SDK integration." />
        </span>
        <span className="info-label">
          <button
            className={`button button--ghost button--mini${activeTab === 'snippets' ? ' is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeTab === 'snippets'}
            onClick={() => setActiveTab('snippets')}
          >
            Code snippets
          </button>
          <InfoTooltip text="Ready-to-copy snippets prefilled from your selected collection and wallet network." />
        </span>
        <span className="info-label">
          <button
            className={`button button--ghost button--mini${activeTab === 'advanced' ? ' is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeTab === 'advanced'}
            onClick={() => setActiveTab('advanced')}
          >
            Advanced
          </button>
          <InfoTooltip text="Release gates and deeper module guidance for production SDK work." />
        </span>
      </div>

      {activeTab === 'quickstart' && (
        <div className="sdk-toolkit__grid" role="tabpanel">
          <article className="sdk-toolkit__card">
            <h3>1. Confirm access</h3>
            <p>
              Connect your wallet and verify it is allowlisted if you need deploy or
              artist-management actions in this portal.
            </p>
          </article>
          <article className="sdk-toolkit__card">
            <h3>2. Start simple</h3>
            <p>
              Use <code>@xtrata/sdk/simple</code> first. It binds sender + contract once,
              then gives clear read helpers.
            </p>
          </article>
          <article className="sdk-toolkit__card">
            <h3>3. Add workflow plans</h3>
            <p>
              Use <code>@xtrata/sdk/workflows</code> for mint/list/buy/cancel payloads
              with deny-mode post-condition defaults.
            </p>
          </article>
          <article className="sdk-toolkit__card">
            <h3>4. Ship with guardrails</h3>
            <p>
              Run the SDK quickstarts and troubleshooting docs before launch so errors
              are handled deterministically.
            </p>
            <a href={ARTIST_GUIDE_URL} target="_blank" rel="noreferrer">
              Open artist + allowlist guide
            </a>
          </article>
        </div>
      )}

      {activeTab === 'snippets' && (
        <div className="sdk-toolkit__content" role="tabpanel">
          <div className="sdk-toolkit__context">
            <p className="meta-value">
              Context:{' '}
              <strong>
                {loadingCollection && normalizedCollectionId
                  ? 'Loading selected drop...'
                  : selectedCollectionName}
              </strong>
            </p>
            <p className="meta-value">
              Slug: <code>{selectedCollectionSlug}</code> · State: {selectedCollectionState}
            </p>
            <p className="meta-value">
              Collection contract:{' '}
              <code>{selectedCollectionContractId ?? 'select a deployed drop to prefill'}</code>
            </p>
            <p className="meta-value">
              Core contract: <code>{selectedCoreContractId}</code>
            </p>
          </div>

          <article className="sdk-toolkit__snippet">
            <div className="sdk-toolkit__snippet-header">
              <h3 className="info-label">
                Simple read client
                <InfoTooltip text="Minimal SDK setup for read-only collection/core lookups." />
              </h3>
              <span className="info-label">
                <button
                  className="button button--ghost button--mini"
                  type="button"
                  onClick={() => void handleCopy('Simple read snippet', sdkStarterSnippet)}
                >
                  Copy
                </button>
                <InfoTooltip text="Copy this snippet to start a read client quickly." />
              </span>
            </div>
            <pre>
              <code>{sdkStarterSnippet}</code>
            </pre>
          </article>

          <article className="sdk-toolkit__snippet">
            <div className="sdk-toolkit__snippet-header">
              <h3 className="info-label">
                Collection mint workflow plan
                <InfoTooltip text="Builds transaction workflow plans with safety summaries and next-action guidance." />
              </h3>
              <span className="info-label">
                <button
                  className="button button--ghost button--mini"
                  type="button"
                  onClick={() => void handleCopy('Workflow snippet', sdkWorkflowSnippet)}
                >
                  Copy
                </button>
                <InfoTooltip text="Copy this snippet for workflow-plan based mint orchestration." />
              </span>
            </div>
            <pre>
              <code>{sdkWorkflowSnippet}</code>
            </pre>
          </article>
        </div>
      )}

      {activeTab === 'advanced' && (
        <div className="sdk-toolkit__content" role="tabpanel">
          <article className="sdk-toolkit__card">
            <h3>When to use advanced modules</h3>
            <ul>
              <li>Custom transaction orchestration: use SDK `client` + `mint` modules.</li>
              <li>Custom deploy lifecycle: use SDK `deploy` helpers.</li>
              <li>
                Build richer retry UX: use `workflows` plans plus deterministic resume
                states.
              </li>
            </ul>
          </article>
          <article className="sdk-toolkit__card">
            <h3>Release quality gates</h3>
            <p>Run these before publishing SDK-facing changes:</p>
            <pre>
              <code>{`npm run sdk:docs:validate
npm run sdk:typecheck
npm run sdk:test
npm run sdk:release:dry-run`}</code>
            </pre>
          </article>
        </div>
      )}
    </div>
  );
}
