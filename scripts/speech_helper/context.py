import json
from pathlib import Path

import re

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
        tags = location.get("tags", [])
        structures.append(
            {
                "id": item.get("id"),
                "kind": item.get("kind"),
                "tags": tags,
            }
        )
    return structures


def _safe_slug(value):
    if not value:
        return ""
    slug = str(value).strip().lower().replace(" ", "-")
    slug = re.sub(r"[^a-z0-9-]+", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    return slug


def _filter_pony_opinions(pony_lore, active_pony_slug):
    if not isinstance(pony_lore, dict) or not active_pony_slug:
        return pony_lore
    safe_slug = _safe_slug(active_pony_slug)
    if not safe_slug or safe_slug not in pony_lore:
        return pony_lore
    trimmed = {}
    for slug, entry in pony_lore.items():
        if not isinstance(entry, dict):
            trimmed[slug] = entry
            continue
        entry_copy = dict(entry)
        if slug != safe_slug:
            entry_copy.pop("opinions", None)
        trimmed[slug] = entry_copy
    return trimmed


def build_session_context(config, active_pony_slug=None):
    lore = load_pony_lore(config.lore_path)
    pony_lore = lore.get("ponies", {}) if isinstance(lore, dict) else {}
    pony_lore = _filter_pony_opinions(pony_lore, active_pony_slug)
    locations = _load_locations(config.locations_path)
    structures = _load_structures(config.map_path, locations)
    recent_actions = load_recent_actions(config.actions_path)
    return {
        "ponyLore": pony_lore,
        "ponyvilleLocations": locations,
        "ponyvilleStructures": structures,
        "recentActions": recent_actions,
    }


def context_as_text(context):
    return json.dumps(context, ensure_ascii=True, separators=(",", ":"))
