#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = "data/ponies.json"
DEFAULT_OUTPUT_DIR = "assets/ponies"
DEFAULT_ENV_FILE = ".env"
DEFAULT_SPRITE_JOBS = 6
DEFAULT_SPRITE_RETRIES = 5


def slugify(name):
    return "-".join(
        "".join(ch.lower() if ch.isalnum() else " " for ch in name).split()
    )


def load_data(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def save_data(path, payload):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=False)
        handle.write("\n")


def sanitize_value(value, fallback="", max_len=120):
    if not isinstance(value, str):
        return fallback
    value = value.strip()
    if not value:
        return fallback
    return value[:max_len]


def normalize_name(name):
    return " ".join(name.strip().lower().split())


def build_pony(payload):
    name = sanitize_value(payload.get("name"), "New Pony")
    species = sanitize_value(payload.get("species"), "pony").lower()
    if species not in {"pony", "unicorn"}:
        species = "pony"

    slug = slugify(name)
    pony = {
        "name": name,
        "slug": slug,
        "species": species,
        "body_color": sanitize_value(payload.get("body_color"), "sunny yellow"),
        "mane_color": sanitize_value(payload.get("mane_color"), "royal purple"),
        "accent_color": sanitize_value(payload.get("accent_color"), "buttercream"),
        "talent": sanitize_value(payload.get("talent"), "making friends"),
        "personality": sanitize_value(payload.get("personality"), "kind and curious"),
        "sprites": {
            "sheet": f"assets/ponies/{slug}/sheets/spritesheet.png",
            "meta": f"assets/ponies/{slug}/sheets/spritesheet.json",
        },
    }
    return pony


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


def ensure_output_dir(path):
    full_path = ROOT / path
    full_path.mkdir(parents=True, exist_ok=True)


def ensure_pony_asset_dirs(slug):
    base = ROOT / DEFAULT_OUTPUT_DIR / slug
    (base / "frames").mkdir(parents=True, exist_ok=True)
    (base / "sheets").mkdir(parents=True, exist_ok=True)


def load_json_body(handler):
    length = int(handler.headers.get("Content-Length", "0"))
    if length <= 0:
        return None
    raw_body = handler.rfile.read(length)
    try:
        return json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError:
        return None


class PonyHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, data_path=None, output_dir=None, env_file=None, **kwargs):
        self.data_path = data_path or DEFAULT_DATA
        self.output_dir = output_dir or DEFAULT_OUTPUT_DIR
        self.env_file = env_file or DEFAULT_ENV_FILE
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path == "/api/ponies":
            return self._handle_create_pony()

        if self.path.startswith("/api/ponies/"):
            return self._handle_sprite_actions()

        self.send_error(HTTPStatus.NOT_FOUND, "Not Found")
        return

    def _handle_sprite_actions(self):
        parts = self.path.strip("/").split("/")
        if len(parts) != 4 or parts[0] != "api" or parts[1] != "ponies":
            self.send_error(HTTPStatus.NOT_FOUND, "Not Found")
            return

        pony_id = parts[2]
        action = parts[3]
        if action not in {"sprites", "spritesheet"}:
            self.send_error(HTTPStatus.NOT_FOUND, "Not Found")
            return

        payload = load_json_body(self) or {}
        data_path = ROOT / self.data_path
        data = load_data(data_path)
        ponies = data.get("ponies", [])
        if not any(pony.get("slug") == pony_id for pony in ponies):
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Pony not found."})
            return

        try:
            if action == "sprites":
                result = run_sprite_generator(pony_id, payload)
                self.send_json(
                    HTTPStatus.OK,
                    {
                        "status": "ok",
                        "message": "Sprite frames generated.",
                        "pony": pony_id,
                        "output": result,
                    },
                )
                return

            result = run_spritesheet_packer(pony_id, payload)
            self.send_json(
                HTTPStatus.OK,
                {
                    "status": "ok",
                    "message": "Spritesheet packed.",
                    "pony": pony_id,
                    "output": result,
                },
            )
        except Exception as exc:
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": str(exc)},
            )
        return

    def _handle_create_pony(self):
        payload = load_json_body(self)
        if payload is None:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "Invalid JSON body."},
            )
            return

        data_path = ROOT / self.data_path
        data = load_data(data_path)
        ponies = data.get("ponies", [])

        pony = build_pony(payload)
        if not pony["slug"]:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "Pony name is required."},
            )
            return

        normalized_name = normalize_name(pony["name"])
        if any(normalize_name(existing.get("name", "")) == normalized_name for existing in ponies):
            self.send_json(
                HTTPStatus.CONFLICT,
                {"error": "A pony with that name already exists."},
            )
            return

        if any(existing.get("slug") == pony["slug"] for existing in ponies):
            self.send_json(
                HTTPStatus.CONFLICT,
                {"error": "A pony with that name already exists."},
            )
            return

        ponies.append(pony)
        data["ponies"] = ponies

        try:
            save_data(data_path, data)
            ensure_output_dir(self.output_dir)
            ensure_pony_asset_dirs(pony["slug"])
            run_generator(
                argparse.Namespace(
                    data=self.data_path,
                    output_dir=self.output_dir,
                    env_file=self.env_file,
                ),
                pony["slug"],
            )
        except Exception as exc:
            ponies.pop()
            data["ponies"] = ponies
            save_data(data_path, data)
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": str(exc)},
            )
            return

        image_path = f"{self.output_dir}/{pony['slug']}.png"
        self.send_json(
            HTTPStatus.CREATED,
            {"pony": pony, "image_path": image_path},
        )
        return


def parse_args():
    parser = argparse.ArgumentParser(
        description="Serve the Pony Parade site and generate new pony images.",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--data", default=DEFAULT_DATA)
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--env-file", default=DEFAULT_ENV_FILE)
    return parser.parse_args()


def main():
    args = parse_args()

    handler = lambda *handler_args, **handler_kwargs: PonyHandler(  # noqa: E731
        *handler_args,
        data_path=args.data,
        output_dir=args.output_dir,
        env_file=args.env_file,
        **handler_kwargs,
    )

    with ThreadingHTTPServer((args.host, args.port), handler) as server:
        print(f"Serving Pony Parade at http://{args.host}:{args.port}")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")


if __name__ == "__main__":
    raise SystemExit(main())
