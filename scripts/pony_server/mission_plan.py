import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

from .config import ROOT
from .io import load_data
from .utils import sanitize_value
from .logging_utils import log_event, make_request_id, ensure_dir
from scripts.sprites import images_api
from .mission_constants import (
    DEFAULT_MISSION_MODEL,
    DEFAULT_MISSION_MAX_OUTPUT_TOKENS,
    DEFAULT_ASSET_MANIFEST,
    MissionPlanError,
)
from .mission_plan_schema import mission_plan_tool_schema

RESPONSES_URL = "https://api.openai.com/v1/responses"
LOG_DIR = ROOT / "logs/mission-generator"
CACHE_PATH = LOG_DIR / "last-plan.json"
DEFAULT_PLAN_PATH = ROOT / "specs/mission-plan-default.json"


def _iso_timestamp():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _ensure_openai_key(env_file=None):
    if os.getenv("OPENAI_API_KEY"):
        return
    if env_file:
        key = images_api.load_env_value(env_file, "OPENAI_API_KEY")
        if key:
            os.environ["OPENAI_API_KEY"] = key
            return
    key = images_api.load_env_value(ROOT / ".env", "OPENAI_API_KEY")
    if key:
        os.environ["OPENAI_API_KEY"] = key


def load_manifest(manifest_path=None):
    manifest_path = Path(manifest_path or DEFAULT_ASSET_MANIFEST)
    if not manifest_path.exists():
        raise MissionPlanError("Asset manifest not found.")
    return load_data(manifest_path)


def _load_cached_plan(cache_path):
    cache_path = Path(cache_path)
    if not cache_path.exists():
        return None
    try:
        cached = load_data(cache_path)
    except Exception:
        return None
    if isinstance(cached, dict) and isinstance(cached.get("plan"), dict):
        return cached
    if isinstance(cached, dict):
        return {"plan": cached}
    return None


def _load_default_plan(default_path):
    default_path = Path(default_path)
    if not default_path.exists():
        return None
    try:
        default_plan = load_data(default_path)
    except Exception:
        return None
    if isinstance(default_plan, dict) and isinstance(default_plan.get("plan"), dict):
        return default_plan
    if isinstance(default_plan, dict):
        return {"plan": default_plan}
    return None


def _save_cached_plan(plan, meta, cache_path):
    cache_path = Path(cache_path)
    ensure_dir(cache_path.parent)
    payload = {
        "plan": plan,
        "saved_at": _iso_timestamp(),
        "model": meta.get("model"),
        "vibe": meta.get("vibe"),
        "seed": meta.get("seed"),
        "manifest_summary_hash": meta.get("manifest_summary_hash"),
    }
    cache_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def _summarize_manifest(manifest):
    tiles = []
    sprites = []
    overlays = []
    for asset in manifest.get("assets", []):
        asset_type = asset.get("type")
        title = asset.get("title") or asset.get("id")
        entry = {
            "id": asset.get("id"),
            "title": title,
            "type": asset_type,
            "collection": (asset.get("meta") or {}).get("collection"),
            "prompt": asset.get("prompt"),
        }
        if asset_type == "tile":
            tiles.append(entry)
        elif asset_type == "sprite":
            sprites.append(entry)
        elif asset_type == "overlay":
            overlays.append(entry)
    return {
        "tiles": tiles[:30],
        "sprites": sprites[:50],
        "overlays": overlays[:20],
    }


def _hash_manifest_summary(summary):
    raw = json.dumps(summary, sort_keys=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()




def _request_llm(payload):
    request = urllib.request.Request(
        RESPONSES_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {os.getenv('OPENAI_API_KEY', '')}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            body = response.read().decode("utf-8")
            return json.loads(body)
    except (urllib.error.HTTPError, urllib.error.URLError) as exc:
        if isinstance(exc, urllib.error.HTTPError):
            detail = exc.read().decode("utf-8", errors="replace")
            raise MissionPlanError(f"LLM request failed: {exc.code} {exc.reason}\n{detail}") from exc
        raise MissionPlanError(f"LLM request failed: {exc}") from exc


def _extract_tool_args(response):
    output = response.get("output") if isinstance(response, dict) else None
    if isinstance(response, dict) and response.get("status") == "incomplete":
        reason = (response.get("incomplete_details") or {}).get("reason") or "unknown"
        raise MissionPlanError(f"LLM response incomplete: {reason}. Increase max_output_tokens.")
    if not isinstance(output, list):
        raise MissionPlanError("LLM response missing output list.")
    for item in output:
        if not isinstance(item, dict):
            continue
        if item.get("type") == "function_call" and item.get("name") == "submit_mission_plan":
            if item.get("status") == "incomplete":
                raise MissionPlanError("LLM function call incomplete. Increase max_output_tokens.")
            args = item.get("arguments")
            if isinstance(args, str):
                try:
                    return json.loads(args)
                except json.JSONDecodeError as exc:
                    raise MissionPlanError(
                        f"LLM tool args JSON invalid: {exc}. Increase max_output_tokens."
                    ) from exc
            if isinstance(args, dict):
                return args
    raise MissionPlanError("LLM response missing submit_mission_plan tool call.")


def request_mission_plan(
    vibe,
    seed=None,
    manifest=None,
    env_file=None,
    model=None,
    force_live=False,
    cache_only=False,
    cache_path=None,
    default_path=None,
):
    vibe = sanitize_value(vibe, fallback="", max_len=800)
    if not vibe:
        raise MissionPlanError("Mission vibe is required.")
    cache_path = Path(cache_path or CACHE_PATH)
    default_path = Path(default_path or DEFAULT_PLAN_PATH)
    if not force_live:
        cached = _load_cached_plan(cache_path)
        if cached:
            plan = cached.get("plan") or {}
            if isinstance(plan, dict):
                plan.setdefault("vibe", vibe)
                plan.setdefault("seed", seed)
                plan["generated_at"] = cached.get("saved_at") or _iso_timestamp()
            log_event(
                LOG_DIR / "llm-cache.jsonl",
                {
                    "request_id": make_request_id("mission_plan_cache"),
                    "cache_path": str(cache_path),
                    "cached_at": cached.get("saved_at"),
                    "vibe": vibe,
                    "seed": seed,
                },
            )
            return plan, {
                "cached": True,
                "cachePath": str(cache_path),
                "saved_at": cached.get("saved_at"),
                "source": "cache",
            }
        default_plan = _load_default_plan(default_path)
        if default_plan:
            plan = default_plan.get("plan") or {}
            if isinstance(plan, dict):
                plan.setdefault("vibe", vibe)
                plan.setdefault("seed", seed)
                plan["generated_at"] = default_plan.get("saved_at") or _iso_timestamp()
            log_event(
                LOG_DIR / "llm-default.jsonl",
                {
                    "request_id": make_request_id("mission_plan_default"),
                    "default_path": str(default_path),
                    "vibe": vibe,
                    "seed": seed,
                },
            )
            _save_cached_plan(plan, {"model": model, "vibe": vibe, "seed": seed, "manifest_summary_hash": None}, cache_path)
            return plan, {
                "cached": True,
                "cachePath": str(cache_path),
                "saved_at": default_plan.get("saved_at"),
                "source": "default",
            }
        if cache_only:
            raise MissionPlanError(
                "No cached or default mission plan available. Enable Force Live to call OpenAI."
            )

    _ensure_openai_key(env_file)
    if not os.getenv("OPENAI_API_KEY"):
        raise MissionPlanError("Missing OPENAI_API_KEY in environment or .env.")

    manifest = manifest or load_manifest()
    summary = _summarize_manifest(manifest)
    model = model or DEFAULT_MISSION_MODEL
    request_id = make_request_id("mission_plan")

    system_prompt = (
        "You are a mission planner for a kid-friendly pony/unicorn adventure game. "
        "Return a complete mission plan using the submit_mission_plan tool. "
        "Use only interaction verbs: talk, interact, heal, magic. "
        "Objectives must use types talk_count, interact_count, heal_count, magic_count. "
        "For collect/heal N targets, include targetCategory and targetIds (length == targetCount). "
        "Dialog nodes should be in dialog.nodes with {id, speaker, text:[...], choices:[{text,to,conditions,setFlags,setGlobalFlags}]}. "
        "The choice 'to' field is the target dialog node id (null to end). "
        "Conditions support {type:'flag',scope:'local'|'global',flag,op,value}, "
        "{type:'first_time',targetId}, {type:'first_time_speaking',targetId}, {type:'first_time_speaking_to',targetId}, "
        "and {type:'event',key}. "
        "Use dialog.entry for the opening dialog node and dialog.startByTarget as a list of {targetId, dialogId} for NPC start nodes. "
        "Every dialog id referenced in interactions/triggers/narrative/entry/startByTarget must exist in dialog.nodes. "
        "Do not reference missing dialog nodes. Create stub dialog nodes if needed. "
        "Include mission layout, narrative, interactions, zones, triggers, and checkpoints. "
        "If you need new assets, list them in assetRequests with base prompt + variant prompts. "
        "Fill optional fields with null or empty arrays." 
    )

    user_prompt = {
        "vibe": vibe,
        "seed": seed,
        "availableAssets": summary,
        "requirements": {
            "dialog": "Include dialog nodes with choices and conditions.",
            "objectives": "Use objective types talk_count/interact_count/heal_count/magic_count.",
            "layout": "Provide layout with biome and size {w,h}.",
            "narrative": "Provide intro/outro text plus onEnterZones and onInteract beats.",
            "interactions": "Define interactions per targetId (talk/interact/heal/magic).",
            "zones": "Define zones for onEnter triggers with rect {x,y,w,h}.",
            "checkpoints": "Provide checkpoints (tx/ty or targetId) for debug skipping.",
            "targets": "If targetCount > 1, include targetIds and targetCategory where appropriate.",
        },
    }

    payload = {
        "model": model,
        "input": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_prompt)},
        ],
        "tools": [mission_plan_tool_schema()],
        "tool_choice": {"type": "function", "name": "submit_mission_plan"},
        "parallel_tool_calls": False,
        "reasoning": {"effort": "low"},
        "max_output_tokens": DEFAULT_MISSION_MAX_OUTPUT_TOKENS,
    }

    meta = {
        "model": model,
        "seed": seed,
        "vibe": vibe,
        "manifest_summary_hash": _hash_manifest_summary(summary),
    }

    log_event(
        LOG_DIR / "llm-requests.jsonl",
        {
            "request_id": request_id,
            **meta,
            "manifest_counts": {
                "tiles": len(summary.get("tiles", [])),
                "sprites": len(summary.get("sprites", [])),
                "overlays": len(summary.get("overlays", [])),
            },
            "max_output_tokens": DEFAULT_MISSION_MAX_OUTPUT_TOKENS,
            "system_prompt": system_prompt,
            "user_prompt": user_prompt,
        },
    )

    data = _request_llm(payload)
    log_event(
        LOG_DIR / "llm-responses.jsonl",
        {
            "request_id": request_id,
            "response": data,
        },
    )

    try:
        plan = _extract_tool_args(data)
    except Exception as exc:
        log_event(
            LOG_DIR / "llm-errors.jsonl",
            {
                "request_id": request_id,
                "error": str(exc),
                "response": data,
            },
        )
        raise

    plan.setdefault("vibe", vibe)
    plan.setdefault("seed", seed)
    plan["generated_at"] = _iso_timestamp()
    _save_cached_plan(plan, meta, cache_path)
    return plan, {"cached": False, "cachePath": str(cache_path), "source": "live"}
