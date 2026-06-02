"""Generate tiny recursive child HTML files for the Froggys collection."""

from __future__ import annotations

import argparse
import html
import re
from pathlib import Path


DEFAULT_COUNT = 10000
DEFAULT_OUTPUT_DIR = Path("froggy_inline_parent/seeds")
DEFAULT_PARENT_SRC = "../froggy_display_cabinet_inline_parent.html"
UNQUOTED_ATTR_RE = re.compile(r"^[^\s\"'`=<>]+$")


def html_attr(value: str) -> str:
    if UNQUOTED_ATTR_RE.match(value):
        return value
    return f'"{html.escape(value, quote=True)}"'


def child_html(seed: int, parent_src: str) -> str:
    parent_ref = f"{parent_src}#{seed}"
    return (
        f"<iframe src={html_attr(parent_ref)} "
        "style=position:fixed;inset:0;border:0></iframe>"
    )


def js_single_quoted(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace("\r", "\\r")
        .replace("\n", "\\n")
        .replace("</", "<\\/")
    )


def redirect_child_html(seed: int, parent_src: str) -> str:
    parent_ref = js_single_quoted(f"{parent_src}#{seed}")
    return f'<body onload="location=\'{html.escape(parent_ref, quote=True)}\'">'


def seed_html(seed: int, parent_src: str, mode: str) -> str:
    if mode == "iframe":
        return child_html(seed, parent_src)
    if mode == "redirect":
        return redirect_child_html(seed, parent_src)
    raise ValueError(f"unsupported mode: {mode}")


def generate_seed_children(
    output_dir: Path,
    parent_src: str,
    count: int,
    mode: str = "iframe",
) -> None:
    if count <= 0:
        raise ValueError("count must be greater than zero")

    output_dir.mkdir(parents=True, exist_ok=True)
    for seed in range(1, count + 1):
        (output_dir / f"{seed}.html").write_text(seed_html(seed, parent_src, mode), encoding="utf-8")

    print(f"Saved {count} seed HTML files in {output_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate tiny Froggy child seed HTML files.")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory to write numbered child HTML files.",
    )
    parser.add_argument(
        "--parent-src",
        default=DEFAULT_PARENT_SRC,
        help=(
            "Parent HTML source used by generated child files. Defaults to the local parent file. "
            "Regenerate with the parent inscription content URL after minting the parent."
        ),
    )
    parser.add_argument(
        "--count",
        type=int,
        default=DEFAULT_COUNT,
        help="Number of seed files to generate.",
    )
    parser.add_argument(
        "--mode",
        choices=("iframe", "redirect"),
        default="iframe",
        help="Child HTML strategy. redirect is smallest for minted recursive children.",
    )
    args = parser.parse_args()

    try:
        generate_seed_children(args.output_dir, args.parent_src, args.count, args.mode)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
