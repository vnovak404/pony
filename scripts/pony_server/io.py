import json


def load_data(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def save_data(path, payload):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=False)
        handle.write("\n")


def load_json_body(handler):
    length = int(handler.headers.get("Content-Length", "0"))
    if length <= 0:
        return None
    raw_body = handler.rfile.read(length)
    try:
        return json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError:
        return None
