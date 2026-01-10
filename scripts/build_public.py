#!/usr/bin/env python3
import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "public"


def copy_file(src: Path, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)


def copy_tree(src: Path, dest: Path):
    if not src.exists():
        return
    shutil.copytree(src, dest, dirs_exist_ok=True)


def copy_tree_assets(src: Path, dest: Path, prefer_webp: bool):
    if not src.exists():
        return
    for path in src.rglob("*"):
        if path.is_dir():
            continue
        suffix = path.suffix.lower()
        if suffix not in {".png", ".webp", ".jpg", ".jpeg", ".json"}:
            continue
        if prefer_webp and suffix in {".png", ".jpg", ".jpeg"}:
            webp_path = path.with_suffix(".webp")
            if webp_path.exists():
                continue
        copy_file(path, dest / path.relative_to(src))


def copy_pony_assets(src_root: Path, dest_root: Path):
    if not src_root.exists():
        return ["Missing assets/ponies directory."]

    warnings = []
    dest_root.mkdir(parents=True, exist_ok=True)

    for image in src_root.iterdir():
        if not image.is_file():
            continue
        suffix = image.suffix.lower()
        if suffix not in {".png", ".webp", ".jpg", ".jpeg"}:
            continue
        if suffix in {".png", ".jpg", ".jpeg"}:
            webp_path = image.with_suffix(".webp")
            if webp_path.exists():
                continue
        copy_file(image, dest_root / image.name)

    for pony_dir in sorted(path for path in src_root.iterdir() if path.is_dir()):
        sheets_dir = pony_dir / "sheets"
        if not sheets_dir.exists():
            warnings.append(f"[{pony_dir.name}] Missing sheets directory.")
            continue

        dest_sheets = dest_root / pony_dir.name / "sheets"
        sprite_png = sheets_dir / "spritesheet.png"
        sprite_webp = sheets_dir / "spritesheet.webp"
        sprite_json = sheets_dir / "spritesheet.json"

        if sprite_webp.exists():
            copy_file(sprite_webp, dest_sheets / sprite_webp.name)
        elif sprite_png.exists():
            copy_file(sprite_png, dest_sheets / sprite_png.name)
        else:
            warnings.append(f"[{pony_dir.name}] Missing spritesheet.png/.webp")

        if sprite_json.exists():
            copy_file(sprite_json, dest_sheets / sprite_json.name)
        else:
            warnings.append(f"[{pony_dir.name}] Missing spritesheet.json")

    return warnings


def copy_data(src_root: Path, dest_root: Path):
    if not src_root.exists():
        return
    dest_root.mkdir(parents=True, exist_ok=True)
    for item in src_root.glob("*.json"):
        if item.name == "runtime_state.json":
            continue
        copy_file(item, dest_root / item.name)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Build a minimal public/ folder for static deployment."
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help=f"Output directory (default: {DEFAULT_OUTPUT}).",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Delete the output directory before copying.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    output_dir = Path(args.output)
    if args.clean and output_dir.exists():
        shutil.rmtree(output_dir)

    copy_file(ROOT / "index.html", output_dir / "index.html")
    copy_file(ROOT / "styles.css", output_dir / "styles.css")
    copy_tree(ROOT / "styles", output_dir / "styles")
    if (ROOT / "_headers").exists():
        copy_file(ROOT / "_headers", output_dir / "_headers")

    copy_tree(ROOT / "assets" / "js", output_dir / "assets" / "js")
    copy_tree_assets(ROOT / "assets" / "author", output_dir / "assets" / "author", prefer_webp=True)
    copy_tree_assets(ROOT / "assets" / "ui", output_dir / "assets" / "ui", prefer_webp=True)
    copy_tree_assets(ROOT / "assets" / "world", output_dir / "assets" / "world", prefer_webp=True)

    copy_data(ROOT / "data", output_dir / "data")
    warnings = copy_pony_assets(ROOT / "assets" / "ponies", output_dir / "assets" / "ponies")

    if warnings:
        print("Warnings:")
        for warning in warnings:
            print(f"  - {warning}")

    print(f"Wrote public bundle to {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
