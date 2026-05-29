# Repository Guidelines

## Project Structure & Module Organization

- `src/froggy_gen.py` is the main command-line generator.
- `config/froggy_config.json` controls edition count, trait order, special 1/1 cadence, outputs, preview GIF settings, and optional seed.
- `assets/` contains trait PNG folders: `background/`, `body/`, `eyes/`, `mouth/`, `stripe/`, and optional `special_1s/`.
- `combinations_froggy.csv` is the canonical recreation map: `CollectionID`, trait PNG names, and `InscriptionID`.
- `assets/froggy_assets_6x6_layers.json` is the display cabinet grid source.
- `output/` contains generated PNGs and preview GIFs under `output/final/`.

Keep source, configuration, assets, and generated output separated. Do not hard-code local absolute paths.

## Build, Test, and Development Commands

Create and activate a virtual environment:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Run the generator from the project root:

```bash
python src/froggy_gen.py --config config/froggy_config.json
```

Quick syntax check:

```bash
python -m compileall src
```

Use a small temporary `edition_count` while testing random generation changes.

Build the cabinet:

```bash
python src/froggy_cabinet.py --config config/froggy_config.json
```

## Coding Style & Naming Conventions

Use Python 3 style with 4-space indentation, practical type hints, and `pathlib.Path`. Use `snake_case` for functions, variables, config keys, and helpers.

Trait folder names should match config entries exactly. CSV columns map as `Background -> assets/background`, `Body -> assets/body`, `Eyes -> assets/eyes`, `Mouth -> assets/mouth`, and `Accessory -> assets/stripe`.

## Exact Collection Recreation

Do not rely on `seed` or random generation to reproduce the original 10,000-item collection. Replay `combinations_froggy.csv` in `CollectionID` order. Blank trait rows at IDs `200, 400, ..., 2000` are reserved special 1/1 slots. Until `assets/special_1s/1.png` through `10.png` arrive, use `missing_special_policy: "placeholder"` and keep `InscriptionID` unchanged.

For browser display without PNG runtime assets, build `output/froggy_display_cabinet.html`; it must accept IDs `1` through `10000`.

## Testing Guidelines

Unit tests live under `tests/` and run with `python -m unittest discover -s tests`. For code changes, also run `python -m compileall src` and a small generation smoke test.

Check generated output manually for layer order, image dimensions, CSV rows, and preview GIF creation.

## Commit & Pull Request Guidelines

Recent history uses short, direct commit messages, for example `Added Froggy folder to repo`. Keep subjects concise and specific: `Add config validation` or `Fix special image lookup`.

Pull requests should describe the change, list commands run, and note generated assets or output changes.

## Agent-Specific Instructions

Before changing code, read `../../docs/app-reference.md` for root project constraints. Preserve config-driven behavior and avoid introducing network calls or dependencies beyond those justified in `requirements.txt`.
