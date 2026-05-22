import type { TokenSummary } from '../viewer/types';
import {
  createEmptyGalleryLayout,
  DEFAULT_GALLERY_DEFAULTS,
  type GalleryItemPosition,
  type GalleryLayout,
  type GalleryLayoutDefaults,
  type GalleryRoom,
  type GalleryWall
} from './gallerySchema';
import {
  clampGalleryPosition,
  getGalleryWallLength
} from './galleryEditor';

const WALL_ORDER: GalleryWall[] = ['north', 'south', 'east', 'west'];
const DEFAULT_ITEM_SPACING = 0.16;
const SIDE_MARGIN = 0.45;
const BOTTOM_MARGIN = 0.45;
const TOP_MARGIN = 0.15;

export const createGallerySourceForToken = (token: Pick<TokenSummary, 'id'>) =>
  `xtrata://${token.id.toString()}`;

export const createGalleryItemId = (
  token: Pick<TokenSummary, 'id'>,
  index: number
) => `item-${String(index + 1).padStart(3, '0')}-${token.id.toString()}`;

type WallSlot = {
  wall: GalleryWall;
  x: number;
  y: number;
};

const createWallSlots = (params: {
  room: GalleryRoom;
  wall: GalleryWall;
  size: number;
  spacing: number;
}) => {
  const length = getGalleryWallLength(params.room, params.wall);
  const step = params.size + params.spacing;
  const columns = Math.max(
    1,
    Math.floor((length - SIDE_MARGIN * 2 - params.size) / step) + 1
  );
  const rows = Math.max(
    1,
    Math.floor(
      (params.room.height - BOTTOM_MARGIN - TOP_MARGIN - params.size) / step
    ) + 1
  );
  const slots: WallSlot[] = [];
  for (let row = 0; row < rows; row += 1) {
    const y = BOTTOM_MARGIN + params.size / 2 + row * step;
    for (let column = 0; column < columns; column += 1) {
      const x =
        -length / 2 +
        SIDE_MARGIN +
        params.size / 2 +
        column * step;
      slots.push({
        wall: params.wall,
        x: Number(x.toFixed(3)),
        y: Number(y.toFixed(3))
      });
    }
  }
  return slots;
};

export const createGalleryAutoLayoutSlots = (params: {
  room?: GalleryRoom;
  size?: number;
  spacing?: number;
}) => {
  const room = params.room ?? createEmptyGalleryLayout().room;
  const size = params.size ?? DEFAULT_GALLERY_DEFAULTS.display.size;
  const spacing = params.spacing ?? DEFAULT_ITEM_SPACING;
  const slotsByWall = WALL_ORDER.map((wall) =>
    createWallSlots({ room, wall, size, spacing })
  );
  const longest = Math.max(...slotsByWall.map((slots) => slots.length));
  const distributed: WallSlot[] = [];
  for (let index = 0; index < longest; index += 1) {
    for (const slots of slotsByWall) {
      const slot = slots[index];
      if (slot) {
        distributed.push(slot);
      }
    }
  }
  return distributed;
};

export const createAutoGalleryLayout = (params: {
  tokens: TokenSummary[];
  title?: string;
  room?: GalleryRoom;
  defaults?: GalleryLayoutDefaults;
}): GalleryLayout => {
  const layout = createEmptyGalleryLayout(params.title);
  layout.room = params.room ? { ...params.room } : layout.room;
  layout.defaults = params.defaults
    ? {
        display: { ...params.defaults.display },
        frame: { ...params.defaults.frame },
        label: { ...params.defaults.label }
      }
    : layout.defaults;

  const size = layout.defaults.display.size;
  const slots = createGalleryAutoLayoutSlots({
    room: layout.room,
    size
  });
  layout.items = params.tokens.map((token, index) => {
    const slot = slots[index % slots.length] ?? {
      wall: 'north' as const,
      x: 0,
      y: layout.room.height / 2
    };
    const position: GalleryItemPosition = {
      space: 'wall',
      wall: slot.wall,
      x: slot.x,
      y: slot.y,
      z: Math.floor(index / Math.max(slots.length, 1)) * 0.01,
      rotation: 0
    };
    const item = {
      id: createGalleryItemId(token, index),
      source: createGallerySourceForToken(token),
      position,
      display: {
        size
      }
    };
    return {
      ...item,
      position: clampGalleryPosition({
        layout,
        item,
        position
      })
    };
  });

  return layout;
};
