# Sampler Wave

This directory holds the experimental second-wave sampler release track for BVST. It is intentionally separate from the frozen first-wave `53`-artifact inscription bundle.

## Included

- `assets/audio/`: deterministic reference WAV leaves for SamplerLab
- `schemas/`: sample-source manifest schema
- `manifests/sources/`: recursive sample-source manifest templates
- `catalogs/`: source, plugin-release, family, and release catalogs for the sampler track
- `batches/`: proposed dependency-safe execution order for the sampler wave
- `configs/`: runtime, template, and synthetic token maps
- `verification/`: generated metadata, rendered-index, and validation reports

## Commands

From the repo root:

```bash
npm run bvst:refresh:samplerwave
npm run bvst:test:samplervalidate
npm run bvst:render:samplerwave
npm run bvst:test:samplerwave
```

Use `bvst:test:samplervalidate` for non-browser structural checks and synthetic render validation. Use `bvst:test:samplerwave` for the dedicated browser smoke against `SamplerLab`.
