#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.sprites import images_api  # noqa: E402

DEFAULT_SIZE = "auto"
OUTPUT_DIR = ROOT / "assets" / "ui" / "icons"

ICON_STYLE = (
    "Cute icon, soft pastel palette, gentle colored outline that matches the icon, "
    "simple storybook shading, centered on canvas. "
    "Transparent background (RGBA), no shadow, no text, no border, no white rim."
)

ICON_PROMPTS = {
    "health": "A bright pink heart with a tiny sparkle.",
    "thirst": "A cup of lemonade with a straw and a lemon slice.",
    "hunger": "A shiny red apple with a green leaf.",
    "tired": "A sleepy crescent moon resting on a tiny pillow.",
    "boredom": "A colorful pinwheel toy with a short ribbon.",
}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate UI status icons using the OpenAI Images API."
    )
    parser.add_argument(
        "--icons",
        default="",
        help="Comma-separated icon IDs to generate (default: all).",
    )
    parser.add_argument(
        "--size",
        default=DEFAULT_SIZE,
        help="Icon size (e.g. 1024) or 'auto' (default: auto).",
    )
    parser.add_argument("--force", action="store_true", help="Overwrite existing icons.")
    parser.add_argument("--dry-run", action="store_true", help="Print prompts only.")
    return parser.parse_args()


def build_prompt(base):
    return f"{base} {ICON_STYLE}"


def main():
    args = parse_args()
    if args.icons:
        wanted = {item.strip() for item in args.icons.split(",") if item.strip()}
        icon_items = {key: ICON_PROMPTS[key] for key in ICON_PROMPTS if key in wanted}
    else:
        icon_items = ICON_PROMPTS

    if not icon_items:
        print("No matching icons selected.")
        return 1

    if not args.dry_run:
        images_api.ensure_api_key()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for key, base_prompt in icon_items.items():
        output_path = OUTPUT_DIR / f"{key}.png"
        if output_path.exists() and not args.force:
            print(f"[{key}] Skipping existing {output_path}.")
            continue
        prompt = build_prompt(base_prompt)
        if args.dry_run:
            print(f"[{key}] {prompt}")
            continue
        size_value = args.size
        if isinstance(size_value, str) and size_value.isdigit():
            size_value = int(size_value)
        images_api.generate_png(prompt, size_value, output_path)
        print(f"[{key}] Wrote {output_path}.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
