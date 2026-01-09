#!/usr/bin/env python3
import argparse
import json
import os
import random
import subprocess
import sys
import threading
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = "data/ponies.json"
DEFAULT_OUTPUT_DIR = "assets/ponies"
DEFAULT_ENV_FILE = ".env"
DEFAULT_SPRITE_JOBS = 6
DEFAULT_SPRITE_RETRIES = 5
DEFAULT_MAP_PATH = "assets/world/maps/ponyville.json"
DEFAULT_STATE_PATH = "data/runtime_state.json"
HOUSE_SHARE_CHANCE = 0.35
HOUSE_GROUP_CHANCE = 0.2
FOOD_PREFERENCES = ["restaurant", "picnic", "bakery"]
DRINK_PREFERENCES = ["lemonade", "well"]
HOUSE_LOTS = [
    {"x": 8.5, "y": 4.2},
    {"x": 13.5, "y": 4.2},
    {"x": 22.5, "y": 4.2},
    {"x": 27.5, "y": 4.2},
    {"x": 32.5, "y": 4.2},
    {"x": 5.5, "y": 18.8},
    {"x": 13.5, "y": 20.2},
    {"x": 18.5, "y": 20.2},
    {"x": 24.5, "y": 20.2},
    {"x": 30.5, "y": 20.2},
    {"x": 35.5, "y": 18.8},
]


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
    job_payload = payload.get("job") if isinstance(payload, dict) else {}
    if not isinstance(job_payload, dict):
        job_payload = {}
    job_title = sanitize_value(job_payload.get("title"), "helper")
    job_service = sanitize_value(
        job_payload.get("service"),
        "helps with friendly pony tasks",
    )
    job_paid_in = sanitize_value(job_payload.get("paid_in"), "kindness tokens")
    house_payload = payload.get("house") if isinstance(payload, dict) else {}
    if not isinstance(house_payload, dict):
        house_payload = {}
    house_id = sanitize_value(house_payload.get("id"), f"house-{slug}", max_len=80)
    house_name = sanitize_value(house_payload.get("name"), f"{name}'s House")
    drives_payload = payload.get("drives") if isinstance(payload, dict) else {}
    if not isinstance(drives_payload, dict):
        drives_payload = {}
    eat_payload = drives_payload.get("eat") if isinstance(drives_payload, dict) else {}
    if not isinstance(eat_payload, dict):
        eat_payload = {}
    drink_payload = drives_payload.get("drink") if isinstance(drives_payload, dict) else {}
    if not isinstance(drink_payload, dict):
        drink_payload = {}
    eat_threshold = eat_payload.get("threshold", 60)
    try:
        eat_threshold = int(eat_threshold)
    except (TypeError, ValueError):
        eat_threshold = 60
    eat_preference = sanitize_value(eat_payload.get("preference"), "")
    if not eat_preference:
        eat_preference = random.choice(FOOD_PREFERENCES)
    drink_threshold = drink_payload.get("threshold", 55)
    try:
        drink_threshold = int(drink_threshold)
    except (TypeError, ValueError):
        drink_threshold = 55
    drink_preference = sanitize_value(drink_payload.get("preference"), "")
    if not drink_preference:
        drink_preference = random.choice(DRINK_PREFERENCES)
    pony = {
        "name": name,
        "slug": slug,
        "species": species,
        "body_color": sanitize_value(payload.get("body_color"), "sunny yellow"),
        "mane_color": sanitize_value(payload.get("mane_color"), "royal purple"),
        "accent_color": sanitize_value(payload.get("accent_color"), "buttercream"),
        "talent": sanitize_value(payload.get("talent"), "making friends"),
        "personality": sanitize_value(payload.get("personality"), "kind and curious"),
        "job": {
            "title": job_title,
            "service": job_service,
            "paid_in": job_paid_in,
        },
        "stats": {
            "health": int(payload.get("health", 92)) if isinstance(payload, dict) else 92,
            "hunger": int(payload.get("hunger", 28)) if isinstance(payload, dict) else 28,
            "thirst": int(payload.get("thirst", 20)) if isinstance(payload, dict) else 20,
            "boredom": int(payload.get("boredom", 24)) if isinstance(payload, dict) else 24,
            "tiredness": int(payload.get("tiredness", 35))
            if isinstance(payload, dict)
            else 35,
        },
        "house": {
            "id": house_id,
            "name": house_name,
        },
        "drives": {
            "eat": {
                "threshold": eat_threshold,
                "preference": eat_preference,
            },
            "drink": {
                "threshold": drink_threshold,
                "preference": drink_preference,
            },
        },
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


def ensure_output_dir(path):
    full_path = ROOT / path
    full_path.mkdir(parents=True, exist_ok=True)


def ensure_pony_asset_dirs(slug):
    base = ROOT / DEFAULT_OUTPUT_DIR / slug
    (base / "frames").mkdir(parents=True, exist_ok=True)
    (base / "sheets").mkdir(parents=True, exist_ok=True)


def assign_house(ponies, pony):
    existing = {}
    for entry in ponies:
        house = entry.get("house") or {}
        house_id = house.get("id")
        if house_id:
            existing.setdefault(house_id, []).append(entry)

    share = bool(existing) and random.random() < HOUSE_SHARE_CHANCE
    if share:
        if random.random() < HOUSE_GROUP_CHANCE:
            candidates = [hid for hid, residents in existing.items() if len(residents) >= 2]
        else:
            candidates = []
        if not candidates:
            candidates = list(existing.keys())
        house_id = random.choice(candidates)
        residents = existing.get(house_id, [])
        house_name = None
        for resident in residents:
            house_name = (resident.get("house") or {}).get("name")
            if house_name:
                break
        house_name = house_name or pony["house"].get("name") or f"{pony['name']}'s House"
        pony["house"] = {
            "id": house_id,
            "name": house_name,
            "shared": True,
        }
        for resident in residents:
            resident_house = resident.setdefault("house", {})
            resident_house["id"] = house_id
            resident_house.setdefault("name", house_name)
            resident_house["shared"] = True
        return house_id, False

    pony["house"] = {
        "id": pony["house"].get("id") or f"house-{pony['slug']}",
        "name": pony["house"].get("name") or f"{pony['name']}'s House",
        "shared": False,
    }
    return pony["house"]["id"], True


def ensure_house_on_map(map_path, house, residents):
    map_data = load_data(map_path)
    layers = map_data.setdefault("layers", {})
    objects = layers.setdefault("objects", [])
    for item in objects:
        if item.get("id") == house["id"]:
            item["label"] = item.get("label") or house.get("name")
            item["residents"] = residents
            if house.get("shared"):
                item["scale"] = max(float(item.get("scale", 1.5)), 1.7)
            save_data(map_path, map_data)
            return

    used = {
        ((item.get("at") or {}).get("x"), (item.get("at") or {}).get("y"))
        for item in objects
    }
    spot = None
    for candidate in HOUSE_LOTS:
        if (candidate["x"], candidate["y"]) not in used:
            spot = candidate
            break
    if not spot:
        spot = {"x": 2.5 + random.random() * 35, "y": 2.5 + random.random() * 19}

    objects.append(
        {
            "id": house["id"],
            "kind": "house",
            "at": {"x": round(spot["x"], 2), "y": round(spot["y"], 2)},
            "spritePath": f"/assets/world/houses/{house['id']}.png",
            "label": house["name"],
            "residents": residents,
            "scale": 1.7 if house.get("shared") else 1.5,
        }
    )
    save_data(map_path, map_data)


def launch_async(target, *args):
    thread = threading.Thread(target=target, args=args, daemon=True)
    thread.start()


def run_post_create_tasks(slug, generate_house_variants=False):
    try:
        run_sprite_generator(slug, {"use_portrait": True})
        interpolation_ok = True
        try:
            run_interpolator(slug, {})
        except Exception as exc:
            interpolation_ok = False
            print(f"Interpolation failed for {slug}: {exc}", file=sys.stderr)
        if interpolation_ok:
            run_spritesheet_packer(slug, {})
        else:
            run_spritesheet_packer(slug, {"frames_subdir": "frames", "prefer_dense": False})
    except Exception as exc:
        print(f"Sprite pipeline failed for {slug}: {exc}", file=sys.stderr)
    try:
        run_house_generator(slug)
        if generate_house_variants:
            run_house_state_generator(slug)
    except Exception as exc:
        print(f"House generation failed for {slug}: {exc}", file=sys.stderr)


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
    def __init__(
        self,
        *args,
        data_path=None,
        output_dir=None,
        env_file=None,
        map_path=None,
        state_path=None,
        **kwargs,
    ):
        self.data_path = data_path or DEFAULT_DATA
        self.output_dir = output_dir or DEFAULT_OUTPUT_DIR
        self.env_file = env_file or DEFAULT_ENV_FILE
        self.map_path = map_path or DEFAULT_MAP_PATH
        self.state_path = state_path or DEFAULT_STATE_PATH
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/state":
            return self._handle_get_state()
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/ponies":
            return self._handle_create_pony()

        if path.startswith("/api/ponies/"):
            return self._handle_sprite_actions()

        if path.startswith("/api/map/objects/"):
            return self._handle_update_map_object()

        if path == "/api/state":
            return self._handle_save_state()

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

    def _handle_get_state(self):
        state_path = ROOT / self.state_path
        if not state_path.exists():
            self.send_json(
                HTTPStatus.OK,
                {"version": 1, "ponies": {}, "updatedAt": None},
            )
            return
        try:
            payload = load_data(state_path)
        except Exception:
            self.send_json(
                HTTPStatus.OK,
                {"version": 1, "ponies": {}, "updatedAt": None},
            )
            return
        if not isinstance(payload, dict):
            payload = {"version": 1, "ponies": {}, "updatedAt": None}
        payload.setdefault("version", 1)
        payload.setdefault("ponies", {})
        self.send_json(HTTPStatus.OK, payload)
        return

    def _handle_save_state(self):
        payload = load_json_body(self)
        if payload is None:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "Invalid JSON body."},
            )
            return
        state_path = ROOT / self.state_path
        try:
            state_path.parent.mkdir(parents=True, exist_ok=True)
            save_data(state_path, payload)
        except Exception as exc:
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": str(exc)},
            )
            return
        self.send_json(HTTPStatus.OK, {"status": "ok"})
        return

    def _handle_update_map_object(self):
        parts = self.path.strip("/").split("/")
        if len(parts) != 4 or parts[:3] != ["api", "map", "objects"]:
            self.send_error(HTTPStatus.NOT_FOUND, "Not Found")
            return

        object_id = parts[3]
        payload = load_json_body(self)
        if payload is None:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "Invalid JSON body."},
            )
            return

        at = payload.get("at") if isinstance(payload, dict) else None
        x = payload.get("x")
        y = payload.get("y")
        if isinstance(at, dict):
            x = at.get("x", x)
            y = at.get("y", y)

        try:
            x = float(x)
            y = float(y)
        except (TypeError, ValueError):
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "x and y must be numbers."},
            )
            return

        map_path = ROOT / self.map_path
        try:
            map_data = load_data(map_path)
        except FileNotFoundError:
            self.send_json(
                HTTPStatus.NOT_FOUND,
                {"error": "Map data not found."},
            )
            return

        meta = map_data.get("meta", {})
        width = float(meta.get("width", 0) or 0)
        height = float(meta.get("height", 0) or 0)
        if width > 0:
            x = max(0.0, min(width, x))
        if height > 0:
            y = max(0.0, min(height, y))

        layers = map_data.get("layers", {})
        objects = layers.get("objects", [])
        target = None
        for item in objects:
            if item.get("id") == object_id:
                target = item
                break

        if not target:
            self.send_json(
                HTTPStatus.NOT_FOUND,
                {"error": "Map object not found."},
            )
            return

        target["at"] = {"x": round(x, 2), "y": round(y, 2)}
        save_data(map_path, map_data)
        self.send_json(
            HTTPStatus.OK,
            {"status": "ok", "object": target},
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

        house_id, is_new_house = assign_house(ponies, pony)

        ponies.append(pony)
        data["ponies"] = ponies

        try:
            save_data(data_path, data)
            try:
                residents = [
                    entry.get("name")
                    for entry in ponies
                    if (entry.get("house") or {}).get("id") == house_id
                ]
                if residents:
                    ensure_house_on_map(
                        ROOT / self.map_path,
                        pony.get("house", {}),
                        residents,
                    )
            except Exception as exc:
                print(f"Map update failed for {pony['slug']}: {exc}", file=sys.stderr)
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

        generate_variants = bool(is_new_house) and pony.get("species") == "unicorn"
        launch_async(run_post_create_tasks, pony["slug"], generate_variants)

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
    parser.add_argument("--map", default=DEFAULT_MAP_PATH)
    parser.add_argument("--state", default=DEFAULT_STATE_PATH)
    return parser.parse_args()


def main():
    args = parse_args()

    handler = lambda *handler_args, **handler_kwargs: PonyHandler(  # noqa: E731
        *handler_args,
        data_path=args.data,
        output_dir=args.output_dir,
        env_file=args.env_file,
        map_path=args.map,
        state_path=args.state,
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
