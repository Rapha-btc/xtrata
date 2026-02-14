import { useEffect, useMemo, useState } from 'react';
import { showContractDeploy } from '@stacks/connect';
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

export default function DeployWizardPanel() {
  const [collectionName, setCollectionName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [symbolTouched, setSymbolTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [supply, setSupply] = useState('1000');
  const [mintPriceStx, setMintPriceStx] = useState('0');
  const [mintType, setMintType] = useState<ArtistMintType>('standard');
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
        mintPriceMicroStx: refreshBuild.resolved.mintPriceMicroStx.toString()
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

        <label className="field">
          <span className="field__label info-label">
            Artist payout address
            <InfoTooltip text="Wallet receiving the artist share (95%) of primary mint proceeds." />
          </span>
          <input
            className="input"
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

        <label className="field">
          <span className="field__label info-label">
            Marketplace payout address
            <InfoTooltip text="Wallet receiving the marketplace share (2.5%) of primary mint proceeds." />
          </span>
          <input
            className="input"
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
                <p>
                  <strong>Core contract:</strong> {coreTarget?.contractId ?? 'Not available'}
                </p>
                <p>
                  <strong>Artist recipient:</strong> {deployBuild.resolved.artistAddress}
                </p>
                <p>
                  <strong>Marketplace recipient:</strong> {deployBuild.resolved.marketplaceAddress}
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
