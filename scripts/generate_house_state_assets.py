#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.generate_pony_houses import (  # noqa: E402
    STYLE_BIBLE,
    collect_houses,
    load_data,
)
from scripts.sprites import images_api  # noqa: E402

DEFAULT_TARGET_SIZE = 512

DEFAULT_DATA = ROOT / "data" / "ponies.json"
DEFAULT_OUTPUT_DIR = ROOT / "assets" / "world" / "houses"
DEFAULT_STATES = ("repair", "ruined")

STATE_DETAILS = {
    "repair": (
        "Under repair with scaffolding, wooden beams, canvas tarps, and tidy toolboxes. "
        "Keep the house cozy and pony-friendly while it's being fixed."
    ),
    "ruined": (
        "Run-down and uninhabitable with a cracked roof, boarded windows, and gentle vines. "
        "Keep the same silhouette and palette, just visibly damaged."
    ),
}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate house repair/ruined variants using the Images API.",
    )
    parser.add_argument("--data", default=str(DEFAULT_DATA), help="Path to ponies.json.")
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help=f"Output directory (default: {DEFAULT_OUTPUT_DIR}).",
    )
    parser.add_argument(
        "--only",
        default="",
        help="Comma-separated house IDs to generate.",
    )
    parser.add_argument(
        "--pony",
        default="",
        help="Comma-separated pony slugs to generate house variants for.",
    )
    parser.add_argument(
        "--states",
        default="",
        help="Comma-separated states (repair,ruined). Default: both.",
    )
    parser.add_argument(
        "--size",
        default="auto",
        help="Output size (e.g. 512) or 'auto' (default: auto).",
    )
    parser.add_argument("--force", action="store_true", help="Overwrite existing assets.")
    parser.add_argument("--dry-run", action="store_true", help="Print prompts only.")
    return parser.parse_args()


def build_prompt(house, state):
    detail = STATE_DETAILS[state]
    return (
        f"Edit the input house image to show the house {state}. "
        f"{detail} Keep colors, proportions, and viewpoint consistent. "
        + STYLE_BIBLE
    )


def main():
    args = parse_args()
    data = load_data(Path(args.data))
    ponies = data.get("ponies", [])
    only_houses = [item for item in args.only.split(",") if item.strip()]
    only_ponies = [item for item in args.pony.split(",") if item.strip()]
    houses = collect_houses(ponies, only_houses=only_houses, only_ponies=only_ponies)

    if args.states:
        states = [item.strip() for item in args.states.split(",") if item.strip()]
    else:
        states = list(DEFAULT_STATES)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if not args.dry_run:
        images_api.ensure_api_key()

    size_value = args.size
    if isinstance(size_value, str) and size_value.isdigit():
        size_value = int(size_value)
    elif isinstance(size_value, str) and "x" in size_value.lower():
        parts = size_value.lower().split("x", 1)
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            if parts[0] == parts[1]:
                size_value = int(parts[0])

    for house in houses:
        base_webp = output_dir / f"{house['id']}.webp"
        base_png = output_dir / f"{house['id']}.png"
        base_path = base_webp if base_webp.exists() else base_png
        if not base_path.exists():
            print(f"Missing base house sprite: {base_path}")
            continue
        try:
            from PIL import Image
        except ImportError:
            print("Pillow is required for house variant generation.")
            return 1
        with Image.open(base_path) as base_image:
            base_size = base_image.size[0]
        if size_value == "auto":
            target_size = min(base_size, DEFAULT_TARGET_SIZE)
            request_size = "auto"
        else:
            target_size = size_value
            request_size = size_value
        temp_source = None
        if base_path.suffix.lower() != ".png":
            temp_source = base_path.with_suffix(".tmp.png")
            with Image.open(base_path) as base_image:
                base_image.convert("RGBA").save(temp_source)
            source_path = temp_source
        else:
            source_path = base_path
        for state in states:
            if state not in STATE_DETAILS:
                print(f"Unknown state: {state}")
                continue
            output_path = output_dir / f"{house['id']}_{state}.webp"
            if output_path.exists() and not args.force:
                print(f"Skipping existing {output_path}")
                continue
            prompt = build_prompt(house, state)
            if args.dry_run:
                print(f"[{house['id']}/{state}] {prompt}")
                continue
            temp_output = output_path.with_suffix(".png")
            if temp_output.exists():
                temp_output.unlink()
            images_api.generate_png_from_image(prompt, request_size, temp_output, source_path)
            images_api.convert_to_webp(
                temp_output,
                output_path=output_path,
                target_size=target_size,
                remove_source=True,
            )
            print(f"Wrote {output_path}")
        if temp_source and temp_source.exists():
            temp_source.unlink()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
