#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

try:
    import cv2
    import numpy as np
except ImportError as exc:
    raise SystemExit(
        "OpenCV and numpy are required. Install with: pip install opencv-python numpy"
    ) from exc

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.sprites import qc  # noqa: E402
from scripts.sprites.interpolation import (  # noqa: E402
    alpha_y_max,
    apply_affine,
    build_normalization_transform,
    compute_target_bbox,
    interpolate_action,
    stabilize_frame,
)
from scripts.sprites.prompting import get_action_frame_order  # noqa: E402

DEFAULT_DATA = "data/ponies.json"
DEFAULT_OUTPUT_ROOT = "assets/ponies"
DEFAULT_INPUT_SUBDIR = "frames"
DEFAULT_OUTPUT_SUBDIR = "frames_dense"
DEFAULT_WALK_INBETWEENS = 10
DEFAULT_TROT_INBETWEENS = 12
DEFAULT_PAD = 4
DEFAULT_ALPHA_THRESHOLD = 16
DEFAULT_MAX_SHIFT = 8
DEFAULT_SCALE_MIN = 0.75
DEFAULT_SCALE_MAX = 1.35
DEFAULT_GLOBAL_REFERENCE = "walk"


def load_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Interpolate walk/trot keyframes into dense sprite frames."
    )
    parser.add_argument("--pony", default="", help="Pony ID (slug) to process.")
    parser.add_argument(
        "--actions",
        default="walk,trot",
        help="Comma-separated action IDs (default: walk,trot).",
    )
    parser.add_argument(
        "--data",
        default=DEFAULT_DATA,
        help=f"Path to ponies JSON (default: {DEFAULT_DATA}).",
    )
    parser.add_argument(
        "--frames-root",
        default=DEFAULT_OUTPUT_ROOT,
        help=f"Root folder for pony assets (default: {DEFAULT_OUTPUT_ROOT}).",
    )
    parser.add_argument(
        "--input-subdir",
        default=DEFAULT_INPUT_SUBDIR,
        help=f"Keyframe subdirectory (default: {DEFAULT_INPUT_SUBDIR}).",
    )
    parser.add_argument(
        "--output-subdir",
        default=DEFAULT_OUTPUT_SUBDIR,
        help=f"Dense frame subdirectory (default: {DEFAULT_OUTPUT_SUBDIR}).",
    )
    parser.add_argument(
        "--walk-inbetweens",
        type=int,
        default=DEFAULT_WALK_INBETWEENS,
        help=f"In-betweens per walk gap (default: {DEFAULT_WALK_INBETWEENS}).",
    )
    parser.add_argument(
        "--trot-inbetweens",
        type=int,
        default=DEFAULT_TROT_INBETWEENS,
        help=f"In-betweens per trot gap (default: {DEFAULT_TROT_INBETWEENS}).",
    )
    parser.add_argument(
        "--pad",
        type=int,
        default=DEFAULT_PAD,
        help=f"Zero padding for output frame index (default: {DEFAULT_PAD}).",
    )
    parser.add_argument(
        "--alpha-threshold",
        type=int,
        default=DEFAULT_ALPHA_THRESHOLD,
        help=(
            "Alpha threshold (0-255) for foot stabilization baseline "
            f"(default: {DEFAULT_ALPHA_THRESHOLD})."
        ),
    )
    parser.add_argument(
        "--normalize",
        dest="normalize",
        action="store_true",
        default=True,
        help="Normalize frame scale using keyframe bounding boxes (default on).",
    )
    parser.add_argument(
        "--no-normalize",
        dest="normalize",
        action="store_false",
        help="Skip frame scale normalization.",
    )
    parser.add_argument(
        "--scale-min",
        type=float,
        default=DEFAULT_SCALE_MIN,
        help=f"Minimum normalization scale factor (default: {DEFAULT_SCALE_MIN}).",
    )
    parser.add_argument(
        "--scale-max",
        type=float,
        default=DEFAULT_SCALE_MAX,
        help=f"Maximum normalization scale factor (default: {DEFAULT_SCALE_MAX}).",
    )
    parser.add_argument(
        "--global-reference",
        default=DEFAULT_GLOBAL_REFERENCE,
        help=(
            "Action ID used as the global size reference "
            f"(default: {DEFAULT_GLOBAL_REFERENCE})."
        ),
    )
    parser.add_argument(
        "--max-shift",
        type=int,
        default=DEFAULT_MAX_SHIFT,
        help=f"Max Y shift in pixels for stabilization (default: {DEFAULT_MAX_SHIFT}).",
    )
    parser.add_argument(
        "--winsize",
        type=int,
        default=25,
        help="Optical flow window size (default: 25).",
    )
    parser.add_argument(
        "--levels",
        type=int,
        default=4,
        help="Optical flow pyramid levels (default: 4).",
    )
    parser.add_argument(
        "--iterations",
        type=int,
        default=5,
        help="Optical flow iterations (default: 5).",
    )
    parser.add_argument(
        "--poly-n",
        type=int,
        default=7,
        help="Optical flow poly_n (default: 7).",
    )
    parser.add_argument(
        "--poly-sigma",
        type=float,
        default=1.5,
        help="Optical flow poly_sigma (default: 1.5).",
    )
    parser.add_argument(
        "--force", action="store_true", help="Overwrite existing dense frames."
    )
    parser.add_argument(
        "--no-qc", action="store_true", help="Skip QC checks on output frames."
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Print planned output without writing."
    )
    return parser.parse_args()


def read_image(path, expected_size=None):
    image = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if image is None:
        raise FileNotFoundError(f"Missing image: {path}")

    if image.ndim == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGRA)
    elif image.shape[2] == 3:
        image = cv2.cvtColor(image, cv2.COLOR_BGR2BGRA)
    elif image.shape[2] != 4:
        raise ValueError(f"Expected RGBA image, got {image.shape[2]} channels.")

    if expected_size and image.shape[:2] != expected_size:
        height, width = expected_size
        raise ValueError(f"Expected {width}x{height}, got {image.shape[1]}x{image.shape[0]}.")

    return image.astype(np.float32) / 255.0


def write_image(path, image):
    output = np.clip(image * 255.0 + 0.5, 0, 255).astype(np.uint8)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(path), output):
        raise RuntimeError(f"Failed to write image: {path}")




def qc_dense_frame(path):
    Image = qc.ensure_pillow()
    with Image.open(path) as image:
        if image.mode != "RGBA":
            return False, f"Expected RGBA, got {image.mode}."
        width, height = image.size
        alpha = image.getchannel("A")
        alpha_min, alpha_max = alpha.getextrema()
        if alpha_max == 0:
            return False, "Empty frame (all transparent)."
        if alpha_min == 255:
            return False, "No transparent pixels detected."
        bbox = alpha.getbbox()
        if bbox is None:
            return False, "Empty frame (no alpha)."

        left, upper, right, lower = bbox
        area = (right - left) * (lower - upper)
        total_area = width * height
        min_area = 0.12 * total_area
        max_area = 0.85 * total_area
        if area < min_area:
            return False, "Subject area too small."
        if area > max_area:
            return False, "Subject area too large."

        padding = 8
        if left < padding or upper < padding:
            return False, "Subject too close to top/left edge."
        if (width - right) < padding or (height - lower) < padding:
            return False, "Subject too close to bottom/right edge."

    return True, "ok"


def load_keyframes(frames_dir, action_id):
    order = get_action_frame_order(action_id)
    if not order:
        raise ValueError(f"No keyframe order defined for action '{action_id}'.")
    paths = [frames_dir / f"{name}.png" for name in order]
    missing = [path.name for path in paths if not path.exists()]
    if missing:
        raise FileNotFoundError(f"Missing keyframes: {', '.join(missing)}")

    keyframes = []
    expected_size = None
    for path in paths:
        image = read_image(path, expected_size=expected_size)
        expected_size = image.shape[:2]
        keyframes.append(image)
    return keyframes, expected_size


def write_dense_frames(
    action_id,
    keyframes,
    output_dir,
    inbetweens,
    flow_cfg,
    pad,
    alpha_threshold,
    max_shift,
    target_y_max,
    force,
    run_qc,
    dry_run,
):
    alpha_cutoff = alpha_threshold / 255.0
    if target_y_max is None:
        target_y_max = alpha_y_max(keyframes[0], alpha_cutoff)
    total_frames = len(keyframes) * (inbetweens + 1)
    if dry_run:
        print(f"{action_id}: {total_frames} frames -> {output_dir}")
        return 0, 0

    failures = 0
    written = 0
    output_dir.mkdir(parents=True, exist_ok=True)
    for index, frame in enumerate(interpolate_action(keyframes, inbetweens, flow_cfg)):
        frame = stabilize_frame(frame, target_y_max, alpha_cutoff, max_shift)
        name = f"{action_id}_{index:0{pad}d}.png"
        path = output_dir / name
        if path.exists() and not force:
            continue
        write_image(path, frame)
        written += 1
        if run_qc:
            ok, reason = qc_dense_frame(path)
            if not ok:
                failures += 1
                print(f"QC failed: {path.name} ({reason})")
    return written, failures


def process_pony(pony, args, actions, flow_cfg):
    pony_id = pony.get("slug")
    if not pony_id:
        return False

    frames_root = Path(args.frames_root)
    frames_dir = frames_root / pony_id / args.input_subdir
    output_dir = frames_root / pony_id / args.output_subdir

    if not frames_dir.exists():
        print(f"[{pony_id}] Missing frames dir: {frames_dir}")
        return False

    if not args.no_qc and not args.dry_run:
        qc.ensure_pillow()

    success = True
    global_reference = None
    if args.normalize and args.global_reference:
        try:
            ref_keyframes, _ = load_keyframes(frames_dir, args.global_reference)
            global_reference = compute_target_bbox(
                ref_keyframes, args.alpha_threshold / 255.0
            )
        except (FileNotFoundError, ValueError) as exc:
            print(f"[{pony_id}] Global reference '{args.global_reference}' missing: {exc}")
            global_reference = None
    for action_id in actions:
        try:
            keyframes, _ = load_keyframes(frames_dir, action_id)
        except (FileNotFoundError, ValueError) as exc:
            print(f"[{pony_id}] {action_id}: {exc}")
            success = False
            continue

        action_bbox = compute_target_bbox(keyframes, args.alpha_threshold / 255.0)
        target_bbox = global_reference or action_bbox
        if args.normalize and action_bbox and target_bbox:
            matrix = build_normalization_transform(
                action_bbox, target_bbox, args.scale_min, args.scale_max
            )
            keyframes = [apply_affine(frame, matrix) for frame in keyframes]
            target_y_max = int(round(target_bbox["bottom"] - 1))
        else:
            target_y_max = None

        inbetweens = args.walk_inbetweens if action_id == "walk" else args.trot_inbetweens
        written, failures = write_dense_frames(
            action_id=action_id,
            keyframes=keyframes,
            output_dir=output_dir,
            inbetweens=inbetweens,
            flow_cfg=flow_cfg,
            pad=args.pad,
            alpha_threshold=args.alpha_threshold,
            max_shift=args.max_shift,
            target_y_max=target_y_max,
            force=args.force,
            run_qc=not args.no_qc,
            dry_run=args.dry_run,
        )
        if not args.dry_run:
            print(
                f"[{pony_id}] {action_id}: wrote {written} frames "
                f"({failures} QC failures)."
            )
        if failures:
            success = False
    return success


def main():
    args = parse_args()
    pony_data = load_json(args.data)
    ponies = pony_data.get("ponies", [])
    if args.pony:
        ponies = [pony for pony in ponies if pony.get("slug") == args.pony]

    if not ponies:
        print("No matching ponies found.")
        return 1

    actions = [item.strip() for item in args.actions.split(",") if item.strip()]
    if not actions:
        print("No actions specified.")
        return 1

    flow_cfg = {
        "pyr_scale": 0.5,
        "levels": args.levels,
        "winsize": args.winsize,
        "iterations": args.iterations,
        "poly_n": args.poly_n,
        "poly_sigma": args.poly_sigma,
    }

    success = True
    for pony in ponies:
        if not process_pony(pony, args, actions, flow_cfg):
            success = False
    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
