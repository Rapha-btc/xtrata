import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from 'react';
import type { XtrataClient } from '../../lib/contract/client';
import type { TokenSummary } from '../../lib/viewer/types';
import TokenCardMedia from '../TokenCardMedia';
import {
  getGalleryItemSize,
  getGalleryWallLength
} from '../../lib/gallery/galleryEditor';
import {
  GALLERY_WALLS,
  resolveGalleryItemSettings,
  type GalleryItemPosition,
  type GalleryLayout,
  type GalleryLayoutItem,
  type GalleryWall
} from '../../lib/gallery/gallerySchema';
import {
  parseGallerySource,
  resolveGalleryMedia,
  type GalleryMedia
} from '../../lib/gallery/galleryMediaResolver';

type GalleryRendererProps = {
  layout: GalleryLayout;
  tokens: TokenSummary[];
  contractId: string;
  senderAddress: string;
  client: XtrataClient;
  selectedItemId: string | null;
  editMode: boolean;
  isActiveTab: boolean;
  onSelectItem: (itemId: string) => void;
  onMoveItem: (itemId: string, position: GalleryItemPosition) => void;
  onResizeItem: (itemId: string, size: number) => void;
};

type InteractionState = {
  type: 'move' | 'resize';
  item: GalleryLayoutItem;
  wall: GalleryWall;
  rect: DOMRect;
  wallLength: number;
  startX: number;
  startY: number;
  startSize: number;
};

const VISUAL_MEDIA_KINDS = new Set(['image', 'gif', 'video']);

const wallLabel: Record<GalleryWall, string> = {
  north: 'North',
  south: 'South',
  east: 'East',
  west: 'West'
};

const GalleryFallbackCard = (props: { media: GalleryMedia }) => {
  const label =
    props.media.kind === 'unknown'
      ? 'DATA'
      : props.media.kind.toUpperCase();
  return (
    <div className={`gallery-fallback gallery-fallback--${props.media.kind}`}>
      <span className="gallery-fallback__badge">{label}</span>
      <span className="gallery-fallback__title">{props.media.title}</span>
      <span className="gallery-fallback__meta">{props.media.subtitle}</span>
    </div>
  );
};

export default function GalleryRenderer(props: GalleryRendererProps) {
  const interactionRef = useRef<InteractionState | null>(null);
  const roomHeight = props.layout.room.height;
  const onMoveItem = props.onMoveItem;
  const onResizeItem = props.onResizeItem;
  const tokensById = useMemo(() => {
    const map = new Map<string, TokenSummary>();
    props.tokens.forEach((token) => {
      map.set(token.id.toString(), token);
    });
    return map;
  }, [props.tokens]);

  const getTokenForItem = (item: GalleryLayoutItem) => {
    const sourceRef = parseGallerySource(item.source);
    if (!sourceRef?.tokenId) {
      return null;
    }
    return tokensById.get(sourceRef.tokenId.toString()) ?? null;
  };

  useEffect(() => {
    if (!props.editMode) {
      interactionRef.current = null;
    }
  }, [props.editMode]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) {
        return;
      }
      event.preventDefault();
      if (interaction.type === 'move') {
        const xRatio = (event.clientX - interaction.rect.left) / interaction.rect.width;
        const yRatio = (interaction.rect.bottom - event.clientY) / interaction.rect.height;
        onMoveItem(interaction.item.id, {
          ...interaction.item.position,
          wall: interaction.wall,
          x: xRatio * interaction.wallLength - interaction.wallLength / 2,
          y: yRatio * roomHeight
        });
        return;
      }
      const horizontalDelta =
        ((event.clientX - interaction.startX) / interaction.rect.width) *
        interaction.wallLength;
      const verticalDelta =
        ((interaction.startY - event.clientY) / interaction.rect.height) *
        roomHeight;
      onResizeItem(
        interaction.item.id,
        interaction.startSize + Math.max(horizontalDelta, verticalDelta)
      );
    };

    const handlePointerUp = () => {
      interactionRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [onMoveItem, onResizeItem, roomHeight]);

  const startInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    item: GalleryLayoutItem,
    type: InteractionState['type']
  ) => {
    if (!props.editMode || event.button !== 0) {
      return;
    }
    const wallElement = event.currentTarget.closest<HTMLElement>('[data-gallery-wall]');
    if (!wallElement) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    props.onSelectItem(item.id);
    const wall = item.position.wall;
    interactionRef.current = {
      type,
      item,
      wall,
      rect: wallElement.getBoundingClientRect(),
      wallLength: getGalleryWallLength(props.layout.room, wall),
      startX: event.clientX,
      startY: event.clientY,
      startSize: getGalleryItemSize(props.layout, item)
    };
  };

  const renderItem = (item: GalleryLayoutItem) => {
    const wallLength = getGalleryWallLength(props.layout.room, item.position.wall);
    const settings = resolveGalleryItemSettings(props.layout, item);
    const size = settings.display.size;
    const token = getTokenForItem(item);
    const media = resolveGalleryMedia({ item, token });
    const left = ((item.position.x + wallLength / 2) / wallLength) * 100;
    const bottom = (item.position.y / props.layout.room.height) * 100;
    const width = (size / wallLength) * 100;
    const itemStyle = {
      left: `${left}%`,
      bottom: `${bottom}%`,
      width: `${width}%`
    } as CSSProperties;
    const selected = props.selectedItemId === item.id;
    const canUseMediaComponent =
      !!token && VISUAL_MEDIA_KINDS.has(media.kind);

    return (
      <button
        key={item.id}
        type="button"
        className={`gallery-frame${selected ? ' gallery-frame--selected' : ''}${
          props.editMode ? ' gallery-frame--editable' : ''
        }`}
        style={itemStyle}
        onClick={() => props.onSelectItem(item.id)}
        onPointerDown={(event) => startInteraction(event, item, 'move')}
        aria-label={`Select ${media.title}`}
      >
        <span className={`gallery-frame__canvas gallery-frame__canvas--${settings.frame.style}`}>
          <span className="gallery-frame__mat">
            {canUseMediaComponent ? (
              <span className="gallery-frame__media token-card__media">
                <TokenCardMedia
                  token={token}
                  contractId={props.contractId}
                  senderAddress={props.senderAddress}
                  client={props.client}
                  isActiveTab={props.isActiveTab}
                  letterboxNonSquare
                />
              </span>
            ) : (
              <GalleryFallbackCard media={media} />
            )}
          </span>
        </span>
        {settings.label.visible && (
          <span className="gallery-frame__label">
            {media.tokenId !== null ? `#${media.tokenId.toString()}` : media.id}
          </span>
        )}
        {props.editMode && selected && (
          <span
            className="gallery-frame__resize"
            role="presentation"
            onPointerDown={(event) => startInteraction(event, item, 'resize')}
          />
        )}
      </button>
    );
  };

  return (
    <div className="gallery-room" aria-label="Xtrata gallery room">
      {GALLERY_WALLS.map((wall) => {
        const wallLength = getGalleryWallLength(props.layout.room, wall);
        const wallStyle = {
          '--gallery-wall-ratio': `${wallLength} / ${props.layout.room.height}`
        } as CSSProperties;
        const items = props.layout.items.filter((item) => item.position.wall === wall);
        return (
          <section
            key={wall}
            className={`gallery-wall gallery-wall--${wall}`}
            data-gallery-wall={wall}
            style={wallStyle}
            aria-label={`${wallLabel[wall]} wall`}
          >
            <div className="gallery-wall__header">
              <span>{wallLabel[wall]}</span>
              <span>{items.length}</span>
            </div>
            <div className="gallery-wall__surface">
              {items.map((item) => renderItem(item))}
            </div>
            <div className="gallery-wall__floor" aria-hidden="true" />
          </section>
        );
      })}
    </div>
  );
}
