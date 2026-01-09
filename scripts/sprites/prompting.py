STYLE_BIBLE = (
    "Sprite frame for a 2D game. "
    "Single still frame, not a smooth animation. "
    "Transparent background (RGBA) with alpha channel. "
    "Side view pony facing right, nose pointing to the right. "
    "Full body visible, no cropping, extra padding around edges. "
    "Leave a clear transparent margin around the pony. "
    "Clean silhouette, simple storybook shading. "
    "No text, no border, no scenery, no background, no props. "
    "No motion blur, no ground shadow. "
    "Consistent proportions across frames. "
    "Regular quadruped pony, not humanoid."
)

WALK_TROT_STYLE = (
    f"{STYLE_BIBLE} Regular pony (quadruped), no horn, no wings. "
    "Not a unicorn or pegasus."
)

WALK_PHASES = [
    {
        "name": "WALK_CONTACT_A",
        "file": "walk_contact_a",
        "pose": (
            "Front RIGHT hoof forward touching ground; rear LEFT hoof forward touching ground; "
            "front LEFT and rear RIGHT behind body; body neutral height; head steady"
        ),
        "exclude": ["down", "pass", "up"],
    },
    {
        "name": "WALK_DOWN_A",
        "file": "walk_down_a",
        "pose": (
            "Weight on front RIGHT and rear LEFT; body slightly lowered; "
            "supporting legs slightly bent"
        ),
        "exclude": ["contact", "pass", "up"],
    },
    {
        "name": "WALK_PASS_A",
        "file": "walk_pass_a",
        "pose": (
            "Front LEFT hoof passing under body; rear RIGHT hoof passing under body; "
            "other two hooves behind; body centered"
        ),
        "exclude": ["contact", "down", "up"],
    },
    {
        "name": "WALK_UP_A",
        "file": "walk_up_a",
        "pose": (
            "Front LEFT and rear RIGHT pushing off; body slightly raised; "
            "transition toward the B contact"
        ),
        "exclude": ["contact", "down", "pass"],
    },
    {
        "name": "WALK_CONTACT_B",
        "file": "walk_contact_b",
        "pose": (
            "Front LEFT hoof forward touching ground; rear RIGHT hoof forward touching ground; "
            "front RIGHT and rear LEFT behind body; mirror of contact A"
        ),
        "exclude": ["down", "pass", "up"],
    },
    {
        "name": "WALK_DOWN_B",
        "file": "walk_down_b",
        "pose": (
            "Weight on front LEFT and rear RIGHT; body slightly lowered; "
            "supporting legs slightly bent"
        ),
        "exclude": ["contact", "pass", "up"],
    },
    {
        "name": "WALK_PASS_B",
        "file": "walk_pass_b",
        "pose": (
            "Front RIGHT hoof passing under body; rear LEFT hoof passing under body; "
            "other two hooves behind; body centered"
        ),
        "exclude": ["contact", "down", "up"],
    },
    {
        "name": "WALK_UP_B",
        "file": "walk_up_b",
        "pose": (
            "Front RIGHT and rear LEFT pushing off; body slightly raised"
        ),
        "exclude": ["contact", "down", "pass"],
    },
]

TROT_PHASES = [
    {
        "name": "TROT_CONTACT_A",
        "file": "trot_contact_a",
        "pose": (
            "Front RIGHT and rear LEFT contacting ground together; "
            "other diagonal pair lifted and moving forward; slight forward energy"
        ),
        "exclude": ["down", "push-off"],
    },
    {
        "name": "TROT_DOWN_A",
        "file": "trot_down_a",
        "pose": (
            "Weight on front RIGHT and rear LEFT; body compressed; legs bent"
        ),
        "exclude": ["contact", "push-off"],
    },
    {
        "name": "TROT_PUSH_A",
        "file": "trot_push_a",
        "pose": (
            "Front RIGHT and rear LEFT pushing off; body rising; "
            "other diagonal pair swinging forward"
        ),
        "exclude": ["contact", "down"],
    },
    {
        "name": "TROT_CONTACT_B",
        "file": "trot_contact_b",
        "pose": (
            "Front LEFT and rear RIGHT contacting ground together; "
            "other diagonal pair lifted and moving forward"
        ),
        "exclude": ["down", "push-off"],
    },
    {
        "name": "TROT_DOWN_B",
        "file": "trot_down_b",
        "pose": (
            "Weight on front LEFT and rear RIGHT; body compressed; legs bent"
        ),
        "exclude": ["contact", "push-off"],
    },
    {
        "name": "TROT_PUSH_B",
        "file": "trot_push_b",
        "pose": (
            "Front LEFT and rear RIGHT pushing off; body rising"
        ),
        "exclude": ["contact", "down"],
    },
]

PHASES_BY_ACTION = {"walk": WALK_PHASES, "trot": TROT_PHASES}


def _format_identity(pony, force_regular=False):
    name = pony.get("name", "Unknown")
    species = pony.get("species", "pony").lower()
    body_color = pony.get("body_color") or "pastel coat"
    mane_color = pony.get("mane_color") or "soft mane and tail"
    accent_color = pony.get("accent_color")
    markings = pony.get("markings")
    accessories = pony.get("accessories")
    eye_color = pony.get("eye_color")
    vibe = pony.get("vibe") or pony.get("personality")

    if force_regular:
        species_label = "regular pony"
    else:
        species_label = f"{species} pony"

    lines = [
        f"Character: {name}, a {species_label}.",
        f"Coat color: {body_color}.",
        f"Mane and tail color: {mane_color}.",
    ]

    if eye_color:
        lines.append(f"Eye color: {eye_color}.")
    if accent_color:
        lines.append(f"Accent color: {accent_color}.")
    if markings:
        lines.append(f"Markings: {markings}.")
    if accessories:
        lines.append(f"Accessories: {accessories}.")
    if vibe:
        lines.append(f"Vibe: {vibe}.")

    if force_regular:
        lines.append("No horn or wings.")
    elif species == "unicorn":
        lines.append("Include a small unicorn horn.")
    else:
        lines.append("No horn.")

    return " ".join(lines)


def _format_gait_intent(action_id):
    if action_id == "walk":
        return (
            "Gait intent: relaxed walk, diagonal support pairs, small vertical bounce, "
            "no airborne phase."
        )
    if action_id == "trot":
        return (
            "Gait intent: energetic trot, diagonal pairs move together, noticeable bounce, "
            "brief suspension implied."
        )
    return ""


def _format_action_cue(pony, action_id, frame_index, frame_count):
    base = f"Action: {action_id}."
    frame_hint = ""
    if frame_count > 1:
        frame_hint = f" Frame {frame_index + 1} of {frame_count}."

    if action_id == "idle":
        return f"{base}{frame_hint} Standing pose, gentle smile, relaxed tail."

    if action_id == "sleep":
        return f"{base}{frame_hint} Sleeping, curled up or lying down, eyes closed."

    if action_id == "eat":
        return (
            f"{base}{frame_hint} Eating pose, head lowered as if nibbling, "
            "content expression, no props."
        )

    if action_id == "drink":
        return (
            f"{base}{frame_hint} Drinking pose, muzzle lowered as if sipping, "
            "relaxed stance, no props."
        )

    if action_id == "vet":
        return (
            f"{base}{frame_hint} Clinic care pose, calm and cooperative, "
            "standing or seated, no props."
        )

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


def _format_phase_exclusions(phase_name, excludes):
    if not excludes:
        return f"This is only {phase_name}."
    excluded = ", ".join([f"not {item}" for item in excludes])
    return f"This is only {phase_name} ({excluded})."


def _format_canvas(pony):
    size = pony.get("frame_size", 512)
    try:
        size_value = int(size)
    except (TypeError, ValueError):
        size_value = 512
    return f"Canvas size: {size_value}x{size_value} pixels."


def get_action_frame_name(action_id, frame_index, frame_count=None):
    phases = PHASES_BY_ACTION.get(action_id)
    if phases and frame_index < len(phases):
        return phases[frame_index]["file"]
    return f"{action_id}_{frame_index + 1:02d}"


def get_action_frame_order(action_id):
    phases = PHASES_BY_ACTION.get(action_id)
    if not phases:
        return None
    return [phase["file"] for phase in phases]


def build_sprite_prompt(pony, action_id, frame_index, frame_count):
    if action_id in PHASES_BY_ACTION:
        phases = PHASES_BY_ACTION[action_id]
        phase = phases[frame_index % len(phases)]
        identity = _format_identity(pony, force_regular=True)
        canvas = _format_canvas(pony)
        gait_intent = _format_gait_intent(action_id)
        exclusions = _format_phase_exclusions(phase["name"], phase["exclude"])
        return (
            f"{WALK_TROT_STYLE} {identity} "
            f"This image represents {phase['name']} of a {action_id} cycle. "
            f"This is one frame of a {action_id} cycle. "
            f"{gait_intent} "
            f"Pose details: {phase['pose']}. "
            f"{exclusions} "
            f"{canvas}"
        )

    identity = _format_identity(pony)
    action_cue = _format_action_cue(pony, action_id, frame_index, frame_count)
    canvas = _format_canvas(pony)
    return f"{identity} {action_cue} {canvas} {STYLE_BIBLE}"
