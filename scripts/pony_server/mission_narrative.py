from .mission_constants import DEFAULT_NARRATIVE


def _normalize_text_list(value, fallback=None):
    if isinstance(value, str):
        text = value.strip()
        return [text] if text else ([fallback] if fallback else [])
    if isinstance(value, list):
        lines = [str(item).strip() for item in value if str(item).strip()]
        if not lines and fallback:
            return [fallback]
        return lines
    if fallback:
        return [fallback]
    return []


def _normalize_narrative_block(block, fallback=None):
    if isinstance(block, dict):
        text_value = block.get("text") or block.get("lines") or block.get("message")
        lines = _normalize_text_list(text_value, fallback)
        normalized = dict(block)
        if lines:
            normalized["text"] = lines
        elif fallback:
            normalized["text"] = [fallback]
        return normalized
    if isinstance(block, str):
        return {"text": [block]}
    if fallback:
        return {"text": [fallback]}
    return {"text": []}


def _normalize_narrative(value):
    if not value:
        return DEFAULT_NARRATIVE
    if isinstance(value, dict):
        return {
            "intro": _normalize_narrative_block(value.get("intro"), "A new adventure begins."),
            "outro": _normalize_narrative_block(value.get("outro"), "Mission complete!"),
            "onEnterZones": value.get("onEnterZones") or [],
            "onInteract": value.get("onInteract") or [],
        }
    return DEFAULT_NARRATIVE


def _default_interactions(objectives):
    interactions = []
    for obj in objectives:
        action = obj.get("type", "talk")
        if isinstance(action, str) and action.endswith("_count"):
            action = action.replace("_count", "")
        if obj.get("targetIds"):
            for target_id in obj["targetIds"]:
                interactions.append({"targetId": target_id, "action": action})
        else:
            interactions.append({"targetId": obj.get("targetId"), "action": action})
    return interactions


def _build_checkpoints(map_data, objectives):
    checkpoints = []
    spawn = map_data.get("spawn", {})
    checkpoints.append(
        {
            "id": "start",
            "label": "Start",
            "tx": spawn.get("tx", 0),
            "ty": spawn.get("ty", 0),
        }
    )
    for idx, obj in enumerate(objectives, start=1):
        if obj.get("targetIds"):
            target_id = obj.get("targetIds")[0]
        else:
            target_id = obj.get("targetId") or f"objective_{idx}"
        checkpoints.append(
            {
                "id": f"obj_{idx}",
                "label": obj.get("label") or f"Objective {idx}",
                "targetId": target_id,
            }
        )
    return checkpoints
