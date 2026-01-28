from .mission_assets import build_object_definitions, build_tile_definitions, _tokenize_slug
from .mission_constants import DEFAULT_DIALOG_STATE_VERSION
from .mission_map import generate_map, _place_objects, _ensure_required_objects, _find_walkable_positions
from .mission_narrative import _build_checkpoints, _default_interactions, _normalize_narrative


def _normalize_start_by_target(value):
    if isinstance(value, dict):
        return value
    mapping = {}
    if isinstance(value, list):
        for entry in value:
            if not isinstance(entry, dict):
                continue
            target_id = entry.get("targetId")
            dialog_id = entry.get("dialogId")
            if target_id and dialog_id:
                mapping[target_id] = dialog_id
    return mapping


def _normalize_flags(flags):
    if not isinstance(flags, dict):
        return {"local": {}, "global": {}}
    local_flags = flags.get("local")
    global_flags = flags.get("global")
    if isinstance(local_flags, list):
        local_flags = {entry.get("flag"): entry.get("value") for entry in local_flags if isinstance(entry, dict) and entry.get("flag")}
    if isinstance(global_flags, list):
        global_flags = {entry.get("flag"): entry.get("value") for entry in global_flags if isinstance(entry, dict) and entry.get("flag")}
    if not isinstance(local_flags, dict):
        local_flags = {}
    if not isinstance(global_flags, dict):
        global_flags = {}
    return {"local": local_flags, "global": global_flags}


def _normalize_category(value):
    if not value:
        return ""
    return "-".join(_tokenize_slug(value))


def _align_objective_categories(objectives, map_objects, object_defs):
    if not objectives:
        return
    object_by_id = {obj.get("id"): obj for obj in map_objects if isinstance(obj, dict)}
    def_by_type = {obj.get("type"): obj for obj in object_defs if isinstance(obj, dict)}
    for objective in objectives:
        if not isinstance(objective, dict):
            continue
        target_ids = objective.get("targetIds") if isinstance(objective.get("targetIds"), list) else []
        if not target_ids:
            target_id = objective.get("targetId")
            if target_id:
                target_ids = [target_id]
        if not target_ids:
            continue
        category_sets = []
        for target_id in target_ids:
            obj = object_by_id.get(target_id)
            if not obj:
                continue
            obj_def = def_by_type.get(obj.get("type"), {})
            categories = [_normalize_category(cat) for cat in obj_def.get("categories", []) if cat]
            if categories:
                category_sets.append(set(categories))
        if not category_sets:
            continue
        common = set.intersection(*category_sets) if category_sets else set()
        if not common:
            objective["targetCategory"] = None
            continue
        current = _normalize_category(objective.get("targetCategory"))
        if current and current in common:
            continue
        preferred = None
        for candidate in ("animal", "prop"):
            if candidate in common:
                preferred = candidate
                break
        objective["targetCategory"] = preferred or sorted(common)[0]


def _normalize_dialog_id(value):
    if not isinstance(value, str):
        return value
    tokens = _tokenize_slug(value)
    if not tokens:
        return value
    return "_".join(tokens)


def _normalize_dialog_nodes(dialog, interactions, triggers, narrative):
    nodes = dialog.get("nodes") if isinstance(dialog.get("nodes"), list) else []
    mapping = {}
    used = set()
    for node in nodes:
        if not isinstance(node, dict):
            continue
        raw_id = node.get("id")
        if not isinstance(raw_id, str) or not raw_id.strip():
            continue
        base = _normalize_dialog_id(raw_id)
        if not base:
            base = raw_id.strip()
        new_id = base
        if new_id in used:
            suffix = 2
            while f"{base}_{suffix}" in used:
                suffix += 1
            new_id = f"{base}_{suffix}"
        used.add(new_id)
        mapping[raw_id] = new_id
        node["id"] = new_id

    if mapping:
        entry = dialog.get("entry")
        if isinstance(entry, str) and entry in mapping:
            dialog["entry"] = mapping[entry]
        start_by_target = dialog.get("startByTarget")
        if isinstance(start_by_target, dict):
            for target_id, node_id in list(start_by_target.items()):
                if isinstance(node_id, str) and node_id in mapping:
                    start_by_target[target_id] = mapping[node_id]
        for node in nodes:
            if not isinstance(node, dict):
                continue
            choices = node.get("choices") or []
            if not isinstance(choices, list):
                continue
            for choice in choices:
                if not isinstance(choice, dict):
                    continue
                to_id = choice.get("to")
                if isinstance(to_id, str) and to_id in mapping:
                    choice["to"] = mapping[to_id]

        if isinstance(interactions, list):
            for interaction in interactions:
                if not isinstance(interaction, dict):
                    continue
                dialog_id = interaction.get("dialog")
                if isinstance(dialog_id, str) and dialog_id in mapping:
                    interaction["dialog"] = mapping[dialog_id]

        if isinstance(triggers, dict):
            on_enter = triggers.get("onEnterZones")
            if isinstance(on_enter, list):
                for entry in on_enter:
                    if not isinstance(entry, dict):
                        continue
                    dialog_id = entry.get("dialog")
                    if isinstance(dialog_id, str) and dialog_id in mapping:
                        entry["dialog"] = mapping[dialog_id]

        if isinstance(narrative, dict):
            for key in ("intro", "outro"):
                block = narrative.get(key)
                if isinstance(block, dict):
                    dialog_id = block.get("dialog")
                    if isinstance(dialog_id, str) and dialog_id in mapping:
                        block["dialog"] = mapping[dialog_id]
            on_enter = narrative.get("onEnterZones")
            if isinstance(on_enter, list):
                for entry in on_enter:
                    if not isinstance(entry, dict):
                        continue
                    dialog_id = entry.get("dialog")
                    if isinstance(dialog_id, str) and dialog_id in mapping:
                        entry["dialog"] = mapping[dialog_id]
            on_interact = narrative.get("onInteract")
            if isinstance(on_interact, list):
                for entry in on_interact:
                    if not isinstance(entry, dict):
                        continue
                    dialog_id = entry.get("dialog")
                    if isinstance(dialog_id, str) and dialog_id in mapping:
                        entry["dialog"] = mapping[dialog_id]

    dialog["nodes"] = nodes
    return dialog


def _ensure_dialog_nodes(dialog, interactions, triggers, narrative):
    if not isinstance(dialog, dict):
        return dialog
    nodes = dialog.get("nodes") if isinstance(dialog.get("nodes"), list) else []
    node_ids = {node.get("id") for node in nodes if isinstance(node, dict) and node.get("id")}
    referenced = set()

    entry = dialog.get("entry")
    if isinstance(entry, str) and entry:
        referenced.add(entry)

    start_by_target = dialog.get("startByTarget")
    if isinstance(start_by_target, dict):
        referenced.update(
            node_id for node_id in start_by_target.values() if isinstance(node_id, str) and node_id
        )
    elif isinstance(start_by_target, list):
        for item in start_by_target:
            if not isinstance(item, dict):
                continue
            node_id = item.get("dialogId")
            if isinstance(node_id, str) and node_id:
                referenced.add(node_id)

    if isinstance(interactions, list):
        for interaction in interactions:
            if not isinstance(interaction, dict):
                continue
            dialog_id = interaction.get("dialog")
            if isinstance(dialog_id, str) and dialog_id:
                referenced.add(dialog_id)

    if isinstance(triggers, dict):
        on_enter = triggers.get("onEnterZones")
        if isinstance(on_enter, list):
            for trigger in on_enter:
                if not isinstance(trigger, dict):
                    continue
                dialog_id = trigger.get("dialog")
                if isinstance(dialog_id, str) and dialog_id:
                    referenced.add(dialog_id)

    if isinstance(narrative, dict):
        for key in ("intro", "outro"):
            block = narrative.get(key)
            if isinstance(block, dict):
                dialog_id = block.get("dialog")
                if isinstance(dialog_id, str) and dialog_id:
                    referenced.add(dialog_id)
        for section in ("onEnterZones", "onInteract"):
            entries = narrative.get(section)
            if isinstance(entries, list):
                for entry_item in entries:
                    if not isinstance(entry_item, dict):
                        continue
                    dialog_id = entry_item.get("dialog")
                    if isinstance(dialog_id, str) and dialog_id:
                        referenced.add(dialog_id)

    missing = sorted(referenced - node_ids)
    if missing:
        for node_id in missing:
            nodes.append(
                {
                    "id": node_id,
                    "speaker": None,
                    "text": ["..."],
                    "choices": [],
                }
            )
        dialog["nodes"] = nodes
    return dialog


def _ensure_objective_target_ids(objectives, map_objects, object_defs):
    if not objectives:
        return
    object_by_id = {obj.get("id"): obj for obj in map_objects if isinstance(obj, dict)}
    def_by_type = {obj.get("type"): obj for obj in object_defs if isinstance(obj, dict)}

    def matches_category(obj, category_key):
        if not obj:
            return False
        obj_def = def_by_type.get(obj.get("type"), {})
        categories = obj_def.get("categories") if isinstance(obj_def, dict) else []
        normalized = [_normalize_category(cat) for cat in categories or []]
        return category_key in normalized or category_key in _normalize_category(obj.get("type"))

    for idx, objective in enumerate(objectives):
        if not isinstance(objective, dict):
            continue
        target_category = objective.get("targetCategory")
        if not target_category:
            continue
        target_ids = objective.get("targetIds") if isinstance(objective.get("targetIds"), list) else []
        target_id = objective.get("targetId")
        if target_ids:
            objective["targetCount"] = len(target_ids)
            objective.pop("targetId", None)
            continue
        if target_id:
            target_ids = [target_id]
        else:
            category_key = _normalize_category(target_category)
            candidates = [
                obj.get("id")
                for obj in map_objects
                if isinstance(obj, dict) and obj.get("id") and matches_category(obj, category_key)
            ]
            target_count = objective.get("targetCount")
            if isinstance(target_count, int) and target_count > 0:
                target_ids = candidates[:target_count]
            else:
                target_ids = candidates
        if target_ids:
            objective["targetIds"] = target_ids
            objective["targetCount"] = len(target_ids)
            objective.pop("targetId", None)
        else:
            objective["targetCategory"] = None


def _ensure_interactions_for_objectives(objectives, interactions):
    if not objectives:
        return interactions
    interactions = list(interactions) if isinstance(interactions, list) else []
    index = {(item.get("targetId"), item.get("action")) for item in interactions if isinstance(item, dict)}
    for objective in objectives:
        if not isinstance(objective, dict):
            continue
        obj_type = objective.get("type") or ""
        if not obj_type.endswith("_count"):
            continue
        action = obj_type.replace("_count", "")
        target_ids = objective.get("targetIds") if isinstance(objective.get("targetIds"), list) else []
        if objective.get("targetId"):
            target_ids = target_ids or [objective.get("targetId")]
        for target_id in target_ids:
            key = (target_id, action)
            if key in index:
                continue
            interactions.append({"targetId": target_id, "action": action})
            index.add(key)
    return interactions


def generate_mission(plan, seed, manifest):
    tiles = build_tile_definitions(manifest)
    objects = build_object_definitions(manifest)
    map_data = generate_map(plan, seed, tiles)
    plan_objectives = plan.get("objectives") if isinstance(plan.get("objectives"), list) else []
    objectives = [dict(obj) for obj in plan_objectives if isinstance(obj, dict)]
    map_data["objects"] = _place_objects(map_data, tiles, objects, objectives, seed)

    mission_title = plan.get("title") or plan.get("mission", {}).get("title")
    mission_subtitle = plan.get("subtitle") or plan.get("mission", {}).get("subtitle")
    for idx, obj in enumerate(objectives, start=1):
        if "targetIds" in obj or obj.get("targetCategory"):
            continue
        obj.setdefault("targetId", f"objective_{idx}")
    dialog = plan.get("dialog") if isinstance(plan.get("dialog"), dict) else {}
    dialog_nodes = dialog.get("nodes") if isinstance(dialog.get("nodes"), list) else []
    dialog_start = _normalize_start_by_target(dialog.get("startByTarget"))
    narrative = _normalize_narrative(plan.get("narrative"))
    interactions = plan.get("interactions")
    if not isinstance(interactions, list) or not interactions:
        interactions = _default_interactions(objectives)
    zones = plan.get("zones") if isinstance(plan.get("zones"), list) else []
    triggers = plan.get("triggers") if isinstance(plan.get("triggers"), dict) else {}
    checkpoints = plan.get("checkpoints") if isinstance(plan.get("checkpoints"), list) else []
    if not checkpoints:
        checkpoints = _build_checkpoints(map_data, objectives)

    dialog["nodes"] = dialog_nodes
    dialog["startByTarget"] = dialog_start
    dialog = _normalize_dialog_nodes(dialog, interactions, triggers, narrative)
    dialog = _ensure_dialog_nodes(dialog, interactions, triggers, narrative)
    dialog_nodes = dialog.get("nodes") if isinstance(dialog.get("nodes"), list) else []
    dialog_start = dialog.get("startByTarget") if isinstance(dialog.get("startByTarget"), dict) else {}

    required_targets = []
    objective_action_by_target = {}
    objective_category_by_target = {}
    for obj in objectives:
        if not isinstance(obj, dict):
            continue
        obj_type = obj.get("type") or ""
        action = obj_type.replace("_count", "") if obj_type.endswith("_count") else None
        target_ids = obj.get("targetIds") if isinstance(obj.get("targetIds"), list) else []
        if obj.get("targetId"):
            target_ids = target_ids or [obj.get("targetId")]
        for target_id in target_ids:
            if not target_id:
                continue
            objective_action_by_target[target_id] = action or "interact"
            if obj.get("targetCategory"):
                objective_category_by_target[target_id] = obj.get("targetCategory")
            required_targets.append(
                {
                    "targetId": target_id,
                    "action": action or "interact",
                    "targetCategory": obj.get("targetCategory"),
                }
            )

    for interaction in interactions:
        if not isinstance(interaction, dict):
            continue
        target_id = interaction.get("targetId")
        if not target_id:
            continue
        required_targets.append(
            {
                "targetId": target_id,
                "action": interaction.get("action") or objective_action_by_target.get(target_id) or "interact",
                "targetCategory": objective_category_by_target.get(target_id),
            }
        )

    for target_id, node_id in dialog_start.items():
        required_targets.append(
            {
                "targetId": target_id,
                "action": objective_action_by_target.get(target_id) or "talk",
                "targetCategory": objective_category_by_target.get(target_id),
            }
        )

    for entry in narrative.get("onInteract", []) if isinstance(narrative, dict) else []:
        if not isinstance(entry, dict):
            continue
        target_id = entry.get("targetId")
        if not target_id:
            continue
        required_targets.append(
            {
                "targetId": target_id,
                "action": objective_action_by_target.get(target_id) or "interact",
                "targetCategory": objective_category_by_target.get(target_id),
            }
        )

    for checkpoint in checkpoints:
        if not isinstance(checkpoint, dict):
            continue
        target_id = checkpoint.get("targetId")
        if target_id:
            required_targets.append(
                {
                    "targetId": target_id,
                    "action": objective_action_by_target.get(target_id) or "interact",
                    "targetCategory": objective_category_by_target.get(target_id),
                }
            )

    _ensure_required_objects(map_data, tiles, objects, required_targets, seed)
    _align_objective_categories(objectives, map_data.get("objects", []), objects)
    _ensure_objective_target_ids(objectives, map_data.get("objects", []), objects)
    interactions = _ensure_interactions_for_objectives(objectives, interactions)

    walkable = _find_walkable_positions(map_data, tiles)
    walkable_set = set(walkable)
    if walkable_set:
        for checkpoint in checkpoints:
            if not isinstance(checkpoint, dict):
                continue
            if checkpoint.get("targetId"):
                continue
            tx, ty = checkpoint.get("tx"), checkpoint.get("ty")
            if isinstance(tx, int) and isinstance(ty, int) and (tx, ty) in walkable_set:
                continue
            spawn = map_data.get("spawn") or {}
            fallback = (spawn.get("tx"), spawn.get("ty"))
            if fallback in walkable_set:
                checkpoint["tx"], checkpoint["ty"] = fallback
            else:
                checkpoint["tx"], checkpoint["ty"] = walkable[0]

    mission = {
        "version": 1,
        "seed": seed,
        "vibe": plan.get("vibe"),
        "title": mission_title,
        "subtitle": mission_subtitle,
        "summary": plan.get("summary"),
        "tileSize": plan.get("tileSize", 64),
        "layout": plan.get("layout", {}),
        "objectives": objectives,
        "zones": zones,
        "interactions": interactions,
        "triggers": triggers,
        "dialog": {
            "nodes": dialog_nodes,
            "startByTarget": dialog_start,
            "entry": dialog.get("entry"),
        },
        "narrative": narrative,
        "flags": _normalize_flags(plan.get("flags", {"local": {}, "global": {}})),
        "checkpoints": checkpoints,
        "assetRequests": plan.get("assetRequests", plan.get("assets", [])),
        "validation": {"version": DEFAULT_DIALOG_STATE_VERSION, "errors": []},
    }

    return {
        "mission": mission,
        "map": map_data,
        "tiles": {"tiles": tiles},
        "objects": {"objects": objects},
        "plan": plan,
    }
