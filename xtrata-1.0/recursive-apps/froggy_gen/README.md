# Froggys Collection Generator

This is a cleaned and separated version of the original `froggy-gen.py` file.

By default it recreates the collection from `combinations_froggy.csv`, compositing the exact trait filenames in `CollectionID` order. It can also generate a fresh random collection.

## Folder structure

```text
froggy_gen_separated/
  src/
    froggy_gen.py              # Main Python generator
  config/
    froggy_config.json         # Editable generation settings
  assets/
    background/                # Put background PNG traits here
    body/                      # Put body PNG traits here
    eyes/                      # Put eyes PNG traits here
    mouth/                     # Put mouth PNG traits here
    stripe/                    # Put stripe PNG traits here
    special_1s/                # Put 1.png, 2.png, etc. special one-of-ones here
  output/
    final/                     # Preview GIF output location
  combinations_froggy.csv      # Canonical exact recreation map
  docs/
    ORIGINAL_CODE_NOTES.md     # Notes about what changed from the uploaded script
  requirements.txt
  README.md
```

## Install

```bash
python -m venv .venv
source .venv/bin/activate   # Mac/Linux
pip install -r requirements.txt
```

On Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Add the artwork layers

Place PNG files into these folders:

```text
assets/background
assets/body
assets/eyes
assets/mouth
assets/stripe
```

The layer order is controlled in `config/froggy_config.json`. The default order is:

1. background
2. body
3. eyes
4. mouth
5. stripe

Each layer should be the same pixel dimensions and should usually be transparent PNG, except for backgrounds.

## Add special one-of-one images

The original script expected a `1s` folder containing numbered special images such as:

```text
1.png
2.png
3.png
...
10.png
```

In this cleaned version, put these in:

```text
assets/special_1s
```

The canonical CSV uses the numbered special one-of-one images at:

```text
200.png, 400.png, 600.png, ... 2000.png
```

`assets/special_1s/1.png` maps to `CollectionID 200`, `2.png` maps to `400`, and so on through `10.png` at `2000`. The display cabinet embeds these specials as programmatic 6x6 JSON assets, so it does not load those PNG files at runtime.

## Validate and generate the collection

From the project root:

```bash
python src/froggy_gen.py --config config/froggy_config.json --validate-only
python src/froggy_gen.py --config config/froggy_config.json
```

Generated files are written to:

```text
output/1.png
output/2.png
...
output/combinations.csv
output/final/combined_first_20.gif
```

For a quick smoke test without writing all 10,000 files:

```bash
python src/froggy_gen.py --config config/froggy_config.json --limit 25 --output-dir output_smoke
```

Run the automated unit tests:

```bash
python -m unittest discover -s tests
```

## Build the standalone display cabinet

The display cabinet renders Froggys from embedded JSON grids and the canonical CSV. It does not load the generated PNG files at runtime.

```bash
python src/froggy_cabinet.py --config config/froggy_config.json
```

The standalone file is written to:

```text
output/froggy_display_cabinet.html
```

To build the separate inline collection-map version requested for inscription/display testing, run:

```bash
python src/froggy_cabinet.py --config config/froggy_config.json --inline-csv
```

That writes `output/froggy_display_cabinet_inline.html`, embedding `assets/froggy_assets_6x6_layers.json` for programmatic 6x6 layer rendering and `combinations_froggy.csv` as the 10,000-item selector map.

Open that file in a browser and enter any Froggy number from `1` through `10000`. Special 1/1 slots render from the embedded `special_1s` JSON entries.

## Exact recreation vs random generation

Exact recreation uses these config fields:

```json
"mode": "csv_replay",
"source_csv": "combinations_froggy.csv"
```

The CSV columns map to asset folders like this:

```text
Background -> assets/background
Body       -> assets/body
Eyes       -> assets/eyes
Mouth      -> assets/mouth
Accessory  -> assets/stripe
```

To generate a fresh random collection instead:

```bash
python src/froggy_gen.py --config config/froggy_config.json --mode random
```

Set `seed` in `config/froggy_config.json` to a number if you want repeatable random output:

```json
"seed": 12345
```

Leave it as `null` for fresh random output each time.

## What the CSV contains

`combinations_froggy.csv` records `CollectionID`, five trait filenames, and `InscriptionID`. Blank trait rows are special 1/1 slots resolved by interval: `200 -> special_1s/1.png`, `400 -> special_1s/2.png`, and continuing through `2000 -> special_1s/10.png`. During generation, `output/combinations.csv` is written as a copy of the rows that were generated.

## Important limitation

The uploaded file only contained Python code and hard-coded local Windows paths. The normal trait assets, special 1/1 assets, and canonical CSV are now present.
