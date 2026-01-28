from http import HTTPStatus
from pathlib import Path

from ..config import DEFAULT_MISSION_PROGRESS_PATH, ROOT
from ..io import load_data, load_json_body, save_data


class StateHandlerMixin:
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

    def _handle_get_mission_progress(self):
        progress_path = Path(DEFAULT_MISSION_PROGRESS_PATH)
        if not progress_path.exists():
            self.send_json(HTTPStatus.OK, {"version": 1, "globals": {}, "missions": {}})
            return
        try:
            payload = load_data(progress_path)
        except Exception:
            self.send_json(HTTPStatus.OK, {"version": 1, "globals": {}, "missions": {}})
            return
        if not isinstance(payload, dict):
            payload = {"version": 1, "globals": {}, "missions": {}}
        payload.setdefault("version", 1)
        payload.setdefault("globals", {})
        payload.setdefault("missions", {})
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

    def _handle_save_mission_progress(self):
        payload = load_json_body(self)
        if payload is None:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body."})
            return
        progress_path = Path(DEFAULT_MISSION_PROGRESS_PATH)
        try:
            progress_path.parent.mkdir(parents=True, exist_ok=True)
            save_data(progress_path, payload)
        except Exception as exc:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})
            return
        self.send_json(HTTPStatus.OK, {"status": "ok"})
        return
