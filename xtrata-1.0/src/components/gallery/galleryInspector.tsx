import type { GalleryLayout, GalleryLayoutItem, GalleryWall } from '../../lib/gallery/gallerySchema';
import {
  GALLERY_WALLS,
  resolveGalleryItemSettings
} from '../../lib/gallery/gallerySchema';
import {
  GALLERY_MAX_DISPLAY_SIZE,
  GALLERY_MIN_DISPLAY_SIZE
} from '../../lib/gallery/galleryEditor';
import type { GalleryMedia } from '../../lib/gallery/galleryMediaResolver';
import { formatBytes, truncateMiddle } from '../../lib/utils/format';

type GalleryInspectorProps = {
  layout: GalleryLayout;
  item: GalleryLayoutItem | null;
  media: GalleryMedia | null;
  editMode: boolean;
  onWallChange: (itemId: string, wall: GalleryWall) => void;
  onSizeChange: (itemId: string, size: number) => void;
  onOpenDetail: (tokenId: bigint) => void;
};

export default function GalleryInspector(props: GalleryInspectorProps) {
  if (!props.item || !props.media) {
    return (
      <aside className="gallery-inspector">
        <div>
          <h3>Inspector</h3>
          <p>Select a frame to inspect its source and layout settings.</p>
        </div>
      </aside>
    );
  }

  const settings = resolveGalleryItemSettings(props.layout, props.item);
  const token = props.media.token;
  const totalSize = token?.meta?.totalSize ?? null;

  return (
    <aside className="gallery-inspector">
      <div className="gallery-inspector__header">
        <div>
          <h3>{props.media.title}</h3>
          <p>{props.media.subtitle}</p>
        </div>
        {props.media.tokenId !== null && (
          <button
            className="button button--mini"
            type="button"
            onClick={() => props.onOpenDetail(props.media.tokenId!)}
          >
            Open in viewer
          </button>
        )}
      </div>

      <div className="meta-grid gallery-inspector__meta">
        <div>
          <span className="meta-label">Source</span>
          <span className="meta-value" title={props.item.source}>
            {truncateMiddle(props.item.source, 18, 12)}
          </span>
        </div>
        <div>
          <span className="meta-label">Type</span>
          <span className="meta-value">{props.media.kind}</span>
        </div>
        <div>
          <span className="meta-label">Size</span>
          <span className="meta-value">
            {totalSize !== null ? formatBytes(totalSize) : 'Unknown'}
          </span>
        </div>
        <div>
          <span className="meta-label">Wall</span>
          <span className="meta-value">{props.item.position.wall}</span>
        </div>
        <div>
          <span className="meta-label">Position</span>
          <span className="meta-value">
            x {props.item.position.x.toFixed(2)} / y {props.item.position.y.toFixed(2)}
          </span>
        </div>
        <div>
          <span className="meta-label">Frame</span>
          <span className="meta-value">{settings.frame.style}</span>
        </div>
      </div>

      {props.editMode && (
        <div className="gallery-inspector__controls">
          <label className="field">
            <span className="field__label">Wall</span>
            <select
              className="select"
              value={props.item.position.wall}
              onChange={(event) =>
                props.onWallChange(props.item!.id, event.target.value as GalleryWall)
              }
            >
              {GALLERY_WALLS.map((wall) => (
                <option key={wall} value={wall}>
                  {wall}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Frame size</span>
            <input
              className="input"
              type="range"
              min={GALLERY_MIN_DISPLAY_SIZE}
              max={GALLERY_MAX_DISPLAY_SIZE}
              step="0.05"
              value={settings.display.size}
              onChange={(event) =>
                props.onSizeChange(props.item!.id, Number(event.target.value))
              }
            />
            <span className="meta-value">{settings.display.size.toFixed(2)} metres</span>
          </label>
        </div>
      )}
    </aside>
  );
}
