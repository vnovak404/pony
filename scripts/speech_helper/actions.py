from pathlib import Path

from .io import load_data, save_data

BANNED_ACTION_PHRASES = [
    "virtual assistant",
    "ai assistant",
    "ai helper",
    "friendly ai",
    "help you with anything",
    "help with anything",
    "help you out",
    "what can i do for you",
    "how can i help",
    "here to help",
    "call me whatever",
    "call me anything",
    "call me your",
    "you can call me",
    "don't have a personal name",
    "do not have a personal name",
    "don't have a name",
    "do not have a name",
]


_QUOTE_MAP = {
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
}


def _normalize_action(text):
    if not text:
        return ""
    normalized = str(text)
    for needle, replacement in _QUOTE_MAP.items():
        normalized = normalized.replace(needle, replacement)
    return normalized.lower()


def _is_banned_action(action):
    if not action:
        return False
    lowered = _normalize_action(action)
    return any(phrase in lowered for phrase in BANNED_ACTION_PHRASES)


def load_recent_actions(path, limit=30):
    actions_path = Path(path)
    if not actions_path.exists():
        return []
    data = load_data(actions_path)
    if not isinstance(data, list):
        return []
    filtered = [action for action in data if not _is_banned_action(action)]
    return filtered[-limit:]


def append_action(path, action, limit=30):
    if _is_banned_action(action):
        return []
    actions_path = Path(path)
    actions_path.parent.mkdir(parents=True, exist_ok=True)
    data = []
    if actions_path.exists():
        loaded = load_data(actions_path)
        if isinstance(loaded, list):
            data = loaded
    data.append(action)
    if len(data) > limit:
        data = data[-limit:]
    save_data(actions_path, data)
    return data
