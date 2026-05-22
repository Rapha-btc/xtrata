export const GALLERY_LAYOUT_TYPE = 'xtrata/gallery-layout' as const;
export const GALLERY_LAYOUT_VERSION = '0.1.0' as const;

export type GalleryLayoutType = typeof GALLERY_LAYOUT_TYPE;
export type GalleryLayoutVersion = typeof GALLERY_LAYOUT_VERSION;
export type GalleryWall = 'north' | 'south' | 'east' | 'west';
export type GalleryDisplayShape = 'square';
export type GalleryDisplayFit = 'contain';
export type GalleryDisplayAnchor = 'center';
export type GalleryLabelPosition = 'below';

export type GalleryRoom = {
  type: 'rectangular-room';
  units: 'metres';
  width: number;
  depth: number;
  height: number;
};

export type GalleryDisplayDefaults = {
  shape: GalleryDisplayShape;
  size: number;
  fit: GalleryDisplayFit;
  anchor: GalleryDisplayAnchor;
  background: 'auto' | string;
};

export type GalleryFrameDefaults = {
  style: string;
  padding: number;
  depth: number;
};

export type GalleryLabelDefaults = {
  visible: boolean;
  position: GalleryLabelPosition;
};

export type GalleryLayoutDefaults = {
  display: GalleryDisplayDefaults;
  frame: GalleryFrameDefaults;
  label: GalleryLabelDefaults;
};

export type GalleryItemDisplay = Partial<GalleryDisplayDefaults> & {
  size?: number;
};

export type GalleryItemFrame = Partial<GalleryFrameDefaults>;
export type GalleryItemLabel = Partial<GalleryLabelDefaults>;

export type GalleryItemPosition = {
  space: 'wall';
  wall: GalleryWall;
  x: number;
  y: number;
  z: number;
  rotation: number;
};

export type GalleryLayoutItem = {
  id: string;
  source: string;
  position: GalleryItemPosition;
  display?: GalleryItemDisplay;
  frame?: GalleryItemFrame;
  label?: GalleryItemLabel;
};

export type GalleryLayout = {
  type: GalleryLayoutType;
  version: GalleryLayoutVersion;
  title: string;
  room: GalleryRoom;
  defaults: GalleryLayoutDefaults;
  items: GalleryLayoutItem[];
};

export type GalleryResolvedItemSettings = {
  display: GalleryDisplayDefaults;
  frame: GalleryFrameDefaults;
  label: GalleryLabelDefaults;
};

export type GalleryValidationResult =
  | { ok: true; layout: GalleryLayout; errors: [] }
  | { ok: false; layout: null; errors: string[] };

export const GALLERY_WALLS: GalleryWall[] = ['north', 'south', 'east', 'west'];

export const DEFAULT_GALLERY_ROOM: GalleryRoom = {
  type: 'rectangular-room',
  units: 'metres',
  width: 12,
  depth: 8,
  height: 3.2
};

export const DEFAULT_GALLERY_DEFAULTS: GalleryLayoutDefaults = {
  display: {
    shape: 'square',
    size: 1.2,
    fit: 'contain',
    anchor: 'center',
    background: 'auto'
  },
  frame: {
    style: 'thin-black',
    padding: 0.04,
    depth: 0.03
  },
  label: {
    visible: true,
    position: 'below'
  }
};

export const createEmptyGalleryLayout = (
  title = 'Untitled Xtrata Gallery'
): GalleryLayout => ({
  type: GALLERY_LAYOUT_TYPE,
  version: GALLERY_LAYOUT_VERSION,
  title,
  room: { ...DEFAULT_GALLERY_ROOM },
  defaults: {
    display: { ...DEFAULT_GALLERY_DEFAULTS.display },
    frame: { ...DEFAULT_GALLERY_DEFAULTS.frame },
    label: { ...DEFAULT_GALLERY_DEFAULTS.label }
  },
  items: []
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isPositiveNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value > 0;

const isNonNegativeNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0;

const isGalleryWall = (value: unknown): value is GalleryWall =>
  typeof value === 'string' && GALLERY_WALLS.includes(value as GalleryWall);

const validateDisplay = (
  value: unknown,
  path: string,
  errors: string[],
  options: { partial: boolean }
) => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  if ('width' in value || 'height' in value) {
    errors.push(`${path} must use display.size, not independent width/height.`);
  }
  if ((!options.partial || value.shape !== undefined) && value.shape !== 'square') {
    errors.push(`${path}.shape must be "square".`);
  }
  if ((!options.partial || value.size !== undefined) && !isPositiveNumber(value.size)) {
    errors.push(`${path}.size must be a positive number.`);
  }
  if ((!options.partial || value.fit !== undefined) && value.fit !== 'contain') {
    errors.push(`${path}.fit must be "contain".`);
  }
  if ((!options.partial || value.anchor !== undefined) && value.anchor !== 'center') {
    errors.push(`${path}.anchor must be "center".`);
  }
  if (
    (!options.partial || value.background !== undefined) &&
    typeof value.background !== 'string'
  ) {
    errors.push(`${path}.background must be a string.`);
  }
};

const validateFrame = (
  value: unknown,
  path: string,
  errors: string[],
  options: { partial: boolean }
) => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  if ((!options.partial || value.style !== undefined) && typeof value.style !== 'string') {
    errors.push(`${path}.style must be a string.`);
  }
  if (
    (!options.partial || value.padding !== undefined) &&
    !isNonNegativeNumber(value.padding)
  ) {
    errors.push(`${path}.padding must be a non-negative number.`);
  }
  if ((!options.partial || value.depth !== undefined) && !isNonNegativeNumber(value.depth)) {
    errors.push(`${path}.depth must be a non-negative number.`);
  }
};

const validateLabel = (
  value: unknown,
  path: string,
  errors: string[],
  options: { partial: boolean }
) => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  if ((!options.partial || value.visible !== undefined) && typeof value.visible !== 'boolean') {
    errors.push(`${path}.visible must be a boolean.`);
  }
  if ((!options.partial || value.position !== undefined) && value.position !== 'below') {
    errors.push(`${path}.position must be "below".`);
  }
};

export const validateGalleryLayout = (
  value: unknown
): GalleryValidationResult => {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      layout: null,
      errors: ['Gallery layout must be an object.']
    };
  }

  if (value.type !== GALLERY_LAYOUT_TYPE) {
    errors.push(`type must be "${GALLERY_LAYOUT_TYPE}".`);
  }
  if (value.version !== GALLERY_LAYOUT_VERSION) {
    errors.push(`version must be "${GALLERY_LAYOUT_VERSION}".`);
  }
  if (typeof value.title !== 'string' || value.title.trim().length === 0) {
    errors.push('title must be a non-empty string.');
  }

  const room = value.room;
  if (!isRecord(room)) {
    errors.push('room must be an object.');
  } else {
    if (room.type !== 'rectangular-room') {
      errors.push('room.type must be "rectangular-room".');
    }
    if (room.units !== 'metres') {
      errors.push('room.units must be "metres".');
    }
    if (!isPositiveNumber(room.width)) {
      errors.push('room.width must be a positive number.');
    }
    if (!isPositiveNumber(room.depth)) {
      errors.push('room.depth must be a positive number.');
    }
    if (!isPositiveNumber(room.height)) {
      errors.push('room.height must be a positive number.');
    }
  }

  const defaults = value.defaults;
  if (!isRecord(defaults)) {
    errors.push('defaults must be an object.');
  } else {
    validateDisplay(defaults.display, 'defaults.display', errors, { partial: false });
    validateFrame(defaults.frame, 'defaults.frame', errors, { partial: false });
    validateLabel(defaults.label, 'defaults.label', errors, { partial: false });
  }

  if (!Array.isArray(value.items)) {
    errors.push('items must be an array.');
  } else {
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      const path = `items[${index}]`;
      if (!isRecord(item)) {
        errors.push(`${path} must be an object.`);
        return;
      }
      if (typeof item.id !== 'string' || item.id.trim().length === 0) {
        errors.push(`${path}.id must be a non-empty string.`);
      } else if (seen.has(item.id)) {
        errors.push(`${path}.id must be unique.`);
      } else {
        seen.add(item.id);
      }
      if (typeof item.source !== 'string' || item.source.trim().length === 0) {
        errors.push(`${path}.source must be a non-empty string.`);
      }
      if (!isRecord(item.position)) {
        errors.push(`${path}.position must be an object.`);
      } else {
        const position = item.position;
        if (position.space !== 'wall') {
          errors.push(`${path}.position.space must be "wall".`);
        }
        if (!isGalleryWall(position.wall)) {
          errors.push(`${path}.position.wall must be north, south, east, or west.`);
        }
        if (!isFiniteNumber(position.x)) {
          errors.push(`${path}.position.x must be a finite number.`);
        }
        if (!isFiniteNumber(position.y)) {
          errors.push(`${path}.position.y must be a finite number.`);
        }
        if (!isFiniteNumber(position.z)) {
          errors.push(`${path}.position.z must be a finite number.`);
        }
        if (!isFiniteNumber(position.rotation)) {
          errors.push(`${path}.position.rotation must be a finite number.`);
        }
      }
      if (item.display !== undefined) {
        validateDisplay(item.display, `${path}.display`, errors, { partial: true });
      }
      if (item.frame !== undefined) {
        validateFrame(item.frame, `${path}.frame`, errors, { partial: true });
      }
      if (item.label !== undefined) {
        validateLabel(item.label, `${path}.label`, errors, { partial: true });
      }
    });
  }

  if (errors.length > 0) {
    return { ok: false, layout: null, errors };
  }

  return {
    ok: true,
    layout: value as GalleryLayout,
    errors: []
  };
};

export const parseGalleryLayoutJson = (
  raw: string
): GalleryValidationResult => {
  try {
    return validateGalleryLayout(JSON.parse(raw));
  } catch (error) {
    return {
      ok: false,
      layout: null,
      errors: [
        error instanceof Error
          ? `Invalid JSON: ${error.message}`
          : 'Invalid JSON.'
      ]
    };
  }
};

export const serializeGalleryLayout = (layout: GalleryLayout) =>
  JSON.stringify(layout, null, 2);

export const resolveGalleryItemSettings = (
  layout: GalleryLayout,
  item: GalleryLayoutItem
): GalleryResolvedItemSettings => ({
  display: {
    ...layout.defaults.display,
    ...(item.display ?? {}),
    shape: 'square',
    fit: 'contain',
    anchor: 'center'
  },
  frame: {
    ...layout.defaults.frame,
    ...(item.frame ?? {})
  },
  label: {
    ...layout.defaults.label,
    ...(item.label ?? {})
  }
});
