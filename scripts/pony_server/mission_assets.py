from .mission_plan import load_manifest


def _pick_tile_assets(manifest):
    tiles = []
    for asset in manifest.get("assets", []):
        if asset.get("type") != "tile":
            continue
        meta = asset.get("meta") or {}
        if meta.get("tileset") not in {"adventure_base", "stellacorn_mission1_tiles"}:
            continue
        file_entry = (asset.get("files") or [{}])[0]
        tiles.append(
            {
                "id": asset.get("id"),
                "title": asset.get("title"),
                "slug": meta.get("slug") or file_entry.get("label") or asset.get("id").split("-")[-1],
                "asset": file_entry.get("path"),
            }
        )
    return tiles


def _tile_color(name):
    palette = {
        "grass": "#8bcf7a",
        "plains": "#8bcf7a",
        "forest": "#4d8c63",
        "forest-border": "#5e9b6a",
        "forest-canopy": "#3b6f4d",
        "water": "#6bb4d6",
        "mountain": "#9a9a9a",
        "road": "#b08a5a",
        "village": "#e0c092",
        "swamp": "#6f7f5d",
    }
    for key, color in palette.items():
        if key in name:
            return color
    return "#88b97a"


def _tile_walkable(name):
    blocked = {"water", "mountain", "forest", "canopy", "border", "deep"}
    for key in blocked:
        if key in name:
            return False
    return True


def build_tile_definitions(manifest=None):
    manifest = manifest or load_manifest()
    assets = _pick_tile_assets(manifest)
    tiles = []
    tile_index = 0
    for asset in assets:
        name = asset["slug"]
        tiles.append(
            {
                "id": tile_index,
                "name": name,
                "color": _tile_color(name),
                "walkable": _tile_walkable(name),
                "asset": asset["asset"],
                "categories": [name.split("-")[0]],
            }
        )
        tile_index += 1
    return tiles


def _pick_sprite_assets(manifest):
    sprites = []
    for asset in manifest.get("assets", []):
        if asset.get("type") != "sprite":
            continue
        meta = asset.get("meta") or {}
        if meta.get("collection") not in {
            "adventure_base",
            "stellacorn_mission1_sprites",
            "stellacorn_mission2_sprites",
        }:
            continue
        file_entry = (asset.get("files") or [{}])[0]
        slug = meta.get("slug") or file_entry.get("label") or asset.get("id").split("-")[-1]
        sprites.append(
            {
                "id": asset.get("id"),
                "title": asset.get("title"),
                "slug": slug,
                "asset": file_entry.get("path"),
            }
        )
    return sprites


def _tokenize_slug(value):
    if not value:
        return []
    tokens = []
    for chunk in str(value).replace("_", "-").split("-"):
        token = chunk.strip().lower()
        if token:
            tokens.append(token)
    return tokens


def _classify_sprite(name):
    lowered = name.lower()
    animals = ["deer", "owl", "rabbit", "fox", "badger", "bear", "squirrel", "hedgehog", "pony"]
    if any(token in lowered for token in animals):
        return "creature", ["animal"]
    if "clue" in lowered or "trail" in lowered or "footprint" in lowered:
        return "structure", ["clue"]
    return "structure", ["prop"]


def build_object_definitions(manifest=None):
    manifest = manifest or load_manifest()
    sprites = _pick_sprite_assets(manifest)
    objects = []
    for sprite in sprites:
        klass, categories = _classify_sprite(sprite["slug"])
        slug_tokens = _tokenize_slug(sprite.get("slug") or "")
        categories = list({*categories, *slug_tokens, sprite.get("slug")})
        objects.append(
            {
                "type": sprite["slug"],
                "name": sprite["title"],
                "color": "#d9d1c5",
                "asset": sprite["asset"],
                "class": klass,
                "categories": categories,
            }
        )
    return objects
