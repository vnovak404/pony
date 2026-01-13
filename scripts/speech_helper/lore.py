from pathlib import Path

from .io import load_data


def load_pony_lore(path):
    lore_path = Path(path)
    if not lore_path.exists():
        return {"version": 1, "ponies": {}}
    data = load_data(lore_path)
    if not isinstance(data, dict):
        return {"version": 1, "ponies": {}}
    data.setdefault("version", 1)
    data.setdefault("ponies", {})
    return data
