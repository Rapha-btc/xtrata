import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createXtrataClient } from '../lib/contract/client';
import { getContractId } from '../lib/contract/config';
import type { ContractRegistryEntry } from '../lib/contract/registry';
import type { WalletSession } from '../lib/wallet/types';
import type { WalletLookupState } from '../lib/wallet/lookup';
import type { TokenSummary } from '../lib/viewer/types';
import {
  fetchTokenSummary,
  useLastTokenId,
  useTokenSummaries
} from '../lib/viewer/queries';
import { filterTokensByOwner } from '../lib/viewer/ownership';
import { loadWalletHoldingsIndex } from '../lib/viewer/wallet-index';
import { truncateMiddle } from '../lib/utils/format';
import GalleryRenderer from '../components/gallery/galleryRenderer';
import GalleryInspector from '../components/gallery/galleryInspector';
import {
  createAutoGalleryLayout
} from '../lib/gallery/galleryAutoLayout';
import {
  parseGallerySource,
  resolveGalleryMedia
} from '../lib/gallery/galleryMediaResolver';
import {
  createGalleryLayoutStorageKey,
  loadGalleryLayout,
  saveGalleryLayout
} from '../lib/gallery/galleryPersistence';
import {
  parseGalleryLayoutJson,
  serializeGalleryLayout,
  type GalleryItemPosition,
  type GalleryLayout,
  type GalleryWall
} from '../lib/gallery/gallerySchema';
import {
  clampGalleryPosition,
  updateGalleryItemPosition,
  updateGalleryItemSize
} from '../lib/gallery/galleryEditor';

const GALLERY_TOKEN_LIMIT = 200;
const GALLERY_SCAN_LIMIT = 320;

type GalleryScreenProps = {
  contract: ContractRegistryEntry;
  senderAddress: string;
  walletSession: WalletSession;
  walletLookupState: WalletLookupState;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isActiveTab: boolean;
  initialEditMode?: boolean;
  onOpenTokenDetail: (tokenId: bigint) => void;
};

const buildFallbackScanIds = (lastTokenId: bigint | undefined) => {
  if (lastTokenId === undefined) {
    return [] as bigint[];
  }
  const start =
    lastTokenId >= BigInt(GALLERY_SCAN_LIMIT - 1)
      ? lastTokenId - BigInt(GALLERY_SCAN_LIMIT - 1)
      : 0n;
  const ids: bigint[] = [];
  for (let id = start; id <= lastTokenId; id += 1n) {
    ids.push(id);
  }
  return ids;
};

const tokenListSignature = (tokens: TokenSummary[]) =>
  tokens.map((token) => token.id.toString()).join(',');

export default function GalleryScreen(props: GalleryScreenProps) {
  const client = useMemo(
    () => createXtrataClient({ contract: props.contract }),
    [props.contract]
  );
  const contractId = getContractId(props.contract);
  const targetAddress =
    props.walletLookupState.resolvedAddress ?? props.walletSession.address ?? null;
  const [editMode, setEditMode] = useState(() => !!props.initialEditMode);
  const [layout, setLayout] = useState<GalleryLayout | null>(null);
  const [layoutScopeKey, setLayoutScopeKey] = useState<string | null>(null);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [layoutLoadedFromStorage, setLayoutLoadedFromStorage] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [jsonDraft, setJsonDraft] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setEditMode(!!props.initialEditMode);
  }, [props.initialEditMode]);

  const lastTokenQuery = useLastTokenId({
    client,
    senderAddress: props.senderAddress,
    enabled: props.isActiveTab && !props.collapsed && !!targetAddress
  });

  const holdingsIndexQuery = useQuery({
    queryKey: ['gallery', contractId, targetAddress ?? 'none', 'holdings-index'],
    enabled: props.isActiveTab && !props.collapsed && !!targetAddress,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
    queryFn: () => {
      if (!targetAddress) {
        return Promise.resolve(null);
      }
      return loadWalletHoldingsIndex({
        network: props.contract.network,
        walletAddress: targetAddress,
        contractIds: [contractId],
        maxIds: GALLERY_TOKEN_LIMIT
      });
    }
  });

  const candidateTokenIds = useMemo(() => {
    const indexed = holdingsIndexQuery.data?.tokenIds ?? null;
    if (indexed) {
      return indexed.slice(0, GALLERY_TOKEN_LIMIT);
    }
    return buildFallbackScanIds(lastTokenQuery.data).slice(-GALLERY_SCAN_LIMIT);
  }, [holdingsIndexQuery.data?.tokenIds, lastTokenQuery.data]);

  const { tokenIds, tokenQueries } = useTokenSummaries({
    client,
    senderAddress: props.senderAddress,
    tokenIds: candidateTokenIds,
    enabled:
      props.isActiveTab &&
      !props.collapsed &&
      !!targetAddress &&
      candidateTokenIds.length > 0,
    contractIdOverride: contractId,
    fetchSummary: (id) =>
      fetchTokenSummary({
        client,
        id,
        senderAddress: props.senderAddress
      })
  });

  const loadedTokens = useMemo(
    () =>
      tokenQueries
        .map((query, index) => {
          const id = tokenIds[index];
          if (id === undefined || !query.data) {
            return null;
          }
          return query.data;
        })
        .filter((token): token is TokenSummary => !!token),
    [tokenIds, tokenQueries]
  );

  const galleryTokens = useMemo(() => {
    if (!targetAddress) {
      return [] as TokenSummary[];
    }
    if (holdingsIndexQuery.data?.tokenIds) {
      return loadedTokens;
    }
    return filterTokensByOwner(loadedTokens, targetAddress);
  }, [holdingsIndexQuery.data?.tokenIds, loadedTokens, targetAddress]);

  const autoLayout = useMemo(
    () =>
      createAutoGalleryLayout({
        tokens: galleryTokens,
        title: targetAddress
          ? `Xtrata Gallery ${truncateMiddle(targetAddress, 6, 6)}`
          : 'Untitled Xtrata Gallery'
      }),
    [galleryTokens, targetAddress]
  );

  const storageScope = useMemo(
    () => ({
      contractId,
      walletAddress: targetAddress
    }),
    [contractId, targetAddress]
  );
  const storageKey = useMemo(
    () => createGalleryLayoutStorageKey(storageScope),
    [storageScope]
  );

  useEffect(() => {
    const storage =
      typeof window === 'undefined' ? null : window.localStorage;
    const loaded = loadGalleryLayout(storage, storageScope);
    setLayoutScopeKey(storageKey);
    setLayoutDirty(false);
    setSelectedItemId(null);
    if (loaded?.ok) {
      setLayout(loaded.layout);
      setLayoutLoadedFromStorage(true);
      setStatus('Saved gallery layout loaded.');
      return;
    }
    if (loaded && !loaded.ok) {
      setStatus(`Saved layout ignored: ${loaded.errors[0]}`);
    } else {
      setStatus(null);
    }
    setLayout(null);
    setLayoutLoadedFromStorage(false);
  }, [storageKey, storageScope]);

  useEffect(() => {
    if (layoutScopeKey !== storageKey) {
      return;
    }
    if (layoutLoadedFromStorage || layoutDirty) {
      return;
    }
    setLayout(autoLayout);
  }, [
    autoLayout,
    layoutDirty,
    layoutLoadedFromStorage,
    layoutScopeKey,
    storageKey
  ]);

  useEffect(() => {
    if (!layout || layout.items.length === 0) {
      setSelectedItemId(null);
      return;
    }
    if (!selectedItemId || !layout.items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(layout.items[0]?.id ?? null);
    }
  }, [layout, selectedItemId]);

  const tokensById = useMemo(() => {
    const map = new Map<string, TokenSummary>();
    galleryTokens.forEach((token) => {
      map.set(token.id.toString(), token);
    });
    return map;
  }, [galleryTokens]);
  const selectedItem =
    layout?.items.find((item) => item.id === selectedItemId) ?? null;
  const selectedToken = selectedItem
    ? (() => {
        const ref = parseGallerySource(selectedItem.source);
        return ref?.tokenId ? tokensById.get(ref.tokenId.toString()) ?? null : null;
      })()
    : null;
  const selectedMedia = selectedItem
    ? resolveGalleryMedia({ item: selectedItem, token: selectedToken })
    : null;

  const updateLayout = (updater: (current: GalleryLayout) => GalleryLayout) => {
    setLayout((current) => {
      if (!current) {
        return current;
      }
      return updater(current);
    });
    setLayoutDirty(true);
    setStatus(null);
  };

  const handleMoveItem = (itemId: string, position: GalleryItemPosition) => {
    updateLayout((current) => updateGalleryItemPosition(current, itemId, position));
  };

  const handleResizeItem = (itemId: string, size: number) => {
    updateLayout((current) => updateGalleryItemSize(current, itemId, size));
  };

  const handleWallChange = (itemId: string, wall: GalleryWall) => {
    updateLayout((current) => ({
      ...current,
      items: current.items.map((item) => {
        if (item.id !== itemId) {
          return item;
        }
        const nextPosition = clampGalleryPosition({
          layout: current,
          item,
          position: {
            ...item.position,
            wall
          }
        });
        return {
          ...item,
          position: nextPosition
        };
      })
    }));
  };

  const handleSave = () => {
    if (!layout) {
      return;
    }
    const storage =
      typeof window === 'undefined' ? null : window.localStorage;
    const saved = saveGalleryLayout(storage, storageScope, layout);
    setLayoutDirty(!saved);
    setLayoutLoadedFromStorage(saved);
    setStatus(saved ? 'Gallery layout saved.' : 'Local storage is unavailable.');
  };

  const handleReset = () => {
    setLayout(autoLayout);
    setLayoutDirty(true);
    setLayoutLoadedFromStorage(false);
    setSelectedItemId(autoLayout.items[0]?.id ?? null);
    setStatus('Auto-layout reset.');
  };

  const handleExport = () => {
    if (!layout) {
      return;
    }
    setJsonDraft(serializeGalleryLayout(layout));
    setStatus('Layout JSON exported.');
  };

  const handleImport = () => {
    const result = parseGalleryLayoutJson(jsonDraft);
    if (!result.ok) {
      setStatus(`Import failed: ${result.errors[0]}`);
      return;
    }
    setLayout(result.layout);
    setLayoutDirty(true);
    setLayoutLoadedFromStorage(false);
    setSelectedItemId(result.layout.items[0]?.id ?? null);
    setStatus('Layout JSON imported.');
  };

  const loading =
    !!targetAddress &&
    (holdingsIndexQuery.isLoading ||
      lastTokenQuery.isLoading ||
      tokenQueries.some((query) => query.isLoading));
  const tokenCount = galleryTokens.length;
  const tokenSignature = tokenListSignature(galleryTokens);

  return (
    <section
      className={`gallery app-section${props.collapsed ? ' panel--collapsed' : ''}`}
      id="gallery"
      data-token-signature={tokenSignature}
    >
      <div className="panel">
        <div className="panel__header">
          <div>
            <h2>Xtrata Gallery</h2>
            <p>
              {targetAddress
                ? `Viewing ${truncateMiddle(targetAddress, 8, 8)}`
                : 'Connect a wallet or enter a wallet lookup to build a gallery.'}
            </p>
          </div>
          <div className="panel__actions">
            <span className="badge badge--neutral">
              {loading ? 'Loading' : `${tokenCount} items`}
            </span>
            <button
              className={editMode ? 'button' : 'button button--ghost'}
              type="button"
              onClick={() => setEditMode((current) => !current)}
            >
              {editMode ? 'Editing' : 'Edit'}
            </button>
            <button
              className="button button--ghost button--collapse"
              type="button"
              onClick={props.onToggleCollapse}
              aria-expanded={!props.collapsed}
            >
              {props.collapsed ? 'Expand' : 'Collapse'}
            </button>
          </div>
        </div>
        <div className="panel__body gallery-panel__body">
          {status && <p className="gallery-status">{status}</p>}
          {!targetAddress && (
            <div className="alert">
              <div>
                <strong>No wallet selected.</strong> Connect a wallet or use wallet lookup.
              </div>
            </div>
          )}
          {targetAddress && !loading && tokenCount === 0 && (
            <div className="alert">
              <div>
                <strong>No inscriptions found.</strong> This gallery has no frames yet.
              </div>
            </div>
          )}
          {layout && (
            <div className="gallery-workspace">
              <GalleryRenderer
                layout={layout}
                tokens={galleryTokens}
                contractId={contractId}
                senderAddress={props.senderAddress}
                client={client}
                selectedItemId={selectedItemId}
                editMode={editMode}
                isActiveTab={props.isActiveTab && !props.collapsed}
                onSelectItem={setSelectedItemId}
                onMoveItem={handleMoveItem}
                onResizeItem={handleResizeItem}
              />
              <div className="gallery-side">
                <GalleryInspector
                  layout={layout}
                  item={selectedItem}
                  media={selectedMedia}
                  editMode={editMode}
                  onWallChange={handleWallChange}
                  onSizeChange={handleResizeItem}
                  onOpenDetail={props.onOpenTokenDetail}
                />
                <div className="gallery-persistence">
                  <div className="gallery-persistence__actions">
                    <button className="button button--mini" type="button" onClick={handleSave}>
                      {layoutDirty ? 'Save layout' : 'Saved'}
                    </button>
                    <button
                      className="button button--ghost button--mini"
                      type="button"
                      onClick={handleReset}
                    >
                      Reset auto
                    </button>
                    <button
                      className="button button--ghost button--mini"
                      type="button"
                      onClick={handleExport}
                    >
                      Export JSON
                    </button>
                    <button
                      className="button button--ghost button--mini"
                      type="button"
                      onClick={handleImport}
                      disabled={jsonDraft.trim().length === 0}
                    >
                      Import JSON
                    </button>
                  </div>
                  <textarea
                    className="textarea gallery-json"
                    spellCheck={false}
                    value={jsonDraft}
                    onChange={(event) => setJsonDraft(event.target.value)}
                    placeholder="Exported or imported gallery layout JSON"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
