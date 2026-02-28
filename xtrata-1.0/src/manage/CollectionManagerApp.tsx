import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  callReadOnlyFunction,
  ClarityType,
  cvToValue,
  type ClarityValue
} from '@stacks/transactions';
import CollectionListPanel from './components/CollectionListPanel';
import OwnerOversightPanel from './components/OwnerOversightPanel';
import DeployWizardPanel from './components/DeployWizardPanel';
import CollectionSettingsPanel from './components/CollectionSettingsPanel';
import AssetStagingPanel from './components/AssetStagingPanel';
import PublishOpsPanel from './components/PublishOpsPanel';
import DiagnosticsPanel from './components/DiagnosticsPanel';
import SdkToolkitPanel from './components/SdkToolkitPanel';
import InfoTooltip from './components/InfoTooltip';
import AddressLabel from '../components/AddressLabel';
import WalletTopBar from '../components/WalletTopBar';
import { isXtrataOwnerAddress } from '../config/manage';
import { getNetworkFromAddress } from '../lib/network/guard';
import { toStacksNetwork } from '../lib/network/stacks';
import { useManageWallet } from './ManageWalletContext';
import { resolveCollectionContractLink } from './lib/contract-link';
import {
  deriveJourneyStepStates,
  getRecommendedJourneyStepId,
  JOURNEY_STATUS_LABELS,
  type JourneySignals,
  type JourneyStepId
} from './lib/journey';
import {
  parseManageJsonResponse,
  toManageApiErrorMessage
} from './lib/api-errors';

const PANEL_KEYS = [
  'sdk-toolkit',
  'collection-list',
  'owner-oversight',
  'deploy-wizard',
  'launch-controls',
  'collection-settings',
  'asset-staging',
  'publish-ops',
  'debug-tools'
] as const;

type PanelKey = (typeof PANEL_KEYS)[number];
type ExperienceMode = 'guided' | 'advanced';

type CollectionRecord = {
  id?: string | null;
  slug?: string | null;
  contract_address?: string | null;
  state?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ManagedAsset = {
  state?: string | null;
};

type CollectionReadiness = {
  ready?: boolean;
  reason?: string | null;
  deployReady?: boolean;
};

type JourneySnapshot = {
  loading: boolean;
  error: string | null;
  mintType: JourneySignals['mintType'];
  collectionState: string;
  activeAssetCount: number;
  deployPricingLockPresent: boolean;
  deployReady: boolean;
  launchMintPriceConfigured: boolean;
  launchMaxSupplyConfigured: boolean;
  unpaused: boolean | null;
  hasLivePageCover: boolean;
  hasLivePageDescription: boolean;
  uploadReadinessReason: string | null;
  deployReadinessReason: string | null;
};

const MANAGE_PANEL_IDS: Record<PanelKey, string> = {
  'sdk-toolkit': 'manage-sdk-toolkit',
  'collection-list': 'manage-collection-list',
  'owner-oversight': 'manage-owner-oversight',
  'deploy-wizard': 'manage-deploy-wizard',
  'launch-controls': 'manage-launch-controls',
  'collection-settings': 'manage-collection-settings',
  'asset-staging': 'manage-asset-staging',
  'publish-ops': 'manage-publish-ops',
  'debug-tools': 'manage-debug-tools'
};

const INITIAL_JOURNEY_SNAPSHOT: JourneySnapshot = {
  loading: false,
  error: null,
  mintType: null,
  collectionState: 'draft',
  activeAssetCount: 0,
  deployPricingLockPresent: false,
  deployReady: false,
  launchMintPriceConfigured: false,
  launchMaxSupplyConfigured: false,
  unpaused: null,
  hasLivePageCover: false,
  hasLivePageDescription: false,
  uploadReadinessReason: null,
  deployReadinessReason: null
};

const isActiveAssetState = (value: unknown) => {
  const state = String(value ?? '')
    .trim()
    .toLowerCase();
  return state !== 'expired' && state !== 'sold-out';
};

const toRecord = (value: unknown) =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const toText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const unwrapReadOnlyResponse = (value: ClarityValue) => {
  if (value.type === ClarityType.ResponseOk) {
    return value.value;
  }
  if (value.type === ClarityType.ResponseErr) {
    const parsed = cvToValue(value.value) as { value?: unknown } | unknown;
    const detail =
      typeof parsed === 'string'
        ? parsed
        : parsed &&
            typeof parsed === 'object' &&
            'value' in (parsed as Record<string, unknown>)
          ? (parsed as { value?: unknown }).value
          : 'Unknown contract error';
    throw new Error(String(detail));
  }
  return value;
};

const toClarityPrimitive = (value: ClarityValue): unknown => {
  const parsed = cvToValue(value) as unknown;
  if (
    parsed &&
    typeof parsed === 'object' &&
    'value' in (parsed as Record<string, unknown>)
  ) {
    return (parsed as { value: unknown }).value;
  }
  return parsed;
};

const parseUintPrimitive = (value: unknown): bigint | null => {
  if (typeof value === 'bigint') {
    return value >= 0n ? value : null;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return BigInt(Math.floor(value));
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  return null;
};

const hasCoverMetadata = (value: unknown) => {
  const record = toRecord(value);
  if (!record) {
    return false;
  }
  const source = toText(record.source);
  if (source === 'collection-asset') {
    return toText(record.assetId).length > 0;
  }
  if (source === 'inscribed-image-url') {
    return toText(record.imageUrl).length > 0;
  }
  return false;
};

const getStepPanelKey = (stepId: JourneyStepId): PanelKey | null => {
  if (stepId === 'connect-wallet') {
    return null;
  }
  if (stepId === 'create-draft' || stepId === 'deploy-contract') {
    return 'deploy-wizard';
  }
  if (stepId === 'upload-artwork' || stepId === 'lock-staged-assets') {
    return 'asset-staging';
  }
  if (stepId === 'configure-launch' || stepId === 'unpause-contract') {
    return 'launch-controls';
  }
  if (
    stepId === 'prepare-live-page' ||
    stepId === 'publish-backend' ||
    stepId === 'monitor-launch'
  ) {
    return 'publish-ops';
  }
  return 'collection-list';
};

const GUIDED_PRIMARY_PANELS: PanelKey[] = [
  'collection-list',
  'deploy-wizard',
  'asset-staging',
  'launch-controls',
  'publish-ops'
];

export default function CollectionManagerApp() {
  const { walletSession, connect, disconnect } = useManageWallet();
  const isXtrataOwner = isXtrataOwnerAddress(walletSession.address);
  const [walletPending, setWalletPending] = useState(false);
  const [activeCollectionId, setActiveCollectionId] = useState('');
  const [activeCollectionLabel, setActiveCollectionLabel] = useState('');
  const [collectionListRefreshKey, setCollectionListRefreshKey] = useState(0);

  const [collapsed, setCollapsed] = useState<Record<PanelKey, boolean>>({
    'sdk-toolkit': true,
    'collection-list': false,
    'owner-oversight': false,
    'deploy-wizard': false,
    'launch-controls': false,
    'collection-settings': true,
    'asset-staging': false,
    'publish-ops': false,
    'debug-tools': true
  });
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>('guided');
  const [journeySnapshot, setJourneySnapshot] = useState<JourneySnapshot>(
    INITIAL_JOURNEY_SNAPSHOT
  );
  const [journeyRefreshKey, setJourneyRefreshKey] = useState(0);
  const [activeJourneyStepId, setActiveJourneyStepId] =
    useState<JourneyStepId | null>(null);

  const showAdvancedPanels = experienceMode === 'advanced';
  const walletConnected = Boolean(walletSession.address);
  const hasActiveCollection = activeCollectionId.trim().length > 0;

  const journeySignals = useMemo<JourneySignals>(
    () => ({
      walletConnected,
      hasActiveCollection,
      mintType: journeySnapshot.mintType,
      activeAssetCount: journeySnapshot.activeAssetCount,
      deployPricingLockPresent: journeySnapshot.deployPricingLockPresent,
      deployReady: journeySnapshot.deployReady,
      launchMintPriceConfigured: journeySnapshot.launchMintPriceConfigured,
      launchMaxSupplyConfigured: journeySnapshot.launchMaxSupplyConfigured,
      hasLivePageCover: journeySnapshot.hasLivePageCover,
      hasLivePageDescription: journeySnapshot.hasLivePageDescription,
      published: journeySnapshot.collectionState === 'published',
      unpaused: journeySnapshot.unpaused,
      uploadReadinessReason: journeySnapshot.uploadReadinessReason,
      deployReadinessReason: journeySnapshot.deployReadinessReason
    }),
    [walletConnected, hasActiveCollection, journeySnapshot]
  );

  const journeySteps = useMemo(
    () =>
      deriveJourneyStepStates({
        signals: journeySignals,
        activeStepId: activeJourneyStepId
      }),
    [journeySignals, activeJourneyStepId]
  );
  const recommendedJourneyStepId = useMemo(
    () => getRecommendedJourneyStepId(journeySteps),
    [journeySteps]
  );
  const doneJourneyStepCount = useMemo(
    () => journeySteps.filter((step) => step.status === 'done').length,
    [journeySteps]
  );
  const blockedJourneyStepCount = useMemo(
    () => journeySteps.filter((step) => step.status === 'blocked').length,
    [journeySteps]
  );

  const refreshJourneySnapshot = useCallback(async () => {
    const normalizedCollectionId = activeCollectionId.trim();
    if (!normalizedCollectionId) {
      setJourneySnapshot(INITIAL_JOURNEY_SNAPSHOT);
      return;
    }

    setJourneySnapshot((current) => ({
      ...current,
      loading: true,
      error: null
    }));

    try {
      const [collectionResponse, assetsResponse, readinessResponse] =
        await Promise.all([
          fetch(`/collections/${encodeURIComponent(normalizedCollectionId)}`),
          fetch(`/collections/${encodeURIComponent(normalizedCollectionId)}/assets`),
          fetch(
            `/collections/${encodeURIComponent(normalizedCollectionId)}/readiness`,
            { cache: 'no-store' }
          )
        ]);

      const collection = await parseManageJsonResponse<CollectionRecord>(
        collectionResponse,
        'Collection'
      );
      const assets = await parseManageJsonResponse<ManagedAsset[]>(
        assetsResponse,
        'Collection assets'
      );
      const readiness = await parseManageJsonResponse<CollectionReadiness>(
        readinessResponse,
        'Collection readiness'
      );

      const metadata = toRecord(collection.metadata) ?? null;
      const collectionPage = toRecord(metadata?.collectionPage) ?? null;
      const coverImage = toRecord(collectionPage?.coverImage) ?? null;
      const mintType =
        toText(metadata?.mintType) === 'pre-inscribed'
          ? 'pre-inscribed'
          : 'standard';
      const preInscribedMint = mintType === 'pre-inscribed';
      const collectionState = toText(collection.state).toLowerCase() || 'draft';
      const activeAssetCount = assets.filter((asset) =>
        isActiveAssetState(asset.state)
      ).length;
      let launchMintPriceConfigured = false;
      let launchMaxSupplyConfigured = false;
      let unpaused: boolean | null = null;

      if (readiness.deployReady === true) {
        const resolvedTarget = resolveCollectionContractLink({
          collectionId: toText(collection.id),
          collectionSlug: toText(collection.slug),
          contractAddress: toText(collection.contract_address),
          metadata
        });
        if (resolvedTarget) {
          try {
            const network =
              getNetworkFromAddress(resolvedTarget.address) ??
              (walletSession.network === 'testnet' ? 'testnet' : 'mainnet');
            const callReadOnly = async (functionName: string) => {
              const response = await callReadOnlyFunction({
                contractAddress: resolvedTarget.address,
                contractName: resolvedTarget.contractName,
                functionName,
                functionArgs: [],
                network: toStacksNetwork(network),
                senderAddress: resolvedTarget.address
              });
              return toClarityPrimitive(unwrapReadOnlyResponse(response));
            };

            const pausedPromise = callReadOnly(
              preInscribedMint ? 'get-paused' : 'is-paused'
            );
            const mintPricePromise = callReadOnly(
              preInscribedMint ? 'get-price' : 'get-mint-price'
            );
            const maxSupplyPromise: Promise<unknown> = preInscribedMint
              ? Promise.resolve(null)
              : callReadOnly('get-max-supply');
            const [pausedRaw, mintPriceRaw, maxSupplyRaw] = await Promise.all([
              pausedPromise,
              mintPricePromise,
              maxSupplyPromise
            ]);

            const pausedValue =
              typeof pausedRaw === 'boolean' ? pausedRaw : null;
            const mintPriceValue = parseUintPrimitive(mintPriceRaw);
            const maxSupplyValue = parseUintPrimitive(maxSupplyRaw);
            unpaused =
              pausedValue === null ? null : !pausedValue;
            launchMintPriceConfigured = mintPriceValue !== null;
            launchMaxSupplyConfigured =
              preInscribedMint ||
              (maxSupplyValue !== null && maxSupplyValue > 0n);
          } catch {
            unpaused = null;
            launchMintPriceConfigured = false;
            launchMaxSupplyConfigured = false;
          }
        }
      }

      setJourneySnapshot({
        loading: false,
        error: null,
        mintType,
        collectionState,
        activeAssetCount,
        deployPricingLockPresent:
          toRecord(metadata?.deployPricingLock) !== null,
        deployReady: readiness.deployReady === true,
        launchMintPriceConfigured,
        launchMaxSupplyConfigured,
        unpaused,
        hasLivePageCover: hasCoverMetadata(coverImage),
        hasLivePageDescription:
          toText(collectionPage?.description).length > 0,
        uploadReadinessReason:
          readiness.ready === true ? null : toText(readiness.reason) || null,
        deployReadinessReason:
          readiness.deployReady === true
            ? null
            : toText(readiness.reason) || null
      });
    } catch (error) {
      setJourneySnapshot((current) => ({
        ...current,
        loading: false,
        error: toManageApiErrorMessage(
          error,
          'Unable to refresh checklist data.'
        )
      }));
    }
  }, [activeCollectionId, walletSession.network]);

  const requestJourneyRefresh = useCallback(() => {
    setJourneyRefreshKey((current) => current + 1);
  }, []);

  useEffect(() => {
    void refreshJourneySnapshot();
  }, [refreshJourneySnapshot, journeyRefreshKey]);

  useEffect(() => {
    if (experienceMode !== 'guided') {
      return;
    }

    const current = journeySteps.find(
      (step) => step.id === activeJourneyStepId
    );
    if (
      !current ||
      current.status === 'locked' ||
      current.status === 'done'
    ) {
      setActiveJourneyStepId(recommendedJourneyStepId);
    }
  }, [
    experienceMode,
    journeySteps,
    activeJourneyStepId,
    recommendedJourneyStepId
  ]);

  useEffect(() => {
    if (experienceMode !== 'guided') {
      return;
    }
    const activeStep = journeySteps.find(
      (step) => step.id === activeJourneyStepId
    );
    if (!activeStep) {
      return;
    }
    const panelKey = getStepPanelKey(activeStep.id);
    if (!panelKey || !GUIDED_PRIMARY_PANELS.includes(panelKey)) {
      return;
    }
    setCollapsed((prev) => {
      const next = { ...prev };
      GUIDED_PRIMARY_PANELS.forEach((candidate) => {
        next[candidate] = candidate !== panelKey;
      });
      return next;
    });
  }, [experienceMode, journeySteps, activeJourneyStepId]);

  const togglePanel = (key: PanelKey) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const jumpToPanel = (key: PanelKey) => {
    setCollapsed((prev) => ({ ...prev, [key]: false }));
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const panel = document.getElementById(MANAGE_PANEL_IDS[key]);
        if (panel) {
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
  };

  const setGuidedMode = () => {
    setExperienceMode('guided');
    setActiveJourneyStepId(recommendedJourneyStepId);
    setCollapsed((prev) => ({
      ...prev,
      'collection-settings': true,
      'debug-tools': true
    }));
  };

  const setAdvancedMode = () => {
    setExperienceMode('advanced');
  };

  const handleSelectCollection = (collection: {
    id: string;
    label: string;
    deployed: boolean;
  }) => {
    setActiveCollectionId(collection.id);
    setActiveCollectionLabel(collection.label);
    setCollapsed((prev) => ({
      ...prev,
      'deploy-wizard': collection.deployed,
      'asset-staging': false,
      'publish-ops': false
    }));
    requestJourneyRefresh();
  };

  const handleDraftReady = (collection: {
    id: string;
    label: string;
    deployed: boolean;
  }) => {
    setActiveCollectionId(collection.id);
    setActiveCollectionLabel(collection.label);
    setCollectionListRefreshKey((current) => current + 1);
    setCollapsed((prev) => ({
      ...prev,
      'deploy-wizard': collection.deployed,
      'asset-staging': false
    }));
    requestJourneyRefresh();
  };

  const handleJourneyRefresh = () => {
    requestJourneyRefresh();
  };

  const handleJourneyStepClick = (stepId: JourneyStepId) => {
    const step = journeySteps.find((candidate) => candidate.id === stepId);
    if (!step || step.status === 'locked') {
      return;
    }
    setActiveJourneyStepId(stepId);
    const panelKey = getStepPanelKey(stepId);
    if (!panelKey) {
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }
    if (
      panelKey === 'collection-settings' &&
      experienceMode === 'guided'
    ) {
      setAdvancedMode();
    }
    if (panelKey === 'launch-controls' && experienceMode === 'advanced') {
      jumpToPanel('collection-settings');
      return;
    }
    jumpToPanel(panelKey);
  };

  const handleConnectWallet = async () => {
    setWalletPending(true);
    try {
      await connect();
    } finally {
      setWalletPending(false);
    }
  };

  const handleDisconnectWallet = async () => {
    setWalletPending(true);
    try {
      await disconnect();
    } finally {
      setWalletPending(false);
    }
  };

  return (
    <div className="app manage-app">
      <header className="app__header">
        <span className="eyebrow">Artist workspace</span>
        <h1>Launch your collection</h1>
        <p className="meta-value">
          Logged in as:{' '}
          <AddressLabel
            className="meta-value"
            address={walletSession.address}
            network={walletSession.network}
            fallback="Not connected"
          />
        </p>
        <p>Follow the guided steps below. Advanced controls are optional and hidden by default.</p>
        <WalletTopBar
          walletSession={walletSession}
          walletPending={walletPending}
          onConnect={handleConnectWallet}
          onDisconnect={handleDisconnectWallet}
        />
        {activeCollectionId ? (
          <p className="meta-value">
            Active drop: {activeCollectionLabel || 'Selected drop'} ·{' '}
            <code>{activeCollectionId}</code>
          </p>
        ) : null}
      </header>
      <main className="app__main">
        <section className="panel app-section manage-journey">
          <div className="panel__header">
            <div>
              <h2>
                Start here
                <InfoTooltip text="Guided mode keeps only the essential launch steps visible. Advanced mode reveals contract controls and diagnostics." />
              </h2>
              <p>
                Complete steps in order. Locked items unlock automatically when
                their prerequisites are complete.
              </p>
            </div>
            <div className="panel__actions">
              <button
                className="button button--ghost"
                type="button"
                onClick={handleJourneyRefresh}
                disabled={journeySnapshot.loading}
              >
                {journeySnapshot.loading
                  ? 'Refreshing checklist...'
                  : 'Refresh checklist'}
              </button>
              <div className="manage-journey__mode-toggle" role="group" aria-label="Experience mode">
                <button
                  className={`button ${experienceMode === 'guided' ? '' : 'button--ghost'}`}
                  type="button"
                  onClick={setGuidedMode}
                >
                  Guided mode
                </button>
                <button
                  className={`button ${experienceMode === 'advanced' ? '' : 'button--ghost'}`}
                  type="button"
                  onClick={setAdvancedMode}
                >
                  Advanced mode
                </button>
              </div>
            </div>
          </div>
          <div className="panel__body">
            <p className="meta-value">
              Progress: {doneJourneyStepCount}/{journeySteps.length} complete
              {blockedJourneyStepCount > 0
                ? ` · ${blockedJourneyStepCount} need attention`
                : ''}
            </p>
            {journeySnapshot.error ? (
              <div className="alert">{journeySnapshot.error}</div>
            ) : null}
            <div className="manage-journey__steps">
              {journeySteps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  className={`button button--ghost manage-journey__step manage-journey__step--${step.status}${
                    activeJourneyStepId === step.id ? ' manage-journey__step--active' : ''
                  }`}
                  onClick={() => handleJourneyStepClick(step.id)}
                  disabled={step.status === 'locked'}
                  aria-current={activeJourneyStepId === step.id ? 'step' : undefined}
                >
                  <span className="manage-journey__step-index">
                    Step {index + 1}
                  </span>
                  <strong>{step.title}</strong>
                  <span className="manage-journey__step-status">
                    {JOURNEY_STATUS_LABELS[step.status]}
                  </span>
                  <span className="manage-journey__step-note">
                    {step.summary}
                  </span>
                  {step.lockedReason ? (
                    <span className="manage-journey__step-reason">
                      {step.lockedReason}
                    </span>
                  ) : null}
                  {step.blockedReason ? (
                    <span className="manage-journey__step-reason">
                      {step.blockedReason}
                    </span>
                  ) : null}
                  {step.doneNote ? (
                    <span className="manage-journey__step-reason">
                      {step.doneNote}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section
          className={`panel app-section${collapsed['sdk-toolkit'] ? ' panel--collapsed' : ''}`}
          id={MANAGE_PANEL_IDS['sdk-toolkit']}
        >
          <div className="panel__header">
            <div>
              <h2>
                SDK toolkit
                <InfoTooltip text="Builder-ready snippets and links for teams integrating Xtrata into third-party apps." />
              </h2>
              <p>Build on Xtrata without rebuilding contract logic from scratch.</p>
            </div>
            <div className="panel__actions">
              <button className="button button--ghost" type="button" onClick={() => togglePanel('sdk-toolkit')}>
                {collapsed['sdk-toolkit'] ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>
          <div className="panel__body">
            <SdkToolkitPanel
              activeCollectionId={activeCollectionId}
              activeCollectionLabel={activeCollectionLabel}
            />
          </div>
        </section>

        <section
          className={`panel app-section${collapsed['collection-list'] ? ' panel--collapsed' : ''}`}
          id={MANAGE_PANEL_IDS['collection-list']}
        >
          <div className="panel__header">
            <div>
              <h2>
                Your drops
                <InfoTooltip text="View each draft collection and jump to its deploy/metadata details." />
              </h2>
              <p>See what is in progress and what is already deployed.</p>
            </div>
            <div className="panel__actions">
              <button className="button button--ghost" type="button" onClick={() => togglePanel('collection-list')}>
                {collapsed['collection-list'] ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>
          <div className="panel__body">
            <CollectionListPanel
              activeCollectionId={activeCollectionId}
              refreshKey={collectionListRefreshKey}
              onSelectCollection={handleSelectCollection}
            />
          </div>
        </section>

        {isXtrataOwner && (
          <section
            className={`panel app-section${collapsed['owner-oversight'] ? ' panel--collapsed' : ''}`}
            id={MANAGE_PANEL_IDS['owner-oversight']}
          >
            <div className="panel__header">
              <div>
                <h2>
                  Owner oversight
                  <InfoTooltip text="Owner-only view of activity across other allowlisted artist wallets." />
                </h2>
                <p>Monitor launch progress across all allowlisted artists from one place.</p>
              </div>
              <div className="panel__actions">
                <button className="button button--ghost" type="button" onClick={() => togglePanel('owner-oversight')}>
                  {collapsed['owner-oversight'] ? 'Expand' : 'Collapse'}
                </button>
              </div>
            </div>
            <div className="panel__body">
              <OwnerOversightPanel />
            </div>
          </section>
        )}

        <section
          className={`panel app-section${collapsed['deploy-wizard'] ? ' panel--collapsed' : ''}`}
          id={MANAGE_PANEL_IDS['deploy-wizard']}
        >
          <div className="panel__header">
            <div>
              <h2>
                Step 1: Create your drop
                <InfoTooltip text="Create and deploy with a locked template using drop basics plus artist and marketplace payout addresses." />
              </h2>
              <p>Fill the guided fields, review, and deploy your contract. Going live happens in Step 4.</p>
            </div>
            <div className="panel__actions">
              <button className="button button--ghost" type="button" onClick={() => togglePanel('deploy-wizard')}>
                {collapsed['deploy-wizard'] ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>
          <div className="panel__body">
            <DeployWizardPanel
              activeCollectionId={activeCollectionId}
              onDraftReady={handleDraftReady}
              onJourneyRefreshRequested={requestJourneyRefresh}
            />
          </div>
        </section>

        <section
          className={`panel app-section${collapsed['asset-staging'] ? ' panel--collapsed' : ''}`}
          id={MANAGE_PANEL_IDS['asset-staging']}
        >
          <div className="panel__header">
            <div>
              <h2>
                Step 2: Upload your artwork
                <InfoTooltip text="Upload files to Cloudflare, compute hashes/chunks, and store manifest rows for minting." />
              </h2>
              <p>Upload files once and prepare the manifest for launch day.</p>
            </div>
            <div className="panel__actions">
              <button className="button button--ghost" type="button" onClick={() => togglePanel('asset-staging')}>
                {collapsed['asset-staging'] ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>
          <div className="panel__body">
            <AssetStagingPanel
              activeCollectionId={activeCollectionId}
              onJourneyRefreshRequested={requestJourneyRefresh}
            />
          </div>
        </section>

        {!showAdvancedPanels && (
          <section
            className={`panel app-section${collapsed['launch-controls'] ? ' panel--collapsed' : ''}`}
            id={MANAGE_PANEL_IDS['launch-controls']}
          >
            <div className="panel__header">
              <div>
                <h2>
                  Step 3: Launch controls
                  <InfoTooltip text="Set essential contract launch values, then pause/unpause from one guided panel." />
                </h2>
                <p>Use quick actions to set mint price, supply, and launch pause state.</p>
              </div>
              <div className="panel__actions">
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => togglePanel('launch-controls')}
                >
                  {collapsed['launch-controls'] ? 'Expand' : 'Collapse'}
                </button>
              </div>
            </div>
            <div className="panel__body">
              <CollectionSettingsPanel
                mode="guided"
                activeCollectionId={activeCollectionId}
                onJourneyRefreshRequested={requestJourneyRefresh}
                onRequestAdvancedControls={setAdvancedMode}
              />
            </div>
          </section>
        )}

        <section
          className={`panel app-section${collapsed['publish-ops'] ? ' panel--collapsed' : ''}`}
          id={MANAGE_PANEL_IDS['publish-ops']}
        >
          <div className="panel__header">
            <div>
              <h2>
                Step 4: Go live
                <InfoTooltip text="Mark a collection published, refresh reservations, and release stuck slots." />
              </h2>
              <p>Publish when ready, then monitor reservations and clear expired slots.</p>
            </div>
            <div className="panel__actions">
              <button className="button button--ghost" type="button" onClick={() => togglePanel('publish-ops')}>
                {collapsed['publish-ops'] ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>
          <div className="panel__body">
            <PublishOpsPanel
              activeCollectionId={activeCollectionId}
              onJourneyRefreshRequested={requestJourneyRefresh}
            />
          </div>
        </section>

        {!showAdvancedPanels && (
          <div className="manage-advanced-teaser">
            <p>Need deeper controls? Switch to Advanced mode to edit contract settings and run diagnostics.</p>
            <button className="button button--ghost" type="button" onClick={setAdvancedMode}>
              Open advanced tools
            </button>
          </div>
        )}

        {showAdvancedPanels && (
          <>
            <section
              className={`panel app-section${collapsed['collection-settings'] ? ' panel--collapsed' : ''}`}
              id={MANAGE_PANEL_IDS['collection-settings']}
            >
              <div className="panel__header">
                <div>
                  <h2>
                    Advanced contract settings
                    <InfoTooltip text="Load the draft to edit display name, contract references, and other advanced launch settings." />
                  </h2>
                  <p>Use this only if you need detailed contract-level adjustments.</p>
                </div>
                <div className="panel__actions">
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => togglePanel('collection-settings')}
                  >
                    {collapsed['collection-settings'] ? 'Expand' : 'Collapse'}
                  </button>
                </div>
              </div>
              <div className="panel__body">
                <CollectionSettingsPanel
                  mode="advanced"
                  activeCollectionId={activeCollectionId}
                  onJourneyRefreshRequested={requestJourneyRefresh}
                />
              </div>
            </section>

            <section
              className={`panel app-section${collapsed['debug-tools'] ? ' panel--collapsed' : ''}`}
              id={MANAGE_PANEL_IDS['debug-tools']}
            >
              <div className="panel__header">
                <div>
                  <h2>
                    Advanced system checks
                    <InfoTooltip text="Run D1 and storage checks if you suspect backend issues." />
                  </h2>
                  <p>Technical checks for troubleshooting backend availability.</p>
                </div>
                <div className="panel__actions">
                  <button className="button button--ghost" type="button" onClick={() => togglePanel('debug-tools')}>
                    {collapsed['debug-tools'] ? 'Expand' : 'Collapse'}
                  </button>
                </div>
              </div>
              <div className="panel__body">
                <DiagnosticsPanel activeCollectionId={activeCollectionId} />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
