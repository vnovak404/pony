import sys
import time
import traceback
from http import HTTPStatus

from ..config import ROOT
from ..io import load_data, load_json_body, save_data
from ..map_refine import refine_map
from ..utils import sanitize_value


class MapHandlerMixin:
    def _handle_map_refine(self):
        payload = load_json_body(self)
        self._log_server_event("map-refine", {"payload": payload})
        if payload is None:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "Invalid JSON body."},
            )
            return
        print("[map-refine] request received", file=sys.stderr)

        started = time.time()
        try:
            base_resolution = _parse_resolution(payload.get("base_resolution"))
            target_resolution = _parse_resolution(payload.get("target_resolution"))
        except ValueError as exc:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": str(exc)},
            )
            return

        base_width, base_height = base_resolution
        target_width, target_height = target_resolution
        if target_width % base_width != 0 or target_height % base_height != 0:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "Target resolution must be a clean multiple of base resolution."},
            )
            return

        intent_map = payload.get("intent_map") if isinstance(payload, dict) else None
        rows = intent_map.get("rows") if isinstance(intent_map, dict) else None
        legend = intent_map.get("legend") if isinstance(intent_map, dict) else None
        if not isinstance(rows, list) or not rows:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "Intent map rows are required."},
            )
            return
        if not isinstance(legend, dict) or not legend:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "Intent map legend is required."},
            )
            return

        if any(not isinstance(row, str) or len(row) != base_width for row in rows):
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "Intent map rows must be strings matching base width."},
            )
            return
        if len(rows) != base_height:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "Intent map rows must match base height."},
            )
            return

        tileset = sanitize_value(payload.get("tileset"), fallback="default", max_len=80)
        decor_style = sanitize_value(payload.get("decor_style"), fallback="default", max_len=80)
        seed = sanitize_value(payload.get("seed"), fallback="seed", max_len=120)
        notes = _normalize_notes(payload.get("notes"))

        try:
            print(
                f"[map-refine] base={base_resolution} target={target_resolution} "
                f"tileset={tileset} decor={decor_style} notes={len(notes)}",
                file=sys.stderr,
            )
            refined = refine_map(
                rows,
                legend,
                base_resolution,
                target_resolution,
                seed,
                notes,
            )
            _normalize_refine_output(refined, legend, target_width, target_height)
            _validate_refine_output(refined, target_width, target_height)
            refined.setdefault("base_resolution", list(base_resolution))
            refined.setdefault("target_resolution", list(target_resolution))
            refined.setdefault("tileset", tileset)
            refined.setdefault("decor_style", decor_style)
            refined.setdefault("seed", seed)
            elapsed_ms = int((time.time() - started) * 1000)
            print(f"[map-refine] duration_ms={elapsed_ms}", file=sys.stderr)
            self._log_server_event("map-refine", {"status": "ok", "duration_ms": elapsed_ms})
            self.send_json(HTTPStatus.OK, refined)
        except Exception as exc:
            print(f"[map-refine] error: {exc}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            elapsed_ms = int((time.time() - started) * 1000)
            print(f"[map-refine] duration_ms={elapsed_ms}", file=sys.stderr)
            self._log_server_event("map-refine", {"status": "error", "duration_ms": elapsed_ms, "error": str(exc)})
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": str(exc)},
            )
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


def _parse_resolution(value):
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise ValueError("Resolution must be [width, height].")
    try:
        width = int(value[0])
        height = int(value[1])
    except (TypeError, ValueError) as exc:
        raise ValueError("Resolution must be integers.") from exc
    if width <= 0 or height <= 0:
        raise ValueError("Resolution must be positive integers.")
    return width, height


def _normalize_notes(notes_payload):
    notes = []
    if not isinstance(notes_payload, list):
        return notes
    for entry in notes_payload:
        if not isinstance(entry, dict):
            continue
        text = sanitize_value(entry.get("text"), fallback="", max_len=200)
        try:
            x = int(entry.get("x", 0))
            y = int(entry.get("y", 0))
            w = int(entry.get("w", 1))
            h = int(entry.get("h", 1))
        except (TypeError, ValueError):
            x, y, w, h = 0, 0, 1, 1
        notes.append(
            {
                "x": max(0, x),
                "y": max(0, y),
                "w": max(1, w),
                "h": max(1, h),
                "text": text,
            }
        )
    return notes


def _normalize_refine_output(refined, legend, target_width, target_height):
    if not isinstance(refined, dict):
        return
    layers = refined.get("layers")
    if not isinstance(layers, dict):
        return
    terrain = layers.get("terrain")
    if terrain is None:
        layers["terrain"] = _fill_rows("", target_width, target_height)
        return
    if not isinstance(legend, dict):
        legend = {}
    token_map = _build_terrain_token_map(legend)
    if not isinstance(terrain, list):
        layers["terrain"] = _fill_rows(_terrain_fallback_letter(token_map), target_width, target_height)
        return
    normalized_rows = []
    for row in terrain:
        if isinstance(row, str):
            normalized_rows.append(row)
            continue
        if not isinstance(row, list):
            layers["terrain"] = _fill_rows(_terrain_fallback_letter(token_map), target_width, target_height)
            return
        row_chars = []
        for token in row:
            letter = _map_token_to_letter(token, token_map)
            row_chars.append(letter)
        normalized_rows.append("".join(row_chars))
    layers["terrain"] = _coerce_rows_to_size(
        normalized_rows,
        target_width,
        target_height,
        _terrain_fallback_letter(token_map),
    )


def _build_terrain_token_map(legend):
    token_map = {}
    for key, meta in legend.items():
        if not isinstance(key, str) or len(key) != 1:
            continue
        token_map[key.lower()] = key
        if isinstance(meta, dict):
            terrain = meta.get("terrain")
            if terrain:
                token_map[str(terrain).strip().lower()] = key
    return token_map


def _map_token_to_letter(token, token_map):
    fallback = _terrain_fallback_letter(token_map)
    if token is None:
        return fallback
    if isinstance(token, str) and len(token) == 1:
        return token_map.get(token.lower(), fallback)
    normalized = str(token).strip().lower()
    if not normalized:
        return fallback
    if normalized in token_map:
        return token_map[normalized]
    synonyms = {
        "plains": token_map.get("grass"),
        "forest": token_map.get("forest"),
        "water": token_map.get("water"),
        "river": token_map.get("water"),
        "lake": token_map.get("water"),
        "mountain": token_map.get("mountain"),
        "hill": token_map.get("mountain"),
        "village": token_map.get("village"),
        "town": token_map.get("village"),
        "path": token_map.get("path"),
        "road": token_map.get("path"),
    }
    for key, value in synonyms.items():
        if value and key in normalized:
            return value
    return fallback


def _terrain_fallback_letter(token_map):
    return token_map.get("grass") or next(iter(token_map.values()), "g")


def _fill_rows(letter, target_width, target_height):
    if not letter:
        letter = "g"
    row = letter * target_width
    return [row for _ in range(target_height)]


def _coerce_rows_to_size(rows, target_width, target_height, fallback_letter):
    normalized = []
    for row in rows[:target_height]:
        if len(row) > target_width:
            normalized.append(row[:target_width])
        elif len(row) < target_width:
            normalized.append(row + fallback_letter * (target_width - len(row)))
        else:
            normalized.append(row)
    if len(normalized) < target_height:
        fill_row = fallback_letter * target_width
        normalized.extend([fill_row] * (target_height - len(normalized)))
    return normalized


def _validate_refine_output(refined, target_width, target_height):
    if not isinstance(refined, dict):
        raise ValueError("Refinement output must be a JSON object.")
    layers = refined.get("layers")
    if not isinstance(layers, dict):
        raise ValueError("Refinement output missing layers.")
    terrain = layers.get("terrain")
    if not _validate_layer(terrain, target_width, target_height):
        raise ValueError("Terrain layer shape does not match target resolution.")
    for key in ("elevation", "water", "roads"):
        layer = layers.get(key)
        if layer is not None and not _validate_layer(layer, target_width, target_height):
            raise ValueError(f"{key} layer shape does not match target resolution.")


def _validate_layer(layer, width, height):
    if not isinstance(layer, list) or len(layer) != height:
        return False
    for row in layer:
        if isinstance(row, str):
            if len(row) != width:
                return False
            continue
        if not isinstance(row, list) or len(row) != width:
            return False
    return True
