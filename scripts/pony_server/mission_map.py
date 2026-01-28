import random
import time

from .mission_assets import _tokenize_slug


def _seed_from_value(seed):
    if seed is None:
        return int(time.time())
    if isinstance(seed, int):
        return seed
    if isinstance(seed, str) and seed.strip().isdigit():
        return int(seed.strip())
    return abs(hash(str(seed))) % (2**31 - 1)


def _grid_index(x, y, width):
    return y * width + x


def _make_intent_grid(width, height, rng, biome):
    grid = [["grass" for _ in range(width)] for _ in range(height)]
    for y in range(height):
        for x in range(width):
            roll = rng.random()
            if roll < 0.08:
                grid[y][x] = "water" if biome != "mountain" else "mountain"
            elif roll < 0.18:
                grid[y][x] = "forest"
            elif roll < 0.24:
                grid[y][x] = "road"
            else:
                grid[y][x] = "grass"
    return grid


def _carve_path(grid, start, goal):
    x, y = start
    gx, gy = goal
    width = len(grid[0])
    height = len(grid)
    while (x, y) != (gx, gy):
        if x < gx:
            x += 1
        elif x > gx:
            x -= 1
        if y < gy:
            y += 1
        elif y > gy:
            y -= 1
        if 0 <= x < width and 0 <= y < height:
            grid[y][x] = "road"


def generate_map(plan, seed, tiles):
    layout = plan.get("layout") or {}
    size = layout.get("size") or {}
    width = size.get("w") or 18
    height = size.get("h") or 14
    width = max(8, min(48, int(width)))
    height = max(8, min(48, int(height)))
    biome = (layout.get("biome") or "forest").lower()

    rng = random.Random(_seed_from_value(seed))
    intent_grid = _make_intent_grid(width, height, rng, biome)
    spawn = (rng.randint(1, max(1, width - 2)), rng.randint(1, max(1, height - 2)))
    goal = (rng.randint(1, max(1, width - 2)), rng.randint(1, max(1, height - 2)))
    _carve_path(intent_grid, spawn, goal)

    tile_lookup = {tile["name"]: tile for tile in tiles}
    tiles_out = []
    for y in range(height):
        for x in range(width):
            intent = intent_grid[y][x]
            tile = tile_lookup.get(intent)
            if not tile:
                tile = tiles[0] if tiles else {"id": 0}
            tiles_out.append(tile["id"])

    walkable_positions = []
    tile_by_id = {tile["id"]: tile for tile in tiles}
    for y in range(height):
        for x in range(width):
            tile_id = tiles_out[y * width + x]
            tile = tile_by_id.get(tile_id)
            if tile and tile.get("walkable"):
                walkable_positions.append((x, y))
    if walkable_positions:
        walkable_set = set(walkable_positions)
        if (spawn[0], spawn[1]) not in walkable_set:
            spawn = rng.choice(walkable_positions)
        # Prefer a spawn in the largest connected component to keep targets reachable.
        visited = set()
        largest = []
        for pos in walkable_set:
            if pos in visited:
                continue
            queue = [pos]
            component = []
            while queue:
                cx, cy = queue.pop()
                if (cx, cy) in visited:
                    continue
                visited.add((cx, cy))
                component.append((cx, cy))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if (nx, ny) in walkable_set and (nx, ny) not in visited:
                        queue.append((nx, ny))
            if len(component) > len(largest):
                largest = component
        if largest and (spawn[0], spawn[1]) not in largest:
            spawn = rng.choice(largest)

    return {
        "width": width,
        "height": height,
        "tiles": tiles_out,
        "spawn": {"tx": spawn[0], "ty": spawn[1]},
        "objects": [],
    }


def _find_walkable_positions(map_data, tile_defs):
    width = map_data["width"]
    height = map_data["height"]
    positions = []
    for y in range(height):
        for x in range(width):
            tile_id = map_data["tiles"][y * width + x]
            tile = next((t for t in tile_defs if t["id"] == tile_id), None)
            if tile and tile.get("walkable"):
                positions.append((x, y))
    return positions


def _reachable_positions(map_data, tile_defs):
    width = map_data.get("width")
    height = map_data.get("height")
    if not width or not height:
        return []
    spawn = map_data.get("spawn") or {}
    start = (spawn.get("tx"), spawn.get("ty"))
    if not all(isinstance(value, int) for value in start):
        return _find_walkable_positions(map_data, tile_defs)

    walkable = set()
    tile_by_id = {tile["id"]: tile for tile in tile_defs}
    for y in range(height):
        for x in range(width):
            tile_id = map_data["tiles"][y * width + x]
            tile = tile_by_id.get(tile_id)
            if tile and tile.get("walkable"):
                walkable.add((x, y))

    if start not in walkable:
        return list(walkable)

    visited = set()
    queue = [start]
    while queue:
        x, y = queue.pop(0)
        if (x, y) in visited:
            continue
        visited.add((x, y))
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if (nx, ny) in walkable and (nx, ny) not in visited:
                queue.append((nx, ny))
    return list(visited)


def _place_objects(map_data, tile_defs, object_defs, objectives, seed):
    rng = random.Random(_seed_from_value(seed))
    positions = _reachable_positions(map_data, tile_defs) or _find_walkable_positions(map_data, tile_defs)
    rng.shuffle(positions)

    creatures = [obj for obj in object_defs if obj.get("class") == "creature"]
    props = [obj for obj in object_defs if obj.get("class") != "creature"]

    objects = []
    used = set()

    def pop_pos():
        while positions:
            x, y = positions.pop()
            key = f"{x},{y}"
            if key in used:
                continue
            used.add(key)
            return x, y
        return None, None

    def resolve_action(obj):
        action = obj.get("type", "talk")
        if isinstance(action, str) and action.endswith("_count"):
            action = action.replace("_count", "")
        return action

    def normalize_category(value):
        return "-".join(_tokenize_slug(value))

    for idx, obj in enumerate(objectives, start=1):
        action = resolve_action(obj)
        target_pool = creatures if action in {"talk", "heal"} else props
        target_category = obj.get("targetCategory")
        if target_category:
            target_key = normalize_category(target_category)
            target_pool = [
                entry
                for entry in target_pool
                if target_key in [normalize_category(cat) for cat in entry.get("categories", [])]
                or target_key in normalize_category(entry.get("type"))
            ]
            if not target_pool:
                target_pool = creatures if action in {"talk", "heal"} else props
        target_ids = obj.get("targetIds") if isinstance(obj.get("targetIds"), list) else []
        target_count = obj.get("targetCount")
        if not isinstance(target_count, int) or target_count <= 0:
            target_count = len(target_ids) if target_ids else 1
        if target_ids:
            target_count = len(target_ids)

        placed_ids = []
        for target_index in range(target_count):
            target = rng.choice(target_pool) if target_pool else None
            if not target:
                continue
            x, y = pop_pos()
            if x is None:
                continue
            target_id = None
            if target_ids:
                target_id = target_ids[target_index]
            elif target_count == 1:
                target_id = obj.get("targetId") or f"objective_{idx}"
            else:
                target_id = f"objective_{idx}_{target_index + 1}"
            objects.append(
                {
                    "id": target_id,
                    "type": target["type"],
                    "x": x,
                    "y": y,
                }
            )
            placed_ids.append(target_id)

        if placed_ids:
            if target_count == 1 and not target_category:
                obj["targetId"] = placed_ids[0]
                obj.pop("targetIds", None)
            else:
                obj["targetIds"] = placed_ids
                obj["targetCount"] = len(placed_ids)
                obj.pop("targetId", None)

    extra_count = min(10, max(3, len(objectives) * 2))
    if not creatures and not props:
        return objects
    for idx in range(extra_count):
        if creatures and props:
            target = rng.choice(creatures) if rng.random() < 0.6 else rng.choice(props)
        elif creatures:
            target = rng.choice(creatures)
        else:
            target = rng.choice(props)
        x, y = pop_pos()
        if x is None:
            break
        objects.append(
            {
                "id": f"ambient_{idx+1}",
                "type": target["type"],
                "x": x,
                "y": y,
            }
        )

    return objects


def _select_object_type(object_defs, action, category_hint, target_id, rng):
    creatures = [obj for obj in object_defs if obj.get("class") == "creature"]
    props = [obj for obj in object_defs if obj.get("class") != "creature"]
    pool = creatures if action in {"talk", "heal"} else props
    if not pool:
        return None

    def normalize_category(value):
        return "-".join(_tokenize_slug(value))

    def tokens_from_target(value):
        tokens = []
        for token in _tokenize_slug(value):
            if token in {"npc", "animal", "prop", "site", "object", "target"}:
                continue
            tokens.append(token)
        return tokens

    if category_hint:
        cat_key = normalize_category(category_hint)
        filtered = [
            entry
            for entry in pool
            if cat_key in [normalize_category(cat) for cat in entry.get("categories", [])]
            or cat_key in normalize_category(entry.get("type"))
        ]
        if filtered:
            pool = filtered

    tokens = tokens_from_target(target_id)
    if tokens:
        token_filtered = [
            entry
            for entry in pool
            if any(token in normalize_category(entry.get("type")) for token in tokens)
            or any(
                token in normalize_category(cat)
                for token in tokens
                for cat in entry.get("categories", [])
            )
        ]
        if token_filtered:
            pool = token_filtered

    return rng.choice(pool)["type"] if pool else None


def _ensure_required_objects(map_data, tile_defs, object_defs, required_targets, seed):
    if not required_targets:
        return
    rng = random.Random(_seed_from_value(seed))
    positions = _reachable_positions(map_data, tile_defs) or _find_walkable_positions(map_data, tile_defs)
    rng.shuffle(positions)
    used = {f"{obj.get('x')},{obj.get('y')}" for obj in map_data.get("objects", []) if obj.get("x") is not None}
    existing = {obj.get("id") for obj in map_data.get("objects", []) if obj.get("id")}

    def pop_pos():
        while positions:
            x, y = positions.pop()
            key = f"{x},{y}"
            if key in used:
                continue
            used.add(key)
            return x, y
        return None, None

    for entry in required_targets:
        target_id = entry.get("targetId")
        if not target_id or target_id in existing:
            continue
        action = entry.get("action") or "interact"
        category_hint = entry.get("targetCategory")
        obj_type = _select_object_type(object_defs, action, category_hint, target_id, rng)
        if not obj_type:
            continue
        x, y = pop_pos()
        if x is None:
            break
        map_data.setdefault("objects", []).append({"id": target_id, "type": obj_type, "x": x, "y": y})
        existing.add(target_id)
