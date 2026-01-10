
def slugify(name):
    return "-".join(
        "".join(ch.lower() if ch.isalnum() else " " for ch in name).split()
    )


def sanitize_value(value, fallback="", max_len=120):
    if not isinstance(value, str):
        return fallback
    value = value.strip()
    if not value:
        return fallback
    return value[:max_len]


def normalize_name(name):
    return " ".join(name.strip().lower().split())
