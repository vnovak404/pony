#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.sprites import images_api  # noqa: E402

DEFAULT_GENERATED_ROOT = ROOT.parent / "pony_generated_assets" / "adventure_assets" / "sprites" / "mission2"
DEFAULT_TARGET_ROOT = ROOT / "adventures" / "missions" / "stellacorn" / "mission2" / "adventures" / "sprites" / "mission2"


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate image variations from a JSON prompt file."
    )
    parser.add_argument(
        "--prompt-json",
        type=Path,
        required=True,
        help="Path to the JSON prompt file.",
    )
    parser.add_argument(
        "--source-image",
        type=Path,
        default=None,
        help="Optional source image for edit-based generation.",
    )
    parser.add_argument(
        "--generated-root",
        type=Path,
        default=DEFAULT_GENERATED_ROOT,
        help="Folder for original PNG outputs (default: ../pony_generated_assets/adventure_assets/sprites/mission2).",
    )
    parser.add_argument(
        "--target-root",
        type=Path,
        default=DEFAULT_TARGET_ROOT,
        help="Folder for WebP outputs (default: adventures/missions/stellacorn/mission2/adventures/sprites/mission2).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing outputs.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print prompts without generating images.",
    )
    return parser.parse_args()


def load_prompt_data(path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def build_prompt(base_prompt, variant_prompt):
    if variant_prompt:
        return f"{base_prompt} {variant_prompt}"
    return base_prompt


def main():
    args = parse_args()
    prompt_data = load_prompt_data(args.prompt_json)
    base_prompt = prompt_data.get("base_prompt", "").strip()
    variants = prompt_data.get("variants", [])
    output_size = prompt_data.get("output_size", 512)
    request_size = prompt_data.get("request_size", "1024x1024")
    name = prompt_data.get("name", "asset")

    if not base_prompt:
        print("Missing base_prompt in JSON.")
        return 1

    if not variants:
        print("No variants listed in JSON.")
        return 1

    args.generated_root.mkdir(parents=True, exist_ok=True)
    args.target_root.mkdir(parents=True, exist_ok=True)

    for variant in variants:
        variant_id = str(variant.get("id", "")).strip() or "01"
        variant_prompt = str(variant.get("prompt", "")).strip()
        prompt = build_prompt(base_prompt, variant_prompt)
        png_name = f"{name}-{variant_id}.png"
        webp_name = f"{name}-{variant_id}.webp"
        png_path = args.generated_root / png_name
        webp_path = args.target_root / webp_name

        if webp_path.exists() and not args.force:
            print(f"[{variant_id}] Skipping existing {webp_path}.")
            continue

        if args.dry_run:
            print(f"[{variant_id}] {prompt}")
            continue

        if args.source_image:
            images_api.generate_png_from_image(prompt, request_size, png_path, args.source_image)
        else:
            images_api.generate_png(prompt, request_size, png_path)

        images_api.convert_to_webp(
            png_path,
            output_path=webp_path,
            target_size=output_size,
            remove_source=False,
        )
        print(f"[{variant_id}] Wrote {webp_path}.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
