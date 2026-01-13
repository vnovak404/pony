from pathlib import Path


def load_env_value(path, key):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith("export "):
                    line = line[7:].lstrip()
                if "=" not in line:
                    continue
                name, value = line.split("=", 1)
                if name.strip() != key:
                    continue
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in ("\"", "'"):
                    value = value[1:-1]
                return value
    except FileNotFoundError:
        return None
    return None


def resolve_path(root, path):
    path = Path(path)
    if path.is_absolute():
        return path
    return Path(root) / path
