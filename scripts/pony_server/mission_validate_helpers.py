from collections import deque


def validate_conditions(conditions, add_error):
    if conditions is None:
        return
    if not isinstance(conditions, list):
        add_error("Conditions must be a list.")
        return
    allowed_types = {"flag", "first_time", "first_time_speaking", "first_time_speaking_to", "event"}
    allowed_ops = {"==", "!=", ">", ">=", "<", "<=", "contains"}
    for idx, condition in enumerate(conditions):
        if not isinstance(condition, dict):
            add_error(f"Condition at index {idx} must be an object.")
            continue
        cond_type = condition.get("type") or "flag"
        if cond_type not in allowed_types:
            add_error(f"Condition type {cond_type} is not supported.")
        if cond_type in {"first_time", "first_time_speaking", "first_time_speaking_to"}:
            target_id = condition.get("targetId") or condition.get("target") or condition.get("npc")
            if not target_id:
                add_error(f"Condition {idx} missing targetId.")
        if cond_type == "event":
            key = condition.get("key") or condition.get("event")
            if not key:
                add_error(f"Condition {idx} missing event key.")
        if cond_type == "flag":
            flag = condition.get("flag") or condition.get("key")
            if not flag:
                add_error(f"Condition {idx} missing flag.")
            scope = condition.get("scope", "local")
            if scope not in {"local", "global"}:
                add_error(f"Condition {idx} has invalid scope {scope}.")
            op = condition.get("op", "==")
            if op not in allowed_ops:
                add_error(f"Condition {idx} has invalid operator {op}.")


def validate_flag_updates(updates, add_error, scope):
    if updates is None:
        return
    if not isinstance(updates, list):
        add_error(f"{scope} flag updates must be a list.")
        return
    for idx, update in enumerate(updates):
        if not isinstance(update, dict):
            add_error(f"{scope} flag update at index {idx} must be an object.")
            continue
        flag = update.get("flag") or update.get("key")
        if not flag:
            add_error(f"{scope} flag update at index {idx} missing flag.")
        if update.get("scope") and update.get("scope") not in {"local", "global"}:
            add_error(f"{scope} flag update at index {idx} has invalid scope {update.get('scope')}.")


def validate_narrative(narrative, add_error, zone_ids, node_ids, map_object_ids):
    if not isinstance(narrative, dict):
        add_error("Narrative must be a JSON object.")
        return
    required_keys = ["intro", "outro", "onEnterZones", "onInteract"]
    for key in required_keys:
        if key not in narrative:
            add_error(f"Narrative missing {key}.")
    for key in ["intro", "outro"]:
        block = narrative.get(key)
        if isinstance(block, dict):
            text = block.get("text")
            if not text:
                add_error(f"Narrative {key} requires text.")
            dialog_id = block.get("dialog")
            if dialog_id and dialog_id not in node_ids:
                add_error(f"Narrative {key} references missing dialog node {dialog_id}.")
        elif isinstance(block, str):
            if not block:
                add_error(f"Narrative {key} cannot be empty.")
        elif block is not None:
            add_error(f"Narrative {key} must be a string or object.")

    on_enter = narrative.get("onEnterZones") or []
    if not isinstance(on_enter, list):
        add_error("Narrative onEnterZones must be a list.")
        on_enter = []
    for idx, entry in enumerate(on_enter):
        if not isinstance(entry, dict):
            add_error(f"Narrative onEnterZones entry {idx} must be an object.")
            continue
        zone_id = entry.get("zoneId")
        if zone_id not in zone_ids:
            add_error(f"Narrative onEnterZones entry {idx} references missing zone {zone_id}.")
        if not entry.get("text") and not entry.get("dialog"):
            add_error(f"Narrative onEnterZones entry {idx} requires text.")
        dialog_id = entry.get("dialog")
        if dialog_id and dialog_id not in node_ids:
            add_error(f"Narrative onEnterZones entry {idx} references missing dialog node {dialog_id}.")

    on_interact = narrative.get("onInteract") or []
    if not isinstance(on_interact, list):
        add_error("Narrative onInteract must be a list.")
        on_interact = []
    for idx, entry in enumerate(on_interact):
        if not isinstance(entry, dict):
            add_error(f"Narrative onInteract entry {idx} must be an object.")
            continue
        target_id = entry.get("targetId")
        if target_id not in map_object_ids:
            add_error(f"Narrative onInteract entry {idx} references missing target {target_id}.")
        if not entry.get("text") and not entry.get("dialog"):
            add_error(f"Narrative onInteract entry {idx} requires text.")
        dialog_id = entry.get("dialog")
        if dialog_id and dialog_id not in node_ids:
            add_error(f"Narrative onInteract entry {idx} references missing dialog node {dialog_id}.")


def validate_checkpoints(checkpoints, add_error, width, height, tiles_grid, tile_defs, map_objects):
    for idx, checkpoint in enumerate(checkpoints):
        if not isinstance(checkpoint, dict):
            add_error(f"Checkpoint {idx} must be an object.")
            continue
        cp_id = checkpoint.get("id")
        if not cp_id:
            add_error(f"Checkpoint {idx} missing id.")
            continue
        if checkpoint.get("targetId"):
            target_id = checkpoint.get("targetId")
            if not any(obj.get("id") == target_id for obj in map_objects):
                add_error(f"Checkpoint {cp_id or idx} references missing targetId {target_id}.")
            continue
        tx = checkpoint.get("tx")
        ty = checkpoint.get("ty")
        if not isinstance(tx, int) or not isinstance(ty, int):
            add_error(f"Checkpoint {cp_id or idx} must include tx/ty or valid targetId.")
            continue
        if width and height:
            if tx < 0 or ty < 0 or tx >= width or ty >= height:
                add_error(f"Checkpoint {cp_id or idx} is out of bounds.")
            else:
                tile_id = tiles_grid[ty * width + tx] if tiles_grid else None
                if tile_id in tile_defs and not tile_defs[tile_id].get("walkable", False):
                    add_error(f"Checkpoint {cp_id or idx} must be on a walkable tile.")


def validate_dialog_reachability(nodes, node_ids, entry_nodes, add_error):
    if not nodes:
        return
    if not entry_nodes:
        add_error("Dialog nodes exist but no entry points were defined.")
        return
    adjacency = {}
    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_id = node.get("id")
        if not node_id:
            continue
        adjacency[node_id] = []
        for choice in node.get("choices", []) or []:
            if not isinstance(choice, dict):
                continue
            target = choice.get("to")
            if target:
                adjacency[node_id].append(target)

    visited = set()
    queue = deque(entry_nodes)
    while queue:
        current = queue.popleft()
        if current in visited:
            continue
        visited.add(current)
        for next_id in adjacency.get(current, []):
            if next_id not in visited:
                queue.append(next_id)

    unreachable = node_ids - visited
    for node_id in unreachable:
        add_error(f"Dialog node {node_id} is unreachable from any entry point.")


def validate_reachability(map_data, tiles_grid, tile_defs, map_objects, objectives, zones, add_error):
    width = map_data.get("width")
    height = map_data.get("height")
    if not width or not height:
        return
    spawn = map_data.get("spawn") or {}
    start = (spawn.get("tx"), spawn.get("ty"))
    if not all(isinstance(value, int) for value in start):
        return

    walkable = set()
    for y in range(height):
        for x in range(width):
            tile_id = tiles_grid[y * width + x]
            if tile_id in tile_defs and tile_defs[tile_id].get("walkable", False):
                walkable.add((x, y))

    if start not in walkable:
        return

    visited = set()
    queue = deque([start])
    while queue:
        x, y = queue.popleft()
        if (x, y) in visited:
            continue
        visited.add((x, y))
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if (nx, ny) in walkable and (nx, ny) not in visited:
                queue.append((nx, ny))

    target_ids = set()
    for obj in objectives:
        if obj.get("targetId"):
            target_ids.add(obj.get("targetId"))
        for entry in obj.get("targetIds") or []:
            target_ids.add(entry)
    target_ids.discard(None)

    for target_id in target_ids:
        entry = next((item for item in map_objects if item.get("id") == target_id), None)
        if not entry:
            continue
        pos = (entry.get("x"), entry.get("y"))
        if pos not in visited:
            add_error(f"Object {target_id} is not reachable from spawn.")

    for zone in zones:
        if not isinstance(zone, dict):
            continue
        rect = zone.get("rect") or {}
        if not isinstance(rect, dict):
            continue
        rx, ry, rw, rh = rect.get("x"), rect.get("y"), rect.get("w"), rect.get("h")
        if not all(isinstance(value, int) for value in (rx, ry, rw, rh)):
            continue
        zone_reachable = False
        for y in range(ry, ry + rh + 1):
            for x in range(rx, rx + rw + 1):
                if (x, y) in visited:
                    zone_reachable = True
                    break
            if zone_reachable:
                break
        if not zone_reachable:
            add_error(f"Zone {zone.get('id') or 'unknown'} is not reachable from spawn.")
