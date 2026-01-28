import json
import sys
import traceback
from http import HTTPStatus

from ..config import ROOT
from ..io import load_json_body
from ..mission_generator import (
    MissionPlanError,
    MissionValidationError,
    generate_mission,
    load_manifest,
    request_mission_plan,
    save_draft_bundle,
    save_mission_bundle,
    validate_mission,
)


class MissionHandlerMixin:
    def _handle_mission_plan(self):
        payload = load_json_body(self)
        self._log_mission_event("plan-request", {"payload": payload})
        if payload is None:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body."})
            return
        vibe = payload.get("vibe") if isinstance(payload, dict) else None
        seed = payload.get("seed") if isinstance(payload, dict) else None
        model = payload.get("model") if isinstance(payload, dict) else None
        force_live = bool(payload.get("forceLive")) if isinstance(payload, dict) else False
        cache_only = bool(payload.get("cacheOnly")) if isinstance(payload, dict) else False
        try:
            plan, meta = request_mission_plan(
                vibe,
                seed=seed,
                manifest=load_manifest(self.asset_manifest_path),
                env_file=self.env_file,
                model=model,
                force_live=force_live,
                cache_only=cache_only,
            )
            self._log_mission_event("plan-response", {"plan": plan, "meta": meta})
            self.send_json(HTTPStatus.OK, {"ok": True, "plan": plan, **(meta or {})})
        except MissionPlanError as exc:
            self._log_mission_event("plan-error", {"error": str(exc)})
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            self._log_mission_event("plan-error", {"error": str(exc)})
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})
        return

    def _handle_mission_generate(self):
        payload = load_json_body(self)
        self._log_mission_event("generate-request", {"payload": payload})
        if payload is None:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body."})
            return
        plan = payload.get("plan") if isinstance(payload, dict) else None
        seed = payload.get("seed") if isinstance(payload, dict) else None
        if not isinstance(plan, dict):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Plan payload is required."})
            return
        try:
            manifest = load_manifest(self.asset_manifest_path)
            bundle = generate_mission(plan, seed, manifest)
            errors = validate_mission(bundle)
            response_payload = {
                "ok": not errors,
                "bundle": bundle,
                "errors": errors,
            }
            self._log_mission_event("generate-response", response_payload)
            self.send_json(HTTPStatus.OK, response_payload)
        except MissionPlanError as exc:
            self._log_mission_event("generate-error", {"error": str(exc)})
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            self._log_mission_event("generate-error", {"error": str(exc)})
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})
        return

    def _handle_mission_validate(self):
        payload = load_json_body(self)
        self._log_mission_event("validate-request", {"payload": payload})
        if payload is None:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body."})
            return
        bundle = payload.get("bundle") if isinstance(payload, dict) else None
        if not isinstance(bundle, dict):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Bundle payload is required."})
            return
        errors = validate_mission(bundle)
        response_payload = {"ok": not errors, "errors": errors}
        self._log_mission_event("validate-response", response_payload)
        self.send_json(HTTPStatus.OK, response_payload)
        return

    def _handle_mission_save(self):
        payload = load_json_body(self)
        self._log_mission_event("save-request", {"payload": payload})
        if payload is None:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body."})
            return
        bundle = payload.get("bundle") if isinstance(payload, dict) else None
        force = bool(payload.get("force")) if isinstance(payload, dict) else False
        adventure_id = payload.get("adventureId") if isinstance(payload, dict) else None
        adventure_title = payload.get("adventureTitle") if isinstance(payload, dict) else None
        adventure_hero = payload.get("adventureHero") if isinstance(payload, dict) else None
        adventure_actions = payload.get("adventureActions") if isinstance(payload, dict) else None
        adventure_background = payload.get("adventureBackground") if isinstance(payload, dict) else None
        create_adventure = bool(payload.get("createAdventure")) if isinstance(payload, dict) else False
        if not isinstance(bundle, dict):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Bundle payload is required."})
            return
        try:
            result = save_mission_bundle(
                bundle,
                force=force,
                adventure_id=adventure_id,
                adventure_title=adventure_title,
                adventure_hero=adventure_hero,
                adventure_actions=adventure_actions,
                adventure_background=adventure_background,
                create_adventure=create_adventure,
            )
            self._log_mission_event("save-response", result)
            self.send_json(HTTPStatus.OK, result)
        except MissionValidationError as exc:
            self._log_mission_event("save-error", {"error": str(exc)})
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            self._log_mission_event("save-error", {"error": str(exc)})
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})
        return

    def _handle_mission_draft(self):
        payload = load_json_body(self)
        self._log_mission_event("draft-request", {"payload": payload})
        if payload is None:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body."})
            return
        bundle = payload.get("bundle") if isinstance(payload, dict) else None
        if not isinstance(bundle, dict):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Bundle payload is required."})
            return
        result = save_draft_bundle(bundle)
        self._log_mission_event("draft-response", result)
        self.send_json(HTTPStatus.OK, result)
        return

    def _handle_list_adventures(self):
        adventures_dir = ROOT / "adventures"
        results = []
        if not adventures_dir.exists():
            self.send_json(HTTPStatus.OK, {"ok": True, "adventures": []})
            return
        for entry in adventures_dir.iterdir():
            if not entry.is_dir():
                continue
            world_map_path = entry / "world-map.json"
            if not world_map_path.exists():
                continue
            title = entry.name.replace("-", " ").title()
            hero = {}
            try:
                world_map = json.loads(world_map_path.read_text(encoding="utf-8"))
                if isinstance(world_map, dict) and world_map.get("title"):
                    title = world_map["title"]
            except Exception:
                pass
            adventure_config_path = entry / "adventure.json"
            if adventure_config_path.exists():
                try:
                    config = json.loads(adventure_config_path.read_text(encoding="utf-8"))
                    if isinstance(config, dict):
                        hero = config.get("hero") or {}
                except Exception:
                    hero = {}
            results.append(
                {
                    "id": entry.name,
                    "title": title,
                    "worldMapPath": f"/adventures/{entry.name}/world-map.json",
                    "hero": hero,
                }
            )
        self.send_json(HTTPStatus.OK, {"ok": True, "adventures": results})
