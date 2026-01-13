import argparse
import json
import sys
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler

from .config import (
    DEFAULT_DATA,
    DEFAULT_ENV_FILE,
    DEFAULT_MAP_PATH,
    DEFAULT_OUTPUT_DIR,
    DEFAULT_STATE_PATH,
    ROOT,
)
from .generators import (
    launch_async,
    run_generator,
    run_post_create_tasks,
    run_sprite_generator,
    run_spritesheet_packer,
)
from .io import load_data, load_json_body, save_data
from .pony import (
    assign_house,
    build_pony,
    ensure_house_on_map,
    ensure_output_dir,
    ensure_pony_asset_dirs,
)
from .utils import normalize_name


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
        if path == "/api/health":
            return self.send_json(HTTPStatus.OK, {"ok": True})
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

        generate_variants = True
        launch_async(run_post_create_tasks, pony["slug"], generate_variants, self.env_file)

        image_path = f"{self.output_dir}/{pony['slug']}.webp"
        self.send_json(
            HTTPStatus.CREATED,
            {"pony": pony, "image_path": image_path},
        )
        return
