# Froggys Collection Generator

This is a cleaned and separated version of the original `froggy-gen.py` file.

It generates a PNG collection by randomly selecting one transparent PNG from each trait folder and compositing them in order.

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

By default, a special image is inserted every 200 editions, up to 10 specials. So the default specials appear at:

```text
200.png, 400.png, 600.png, ... 2000.png
```

You can change this in `config/froggy_config.json`.

## Generate the collection

From the project root:

```bash
python src/froggy_gen.py --config config/froggy_config.json
```

Generated files will be written to:

```text
output/1.png
output/2.png
...
output/combinations.csv
output/final/combined_first_20.gif
```

## Reproducible generation

Set `seed` in `config/froggy_config.json` to a number if you want repeatable random output:

```json
"seed": 12345
```

Leave it as `null` for fresh random output each time.

## What the CSV contains

`output/combinations.csv` records which trait PNG files were used for each generated image. This helps you reproduce or audit each edition.

Special one-of-one rows are marked like:

```text
SPECIAL_1_OF_1_1
```

## Important limitation

The uploaded file only contained Python code and hard-coded local Windows paths. It did not contain the actual artwork PNG trait files, metadata files, or any finished image outputs. Those assets need to be added into the `assets/` folders before the generator can run successfully.
