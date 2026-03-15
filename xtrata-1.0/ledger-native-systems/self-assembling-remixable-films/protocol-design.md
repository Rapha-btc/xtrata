# Protocol Design

## Core objects

- `scene-object`: immutable scene or shot asset with contributor metadata
- `timeline-layer`: soundtrack cue, subtitle pack, VFX overlay, or edit annotation
- `cut-manifest`: ordered timeline graph referencing scenes and layers
- `release-policy`: distribution and rights settings for a specific cut
- `restoration-record`: record of cleanup, remastering, translation, or accessibility work

## Potential protocol rules

- timeline references should support exact ranges rather than only whole-asset inclusion
- cut manifests should separate narrative ordering from media payload metadata
- release policies should support territory, format, and remix permissions
- restoration work should be referenceable without rewriting original scene objects

## Bitcoin / Stacks / Xtrata fit

- Bitcoin or Xtrata recursive objects can hold manifests, edit lists, and smaller media assets
- Stacks contracts can coordinate licensing, cut registration, and revenue routing
- indexers can assemble playback-ready timelines and show scene-level ancestry
