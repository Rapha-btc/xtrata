import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getStacksProvider,
  showContractDeploy,
  type StacksProvider
} from '@stacks/connect';
import { getContractId } from '../../lib/contract/config';
import {
  CONTRACT_REGISTRY,
  getLegacyContract,
  type ContractRegistryEntry
} from '../../lib/contract/registry';
import { createXtrataClient } from '../../lib/contract/client';
import { useTokenSummaries } from '../../lib/viewer/queries';
import TokenCardMedia from '../../components/TokenCardMedia';
import {
  normalizeDependencyIds,
  parseDependencyInput
} from '../../lib/mint/dependencies';
import {
  ARTIST_DEPLOY_DEFAULTS,
  buildArtistDeployContractSource,
  deriveArtistCollectionSlug,
  deriveArtistCollectionSymbol,
  deriveArtistContractName,
  resolveArtistDeployCoreTarget,
  type ArtistMintType
} from '../../lib/deploy/artist-deploy';
import {
  parseManageJsonResponse,
  toManageApiErrorMessage
} from '../lib/api-errors';
import { useManageWallet } from '../ManageWalletContext';
import InfoTooltip from './InfoTooltip';
import standardTemplateSource from '../../../contracts/clarinet/contracts/xtrata-collection-mint-v1.2.clar?raw';
import preinscribedTemplateSource from '../../../contracts/clarinet/contracts/xtrata-preinscribed-collection-sale-v1.0.clar?raw';

type CollectionDraft = {
  id: string;
  slug: string;
  artist_address: string;
  display_name: string | null;
  state: string;
  contract_address: string | null;
  metadata?: Record<string, unknown> | null;
};

type CollectionDraftCreateResponse = CollectionDraft & {
  slugReused?: boolean;
};

const buildCollectionSlug = (collectionName: string) =>
  deriveArtistCollectionSlug(collectionName);

const PARENT_THUMBNAIL_LIMIT = 12;
const DEPLOY_WIZARD_DRAFT_STORAGE_KEY = 'xtrata-manage-deploy-wizard-v1';
const DEPLOY_DEBUG_LOG_LIMIT = 60;
const DEPLOY_CLARITY_VERSION = 2;
const DEPLOY_DEBUG_TEXT_MAX = 1200;
const MANAGE_APP_ICON =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="%23f97316"/><path d="M18 20h28v6H18zm0 12h28v6H18zm0 12h28v6H18z" fill="white"/></svg>';

const debugStringify = (value: unknown) => {
  try {
    return JSON.stringify(value, (_key, entry) =>
      typeof entry === 'bigint' ? entry.toString() : entry
    );
  } catch {
    return String(value);
  }
};

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const truncateDebugText = (value: string) =>
  value.length > DEPLOY_DEBUG_TEXT_MAX
    ? `${value.slice(0, DEPLOY_DEBUG_TEXT_MAX)}...(+${value.length - DEPLOY_DEBUG_TEXT_MAX} chars)`
    : value;

const extractErrorDebug = (error: unknown): Record<string, unknown> => {
  const details: Record<string, unknown> = {
    message: toErrorMessage(error)
  };

  if (error instanceof Error) {
    details.name = error.name;
    if (error.stack) {
      details.stack = truncateDebugText(error.stack);
    }
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    details.keys = Object.keys(record).slice(0, 20);

    const code = record.code;
    if (typeof code === 'string' || typeof code === 'number') {
      details.code = code;
    }

    const reason = record.reason;
    if (typeof reason === 'string') {
      details.reason = truncateDebugText(reason);
    }

    if ('data' in record) {
      details.data = truncateDebugText(debugStringify(record.data));
    }
    if ('response' in record) {
      details.response = truncateDebugText(debugStringify(record.response));
    }
  }

  return details;
};

const compactClaritySourceForDeploy = (source: string) => {
  const lines = source.split('\n');
  const compacted: string[] = [];
  for (const line of lines) {
    const withoutIndent = line.replace(/^\s+/, '');
    if (withoutIndent.startsWith(';;')) {
      continue;
    }
    const trimmedLine = withoutIndent.replace(/\s+$/, '');
    if (trimmedLine.length === 0) {
      continue;
    }
    compacted.push(trimmedLine);
  }
  const result = compacted.join('\n');
  return result.length > 0 ? result : source;
};

type DeployWizardDraftStorage = {
  collectionName: string;
  symbol: string;
  symbolTouched: boolean;
  description: string;
  supply: string;
  mintPriceStx: string;
  mintType: ArtistMintType;
  parentInscriptions: string;
  artistAddress: string;
  artistAddressTouched: boolean;
  marketplaceAddress: string;
  marketplaceAddressTouched: boolean;
};

const parseStoredDraft = (value: string | null): DeployWizardDraftStorage | null => {
  if (!value) {
    return null;
  }
  try {
    const payload = JSON.parse(value) as Partial<DeployWizardDraftStorage>;
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    return {
      collectionName:
        typeof payload.collectionName === 'string' ? payload.collectionName : '',
      symbol: typeof payload.symbol === 'string' ? payload.symbol : '',
      symbolTouched: payload.symbolTouched === true,
      description: typeof payload.description === 'string' ? payload.description : '',
      supply: typeof payload.supply === 'string' ? payload.supply : '1000',
      mintPriceStx:
        typeof payload.mintPriceStx === 'string' ? payload.mintPriceStx : '0',
      mintType:
        payload.mintType === 'pre-inscribed' ? 'pre-inscribed' : 'standard',
      parentInscriptions:
        typeof payload.parentInscriptions === 'string'
          ? payload.parentInscriptions
          : '',
      artistAddress:
        typeof payload.artistAddress === 'string' ? payload.artistAddress : '',
      artistAddressTouched: payload.artistAddressTouched === true,
      marketplaceAddress:
        typeof payload.marketplaceAddress === 'string'
          ? payload.marketplaceAddress
          : '',
      marketplaceAddressTouched: payload.marketplaceAddressTouched === true
    };
  } catch {
    return null;
  }
};

export default function DeployWizardPanel() {
  const [collectionName, setCollectionName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [symbolTouched, setSymbolTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [supply, setSupply] = useState('1000');
  const [mintPriceStx, setMintPriceStx] = useState('0');
  const [mintType, setMintType] = useState<ArtistMintType>('standard');
  const [parentInscriptions, setParentInscriptions] = useState('');
  const [artistAddress, setArtistAddress] = useState('');
  const [artistAddressTouched, setArtistAddressTouched] = useState(false);
  const [marketplaceAddress, setMarketplaceAddress] = useState('');
  const [marketplaceAddressTouched, setMarketplaceAddressTouched] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [collection, setCollection] = useState<CollectionDraft | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [deployPending, setDeployPending] = useState(false);
  const [deployAttemptId, setDeployAttemptId] = useState<string | null>(null);
  const [deployDebugLog, setDeployDebugLog] = useState<string[]>([]);
  const reviewCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const hasHydratedDraftRef = useRef(false);

  const { walletSession, walletAdapter, connect } = useManageWallet();

  useEffect(() => {
    if (!reviewOpen || typeof window === 'undefined') {
      return;
    }

    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frameId = window.requestAnimationFrame(() => {
      reviewCloseButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      if (!deployPending) {
        setReviewOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [reviewOpen, deployPending]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = parseStoredDraft(
      window.localStorage.getItem(DEPLOY_WIZARD_DRAFT_STORAGE_KEY)
    );
    if (stored) {
      setCollectionName(stored.collectionName);
      setSymbol(stored.symbol);
      setSymbolTouched(stored.symbolTouched);
      setDescription(stored.description);
      setSupply(stored.supply);
      setMintPriceStx(stored.mintPriceStx);
      setMintType(stored.mintType);
      setParentInscriptions(stored.parentInscriptions);
      setArtistAddress(stored.artistAddress);
      setArtistAddressTouched(stored.artistAddressTouched);
      setMarketplaceAddress(stored.marketplaceAddress);
      setMarketplaceAddressTouched(stored.marketplaceAddressTouched);
    }
    hasHydratedDraftRef.current = true;
  }, []);

  useEffect(() => {
    if (!hasHydratedDraftRef.current || typeof window === 'undefined') {
      return;
    }
    const payload: DeployWizardDraftStorage = {
      collectionName,
      symbol,
      symbolTouched,
      description,
      supply,
      mintPriceStx,
      mintType,
      parentInscriptions,
      artistAddress,
      artistAddressTouched,
      marketplaceAddress,
      marketplaceAddressTouched
    };
    try {
      window.localStorage.setItem(
        DEPLOY_WIZARD_DRAFT_STORAGE_KEY,
        JSON.stringify(payload)
      );
    } catch {
      // Ignore storage write failures; deploy flow remains fully functional.
    }
  }, [
    collectionName,
    symbol,
    symbolTouched,
    description,
    supply,
    mintPriceStx,
    mintType,
    parentInscriptions,
    artistAddress,
    artistAddressTouched,
    marketplaceAddress,
    marketplaceAddressTouched
  ]);

  useEffect(() => {
    if (symbolTouched) {
      return;
    }
    setSymbol(deriveArtistCollectionSymbol(collectionName));
  }, [collectionName, symbolTouched]);

  useEffect(() => {
    if (artistAddressTouched || !walletSession.address) {
      return;
    }
    setArtistAddress(walletSession.address);
  }, [walletSession.address, artistAddressTouched]);

  const fallbackCoreTarget = useMemo(
    () => resolveArtistDeployCoreTarget('mainnet'),
    []
  );
  const activeNetwork = walletSession.network ?? 'mainnet';
  const coreTarget = useMemo(
    () => resolveArtistDeployCoreTarget(activeNetwork) ?? fallbackCoreTarget,
    [activeNetwork, fallbackCoreTarget]
  );
  const coreContractEntry = useMemo(
    () =>
      coreTarget
        ? CONTRACT_REGISTRY.find(
            (entry) => getContractId(entry) === coreTarget.contractId
          ) ?? null
        : null,
    [coreTarget]
  );
  const previewContract = useMemo<ContractRegistryEntry | null>(() => {
    if (coreContractEntry) {
      return coreContractEntry;
    }
    if (!coreTarget) {
      return null;
    }
    const [address = '', contractName = ''] = coreTarget.contractId.split('.');
    if (!address || !contractName) {
      return null;
    }
    return {
      address,
      contractName,
      network: coreTarget.network,
      label: coreTarget.contractId,
      protocolVersion: '2.1.0'
    };
  }, [coreContractEntry, coreTarget]);
  const previewClient = useMemo(
    () => (previewContract ? createXtrataClient({ contract: previewContract }) : null),
    [previewContract]
  );
  const previewLegacyContract = useMemo(
    () => (coreContractEntry ? getLegacyContract(coreContractEntry) : null),
    [coreContractEntry]
  );
  const previewLegacyClient = useMemo(
    () =>
      previewLegacyContract
        ? createXtrataClient({ contract: previewLegacyContract })
        : null,
    [previewLegacyContract]
  );
  const previewSenderAddress = walletSession.address ?? coreTarget?.address ?? '';
  const previewContractId = previewContract ? getContractId(previewContract) : null;
  const legacyContractId = previewLegacyContract
    ? getContractId(previewLegacyContract)
    : null;
  const parsedParentInput = useMemo(
    () => parseDependencyInput(parentInscriptions),
    [parentInscriptions]
  );
  const previewParentIds = useMemo(
    () => normalizeDependencyIds(parsedParentInput.ids),
    [parsedParentInput.ids]
  );
  const { tokenQueries: parentV2Queries } = useTokenSummaries({
    client: previewClient ?? createXtrataClient({
      contract: {
        address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
        contractName: 'xtrata-v2-1-0',
        network: 'mainnet'
      }
    }),
    senderAddress: previewSenderAddress,
    tokenIds: previewParentIds,
    enabled:
      mintType === 'standard' &&
      !!previewClient &&
      previewParentIds.length > 0 &&
      !!previewContractId,
    contractIdOverride: previewContractId ?? undefined
  });
  const parentV2StatusById = useMemo(() => {
    const map = new Map<
      string,
      {
        summary: (typeof parentV2Queries)[number]['data'] | null;
        isLoading: boolean;
        isError: boolean;
      }
    >();
    previewParentIds.forEach((id, index) => {
      const query = parentV2Queries[index];
      map.set(id.toString(), {
        summary: query?.data ?? null,
        isLoading: query?.isLoading ?? false,
        isError: query?.isError ?? false
      });
    });
    return map;
  }, [parentV2Queries, previewParentIds]);
  const missingParentIds = useMemo(
    () =>
      previewParentIds.filter((id) => {
        const status = parentV2StatusById.get(id.toString());
        if (!status || status.isLoading) {
          return false;
        }
        return !status.summary?.meta;
      }),
    [previewParentIds, parentV2StatusById]
  );
  const { tokenQueries: parentLegacyQueries } = useTokenSummaries({
    client:
      previewLegacyClient ??
      previewClient ??
      createXtrataClient({
        contract: {
          address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
          contractName: 'xtrata-v2-1-0',
          network: 'mainnet'
        }
      }),
    senderAddress: previewSenderAddress,
    tokenIds: missingParentIds,
    enabled:
      mintType === 'standard' &&
      !!previewLegacyClient &&
      missingParentIds.length > 0 &&
      !!legacyContractId,
    contractIdOverride: legacyContractId ?? undefined
  });
  const parentLegacyStatusById = useMemo(() => {
    const map = new Map<
      string,
      {
        summary: (typeof parentLegacyQueries)[number]['data'] | null;
        isLoading: boolean;
        isError: boolean;
      }
    >();
    missingParentIds.forEach((id, index) => {
      const query = parentLegacyQueries[index];
      map.set(id.toString(), {
        summary: query?.data ?? null,
        isLoading: query?.isLoading ?? false,
        isError: query?.isError ?? false
      });
    });
    return map;
  }, [parentLegacyQueries, missingParentIds]);
  const parentDisplayItems = useMemo(() => {
    if (!previewClient || !previewContractId) {
      return [];
    }
    return previewParentIds.map((id) => {
      const key = id.toString();
      const v2Status = parentV2StatusById.get(key);
      const legacyStatus = parentLegacyStatusById.get(key);
      const v2Summary = v2Status?.summary ?? null;
      const legacySummary = legacyStatus?.summary ?? null;
      const v2Ready = !!v2Summary?.meta;
      const legacyReady = !!legacySummary?.meta;
      const isLoading =
        v2Status?.isLoading ||
        (!v2Ready && legacyStatus?.isLoading) ||
        false;
      let status: 'loading' | 'owned' | 'not-owned' | 'legacy' | 'missing' =
        'loading';
      if (!isLoading) {
        if (v2Ready) {
          const owner = v2Summary?.owner ?? null;
          if (walletSession.address && owner === walletSession.address) {
            status = 'owned';
          } else {
            status = 'not-owned';
          }
        } else if (legacyReady) {
          status = 'legacy';
        } else {
          status = 'missing';
        }
      }
      const summary = v2Ready ? v2Summary : legacyReady ? legacySummary : null;
      const summaryContractId = summary?.sourceContractId ?? previewContractId;
      const summaryClient =
        summaryContractId === legacyContractId && previewLegacyClient
          ? previewLegacyClient
          : previewClient;
      return {
        id,
        summary,
        summaryClient,
        summaryContractId,
        status
      };
    });
  }, [
    previewClient,
    previewContractId,
    previewParentIds,
    parentV2StatusById,
    parentLegacyStatusById,
    walletSession.address,
    legacyContractId,
    previewLegacyClient
  ]);
  const parentStatusSummary = useMemo(() => {
    const notOwned: bigint[] = [];
    const legacyOnly: bigint[] = [];
    const missing: bigint[] = [];
    const loading: bigint[] = [];
    parentDisplayItems.forEach((item) => {
      if (item.status === 'loading') {
        loading.push(item.id);
      } else if (item.status === 'not-owned') {
        notOwned.push(item.id);
      } else if (item.status === 'legacy') {
        legacyOnly.push(item.id);
      } else if (item.status === 'missing') {
        missing.push(item.id);
      }
    });
    return { notOwned, legacyOnly, missing, loading };
  }, [parentDisplayItems]);
  const visibleParentItems = useMemo(
    () => parentDisplayItems.slice(0, PARENT_THUMBNAIL_LIMIT),
    [parentDisplayItems]
  );
  const parentOverflowCount = Math.max(
    0,
    parentDisplayItems.length - visibleParentItems.length
  );

  useEffect(() => {
    if (marketplaceAddressTouched || !coreTarget?.address) {
      return;
    }
    setMarketplaceAddress(coreTarget.address);
  }, [coreTarget, marketplaceAddressTouched]);

  const deployBuild = useMemo(
    () =>
      buildArtistDeployContractSource({
        input: {
          collectionName,
          symbol,
          description,
          supply,
          mintType,
          mintPriceStx,
          parentInscriptions,
          artistAddress,
          marketplaceAddress
        },
        templateSources: {
          standardSource: standardTemplateSource,
          preinscribedSource: preinscribedTemplateSource
        },
        coreContractId:
          coreTarget?.contractId ??
          'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0',
        operatorAddress:
          coreTarget?.address ?? 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X'
      }),
    [
      collectionName,
      symbol,
      description,
      supply,
      mintType,
      mintPriceStx,
      parentInscriptions,
      artistAddress,
      marketplaceAddress,
      coreTarget
    ]
  );
  const deploySourceByteLength = useMemo(
    () => new TextEncoder().encode(deployBuild.source).byteLength,
    [deployBuild.source]
  );
  const preflightSummary = useMemo(
    () => ({
      walletAddress: walletSession.address ?? null,
      walletNetwork: walletSession.network ?? null,
      activeNetwork,
      coreContractId: coreTarget?.contractId ?? null,
      mintType,
      clarityVersion: DEPLOY_CLARITY_VERSION,
      sourceLengthChars: deployBuild.source.length,
      sourceLengthBytes: deploySourceByteLength,
      errors: deployBuild.errors.length,
      warnings: deployBuild.warnings.length
    }),
    [
      walletSession.address,
      walletSession.network,
      activeNetwork,
      coreTarget?.contractId,
      mintType,
      deployBuild.source.length,
      deploySourceByteLength,
      deployBuild.errors.length,
      deployBuild.warnings.length
    ]
  );

  const appendDeployDebug = (message: string, details?: Record<string, unknown>) => {
    const timestamp = new Date().toISOString();
    const suffix = details ? ` ${debugStringify(details)}` : '';
    const line = `${timestamp} ${message}${suffix}`;
    setDeployDebugLog((previous) => [
      ...previous.slice(-(DEPLOY_DEBUG_LOG_LIMIT - 1)),
      line
    ]);
    // eslint-disable-next-line no-console
    console.debug('[xtrata:deploy]', message, details ?? {});
  };

  const handleOpenReview = () => {
    setStatus(null);
    appendDeployDebug('Review modal opened', preflightSummary);
    setReviewOpen(true);
  };

  const handleDeploy = async () => {
    setStatus(null);
    const attemptId = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    setDeployAttemptId(attemptId);
    appendDeployDebug('Deploy started', {
      attemptId,
      ...preflightSummary
    });

    if (deployBuild.errors.length > 0) {
      appendDeployDebug('Deploy blocked by form validation', {
        attemptId,
        firstError: deployBuild.errors[0]
      });
      setStatus(deployBuild.errors[0]);
      return;
    }

    setDeployPending(true);

    let session = walletSession;
    if (!session.address || !session.network) {
      try {
        appendDeployDebug('Wallet session missing, requesting connect', { attemptId });
        await connect();
      } catch (error) {
        appendDeployDebug('Wallet connect failed', {
          attemptId,
          error: toErrorMessage(error)
        });
        setDeployPending(false);
        setStatus(error instanceof Error ? error.message : 'Wallet connection failed.');
        return;
      }
      session = walletAdapter.getSession();
    }

    if (!session.address || !session.network) {
      appendDeployDebug('Deploy blocked: wallet not connected after connect flow', {
        attemptId
      });
      setDeployPending(false);
      setStatus('Connect a wallet to deploy this collection.');
      return;
    }

    const networkCoreTarget = resolveArtistDeployCoreTarget(session.network);
    if (!networkCoreTarget) {
      appendDeployDebug('Deploy blocked: missing core target for network', {
        attemptId,
        network: session.network
      });
      setDeployPending(false);
      setStatus(`No supported core contract is configured for ${session.network}.`);
      return;
    }

    const refreshBuild = buildArtistDeployContractSource({
      input: {
        collectionName,
        symbol,
        description,
        supply,
        mintType,
        mintPriceStx,
        parentInscriptions,
        artistAddress,
        marketplaceAddress
      },
      templateSources: {
        standardSource: standardTemplateSource,
        preinscribedSource: preinscribedTemplateSource
      },
      coreContractId: networkCoreTarget.contractId,
      operatorAddress: networkCoreTarget.address
    });

    if (refreshBuild.errors.length > 0) {
      appendDeployDebug('Deploy blocked by contract source build validation', {
        attemptId,
        firstError: refreshBuild.errors[0]
      });
      setDeployPending(false);
      setStatus(refreshBuild.errors[0]);
      return;
    }

    const slug = buildCollectionSlug(refreshBuild.resolved.collectionName);
    const templateVersion =
      mintType === 'pre-inscribed'
        ? 'xtrata-preinscribed-collection-sale-v1.0'
        : 'xtrata-collection-mint-v1.2';

    const draftMetadata = {
      mintType,
      templateVersion,
      coreContractId: networkCoreTarget.contractId,
      collection: {
        name: refreshBuild.resolved.collectionName,
        symbol: refreshBuild.resolved.symbol,
        description: refreshBuild.resolved.description,
        supply: refreshBuild.resolved.supply.toString(),
        mintPriceStx,
        mintPriceMicroStx: refreshBuild.resolved.mintPriceMicroStx.toString(),
        parentInscriptionIds: refreshBuild.resolved.defaultDependencyIds.map((id) =>
          id.toString()
        )
      },
      hardcodedDefaults: {
        paused: ARTIST_DEPLOY_DEFAULTS.pausedByDefault,
        royaltyTotalBps: ARTIST_DEPLOY_DEFAULTS.royaltyTotalBps,
        splits: {
          artist: ARTIST_DEPLOY_DEFAULTS.artistBps,
          marketplace: ARTIST_DEPLOY_DEFAULTS.marketplaceBps,
          operator: ARTIST_DEPLOY_DEFAULTS.operatorBps
        },
        recipients: {
          artist: refreshBuild.resolved.artistAddress,
          marketplace: refreshBuild.resolved.marketplaceAddress,
          operator: refreshBuild.resolved.operatorAddress
        }
      }
    };

    let created: CollectionDraftCreateResponse;
    try {
      appendDeployDebug('Creating draft record', {
        attemptId,
        slug,
        templateVersion
      });
      setStatus('Saving your drop draft...');
      const createResponse = await fetch('/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          artistAddress: refreshBuild.resolved.artistAddress,
          displayName: refreshBuild.resolved.collectionName,
          contractAddress: null,
          metadata: draftMetadata
        })
      });
      created = await parseManageJsonResponse<CollectionDraftCreateResponse>(
        createResponse,
        'Create collection draft'
      );
      appendDeployDebug('Draft record created', {
        attemptId,
        draftId: created.id,
        draftSlug: created.slug,
        slugReused: created.slugReused === true
      });
      setCollection(created);
    } catch (error) {
      appendDeployDebug('Draft creation failed', {
        attemptId,
        error: toErrorMessage(error)
      });
      setDeployPending(false);
      setStatus(
        toManageApiErrorMessage(error, 'Could not create collection draft.')
      );
      return;
    }

    const contractName = deriveArtistContractName({
      collectionName: refreshBuild.resolved.collectionName,
      mintType,
      seed: created.id
    });
    const sourceForDeploy = compactClaritySourceForDeploy(refreshBuild.source);
    const sourceForDeployBytes = new TextEncoder().encode(sourceForDeploy).byteLength;
    const sourceCompacted = sourceForDeploy !== refreshBuild.source;

    setReviewOpen(false);
    setStatus('Open your wallet and approve contract deployment.');

    try {
      const selectedProvider = getStacksProvider();
      const selectedProviderInfo =
        selectedProvider?.getProductInfo?.() ?? null;
      appendDeployDebug('Resolved wallet provider', {
        attemptId,
        providerDetected: Boolean(selectedProvider),
        providerInfo: selectedProviderInfo
      });

      const instrumentedProvider: StacksProvider | undefined = selectedProvider
        ? {
            ...selectedProvider,
            transactionRequest: async (payload: string) => {
              appendDeployDebug('Provider transactionRequest invoked', {
                attemptId,
                payloadLength: payload.length
              });
              try {
                const providerResult = await selectedProvider.transactionRequest.call(
                  selectedProvider,
                  payload
                );
                appendDeployDebug('Provider transactionRequest resolved', {
                  attemptId,
                  txId:
                    'txId' in providerResult && typeof providerResult.txId === 'string'
                      ? providerResult.txId
                      : null
                });
                return providerResult;
              } catch (error) {
                appendDeployDebug('Provider transactionRequest rejected', {
                  attemptId,
                  ...extractErrorDebug(error)
                });
                throw error;
              }
            }
          }
        : undefined;

      appendDeployDebug('Opening wallet deployment request', {
        attemptId,
        contractName,
        network: session.network,
        clarityVersion: DEPLOY_CLARITY_VERSION,
        sourceLengthChars: refreshBuild.source.length,
        sourceLengthBytes: new TextEncoder().encode(refreshBuild.source).byteLength,
        deploySourceLengthChars: sourceForDeploy.length,
        deploySourceLengthBytes: sourceForDeployBytes,
        sourceCompacted,
        coreContractId: networkCoreTarget.contractId
      });
      showContractDeploy({
        contractName,
        codeBody: sourceForDeploy,
        network: session.network,
        clarityVersion: DEPLOY_CLARITY_VERSION,
        appDetails: {
          name: 'Xtrata Collection Manager',
          icon: MANAGE_APP_ICON
        },
        onFinish: async (payload) => {
          appendDeployDebug('Wallet returned tx payload', {
            attemptId,
            txId: payload.txId
          });
          try {
            const patchResponse = await fetch(`/collections/${created.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contractAddress: session.address,
                metadata: {
                  ...draftMetadata,
                  contractName,
                  deployTxId: payload.txId,
                  deployedAt: new Date().toISOString()
                }
              })
            });

            const updated = await parseManageJsonResponse<CollectionDraft>(
              patchResponse,
              'Update collection draft'
            );
            setCollection(updated);
            appendDeployDebug('Draft metadata synced after deploy submit', {
              attemptId,
              draftId: created.id,
              txId: payload.txId
            });
            setStatus(`Contract deployment submitted: ${payload.txId}`);
          } catch (error) {
            appendDeployDebug('Draft metadata sync failed after deploy submit', {
              attemptId,
              draftId: created.id,
              txId: payload.txId,
              error: toErrorMessage(error)
            });
            setStatus(
              `Contract deployment submitted, but metadata sync failed: ${toManageApiErrorMessage(
                error,
                'unknown error'
              )}`
            );
          } finally {
            setDeployPending(false);
          }
        },
        onCancel: () => {
          appendDeployDebug('Wallet cancelled deploy request or broadcast failed', {
            attemptId,
            hint:
              'Wallet onCancel can represent an explicit cancel or a broadcast failure such as non-JSON node response.'
          });
          setDeployPending(false);
          setStatus(
            'Wallet cancelled deployment or failed to broadcast. Check Deploy debug details below, then retry.'
          );
        }
      }, instrumentedProvider);
    } catch (error) {
      appendDeployDebug('Deploy request failed before wallet open', {
        attemptId,
        error: toErrorMessage(error)
      });
      setDeployPending(false);
      setStatus(toManageApiErrorMessage(error, 'Deploy flow failed.'));
    }
  };

  return (
    <div className="deploy-wizard">
      <p className="deploy-wizard__intro">
        Tell us about your drop. Xtrata handles the contract template, safe defaults,
        and deployment wiring for you.
      </p>
      <p className="meta-value">
        Draft form values auto-save on this browser, so reloads keep your in-progress inputs.
      </p>

      <div className="deploy-wizard__grid">
        <label className="field">
          <span className="field__label info-label">
            Drop name
            <InfoTooltip text="Main title collectors will see across launch pages and listings." />
          </span>
          <input
            className="input"
            value={collectionName}
            placeholder="Neon River Collection"
            onChange={(event) => {
              setCollectionName(event.target.value);
              setStatus(null);
            }}
          />
          <span className="field__hint">This is what collectors will recognize first.</span>
        </label>

        <label className="field">
          <span className="field__label info-label">
            Short ticker
            <InfoTooltip text="Short uppercase label for the collection, similar to a symbol." />
          </span>
          <input
            className="input"
            value={symbol}
            placeholder="NEON"
            onChange={(event) => {
              setSymbolTouched(true);
              setSymbol(event.target.value.toUpperCase());
              setStatus(null);
            }}
          />
          <span className="field__hint">Auto-filled from the name. Change it if you want.</span>
        </label>

        <label className="field field--full">
          <span className="field__label info-label">
            What is this drop about?
            <InfoTooltip text="Short plain-language description to explain the creative concept." />
          </span>
          <textarea
            className="textarea deploy-wizard__description"
            value={description}
            placeholder="One-line summary of your collection."
            onChange={(event) => {
              setDescription(event.target.value);
              setStatus(null);
            }}
          />
          <span className="field__hint">Plain language is best. Keep it short and clear.</span>
        </label>

        <label className="field">
          <span className="field__label info-label">
            Number of editions
            <InfoTooltip text="Maximum count of pieces available in this collection launch." />
          </span>
          <input
            className="input"
            inputMode="numeric"
            value={supply}
            onChange={(event) => {
              setSupply(event.target.value);
              setStatus(null);
            }}
          />
          <span className="field__hint">How many total pieces are available in this drop.</span>
        </label>

        <label className="field">
          <span className="field__label info-label">
            Launch style
            <InfoTooltip text="Standard mint means buyers mint live. Pre-inscribed means buyers purchase already-prepared items." />
          </span>
          <select
            className="select"
            value={mintType}
            onChange={(event) => {
              const next = event.target.value === 'pre-inscribed' ? 'pre-inscribed' : 'standard';
              setMintType(next);
              setStatus(null);
            }}
          >
            <option value="standard">Standard mint (buyers mint live)</option>
            <option value="pre-inscribed">Pre-inscribed sale (buyers purchase ready items)</option>
          </select>
          <span className="field__hint">Choose how buyers get pieces from your collection.</span>
        </label>

        <label className="field">
          <span className="field__label info-label">
            Price per mint (STX)
            <InfoTooltip text="Amount each buyer pays per piece. Use 0 for a free launch." />
          </span>
          <input
            className="input"
            inputMode="decimal"
            value={mintPriceStx}
            onChange={(event) => {
              setMintPriceStx(event.target.value);
              setStatus(null);
            }}
          />
          <span className="field__hint">Set to 0 for a free mint.</span>
        </label>

        {mintType === 'standard' && (
          <label className="field field--full">
            <span className="field__label info-label">
              Parent inscriptions (optional)
              <InfoTooltip text="Token IDs that should be attached as parents to every mint in this collection." />
            </span>
            <textarea
              className="textarea deploy-wizard__description"
              value={parentInscriptions}
              placeholder="12, 144, 2048"
              onChange={(event) => {
                setParentInscriptions(event.target.value);
                setStatus(null);
              }}
            />
            <span className="field__hint">
              Comma, space, or newline separated token IDs. Leave blank for none.
              If set, minting still supports multiple items but each seal is processed one-by-one.
            </span>
          </label>
        )}
        {mintType === 'standard' && parsedParentInput.invalidTokens.length > 0 && (
          <span className="relation-status relation-status--error">
            Invalid parent IDs ignored: {parsedParentInput.invalidTokens.join(', ')}
          </span>
        )}
        {mintType === 'standard' && previewParentIds.length > 0 && (
          <span className="meta-value">
            Resolved parents: {previewParentIds.map((id) => id.toString()).join(', ')}
          </span>
        )}
        {mintType === 'standard' && previewParentIds.length > 0 && (
          <div className="relation-panel">
            <span className="meta-label">Parent thumbnails</span>
            {parentStatusSummary.loading.length > 0 && (
              <span className="meta-value">Loading parent status...</span>
            )}
            {parentStatusSummary.legacyOnly.length > 0 && (
              <span className="relation-status relation-status--warn">
                Needs migration: {parentStatusSummary.legacyOnly.map((id) => id.toString()).join(', ')}
              </span>
            )}
            {parentStatusSummary.missing.length > 0 && (
              <span className="relation-status relation-status--error">
                Missing on-chain: {parentStatusSummary.missing.map((id) => id.toString()).join(', ')}
              </span>
            )}
            {parentStatusSummary.notOwned.length > 0 && (
              <span className="relation-status relation-status--error">
                Not in connected wallet: {parentStatusSummary.notOwned.map((id) => id.toString()).join(', ')}
              </span>
            )}
            <div className="relation-grid">
              {visibleParentItems.map((item) => (
                <div key={item.id.toString()} className="relation-card">
                  <div className="relation-frame">
                    {item.summary ? (
                      <TokenCardMedia
                        token={item.summary}
                        contractId={item.summaryContractId}
                        senderAddress={previewSenderAddress}
                        client={item.summaryClient}
                        isActiveTab
                      />
                    ) : (
                      <span className="relation-placeholder">
                        {item.status === 'loading' ? 'Loading...' : 'No preview'}
                      </span>
                    )}
                  </div>
                  <span className="relation-label">#{item.id.toString()}</span>
                  {item.status === 'owned' && (
                    <span className="relation-status relation-status--ok">Owned</span>
                  )}
                  {item.status === 'not-owned' && (
                    <span className="relation-status relation-status--error">Not in wallet</span>
                  )}
                  {item.status === 'legacy' && (
                    <span className="relation-status relation-status--warn">Legacy only</span>
                  )}
                  {item.status === 'missing' && (
                    <span className="relation-status relation-status--error">Missing</span>
                  )}
                  {item.status === 'loading' && (
                    <span className="relation-status">Checking...</span>
                  )}
                </div>
              ))}
            </div>
            {parentOverflowCount > 0 && (
              <span className="meta-value">+{parentOverflowCount} more parents</span>
            )}
          </div>
        )}

        <label className="field field--full field--address">
          <span className="field__label info-label">
            Artist payout address
            <InfoTooltip text="Wallet receiving the artist share (95%) of primary mint proceeds." />
          </span>
          <input
            className="input input--address-fit"
            value={artistAddress}
            placeholder="SP..."
            onChange={(event) => {
              setArtistAddressTouched(true);
              setArtistAddress(event.target.value.trim().toUpperCase());
              setStatus(null);
            }}
          />
          <span className="field__hint">Defaults to your connected wallet when available.</span>
        </label>

        <label className="field field--full field--address">
          <span className="field__label info-label">
            Marketplace payout address
            <InfoTooltip text="Wallet receiving the marketplace share (2.5%) of primary mint proceeds." />
          </span>
          <input
            className="input input--address-fit"
            value={marketplaceAddress}
            placeholder="SP..."
            onChange={(event) => {
              setMarketplaceAddressTouched(true);
              setMarketplaceAddress(event.target.value.trim().toUpperCase());
              setStatus(null);
            }}
          />
          <span className="field__hint">Set this now so deployment ships with your chosen marketplace.</span>
        </label>
      </div>

      {mintType === 'standard' && parentInscriptions.trim().length > 0 && (
        <div className="alert">
          Parent inscriptions enabled: collectors can still mint multiple items in one flow,
          but final sealing must run one transaction per item so parent links are enforced.
          Begin/upload can still use chunk batching.
        </div>
      )}

      <div className="deploy-wizard__defaults">
        <p className="deploy-wizard__defaults-title">Safe defaults we set for you</p>
        <ul>
          <li>Contract code is locked and generated internally by the app.</li>
          <li>Payout split starts at 95% artist, 2.5% marketplace, 2.5% operator.</li>
          <li>Operator payout address is fixed to Xtrata defaults for this flow.</li>
          <li>Advanced royalty and URI logic is hidden in this beginner flow.</li>
        </ul>
      </div>

      <div className="mint-actions">
        <button
          className="button"
          type="button"
          onClick={handleOpenReview}
          disabled={deployPending}
        >
          {deployPending ? 'Waiting for wallet...' : 'Review deployment'}
        </button>
      </div>

      {status && <p className="meta-value">{status}</p>}

      <div className="deploy-wizard__defaults">
        <p className="deploy-wizard__defaults-title">Deploy debug details</p>
        <ul>
          <li>Clarity version: v{DEPLOY_CLARITY_VERSION} (forced for wallet deploy requests).</li>
          <li>Current wallet network: {preflightSummary.walletNetwork ?? 'not connected'}</li>
          <li>Current wallet address: {preflightSummary.walletAddress ?? 'not connected'}</li>
          <li>Core target: {preflightSummary.coreContractId ?? 'not available'}</li>
          <li>
            Generated source size: {preflightSummary.sourceLengthChars.toString()} chars /{' '}
            {preflightSummary.sourceLengthBytes.toString()} bytes
          </li>
          <li>
            Validation state: {preflightSummary.errors.toString()} errors,{' '}
            {preflightSummary.warnings.toString()} warnings
          </li>
          <li>Latest deploy attempt id: {deployAttemptId ?? 'none yet'}</li>
        </ul>
        {deployDebugLog.length > 0 ? (
          <div className="deploy-log">
            {deployDebugLog.map((entry, index) => (
              <div key={`${entry}-${index}`} className="deploy-log__item">
                {entry}
              </div>
            ))}
          </div>
        ) : (
          <p className="meta-value">No deploy attempts logged in this browser session yet.</p>
        )}
      </div>

      {collection && (
        <div className="deploy-wizard__result">
          <p className="meta-value">
            Draft: {collection.display_name ?? collection.slug} ({collection.id})
          </p>
          <p className="meta-value">
            Contract: {collection.contract_address ?? 'pending deployment'}
          </p>
        </div>
      )}

      {reviewOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="deploy-review-title">
            <div className="modal deploy-wizard-modal">
              <div className="modal__header">
                <div>
                  <h3 className="modal__title" id="deploy-review-title">
                    Review deployment
                  </h3>
                  <p className="meta-value">
                    Final check before wallet confirmation. This deploys your contract but does not publish your drop yet.
                  </p>
                </div>
                <button
                  ref={reviewCloseButtonRef}
                  className="button button--ghost"
                  type="button"
                  onClick={() => setReviewOpen(false)}
                  disabled={deployPending}
                >
                  Close
                </button>
              </div>

              {deployBuild.errors.length > 0 ? (
                <div className="alert">
                  <div>
                    <strong>Fix these fields first:</strong>
                    <ul>
                      {deployBuild.errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="deploy-wizard-modal__summary">
                  <p>
                    <strong>Drop name:</strong> {deployBuild.resolved.collectionName}
                  </p>
                  <p>
                    <strong>Ticker:</strong> {deployBuild.resolved.symbol}
                  </p>
                  <p>
                    <strong>Editions:</strong> {deployBuild.resolved.supply.toString()}
                  </p>
                  <p>
                    <strong>Launch style:</strong>{' '}
                    {deployBuild.resolved.mintType === 'pre-inscribed'
                      ? 'Pre-inscribed sale'
                      : 'Standard mint'}
                  </p>
                  <p>
                    <strong>Price per mint:</strong> {mintPriceStx.trim() || '0'} STX
                  </p>
                  {deployBuild.resolved.mintType === 'standard' && (
                    <p>
                      <strong>Default parent IDs:</strong>{' '}
                      {deployBuild.resolved.defaultDependencyIds.length === 0
                        ? 'None'
                        : deployBuild.resolved.defaultDependencyIds
                            .map((id) => id.toString())
                            .join(', ')}
                    </p>
                  )}
                  {deployBuild.resolved.mintType === 'standard' &&
                    deployBuild.resolved.defaultDependencyIds.length > 0 && (
                      <p className="meta-value">
                        Minting behavior note: batch upload stays available, but seal runs as
                        one transaction per item because parent links require recursive sealing.
                      </p>
                    )}
                  <p>
                    <strong>Core contract:</strong> {coreTarget?.contractId ?? 'Not available'}
                  </p>
                  <p>
                    <strong>Clarity version:</strong> v{DEPLOY_CLARITY_VERSION} (forced)
                  </p>
                  <p>
                    <strong>Artist recipient:</strong>{' '}
                    <span className="address-value--full">
                      {deployBuild.resolved.artistAddress}
                    </span>
                  </p>
                  <p>
                    <strong>Marketplace recipient:</strong>{' '}
                    <span className="address-value--full">
                      {deployBuild.resolved.marketplaceAddress}
                    </span>
                  </p>
                  <p>
                    <strong>Operator recipient (locked):</strong> {deployBuild.resolved.operatorAddress}
                  </p>

                  {deployBuild.warnings.length > 0 && (
                    <div className="alert">
                      <div>
                        {deployBuild.warnings.map((warning) => (
                          <p key={warning}>{warning}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="modal__actions">
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => setReviewOpen(false)}
                  disabled={deployPending}
                >
                  Back
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={handleDeploy}
                  disabled={deployPending || deployBuild.errors.length > 0}
                >
                  {deployPending ? 'Deploying...' : 'Deploy contract'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
