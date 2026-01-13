#!/usr/bin/env python3
import argparse
import json
import os
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.speech_helper.openai_client import chat_response, ensure_api_key


DEFAULT_DATA_PATH = "data/ponies.json"
DEFAULT_LORE_PATH = "data/pony_lore.json"
DEFAULT_BACKSTORIES_PATH = "data/pony_backstories.json"
DEFAULT_ARCS_PATH = "data/lore_arcs.json"
DEFAULT_MODEL = os.getenv("OPENAI_LORE_MODEL", "gpt-5-mini-2025-08-07")
DEFAULT_WORD_TARGET = 900
ALLOWED_SENTIMENTS = {"adoring", "warm", "neutral", "admiring", "protective"}
FAMILY_CHILDREN = {"stellacorn", "catohorn", "tiny-horn"}
RELATION_TERMS = r"(?:parent|parents|mother|father|son|daughter|child|children|sibling|siblings)"
FAMILY_NAMES = r"(?:Taticorn|Tati\s*corn|Nessie[ -]?Star)"
FAMILY_PATTERN = re.compile(
    rf"{FAMILY_NAMES}[^.\n]{{0,80}}\b{RELATION_TERMS}\b|\b{RELATION_TERMS}\b[^.\n]{{0,80}}{FAMILY_NAMES}",
    re.IGNORECASE,
)
ARC_SLOTS = [
    "origin",
    "spark",
    "challenge",
    "turning_point",
    "community_role",
    "ritual",
    "bond",
    "future",
]

BUNDLE_SPECS = {
    "builder": {
        "place": "the lumberyard",
        "craft": "building",
        "focus": "woodwork",
        "role": "builder",
        "ritual": "checking every beam for a steady fit",
        "bond": "a trusted apprentice",
        "challenge": "a storm cracked the promenade boards",
        "turning": "rebuilding a neighbor's porch",
        "future": "a new community hall with warm timber arches",
    },
    "healer": {
        "place": "the pony clinic",
        "craft": "healing",
        "focus": "care",
        "role": "healer",
        "ritual": "brewing a calming tea",
        "bond": "a grateful patient",
        "challenge": "a wave of scrapes after a busy race day",
        "turning": "a night spent tending frightened foals",
        "future": "a brighter wellness nook for everypony",
    },
    "forest": {
        "place": "Whispering Forest",
        "craft": "animal rescue",
        "focus": "gentle tracking",
        "role": "forest helper",
        "ritual": "listening for birdsong at dawn",
        "bond": "a rescued critter",
        "challenge": "a tangled thicket after a storm",
        "turning": "guiding a lost fawn home",
        "future": "a safer woodland trail",
    },
    "library": {
        "place": "Sparkle Library",
        "craft": "storytelling",
        "focus": "books",
        "role": "storytime helper",
        "ritual": "arranging cushions before the day begins",
        "bond": "a young reader",
        "challenge": "a mix-up of misplaced storybooks",
        "turning": "a tale that calmed a whole room",
        "future": "a new reading nook with twinkly lights",
    },
    "sky": {
        "place": "the cloud ridge",
        "craft": "cloud shaping",
        "focus": "skywork",
        "role": "sky guide",
        "ritual": "checking the morning wind",
        "bond": "a cloud friend who loves to drift",
        "challenge": "a sudden storm front over Ponyville",
        "turning": "sculpting clouds for a town festival",
        "future": "a sky parade that everyone can see",
    },
    "adventure": {
        "place": "the trailhead outside town",
        "craft": "scouting",
        "focus": "curiosity",
        "role": "scout",
        "ritual": "packing a tiny compass and a snack",
        "bond": "a trail buddy with brave hooves",
        "challenge": "a hidden path that twisted in the hills",
        "turning": "a map that solved a mystery",
        "future": "a grand treasure map for Ponyville",
    },
    "athletic": {
        "place": "the race track",
        "craft": "training",
        "focus": "speed and balance",
        "role": "coach",
        "ritual": "stretching at sunrise",
        "bond": "a training partner who never gives up",
        "challenge": "a tough race against the wind",
        "turning": "helping a friend find their stride",
        "future": "a town relay that brings everypony together",
    },
    "culinary": {
        "place": "Sunrise Bakery",
        "craft": "baking",
        "focus": "kindness treats",
        "role": "chef",
        "ritual": "setting out warm bread for early visitors",
        "bond": "a neighbor who loves sweet rolls",
        "challenge": "a busy market morning with too many orders",
        "turning": "a recipe that cheered the whole town",
        "future": "a kindness menu for every season",
    },
    "festival": {
        "place": "the town square",
        "craft": "lantern guiding",
        "focus": "light and welcome",
        "role": "lantern guide",
        "ritual": "polishing lanterns at dusk",
        "bond": "a parade partner who loves the glow",
        "challenge": "a foggy night before a celebration",
        "turning": "lighting the way for a festival march",
        "future": "a glowing promenade of lanterns",
    },
    "magic": {
        "place": "Mystic Tower",
        "craft": "spellwork",
        "focus": "mystic study",
        "role": "arcane helper",
        "ritual": "practicing a calming spell",
        "bond": "a well-worn spellbook",
        "challenge": "a tangled enchantment near the lake",
        "turning": "a spell that saved Silver Lake",
        "future": "a new protective charm for Ponyville",
    },
}

BUNDLE_VARIANTS = {
    "builder": 2,
    "healer": 2,
    "forest": 2,
    "library": 2,
    "culinary": 2,
    "sky": 3,
    "adventure": 3,
    "athletic": 3,
    "festival": 3,
    "magic": 3,
}

SLOT_TEMPLATES = {
    "origin": [
        "Grew up near {place}, where {focus} was part of daily life.",
        "Moved to Ponyville to be closer to {place} and learn {craft}.",
        "Raised beside {place}, learning {focus} from an early age.",
    ],
    "spark": [
        "First discovered a gift for {craft} during a busy day at {place}.",
        "A small moment at {place} sparked a lifelong love of {craft}.",
        "A friend at {place} asked for help, and {craft} suddenly clicked.",
    ],
    "challenge": [
        "Faced a tough day when {challenge} tested their patience.",
        "Learned resilience after {challenge} threatened the calm of {place}.",
        "Was tested by {challenge}, and chose kindness anyway.",
    ],
    "turning_point": [
        "Chose the path of {role} after {turning}.",
        "Promised to serve Ponyville when {turning}.",
        "Found their purpose during {turning}.",
    ],
    "community_role": [
        "Now keeps {place} welcoming by using {craft} with care.",
        "Helps Ponyville thrive by guiding others with {focus}.",
        "Known for making {place} feel safe and bright.",
    ],
    "ritual": [
        "Starts each morning by {ritual}.",
        "Keeps a small habit: {ritual}, no matter how busy.",
        "Their favorite ritual is {ritual} before the day begins.",
    ],
    "bond": [
        "Shares a close bond with {bond}, who reminds them to stay gentle.",
        "Finds comfort in {bond}, a steady companion through busy days.",
        "Keeps a treasured connection with {bond}, a reminder of their roots.",
    ],
    "future": [
        "Dreams of building {future} for Ponyville.",
        "Hopes to create {future} so every pony can feel welcome.",
        "Wants to someday guide the town toward {future}.",
    ],
}


def load_json(path, default):
    if not Path(path).exists():
        return default
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def save_json(path, payload):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=True)
        handle.write("\n")


def _build_default_arcs():
    arcs = []
    for bundle, spec in BUNDLE_SPECS.items():
        variants = BUNDLE_VARIANTS.get(bundle, 2)
        for slot in ARC_SLOTS:
            templates = SLOT_TEMPLATES.get(slot, [])[:variants]
            for index, template in enumerate(templates, start=1):
                text = template.format(**spec)
                arc_id = f"{bundle}-{slot}-{index}"
                arcs.append(
                    {
                        "id": arc_id,
                        "slot": slot,
                        "bundle": bundle,
                        "text": text,
                    }
                )
    return {
        "version": 1,
        "slots": ARC_SLOTS,
        "bundles": list(BUNDLE_SPECS.keys()),
        "arcs": arcs,
    }


def load_arcs(path):
    data = load_json(path, None)
    if not isinstance(data, dict) or "arcs" not in data:
        data = _build_default_arcs()
        save_json(path, data)
    return data


def build_arc_index(arcs):
    by_id = {}
    by_bundle_slot = {}
    for arc in arcs:
        arc_id = arc.get("id")
        bundle = arc.get("bundle")
        slot = arc.get("slot")
        if not arc_id or not bundle or not slot:
            continue
        by_id[arc_id] = arc
        by_bundle_slot.setdefault(bundle, {}).setdefault(slot, []).append(arc)
    return by_id, by_bundle_slot


def choose_bundle(pony):
    slug = pony.get("slug")
    by_slug = {
        "taticorn": "builder",
        "nessie-star": "healer",
        "stellacorn": "forest",
        "catohorn": "magic",
        "tiny-horn": "library",
        "golden-violet": "festival",
        "sky-sprinter": "sky",
        "sunny-pippin": "adventure",
        "moonbeam": "sky",
        "gleam-treasure": "athletic",
        "pixie": "athletic",
        "maria": "culinary",
    }
    return by_slug.get(slug, "festival")


def build_used_arc_map(lore, arc_by_id):
    used = {}
    for entry in lore.get("ponies", {}).values():
        bundle = entry.get("arcBundle")
        arc_tuple = entry.get("arcTuple", [])
        if not bundle or not arc_tuple:
            continue
        bundle_used = used.setdefault(bundle, {})
        for arc_id in arc_tuple:
            arc = arc_by_id.get(arc_id)
            if not arc:
                continue
            slot_used = bundle_used.setdefault(arc["slot"], set())
            slot_used.add(arc_id)
    return used


def pick_arc_tuple(bundle, arc_by_bundle_slot, used_map, rng):
    arc_tuple = []
    for slot in ARC_SLOTS:
        pool = arc_by_bundle_slot.get(bundle, {}).get(slot, [])
        if not pool:
            continue
        slot_used = used_map.setdefault(bundle, {}).setdefault(slot, set())
        unused = [arc for arc in pool if arc["id"] not in slot_used]
        if not unused:
            slot_used.clear()
            unused = pool
        arc = rng.choice(unused)
        arc_tuple.append(arc)
        slot_used.add(arc["id"])
    return arc_tuple


def build_arc_lines(arc_tuple):
    lines = []
    for arc in arc_tuple:
        slot = arc.get("slot", "")
        text = arc.get("text", "")
        if slot and text:
            lines.append(f"{slot}: {text}")
    return lines


def parse_only(value):
    if not value:
        return []
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def _pony_base_entry(pony):
    return {
        "name": pony.get("name"),
        "slug": pony.get("slug"),
        "species": pony.get("species"),
        "home": pony.get("house"),
        "job": pony.get("job"),
        "talent": pony.get("talent"),
        "personality": pony.get("personality"),
        "relationships": {},
        "creatorFeedback": "",
        "opinions": {},
    }


def seed_lore_entries(lore, ponies):
    lore.setdefault("version", 1)
    lore.setdefault("ponies", {})
    for pony in ponies:
        slug = pony.get("slug")
        if not slug:
            continue
        entry = lore["ponies"].get(slug)
        if not entry:
            entry = _pony_base_entry(pony)
            lore["ponies"][slug] = entry
        for key in ("name", "slug", "species", "home", "job", "talent", "personality"):
            if entry.get(key) in (None, ""):
                entry[key] = pony.get(key) if key != "home" else pony.get("house")
        entry.setdefault("relationships", {})
        entry.setdefault("creatorFeedback", "")
        entry.setdefault("opinions", {})
    return lore


def seed_opinions(lore, slugs):
    for slug in slugs:
        entry = lore["ponies"].setdefault(slug, {})
        opinions = entry.setdefault("opinions", {})
        for other in slugs:
            if other == slug:
                continue
            if other in opinions:
                continue
            if other == "tiny-horn":
                sentiment = "adoring"
            elif other == "stellacorn":
                sentiment = "warm"
            else:
                sentiment = "warm"
            opinions[other] = {"sentiment": sentiment, "notes": ""}
    return lore


def _format_pony_summary(pony):
    parts = [
        f"name: {pony.get('name')}",
        f"slug: {pony.get('slug')}",
        f"species: {pony.get('species')}",
        f"talent: {pony.get('talent')}",
        f"personality: {pony.get('personality')}",
    ]
    job = pony.get("job") or {}
    if isinstance(job, dict):
        parts.append(f"job: {job.get('title')} at {job.get('locationId')}")
    home = pony.get("house") or {}
    if isinstance(home, dict):
        parts.append(f"home: {home.get('name')}")
    return "; ".join(part for part in parts if part and "None" not in str(part))


def _build_backstory_prompt(pony, word_target, family_notes, arc_lines):
    summary = _format_pony_summary(pony)
    slug = pony.get("slug")
    rules = [
        f"Write a Ponyville backstory between 800 and 1000 words (target {word_target}).",
        "Warm, child-friendly tone.",
        "Mention Ponyville, the pony's home, and at least one local location.",
        "Keep Stellacorn described neutrally at worst.",
        "Tiny Horn should be spoken about with warmth or adoration.",
        (
            "Only Stellacorn, Catohorn, and Tiny Horn are the children of Taticorn and Nessie Star."
            if slug not in FAMILY_CHILDREN
            else "This pony is a child of Taticorn and Nessie Star."
        ),
        (
            "This pony is not related to Taticorn or Nessie Star. Do not call them parents or siblings."
            if slug not in FAMILY_CHILDREN
            else "Make the family relationship clear and positive."
        ),
        "Do not describe any other pony as their child or sibling.",
        "End with a complete sentence.",
        "Return plain text only. No JSON wrappers.",
    ]
    arc_block = "\n- " + "\n- ".join(arc_lines) if arc_lines else " (none)"
    prompt = (
        "You are writing lore for the Ponyville universe.\n"
        f"Pony summary: {summary}\n"
        f"Family canon: {family_notes}\n\n"
        f"Arc tuple (use all of these beats):{arc_block}\n\n"
        "Rules:\n- " + "\n- ".join(rules)
    )
    return prompt


def _extract_json(content):
    content = content.strip()
    try:
        parsed = json.loads(content)
        if isinstance(parsed, str):
            return json.loads(parsed)
        return parsed
    except json.JSONDecodeError:
        pass
    start = content.find("{")
    end = content.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in response.")
    return json.loads(content[start : end + 1])


def _extract_chat_text(response):
    if not isinstance(response, dict):
        return ""
    output_text = response.get("output_text")
    if isinstance(output_text, str) and output_text:
        return output_text
    output = response.get("output")
    if isinstance(output, list):
        parts = []
        for item in output:
            if not isinstance(item, dict):
                continue
            for content in item.get("content", []):
                if not isinstance(content, dict):
                    continue
                text = content.get("text")
                if text:
                    parts.append(text)
        if parts:
            return "\n".join(parts)
    choices = response.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    return message.get("content", "")


def _normalize_backstories(backstories):
    updated = False
    for slug, story in list(backstories.items()):
        if not isinstance(story, str):
            continue
        stripped = story.strip()
        if not stripped.startswith("{") or "\"backstory\"" not in stripped:
            continue
        parsed = _unwrap_backstory_string(stripped)
        if parsed:
            backstories[slug] = parsed
            updated = True
    return updated


def _unwrap_backstory_string(raw):
    try:
        parsed = _extract_json(raw)
        if isinstance(parsed, dict) and parsed.get("backstory"):
            return parsed["backstory"]
    except ValueError:
        pass
    marker = "\"backstory\""
    start = raw.find(marker)
    if start == -1:
        return None
    colon = raw.find(":", start)
    if colon == -1:
        return None
    first_quote = raw.find("\"", colon + 1)
    if first_quote == -1:
        return None
    last_quote = raw.rfind("\"")
    if last_quote == -1 or last_quote <= first_quote:
        last_quote = len(raw)
    candidate = raw[first_quote + 1 : last_quote]
    candidate = candidate.replace("\\n", "\n").replace('\\"', '"')
    return candidate.strip() or None


def _backstory_max_tokens(word_target):
    target = max(1200, word_target * 2 + 400)
    return min(3000, target)


def _summary_max_tokens(word_target):
    target = max(200, word_target * 2)
    return min(400, target)


def _violates_family_rules(slug, text):
    if slug in FAMILY_CHILDREN or slug in {"taticorn", "nessie-star"}:
        return False
    if not text:
        return False
    return bool(FAMILY_PATTERN.search(text))


def generate_backstory(
    pony, api_key, model, word_target, family_notes, arc_lines, dry_run, max_retries=2
):
    prompt = _build_backstory_prompt(pony, word_target, family_notes, arc_lines)
    if dry_run:
        print(prompt)
        return None
    slug = pony.get("slug", "")
    messages = [
        {"role": "system", "content": "Return only plain text."},
        {"role": "user", "content": prompt},
    ]
    for attempt in range(max_retries + 1):
        response = chat_response(
            messages,
            model=model,
            api_key=api_key,
            max_tokens=_backstory_max_tokens(word_target),
            temperature=0.6,
        )
        content = _extract_chat_text(response)
        try:
            data = _extract_json(content)
            backstory = data.get("backstory", "").strip()
        except ValueError:
            backstory = content.strip()
        if not backstory:
            raise RuntimeError("Empty backstory generated.")
        if _violates_family_rules(slug, backstory):
            if attempt < max_retries:
                continue
            raise RuntimeError(
                f"Backstory mentions Taticorn/Nessie as family for {slug}."
            )
        return backstory
    return None


def _build_summary_prompt(backstory):
    return (
        "Summarize the following Ponyville backstory in about 100 words "
        "(90-110 words). Keep names and places. Warm, child-friendly tone. "
        "End with a complete sentence. Return plain text only.\n\n"
        f"Backstory:\n{backstory}"
    )


def generate_backstory_summary(backstory, api_key, model, word_target, dry_run):
    if not backstory:
        return ""
    prompt = _build_summary_prompt(backstory)
    if dry_run:
        print(prompt)
        return None
    messages = [
        {"role": "system", "content": "Return only plain text."},
        {"role": "user", "content": prompt},
    ]
    response = chat_response(
        messages,
        model=model,
        api_key=api_key,
        max_tokens=_summary_max_tokens(word_target),
        temperature=0.4,
    )
    content = _extract_chat_text(response)
    summary = content.strip()
    return summary


def _summary_targets(selected, slugs, backstories):
    available = set(backstories.get("backstories", {}).keys())
    if selected:
        return [slug for slug in selected if slug in available]
    return [slug for slug in slugs if slug in available]


def generate_summaries(
    target_slugs, backstories, lore, api_key, model, dry_run, refresh=False
):
    total = len(target_slugs)
    if total:
        print(f"Generating summaries: {total}", flush=True)
    for index, slug in enumerate(target_slugs, start=1):
        backstory = backstories.get("backstories", {}).get(slug, "")
        if not backstory:
            continue
        entry = lore["ponies"].setdefault(slug, {})
        if entry.get("backstorySummary") and not refresh:
            continue
        _progress("Summary", index, total, slug)
        summary = generate_backstory_summary(
            backstory,
            api_key=api_key,
            model=model,
            word_target=100,
            dry_run=dry_run,
        )
        if summary:
            entry["backstorySummary"] = summary
            save_json(args.lore, lore)


def _build_opinions_prompt(pony, others, family_notes):
    other_lines = []
    for other in others:
        other_lines.append(_format_pony_summary(other))
    rules = [
        "Create opinions for each other pony listed.",
        "Allowed sentiments: adoring, warm, neutral, admiring, protective.",
        "Stellacorn must be neutral or better.",
        "Tiny Horn should be adoring or warm.",
        "Return JSON only: {\"opinions\": {\"slug\": {\"sentiment\": \"...\", \"notes\": \"...\"}}}.",
        "Notes should be one short sentence.",
    ]
    prompt = (
        "You are writing Ponyville relationship notes.\n"
        f"Source pony: {_format_pony_summary(pony)}\n"
        f"Family canon: {family_notes}\n"
        "Other ponies:\n- " + "\n- ".join(other_lines) + "\n\n"
        "Rules:\n- " + "\n- ".join(rules)
    )
    return prompt


def generate_opinions(pony, others, api_key, model, family_notes, dry_run):
    prompt = _build_opinions_prompt(pony, others, family_notes)
    if dry_run:
        print(prompt)
        return None
    messages = [
        {"role": "system", "content": "Return only JSON."},
        {"role": "user", "content": prompt},
    ]
    response = chat_response(
        messages,
        model=model,
        api_key=api_key,
        max_tokens=900,
        temperature=0.5,
    )
    content = _extract_chat_text(response)
    try:
        data = _extract_json(content)
    except ValueError:
        return {}
    return data.get("opinions", {})


def _apply_opinion_rules(opinions):
    cleaned = {}
    for slug, entry in opinions.items():
        if not isinstance(entry, dict):
            continue
        sentiment = entry.get("sentiment", "warm")
        notes = entry.get("notes", "")
        if slug == "tiny-horn":
            sentiment = "adoring"
        elif slug == "stellacorn" and sentiment not in ALLOWED_SENTIMENTS:
            sentiment = "warm"
        elif sentiment not in ALLOWED_SENTIMENTS:
            sentiment = "warm"
        cleaned[slug] = {"sentiment": sentiment, "notes": notes}
    return cleaned


def _progress(label, index, total, slug):
    print(f"[{index}/{total}] {label}: {slug}", flush=True)


def main():
    parser = argparse.ArgumentParser(description="Generate pony lore and backstories.")
    parser.add_argument("--data", default=DEFAULT_DATA_PATH)
    parser.add_argument("--lore", default=DEFAULT_LORE_PATH)
    parser.add_argument("--backstories", default=DEFAULT_BACKSTORIES_PATH)
    parser.add_argument("--arcs", default=DEFAULT_ARCS_PATH)
    parser.add_argument("--env-file", default=".env")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--word-target", type=int, default=DEFAULT_WORD_TARGET)
    parser.add_argument("--max-retries", type=int, default=2)
    parser.add_argument("--arc-variants", type=int, default=1)
    parser.add_argument("--refresh-arcs", action="store_true")
    parser.add_argument("--seed", type=int)
    parser.add_argument("--only", default="")
    parser.add_argument("--skip-backstories", action="store_true")
    parser.add_argument("--update-opinions", action="store_true")
    parser.add_argument(
        "--opinions-scope",
        choices=("all", "selected"),
        default="all",
        help="Generate opinions for all ponies or only the selected ones.",
    )
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--seed-only", action="store_true")
    parser.add_argument(
        "--refresh-summaries",
        action="store_true",
        help="Regenerate backstory summaries even if they already exist.",
    )
    parser.add_argument(
        "--summaries-only",
        action="store_true",
        help="Only generate backstory summaries (no backstories/opinions).",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    data = load_json(args.data, {})
    pony_list = data.get("ponies", []) if isinstance(data, dict) else []
    pony_by_slug = {pony.get("slug"): pony for pony in pony_list if pony.get("slug")}
    slugs = list(pony_by_slug.keys())

    lore = load_json(args.lore, {"version": 1, "ponies": {}})
    backstories = load_json(args.backstories, {"version": 1, "backstories": {}})
    arcs_data = load_arcs(args.arcs)
    arc_by_id, arc_by_bundle_slot = build_arc_index(arcs_data.get("arcs", []))
    lore = seed_lore_entries(lore, pony_list)
    lore = seed_opinions(lore, slugs)
    if _normalize_backstories(backstories.get("backstories", {})):
        save_json(args.backstories, backstories)
    used_arc_map = build_used_arc_map(lore, arc_by_id)
    rng = random.Random(args.seed) if args.seed is not None else random.SystemRandom()

    selected = parse_only(args.only)
    if not selected:
        selected = []

    if args.seed_only:
        save_json(args.lore, lore)
        save_json(args.backstories, backstories)
        return 0

    api_key = ensure_api_key(args.env_file) if not args.dry_run else None
    family_notes = (
        "Taticorn and Nessie Star are married. "
        "Their children are Stellacorn (oldest daughter), Catohorn (middle son), "
        "and Tiny Horn (youngest son). No other ponies are their children or relatives. "
        "Stellacorn is well loved and never treated negatively. "
        "Tiny Horn is adored by all ponies."
    )

    target_slugs = selected or [
        slug
        for slug in slugs
        if slug not in backstories.get("backstories", {})
    ]

    if args.summaries_only:
        api_key = ensure_api_key(args.env_file) if not args.dry_run else None
        targets = _summary_targets(selected, slugs, backstories)
        generate_summaries(
            targets,
            backstories,
            lore,
            api_key=api_key,
            model=args.model,
            dry_run=args.dry_run,
            refresh=args.refresh_summaries,
        )
        save_json(args.lore, lore)
        return 0

    if not args.skip_backstories:
        total = len(target_slugs)
        if total:
            print(f"Generating backstories: {total}", flush=True)
        for index, slug in enumerate(target_slugs, start=1):
            pony = pony_by_slug.get(slug)
            if not pony:
                continue
            if slug in backstories.get("backstories", {}) and not args.force:
                continue
            _progress("Backstory", index, total, slug)
            entry = lore["ponies"].setdefault(slug, {})
            arc_bundle = entry.get("arcBundle")
            arc_ids = entry.get("arcTuple", [])
            arc_tuple = []
            if arc_bundle and arc_ids and not args.refresh_arcs:
                arc_tuple = [arc_by_id.get(arc_id) for arc_id in arc_ids]
                arc_tuple = [arc for arc in arc_tuple if arc]
            if not arc_tuple:
                arc_bundle = choose_bundle(pony)
                arc_variants = max(1, args.arc_variants)
                local_used = {
                    arc_bundle: {
                        slot: set(used_arc_map.get(arc_bundle, {}).get(slot, set()))
                        for slot in ARC_SLOTS
                    }
                }
                options = []
                for _ in range(arc_variants):
                    tuple_pick = pick_arc_tuple(
                        arc_bundle, arc_by_bundle_slot, local_used, rng
                    )
                    if tuple_pick:
                        options.append(tuple_pick)
                arc_tuple = options[0] if options else []
                entry["arcBundle"] = arc_bundle
                entry["arcTuple"] = [arc["id"] for arc in arc_tuple]
                if arc_variants > 1:
                    entry["arcOptions"] = [
                        [arc["id"] for arc in option] for option in options
                    ]
                for arc in arc_tuple:
                    used_arc_map.setdefault(arc_bundle, {}).setdefault(
                        arc["slot"], set()
                    ).add(arc["id"])
                save_json(args.lore, lore)
            arc_lines = build_arc_lines(arc_tuple)
            backstory = generate_backstory(
                pony,
                api_key=api_key,
                model=args.model,
                word_target=args.word_target,
                family_notes=family_notes,
                arc_lines=arc_lines,
                dry_run=args.dry_run,
                max_retries=args.max_retries,
            )
            if backstory:
                backstories.setdefault("backstories", {})[slug] = backstory
                lore["ponies"].setdefault(slug, {})["backstoryRef"] = slug
                summary = generate_backstory_summary(
                    backstory,
                    api_key=api_key,
                    model=args.model,
                    word_target=100,
                    dry_run=args.dry_run,
                )
                if summary:
                    lore["ponies"].setdefault(slug, {})["backstorySummary"] = summary
                save_json(args.lore, lore)
                save_json(args.backstories, backstories)

    if args.refresh_summaries:
        targets = _summary_targets(selected, slugs, backstories)
        generate_summaries(
            targets,
            backstories,
            lore,
            api_key=api_key,
            model=args.model,
            dry_run=args.dry_run,
            refresh=True,
        )
        save_json(args.lore, lore)

    if args.update_opinions:
        source_slugs = slugs if args.opinions_scope == "all" else selected
        total = len(source_slugs)
        if total:
            print(f"Generating opinions: {total}", flush=True)
        for index, slug in enumerate(source_slugs, start=1):
            pony = pony_by_slug.get(slug)
            if not pony:
                continue
            _progress("Opinions", index, total, slug)
            others = [pony_by_slug[other] for other in slugs if other != slug]
            opinions = generate_opinions(
                pony,
                others,
                api_key=api_key,
                model=args.model,
                family_notes=family_notes,
                dry_run=args.dry_run,
            )
            if opinions:
                cleaned = _apply_opinion_rules(opinions)
                lore["ponies"].setdefault(slug, {}).setdefault("opinions", {}).update(cleaned)
                save_json(args.lore, lore)

    save_json(args.lore, lore)
    save_json(args.backstories, backstories)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
