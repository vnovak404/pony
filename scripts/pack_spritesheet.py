#!/usr/bin/env python3
import argparse
import json
import math
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:
    raise SystemExit("Pillow is required. Install with: pip install pillow") from exc

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.sprites import qc
from scripts.sprites.prompting import get_action_frame_order

DEFAULT_ACTIONS = "data/pony_actions.json"
DEFAULT_OUTPUT_ROOT = "assets/ponies"
DEFAULT_FRAMES_SUBDIR = "frames_dense"
DEFAULT_FALLBACK_SUBDIR = "frames"
DEFAULT_COLUMNS = 8
DEFAULT_FRAME_SIZE = 512
DEFAULT_PADDING = 2
DEFAULT_MAX_SIZE = 8192
DEFAULT_MAX_FPS = 60


def load_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Pack pony sprite frames into spritesheets and metadata JSON."
    )
    parser.add_argument("--pony", default="", help="Pony ID (slug) to pack.")
    parser.add_argument(
        "--columns",
        type=int,
        default=DEFAULT_COLUMNS,
        help=f"Columns in spritesheet (default: {DEFAULT_COLUMNS}).",
    )
    parser.add_argument(
        "--frame-size",
        type=int,
        default=DEFAULT_FRAME_SIZE,
        help=f"Frame size in pixels (default: {DEFAULT_FRAME_SIZE}).",
    )
    parser.add_argument(
        "--frames-subdir",
        default=DEFAULT_FRAMES_SUBDIR,
        help=(
            "Frames subdirectory under each pony folder "
            f"(default: {DEFAULT_FRAMES_SUBDIR})."
        ),
    )
    parser.add_argument(
        "--fallback-subdir",
        default=DEFAULT_FALLBACK_SUBDIR,
        help=(
            "Fallback frames subdirectory when an action is missing "
            f"(default: {DEFAULT_FALLBACK_SUBDIR})."
        ),
    )
    parser.add_argument(
        "--prefer-dense",
        dest="prefer_dense",
        action="store_true",
        default=True,
        help="Prefer numeric dense frames when both dense and explicit keyframes exist.",
    )
    parser.add_argument(
        "--no-prefer-dense",
        dest="prefer_dense",
        action="store_false",
        help="Prefer explicit keyframes when both dense and explicit frames exist.",
    )
    parser.add_argument(
        "--max-size",
        type=int,
        default=DEFAULT_MAX_SIZE,
        help=f"Max sheet width/height in pixels (default: {DEFAULT_MAX_SIZE}).",
    )
    parser.add_argument(
        "--max-fps",
        type=float,
        default=DEFAULT_MAX_FPS,
        help=f"Max FPS when retiming dense animations (default: {DEFAULT_MAX_FPS}).",
    )
    parser.add_argument(
        "--actions-data",
        default=DEFAULT_ACTIONS,
        help=f"Path to actions JSON (default: {DEFAULT_ACTIONS}).",
    )
    parser.add_argument(
        "--auto-flip",
        action="store_true",
        help="Auto-flip frames to face right (disabled by default).",
    )
    parser.add_argument(
        "--retime",
        dest="retime",
        action="store_true",
        default=True,
        help="Scale FPS by dense frame count to keep motion speed (default on).",
    )
    parser.add_argument(
        "--no-retime",
        dest="retime",
        action="store_false",
        help="Keep original FPS even when dense frames are present.",
    )
    return parser.parse_args()


def calc_sheet_size(columns, rows, frame_size, padding):
    width = columns * frame_size + (columns - 1) * padding
    height = rows * frame_size + (rows - 1) * padding
    return width, height


def max_rows_for_sheet(max_size, frame_size, padding):
    return max(1, (max_size + padding) // (frame_size + padding))


def collect_action_frames(frames_dir, action_id, prefer_dense):
    explicit_order = get_action_frame_order(action_id) or []
    explicit_index = {name: idx for idx, name in enumerate(explicit_order)}
    explicit_frames = []
    numeric_frames = []

    for path in frames_dir.glob("*.png"):
        stem = path.stem
        if stem in explicit_index:
            explicit_frames.append((explicit_index[stem], path))
            continue
        if "_" not in stem:
            continue
        prefix, index = stem.rsplit("_", 1)
        if prefix != action_id:
            continue
        try:
            idx = int(index)
        except ValueError:
            continue
        numeric_frames.append((idx, path))

    if prefer_dense and numeric_frames:
        ordered = sorted(numeric_frames, key=lambda item: item[0])
    elif explicit_frames:
        ordered = sorted(explicit_frames, key=lambda item: item[0])
    else:
        ordered = sorted(numeric_frames, key=lambda item: item[0])

    frames = [path for _, path in ordered]
    names = [path.stem for _, path in ordered]
    return frames, names


def collect_action_frames_with_fallback(
    frames_dir, fallback_dir, action_id, prefer_dense
):
    frames, names = collect_action_frames(frames_dir, action_id, prefer_dense)
    if frames or not fallback_dir or fallback_dir == frames_dir:
        return frames, names
    return collect_action_frames(fallback_dir, action_id, prefer_dense)


def pack_action_pages(
    action_id,
    frames,
    names,
    sheets_dir,
    frame_size,
    columns,
    padding,
    max_size,
    auto_flip,
    sheet_index_start,
    frames_meta,
):
    if not frames:
        return [], sheet_index_start

    max_rows = max_rows_for_sheet(max_size, frame_size, padding)
    sheet_width, _ = calc_sheet_size(columns, 1, frame_size, padding)
    if sheet_width > max_size:
        raise SystemExit(
            f"Columns {columns} produce width {sheet_width}, exceeds max {max_size}."
        )

    frames_per_sheet = columns * max_rows
    sheet_entries = []
    for page_index in range(0, len(frames), frames_per_sheet):
        page_frames = frames[page_index : page_index + frames_per_sheet]
        rows = math.ceil(len(page_frames) / columns)
        sheet_width, sheet_height = calc_sheet_size(columns, rows, frame_size, padding)

        sheet = Image.new("RGBA", (sheet_width, sheet_height), (0, 0, 0, 0))
        for index, frame_path in enumerate(page_frames):
            col = index % columns
            row = index // columns
            x = col * (frame_size + padding)
            y = row * (frame_size + padding)

            if auto_flip:
                try:
                    if qc.enforce_facing_right(frame_path):
                        print(f"Auto-flipped {frame_path.name} to face right.")
                except RuntimeError as exc:
                    print(f"Facing check skipped for {frame_path.name}: {exc}")

            with Image.open(frame_path) as frame:
                if frame.size != (frame_size, frame_size):
                    raise SystemExit(
                        f"Frame {frame_path.name} has size {frame.size}, expected {frame_size}."
                    )
                sheet.paste(frame, (x, y))

            global_index = page_index + index
            frame_name = names[global_index]
            frames_meta[frame_name] = {
                "frame": {"x": x, "y": y, "w": frame_size, "h": frame_size},
                "anchor": {"x": frame_size // 2, "y": frame_size - 32},
                "sheet": sheet_index_start + len(sheet_entries),
            }

        image_name = f"{action_id}_{len(sheet_entries):02d}.png"
        sheet_path = sheets_dir / image_name
        sheet.save(sheet_path)
        sheet_entries.append(
            {
                "image": image_name,
                "action": action_id,
                "size": {"w": sheet_width, "h": sheet_height},
            }
        )
        print(f"Wrote {sheet_path}")

    return sheet_entries, sheet_index_start + len(sheet_entries)


def pack_spritesheet(
    pony_id,
    frame_size,
    columns,
    action_data,
    auto_flip,
    frames_subdir,
    prefer_dense,
    max_size,
    fallback_subdir,
    retime,
    max_fps,
):
    frames_dir = ROOT / DEFAULT_OUTPUT_ROOT / pony_id / frames_subdir
    fallback_dir = ROOT / DEFAULT_OUTPUT_ROOT / pony_id / fallback_subdir
    if not frames_dir.exists():
        if fallback_dir.exists():
            frames_dir = fallback_dir
        else:
            print(f"No frames directory for {pony_id}.")
            return False

    actions = action_data.get("actions", [])
    action_order = [action["id"] for action in actions]

    sheets_dir = ROOT / DEFAULT_OUTPUT_ROOT / pony_id / "sheets"
    sheets_dir.mkdir(parents=True, exist_ok=True)

    frames_meta = {}
    animations = {}
    sheet_entries = []
    sheet_index = 0

    for action_id in action_order:
        frames, names = collect_action_frames_with_fallback(
            frames_dir, fallback_dir, action_id, prefer_dense
        )
        if not frames:
            continue
        animations[action_id] = names
        entries, sheet_index = pack_action_pages(
            action_id=action_id,
            frames=frames,
            names=names,
            sheets_dir=sheets_dir,
            frame_size=frame_size,
            columns=columns,
            padding=DEFAULT_PADDING,
            max_size=max_size,
            auto_flip=auto_flip,
            sheet_index_start=sheet_index,
            frames_meta=frames_meta,
        )
        sheet_entries.extend(entries)

    if not sheet_entries:
        print(f"No frames found for {pony_id}.")
        return False

    base_fps = {action["id"]: action.get("fps", 1) for action in actions}
    base_frames = {action["id"]: action.get("frames", 1) for action in actions}
    fps = {}
    for action_id, fps_value in base_fps.items():
        actual_count = len(animations.get(action_id, []))
        if retime and actual_count:
            target_count = max(1, int(base_frames.get(action_id) or actual_count))
            ratio = actual_count / target_count
            scaled = fps_value * ratio
            if max_fps:
                scaled = min(float(max_fps), scaled)
            fps[action_id] = scaled
        else:
            fps[action_id] = fps_value
    meta = {
        "images": [entry["image"] for entry in sheet_entries],
        "sheets": sheet_entries,
    }
    if sheet_entries:
        meta["image"] = sheet_entries[0]["image"]
        meta["size"] = sheet_entries[0]["size"]

    spritesheet_json = {
        "meta": meta,
        "frames": frames_meta,
        "animations": animations,
        "fps": fps,
    }

    json_path = sheets_dir / "spritesheet.json"
    json_path.write_text(json.dumps(spritesheet_json, indent=2), encoding="utf-8")
    print(f"Wrote {json_path}")
    return True


def main():
    args = parse_args()
    action_data = load_json(args.actions_data)

    pony_root = ROOT / DEFAULT_OUTPUT_ROOT
    if args.pony:
        pony_ids = [args.pony]
    else:
        pony_ids = [path.name for path in pony_root.iterdir() if path.is_dir()]

    success = True
    for pony_id in sorted(pony_ids):
        result = pack_spritesheet(
            pony_id,
            args.frame_size,
            args.columns,
            action_data,
            args.auto_flip,
            args.frames_subdir,
            args.prefer_dense,
            args.max_size,
            args.fallback_subdir,
            args.retime,
            args.max_fps,
        )
        success = success and result

    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
