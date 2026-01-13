import argparse
from http.server import ThreadingHTTPServer

from .config import (
    DEFAULT_ALLOWED_ORIGINS,
    DEFAULT_ENV_FILE,
    DEFAULT_HOST,
    DEFAULT_PORT,
    DEFAULT_WS_PORT,
    DEFAULT_PRONUNCIATION_GUIDE_PATH,
    DEFAULT_ACTIONS_PATH,
    DEFAULT_FAST_MODEL,
    DEFAULT_BACKSTORIES_PATH,
    DEFAULT_MAP_PATH,
    DEFAULT_LORE_PATH,
    DEFAULT_LOCATIONS_PATH,
    DEFAULT_SMART_MODEL,
    DEFAULT_STT_MODEL,
    DEFAULT_TTS_MODEL,
    DEFAULT_TTS_VOICE,
    DEFAULT_REALTIME_MODEL,
    DEFAULT_REALTIME_VOICE,
    DEFAULT_REALTIME_TRANSCRIPTION_MODEL,
    DEFAULT_REALTIME_INPUT_FORMAT,
    DEFAULT_REALTIME_OUTPUT_FORMAT,
    DEFAULT_REALTIME_IDLE_TIMEOUT,
    DEFAULT_REALTIME_MAX_SESSION,
    DEFAULT_REALTIME_SILENCE_DURATION_MS,
    SpeechConfig,
    DEFAULT_REALTIME_URL,
    DEFAULT_SPEECH_MODE,
)
from .handler import SpeechHandler
from .pipeline import start_pipeline_server
from .realtime import start_realtime_server


def parse_args():
    parser = argparse.ArgumentParser(
        description="Local speech helper for Stella (BYOK).",
    )
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--ws-port", type=int, default=DEFAULT_WS_PORT)
    parser.add_argument("--env-file", default=DEFAULT_ENV_FILE)
    parser.add_argument("--lore", default=DEFAULT_LORE_PATH)
    parser.add_argument("--backstories", default=DEFAULT_BACKSTORIES_PATH)
    parser.add_argument("--map", default=DEFAULT_MAP_PATH)
    parser.add_argument("--locations", default=DEFAULT_LOCATIONS_PATH)
    parser.add_argument("--actions", default=DEFAULT_ACTIONS_PATH)
    parser.add_argument("--pronunciation-guide", default=DEFAULT_PRONUNCIATION_GUIDE_PATH)
    parser.add_argument(
        "--allowed-origin",
        action="append",
        default=[],
        help="Allowed CORS origin (repeat to add more).",
    )
    parser.add_argument(
        "--allow-null-origin",
        action="store_true",
        help="Allow null origin for file:// pages.",
    )
    parser.add_argument("--fast-model", default=DEFAULT_FAST_MODEL)
    parser.add_argument("--smart-model", default=DEFAULT_SMART_MODEL)
    parser.add_argument("--stt-model", default=DEFAULT_STT_MODEL)
    parser.add_argument("--tts-model", default=DEFAULT_TTS_MODEL)
    parser.add_argument("--tts-voice", default=DEFAULT_TTS_VOICE)
    parser.add_argument("--realtime-model", default=DEFAULT_REALTIME_MODEL)
    parser.add_argument("--realtime-voice", default=DEFAULT_REALTIME_VOICE)
    parser.add_argument(
        "--realtime-transcription-model", default=DEFAULT_REALTIME_TRANSCRIPTION_MODEL
    )
    parser.add_argument(
        "--realtime-input-format", default=DEFAULT_REALTIME_INPUT_FORMAT
    )
    parser.add_argument(
        "--realtime-output-format", default=DEFAULT_REALTIME_OUTPUT_FORMAT
    )
    parser.add_argument("--realtime-url", default=DEFAULT_REALTIME_URL)
    parser.add_argument(
        "--realtime-idle-timeout",
        type=int,
        default=DEFAULT_REALTIME_IDLE_TIMEOUT,
        help="Idle seconds before closing the realtime session (0 disables).",
    )
    parser.add_argument(
        "--realtime-max-session",
        type=int,
        default=DEFAULT_REALTIME_MAX_SESSION,
        help="Max seconds before forcing a realtime reconnect (0 disables).",
    )
    parser.add_argument(
        "--realtime-silence-duration-ms",
        type=int,
        default=DEFAULT_REALTIME_SILENCE_DURATION_MS,
        help="Silence duration (ms) before server VAD ends a turn.",
    )
    parser.add_argument(
        "--speech-mode",
        default=DEFAULT_SPEECH_MODE,
        help="Speech mode: realtime or pipeline.",
    )
    parser.add_argument(
        "--no-fallback-smart",
        action="store_true",
        help="Disable fallback to the smart model on failure.",
    )
    return parser.parse_args()


def _resolve_allowed_origins(arg_list):
    if arg_list:
        return arg_list
    return list(DEFAULT_ALLOWED_ORIGINS)


def main():
    args = parse_args()
    config = SpeechConfig(
        host=args.host,
        port=args.port,
        env_file=args.env_file,
        lore_path=args.lore,
        backstories_path=args.backstories,
        map_path=args.map,
        locations_path=args.locations,
        actions_path=args.actions,
        pronunciation_guide_path=args.pronunciation_guide,
        allowed_origins=_resolve_allowed_origins(args.allowed_origin),
        allow_null_origin=args.allow_null_origin,
        fast_model=args.fast_model,
        smart_model=args.smart_model,
        stt_model=args.stt_model,
        tts_model=args.tts_model,
        tts_voice=args.tts_voice,
        realtime_model=args.realtime_model,
        realtime_voice=args.realtime_voice,
        realtime_transcription_model=args.realtime_transcription_model,
        realtime_input_format=args.realtime_input_format,
        realtime_output_format=args.realtime_output_format,
        ws_port=args.ws_port,
        realtime_url=args.realtime_url,
        realtime_idle_timeout=args.realtime_idle_timeout,
        realtime_max_session=args.realtime_max_session,
        realtime_silence_duration_ms=args.realtime_silence_duration_ms,
        fallback_to_smart=not args.no_fallback_smart,
        speech_mode=args.speech_mode,
    )

    handler = lambda *handler_args, **handler_kwargs: SpeechHandler(  # noqa: E731
        *handler_args,
        config=config,
        **handler_kwargs,
    )

    speech_mode = (config.speech_mode or "").strip().lower()
    if speech_mode == "pipeline":
        realtime_thread = start_pipeline_server(config)
    else:
        realtime_thread = start_realtime_server(config)

    with ThreadingHTTPServer((config.host, config.port), handler) as server:
        print(f"Speech helper running at http://{config.host}:{config.port}")
        if realtime_thread:
            print(f"Realtime WS running at ws://{config.host}:{config.ws_port}")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down speech helper.")
    return 0
