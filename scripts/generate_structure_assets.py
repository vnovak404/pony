#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.sprites import images_api  # noqa: E402

STRUCTURE_OUTPUT_DIR = ROOT / "assets" / "world" / "structures"
DECOR_OUTPUT_DIR = ROOT / "assets" / "world" / "decor"

BASE_BUILDING_PROMPT = (
    "Storybook pony village building, front view, centered, clean silhouette. "
    "Pony-friendly scale with wide doorways, rounded steps, and safe ramps. "
    "Decorated with gentle pony, unicorn, or horse motifs (no letters). "
    "Transparent background, no ground, no text, no border."
)

BASE_SCENERY_PROMPT = (
    "Storybook pony village map decoration, front view, centered, clean silhouette. "
    "Pony-friendly scale with rounded forms and gentle curves. "
    "Decorated with subtle pony, unicorn, or horse motifs (no letters). "
    "Transparent background, no ground, no text, no border."
)

STRUCTURES = {
    "inn_01": (
        "Cozy pony inn, two-story cottage, warm windows, curved roof, wooden door, "
        "tiny hanging sign with no letters, horseshoe trim. "
        + BASE_BUILDING_PROMPT
    ),
    "bakery_01": (
        "Pony bakery, warm glow, striped awning, bread basket on the window ledge, "
        "round doorway, carrot and apple motifs, no text signage. "
        + BASE_BUILDING_PROMPT
    ),
    "library_01": (
        "Pony library, tall arched windows, book icon plaque with no letters, "
        "classic roof, friendly lanterns, unicorn star motif. "
        + BASE_BUILDING_PROMPT
    ),
    "market_01": (
        "Pony market stall, wooden frame, colorful canopy, crates of fruit, "
        "simple banner with no letters, hoofprint bunting. "
        + BASE_BUILDING_PROMPT
    ),
    "clinic_01": (
        "Pony clinic, soft roof, heart symbol window with no letters, "
        "clean door, friendly porch, gentle horse motif. "
        + BASE_BUILDING_PROMPT
    ),
    "pavilion_01": (
        "Pony garden pavilion gazebo, round roof, open columns, string lights, "
        "decorative trim, unicorn swirl finial. "
        + BASE_BUILDING_PROMPT
    ),
    "observatory_01": (
        "Pony observatory, domed roof, telescope silhouette, star emblem with no letters, "
        "arched doorway, crescent horse motif. "
        + BASE_BUILDING_PROMPT
    ),
    "lemonade_bar_01": (
        "Pony lemonade bar, small kiosk with striped canopy, glass jars, lemon slices, "
        "round counter height for ponies, horseshoe accents, no text signage. "
        + BASE_BUILDING_PROMPT
    ),
    "forest_01": (
        "Whimsical pony forest cluster, round-canopy trees, tiny lanterns, "
        "gentle trail stones, carved horseshoe motif, no text. "
        + BASE_SCENERY_PROMPT
    ),
    "lake_01": (
        "Calm pony lake, smooth water oval, lily pads, small stone bridge, "
        "reed clusters, subtle pony motif, no text. "
        + BASE_SCENERY_PROMPT
    ),
}

DECOR = {
    "tree_01": (
        "Round-canopy pony tree with soft leaves and a sturdy trunk, small pony charm on the bark. "
        + BASE_SCENERY_PROMPT
    ),
    "tree_02": (
        "Tall pony village tree with layered foliage and curved branches, tiny horseshoe ornament. "
        + BASE_SCENERY_PROMPT
    ),
    "tree_03": (
        "Cherry-blossom pony tree with gentle petals and curved trunk, pony ribbon detail. "
        + BASE_SCENERY_PROMPT
    ),
    "tree_04": (
        "Willow pony tree with drooping leaves, soft lanterns tucked in the branches. "
        + BASE_SCENERY_PROMPT
    ),
    "hill_01": (
        "Rolling pony hill with soft grassy slope, a few daisies, gentle shadowing. "
        + BASE_SCENERY_PROMPT
    ),
    "hill_02": (
        "Layered pony hill with two rounded tiers, small heart-shaped bush. "
        + BASE_SCENERY_PROMPT
    ),
    "hill_03": (
        "Wide pony hill with smooth crest, tiny pathway notch, pastel grass. "
        + BASE_SCENERY_PROMPT
    ),
    "patch_01": (
        "Grassy pony patch, soft oval turf with small flowers and clover. "
        + BASE_SCENERY_PROMPT
    ),
    "patch_02": (
        "Meadow pony patch with bright grass tufts and a few sparkle flowers. "
        + BASE_SCENERY_PROMPT
    ),
    "patch_03": (
        "Calm pony patch with mossy tones and rounded edge stones. "
        + BASE_SCENERY_PROMPT
    ),
    "patch_04": (
        "Sunny pony patch with tiny mushrooms and gentle grass blades. "
        + BASE_SCENERY_PROMPT
    ),
    "marker_01": (
        "Pony road marker signpost with blank sign, horseshoe topper, wooden post. "
        + BASE_SCENERY_PROMPT
    ),
    "marker_02": (
        "Pony road marker with twin arrow boards, blank signs, star topper. "
        + BASE_SCENERY_PROMPT
    ),
    "marker_03": (
        "Short pony road marker with rounded signboard, blank face, heart finial. "
        + BASE_SCENERY_PROMPT
    ),
}


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
    return parser.parse_args()


def main():
    args = parse_args()
    output_dir = Path(args.output_dir) if args.output_dir else None
    only = {item.strip() for item in args.only.split(",") if item.strip()}

    items = DECOR if args.decor else STRUCTURES
    target_dir = output_dir or (DECOR_OUTPUT_DIR if args.decor else STRUCTURE_OUTPUT_DIR)
    target_dir.mkdir(parents=True, exist_ok=True)

    for name, prompt in items.items():
        if only and name not in only:
            continue
        path = target_dir / f"{name}.png"
        if path.exists() and not args.force:
            print(f"Skipping existing {path}")
            continue
        images_api.generate_png(prompt, args.size, path)
        print(f"Wrote {path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
