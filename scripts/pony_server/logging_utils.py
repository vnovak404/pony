import json
import time
import uuid
from pathlib import Path


def iso_timestamp():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def ensure_dir(path):
    Path(path).mkdir(parents=True, exist_ok=True)


def make_request_id(prefix="req"):
    return f"{prefix}_{uuid.uuid4().hex}"[:40]


def write_jsonl(path, payload):
    path = Path(path)
    ensure_dir(path.parent)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def log_event(path, payload):
    record = dict(payload or {})
    record.setdefault("ts", iso_timestamp())
    write_jsonl(path, record)
    return record
