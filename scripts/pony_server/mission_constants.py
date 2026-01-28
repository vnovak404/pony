import os
from .config import ROOT, DEFAULT_ASSET_MANIFEST

DEFAULT_MISSION_MODEL = os.getenv("OPENAI_MISSION_MODEL", "gpt-5.2")
DEFAULT_MISSION_MAX_OUTPUT_TOKENS = int(os.getenv("OPENAI_MISSION_MAX_OUTPUT_TOKENS", "8000"))
DEFAULT_WORLD_MAP = ROOT / "adventures/stellacorn/world-map.json"
DEFAULT_SAVE_ROOT = ROOT / "adventures/missions/stellacorn/generated"
DEFAULT_DIALOG_STATE_VERSION = 1
DEFAULT_ADVENTURE_ID = "stellacorn"
DEFAULT_NARRATIVE = {
    "intro": {"text": ["A new adventure begins."]},
    "outro": {"text": ["Mission complete!"]},
    "onEnterZones": [],
    "onInteract": [],
}


class MissionPlanError(RuntimeError):
    pass


class MissionValidationError(RuntimeError):
    pass
