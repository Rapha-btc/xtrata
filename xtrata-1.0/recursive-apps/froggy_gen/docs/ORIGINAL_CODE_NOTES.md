# Original Code Notes

The uploaded `froggy-gen.py` file contained one Python script with hard-coded Windows paths and a few syntax/runtime issues.

## Extracted/separated components

- Main generator code moved to `src/froggy_gen.py`
- Configuration moved to `config/froggy_config.json`
- Trait layer folders separated under `assets/`
- Special one-of-one folder separated as `assets/special_1s/`
- Output files separated under `output/`
- Dependencies separated into `requirements.txt`
- Usage and regeneration instructions separated into `README.md`
- Canonical collection replay added through `combinations_froggy.csv`
- Standalone HTML display cabinet added through `src/froggy_cabinet.py`

## Original trait folders

The original script referenced these local folders:

```text
C:\Users\pikap\My Drive\various\NFT\Ordinals\Froggys\background
C:\Users\pikap\My Drive\various\NFT\Ordinals\Froggys\body
C:\Users\pikap\My Drive\various\NFT\Ordinals\Froggys\eyes
C:\Users\pikap\My Drive\various\NFT\Ordinals\Froggys\mouth
C:\Users\pikap\My Drive\various\NFT\Ordinals\Froggys\stripe
C:\Users\pikap\My Drive\various\NFT\Ordinals\Froggys\1s
```

These were converted into portable relative paths in `config/froggy_config.json`.

## Issues fixed from original script

1. Several plain-English lines were not commented, which made the file invalid Python:

```text
List of folders containing PNG files
Special folder for specific images
Keep track of used combinations
List to store images for the GIF
Open CSV file for writing
Create a GIF from the first 20 images
```

2. The function `combine_pngs_to_single_image()` used `i`, but `i` was not passed into the function. The cleaned version passes the generation index properly through the main loop logic.

3. Windows paths used backslashes that could be interpreted as escape sequences. The cleaned version uses relative paths through `pathlib.Path`.

4. The original script tried to save the GIF into a `final` folder but did not create that folder. The cleaned version creates output folders automatically.

5. The original script had no config file, README, requirements file, or project structure.

6. The original duplicate-combination loop could keep retrying indefinitely if the requested collection size exceeded the number of possible trait combinations. The cleaned version validates available combinations before random generation and has a retry limit.

7. The original script wrote blank CSV rows for special 1/1 images. The cleaned version treats blank rows in `combinations_froggy.csv` as numbered special slots: `200 -> special_1s/1.png`, `400 -> special_1s/2.png`, and continuing through `2000 -> special_1s/10.png`.

## Behaviour preserved

- Replays exact trait selections from `combinations_froggy.csv` by default.
- Randomly selects one PNG from each trait folder when run with `--mode random`.
- Composites layers using alpha transparency.
- Prevents duplicate trait combinations.
- Writes a combinations CSV.
- Creates a GIF preview from the first generated images.
- Inserts special numbered images at regular intervals, with placeholders still available only for missing special files in placeholder mode.
- Builds a self-contained display cabinet from JSON layer grids, embedded special 1/1 grids, and the canonical CSV.
