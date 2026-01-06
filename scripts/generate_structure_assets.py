#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.sprites import images_api  # noqa: E402

DEFAULT_OUTPUT_DIR = ROOT / "assets" / "world" / "structures"

INN_PROMPT = (
    "Cozy storybook inn, small two-story cottage, warm windows, curved roof, "
    "wooden door, tiny hanging sign with no letters. "
    "Front view, centered, clean silhouette. "
    "Transparent background, no ground, no text, no border."
)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate map structure assets using the OpenAI Images API."
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help=f"Output directory (default: {DEFAULT_OUTPUT_DIR}).",
    )
    parser.add_argument(
        "--size",
        type=int,
        default=512,
        help="Output size in pixels (default: 512).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing assets.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    inn_path = output_dir / "inn.png"
    if inn_path.exists() and not args.force:
        print(f"Skipping existing {inn_path}")
    else:
        images_api.generate_png(INN_PROMPT, args.size, inn_path)
        print(f"Wrote {inn_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
