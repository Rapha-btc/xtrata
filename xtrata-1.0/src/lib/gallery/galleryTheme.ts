export const XTRATA_GALLERY_THEME = {
  id: 'xtrata-gallery-default',
  wallBackground:
    'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(241,245,249,0.88))',
  wallFloor:
    'linear-gradient(90deg, rgba(148,163,184,0.16), rgba(15,23,42,0.08), rgba(148,163,184,0.16))',
  frameBorder: 'rgba(15, 23, 42, 0.88)',
  frameMat: 'rgba(248, 250, 252, 0.92)',
  selectedOutline: 'rgba(224, 90, 42, 0.82)',
  labelBackground: 'rgba(15, 23, 42, 0.78)',
  labelColor: '#f8fafc'
} as const;

export type XtrataGalleryTheme = typeof XTRATA_GALLERY_THEME;
