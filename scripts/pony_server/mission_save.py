import json
import re
from pathlib import Path

from .config import ROOT
from .io import load_data, save_data
from .utils import sanitize_value, slugify
from .mission_constants import DEFAULT_ADVENTURE_ID, DEFAULT_SAVE_ROOT, DEFAULT_WORLD_MAP, MissionValidationError
from .mission_plan import load_manifest


def _normalize_adventure_id(adventure_id):
    if not adventure_id:
        return DEFAULT_ADVENTURE_ID
    return slugify(adventure_id)


def _adventure_prefix(adventure_id, world_map=None):
    if isinstance(world_map, dict):
        prefix = world_map.get("prefix")
        if isinstance(prefix, str) and prefix.strip():
            return prefix.strip()
    if adventure_id == "stellacorn":
        return "WF"
    parts = [part for part in adventure_id.split("-") if part]
    if parts:
        return "".join(part[0].upper() for part in parts)
    return adventure_id[:3].upper() or "ADV"


def _resolve_adventure_paths(adventure_id):
    adventure_root = ROOT / "adventures" / adventure_id
    mission_root = ROOT / "adventures/missions" / adventure_id
    return {
        "adventure_root": adventure_root,
        "missions_root": mission_root,
        "world_map_path": adventure_root / "world-map.json",
        "adventure_html": adventure_root / "adventure.html",
        "world_map_html": adventure_root / "world-map.html",
        "adventure_config": adventure_root / "adventure.json",
        "adventure_js": ROOT / "assets/js" / adventure_id / "adventure.js",
        "world_map_js": ROOT / "assets/js" / adventure_id / "world-map.js",
    }


def _ensure_dir(path):
    Path(path).mkdir(parents=True, exist_ok=True)


def _write_text_if_missing(path, content):
    path = Path(path)
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _replace_js_const(source, name, value):
    pattern = rf"const {re.escape(name)} = .*?;"
    return re.sub(pattern, f'const {name} = "{value}";', source, count=1)


def _auto_layout_position(index):
    cols = 5
    spacing_x = 140
    spacing_y = 90
    start_x = 120
    start_y = 320
    row = index // cols
    col = index % cols
    return start_x + col * spacing_x, start_y - row * spacing_y


def _normalize_world_map(world_map):
    if not isinstance(world_map, dict):
        return {"nodes": [], "edges": []}
    nodes = world_map.get("nodes")
    edges = world_map.get("edges")
    if not isinstance(nodes, list):
        nodes = []
    if not isinstance(edges, list):
        edges = []
    normalized_nodes = []
    for idx, node in enumerate(nodes):
        if not isinstance(node, dict):
            continue
        if not node.get("name") and node.get("label"):
            node["name"] = node.get("label")
        if not isinstance(node.get("x"), (int, float)) or not isinstance(node.get("y"), (int, float)):
            x, y = _auto_layout_position(idx)
            node["x"] = x
            node["y"] = y
        normalized_nodes.append(node)
    normalized_edges = []
    for edge in edges:
        if isinstance(edge, (list, tuple)) and len(edge) >= 2:
            normalized_edges.append([edge[0], edge[1]])
        elif isinstance(edge, dict) and edge.get("from") and edge.get("to"):
            normalized_edges.append([edge["from"], edge["to"]])
    world_map["nodes"] = normalized_nodes
    world_map["edges"] = normalized_edges
    return world_map


def ensure_adventure_scaffold(
    *,
    adventure_id,
    title=None,
    hero=None,
    actions=None,
    background=None,
):
    adventure_id = _normalize_adventure_id(adventure_id)
    paths = _resolve_adventure_paths(adventure_id)
    _ensure_dir(paths["adventure_root"])
    _ensure_dir(paths["missions_root"])
    _ensure_dir(paths["adventure_js"].parent)

    world_map_path = paths["world_map_path"]
    if not world_map_path.exists():
        world_map = {
            "title": title or adventure_id.replace("-", " ").title(),
            "nodes": [],
            "edges": [],
            "prefix": _adventure_prefix(adventure_id),
        }
        if background:
            world_map["background"] = background
        save_data(world_map_path, world_map)

    adventure_config = {
        "id": adventure_id,
        "title": title or adventure_id.replace("-", " ").title(),
        "hero": hero or {},
        "actions": actions or [],
    }
    adventure_config_path = paths["adventure_config"]
    if not adventure_config_path.exists():
        save_data(adventure_config_path, adventure_config)

    adventure_html = paths["adventure_html"]
    world_map_html = paths["world_map_html"]
    adventure_js = paths["adventure_js"]
    world_map_js = paths["world_map_js"]

    if not adventure_html.exists():
        template = (ROOT / "adventures" / "stellacorn" / "adventure.html").read_text(encoding="utf-8")
        template = template.replace("Whispering Forest - The Missing Deer", f"{adventure_config['title']} - Mission")
        template = template.replace("Whispering Forest", adventure_config["title"])
        template = template.replace("../../assets/js/stellacorn/adventure.js", f"../../assets/js/{adventure_id}/adventure.js")
        _write_text_if_missing(adventure_html, template)

    if not world_map_html.exists():
        template = (ROOT / "adventures" / "stellacorn" / "world-map.html").read_text(encoding="utf-8")
        template = template.replace("Whispering Forest", adventure_config["title"])
        template = template.replace("../../assets/js/stellacorn/world-map.js", f"../../assets/js/{adventure_id}/world-map.js")
        template = template.replace("../stellacorn/world-map.json", "./world-map.json")
        _write_text_if_missing(world_map_html, template)

    if not adventure_js.exists():
        adventure_js_template = f"""import {{ loadRuntime }} from \"../stellacorn/adventure/runtime.js\";

const ADVENTURE_ID = \"{adventure_id}\";
const PROGRESS_KEY = \"{adventure_id.upper()}_PROGRESS_V1\";
const SELECTED_KEY = \"{adventure_id.upper()}_SELECTED_MISSION\";
const DEFAULT_MISSION = \"../missions/{adventure_id}/generated/mission-001/mission.json\";

loadRuntime({{ adventureId: ADVENTURE_ID, progressKey: PROGRESS_KEY, selectedKey: SELECTED_KEY, defaultMission: DEFAULT_MISSION }});
"""
        _write_text_if_missing(adventure_js, adventure_js_template)

    if not world_map_js.exists():
        world_map_js_template = (ROOT / "assets/js/stellacorn/world-map.js").read_text(encoding="utf-8")
        world_map_js_template = _replace_js_const(world_map_js_template, "WORLD_MAP_URL", "../stellacorn/world-map.json")
        world_map_js_template = _replace_js_const(world_map_js_template, "PROGRESS_KEY", f"{adventure_id.upper()}_PROGRESS_V1")
        world_map_js_template = _replace_js_const(world_map_js_template, "SELECTED_KEY", f"{adventure_id.upper()}_SELECTED_MISSION")
        _write_text_if_missing(world_map_js, world_map_js_template)

    return paths


def _next_mission_index(root_dir):
    root_dir = Path(root_dir)
    if not root_dir.exists():
        return 1
    generated_root = root_dir / "generated"
    search_root = generated_root if generated_root.exists() else root_dir
    existing = [p for p in search_root.glob("mission-*/mission.json") if p.is_file()]
    indices = []
    for entry in existing:
        try:
            name = entry.parent.name
            idx = int(name.split("-")[-1])
            indices.append(idx)
        except Exception:
            continue
    return max(indices) + 1 if indices else 1


def save_mission_bundle(
    bundle,
    *,
    force=False,
    adventure_id=None,
    adventure_title=None,
    adventure_hero=None,
    adventure_actions=None,
    adventure_background=None,
    create_adventure=False,
):
    mission_data = bundle.get("mission") or {}
    map_data = bundle.get("map") or {}
    tiles = bundle.get("tiles") or {}
    objects = bundle.get("objects") or {}

    adventure_id = _normalize_adventure_id(adventure_id)
    if create_adventure:
        ensure_adventure_scaffold(
            adventure_id=adventure_id,
            title=adventure_title,
            hero=adventure_hero,
            actions=adventure_actions,
            background=adventure_background,
        )

    paths = _resolve_adventure_paths(adventure_id)
    if not paths["world_map_path"].exists():
        raise MissionValidationError(f"Adventure '{adventure_id}' does not exist.")

    mission_root = paths["missions_root"]
    index = _next_mission_index(mission_root)
    mission_slug = f"mission-{index:03d}"
    map_dir = mission_root / "generated" / mission_slug
    map_dir.mkdir(parents=True, exist_ok=True)

    world_map_path = paths["world_map_path"]
    world_map = _normalize_world_map(load_data(world_map_path))
    prefix = _adventure_prefix(adventure_id, world_map)
    mission_id = f"{prefix}_GEN_{index:03d}"
    mission_title = bundle.get("mission", {}).get("title") or f"Generated Mission {index:03d}"

    map_path = map_dir / f"{mission_slug}-map.json"
    tiles_path = map_dir / "adventure_tiles.json"
    objects_path = map_dir / "adventure_objects.json"

    if not force and map_path.exists():
        raise MissionValidationError("Mission map already exists. Use force to overwrite.")

    save_data(map_path, map_data)
    save_data(tiles_path, tiles)
    save_data(objects_path, objects)

    mission_json = {
        "id": mission_id,
        "title": mission_title,
        "subtitle": mission_data.get("subtitle") or adventure_id.replace("-", " ").title(),
        "map": map_path.name,
        "tiles": tiles_path.name,
        "objects": objects_path.name,
        "assetRoot": "/adventures",
        "logic": "/assets/js/stellacorn/adventure/generic-mission.js",
        "tileSize": mission_data.get("tileSize", 64),
        "spawn": map_data.get("spawn"),
        "objectives": mission_data.get("objectives"),
        "interactions": mission_data.get("interactions"),
        "zones": mission_data.get("zones"),
        "triggers": mission_data.get("triggers"),
        "dialog": mission_data.get("dialog"),
        "narrative": mission_data.get("narrative"),
        "flags": mission_data.get("flags"),
        "checkpoints": mission_data.get("checkpoints"),
        "missionMeta": mission_data.get("missionMeta") if mission_data.get("missionMeta") else None,
        "mission": mission_data,
        "adventureId": adventure_id,
    }

    mission_path = map_dir / "mission.json"
    save_data(mission_path, mission_json)

    world_map.setdefault("nodes", [])
    world_map.setdefault("edges", [])
    node_id = f"{prefix}_G{index:03d}"
    node_x, node_y = _auto_layout_position(len(world_map.get("nodes", [])))
    node = {
        "id": node_id,
        "name": mission_title,
        "label": mission_title,
        "x": node_x,
        "y": node_y,
        "mission": f"../missions/{adventure_id}/generated/{mission_slug}/mission.json",
    }
    world_map["nodes"].append(node)
    if world_map["nodes"] and len(world_map["nodes"]) > 1:
        world_map["edges"].append([world_map["nodes"][-2]["id"], node_id])

    save_data(world_map_path, world_map)

    _save_asset_prompts(bundle, map_dir)

    return {
        "mission_dir": str(map_dir),
        "mission_path": str(mission_path),
        "world_map_path": str(world_map_path),
        "mission_id": mission_id,
        "node_id": node_id,
    }


def _save_asset_prompts(bundle, mission_dir):
    requests = (
        (bundle.get("mission") or {}).get("assetRequests")
        or (bundle.get("plan") or {}).get("assetRequests")
        or []
    )
    if not requests:
        return
    prompts_dir = Path(mission_dir) / "prompts"
    prompts_dir.mkdir(parents=True, exist_ok=True)
    prompt_json_path = prompts_dir / "asset-requests.json"
    prompt_txt_path = prompts_dir / "asset-prompts.txt"
    save_data(prompt_json_path, requests)
    lines = []
    for entry in requests:
        if not isinstance(entry, dict):
            continue
        label = entry.get("title") or entry.get("slug") or entry.get("id") or "Asset"
        prompt = entry.get("prompt") or ""
        if prompt:
            lines.append(f"{label}: {prompt}")
    if lines:
        prompt_txt_path.write_text("\n".join(lines), encoding="utf-8")


def save_draft_bundle(bundle):
    drafts_dir = ROOT / "adventures/maps/_drafts"
    drafts_dir.mkdir(parents=True, exist_ok=True)
    map_path = drafts_dir / "mission-generator-draft.json"
    tiles_path = drafts_dir / "mission-generator-tiles.json"
    objects_path = drafts_dir / "mission-generator-objects.json"

    map_payload = dict(bundle.get("map") or {})
    mission_meta = bundle.get("mission") or {}
    if mission_meta:
        map_payload["missionMeta"] = mission_meta
    save_data(map_path, map_payload)
    save_data(tiles_path, bundle.get("tiles"))
    save_data(objects_path, bundle.get("objects"))

    return {
        "mapPath": f"/{map_path.relative_to(ROOT).as_posix()}",
        "tilesPath": f"/{tiles_path.relative_to(ROOT).as_posix()}",
        "objectsPath": f"/{objects_path.relative_to(ROOT).as_posix()}",
    }
