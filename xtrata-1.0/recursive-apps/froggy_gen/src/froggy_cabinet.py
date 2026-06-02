"""Build a standalone HTML display cabinet for the Froggys collection.

The cabinet embeds JSON layer assets and the canonical collection CSV mapping,
then renders each requested Froggy on a canvas without loading PNG files.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
from pathlib import Path


CSV_COLUMNS = ["CollectionID", "Background", "Body", "Eyes", "Mouth", "Accessory", "InscriptionID"]
TRAIT_LAYER_MAP = {
    "background": "Background",
    "body": "Body",
    "eyes": "Eyes",
    "mouth": "Mouth",
    "stripe": "Accessory",
}
CANONICAL_LAYER_ORDER = ["background", "body", "eyes", "mouth", "stripe"]
SPECIAL_LAYER = "special_1s"
DEFAULT_ASSET_JSON = Path("assets/froggy_assets_6x6_layers.json")
DEFAULT_OUTPUT_HTML = Path("output/froggy_display_cabinet.html")
DEFAULT_INLINE_OUTPUT_HTML = Path("output/froggy_display_cabinet_inline.html")


def load_config(config_path: Path) -> dict:
    with config_path.open("r", encoding="utf-8") as f:
        return json.load(f)


def load_asset_json(asset_json_path: Path) -> dict:
    if not asset_json_path.exists():
        raise FileNotFoundError(f"Asset JSON not found: {asset_json_path}")
    with asset_json_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    if data.get("schema") != "froggy-6x6-assets.v1":
        raise ValueError(f"Unsupported asset JSON schema: {data.get('schema')}")
    grid = data.get("grid", {})
    if grid.get("width") != 6 or grid.get("height") != 6:
        raise ValueError("Cabinet expects 6x6 asset grids.")
    for layer in CANONICAL_LAYER_ORDER:
        if layer not in data.get("assets", {}):
            raise ValueError(f"Asset JSON is missing layer: {layer}")
    return data


def load_collection_rows(source_csv: Path) -> list[dict[str, str]]:
    if not source_csv.exists():
        raise FileNotFoundError(f"Collection CSV not found: {source_csv}")

    with source_csv.open("r", newline="", encoding="utf-8-sig") as csvfile:
        reader = csv.DictReader(csvfile)
        if reader.fieldnames is None:
            raise ValueError(f"Collection CSV has no header: {source_csv}")
        missing = [column for column in CSV_COLUMNS if column not in reader.fieldnames]
        if missing:
            raise ValueError(f"Collection CSV is missing columns: {', '.join(missing)}")
        rows = [{column: row.get(column, "").strip() for column in CSV_COLUMNS} for row in reader]

    if len(rows) != 10000:
        raise ValueError(f"Expected 10000 collection rows, found {len(rows)}")

    seen_ids: set[int] = set()
    for expected_id, row in enumerate(rows, start=1):
        try:
            collection_id = int(row["CollectionID"])
        except ValueError as exc:
            raise ValueError(f"Invalid CollectionID at row {expected_id}: {row['CollectionID']!r}") from exc

        if collection_id != expected_id:
            raise ValueError(f"Expected CollectionID {expected_id}, found {collection_id}")
        if collection_id in seen_ids:
            raise ValueError(f"Duplicate CollectionID: {collection_id}")
        seen_ids.add(collection_id)
        if not row["InscriptionID"]:
            raise ValueError(f"CollectionID {collection_id} has no InscriptionID")

    return rows


def asset_file_names_by_layer(asset_data: dict) -> dict[str, set[str]]:
    names_by_layer: dict[str, set[str]] = {}
    for layer, assets in asset_data["assets"].items():
        names_by_layer[layer] = {Path(asset["file"]).name for asset in assets}
    return names_by_layer


def special_number_for_collection_id(collection_id: int, interval: int, count: int) -> int | None:
    if interval <= 0 or count <= 0 or collection_id % interval != 0:
        return None
    special_number = collection_id // interval
    if 1 <= special_number <= count:
        return special_number
    return None


def validate_rows_against_assets(rows: list[dict[str, str]], asset_data: dict, config: dict) -> None:
    names_by_layer = asset_file_names_by_layer(asset_data)
    interval = int(config.get("special_interval", 200))
    count = int(config.get("special_count", 10))
    errors: list[str] = []

    for row in rows:
        collection_id = int(row["CollectionID"])
        trait_values = [row[column] for column in TRAIT_LAYER_MAP.values()]
        has_blank = any(value == "" for value in trait_values)
        all_blank = all(value == "" for value in trait_values)

        if has_blank and not all_blank:
            errors.append(f"CollectionID {collection_id} has a partially blank trait row")
            continue

        if all_blank:
            special_number = special_number_for_collection_id(collection_id, interval, count)
            if special_number is None:
                errors.append(f"CollectionID {collection_id} is blank but not a configured special slot")
                continue
            special_filename = f"{special_number}.png"
            if special_filename not in names_by_layer.get(SPECIAL_LAYER, set()):
                errors.append(
                    f"CollectionID {collection_id} missing special JSON asset: "
                    f"{SPECIAL_LAYER}/{special_filename}"
                )
            continue

        for layer, column in TRAIT_LAYER_MAP.items():
            filename = row[column]
            if filename not in names_by_layer[layer]:
                errors.append(f"CollectionID {collection_id} missing {column} JSON asset: {filename}")

    if errors:
        shown_errors = errors[:25]
        hidden_count = len(errors) - len(shown_errors)
        message = "Cabinet validation failed:\n- " + "\n- ".join(shown_errors)
        if hidden_count:
            message += f"\n- ...and {hidden_count} more issue(s)"
        raise ValueError(message)


def rows_for_html(rows: list[dict[str, str]]) -> list[list[str]]:
    return [[row[column] for column in CSV_COLUMNS] for row in rows]


def compact_json(data: object) -> str:
    return json.dumps(data, ensure_ascii=True, separators=(",", ":"))


def script_text_payload(text: str) -> str:
    return text.replace("</script", "<\\/script")


def standard_data_payload(asset_data: dict, rows: list[dict[str, str]]) -> tuple[str, str]:
    rows_json = compact_json(rows_for_html(rows))
    assets_json = compact_json(asset_data)

    payload = f"""<script id="froggy-assets" type="application/json">{assets_json}</script>
<script id="froggy-rows" type="application/json">{rows_json}</script>"""
    loader = """  const assets = JSON.parse(document.getElementById("froggy-assets").textContent);
  const rowArrays = JSON.parse(document.getElementById("froggy-rows").textContent);
  const rows = rowArrays.map((values) => Object.fromEntries(columns.map((column, index) => [column, values[index] || ""])));
  const palette = new Map(assets.palette.map((entry) => [entry.hex, entry.rgba]));
  const assetsByLayer = new Map();
  for (const [layer, items] of Object.entries(assets.assets)) {
    const byFile = new Map();
    for (const item of items) {
      byFile.set(item.file.split("/").pop(), item);
    }
    assetsByLayer.set(layer, byFile);
  }"""
    return payload, loader


def inline_csv_data_payload(asset_data: dict, source_csv: Path) -> tuple[str, str]:
    assets_json = compact_json(asset_data)
    collection_csv = script_text_payload(source_csv.read_text(encoding="utf-8-sig"))

    payload = f"""<script id="froggy-assets" type="application/json">{assets_json}</script>
<script id="froggy-collection-csv" type="text/plain">{collection_csv}</script>"""
    loader = r'''  function parseCsv(csvText) {
    const records = [];
    let row = [];
    let value = "";
    let inQuotes = false;

    for (let index = 0; index < csvText.length; index += 1) {
      const character = csvText[index];
      const nextCharacter = csvText[index + 1];

      if (inQuotes) {
        if (character === '"' && nextCharacter === '"') {
          value += '"';
          index += 1;
        } else if (character === '"') {
          inQuotes = false;
        } else {
          value += character;
        }
        continue;
      }

      if (character === '"') {
        inQuotes = true;
      } else if (character === ",") {
        row.push(value);
        value = "";
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && nextCharacter === "\n") {
          index += 1;
        }
        row.push(value);
        records.push(row);
        row = [];
        value = "";
      } else {
        value += character;
      }
    }

    if (value || row.length) {
      row.push(value);
      records.push(row);
    }

    return records;
  }

  function objectFromCsvRow(header, values) {
    return Object.fromEntries(header.map((column, index) => [column, values[index] || ""]));
  }

  function requireColumns(header, expectedColumns, label) {
    const missing = expectedColumns.filter((column) => !header.includes(column));
    if (missing.length) {
      throw new Error(`${label} is missing column(s): ${missing.join(", ")}`);
    }
  }

  function parsedCsvBlock(id) {
    return parseCsv(document.getElementById(id).textContent.replace(/^\uFEFF/, ""))
      .filter((values) => values.length > 1 || values[0]);
  }

  const collectionRecords = parsedCsvBlock("froggy-collection-csv");
  const collectionHeader = collectionRecords.shift();
  requireColumns(collectionHeader, columns, "Embedded collection CSV");
  const rows = collectionRecords.map((values) => objectFromCsvRow(collectionHeader, values));

  const assets = JSON.parse(document.getElementById("froggy-assets").textContent);
  const palette = new Map();
  for (const entry of assets.palette) {
    palette.set(entry.hex, entry.rgba);
  }
  const assetsByLayer = new Map();
  for (const [layer, items] of Object.entries(assets.assets)) {
    const byFile = new Map();
    for (const item of items) {
      byFile.set(item.file.split("/").pop(), item);
    }
    assetsByLayer.set(layer, byFile);
  }'''
    return payload, loader


def html_template(
    config: dict,
    asset_data: dict,
    rows: list[dict[str, str]],
    source_csv: Path,
    *,
    embed_source_csv: bool = False,
) -> str:
    data_payload, data_loader = (
        inline_csv_data_payload(asset_data, source_csv)
        if embed_source_csv
        else standard_data_payload(asset_data, rows)
    )
    source_name = html.escape(str(source_csv))
    source_description = (
        "Embedded JSON layer assets and collection CSV from"
        if embed_source_csv
        else "Embedded JSON assets and collection map from"
    )

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Froggy Display Cabinet</title>
<style>
:root {{
  color-scheme: light;
  --ink: #161616;
  --muted: #5f6368;
  --line: #d8d6cf;
  --paper: #f8f7f2;
  --panel: #ffffff;
  --accent: #237a4b;
  --accent-dark: #155c37;
  --warning: #a11d6d;
}}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; min-height: 100%; }}
body {{
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--paper);
  color: var(--ink);
}}
main {{
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(260px, 380px) minmax(320px, 1fr);
  gap: 0;
}}
.control-band {{
  border-right: 1px solid var(--line);
  background: var(--panel);
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}}
h1 {{
  margin: 0;
  font-size: 26px;
  line-height: 1.1;
  font-weight: 750;
  letter-spacing: 0;
}}
.source {{
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.45;
}}
.picker {{
  display: grid;
  gap: 8px;
}}
label {{
  font-size: 13px;
  color: var(--muted);
}}
.number-row {{
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  gap: 8px;
  align-items: center;
}}
input {{
  width: 100%;
  height: 44px;
  border: 1px solid var(--line);
  border-radius: 6px;
  font: inherit;
  font-size: 18px;
  padding: 8px 10px;
  color: var(--ink);
  background: #fff;
}}
button {{
  height: 44px;
  border: 1px solid var(--line);
  border-radius: 6px;
  font: inherit;
  font-weight: 700;
  color: var(--ink);
  background: #fff;
  cursor: pointer;
}}
button:hover, button:focus-visible {{
  border-color: var(--accent);
  color: var(--accent-dark);
  outline: none;
}}
.jump-row {{
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}}
.meta {{
  display: grid;
  gap: 10px;
  padding-top: 4px;
}}
.meta-row {{
  display: grid;
  grid-template-columns: 98px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  font-size: 14px;
  line-height: 1.35;
}}
.meta-row span:first-child {{
  color: var(--muted);
}}
.meta-row span:last-child {{
  overflow-wrap: anywhere;
}}
.status {{
  min-height: 20px;
  color: var(--warning);
  font-size: 13px;
  line-height: 1.4;
}}
.display-band {{
  display: grid;
  place-items: center;
  padding: 28px;
}}
.canvas-wrap {{
  width: min(78vh, 84vw, 640px);
  aspect-ratio: 1;
  display: grid;
  place-items: center;
}}
canvas {{
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  border: 1px solid var(--line);
  background: #fff;
}}
body.seed-mode {{
  overflow: hidden;
  background: #fff;
}}
body.seed-mode main {{
  min-height: 100vh;
  grid-template-columns: 1fr;
}}
body.seed-mode .control-band {{
  display: none;
}}
body.seed-mode .display-band {{
  min-height: 100vh;
  padding: 0;
}}
body.seed-mode .canvas-wrap {{
  width: min(100vw, 100vh);
}}
body.seed-mode canvas {{
  border: 0;
  background: transparent;
}}
@media (max-width: 760px) {{
  main {{ grid-template-columns: 1fr; }}
  .control-band {{ border-right: 0; border-bottom: 1px solid var(--line); padding: 20px; }}
  .display-band {{ padding: 20px; }}
  .canvas-wrap {{ width: min(92vw, 520px); }}
}}
</style>
</head>
<body>
<main>
  <section class="control-band">
    <div>
      <h1>Froggy Display Cabinet</h1>
      <p class="source">{source_description} {source_name}</p>
    </div>
    <div class="picker">
      <label for="froggy-number">Froggy number</label>
      <div class="number-row">
        <button id="prev" type="button" aria-label="Previous Froggy">&lt;</button>
        <input id="froggy-number" type="number" min="1" max="10000" step="1" value="1" inputmode="numeric">
        <button id="next" type="button" aria-label="Next Froggy">&gt;</button>
      </div>
    </div>
    <div class="jump-row">
      <button id="first" type="button">First</button>
      <button id="last" type="button">Last</button>
    </div>
    <div class="meta" id="meta"></div>
    <div class="status" id="status" role="status" aria-live="polite"></div>
  </section>
  <section class="display-band" aria-label="Rendered Froggy">
    <div class="canvas-wrap">
      <canvas id="froggy-canvas" width="6" height="6"></canvas>
    </div>
  </section>
</main>
{data_payload}
<script>
(() => {{
  "use strict";

  const columns = {compact_json(CSV_COLUMNS)};
  const layerFields = {compact_json(TRAIT_LAYER_MAP)};
  const layerOrder = {compact_json(CANONICAL_LAYER_ORDER)};
  const specialLayer = {compact_json(SPECIAL_LAYER)};
  const specialInterval = {int(config.get("special_interval", 200))};
  const specialCount = {int(config.get("special_count", 10))};
{data_loader}
  const rowsById = new Map(rows.map((row) => [Number(row.CollectionID), row]));
  const canvas = document.getElementById("froggy-canvas");
  const context = canvas.getContext("2d", {{ alpha: true }});
  const input = document.getElementById("froggy-number");
  const meta = document.getElementById("meta");
  const status = document.getElementById("status");
  const maxId = rows.length;
  let currentId = 1;

  function seedFromLocation() {{
    const searchParams = new URLSearchParams(window.location.search);
    for (const key of ["seed", "id", "froggy"]) {{
      const parsed = parseSeedValue(searchParams.get(key));
      if (parsed !== null) return parsed;
    }}

    const hash = window.location.hash.replace(/^#/, "").trim();
    const hashSeed = hash.includes("=")
      ? new URLSearchParams(hash).get("seed") || new URLSearchParams(hash).get("id") || new URLSearchParams(hash).get("froggy")
      : hash;
    const parsedHash = parseSeedValue(hashSeed);
    if (parsedHash !== null) return parsedHash;

    const fileName = window.location.pathname.split("/").pop() || "";
    const match = fileName.match(/^(\\d{{1,5}})\\.html?$/);
    return match ? parseSeedValue(match[1]) : null;
  }}

  function parseSeedValue(value) {{
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    if (!/^\\d+$/.test(text)) return null;
    const parsed = Number.parseInt(text, 10);
    if (parsed < 1 || parsed > maxId) return null;
    return parsed;
  }}

  const seedId = seedFromLocation();
  const seedMode = seedId !== null;
  if (seedMode) {{
    document.body.classList.add("seed-mode");
    document.title = `Froggy #${{seedId}}`;
  }}

  function rgbaFor(color) {{
    if (palette.has(color)) return palette.get(color);
    if (color.startsWith("#") && color.length === 7) {{
      return [
        Number.parseInt(color.slice(1, 3), 16),
        Number.parseInt(color.slice(3, 5), 16),
        Number.parseInt(color.slice(5, 7), 16),
        255
      ];
    }}
    return [0, 0, 0, 0];
  }}

  function putPixel(data, x, y, rgba) {{
    const offset = (y * canvas.width + x) * 4;
    data[offset] = rgba[0];
    data[offset + 1] = rgba[1];
    data[offset + 2] = rgba[2];
    data[offset + 3] = rgba[3];
  }}

  function drawAsset(imageData, asset) {{
    for (const group of asset.pixels) {{
      const rgba = rgbaFor(group.color);
      if (rgba[3] === 0) continue;
      for (const position of group.positions) {{
        putPixel(imageData.data, position[0], position[1], rgba);
      }}
    }}
  }}

  function drawSpecialPlaceholder(imageData) {{
    const base = [245, 245, 245, 255];
    const mark = [180, 0, 120, 255];
    if (canvas.width < 96 || canvas.height < 64) {{
      for (let y = 0; y < canvas.height; y += 1) {{
        for (let x = 0; x < canvas.width; x += 1) {{
          putPixel(imageData.data, x, y, mark);
        }}
      }}
      return;
    }}
    for (let y = 0; y < canvas.height; y += 1) {{
      for (let x = 0; x < canvas.width; x += 1) {{
        putPixel(imageData.data, x, y, base);
      }}
    }}
    for (let i = 0; i < canvas.width; i += 1) {{
      putPixel(imageData.data, i, 0, mark);
      putPixel(imageData.data, i, canvas.height - 1, mark);
      putPixel(imageData.data, 0, i, mark);
      putPixel(imageData.data, canvas.width - 1, i, mark);
      putPixel(imageData.data, i, i, mark);
      putPixel(imageData.data, i, canvas.height - 1 - i, mark);
    }}
  }}

  function specialNumberForCollectionId(collectionId) {{
    if (specialInterval <= 0 || specialCount <= 0 || collectionId % specialInterval !== 0) return null;
    const specialNumber = collectionId / specialInterval;
    if (specialNumber < 1 || specialNumber > specialCount) return null;
    return specialNumber;
  }}

  function assetForLayer(layer, filename) {{
    return assetsByLayer.get(layer)?.get(filename) || null;
  }}

  function escapeHtml(value) {{
    return String(value).replace(/[&<>"']/g, (character) => ({{
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\\"": "&quot;",
      "'": "&#39;"
    }}[character]));
  }}

  function renderMeta(row, specialAssetName) {{
    const traitRows = specialAssetName
      ? [["Special 1/1", specialAssetName]]
      : [
          ["Background", row.Background],
          ["Body", row.Body],
          ["Eyes", row.Eyes],
          ["Mouth", row.Mouth],
          ["Accessory", row.Accessory]
        ];
    const rowsHtml = [
      ["Collection", row.CollectionID],
      ["Inscription", row.InscriptionID],
      ...traitRows
    ].map(([label, value]) => `<div class="meta-row"><span>${{escapeHtml(label)}}</span><span>${{escapeHtml(value)}}</span></div>`);
    meta.innerHTML = rowsHtml.join("");
  }}

  function clampId(value) {{
    const parsedId = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsedId)) return currentId;
    return Math.min(maxId, Math.max(1, parsedId));
  }}

  function render(collectionId, options = {{}}) {{
    const {{ syncInput = true }} = options;
    const clampedId = clampId(collectionId);
    const row = rowsById.get(clampedId);
    currentId = clampedId;
    if (syncInput) input.value = String(clampedId);
    status.textContent = "";

    const imageData = context.createImageData(canvas.width, canvas.height);
    const isSpecial = !row.Background && !row.Body && !row.Eyes && !row.Mouth && !row.Accessory;
    let specialAssetName = "";

    if (isSpecial) {{
      const specialNumber = specialNumberForCollectionId(Number(row.CollectionID));
      specialAssetName = specialNumber ? `${{specialNumber}}.png` : "";
      const asset = specialAssetName ? assetForLayer(specialLayer, specialAssetName) : null;
      if (asset) {{
        drawAsset(imageData, asset);
      }} else {{
        drawSpecialPlaceholder(imageData);
        status.textContent = `Missing JSON asset for special slot ${{row.CollectionID}}: ${{specialLayer}}/${{specialAssetName || "unknown"}}`;
      }}
    }} else {{
      for (const layer of layerOrder) {{
        const field = layerFields[layer];
        const filename = row[field];
        const asset = assetForLayer(layer, filename);
        if (!asset) {{
          status.textContent = `Missing JSON asset for ${{field}}: ${{filename}}`;
          continue;
        }}
        drawAsset(imageData, asset);
      }}
    }}

    context.putImageData(imageData, 0, 0);
    renderMeta(row, specialAssetName);
  }}

  function setCurrent(nextId, options = {{}}) {{
    render(nextId, options);
  }}

  function commitInput() {{
    if (input.value.trim() === "") {{
      setCurrent(currentId);
      return;
    }}
    setCurrent(input.value);
  }}

  input.addEventListener("input", () => {{
    const rawValue = input.value.trim();
    if (rawValue === "") {{
      status.textContent = "";
      return;
    }}

    const parsedId = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsedId)) {{
      status.textContent = `Enter a Froggy number from 1 to ${{maxId}}.`;
      return;
    }}

    if (parsedId < 1 || parsedId > maxId) {{
      status.textContent = `Enter a Froggy number from 1 to ${{maxId}}.`;
      return;
    }}

    setCurrent(parsedId, {{ syncInput: false }});
  }});
  input.addEventListener("keydown", (event) => {{
    if (event.key === "Enter") {{
      event.preventDefault();
      commitInput();
    }}
  }});
  input.addEventListener("blur", commitInput);
  document.getElementById("prev").addEventListener("click", () => setCurrent(currentId - 1));
  document.getElementById("next").addEventListener("click", () => setCurrent(currentId + 1));
  document.getElementById("first").addEventListener("click", () => setCurrent(1));
  document.getElementById("last").addEventListener("click", () => setCurrent(maxId));
  render(seedMode ? seedId : 1);
}})();
</script>
</body>
</html>
"""


def build_cabinet_html(
    config: dict,
    asset_json_path: Path,
    source_csv: Path,
    output_html: Path,
    *,
    embed_source_csv: bool = False,
) -> None:
    asset_data = load_asset_json(asset_json_path)
    rows = load_collection_rows(source_csv)
    validate_rows_against_assets(rows, asset_data, config)

    output_html.parent.mkdir(parents=True, exist_ok=True)
    output_html.write_text(
        html_template(config, asset_data, rows, source_csv, embed_source_csv=embed_source_csv),
        encoding="utf-8",
    )
    print(f"Saved Froggy display cabinet as {output_html}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the standalone Froggy display cabinet HTML.")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("config/froggy_config.json"),
        help="Path to the generator config JSON.",
    )
    parser.add_argument(
        "--asset-json",
        type=Path,
        default=DEFAULT_ASSET_JSON,
        help="Path to the Froggy JSON layer assets.",
    )
    parser.add_argument(
        "--source-csv",
        type=Path,
        help="Canonical collection CSV. Defaults to config source_csv.",
    )
    parser.add_argument(
        "--output-html",
        type=Path,
        help=(
            "Standalone HTML output path. Defaults to output/froggy_display_cabinet.html, "
            "or output/froggy_display_cabinet_inline.html with --inline-csv."
        ),
    )
    parser.add_argument(
        "--inline-csv",
        action="store_true",
        help="Embed collection and 6x6 layer asset data as CSV text blocks instead of row JSON.",
    )
    args = parser.parse_args()

    try:
        config = load_config(args.config)
        source_csv = args.source_csv or Path(config.get("source_csv", "combinations_froggy.csv"))
        output_html = args.output_html or (
            DEFAULT_INLINE_OUTPUT_HTML if args.inline_csv else DEFAULT_OUTPUT_HTML
        )
        build_cabinet_html(
            config,
            args.asset_json,
            source_csv,
            output_html,
            embed_source_csv=args.inline_csv,
        )
    except (FileNotFoundError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
