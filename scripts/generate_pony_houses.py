#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.sprites import images_api  # noqa: E402

DEFAULT_DATA = ROOT / "data" / "ponies.json"
DEFAULT_OUTPUT_DIR = ROOT / "assets" / "world" / "houses"

STYLE_BIBLE = (
    "Storybook pony village house sprite, front view, centered, clean silhouette. "
    "Pony-friendly scale with wide doors, rounded steps, and cozy windows. "
    "Transparent background, no ground, no text, no border, no scenery."
)


def load_data(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def sanitize(value):
    if not value:
        return ""
    return str(value).strip()


def build_house_prompt(house):
    residents = ", ".join(house["residents"])
    colors = ", ".join(sorted(set(house["colors"])))
    vibes = ", ".join(sorted(set(house["vibes"])))
    talents = ", ".join(sorted(set(house["talents"])))
    jobs = ", ".join(sorted(set(house["jobs"])))

    details = []
    if house.get("shared") or len(house["residents"]) > 1:
        details.append("Multi-floor house with two cozy levels and a shared porch.")
    else:
        details.append("Cozy single-family cottage.")
    if talents:
        details.append(f"Inspired by talents like {talents}.")
    if jobs:
        details.append(f"Touches inspired by jobs like {jobs}.")
    if vibes:
        details.append(f"Vibe: {vibes}.")

    return (
        f"House name: {house['name']}. Residents: {residents}. "
        f"Palette: {colors}. "
        + " ".join(details)
        + " "
        + STYLE_BIBLE
    )


def collect_houses(ponies, only_houses=None, only_ponies=None):
    houses = {}
    only_houses = {item.strip() for item in (only_houses or []) if item.strip()}
    only_ponies = {item.strip() for item in (only_ponies or []) if item.strip()}

    for pony in ponies:
        slug = pony.get("slug")
        if only_ponies and slug not in only_ponies:
            continue
        house = pony.get("house") or {}
        house_id = sanitize(house.get("id"))
        house_name = sanitize(house.get("name"))
        if not house_id:
            continue
        if only_houses and house_id not in only_houses:
            continue
        entry = houses.setdefault(
            house_id,
            {
                "id": house_id,
                "name": house_name or house_id.replace("-", " ").title(),
                "residents": [],
                "colors": [],
                "vibes": [],
                "talents": [],
                "jobs": [],
                "shared": bool(house.get("shared")),
            },
        )
        entry["residents"].append(pony.get("name", house_id))
        for color_key in ("body_color", "mane_color", "accent_color"):
            color = sanitize(pony.get(color_key))
            if color:
                entry["colors"].append(color)
        personality = sanitize(pony.get("personality"))
        if personality:
            entry["vibes"].append(personality)
        talent = sanitize(pony.get("talent"))
        if talent:
            entry["talents"].append(talent)
        job = pony.get("job") or {}
        job_title = sanitize(job.get("title"))
        if job_title:
            entry["jobs"].append(job_title)

    return list(houses.values())


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate per-pony house assets using the Images API.",
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
        help="Comma-separated pony slugs to generate houses for.",
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
        "--dry-run",
        action="store_true",
        help="Print prompts without generating images.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    data = load_data(Path(args.data))
    ponies = data.get("ponies", [])
    only_houses = [item for item in args.only.split(",") if item.strip()]
    only_ponies = [item for item in args.pony.split(",") if item.strip()]
    houses = collect_houses(ponies, only_houses=only_houses, only_ponies=only_ponies)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if not args.dry_run:
        images_api.ensure_api_key()

    for house in houses:
        prompt = build_house_prompt(house)
        output_path = output_dir / f"{house['id']}.png"
        if output_path.exists() and not args.force:
            print(f"Skipping existing {output_path}")
            continue
        if args.dry_run:
            print(f"[{house['id']}] {prompt}")
            continue
        images_api.generate_png(prompt, args.size, output_path)
        print(f"Wrote {output_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
