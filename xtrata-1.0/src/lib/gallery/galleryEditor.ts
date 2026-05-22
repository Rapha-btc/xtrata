import type {
  GalleryItemPosition,
  GalleryLayout,
  GalleryLayoutItem,
  GalleryRoom,
  GalleryWall
} from './gallerySchema';
import { resolveGalleryItemSettings } from './gallerySchema';

export const GALLERY_MIN_DISPLAY_SIZE = 0.45;
export const GALLERY_MAX_DISPLAY_SIZE = 2.4;

export const getGalleryWallLength = (room: GalleryRoom, wall: GalleryWall) =>
  wall === 'east' || wall === 'west' ? room.depth : room.width;

export const clampNumber = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};

export const getGalleryItemSize = (
  layout: GalleryLayout,
  item: GalleryLayoutItem
) => resolveGalleryItemSettings(layout, item).display.size;

export const clampGallerySize = (params: {
  layout: GalleryLayout;
  item: GalleryLayoutItem;
  size: number;
}) => {
  const wallLength = getGalleryWallLength(params.layout.room, params.item.position.wall);
  const roomMax = Math.min(
    GALLERY_MAX_DISPLAY_SIZE,
    Math.max(GALLERY_MIN_DISPLAY_SIZE, wallLength - 0.6),
    Math.max(GALLERY_MIN_DISPLAY_SIZE, params.layout.room.height - 0.4)
  );
  return clampNumber(params.size, GALLERY_MIN_DISPLAY_SIZE, roomMax);
};

export const clampGalleryPosition = (params: {
  layout: GalleryLayout;
  item: GalleryLayoutItem;
  position: GalleryItemPosition;
  size?: number;
}): GalleryItemPosition => {
  const wallLength = getGalleryWallLength(params.layout.room, params.position.wall);
  const size = clampGallerySize({
    layout: params.layout,
    item: {
      ...params.item,
      position: params.position
    },
    size: params.size ?? getGalleryItemSize(params.layout, params.item)
  });
  const sidePadding = Math.min(0.45, Math.max(0.12, wallLength * 0.04));
  const bottomPadding = 0.28;
  const topPadding = 0.14;
  const half = size / 2;
  const minX = -wallLength / 2 + half + sidePadding;
  const maxX = wallLength / 2 - half - sidePadding;
  const minY = half + bottomPadding;
  const maxY = params.layout.room.height - half - topPadding;

  return {
    space: 'wall',
    wall: params.position.wall,
    x: Number(clampNumber(params.position.x, minX, maxX).toFixed(3)),
    y: Number(clampNumber(params.position.y, minY, maxY).toFixed(3)),
    z: Number((Number.isFinite(params.position.z) ? params.position.z : 0).toFixed(3)),
    rotation: Number(
      (Number.isFinite(params.position.rotation) ? params.position.rotation : 0).toFixed(3)
    )
  };
};

export const updateGalleryItemPosition = (
  layout: GalleryLayout,
  itemId: string,
  nextPosition: GalleryItemPosition
): GalleryLayout => ({
  ...layout,
  items: layout.items.map((item) =>
    item.id === itemId
      ? {
          ...item,
          position: clampGalleryPosition({
            layout,
            item,
            position: nextPosition
          })
        }
      : item
  )
});

export const updateGalleryItemSize = (
  layout: GalleryLayout,
  itemId: string,
  nextSize: number
): GalleryLayout => ({
  ...layout,
  items: layout.items.map((item) => {
    if (item.id !== itemId) {
      return item;
    }
    const size = Number(
      clampGallerySize({
        layout,
        item,
        size: nextSize
      }).toFixed(2)
    );
    return {
      ...item,
      display: {
        ...(item.display ?? {}),
        size
      },
      position: clampGalleryPosition({
        layout,
        item,
        position: item.position,
        size
      })
    };
  })
});
