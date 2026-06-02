"""Froggys collection generator.

Generates layered PNG images from trait folders. The default mode replays the
canonical combinations CSV so normal trait rows keep their original order.
Missing special 1/1 images can be represented by placeholders until final art
arrives. Random generation is still available for producing a fresh collection.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw


DEFAULT_CSV_TRAIT_COLUMNS = ["Background", "Body", "Eyes", "Mouth", "Accessory"]
MISSING_SPECIAL_POLICIES = {"error", "placeholder"}


def load_config(config_path: Path) -> dict:
    with config_path.open("r", encoding="utf-8") as f:
        return json.load(f)


def get_png_files(folder_path: Path) -> list[Path]:
    if not folder_path.exists():
        raise FileNotFoundError(f"Trait folder not found: {folder_path}")
    return sorted(p for p in folder_path.iterdir() if p.suffix.lower() == ".png")


def choose_random_png(folder_path: Path) -> Path | None:
    png_files = get_png_files(folder_path)
    if not png_files:
        return None
    return random.choice(png_files)


def should_use_special_image(index: int, special_interval: int, special_count: int) -> int | None:
    """Return the 1-based special image number to use, or None."""
    if special_interval <= 0 or special_count <= 0:
        return None
    if index % special_interval != 0:
        return None
    special_number = index // special_interval
    if 1 <= special_number <= special_count:
        return special_number
    return None


def get_missing_special_policy(config: dict) -> str:
    policy = str(config.get("missing_special_policy", "error"))
    if policy not in MISSING_SPECIAL_POLICIES:
        raise ValueError(
            "missing_special_policy must be one of: "
            + ", ".join(sorted(MISSING_SPECIAL_POLICIES))
        )
    return policy


def get_reference_image_size(folders: Iterable[Path]) -> tuple[int, int]:
    for folder in folders:
        png_files = get_png_files(folder)
        if not png_files:
            continue
        with Image.open(png_files[0]) as image:
            return image.size
    raise ValueError("Cannot create placeholders because no trait PNGs are available.")


def create_special_placeholder(collection_id: int, special_number: int, size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGBA", size, (245, 245, 245, 255))
    draw = ImageDraw.Draw(image)

    width, height = size
    border_width = max(2, min(width, height) // 96)
    draw.rectangle(
        (0, 0, width - 1, height - 1),
        outline=(180, 0, 120, 255),
        width=border_width,
    )
    draw.line((0, 0, width - 1, height - 1), fill=(180, 0, 120, 255), width=border_width)
    draw.line((0, height - 1, width - 1, 0), fill=(180, 0, 120, 255), width=border_width)

    if width < 96 or height < 64:
        return image

    label = f"SPECIAL 1/1 #{special_number}\nPLACEHOLDER\nCollectionID {collection_id}"
    bbox = draw.multiline_textbbox((0, 0), label, spacing=6)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    text_x = max(0, (width - text_width) // 2)
    text_y = max(0, (height - text_height) // 2)
    draw.multiline_text(
        (text_x, text_y),
        label,
        fill=(60, 60, 60, 255),
        spacing=6,
        align="center",
    )
    return image


def load_special_or_placeholder(
    special_path: Path,
    collection_id: int,
    special_number: int,
    placeholder_size: tuple[int, int],
    missing_special_policy: str,
) -> Image.Image:
    if special_path.exists():
        with Image.open(special_path) as image:
            return image.convert("RGBA")
    if missing_special_policy == "placeholder":
        print(f"Using placeholder for missing special image: {special_path}")
        return create_special_placeholder(collection_id, special_number, placeholder_size)
    raise FileNotFoundError(f"Special image not found: {special_path}")


def composite_layers(layer_paths: Iterable[Path]) -> Image.Image:
    base_image: Image.Image | None = None
    for png_path in layer_paths:
        with Image.open(png_path) as image:
            img = image.convert("RGBA")
        if base_image is None:
            base_image = img
        else:
            if img.size != base_image.size:
                raise ValueError(
                    f"Layer size mismatch: {png_path} is {img.size}, expected {base_image.size}"
                )
            base_image = Image.alpha_composite(base_image, img)
    if base_image is None:
        raise ValueError("No layer images were selected.")
    return base_image


def save_preview_gif(gif_images: list[Image.Image], final_dir: Path, duration_ms: int) -> None:
    if not gif_images:
        return
    final_dir.mkdir(parents=True, exist_ok=True)
    gif_path = final_dir / "combined_first_20.gif"
    gif_images[0].save(
        gif_path,
        save_all=True,
        append_images=gif_images[1:],
        loop=0,
        duration=duration_ms,
    )
    print(f"Saved preview GIF as {gif_path}")


def get_special_numbers(edition_count: int, special_interval: int, special_count: int) -> list[int]:
    special_numbers: list[int] = []
    for index in range(1, edition_count + 1):
        special_number = should_use_special_image(index, special_interval, special_count)
        if special_number is not None:
            special_numbers.append(special_number)
    return special_numbers


def get_csv_trait_mappings(config: dict) -> list[tuple[str, Path]]:
    trait_folders = [Path(p) for p in config["trait_folders"]]
    if len(trait_folders) != len(DEFAULT_CSV_TRAIT_COLUMNS):
        raise ValueError(
            "CSV replay expects five trait folders matching "
            "Background, Body, Eyes, Mouth, Accessory."
        )
    return list(zip(DEFAULT_CSV_TRAIT_COLUMNS, trait_folders))


def load_csv_rows(csv_path: Path, limit: int | None = None) -> tuple[list[str], list[dict[str, str]]]:
    if not csv_path.exists():
        raise FileNotFoundError(f"Combinations CSV not found: {csv_path}")
    with csv_path.open("r", newline="", encoding="utf-8-sig") as csvfile:
        reader = csv.DictReader(csvfile)
        if reader.fieldnames is None:
            raise ValueError(f"Combinations CSV has no header: {csv_path}")
        rows = list(reader)
    if limit is not None:
        rows = rows[:limit]
    return reader.fieldnames, rows


def collect_image_sizes(image_paths: Iterable[Path]) -> dict[Path, tuple[int, int]]:
    sizes: dict[Path, tuple[int, int]] = {}
    for path in sorted(set(image_paths)):
        with Image.open(path) as image:
            sizes[path] = image.size
    return sizes


def validate_shared_dimensions(image_paths: Iterable[Path]) -> list[str]:
    sizes = collect_image_sizes(image_paths)
    if not sizes:
        return []

    first_path, expected_size = next(iter(sizes.items()))
    errors: list[str] = []
    for path, size in sizes.items():
        if size != expected_size:
            errors.append(f"{path} is {size}, expected {expected_size} from {first_path}")
    return errors


def raise_validation_errors(errors: list[str]) -> None:
    if not errors:
        return
    shown_errors = errors[:25]
    hidden_count = len(errors) - len(shown_errors)
    message = "Validation failed:\n- " + "\n- ".join(shown_errors)
    if hidden_count:
        message += f"\n- ...and {hidden_count} more issue(s)"
    raise ValueError(message)


def validate_random_config(config: dict) -> None:
    trait_folders = [Path(p) for p in config["trait_folders"]]
    edition_count = int(config.get("edition_count", 10000))
    special_folder = Path(config.get("special_folder", "")) if config.get("special_folder") else None
    special_interval = int(config.get("special_interval", 200))
    special_count = int(config.get("special_count", 10))
    missing_special_policy = get_missing_special_policy(config)

    errors: list[str] = []
    all_trait_paths: list[Path] = []
    available_combinations = 1

    for folder in trait_folders:
        try:
            png_files = get_png_files(folder)
        except FileNotFoundError as exc:
            errors.append(str(exc))
            continue

        if not png_files:
            errors.append(f"No PNG files found in trait folder: {folder}")
            continue

        available_combinations *= len(png_files)
        all_trait_paths.extend(png_files)

    special_numbers = get_special_numbers(edition_count, special_interval, special_count)
    if special_numbers and special_folder is None:
        errors.append("Special image slots are configured, but special_folder is missing.")
    elif special_folder is not None:
        for special_number in special_numbers:
            special_path = special_folder / f"{special_number}.png"
            if special_path.exists():
                all_trait_paths.append(special_path)
            elif missing_special_policy == "error":
                errors.append(f"Special image not found: {special_path}")

    ordinary_needed = edition_count - len(special_numbers)
    if ordinary_needed > available_combinations:
        errors.append(
            f"edition_count needs {ordinary_needed} unique trait combinations, "
            f"but only {available_combinations} are available."
        )

    if all_trait_paths:
        errors.extend(validate_shared_dimensions(all_trait_paths))

    raise_validation_errors(errors)


def validate_csv_replay_config(
    config: dict,
    source_csv: Path,
    limit: int | None = None,
) -> tuple[list[str], list[dict[str, str]]]:
    fieldnames, rows = load_csv_rows(source_csv, limit)
    mappings = get_csv_trait_mappings(config)
    required_columns = ["CollectionID", *[column for column, _ in mappings], "InscriptionID"]
    special_folder = Path(config.get("special_folder", "")) if config.get("special_folder") else None
    special_interval = int(config.get("special_interval", 200))
    special_count = int(config.get("special_count", 10))
    missing_special_policy = get_missing_special_policy(config)

    errors: list[str] = []
    for column in required_columns:
        if column not in fieldnames:
            errors.append(f"Combinations CSV is missing required column: {column}")
    if errors:
        raise_validation_errors(errors)

    image_paths: list[Path] = []
    seen_collection_ids: set[int] = set()
    seen_inscription_ids: set[str] = set()
    seen_combinations: set[tuple[str, ...]] = set()

    for row_number, row in enumerate(rows, start=1):
        collection_id_text = row.get("CollectionID", "").strip()
        inscription_id = row.get("InscriptionID", "").strip()

        try:
            collection_id = int(collection_id_text)
        except ValueError:
            errors.append(f"Row {row_number} has invalid CollectionID: {collection_id_text!r}")
            continue

        if collection_id in seen_collection_ids:
            errors.append(f"Duplicate CollectionID in CSV: {collection_id}")
        seen_collection_ids.add(collection_id)

        if collection_id != row_number:
            errors.append(f"Row {row_number} has CollectionID {collection_id}; expected {row_number}")

        if not inscription_id:
            errors.append(f"CollectionID {collection_id} has an empty InscriptionID")
        elif inscription_id in seen_inscription_ids:
            errors.append(f"Duplicate InscriptionID in CSV: {inscription_id}")
        seen_inscription_ids.add(inscription_id)

        trait_values = [row.get(column, "").strip() for column, _ in mappings]
        has_blank_trait = any(value == "" for value in trait_values)
        all_blank_traits = all(value == "" for value in trait_values)

        if has_blank_trait and not all_blank_traits:
            errors.append(f"CollectionID {collection_id} has a partially blank trait row")
            continue

        if all_blank_traits:
            special_number = should_use_special_image(collection_id, special_interval, special_count)
            if special_number is None:
                errors.append(f"CollectionID {collection_id} has blank traits but is not a configured special slot")
                continue
            if special_folder is None:
                errors.append(f"CollectionID {collection_id} is special, but special_folder is missing")
                continue
            special_path = special_folder / f"{special_number}.png"
            if special_path.exists():
                image_paths.append(special_path)
            elif missing_special_policy == "error":
                errors.append(f"Special image not found for CollectionID {collection_id}: {special_path}")
            continue

        combination_key = tuple(trait_values)
        if combination_key in seen_combinations:
            errors.append(f"Duplicate trait combination for CollectionID {collection_id}: {combination_key}")
        seen_combinations.add(combination_key)

        for (column, folder), filename in zip(mappings, trait_values):
            trait_path = folder / filename
            if trait_path.exists():
                image_paths.append(trait_path)
            else:
                errors.append(f"Missing {column} asset for CollectionID {collection_id}: {trait_path}")

    if image_paths:
        errors.extend(validate_shared_dimensions(image_paths))

    raise_validation_errors(errors)
    return fieldnames, rows


def generate_from_csv(config: dict, source_csv: Path, limit: int | None = None) -> None:
    fieldnames, rows = validate_csv_replay_config(config, source_csv, limit)
    mappings = get_csv_trait_mappings(config)

    output_dir = Path(config.get("output_dir", "output"))
    final_dir = output_dir / "final"
    output_dir.mkdir(parents=True, exist_ok=True)
    final_dir.mkdir(parents=True, exist_ok=True)

    special_folder = Path(config.get("special_folder", "")) if config.get("special_folder") else None
    special_interval = int(config.get("special_interval", 200))
    special_count = int(config.get("special_count", 10))
    missing_special_policy = get_missing_special_policy(config)
    gif_preview_count = int(config.get("gif_preview_count", 20))
    gif_duration_ms = int(config.get("gif_duration_ms", 500))
    placeholder_size = get_reference_image_size([folder for _, folder in mappings])

    gif_images: list[Image.Image] = []
    csv_path = output_dir / config.get("combinations_csv", "combinations.csv")

    with csv_path.open("w", newline="", encoding="utf-8") as csvfile:
        csv_writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        csv_writer.writeheader()

        for row in rows:
            collection_id = int(row["CollectionID"])
            output_image = output_dir / f"{collection_id}.png"
            trait_values = [row[column].strip() for column, _ in mappings]

            if all(value == "" for value in trait_values):
                special_number = should_use_special_image(collection_id, special_interval, special_count)
                if special_number is None or special_folder is None:
                    raise ValueError(f"Invalid special row for CollectionID {collection_id}")
                special_image_path = special_folder / f"{special_number}.png"
                combined_image = load_special_or_placeholder(
                    special_image_path,
                    collection_id,
                    special_number,
                    placeholder_size,
                    missing_special_policy,
                )
                print(f"Saved special slot {special_number} as {output_image}")
            else:
                selected_layers = [
                    folder / filename
                    for (_, folder), filename in zip(mappings, trait_values)
                ]
                combined_image = composite_layers(selected_layers)
                print(f"Saved CSV replay image as {output_image}")

            combined_image.save(output_image, "PNG")
            csv_writer.writerow(row)

            if len(gif_images) < gif_preview_count:
                gif_images.append(combined_image.copy())

    save_preview_gif(gif_images, final_dir, gif_duration_ms)
    print(f"Saved replay CSV as {csv_path}")


def generate_random_collection(config: dict) -> None:
    validate_random_config(config)

    seed = config.get("seed")
    if seed is not None:
        random.seed(seed)

    output_dir = Path(config.get("output_dir", "output"))
    final_dir = output_dir / "final"
    output_dir.mkdir(parents=True, exist_ok=True)
    final_dir.mkdir(parents=True, exist_ok=True)

    trait_folders = [Path(p) for p in config["trait_folders"]]
    special_folder = Path(config.get("special_folder", "")) if config.get("special_folder") else None
    special_interval = int(config.get("special_interval", 200))
    special_count = int(config.get("special_count", 10))
    edition_count = int(config.get("edition_count", 10000))
    gif_preview_count = int(config.get("gif_preview_count", 20))
    gif_duration_ms = int(config.get("gif_duration_ms", 500))
    max_duplicate_attempts = int(config.get("max_duplicate_attempts", 10000))
    missing_special_policy = get_missing_special_policy(config)
    placeholder_size = get_reference_image_size(trait_folders)

    used_combinations: set[tuple[str, ...]] = set()
    gif_images: list[Image.Image] = []

    csv_path = output_dir / config.get("combinations_csv", "combinations.csv")
    with csv_path.open("w", newline="", encoding="utf-8") as csvfile:
        csv_writer = csv.writer(csvfile)
        csv_writer.writerow([folder.name for folder in trait_folders])

        for index in range(1, edition_count + 1):
            output_image = output_dir / f"{index}.png"

            special_number = should_use_special_image(index, special_interval, special_count)
            if special_number is not None and special_folder is not None:
                special_image_path = special_folder / f"{special_number}.png"
                special_image = load_special_or_placeholder(
                    special_image_path,
                    index,
                    special_number,
                    placeholder_size,
                    missing_special_policy,
                )
                special_image.save(output_image, "PNG")
                csv_writer.writerow([f"SPECIAL_1_OF_1_{special_number}"])
                if len(gif_images) < gif_preview_count:
                    gif_images.append(special_image.copy())
                print(f"Saved special slot {special_number} as {output_image}")
                continue

            attempts = 0
            while True:
                attempts += 1
                if attempts > max_duplicate_attempts:
                    raise RuntimeError(
                        "Could not find a new unique trait combination after "
                        f"{max_duplicate_attempts} attempts."
                    )
                selected_layers: list[Path] = []
                selected_names: list[str] = []
                for folder in trait_folders:
                    selected = choose_random_png(folder)
                    if selected is None:
                        raise FileNotFoundError(f"No PNG files found in trait folder: {folder}")
                    selected_layers.append(selected)
                    selected_names.append(selected.name)

                combination_key = tuple(selected_names)
                if combination_key not in used_combinations:
                    break

            combined_image = composite_layers(selected_layers)
            combined_image.save(output_image, "PNG")
            used_combinations.add(combination_key)
            csv_writer.writerow(selected_names)

            if len(gif_images) < gif_preview_count:
                gif_images.append(combined_image.copy())

            print(f"Saved combined image as {output_image}")

    save_preview_gif(gif_images, final_dir, gif_duration_ms)


def resolve_mode(config: dict, cli_mode: str | None) -> str:
    if cli_mode is not None:
        return cli_mode
    if config.get("mode"):
        return str(config["mode"])
    if config.get("source_csv"):
        return "csv_replay"
    return "random"


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate the Froggys image collection.")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("config/froggy_config.json"),
        help="Path to the JSON config file.",
    )
    parser.add_argument(
        "--mode",
        choices=["csv_replay", "random"],
        help="Generation mode. Defaults to config mode, then csv_replay if source_csv is set.",
    )
    parser.add_argument(
        "--source-csv",
        type=Path,
        help="Canonical combinations CSV to replay in csv_replay mode.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Override the configured output directory.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Generate or validate only the first N CSV rows. Useful for smoke tests.",
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Validate configuration, assets, and CSV without writing images.",
    )
    args = parser.parse_args()

    try:
        config = load_config(args.config)
        if args.output_dir is not None:
            config["output_dir"] = str(args.output_dir)
        if args.source_csv is not None:
            config["source_csv"] = str(args.source_csv)

        mode = resolve_mode(config, args.mode)
        if args.limit is not None and args.limit <= 0:
            raise ValueError("--limit must be greater than zero.")

        if mode == "csv_replay":
            source_csv = Path(config.get("source_csv", "combinations_froggy.csv"))
            if args.validate_only:
                validate_csv_replay_config(config, source_csv, args.limit)
                print(f"Validation passed for CSV replay: {source_csv}")
            else:
                generate_from_csv(config, source_csv, args.limit)
        elif mode == "random":
            if args.validate_only:
                validate_random_config(config)
                print("Validation passed for random generation.")
            else:
                generate_random_collection(config)
        else:
            raise ValueError(f"Unknown generation mode: {mode}")
    except (FileNotFoundError, RuntimeError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
