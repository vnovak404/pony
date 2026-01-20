import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.sprites import images_api

DEFAULT_GENERATED_ROOT = ROOT.parent / "pony_generated_assets" / "adventure_assets"

TILE_PROMPTS = {
    "grass": (
        "Seamless tileable 64x64 top-down fantasy grass tile, dark Transylponia mood, "
        "mossy texture, soft highlights, subtle noise, no paths, no flowers, no text, no border."
    ),
    "forest": (
        "Seamless tileable 64x64 isometric forest tile with oversized tree canopies, "
        "dark emerald leaves, soft highlights, moody Transylponia fantasy, no paths, "
        "no text, no border."
    ),
    "road": (
        "Seamless tileable 64x64 top-down dirt road tile with subtle stones, "
        "dark fantasy, slightly darker edges, no text, no border."
    ),
    "water": (
        "Seamless tileable 64x64 dark water tile with soft ripples, top-down, "
        "moody Transylponia palette, no text, no border."
    ),
    "mountain": (
        "Seamless tileable 64x64 rocky mountain ground tile, top-down, slate stones, "
        "dark fantasy palette, no text, no border."
    ),
    "village": (
        "Seamless tileable 64x64 worn cobblestone village ground tile, top-down, "
        "muted warm palette, no text, no border."
    ),
}

OVERLAY_PROMPTS = {
    "forest-canopy": (
        "Isometric tree canopy cluster sprite with oversized dark emerald leaves, "
        "storybook fantasy style, transparent background, no text."
    ),
    "forest-border": (
        "Bushy forest edge ground overlay tile, top-down, dark green shrubs and moss, "
        "storybook fantasy style, transparent background, no text."
    ),
}

TREE_PROMPTS = {
    "forest-tree-01": (
        "Large isometric pine tree sprite, tall and lush, dark Transylponia palette, "
        "storybook fantasy style, transparent background, no text."
    ),
    "forest-tree-02": (
        "Large isometric oak tree sprite with wide canopy, dark emerald leaves, "
        "storybook fantasy style, transparent background, no text."
    ),
    "forest-tree-03": (
        "Large isometric twisted spruce tree sprite, moody fantasy palette, "
        "storybook fantasy style, transparent background, no text."
    ),
}

OVERLAY_ICON_PROMPTS = {
    "mouse": (
        "Small game UI mouse icon, 32x32, crisp edges, simple silhouette, "
        "storybook fantasy style, transparent background, no text."
    ),
}

LETTER_PROMPTS = {
    "scroll-letter": (
        "Old parchment letter background styled like a fantasy scroll, "
        "ornate edges, warm ivory paper, subtle stains, transparent background, no text."
    ),
    "torn-letter": (
        "Old parchment letter background with the bottom edge torn away, "
        "fantasy scroll style, warm ivory paper, subtle stains, transparent background, no text."
    ),
}

HERO_PROMPTS = {
    "owl-scared": (
        "Portrait of a friendly owl with a scared expression, big eyes, "
        "storybook fantasy style, soft lighting, transparent background, no text."
    ),
    "squirrel-scared": (
        "Portrait of a small squirrel looking scared but cute, big eyes, "
        "storybook fantasy style, soft lighting, transparent background, no text."
    ),
    "deer-scared": (
        "Portrait of a gentle deer looking worried, big eyes, "
        "storybook fantasy style, soft lighting, transparent background, no text."
    ),
    "fallen-messenger": (
        "Portrait of a fallen royal messenger pony with a travel bag, lifeless posture, "
        "storybook fantasy style, soft lighting, transparent background, no text."
    ),
    "gold-pile": (
        "Large game UI portrait of a small pile of gold coins, "
        "storybook fantasy style, soft lighting, transparent background, no text."
    ),
    "wood-pile": (
        "Large game UI portrait of a small bundle of wooden logs, "
        "storybook fantasy style, soft lighting, transparent background, no text."
    ),
    "stone-pile": (
        "Large game UI portrait of a chunky grey stone, "
        "storybook fantasy style, soft lighting, transparent background, no text."
    ),
}

ICON_PROMPTS = {
    "gold": (
        "Game UI icon of a small stack of gold coins, 32x32, crisp edges, "
        "storybook fantasy style, transparent background, no text."
    ),
    "wood": (
        "Game UI icon of a small bundle of wooden logs, 32x32, crisp edges, "
        "storybook fantasy style, transparent background, no text."
    ),
    "stone": (
        "Game UI icon of a chunky grey stone, 32x32, crisp edges, "
        "storybook fantasy style, transparent background, no text."
    ),
}

SPRITE_PROMPTS = {
    "owl": (
        "Tiny game sprite of a friendly owl, isometric 3/4 view, facing right, "
        "storybook fantasy style, transparent background, 64x64, no text."
    ),
    "squirrel": (
        "Tiny game sprite of a friendly squirrel, isometric 3/4 view, facing right, "
        "storybook fantasy style, transparent background, 64x64, no text."
    ),
    "deer": (
        "Tiny game sprite of a gentle deer, isometric 3/4 view, facing right, "
        "storybook fantasy style, transparent background, 64x64, no text."
    ),
    "pony-skeleton": (
        "Game sprite of a fallen royal messenger pony with a travel bag, no crown, "
        "clearly lifeless (not sleeping), isometric 3/4 view, facing right, "
        "storybook fantasy style, transparent background, 96x96, no text."
    ),
}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate adventure prototype tiles/icons/sprites via OpenAI ImageGen."
    )
    parser.add_argument(
        "--generated-root",
        type=Path,
        default=DEFAULT_GENERATED_ROOT,
        help="Folder to store original PNGs (default: ../pony_generated_assets/adventure_assets).",
    )
    parser.add_argument(
        "--target-root",
        type=Path,
        default=ROOT / "adventures",
        help="Folder to write WebP assets (default: adventures/).",
    )
    parser.add_argument("--request-size", default=1024, type=int, help="API size.")
    parser.add_argument("--tile-size", default=64, type=int, help="Tile WebP size.")
    parser.add_argument("--icon-size", default=32, type=int, help="Icon WebP size.")
    parser.add_argument("--sprite-size", default=64, type=int, help="Sprite WebP size.")
    parser.add_argument("--tree-size", default=256, type=int, help="Tree WebP size.")
    parser.add_argument("--overlay-size", default=32, type=int, help="Overlay WebP size.")
    parser.add_argument("--hero-size", default=256, type=int, help="Hero WebP size.")
    parser.add_argument("--letter-size", default=640, type=int, help="Letter WebP size.")
    parser.add_argument("--tiles", action="store_true", help="Generate tiles only.")
    parser.add_argument("--icons", action="store_true", help="Generate icons only.")
    parser.add_argument("--sprites", action="store_true", help="Generate sprites only.")
    parser.add_argument("--trees", action="store_true", help="Generate tree sprites only.")
    parser.add_argument("--overlays", action="store_true", help="Generate overlays only.")
    parser.add_argument("--letters", action="store_true", help="Generate letter backgrounds only.")
    parser.add_argument("--heroes", action="store_true", help="Generate hero portraits only.")
    parser.add_argument("--tile", action="append", dest="tile_names", help="Generate a single tile by name (repeatable).")
    parser.add_argument("--icon", action="append", dest="icon_names", help="Generate a single icon by name (repeatable).")
    parser.add_argument("--sprite", action="append", dest="sprite_names", help="Generate a single sprite by name (repeatable).")
    parser.add_argument("--tree", action="append", dest="tree_names", help="Generate a single tree sprite by name (repeatable).")
    parser.add_argument("--overlay", action="append", dest="overlay_names", help="Generate a single overlay icon by name (repeatable).")
    parser.add_argument("--letter", action="append", dest="letter_names", help="Generate a single letter background by name (repeatable).")
    parser.add_argument("--hero", action="append", dest="hero_names", help="Generate a single hero portrait by name (repeatable).")
    parser.add_argument("--force", action="store_true", help="Overwrite existing WebPs.")
    parser.add_argument("--dry-run", action="store_true", help="Print prompts only.")
    return parser.parse_args()


def should_generate(args):
    has_specific = any(
        [
            args.tile_names,
            args.icon_names,
            args.sprite_names,
            args.tree_names,
            args.overlay_names,
            args.letter_names,
            args.hero_names,
        ]
    )
    if has_specific:
        return {
            "tiles": args.tiles or bool(args.tile_names),
            "icons": args.icons or bool(args.icon_names),
            "sprites": args.sprites or bool(args.sprite_names),
            "trees": args.trees or bool(args.tree_names),
            "overlays": args.overlays or bool(args.overlay_names),
            "letters": args.letters or bool(args.letter_names),
            "heroes": args.heroes or bool(args.hero_names),
        }
    if (
        args.tiles
        or args.icons
        or args.sprites
        or args.trees
        or args.overlays
        or args.letters
        or args.heroes
    ):
        return {
            "tiles": args.tiles,
            "icons": args.icons,
            "sprites": args.sprites,
            "trees": args.trees,
            "overlays": args.overlays,
            "letters": args.letters,
            "heroes": args.heroes,
        }
    return {
        "tiles": True,
        "icons": True,
        "sprites": True,
        "trees": True,
        "overlays": True,
        "letters": True,
        "heroes": True,
    }


def center_trim_png(png_path, pad_ratio=0.08):
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Pillow is required for trimming PNGs.") from exc
    with Image.open(png_path) as image:
        image = image.convert("RGBA")
        alpha = image.getchannel("A")
        bbox = alpha.getbbox()
        if not bbox:
            return
        cropped = image.crop(bbox)
        width, height = cropped.size
        pad = int(max(width, height) * pad_ratio)
        size = max(width, height) + pad * 2
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        canvas.paste(cropped, ((size - width) // 2, (size - height) // 2))
        canvas.save(png_path)


def generate_and_convert(
    prompt,
    request_size,
    png_path,
    dest_path,
    target_size,
    force,
    dry_run,
    *,
    center_trim=False,
):
    if dest_path.exists() and not force:
        print(f"skip {dest_path}")
        return
    if dry_run:
        print(f"prompt -> {dest_path}: {prompt}")
        return
    images_api.generate_png(prompt, request_size, png_path)
    if center_trim:
        center_trim_png(png_path)
    images_api.convert_to_webp(
        png_path,
        output_path=dest_path,
        target_size=target_size,
        quality=90,
        method=6,
        lossless=False,
        remove_source=False,
    )
    print(f"generated {dest_path}")


def main():
    args = parse_args()
    modes = should_generate(args)
    if not args.dry_run:
        images_api.ensure_api_key()

    tiles_dir = args.generated_root / "tiles"
    icons_dir = args.generated_root / "icons"
    sprites_dir = args.generated_root / "sprites"
    trees_dir = args.generated_root / "trees"
    overlays_dir = args.generated_root / "overlays"
    letters_dir = args.generated_root / "letters"
    heroes_dir = args.generated_root / "heroes"
    tiles_dir.mkdir(parents=True, exist_ok=True)
    icons_dir.mkdir(parents=True, exist_ok=True)
    sprites_dir.mkdir(parents=True, exist_ok=True)
    trees_dir.mkdir(parents=True, exist_ok=True)
    overlays_dir.mkdir(parents=True, exist_ok=True)
    letters_dir.mkdir(parents=True, exist_ok=True)
    heroes_dir.mkdir(parents=True, exist_ok=True)

    tile_out = args.target_root / "tiles"
    icon_out = args.target_root / "icons"
    sprite_out = args.target_root / "sprites"
    tree_out = args.target_root / "overlays"
    overlay_out = args.target_root / "overlays"
    letter_out = args.target_root / "letters"
    hero_out = args.target_root / "heroes"
    tile_out.mkdir(parents=True, exist_ok=True)
    icon_out.mkdir(parents=True, exist_ok=True)
    sprite_out.mkdir(parents=True, exist_ok=True)
    tree_out.mkdir(parents=True, exist_ok=True)
    overlay_out.mkdir(parents=True, exist_ok=True)
    letter_out.mkdir(parents=True, exist_ok=True)
    hero_out.mkdir(parents=True, exist_ok=True)

    tile_names = set(args.tile_names or [])
    icon_names = set(args.icon_names or [])
    sprite_names = set(args.sprite_names or [])
    tree_names = set(args.tree_names or [])
    overlay_names = set(args.overlay_names or [])
    letter_names = set(args.letter_names or [])
    hero_names = set(args.hero_names or [])

    if modes["tiles"]:
        for name, prompt in TILE_PROMPTS.items():
            if tile_names and name not in tile_names:
                continue
            generate_and_convert(
                prompt,
                args.request_size,
                tiles_dir / f"{name}.png",
                tile_out / f"{name}.webp",
                args.tile_size,
                args.force,
                args.dry_run,
            )
        for name, prompt in OVERLAY_PROMPTS.items():
            if tile_names and name not in tile_names:
                continue
            target_size = args.tile_size * 2 if "canopy" in name else args.tile_size
            generate_and_convert(
                prompt,
                args.request_size,
                tiles_dir / f"{name}.png",
                tile_out / f"{name}.webp",
                target_size,
                args.force,
                args.dry_run,
            )

    if modes["icons"]:
        for name, prompt in ICON_PROMPTS.items():
            if icon_names and name not in icon_names:
                continue
            generate_and_convert(
                prompt,
                args.request_size,
                icons_dir / f"{name}.png",
                icon_out / f"{name}.webp",
                args.icon_size,
                args.force,
                args.dry_run,
                center_trim=True,
            )

    if modes["sprites"]:
        for name, prompt in SPRITE_PROMPTS.items():
            if sprite_names and name not in sprite_names:
                continue
            generate_and_convert(
                prompt,
                args.request_size,
                sprites_dir / f"{name}.png",
                sprite_out / f"{name}.webp",
                args.sprite_size,
                args.force,
                args.dry_run,
            )

    if modes["trees"]:
        for name, prompt in TREE_PROMPTS.items():
            if tree_names and name not in tree_names:
                continue
            generate_and_convert(
                prompt,
                args.request_size,
                trees_dir / f"{name}.png",
                tree_out / f"{name}.webp",
                args.tree_size,
                args.force,
                args.dry_run,
            )

    if modes["overlays"]:
        for name, prompt in OVERLAY_ICON_PROMPTS.items():
            if overlay_names and name not in overlay_names:
                continue
            generate_and_convert(
                prompt,
                args.request_size,
                overlays_dir / f"{name}.png",
                overlay_out / f"{name}.webp",
                args.overlay_size,
                args.force,
                args.dry_run,
            )

    if modes["letters"]:
        for name, prompt in LETTER_PROMPTS.items():
            if letter_names and name not in letter_names:
                continue
            generate_and_convert(
                prompt,
                args.request_size,
                letters_dir / f"{name}.png",
                letter_out / f"{name}.webp",
                args.letter_size,
                args.force,
                args.dry_run,
            )

    if modes["heroes"]:
        for name, prompt in HERO_PROMPTS.items():
            if hero_names and name not in hero_names:
                continue
            generate_and_convert(
                prompt,
                args.request_size,
                heroes_dir / f"{name}.png",
                hero_out / f"{name}.webp",
                args.hero_size,
                args.force,
                args.dry_run,
                center_trim=True,
            )


if __name__ == "__main__":
    main()
