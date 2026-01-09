#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PONY_DATA = ROOT / "data" / "ponies.json"
ACTIONS_DATA = ROOT / "data" / "pony_actions.json"
PONY_ROOT = ROOT / "assets" / "ponies"


def load_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def main():
    if not PONY_DATA.exists():
        print("Missing data/ponies.json")
        return 1
    if not ACTIONS_DATA.exists():
        print("Missing data/pony_actions.json")
        return 1

    ponies = load_json(PONY_DATA).get("ponies", [])
    actions = load_json(ACTIONS_DATA).get("actions", [])
    action_ids = [action.get("id") for action in actions if action.get("id")]

    errors = []
    warnings = []
    for pony in ponies:
        slug = pony.get("slug")
        if not slug:
            continue
        sheets_dir = PONY_ROOT / slug / "sheets"
        sheet_png = sheets_dir / "spritesheet.png"
        sheet_webp = sheets_dir / "spritesheet.webp"
        meta_path = sheets_dir / "spritesheet.json"
        if not sheet_png.exists() and not sheet_webp.exists():
            errors.append(f"[{slug}] Missing spritesheet.png/.webp in {sheets_dir}")
            continue
        if not meta_path.exists():
            errors.append(f"[{slug}] Missing {meta_path}")
            continue

        try:
            meta = load_json(meta_path)
        except json.JSONDecodeError as exc:
            errors.append(f"[{slug}] Invalid JSON: {exc}")
            continue

        meta_image = meta.get("meta", {}).get("image")
        if meta_image not in {"spritesheet.png", "spritesheet.webp"}:
            warnings.append(f"[{slug}] meta.image is {meta_image!r}")

        frames = meta.get("frames", {})
        animations = meta.get("animations", {})
        idle_frames = animations.get("idle") or []

        if not animations:
            errors.append(f"[{slug}] Missing animations in spritesheet.json")
            continue

        for action_id in action_ids:
            action_frames = animations.get(action_id) or []
            if action_frames:
                missing = [name for name in action_frames if name not in frames]
                if missing:
                    errors.append(
                        f"[{slug}] Missing frame entries for {action_id}: {missing[:3]}"
                    )
                continue
            if idle_frames:
                warnings.append(f"[{slug}] Missing {action_id}, falling back to idle")
            else:
                errors.append(f"[{slug}] Missing {action_id} and no idle fallback")

    if warnings:
        print("Warnings:")
        for line in warnings:
            print(f"  - {line}")
    if errors:
        print("Errors:")
        for line in errors:
            print(f"  - {line}")
        return 1

    print("Spritesheet validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
