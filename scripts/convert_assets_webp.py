#!/usr/bin/env python3
import argparse
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - runtime dependency check
    raise SystemExit("Pillow is required. Install it to run this script.")

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ROOT = ROOT / "assets"
DEFAULT_EXTS = {".png", ".jpg", ".jpeg"}
DEFAULT_EXCLUDES = {"frames", "frames_dense", "sheets.bak"}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Convert PNG/JPG assets under assets/ to WebP."
    )
    parser.add_argument(
        "--root",
        default=str(DEFAULT_ROOT),
        help=f"Root assets directory (default: {DEFAULT_ROOT}).",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=85,
        help="WebP quality for lossy output (default: 85).",
    )
    parser.add_argument(
        "--lossless",
        action="store_true",
        help="Use lossless WebP encoding.",
    )
    parser.add_argument(
        "--method",
        type=int,
        default=6,
        help="WebP compression method (0-6, default: 6).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing .webp files.",
    )
    parser.add_argument(
        "--include-frames",
        action="store_true",
        help="Include pony frames/frames_dense directories.",
    )
    parser.add_argument(
        "--prune-source",
        action="store_true",
        help="Delete source images after successful conversion.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List conversions without writing files.",
    )
    return parser.parse_args()


def should_skip(path: Path, include_frames: bool) -> bool:
    parts = set(path.parts)
    if not include_frames and ("frames" in parts or "frames_dense" in parts):
        return True
    if DEFAULT_EXCLUDES.intersection(parts):
        return True
    return False


def convert_image(src: Path, dest: Path, quality: int, lossless: bool, method: int) -> None:
    with Image.open(src) as image:
        if image.mode not in ("RGB", "RGBA"):
            has_alpha = "A" in image.getbands()
            image = image.convert("RGBA" if has_alpha else "RGB")
        save_kwargs = {"format": "WEBP", "quality": quality, "method": method}
        if lossless:
            save_kwargs["lossless"] = True
        image.save(dest, **save_kwargs)


def main() -> int:
    args = parse_args()
    root = Path(args.root)
    if not root.exists():
        print(f"Root path not found: {root}")
        return 1

    total = 0
    converted = 0
    skipped = 0
    errors = 0

    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in DEFAULT_EXTS:
            continue
        if should_skip(path, args.include_frames):
            continue
        total += 1
        dest = path.with_suffix(".webp")
        if dest.exists() and not args.force:
            if args.prune_source:
                path.unlink(missing_ok=True)
                converted += 1
            else:
                skipped += 1
            continue
        if args.dry_run:
            print(f"[dry-run] {path} -> {dest}")
            converted += 1
            continue
        try:
            convert_image(path, dest, args.quality, args.lossless, args.method)
            if args.prune_source:
                path.unlink(missing_ok=True)
            converted += 1
        except Exception as error:
            errors += 1
            print(f"Failed: {path} ({error})")

    print(
        f"WebP conversion complete. Sources: {total}, converted: {converted}, "
        f"skipped: {skipped}, errors: {errors}."
    )
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
