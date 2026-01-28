import argparse
import json
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler

from .config import (
    DEFAULT_ASSET_MANIFEST,
    DEFAULT_DATA,
    DEFAULT_ENV_FILE,
    DEFAULT_MAP_PATH,
    DEFAULT_OUTPUT_DIR,
    DEFAULT_STATE_PATH,
    ROOT,
)
from .logging_utils import log_event, make_request_id
from .handlers import (
    AssetHandlerMixin,
    MapHandlerMixin,
    MissionHandlerMixin,
    PonyHandlerMixin,
    StateHandlerMixin,
)

SERVER_LOG_DIR = ROOT / "logs/server"
MISSION_LOG_DIR = ROOT / "logs/mission-generator"


class PonyHandler(
    MissionHandlerMixin,
    PonyHandlerMixin,
    AssetHandlerMixin,
    MapHandlerMixin,
    StateHandlerMixin,
    SimpleHTTPRequestHandler,
):
    def __init__(
        self,
        *args,
        data_path=None,
        output_dir=None,
        env_file=None,
        map_path=None,
        state_path=None,
        asset_manifest_path=None,
        **kwargs,
    ):
        self.data_path = data_path or DEFAULT_DATA
        self.output_dir = output_dir or DEFAULT_OUTPUT_DIR
        self.env_file = env_file or DEFAULT_ENV_FILE
        self.map_path = map_path or DEFAULT_MAP_PATH
        self.state_path = state_path or DEFAULT_STATE_PATH
        self.asset_manifest_path = asset_manifest_path or DEFAULT_ASSET_MANIFEST
        self._request_id = None
        self._request_start = None
        self._request_path = None
        self._response_logged = False
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        self._finish_request(status, payload)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path.startswith("/api/"):
            self._begin_request("GET", path, None)
        if path == "/api/health":
            return self.send_json(HTTPStatus.OK, {"ok": True})
        if path == "/api/assets/manifest":
            return self._handle_asset_manifest()
        if path == "/api/adventures":
            return self._handle_list_adventures()
        if path == "/api/state":
            return self._handle_get_state()
        if path == "/api/mission-progress":
            return self._handle_get_mission_progress()
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path.startswith("/api/"):
            self._begin_request("POST", path, None)
        if path == "/api/ponies":
            return self._handle_create_pony()

        if path.startswith("/api/ponies/"):
            return self._handle_sprite_actions()

        if path == "/api/map/refine":
            return self._handle_map_refine()

        if path.startswith("/api/map/objects/"):
            return self._handle_update_map_object()

        if path == "/api/assets/generate":
            return self._handle_asset_generate()

        if path == "/api/missions/plan":
            return self._handle_mission_plan()

        if path == "/api/missions/generate":
            return self._handle_mission_generate()

        if path == "/api/missions/validate":
            return self._handle_mission_validate()

        if path == "/api/missions/save":
            return self._handle_mission_save()

        if path == "/api/missions/draft":
            return self._handle_mission_draft()

        if path == "/api/state":
            return self._handle_save_state()

        if path == "/api/mission-progress":
            return self._handle_save_mission_progress()

        self.send_error(HTTPStatus.NOT_FOUND, "Not Found")
        return

    def _begin_request(self, method, path, payload):
        self._request_id = make_request_id("srv")
        self._request_start = time.time()
        self._request_path = path
        self._response_logged = False
        log_event(
            SERVER_LOG_DIR / "requests.jsonl",
            {
                "request_id": self._request_id,
                "method": method,
                "path": path,
                "payload": payload,
            },
        )

    def _finish_request(self, status, payload):
        if not self._request_id or self._response_logged:
            return
        duration_ms = None
        if self._request_start:
            duration_ms = int((time.time() - self._request_start) * 1000)
        log_event(
            SERVER_LOG_DIR / "responses.jsonl",
            {
                "request_id": self._request_id,
                "path": self._request_path,
                "status": status,
                "duration_ms": duration_ms,
                "payload": payload,
            },
        )
        self._response_logged = True

    def _log_server_event(self, kind, payload):
        log_event(
            SERVER_LOG_DIR / "events.jsonl",
            {
                "request_id": self._request_id,
                "event": kind,
                **(payload or {}),
            },
        )

    def _log_mission_event(self, kind, payload):
        log_event(
            MISSION_LOG_DIR / f"{kind}.jsonl",
            {
                "request_id": self._request_id,
                "event": kind,
                **(payload or {}),
            },
        )
