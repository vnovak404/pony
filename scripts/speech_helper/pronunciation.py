import re
from pathlib import Path

from .io import load_data, save_data


def _default_guide():
    return {"version": 1, "entries": {}}


def load_pronunciation_guide(path):
    guide_path = Path(path)
    if not guide_path.exists():
        return _default_guide()
    data = load_data(guide_path)
    if not isinstance(data, dict):
        return _default_guide()
    data.setdefault("version", 1)
    data.setdefault("entries", {})
    return data


def save_pronunciation_guide(path, guide):
    guide_path = Path(path)
    guide_path.parent.mkdir(parents=True, exist_ok=True)
    save_data(guide_path, guide)


def normalize_text(text, entries):
    if not text or not entries:
        return text
    result = text
    for token, normalized in entries.items():
        if not token or not normalized:
            continue
        pattern = re.compile(rf"\\b{re.escape(token)}\\b", re.IGNORECASE)
        result = pattern.sub(normalized, result)
    return result
