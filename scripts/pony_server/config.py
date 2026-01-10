from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA = "data/ponies.json"
DEFAULT_OUTPUT_DIR = "assets/ponies"
DEFAULT_ENV_FILE = ".env"
DEFAULT_SPRITE_JOBS = 6
DEFAULT_SPRITE_RETRIES = 5
DEFAULT_MAP_PATH = "assets/world/maps/ponyville.json"
DEFAULT_STATE_PATH = "data/_generated/runtime_state.json"
HOUSE_SHARE_CHANCE = 0.35
HOUSE_GROUP_CHANCE = 0.2
FOOD_PREFERENCES = ["restaurant", "picnic", "bakery"]
DRINK_PREFERENCES = ["lemonade", "well"]
HOUSE_LOTS = [
    {"x": 8.5, "y": 4.2},
    {"x": 13.5, "y": 4.2},
    {"x": 22.5, "y": 4.2},
    {"x": 27.5, "y": 4.2},
    {"x": 32.5, "y": 4.2},
    {"x": 5.5, "y": 18.8},
    {"x": 13.5, "y": 20.2},
    {"x": 18.5, "y": 20.2},
    {"x": 24.5, "y": 20.2},
    {"x": 30.5, "y": 20.2},
    {"x": 35.5, "y": 18.8},
]
