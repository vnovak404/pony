#!/usr/bin/env python3
import argparse
import json
import math
from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:
    raise SystemExit("Pillow is required. Install with: pip install pillow") from exc

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ACTIONS = "data/pony_actions.json"
DEFAULT_OUTPUT_ROOT = "assets/ponies"
DEFAULT_COLUMNS = 8
DEFAULT_FRAME_SIZE = 512
DEFAULT_PADDING = 2


def load_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Pack pony sprite frames into a spritesheet and metadata JSON."
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
        "--actions-data",
        default=DEFAULT_ACTIONS,
        help=f"Path to actions JSON (default: {DEFAULT_ACTIONS}).",
    )
    return parser.parse_args()


def collect_frames(frames_dir, action_order):
    frames_by_action = {action_id: [] for action_id in action_order}
    for path in frames_dir.glob("*.png"):
        stem = path.stem
        if "_" not in stem:
            continue
        action_id, index = stem.rsplit("_", 1)
        if action_id not in frames_by_action:
            continue
        try:
            idx = int(index)
        except ValueError:
            continue
        frames_by_action[action_id].append((idx, path))

    ordered_frames = []
    animations = {}
    for action_id in action_order:
        frames = sorted(frames_by_action[action_id], key=lambda item: item[0])
        if not frames:
            continue
        frame_names = []
        for _, path in frames:
            frame_names.append(path.stem)
            ordered_frames.append(path)
        animations[action_id] = frame_names
    return ordered_frames, animations


def pack_spritesheet(pony_id, frame_size, columns, action_data):
    frames_dir = ROOT / DEFAULT_OUTPUT_ROOT / pony_id / "frames"
    if not frames_dir.exists():
        print(f"No frames directory for {pony_id}.")
        return False

    actions = action_data.get("actions", [])
    action_order = [action["id"] for action in actions]
    ordered_frames, animations = collect_frames(frames_dir, action_order)

    if not ordered_frames:
        print(f"No frames found for {pony_id}.")
        return False

    rows = math.ceil(len(ordered_frames) / columns)
    sheet_width = columns * frame_size + (columns - 1) * DEFAULT_PADDING
    sheet_height = rows * frame_size + (rows - 1) * DEFAULT_PADDING

    sheet = Image.new("RGBA", (sheet_width, sheet_height), (0, 0, 0, 0))

    frames_meta = {}
    for index, frame_path in enumerate(ordered_frames):
        col = index % columns
        row = index // columns
        x = col * (frame_size + DEFAULT_PADDING)
        y = row * (frame_size + DEFAULT_PADDING)

        with Image.open(frame_path) as frame:
            if frame.size != (frame_size, frame_size):
                raise SystemExit(
                    f"Frame {frame_path.name} has size {frame.size}, expected {frame_size}."
                )
            sheet.paste(frame, (x, y))

        frames_meta[frame_path.stem] = {
            "frame": {"x": x, "y": y, "w": frame_size, "h": frame_size},
            "anchor": {"x": frame_size // 2, "y": frame_size - 32},
        }

    sheets_dir = ROOT / DEFAULT_OUTPUT_ROOT / pony_id / "sheets"
    sheets_dir.mkdir(parents=True, exist_ok=True)

    sheet_path = sheets_dir / "spritesheet.png"
    sheet.save(sheet_path)

    fps = {action["id"]: action.get("fps", 1) for action in actions}
    meta = {
        "image": sheet_path.name,
        "size": {"w": sheet_width, "h": sheet_height},
    }
    spritesheet_json = {
        "meta": meta,
        "frames": frames_meta,
        "animations": animations,
        "fps": fps,
    }

    json_path = sheets_dir / "spritesheet.json"
    json_path.write_text(json.dumps(spritesheet_json, indent=2), encoding="utf-8")
    print(f"Wrote {sheet_path}")
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
        result = pack_spritesheet(pony_id, args.frame_size, args.columns, action_data)
        success = success and result

    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
