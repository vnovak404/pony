import random
from pathlib import Path

from .config import (
    DEFAULT_OUTPUT_DIR,
    DRINK_PREFERENCES,
    FOOD_PREFERENCES,
    HOUSE_GROUP_CHANCE,
    HOUSE_LOTS,
    HOUSE_SHARE_CHANCE,
    ROOT,
)
from .io import load_data, save_data
from .utils import sanitize_value, slugify


def build_pony(payload):
    name = sanitize_value(payload.get("name"), "New Pony")
    species = sanitize_value(payload.get("species"), "pony").lower()
    if species not in {"pony", "unicorn"}:
        species = "pony"

    slug = slugify(name)
    job_payload = payload.get("job") if isinstance(payload, dict) else {}
    if not isinstance(job_payload, dict):
        job_payload = {}
    job_title = sanitize_value(job_payload.get("title"), "helper")
    job_service = sanitize_value(
        job_payload.get("service"),
        "helps with friendly pony tasks",
    )
    job_paid_in = sanitize_value(job_payload.get("paid_in"), "kindness tokens")
    house_payload = payload.get("house") if isinstance(payload, dict) else {}
    if not isinstance(house_payload, dict):
        house_payload = {}
    house_id = sanitize_value(house_payload.get("id"), f"house-{slug}", max_len=80)
    house_name = sanitize_value(house_payload.get("name"), f"{name}'s House")
    drives_payload = payload.get("drives") if isinstance(payload, dict) else {}
    if not isinstance(drives_payload, dict):
        drives_payload = {}
    eat_payload = drives_payload.get("eat") if isinstance(drives_payload, dict) else {}
    if not isinstance(eat_payload, dict):
        eat_payload = {}
    drink_payload = drives_payload.get("drink") if isinstance(drives_payload, dict) else {}
    if not isinstance(drink_payload, dict):
        drink_payload = {}
    eat_threshold = eat_payload.get("threshold", 60)
    try:
        eat_threshold = int(eat_threshold)
    except (TypeError, ValueError):
        eat_threshold = 60
    eat_preference = sanitize_value(eat_payload.get("preference"), "")
    if not eat_preference:
        eat_preference = random.choice(FOOD_PREFERENCES)
    drink_threshold = drink_payload.get("threshold", 55)
    try:
        drink_threshold = int(drink_threshold)
    except (TypeError, ValueError):
        drink_threshold = 55
    drink_preference = sanitize_value(drink_payload.get("preference"), "")
    if not drink_preference:
        drink_preference = random.choice(DRINK_PREFERENCES)
    pony = {
        "name": name,
        "slug": slug,
        "species": species,
        "body_color": sanitize_value(payload.get("body_color"), "sunny yellow"),
        "mane_color": sanitize_value(payload.get("mane_color"), "royal purple"),
        "accent_color": sanitize_value(payload.get("accent_color"), "buttercream"),
        "talent": sanitize_value(payload.get("talent"), "making friends"),
        "personality": sanitize_value(payload.get("personality"), "kind and curious"),
        "job": {
            "title": job_title,
            "service": job_service,
            "paid_in": job_paid_in,
        },
        "stats": {
            "health": int(payload.get("health", 92)) if isinstance(payload, dict) else 92,
            "hunger": int(payload.get("hunger", 28)) if isinstance(payload, dict) else 28,
            "thirst": int(payload.get("thirst", 20)) if isinstance(payload, dict) else 20,
            "boredom": int(payload.get("boredom", 24)) if isinstance(payload, dict) else 24,
            "tiredness": int(payload.get("tiredness", 35))
            if isinstance(payload, dict)
            else 35,
        },
        "house": {
            "id": house_id,
            "name": house_name,
        },
        "drives": {
            "eat": {
                "threshold": eat_threshold,
                "preference": eat_preference,
            },
            "drink": {
                "threshold": drink_threshold,
                "preference": drink_preference,
            },
        },
        "sprites": {
            "sheet": f"assets/ponies/{slug}/sheets/spritesheet.webp",
            "meta": f"assets/ponies/{slug}/sheets/spritesheet.json",
        },
    }
    return pony


def ensure_output_dir(path):
    full_path = ROOT / path
    full_path.mkdir(parents=True, exist_ok=True)


def ensure_pony_asset_dirs(slug):
    base = ROOT / DEFAULT_OUTPUT_DIR / slug
    (base / "frames").mkdir(parents=True, exist_ok=True)
    (base / "sheets").mkdir(parents=True, exist_ok=True)


def assign_house(ponies, pony):
    existing = {}
    for entry in ponies:
        house = entry.get("house") or {}
        house_id = house.get("id")
        if house_id:
            existing.setdefault(house_id, []).append(entry)

    share = bool(existing) and random.random() < HOUSE_SHARE_CHANCE
    if share:
        if random.random() < HOUSE_GROUP_CHANCE:
            candidates = [hid for hid, residents in existing.items() if len(residents) >= 2]
        else:
            candidates = []
        if not candidates:
            candidates = list(existing.keys())
        house_id = random.choice(candidates)
        residents = existing.get(house_id, [])
        house_name = None
        for resident in residents:
            house_name = (resident.get("house") or {}).get("name")
            if house_name:
                break
        house_name = house_name or pony["house"].get("name") or f"{pony['name']}'s House"
        pony["house"] = {
            "id": house_id,
            "name": house_name,
            "shared": True,
        }
        for resident in residents:
            resident_house = resident.setdefault("house", {})
            resident_house["id"] = house_id
            resident_house.setdefault("name", house_name)
            resident_house["shared"] = True
        return house_id, False

    pony["house"] = {
        "id": pony["house"].get("id") or f"house-{pony['slug']}",
        "name": pony["house"].get("name") or f"{pony['name']}'s House",
        "shared": False,
    }
    return pony["house"]["id"], True


def ensure_house_on_map(map_path, house, residents):
    map_data = load_data(map_path)
    layers = map_data.setdefault("layers", {})
    objects = layers.setdefault("objects", [])
    for item in objects:
        if item.get("id") == house["id"]:
            item["label"] = item.get("label") or house.get("name")
            item["residents"] = residents
            if house.get("shared"):
                item["scale"] = max(float(item.get("scale", 1.5)), 1.7)
            save_data(map_path, map_data)
            return

    used = {
        ((item.get("at") or {}).get("x"), (item.get("at") or {}).get("y"))
        for item in objects
    }
    spot = None
    for candidate in HOUSE_LOTS:
        if (candidate["x"], candidate["y"]) not in used:
            spot = candidate
            break
    if not spot:
        spot = {"x": 2.5 + random.random() * 35, "y": 2.5 + random.random() * 19}

    objects.append(
        {
            "id": house["id"],
            "kind": "house",
            "at": {"x": round(spot["x"], 2), "y": round(spot["y"], 2)},
            "spritePath": f"/assets/world/houses/{house['id']}.webp",
            "label": house["name"],
            "residents": residents,
            "scale": 1.7 if house.get("shared") else 1.5,
        }
    )
    save_data(map_path, map_data)
