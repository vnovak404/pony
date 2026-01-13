import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8091

DEFAULT_ENV_FILE = ".env"
DEFAULT_LORE_PATH = "data/pony_lore.json"
DEFAULT_BACKSTORIES_PATH = "data/pony_backstories.json"
DEFAULT_MAP_PATH = "assets/world/maps/ponyville.json"
DEFAULT_LOCATIONS_PATH = "data/world_locations.json"
DEFAULT_ACTIONS_PATH = "data/_generated/speech_recent_actions.json"
DEFAULT_PRONUNCIATION_GUIDE_PATH = "data/_generated/pronunciation_guide.json"

DEFAULT_ALLOWED_ORIGINS = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
]

DEFAULT_FAST_MODEL = os.getenv("OPENAI_FAST_MODEL", "gpt-5-mini-2025-08-07")
DEFAULT_SMART_MODEL = os.getenv("OPENAI_SMART_MODEL", "gpt-5-nano-2025-08-07")
DEFAULT_STT_MODEL = os.getenv("OPENAI_STT_MODEL", "whisper-1")
DEFAULT_TTS_MODEL = os.getenv("OPENAI_TTS_MODEL", "tts-1")
DEFAULT_TTS_VOICE = os.getenv("OPENAI_TTS_VOICE", "alloy")
DEFAULT_REALTIME_MODEL = os.getenv(
    "OPENAI_REALTIME_MODEL", "gpt-4o-realtime-preview"
)
DEFAULT_REALTIME_VOICE = os.getenv("OPENAI_REALTIME_VOICE", "coral")
DEFAULT_REALTIME_TRANSCRIPTION_MODEL = os.getenv(
    "OPENAI_REALTIME_TRANSCRIPTION_MODEL", DEFAULT_STT_MODEL
)
DEFAULT_REALTIME_INPUT_FORMAT = os.getenv("OPENAI_REALTIME_INPUT_FORMAT", "pcm16")
DEFAULT_REALTIME_OUTPUT_FORMAT = os.getenv("OPENAI_REALTIME_OUTPUT_FORMAT", "pcm16")
DEFAULT_WS_PORT = int(os.getenv("SPEECH_HELPER_WS_PORT", "8092"))
DEFAULT_REALTIME_URL = os.getenv(
    "OPENAI_REALTIME_URL", "wss://api.openai.com/v1/realtime?model={model}"
)
DEFAULT_REALTIME_IDLE_TIMEOUT = int(os.getenv("OPENAI_REALTIME_IDLE_TIMEOUT", "120"))
DEFAULT_REALTIME_MAX_SESSION = int(os.getenv("OPENAI_REALTIME_MAX_SESSION", "900"))
DEFAULT_REALTIME_SILENCE_DURATION_MS = int(
    os.getenv("OPENAI_REALTIME_SILENCE_DURATION_MS", "2500")
)


@dataclass
class SpeechConfig:
    host: str = DEFAULT_HOST
    port: int = DEFAULT_PORT
    env_file: str = DEFAULT_ENV_FILE
    lore_path: str = DEFAULT_LORE_PATH
    backstories_path: str = DEFAULT_BACKSTORIES_PATH
    map_path: str = DEFAULT_MAP_PATH
    locations_path: str = DEFAULT_LOCATIONS_PATH
    actions_path: str = DEFAULT_ACTIONS_PATH
    pronunciation_guide_path: str = DEFAULT_PRONUNCIATION_GUIDE_PATH
    allowed_origins: list[str] = field(default_factory=lambda: list(DEFAULT_ALLOWED_ORIGINS))
    allow_null_origin: bool = False
    fast_model: str = DEFAULT_FAST_MODEL
    smart_model: str = DEFAULT_SMART_MODEL
    stt_model: str = DEFAULT_STT_MODEL
    tts_model: str = DEFAULT_TTS_MODEL
    tts_voice: str = DEFAULT_TTS_VOICE
    realtime_model: str = DEFAULT_REALTIME_MODEL
    realtime_voice: str = DEFAULT_REALTIME_VOICE
    realtime_transcription_model: str = DEFAULT_REALTIME_TRANSCRIPTION_MODEL
    realtime_input_format: str = DEFAULT_REALTIME_INPUT_FORMAT
    realtime_output_format: str = DEFAULT_REALTIME_OUTPUT_FORMAT
    ws_port: int = DEFAULT_WS_PORT
    realtime_url: str = DEFAULT_REALTIME_URL
    realtime_idle_timeout: int = DEFAULT_REALTIME_IDLE_TIMEOUT
    realtime_max_session: int = DEFAULT_REALTIME_MAX_SESSION
    realtime_silence_duration_ms: int = DEFAULT_REALTIME_SILENCE_DURATION_MS
    fallback_to_smart: bool = True
