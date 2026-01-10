#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.sprites import images_api  # noqa: E402

STRUCTURE_OUTPUT_DIR = ROOT / "assets" / "world" / "structures"
DECOR_OUTPUT_DIR = ROOT / "assets" / "world" / "decor"
DEFAULT_PROMPTS_PATH = ROOT / "scripts" / "structure_prompts.json"


def load_prompts(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        print(f"Prompt file not found: {path}", file=sys.stderr)
    except json.JSONDecodeError as exc:
        print(f"Invalid JSON in {path}: {exc}", file=sys.stderr)
    return None


def build_prompt(entry, base_prompts):
    if isinstance(entry, str):
        return entry.strip()
    if not isinstance(entry, dict):
        return ""
    prompt = str(entry.get("prompt", "")).strip()
    base_key = entry.get("base")
    base_prompt = str(base_prompts.get(base_key, "")).strip() if base_key else ""
    if base_prompt and prompt:
        return f"{prompt} {base_prompt}".strip()
    if base_prompt:
        return base_prompt
    return prompt


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate map structure assets using the OpenAI Images API."
    )
    parser.add_argument(
        "--output-dir",
        default="",
        help="Output directory override (optional).",
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
    parser.add_argument(
        "--only",
        default="",
        help="Comma-separated structure IDs to generate (default: all).",
    )
    parser.add_argument(
        "--decor",
        action="store_true",
        help="Generate landscape decor assets instead of structures.",
    )
    parser.add_argument(
        "--prompts",
        default=str(DEFAULT_PROMPTS_PATH),
        help="Path to the JSON prompt definitions.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    output_dir = Path(args.output_dir) if args.output_dir else None
    only = {item.strip() for item in args.only.split(",") if item.strip()}

    prompt_data = load_prompts(Path(args.prompts))
    if not prompt_data:
        return 1
    base_prompts = prompt_data.get("base", {})
    items = prompt_data.get("decor" if args.decor else "structures", {})
    target_dir = output_dir or (DECOR_OUTPUT_DIR if args.decor else STRUCTURE_OUTPUT_DIR)
    target_dir.mkdir(parents=True, exist_ok=True)

    for name, entry in items.items():
        if only and name not in only:
            continue
        prompt = build_prompt(entry, base_prompts)
        if not prompt:
            print(f"Skipping {name}: empty prompt")
            continue
        output_path = target_dir / f"{name}.webp"
        if output_path.exists() and not args.force:
            print(f"Skipping existing {output_path}")
            continue
        temp_path = output_path.with_suffix(".png")
        if temp_path.exists():
            temp_path.unlink()
        images_api.generate_png(prompt, args.size, temp_path)
        images_api.convert_to_webp(
            temp_path,
            output_path=output_path,
            target_size=args.size,
            remove_source=True,
        )
        print(f"Wrote {output_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
