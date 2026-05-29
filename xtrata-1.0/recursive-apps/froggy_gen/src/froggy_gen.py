"""Froggys collection generator.

Generates layered PNG images from trait folders, writes a CSV record of trait
combinations, optionally inserts numbered special 1/1 images, and creates a
preview GIF from the first generated outputs.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
from pathlib import Path
from typing import Iterable

from PIL import Image


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


def composite_layers(layer_paths: Iterable[Path]) -> Image.Image:
    base_image: Image.Image | None = None
    for png_path in layer_paths:
        img = Image.open(png_path).convert("RGBA")
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


def generate_collection(config: dict) -> None:
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
                if not special_image_path.exists():
                    raise FileNotFoundError(f"Special image not found: {special_image_path}")
                special_image = Image.open(special_image_path).convert("RGBA")
                special_image.save(output_image, "PNG")
                csv_writer.writerow([f"SPECIAL_1_OF_1_{special_number}"])
                if len(gif_images) < gif_preview_count:
                    gif_images.append(special_image.copy())
                print(f"Saved special image {special_number} as {output_image}")
                continue

            while True:
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

    if gif_images:
        gif_path = final_dir / "combined_first_20.gif"
        gif_images[0].save(
            gif_path,
            save_all=True,
            append_images=gif_images[1:],
            loop=0,
            duration=gif_duration_ms,
        )
        print(f"Saved preview GIF as {gif_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate the Froggys image collection.")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("config/froggy_config.json"),
        help="Path to the JSON config file.",
    )
    args = parser.parse_args()
    generate_collection(load_config(args.config))


if __name__ == "__main__":
    main()
