STYLE_BIBLE = (
    "Sprite frame for a 2D game. "
    "Transparent background (alpha). "
    "PNG with alpha channel. "
    "Side view pony facing right. "
    "Full body visible, no cropping, extra padding around edges. "
    "Leave a clear transparent margin around the pony. "
    "Clean silhouette, simple storybook shading. "
    "No text, no border, no scenery, no background. "
    "Regular quadruped pony, not humanoid."
)


WALK_HOOF_POSITIONS = [
    "front-right forward, front-left back, rear-right back, rear-left forward",
    "front-right down, front-left lifting, rear-right lifting, rear-left down",
    "front-right back, front-left forward, rear-right forward, rear-left back",
    "front-right lifting, front-left down, rear-right down, rear-left lifting",
]

TROT_HOOF_POSITIONS = [
    "front-right forward with rear-left forward, front-left back with rear-right back",
    "front-right down, rear-left down, front-left lifting, rear-right lifting",
    "front-right back with rear-left back, front-left forward with rear-right forward",
    "front-right lifting, rear-left lifting, front-left down, rear-right down",
]


def _format_identity(pony):
    name = pony.get("name", "Unknown")
    species = pony.get("species", "pony").lower()
    body_color = pony.get("body_color") or "pastel coat"
    mane_color = pony.get("mane_color") or "soft mane and tail"
    eye_color = pony.get("eye_color")
    vibe = pony.get("vibe") or pony.get("personality")

    lines = [
        f"Character: {name}, a {species} pony.",
        f"Coat color: {body_color}.",
        f"Mane and tail color: {mane_color}.",
    ]

    if eye_color:
        lines.append(f"Eye color: {eye_color}.")
    if vibe:
        lines.append(f"Vibe: {vibe}.")

    if species == "unicorn":
        lines.append("Include a small unicorn horn.")
    else:
        lines.append("No horn.")

    return " ".join(lines)


def _format_action_cue(pony, action_id, frame_index, frame_count):
    base = f"Action: {action_id}."
    frame_hint = ""
    if frame_count > 1:
        frame_hint = f" Frame {frame_index + 1} of {frame_count}."

    if action_id == "idle":
        return f"{base}{frame_hint} Standing pose, gentle smile, relaxed tail."

    if action_id == "walk":
        position = WALK_HOOF_POSITIONS[frame_index % len(WALK_HOOF_POSITIONS)]
        return (
            f"{base}{frame_hint} Walking cycle with {position}."
        )

    if action_id == "trot":
        position = TROT_HOOF_POSITIONS[frame_index % len(TROT_HOOF_POSITIONS)]
        return (
            f"{base}{frame_hint} Energetic trot with {position}, slight bounce."
        )

    if action_id == "sleep":
        return f"{base}{frame_hint} Sleeping, curled up or lying down, eyes closed."

    if action_id == "laugh":
        return f"{base}{frame_hint} Happy laugh, head tilt, bright smile."

    if action_id == "cry":
        return f"{base}{frame_hint} Sad expression with teardrops, drooping head."

    if action_id == "magic":
        species = pony.get("species", "pony").lower()
        if species == "unicorn":
            return (
                f"{base}{frame_hint} Magic pose with a glowing horn and subtle sparkles."
            )
        return (
            f"{base}{frame_hint} Magic pose with glittery aura and sparkles around hooves."
        )

    if action_id == "talent":
        talent = pony.get("talent", "making friends")
        return (
            f"{base}{frame_hint} Showing the talent: {talent}. "
            "Include only small magical or playful effects tied to the talent."
        )

    return f"{base}{frame_hint} Neutral standing pose."


def _format_canvas(pony):
    size = pony.get("frame_size", 512)
    try:
        size_value = int(size)
    except (TypeError, ValueError):
        size_value = 512
    return f"Canvas size: {size_value}x{size_value} pixels."


def build_sprite_prompt(pony, action_id, frame_index, frame_count):
    identity = _format_identity(pony)
    action_cue = _format_action_cue(pony, action_id, frame_index, frame_count)
    canvas = _format_canvas(pony)
    return f"{identity} {action_cue} {canvas} {STYLE_BIBLE}"
