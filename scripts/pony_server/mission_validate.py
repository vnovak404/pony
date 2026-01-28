from .mission_assets import _tokenize_slug
from .mission_validate_helpers import (
    validate_checkpoints,
    validate_conditions,
    validate_dialog_reachability,
    validate_flag_updates,
    validate_narrative,
    validate_reachability,
)


def validate_mission(bundle):
    errors = []
    mission = bundle.get("mission") or {}
    map_data = bundle.get("map") or {}
    tiles = (bundle.get("tiles") or {}).get("tiles") or []
    objects = (bundle.get("objects") or {}).get("objects") or []

    def add_error(message):
        errors.append(message)

    def _require_dict(value, label):
        if not isinstance(value, dict):
            add_error(f"{label} must be a JSON object.")
            return False
        return True

    def _require_list(value, label):
        if not isinstance(value, list):
            add_error(f"{label} must be a list.")
            return False
        return True

    if not _require_list(tiles, "Tiles"):
        tiles = []
    if not _require_list(objects, "Object definitions"):
        objects = []
    if not _require_dict(map_data, "Map data"):
        map_data = {}

    tile_defs = {}
    for idx, tile in enumerate(tiles):
        if not isinstance(tile, dict):
            add_error(f"Tile definition at index {idx} must be an object.")
            continue
        tile_id = tile.get("id")
        if not isinstance(tile_id, int):
            add_error(f"Tile id must be an integer (index {idx}).")
            continue
        if tile_id in tile_defs:
            add_error(f"Duplicate tile id: {tile_id}.")
            continue
        tile_defs[tile_id] = tile
        if not tile.get("name"):
            add_error(f"Tile {tile_id} missing name.")
        if "walkable" not in tile:
            add_error(f"Tile {tile_id} missing walkable flag.")

    object_defs = {}
    for idx, obj in enumerate(objects):
        if not isinstance(obj, dict):
            add_error(f"Object definition at index {idx} must be an object.")
            continue
        obj_type = obj.get("type")
        if not obj_type:
            add_error(f"Object definition missing type (index {idx}).")
            continue
        if obj_type in object_defs:
            add_error(f"Duplicate object definition type: {obj_type}.")
            continue
        object_defs[obj_type] = obj

    width = map_data.get("width")
    height = map_data.get("height")
    if not isinstance(width, int) or width <= 0:
        add_error("Map width must be a positive integer.")
        width = 0
    if not isinstance(height, int) or height <= 0:
        add_error("Map height must be a positive integer.")
        height = 0

    tiles_grid = map_data.get("tiles") or []
    if not _require_list(tiles_grid, "Map tiles"):
        tiles_grid = []
    if width and height and len(tiles_grid) != width * height:
        add_error("Tile array length does not match width*height.")

    if tiles_grid:
        for idx, tile_id in enumerate(tiles_grid):
            if not isinstance(tile_id, int):
                add_error(f"Tile index {idx} must be an integer.")
                continue
            if tile_defs and tile_id not in tile_defs:
                add_error(f"Map references undefined tile id {tile_id} at index {idx}.")

    spawn = map_data.get("spawn") or {}
    if not _require_dict(spawn, "Map spawn"):
        spawn = {}
    spawn_tx = spawn.get("tx")
    spawn_ty = spawn.get("ty")
    if not isinstance(spawn_tx, int) or not isinstance(spawn_ty, int):
        add_error("Spawn must include integer tx/ty.")
    elif width and height:
        if spawn_tx < 0 or spawn_tx >= width or spawn_ty < 0 or spawn_ty >= height:
            add_error("Spawn coordinates are out of bounds.")
        else:
            tile_id = tiles_grid[spawn_ty * width + spawn_tx] if tiles_grid else None
            if tile_id is not None and tile_id in tile_defs and not tile_defs[tile_id].get("walkable", False):
                add_error("Spawn must be on a walkable tile.")

    map_objects = map_data.get("objects") or []
    if not _require_list(map_objects, "Map objects"):
        map_objects = []

    map_object_ids = set()
    map_object_positions = set()
    for idx, obj in enumerate(map_objects):
        if not isinstance(obj, dict):
            add_error(f"Map object at index {idx} must be an object.")
            continue
        obj_id = obj.get("id")
        if not obj_id:
            add_error(f"Map object at index {idx} missing id.")
        elif obj_id in map_object_ids:
            add_error(f"Duplicate map object id: {obj_id}.")
        else:
            map_object_ids.add(obj_id)
        obj_type = obj.get("type")
        if obj_type not in object_defs:
            add_error(f"Map object {obj_id or idx} references missing type {obj_type}.")
        x = obj.get("x")
        y = obj.get("y")
        if not isinstance(x, int) or not isinstance(y, int):
            add_error(f"Map object {obj_id or idx} missing integer x/y.")
            continue
        if width and height and (x < 0 or x >= width or y < 0 or y >= height):
            add_error(f"Map object {obj_id or idx} position out of bounds.")
        if width and height:
            key = (x, y)
            if key in map_object_positions:
                add_error(f"Multiple objects share tile {x},{y}.")
            map_object_positions.add(key)
            if tiles_grid and tile_defs:
                tile_id = tiles_grid[y * width + x]
                if tile_id in tile_defs and not tile_defs[tile_id].get("walkable", False):
                    add_error(f"Map object {obj_id or idx} sits on a non-walkable tile.")

    dialog = mission.get("dialog", {}) or {}
    if not _require_dict(dialog, "Dialog"):
        dialog = {}
    nodes = dialog.get("nodes") or []
    if not _require_list(nodes, "Dialog nodes"):
        nodes = []
    dialog_entry = dialog.get("entry")
    if dialog_entry and not isinstance(dialog_entry, str):
        add_error("Dialog entry must be a string node id.")
        dialog_entry = None
    all_node_ids = {
        node.get("id")
        for node in nodes
        if isinstance(node, dict) and node.get("id")
    }
    node_ids = set()
    for idx, node in enumerate(nodes):
        if not isinstance(node, dict):
            add_error(f"Dialog node at index {idx} must be an object.")
            continue
        node_id = node.get("id")
        if not node_id:
            add_error(f"Dialog node at index {idx} missing id.")
            continue
        if node_id in node_ids:
            add_error(f"Duplicate dialog node id: {node_id}.")
        node_ids.add(node_id)
        text = node.get("text")
        if not isinstance(text, list):
            add_error(f"Dialog node {node_id} text must be a list.")
        for next_id in [choice.get("to") for choice in node.get("choices", []) if isinstance(choice, dict)]:
            if next_id and next_id not in all_node_ids:
                add_error(f"Dialog node {node_id} has missing next target {next_id}.")
        choices = node.get("choices") or []
        if not isinstance(choices, list):
            add_error(f"Dialog node {node_id} choices must be a list.")
            continue
        for c_idx, choice in enumerate(choices):
            if not isinstance(choice, dict):
                add_error(f"Dialog node {node_id} choice {c_idx} must be an object.")
                continue
            if not choice.get("text"):
                add_error(f"Dialog node {node_id} choice {c_idx} missing text.")
            target = choice.get("to")
            if target and target not in all_node_ids:
                add_error(f"Dialog choice target missing: {target}.")
            validate_conditions(choice.get("conditions"), add_error)
            validate_flag_updates(choice.get("setFlags"), add_error, "local")
            validate_flag_updates(choice.get("setGlobalFlags"), add_error, "global")

    start_by_target = dialog.get("startByTarget") or {}
    if start_by_target and not isinstance(start_by_target, dict):
        add_error("dialog.startByTarget must be an object mapping targetId -> dialog node id.")
        start_by_target = {}
    for target_id, node_id in start_by_target.items():
        if target_id not in map_object_ids:
            add_error(f"dialog.startByTarget references unknown target {target_id}.")
        if node_id not in node_ids:
            add_error(f"dialog.startByTarget references missing dialog node {node_id}.")

    objectives = mission.get("objectives") or []
    if not _require_list(objectives, "Objectives"):
        objectives = []
    if not objectives:
        add_error("Mission must include objectives.")
    allowed_objectives = {"talk_count", "interact_count", "heal_count", "magic_count"}

    def normalize_category(value):
        return "-".join(_tokenize_slug(value))

    for idx, objective in enumerate(objectives):
        if not isinstance(objective, dict):
            add_error(f"Objective at index {idx} must be an object.")
            continue
        obj_type = objective.get("type")
        if obj_type not in allowed_objectives:
            add_error(f"Objective {idx} has invalid type {obj_type}.")
        target_count = objective.get("targetCount")
        if target_count is not None and (not isinstance(target_count, int) or target_count <= 0):
            add_error(f"Objective {idx} targetCount must be a positive integer.")
        target_id = objective.get("targetId")
        target_ids = objective.get("targetIds") if isinstance(objective.get("targetIds"), list) else []
        if target_id and target_ids:
            add_error(f"Objective {idx} should not include both targetId and targetIds.")
        if target_id and target_id not in map_object_ids:
            add_error(f"Objective {idx} references missing targetId {target_id}.")
        if target_ids:
            seen = set()
            for entry in target_ids:
                if not isinstance(entry, str) or not entry:
                    add_error(f"Objective {idx} has invalid targetIds entry.")
                    continue
                if entry in seen:
                    add_error(f"Objective {idx} has duplicate targetId {entry}.")
                seen.add(entry)
                if entry not in map_object_ids:
                    add_error(f"Objective {idx} references missing targetId {entry}.")
        if isinstance(target_count, int) and target_count > 1 and not target_ids:
            add_error(f"Objective {idx} requires targetIds for targetCount > 1.")
        if target_ids and target_count and target_count != len(target_ids):
            add_error(f"Objective {idx} targetCount must match targetIds length.")
        target_category = objective.get("targetCategory")
        if target_category:
            if not isinstance(target_category, str):
                add_error(f"Objective {idx} targetCategory must be a string.")
            if not target_ids:
                add_error(f"Objective {idx} requires targetIds when using targetCategory.")
            else:
                category_key = normalize_category(target_category)
                for entry in target_ids:
                    obj = next((item for item in map_objects if item.get("id") == entry), None)
                    if not obj:
                        continue
                    obj_def = object_defs.get(obj.get("type"))
                    categories = obj_def.get("categories") if isinstance(obj_def, dict) else []
                    normalized = [normalize_category(cat) for cat in categories or []]
                    if category_key not in normalized and category_key not in normalize_category(obj.get("type")):
                        add_error(
                            f"Objective {idx} targetId {entry} does not match targetCategory {target_category}."
                        )

    zones = mission.get("zones") or []
    if not _require_list(zones, "Zones"):
        zones = []
    zone_ids = set()
    for idx, zone in enumerate(zones):
        if not isinstance(zone, dict):
            add_error(f"Zone at index {idx} must be an object.")
            continue
        zone_id = zone.get("id")
        if not zone_id:
            add_error(f"Zone at index {idx} missing id.")
            continue
        if zone_id in zone_ids:
            add_error(f"Duplicate zone id: {zone_id}.")
        zone_ids.add(zone_id)
        rect = zone.get("rect")
        if not isinstance(rect, dict):
            add_error(f"Zone {zone_id} missing rect.")
            continue
        rx, ry, rw, rh = rect.get("x"), rect.get("y"), rect.get("w"), rect.get("h")
        if not all(isinstance(value, int) for value in (rx, ry, rw, rh)):
            add_error(f"Zone {zone_id} rect must include integer x/y/w/h.")
            continue
        if rw < 0 or rh < 0:
            add_error(f"Zone {zone_id} rect w/h must be >= 0.")
            continue
        if width and height:
            if rx < 0 or ry < 0 or rx + rw > width or ry + rh > height:
                add_error(f"Zone {zone_id} rect is out of bounds.")

    triggers = mission.get("triggers") or {}
    triggers_list = triggers.get("onEnterZones") if isinstance(triggers, dict) else []
    if triggers_list and not isinstance(triggers_list, list):
        add_error("Triggers.onEnterZones must be a list.")
        triggers_list = []
    trigger_ids = set()
    for idx, trigger in enumerate(triggers_list):
        if not isinstance(trigger, dict):
            add_error(f"Trigger at index {idx} must be an object.")
            continue
        trig_id = trigger.get("id")
        if not trig_id:
            add_error(f"Trigger at index {idx} missing id.")
        elif trig_id in trigger_ids:
            add_error(f"Duplicate trigger id: {trig_id}.")
        trigger_ids.add(trig_id)
        zone_id = trigger.get("zoneId")
        if zone_id not in zone_ids:
            add_error(f"Trigger {trig_id or idx} references missing zone {zone_id}.")
        dialog_id = trigger.get("dialog")
        if dialog_id and dialog_id not in node_ids:
            add_error(f"Trigger {trig_id or idx} references missing dialog node {dialog_id}.")

    interactions = mission.get("interactions") or []
    if not _require_list(interactions, "Interactions"):
        interactions = []
    for idx, interaction in enumerate(interactions):
        if not isinstance(interaction, dict):
            add_error(f"Interaction at index {idx} must be an object.")
            continue
        target_id = interaction.get("targetId")
        if not target_id:
            add_error(f"Interaction at index {idx} missing targetId.")
            continue
        if target_id not in map_object_ids:
            add_error(f"Interaction {idx} references missing target {target_id}.")
        action = interaction.get("action")
        if action not in {"talk", "interact", "heal", "magic"}:
            add_error(f"Interaction {idx} has invalid action {action}.")
        dialog_id = interaction.get("dialog")
        if dialog_id and dialog_id not in node_ids:
            add_error(f"Interaction {idx} references missing dialog node {dialog_id}.")

    for idx, objective in enumerate(objectives):
        obj_type = objective.get("type")
        obj_action = obj_type.replace("_count", "") if isinstance(obj_type, str) else None
        if not obj_action:
            continue
        if objective.get("targetId"):
            target_id = objective.get("targetId")
            if not any(inter.get("targetId") == target_id and inter.get("action") == obj_action for inter in interactions):
                add_error(
                    f"Objective {idx} targetId {target_id} missing {obj_action} interaction."
                )
        if objective.get("targetIds"):
            for target_id in objective.get("targetIds"):
                if not any(inter.get("targetId") == target_id and inter.get("action") == obj_action for inter in interactions):
                    add_error(
                        f"Objective {idx} targetId {target_id} missing {obj_action} interaction."
                    )

    if objectives and not interactions:
        for objective in objectives:
            obj_type = objective.get("type") or ""
            if not obj_type.endswith("_count"):
                continue
            action = obj_type.replace("_count", "")
            add_error(f"Objectives require {action} interactions, but none are defined.")

    flags = mission.get("flags") or {}
    if not _require_dict(flags, "Mission flags"):
        flags = {}
    for scope in ("local", "global"):
        if flags.get(scope) is None:
            continue
        if not isinstance(flags.get(scope), dict):
            add_error(f"Mission flags.{scope} must be a JSON object.")

    narrative = mission.get("narrative") or {}
    validate_narrative(narrative, add_error, zone_ids, node_ids, map_object_ids)

    checkpoints = mission.get("checkpoints") or []
    if not _require_list(checkpoints, "Checkpoints"):
        checkpoints = []
    validate_checkpoints(checkpoints, add_error, width, height, tiles_grid, tile_defs, map_objects)

    entry_nodes = set()
    if dialog_entry:
        if dialog_entry in all_node_ids:
            entry_nodes.add(dialog_entry)
        else:
            add_error(f"Dialog entry references missing node {dialog_entry}.")
    for interaction in interactions:
        if isinstance(interaction, dict) and interaction.get("dialog"):
            entry_nodes.add(interaction.get("dialog"))
    for trigger in triggers_list:
        if isinstance(trigger, dict) and trigger.get("dialog"):
            entry_nodes.add(trigger.get("dialog"))
    for node_id in start_by_target.values():
        if node_id in all_node_ids:
            entry_nodes.add(node_id)
    validate_dialog_reachability(nodes, all_node_ids, entry_nodes, add_error)

    validate_reachability(
        map_data,
        tiles_grid,
        tile_defs,
        map_objects,
        objectives,
        zones,
        add_error,
    )

    mission.setdefault("validation", {})
    mission["validation"]["errors"] = errors
    mission["validation"]["status"] = "ok" if not errors else "error"

    return errors
