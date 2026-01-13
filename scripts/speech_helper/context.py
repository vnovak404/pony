import json
from pathlib import Path

from .actions import load_recent_actions
from .io import load_data
from .lore import load_pony_lore


def _load_locations(path):
    locations_path = Path(path)
    if not locations_path.exists():
        return []
    data = load_data(locations_path)
    if isinstance(data, dict):
        data = data.get("locations", [])
    if not isinstance(data, list):
        return []
    summary = []
    for item in data:
        if not isinstance(item, dict):
            continue
        summary.append(
            {
                "id": item.get("id"),
                "name": item.get("name"),
                "tags": item.get("tags", []),
            }
        )
    return summary


def _load_structures(path, locations):
    map_path = Path(path)
    if not map_path.exists():
        return []
    data = load_data(map_path)
    layers = data.get("layers", {}) if isinstance(data, dict) else {}
    objects = layers.get("objects", []) if isinstance(layers, dict) else []
    if not isinstance(objects, list):
        return []
    location_by_id = {item.get("id"): item for item in locations if isinstance(item, dict)}
    structures = []
    for item in objects:
        if not isinstance(item, dict):
            continue
        location_id = item.get("locationId")
        location = location_by_id.get(location_id, {})
        structures.append(
            {
                "id": item.get("id"),
                "kind": item.get("kind"),
                "locationId": location_id,
                "locationName": location.get("name"),
                "locationTags": location.get("tags", []),
                "at": item.get("at"),
                "sprite": item.get("sprite"),
            }
        )
    return structures


def build_session_context(config):
    lore = load_pony_lore(config.lore_path)
    locations = _load_locations(config.locations_path)
    structures = _load_structures(config.map_path, locations)
    recent_actions = load_recent_actions(config.actions_path)
    return {
        "ponyLore": lore.get("ponies", {}),
        "ponyvilleLocations": locations,
        "ponyvilleStructures": structures,
        "recentActions": recent_actions,
    }


def context_as_text(context):
    return json.dumps(context, ensure_ascii=True, separators=(",", ":"))
