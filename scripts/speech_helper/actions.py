from pathlib import Path

from .io import load_data, save_data


def load_recent_actions(path, limit=30):
    actions_path = Path(path)
    if not actions_path.exists():
        return []
    data = load_data(actions_path)
    if not isinstance(data, list):
        return []
    return data[-limit:]


def append_action(path, action, limit=30):
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
