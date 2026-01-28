import json
import sys
import time
import traceback
from http import HTTPStatus

from ..config import ROOT
from ..asset_generation import generate_asset
from ..io import load_json_body


class AssetHandlerMixin:
    def _handle_asset_generate(self):
        payload = load_json_body(self)
        self._log_server_event("asset-generate", {"payload": payload})
        if payload is None:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "Invalid JSON body."},
            )
            return

        started = time.time()
        print("[asset-generate] request received", file=sys.stderr)
        try:
            asset = generate_asset(
                payload,
                manifest_path=self.asset_manifest_path,
                env_file=self.env_file,
            )
            elapsed_ms = int((time.time() - started) * 1000)
            print(f"[asset-generate] ok duration_ms={elapsed_ms}", file=sys.stderr)
            self._log_server_event("asset-generate", {"status": "ok", "duration_ms": elapsed_ms})
            self.send_json(HTTPStatus.OK, {"ok": True, "asset": asset})
        except ValueError as exc:
            elapsed_ms = int((time.time() - started) * 1000)
            print(f"[asset-generate] bad_request duration_ms={elapsed_ms} error={exc}", file=sys.stderr)
            self._log_server_event("asset-generate", {"status": "bad_request", "duration_ms": elapsed_ms, "error": str(exc)})
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:
            print(f"[asset-generate] error: {exc}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            elapsed_ms = int((time.time() - started) * 1000)
            print(f"[asset-generate] duration_ms={elapsed_ms}", file=sys.stderr)
            self._log_server_event("asset-generate", {"status": "error", "duration_ms": elapsed_ms, "error": str(exc)})
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": str(exc)},
            )
        return

    def _handle_asset_manifest(self):
        manifest_path = ROOT / self.asset_manifest_path
        if not manifest_path.exists():
            self.send_json(
                HTTPStatus.NOT_FOUND,
                {"error": "Asset manifest not found."},
            )
            return
        try:
            payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "Failed to read asset manifest."},
            )
            return
        self.send_json(HTTPStatus.OK, payload)
