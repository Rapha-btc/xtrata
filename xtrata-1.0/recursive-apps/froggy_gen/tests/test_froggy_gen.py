from __future__ import annotations

import csv
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from froggy_cabinet import build_cabinet_html, load_asset_json, load_collection_rows, validate_rows_against_assets
from froggy_gen import generate_from_csv, should_use_special_image, validate_csv_replay_config


class FroggyGenTests(unittest.TestCase):
    def write_png(self, path: Path, color: tuple[int, int, int, int]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGBA", (8, 8), color).save(path, "PNG")

    def write_csv(self, path: Path) -> None:
        with path.open("w", newline="", encoding="utf-8") as csvfile:
            writer = csv.DictWriter(
                csvfile,
                fieldnames=[
                    "CollectionID",
                    "Background",
                    "Body",
                    "Eyes",
                    "Mouth",
                    "Accessory",
                    "InscriptionID",
                ],
            )
            writer.writeheader()
            writer.writerow(
                {
                    "CollectionID": "1",
                    "Background": "background.png",
                    "Body": "body.png",
                    "Eyes": "eyes.png",
                    "Mouth": "mouth.png",
                    "Accessory": "stripe.png",
                    "InscriptionID": "10065",
                }
            )
            writer.writerow(
                {
                    "CollectionID": "2",
                    "Background": "",
                    "Body": "",
                    "Eyes": "",
                    "Mouth": "",
                    "Accessory": "",
                    "InscriptionID": "10066",
                }
            )

    def make_config(self, root: Path, missing_special_policy: str = "placeholder") -> dict:
        assets = root / "assets"
        return {
            "trait_folders": [
                str(assets / "background"),
                str(assets / "body"),
                str(assets / "eyes"),
                str(assets / "mouth"),
                str(assets / "stripe"),
            ],
            "special_folder": str(assets / "special_1s"),
            "special_interval": 2,
            "special_count": 1,
            "missing_special_policy": missing_special_policy,
            "output_dir": str(root / "output"),
            "combinations_csv": "combinations.csv",
            "gif_preview_count": 2,
            "gif_duration_ms": 50,
        }

    def test_should_use_special_image(self) -> None:
        self.assertIsNone(should_use_special_image(1, 2, 1))
        self.assertEqual(should_use_special_image(2, 2, 1), 1)
        self.assertIsNone(should_use_special_image(4, 2, 1))

    def test_csv_replay_generates_placeholder_for_missing_special(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            self.write_png(root / "assets/background/background.png", (255, 0, 0, 255))
            self.write_png(root / "assets/body/body.png", (0, 255, 0, 255))
            self.write_png(root / "assets/eyes/eyes.png", (0, 0, 255, 128))
            self.write_png(root / "assets/mouth/mouth.png", (255, 255, 0, 128))
            self.write_png(root / "assets/stripe/stripe.png", (0, 0, 0, 0))
            source_csv = root / "combinations.csv"
            self.write_csv(source_csv)

            config = self.make_config(root)
            validate_csv_replay_config(config, source_csv)
            generate_from_csv(config, source_csv)

            self.assertTrue((root / "output/1.png").exists())
            self.assertTrue((root / "output/2.png").exists())
            self.assertTrue((root / "output/combinations.csv").exists())

            with Image.open(root / "output/2.png") as placeholder:
                self.assertEqual(placeholder.size, (8, 8))

    def test_missing_special_can_be_strict_error(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            self.write_png(root / "assets/background/background.png", (255, 0, 0, 255))
            self.write_png(root / "assets/body/body.png", (0, 255, 0, 255))
            self.write_png(root / "assets/eyes/eyes.png", (0, 0, 255, 128))
            self.write_png(root / "assets/mouth/mouth.png", (255, 255, 0, 128))
            self.write_png(root / "assets/stripe/stripe.png", (0, 0, 0, 0))
            source_csv = root / "combinations.csv"
            self.write_csv(source_csv)

            config = self.make_config(root, missing_special_policy="error")
            with self.assertRaises(ValueError):
                validate_csv_replay_config(config, source_csv)

    def test_real_json_assets_cover_full_collection_csv(self) -> None:
        project_root = Path(__file__).resolve().parents[1]
        asset_data = load_asset_json(project_root / "assets/froggy_assets_6x6_layers.json")
        rows = load_collection_rows(project_root / "combinations_froggy.csv")
        config = {
            "special_interval": 200,
            "special_count": 10,
        }

        self.assertEqual(len(rows), 10000)
        self.assertEqual(len(asset_data["assets"]["special_1s"]), 10)
        self.assertEqual(asset_data["assets"]["special_1s"][0]["file"], "special_1s/1.png")
        self.assertEqual(asset_data["assets"]["special_1s"][-1]["file"], "special_1s/10.png")
        validate_rows_against_assets(rows, asset_data, config)

    def test_build_cabinet_html_is_self_contained(self) -> None:
        project_root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as temp_dir:
            output_html = Path(temp_dir) / "cabinet.html"
            config = {
                "special_interval": 200,
                "special_count": 10,
            }

            build_cabinet_html(
                config,
                project_root / "assets/froggy_assets_6x6_layers.json",
                project_root / "combinations_froggy.csv",
                output_html,
            )

            html = output_html.read_text(encoding="utf-8")
            self.assertIn('max="10000"', html)
            self.assertIn('"10000"', html)
            self.assertIn("froggy-assets", html)
            self.assertIn("froggy-rows", html)
            self.assertIn("let currentId = 1", html)
            self.assertIn("input.value.trim() === \"\"", html)
            self.assertIn("syncInput: false", html)
            self.assertNotIn('input.addEventListener("input", () => setCurrent(Number(input.value)))', html)
            self.assertNotIn("<img", html.lower())
            self.assertNotIn("http://", html.lower())
            self.assertNotIn("https://", html.lower())

    def test_build_inline_cabinet_embeds_collection_csv_and_json_assets(self) -> None:
        project_root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as temp_dir:
            output_html = Path(temp_dir) / "cabinet-inline.html"
            config = {
                "special_interval": 200,
                "special_count": 10,
            }

            build_cabinet_html(
                config,
                project_root / "assets/froggy_assets_6x6_layers.json",
                project_root / "combinations_froggy.csv",
                output_html,
                embed_source_csv=True,
            )

            html = output_html.read_text(encoding="utf-8")
            self.assertIn("froggy-assets", html)
            self.assertIn("froggy-collection-csv", html)
            self.assertIn("CollectionID,Background,Body,Eyes,Mouth,Accessory,InscriptionID", html)
            self.assertIn("special_1s/10.png", html)
            self.assertIn("specialNumberForCollectionId", html)
            self.assertIn("assets.palette", html)
            self.assertNotIn("froggy-rows", html)
            self.assertNotIn("<img", html.lower())
            self.assertNotIn("http://", html.lower())
            self.assertNotIn("https://", html.lower())


if __name__ == "__main__":
    unittest.main()
