import subprocess
import sys
import threading

from .config import DEFAULT_SPRITE_JOBS, DEFAULT_SPRITE_RETRIES, ROOT


def _coerce_actions(actions):
    if not actions:
        return ""
    if isinstance(actions, str):
        return actions
    if isinstance(actions, list):
        return ",".join(str(action).strip() for action in actions if str(action).strip())
    return ""


def _truncate_output(text, limit=2000):
    if not text:
        return ""
    if len(text) <= limit:
        return text
    return f"{text[:limit]}...\n(truncated)"


def run_generator(args, slug):
    command = [
        sys.executable,
        "scripts/generate_pony_images.py",
        "--only",
        slug,
        "--count",
        "1",
        "--overwrite",
        "--data",
        args.data,
        "--output-dir",
        args.output_dir,
        "--env-file",
        args.env_file,
    ]
    result = subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or "Image generation failed.")


def run_sprite_generator(slug, payload):
    actions = _coerce_actions(payload.get("actions"))
    force = bool(payload.get("force")) if payload else False
    dry_run = bool(payload.get("dry_run")) if payload else False
    size = int(payload.get("size", 0) or 0) if payload else 0
    jobs = int(payload.get("jobs", DEFAULT_SPRITE_JOBS) or DEFAULT_SPRITE_JOBS)
    retries = int(
        payload.get("max_retries", DEFAULT_SPRITE_RETRIES) or DEFAULT_SPRITE_RETRIES
    )
    use_portrait = bool(payload.get("use_portrait")) if payload else False
    source_image = payload.get("source_image") if payload else ""

    command = [
        sys.executable,
        "scripts/generate_pony_sprites.py",
        "--pony",
        slug,
        "--jobs",
        str(jobs),
        "--max-retries",
        str(retries),
    ]
    if actions:
        command += ["--actions", actions]
    if size:
        command += ["--size", str(size)]
    if force:
        command.append("--force")
    if dry_run:
        command.append("--dry-run")
    if use_portrait:
        command.append("--use-portrait")
    if source_image:
        command += ["--source-image", str(source_image)]

    result = subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or "Sprite generation failed.")

    return {
        "stdout": _truncate_output(result.stdout),
        "stderr": _truncate_output(result.stderr),
    }


def run_spritesheet_packer(slug, payload):
    columns = int(payload.get("columns", 8) or 8) if payload else 8
    frame_size = int(payload.get("frame_size", 512) or 512) if payload else 512
    frames_subdir = payload.get("frames_subdir") if payload else None
    fallback_subdir = payload.get("fallback_subdir") if payload else None
    prefer_dense = payload.get("prefer_dense") if payload else None
    max_size = payload.get("max_size") if payload else None
    auto_flip = payload.get("auto_flip") if payload else None

    command = [
        sys.executable,
        "scripts/pack_spritesheet.py",
        "--pony",
        slug,
        "--columns",
        str(columns),
        "--frame-size",
        str(frame_size),
    ]
    if frames_subdir:
        command += ["--frames-subdir", str(frames_subdir)]
    if fallback_subdir:
        command += ["--fallback-subdir", str(fallback_subdir)]
    if prefer_dense is False:
        command.append("--no-prefer-dense")
    if max_size:
        command += ["--max-size", str(max_size)]
    if auto_flip:
        command.append("--auto-flip")
    result = subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or "Spritesheet packing failed.")

    return {
        "stdout": _truncate_output(result.stdout),
        "stderr": _truncate_output(result.stderr),
    }


def run_interpolator(slug, payload):
    payload = payload or {}
    command = [
        sys.executable,
        "scripts/interpolate_pony_sprites.py",
        "--pony",
        slug,
    ]
    actions = payload.get("actions")
    if actions:
        command += ["--actions", str(actions)]
    input_subdir = payload.get("input_subdir")
    if input_subdir:
        command += ["--input-subdir", str(input_subdir)]
    output_subdir = payload.get("output_subdir")
    if output_subdir:
        command += ["--output-subdir", str(output_subdir)]
    walk_inbetweens = payload.get("walk_inbetweens")
    if walk_inbetweens is not None:
        command += ["--walk-inbetweens", str(walk_inbetweens)]
    trot_inbetweens = payload.get("trot_inbetweens")
    if trot_inbetweens is not None:
        command += ["--trot-inbetweens", str(trot_inbetweens)]
    pad = payload.get("pad")
    if pad is not None:
        command += ["--pad", str(pad)]
    alpha_threshold = payload.get("alpha_threshold")
    if alpha_threshold is not None:
        command += ["--alpha-threshold", str(alpha_threshold)]
    max_shift = payload.get("max_shift")
    if max_shift is not None:
        command += ["--max-shift", str(max_shift)]
    if payload.get("force"):
        command.append("--force")
    if payload.get("no_qc"):
        command.append("--no-qc")
    if payload.get("dry_run"):
        command.append("--dry-run")

    result = subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or "Interpolation failed.")

    return {
        "stdout": _truncate_output(result.stdout),
        "stderr": _truncate_output(result.stderr),
    }


def run_house_generator(slug):
    command = [
        sys.executable,
        "scripts/generate_pony_houses.py",
        "--pony",
        slug,
    ]
    result = subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or "House asset generation failed.")


def run_house_state_generator(slug):
    command = [
        sys.executable,
        "scripts/generate_house_state_assets.py",
        "--pony",
        slug,
    ]
    result = subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            result.stderr or result.stdout or "House state generation failed."
        )


def launch_async(target, *args):
    thread = threading.Thread(target=target, args=args, daemon=True)
    thread.start()


def run_post_create_tasks(slug, generate_house_variants=False):
    try:
        run_sprite_generator(slug, {"use_portrait": True})
        run_spritesheet_packer(
            slug,
            {"frames_subdir": "frames", "fallback_subdir": "frames", "prefer_dense": False},
        )
    except Exception as exc:
        print(f"Sprite pipeline failed for {slug}: {exc}", file=sys.stderr)
    try:
        run_house_generator(slug)
        if generate_house_variants:
            run_house_state_generator(slug)
    except Exception as exc:
        print(f"House generation failed for {slug}: {exc}", file=sys.stderr)
