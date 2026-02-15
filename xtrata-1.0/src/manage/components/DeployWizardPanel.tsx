import { useEffect, useMemo, useState } from 'react';
import { showContractDeploy } from '@stacks/connect';
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
import { toStacksNetwork } from '../../lib/network/stacks';
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
import standardTemplateSource from '../../../contracts/clarinet/contracts/xtrata-collection-mint-v1.1.clar?raw';
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

const buildUniqueSlug = (collectionName: string) => {
  const base = deriveArtistCollectionSlug(collectionName);
  const suffix = Math.random().toString(36).slice(2, 7);
  const maxBaseLength = Math.max(3, 64 - suffix.length - 1);
  return `${base.slice(0, maxBaseLength)}-${suffix}`;
};

const PARENT_THUMBNAIL_LIMIT = 12;

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

  const { walletSession, walletAdapter, connect } = useManageWallet();

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

  const handleOpenReview = () => {
    setStatus(null);
    setReviewOpen(true);
  };

  const handleDeploy = async () => {
    setStatus(null);

    if (deployBuild.errors.length > 0) {
      setStatus(deployBuild.errors[0]);
      return;
    }

    setDeployPending(true);

    let session = walletSession;
    if (!session.address || !session.network) {
      try {
        await connect();
      } catch (error) {
        setDeployPending(false);
        setStatus(error instanceof Error ? error.message : 'Wallet connection failed.');
        return;
      }
      session = walletAdapter.getSession();
    }

    if (!session.address || !session.network) {
      setDeployPending(false);
      setStatus('Connect a wallet to deploy this collection.');
      return;
    }

    const networkCoreTarget = resolveArtistDeployCoreTarget(session.network);
    if (!networkCoreTarget) {
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
      setDeployPending(false);
      setStatus(refreshBuild.errors[0]);
      return;
    }

    const slug = buildUniqueSlug(refreshBuild.resolved.collectionName);
    const templateVersion =
      mintType === 'pre-inscribed'
        ? 'xtrata-preinscribed-collection-sale-v1.0'
        : 'xtrata-collection-mint-v1.1';

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

    let created: CollectionDraft;
    try {
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
      created = await parseManageJsonResponse<CollectionDraft>(
        createResponse,
        'Create collection draft'
      );
      setCollection(created);
    } catch (error) {
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

    setReviewOpen(false);
    setStatus('Open your wallet and approve contract deployment.');

    try {
      showContractDeploy({
        contractName,
        codeBody: refreshBuild.source,
        network: toStacksNetwork(session.network),
        appDetails: {
          name: 'Xtrata Collection Manager'
        },
        onFinish: async (payload) => {
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
            setStatus(`Contract deployment submitted: ${payload.txId}`);
          } catch (error) {
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
          setDeployPending(false);
          setStatus('Deployment cancelled. Your draft is saved and ready to retry.');
        }
      });
    } catch (error) {
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

      {reviewOpen && (
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
        </div>
      )}
    </div>
  );
}
