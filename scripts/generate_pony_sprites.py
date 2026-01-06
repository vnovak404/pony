#!/usr/bin/env python3
import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.sprites.prompting import build_sprite_prompt  # noqa: E402
from scripts.sprites import images_api, qc  # noqa: E402

DEFAULT_DATA = "data/ponies.json"
DEFAULT_ACTIONS = "data/pony_actions.json"
DEFAULT_OUTPUT_ROOT = "assets/ponies"
DEFAULT_JOBS = 6
DEFAULT_MAX_RETRIES = 5
FIXUP_SUFFIX = (
    " Make the pony smaller and centered with at least 15% transparent padding on all sides,"
    " not touching any edge. Transparent background, no cropping."
)


def load_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate pony sprite frames using the OpenAI Images API."
    )
    parser.add_argument("--pony", default="", help="Pony ID (slug) to generate.")
    parser.add_argument(
        "--actions",
        default="",
        help="Comma-separated action IDs to generate (default: all).",
    )
    parser.add_argument("--force", action="store_true", help="Overwrite existing frames.")
    parser.add_argument("--dry-run", action="store_true", help="Print prompts only.")
    parser.add_argument(
        "--jobs",
        type=int,
        default=DEFAULT_JOBS,
        help=f"Parallel jobs (default: {DEFAULT_JOBS}).",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=DEFAULT_MAX_RETRIES,
        help=f"Max retries per frame (default: {DEFAULT_MAX_RETRIES}).",
    )
    parser.add_argument(
        "--size",
        type=int,
        default=0,
        help="Sprite frame size in pixels (default: from pony_actions.json).",
    )
    parser.add_argument(
        "--source-image",
        default="",
        help="Path to a source image to edit into sprites (single pony only).",
    )
    parser.add_argument(
        "--use-portrait",
        action="store_true",
        help="Use the existing pony portrait image as source input.",
    )
    parser.add_argument(
        "--data",
        default=DEFAULT_DATA,
        help=f"Path to ponies JSON (default: {DEFAULT_DATA}).",
    )
    parser.add_argument(
        "--actions-data",
        default=DEFAULT_ACTIONS,
        help=f"Path to actions JSON (default: {DEFAULT_ACTIONS}).",
    )
    return parser.parse_args()


def log(prefix, message):
    print(f"[{prefix}] {message}", flush=True)


def build_frame_name(action_id, index):
    return f"{action_id}_{index + 1:02d}"


def select_actions(action_list, selected):
    if not selected:
        return action_list
    wanted = {item.strip() for item in selected.split(",") if item.strip()}
    return [action for action in action_list if action["id"] in wanted]


def generate_frame(task):
    pony = task["pony"]
    action = task["action"]
    frame_index = task["frame_index"]
    frame_count = task["frame_count"]
    out_path = task["out_path"]
    size = task["size"]
    dry_run = task["dry_run"]
    force = task["force"]
    max_retries = task["max_retries"]
    prefix = task["prefix"]
    source_image = task.get("source_image")

    if out_path.exists() and not force:
        log(prefix, f"Skipping existing frame {out_path.name}.")
        return "skipped"

    prompt = build_sprite_prompt(pony, action["id"], frame_index, frame_count)
    if source_image:
        prompt += (
            " Match the reference image exactly: same pony identity, colors, markings,"
            " mane and tail style. Only change the pose for this frame."
        )
    if dry_run:
        log(prefix, f"PROMPT: {prompt}")
        return "dry-run"

    temp_path = out_path.with_name(f"{out_path.stem}_tmp.png")
    for phase, suffix in enumerate(["", FIXUP_SUFFIX]):
        attempt_label = "base" if phase == 0 else "fixup"
        for attempt in range(1, max_retries + 1):
            if temp_path.exists():
                temp_path.unlink()
            try:
                if source_image and source_image.exists():
                    images_api.generate_png_from_image(
                        prompt + suffix, size, temp_path, source_image
                    )
                else:
                    if source_image:
                        log(prefix, f"Source image missing: {source_image}. Falling back.")
                    images_api.generate_png(prompt + suffix, size, temp_path)
            except Exception as exc:
                log(prefix, f"API error ({attempt_label} {attempt}/{max_retries}): {exc}")
                continue

            ok, reason = qc.qc_image(temp_path)
            if not ok and (
                reason == "No transparent pixels detected."
                or reason.startswith("Expected RGBA")
            ):
                if qc.try_fix_transparency(temp_path):
                    ok, reason = qc.qc_image(temp_path)
                    if ok:
                        log(prefix, "QC ok after background fix.")
                        temp_path.replace(out_path)
                        return "generated"
            if ok:
                flipped = False
                try:
                    flipped = qc.enforce_facing_right(temp_path)
                except RuntimeError as exc:
                    log(prefix, f"Facing check skipped: {exc}")
                if flipped:
                    log(prefix, "Auto-flipped to face right.")
                log(prefix, "QC ok.")
                temp_path.replace(out_path)
                return "generated"

            log(prefix, f"QC failed ({attempt_label} {attempt}/{max_retries}): {reason}")
            if temp_path.exists():
                temp_path.unlink()

            if phase == 0 and (
                reason.startswith("Subject area too large")
                or reason.startswith("Subject too close")
            ):
                break

    log(prefix, "Failed to generate a valid frame after retries.")
    return "failed"


def main():
    args = parse_args()
    pony_data = load_json(args.data)
    action_data = load_json(args.actions_data)

    ponies = pony_data.get("ponies", [])
    if args.pony:
        ponies = [pony for pony in ponies if pony.get("slug") == args.pony]

    if not ponies:
        print("No matching ponies found.")
        return 1

    if args.source_image and len(ponies) > 1:
        print("The --source-image option only supports a single pony.")
        return 1

    actions = action_data.get("actions", [])
    actions = select_actions(actions, args.actions)
    if not actions:
        print("No matching actions found.")
        return 1

    frame_size = args.size or action_data.get("sprite", {}).get("frame_size", 512)

    if not args.dry_run:
        images_api.ensure_api_key()
        qc.ensure_pillow()

    tasks = []
    for pony in ponies:
        pony_id = pony.get("slug")
        if not pony_id:
            continue
        pony_payload = dict(pony)
        pony_payload["frame_size"] = frame_size
        source_image = None
        if args.source_image:
            source_image = Path(args.source_image)
        elif args.use_portrait:
            source_image = ROOT / DEFAULT_OUTPUT_ROOT / f"{pony_id}.png"

        frame_dir = ROOT / DEFAULT_OUTPUT_ROOT / pony_id / "frames"
        frame_dir.mkdir(parents=True, exist_ok=True)
        for action in actions:
            frame_count = int(action.get("frames", 1))
            for frame_index in range(frame_count):
                frame_name = build_frame_name(action["id"], frame_index)
                out_path = frame_dir / f"{frame_name}.png"
                tasks.append(
                    {
                        "pony": pony_payload,
                        "action": action,
                        "frame_index": frame_index,
                        "frame_count": frame_count,
                        "out_path": out_path,
                        "size": frame_size,
                        "dry_run": args.dry_run,
                        "force": args.force,
                        "max_retries": args.max_retries,
                        "prefix": f"{pony_id}/{action['id']}/{frame_index + 1}",
                        "source_image": source_image,
                    }
                )

    if not tasks:
        print("No frames to generate.")
        return 0

    results = {"generated": 0, "skipped": 0, "failed": 0, "dry-run": 0}
    with ThreadPoolExecutor(max_workers=args.jobs) as executor:
        futures = [executor.submit(generate_frame, task) for task in tasks]
        for future in as_completed(futures):
            outcome = future.result()
            results[outcome] = results.get(outcome, 0) + 1

    print("Sprite generation complete.")
    for key, value in results.items():
        print(f"{key}: {value}")

    if results.get("failed"):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
