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


def _build_location_tags(locations):
    summary = []
    for item in locations:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if not name:
            continue
        tags = item.get("tags", [])
        summary.append({"name": name, "tags": tags})
    return summary


def _build_pony_attitudes(pony_lore, active_pony_slug):
    safe_slug = _safe_slug(active_pony_slug)
    if not safe_slug:
        return []
    entry = pony_lore.get(safe_slug, {}) if isinstance(pony_lore, dict) else {}
    opinions = entry.get("opinions", {}) if isinstance(entry, dict) else {}
    if not isinstance(opinions, dict):
        return []
    summary = []
    for slug, opinion in opinions.items():
        if not slug:
            continue
        target = pony_lore.get(str(slug), {}) if isinstance(pony_lore, dict) else {}
        name = target.get("name") or str(slug)
        sentiment = ""
        notes = ""
        if isinstance(opinion, dict):
            sentiment = opinion.get("sentiment") or ""
            notes = opinion.get("notes") or ""
        elif opinion:
            sentiment = str(opinion)
        if not sentiment and not notes:
            continue
        summary.append({"name": name, "sentiment": sentiment, "notes": notes})
    summary.sort(key=lambda item: item.get("name", ""))
    return summary


def build_session_context(config, active_pony_slug=None):
    lore = load_pony_lore(config.lore_path)
    pony_lore = lore.get("ponies", {}) if isinstance(lore, dict) else {}
    pony_lore = _filter_pony_opinions(pony_lore, active_pony_slug)
    locations = _load_locations(config.locations_path)
    location_tags = _build_location_tags(locations)
    pony_attitudes = _build_pony_attitudes(pony_lore, active_pony_slug)
    recent_actions = load_recent_actions(config.actions_path, limit=10)
    return {
        "ponyLore": pony_lore,
        "ponyAttitudes": pony_attitudes,
        "ponyvilleLocations": location_tags,
        "recentActions": recent_actions,
    }


def context_as_text(context):
    pony_attitudes = context.get("ponyAttitudes", [])
    locations = context.get("ponyvilleLocations", [])
    recent_actions = context.get("recentActions", [])
    attitude_bits = []
    for item in pony_attitudes:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        sentiment = item.get("sentiment")
        notes = item.get("notes")
        if not name or not sentiment:
            continue
        if notes:
            attitude_bits.append(f"{name}:{sentiment}({notes})")
        else:
            attitude_bits.append(f"{name}:{sentiment}")
    attitudes_text = "; ".join(attitude_bits) or "None"
    location_bits = []
    for item in locations:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if not name:
            continue
        tags = item.get("tags", [])
        if tags:
            location_bits.append(f"{name} ({','.join(tags)})")
        else:
            location_bits.append(str(name))
    locations_text = "; ".join(location_bits) or "None"
    return "\n".join(
        [
            f"ponyAttitudes:{attitudes_text}",
            f"ponyvilleLocations:{locations_text}",
            f"recentActions:{json.dumps(recent_actions, ensure_ascii=True, separators=(',', ':'))}",
        ]
    )
