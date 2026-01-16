import asyncio
import base64
import io
import json
import re
import threading
import time
import wave
from datetime import datetime, timezone
from pathlib import Path

from .actions import append_action
from .context import build_session_context
from .openai_client import (
    chat_response_stream,
    ensure_api_key,
    synthesize_speech_stream,
    transcribe_audio,
)
from .pronunciation import load_pronunciation_guide
from .prompting import build_system_prompt

ROOT = Path(__file__).resolve().parents[2]
LOG_ROOT = ROOT / "logs" / "conversations"
TTS_SAMPLE_RATE = 24000
MIN_HOLD_MS = 500
HISTORY_CACHE = {}
LOG_PATH_CACHE = {}

BANNED_REPLY_PHRASES = [
    "virtual assistant",
    "ai helper",
    "ai assistant",
    "i'm here to help",
    "i am here to help",
    "what can i do for you",
    "how can i help",
    "call me whatever",
    "call me anything",
    "don't have a personal name",
    "do not have a personal name",
    "don't have a name",
    "do not have a name",
    "as an ai",
    "as a language model",
]

ACTION_TOOL = {
    "type": "function",
    "name": "pony_action",
    "description": "Trigger a pony action in the map simulation.",
    "parameters": {
        "type": "object",
        "properties": {
            "ponySlug": {
                "type": "string",
                "description": "Pony slug from data/ponies.json (e.g. taticorn).",
            },
            "command": {
                "type": "string",
                "enum": [
                    "eat",
                    "drink",
                    "fun",
                    "rest",
                    "sleep",
                    "repair",
                    "vet",
                    "clinic",
                    "market",
                    "resupply",
                    "restock",
                    "gather",
                ],
            },
            "ingredient": {
                "type": "string",
                "description": "Ingredient slug to gather (e.g. lumber, honey, water).",
            },
            "note": {"type": "string"},
        },
        "required": ["ponySlug", "command"],
    },
}

BACKSTORY_TOOL = {
    "type": "function",
    "name": "pony_backstory",
    "description": "Fetch the full life story (backstory) for a pony.",
    "parameters": {
        "type": "object",
        "properties": {
            "ponySlug": {
                "type": "string",
                "description": "Pony slug from data/ponies.json (e.g. taticorn).",
            }
        },
        "required": ["ponySlug"],
    },
}

TOOLS = [ACTION_TOOL, BACKSTORY_TOOL]


def start_pipeline_server(config, ssl_context=None):
    try:
        import websockets  # type: ignore
    except ImportError:
        print("Pipeline WS disabled (install `websockets` to enable).")
        return None

    async def handle_client(ws):
        origin = _get_origin(ws)
        if origin == "null":
            if not config.allow_null_origin:
                await ws.close(code=1008, reason="Origin not allowed.")
                return
        elif origin and origin not in config.allowed_origins:
            await ws.close(code=1008, reason="Origin not allowed.")
            return

        api_key = ensure_api_key(config.env_file)
        log_path = None
        session_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
        active_pony_slug = "unknown"
        active_pony_name = "Pony"
        pony_entry = {}
        sample_rate = 24000
        pcm_buffer = bytearray()
        audio_chunks = 0
        audio_bytes = 0
        utterance_id = 0
        processing_task = None
        processing_lock = asyncio.Lock()
        listening_active = False
        utterance_started_at = None
        last_client_utterance_stop_ts = None
        history_messages = []
        history_limit = max(0, int(getattr(config, "speech_history_turns", 4)))

        async def send_status(status):
            try:
                await ws.send(json.dumps({"type": "status", "status": status}))
            except Exception:
                return

        def log_event(event, detail=""):
            nonlocal log_path
            if not log_path:
                log_path = _init_log_path(active_pony_slug)
            line = f"[{_log_stamp()}] {event}"
            if detail:
                line = f"{line} {detail}"
            _append_log(log_path, line)
            print(f"[speech][{session_id}] {line}")

        async def set_active_pony(slug, reset_history=True):
            nonlocal log_path, active_pony_slug, active_pony_name, pony_entry
            nonlocal history_messages
            safe_slug = _safe_slug(slug)
            if (
                not reset_history
                and safe_slug
                and safe_slug == active_pony_slug
                and active_pony_slug != "unknown"
            ):
                cached = HISTORY_CACHE.get(safe_slug)
                if cached:
                    history_messages = list(cached)
                cached_log = LOG_PATH_CACHE.get(safe_slug)
                if cached_log:
                    log_path = cached_log
                log_event("session_resume", f"pony={active_pony_name} slug={safe_slug}")
                return
            context = build_session_context(config, safe_slug)
            pony_entry = context.get("ponyLore", {}).get(safe_slug, {})
            active_pony_slug = safe_slug or "unknown"
            active_pony_name = pony_entry.get("name") or slug or "Pony"
            if reset_history or safe_slug not in LOG_PATH_CACHE:
                log_path = _init_log_path(active_pony_slug)
                LOG_PATH_CACHE[safe_slug] = log_path
            else:
                log_path = LOG_PATH_CACHE.get(safe_slug)
            if reset_history:
                history_messages = []
                HISTORY_CACHE[safe_slug] = []
            log_event(
                "session_start",
                "mode=pipeline "
                f"pony={active_pony_name} "
                f"slug={active_pony_slug} "
                f"stt={config.stt_model} "
                f"llm_fast={config.fast_model} "
                f"llm_smart={config.smart_model} "
                f"tts={config.tts_model} "
                f"voice={config.tts_voice} "
                f"sample_rate={sample_rate} "
                f"force_fallback={config.force_fallback} "
                f"history_turns={history_limit}",
            )

        async def cancel_current(reason=None):
            nonlocal utterance_id, processing_task
            utterance_id += 1
            if processing_task and not processing_task.done():
                processing_task.cancel()
            processing_task = None
            await ws.send(json.dumps({"type": "audio_reset"}))
            await ws.send(json.dumps({"type": "reply_reset"}))
            if reason:
                append_action(config.actions_path, f"Speech canceled: {reason}")
                log_event("cancel", f"reason={reason}")

        async def process_utterance(raw_audio, utterance_token, rate, pony_snapshot):
            nonlocal history_messages
            if not raw_audio:
                return
            async with processing_lock:
                if utterance_token != utterance_id:
                    return
                start_time = time.monotonic()
                try:
                    log_event(
                        "stt_start",
                        f"bytes={len(raw_audio)} rate={rate}",
                    )
                    stt_start = time.monotonic()
                    wav_bytes = pcm16_to_wav(raw_audio, rate)
                    result = await asyncio.to_thread(
                        transcribe_audio,
                        wav_bytes,
                        filename="speech.wav",
                        content_type="audio/wav",
                        model=config.stt_model,
                        api_key=api_key,
                    )
                except Exception as exc:
                    await _safe_send(ws, {"type": "error", "error": str(exc)})
                    log_event("stt_error", _truncate(str(exc), 200))
                    return
                stt_ms = int((time.monotonic() - stt_start) * 1000)
                text = str(result.get("text", "")).strip()
                if utterance_token != utterance_id:
                    return
                await _safe_send(
                    ws, {"type": "transcript", "text": text, "final": True}
                )
                log_event("stt_done", f"ms={stt_ms} chars={len(text)}")
                log_event("stt_final", f"ms={stt_ms} chars={len(text)}")
                if text:
                    log_event("stt_first_partial", "note=nonstreaming")
                if text:
                    append_action(config.actions_path, f"Stella said: {text}")
                    if not log_path:
                        log_path_local = _init_log_path(active_pony_slug)
                    else:
                        log_path_local = log_path
                    _append_log(log_path_local, f"Stella: {text}")
                if not text:
                    log_event("stt_empty")
                    return

                context = build_session_context(config, active_pony_slug)
                guide = load_pronunciation_guide(config.pronunciation_guide_path)
                backstory = _load_backstory(config, active_pony_slug)
                summary = _ensure_summary(pony_snapshot, backstory)
                system_prompt = build_system_prompt(
                    context,
                    guide.get("entries", {}),
                    active_pony=pony_snapshot,
                    backstory_summary=summary,
                )
                system_prompt += (
                    "\n\nIf the user asks a pony to do something in Ponyville, call pony_action."
                    "\nUse command=resupply for restocking a pony's job location."
                    "\nUse command=gather with ingredient (lumber, water, honey, sugar, lemon, milk, produce)."
                    "\nUse command=rest for sleep or naps, and command=vet for clinic visits."
                    "\nIf the user asks for a full life story, call pony_backstory."
                )

                history_messages = _apply_system_prompt(
                    history_messages, system_prompt
                )
                history_messages.append({"role": "user", "content": text})

                llm_first_token_logged = False

                async def handle_llm_delta(delta):
                    nonlocal llm_first_token_logged
                    if not delta:
                        return
                    if not llm_first_token_logged:
                        llm_first_token_logged = True
                        log_event("llm_first_token", "note=streaming")
                    await _safe_send(ws, {"type": "llm_delta", "delta": delta})

                log_event(
                    "llm_start",
                    f"mode={'fallback' if config.force_fallback else 'chat'}",
                )
                if config.force_fallback:
                    reply_text = _fallback_reply(active_pony_name)
                    reply_meta = {"attempts": []}
                    llm_ms = 0
                    log_event("llm_skipped", "reason=force_fallback")
                else:
                    llm_start = time.monotonic()
                    messages = list(history_messages)
                    reply_text, reply_meta = await _generate_reply(
                        messages,
                        config,
                        api_key,
                        log_event=log_event,
                        tool_handler=_build_tool_handler(
                            ws,
                            config,
                            log_event,
                            active_pony_slug,
                            active_pony_name,
                        ),
                        on_delta=handle_llm_delta,
                    )
                    llm_ms = int((time.monotonic() - llm_start) * 1000)
                if utterance_token != utterance_id:
                    return
                attempt_count = len(reply_meta.get("attempts", []))
                if not reply_text:
                    reply_text = _fallback_reply(active_pony_name)
                    log_event(
                        "llm_fallback",
                        f"ms={llm_ms} attempts={attempt_count}",
                    )
                else:
                    log_event(
                        "llm_done",
                        f"ms={llm_ms} attempts={attempt_count} chars={len(reply_text)}",
                    )
                if reply_text and not llm_first_token_logged:
                    note = "note=fallback" if config.force_fallback else "note=nonstreaming"
                    log_event("llm_first_token", f"{note} chars={len(reply_text)}")
                for attempt in reply_meta.get("attempts", []):
                    attempt_info = (
                        f"llm_attempt model={attempt.get('model')} "
                        f"violations={','.join(attempt.get('violations', [])) or 'none'} "
                        f"error={_truncate(attempt.get('error', ''), 120)} "
                        f"text={_truncate(attempt.get('text', ''), 160)}"
                    )
                    log_event(attempt_info)
                await _safe_send(ws, {"type": "reply", "text": reply_text})
                await _safe_send(ws, {"type": "reply_done"})
                append_action(
                    config.actions_path,
                    f"Pony replied: {reply_text}",
                )
                if not log_path:
                    log_path_local = _init_log_path(active_pony_slug)
                else:
                    log_path_local = log_path
                _append_log(log_path_local, f"{active_pony_name}: {reply_text}")
                if history_limit:
                    history_messages.append(
                        {"role": "assistant", "content": reply_text}
                    )
                    history_messages = _trim_history(history_messages, history_limit)
                    HISTORY_CACHE[active_pony_slug] = list(history_messages)
                log_event(
                    "history_len", f"messages={len(history_messages)}"
                )
                if utterance_token != utterance_id:
                    return
                chunk_size = 16000
                chunk_count = 0
                tts_bytes_total = 0
                first_chunk = True
                loop = asyncio.get_running_loop()
                stream_done = object()
                queue = asyncio.Queue()

                def _produce():
                    try:
                        for chunk in synthesize_speech_stream(
                            reply_text,
                            model=config.tts_model,
                            voice=config.tts_voice,
                            response_format="pcm",
                            api_key=api_key,
                            chunk_size=chunk_size,
                        ):
                            if not chunk:
                                continue
                            asyncio.run_coroutine_threadsafe(queue.put(chunk), loop)
                        asyncio.run_coroutine_threadsafe(queue.put(stream_done), loop)
                    except Exception as exc:
                        asyncio.run_coroutine_threadsafe(queue.put(exc), loop)

                log_event("tts_start", f"chars={len(reply_text)}")
                tts_start = time.monotonic()
                threading.Thread(target=_produce, daemon=True).start()
                try:
                    while True:
                        item = await queue.get()
                        if item is stream_done:
                            break
                        if isinstance(item, Exception):
                            raise item
                        if utterance_token != utterance_id:
                            return
                        chunk = item
                        chunk_count += 1
                        tts_bytes_total += len(chunk)
                        if first_chunk:
                            first_chunk = False
                            log_event(
                                "tts_first_audio_byte",
                                f"bytes={len(chunk)} note=streaming",
                            )
                        await _safe_send(
                            ws,
                            {
                                "type": "audio",
                                "audio": base64.b64encode(chunk).decode("ascii"),
                            },
                        )
                        await asyncio.sleep(0)
                except Exception as exc:
                    await _safe_send(ws, {"type": "error", "error": str(exc)})
                    log_event("tts_error", _truncate(str(exc), 200))
                    return
                tts_ms = int((time.monotonic() - tts_start) * 1000)
                tts_duration_ms = 0
                if tts_bytes_total:
                    tts_duration_ms = int(
                        (tts_bytes_total / 2 / TTS_SAMPLE_RATE) * 1000
                    )
                log_event(
                    "tts_done",
                    f"ms={tts_ms} bytes={tts_bytes_total} "
                    f"duration_ms={tts_duration_ms} rate={TTS_SAMPLE_RATE}",
                )
                await _safe_send(ws, {"type": "audio_done"})
                log_event(
                    "tts_stream",
                    f"chunks={chunk_count} chunk_bytes={chunk_size}",
                )
                total_ms = int((time.monotonic() - start_time) * 1000)
                log_event(
                    "tts_stream",
                    f"chunks={chunk_count} chunk_bytes={chunk_size}",
                )
                log_event("utterance_done", f"ms={total_ms}")

        async for message in ws:
            try:
                payload = json.loads(message)
            except json.JSONDecodeError:
                continue
            msg_type = payload.get("type")
            if msg_type == "start":
                sample_rate = int(payload.get("sampleRate") or sample_rate)
                requested_slug = payload.get("ponySlug") or active_pony_slug
                safe_slug = _safe_slug(requested_slug)
                if safe_slug and safe_slug != active_pony_slug:
                    await set_active_pony(requested_slug, reset_history=True)
                else:
                    await set_active_pony(requested_slug, reset_history=False)
                pcm_buffer.clear()
                audio_chunks = 0
                audio_bytes = 0
                utterance_started_at = None
                listening_active = True
                await send_status("ready")
                await _safe_send(ws, {"type": "ready"})
            elif msg_type == "switch":
                await cancel_current("pony switch")
                await set_active_pony(payload.get("ponySlug") or "", reset_history=True)
                pcm_buffer.clear()
                audio_chunks = 0
                audio_bytes = 0
                utterance_started_at = None
                listening_active = True
                await send_status("ready")
                await _safe_send(ws, {"type": "ready"})
            elif msg_type == "telemetry":
                event = payload.get("event")
                if not event:
                    continue
                client_ts = payload.get("clientTs") or payload.get("client_ts") or ""
                data = payload.get("data") or {}
                log_event(
                    event,
                    _format_telemetry_detail(client_ts, data),
                )
                if event == "utterance_stop":
                    last_client_utterance_stop_ts = _parse_iso_ts(client_ts)
                elif event == "audio_play_start":
                    play_ts = _parse_iso_ts(client_ts)
                    if last_client_utterance_stop_ts and play_ts:
                        delta_ms = int(
                            (play_ts - last_client_utterance_stop_ts).total_seconds()
                            * 1000
                        )
                        log_event(
                            "latency_excl_speech",
                            f"ms={delta_ms} source=client",
                        )
                        last_client_utterance_stop_ts = None
            elif msg_type == "audio":
                if not listening_active:
                    continue
                audio = payload.get("audio")
                if not audio:
                    continue
                if processing_task and not processing_task.done():
                    await cancel_current("barge-in")
                try:
                    chunk = base64.b64decode(audio)
                    pcm_buffer.extend(chunk)
                    audio_chunks += 1
                    audio_bytes += len(chunk)
                    if utterance_started_at is None:
                        utterance_started_at = time.monotonic()
                        log_event(
                            "capture_start",
                            f"bytes={len(chunk)} chunks={audio_chunks} rate={sample_rate}",
                        )
                except Exception:
                    continue
            elif msg_type == "stop":
                listening_active = False
                if processing_task and not processing_task.done():
                    await cancel_current("stop")
                raw_audio = bytes(pcm_buffer)
                pcm_buffer.clear()
                if raw_audio:
                    audio_duration_ms = 0
                    if utterance_started_at is not None:
                        audio_duration_ms = int(
                            (time.monotonic() - utterance_started_at) * 1000
                        )
                    log_event(
                        "utterance_stop",
                        f"bytes={len(raw_audio)} chunks={audio_chunks} "
                        f"capture_ms={audio_duration_ms} reason=stop",
                    )
                    audio_chunks = 0
                    audio_bytes = 0
                    utterance_started_at = None
                    if audio_duration_ms < MIN_HOLD_MS:
                        log_event(
                            "utterance_skip",
                            f"capture_ms={audio_duration_ms} reason=too_short",
                        )
                        continue
                    token = utterance_id
                    pony_snapshot = dict(pony_entry) if isinstance(pony_entry, dict) else {}
                    processing_task = asyncio.create_task(
                        process_utterance(raw_audio, token, sample_rate, pony_snapshot)
                    )
            elif msg_type == "clear":
                pcm_buffer.clear()
                log_event("buffer_clear")

    async def server_loop():
        async with websockets.serve(
            handle_client,
            config.host,
            config.ws_port,
            max_size=2**20,
            ssl=ssl_context,
        ):
            await asyncio.Future()

    def run():
        asyncio.run(server_loop())

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    return thread


def pcm16_to_wav(pcm_bytes, sample_rate, channels=1):
    if not pcm_bytes:
        return b""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(2)
        wav_file.setframerate(int(sample_rate) or 24000)
        wav_file.writeframes(pcm_bytes)
    return buffer.getvalue()


async def _safe_send(ws, payload):
    if not payload:
        return
    try:
        await ws.send(json.dumps(payload))
    except Exception:
        return


def _get_origin(ws):
    headers = None
    if hasattr(ws, "request_headers"):
        headers = ws.request_headers
    elif hasattr(ws, "request"):
        request = getattr(ws, "request", None)
        headers = getattr(request, "headers", None) if request else None
    if headers:
        return headers.get("Origin")
    return None


def _safe_slug(value):
    if not value:
        return "unknown"
    slug = str(value).strip().lower().replace(" ", "-")
    slug = re.sub(r"[^a-z0-9-]+", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    return slug or "unknown"


def _init_log_path(pony_slug):
    safe_slug = _safe_slug(pony_slug)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    LOG_ROOT.mkdir(parents=True, exist_ok=True)
    return LOG_ROOT / f"{safe_slug}-{timestamp}.txt"


def _append_log(path, line):
    if not path or not line:
        return
    try:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(line.strip() + "\n")
    except OSError:
        return


def _load_backstory(config, pony_slug):
    path = Path(config.backstories_path)
    if not path.exists():
        return ""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return ""
    backstories = data.get("backstories", {}) if isinstance(data, dict) else {}
    if not isinstance(backstories, dict):
        return ""
    return str(backstories.get(pony_slug, "")).strip()


def _summarize_backstory(text, target_words=100):
    if not text:
        return ""
    cleaned = " ".join(str(text).split())
    words = cleaned.split(" ")
    if len(words) <= target_words:
        return cleaned
    trimmed = words[:target_words]
    if trimmed and not re.search(r"[.!?]$", trimmed[-1]):
        trimmed[-1] = f"{trimmed[-1]}..."
    return " ".join(trimmed)


def _ensure_summary(pony_entry, backstory):
    summary = ""
    if isinstance(pony_entry, dict):
        summary = pony_entry.get("backstorySummary") or ""
    summary = summary.strip()
    if summary:
        return _summarize_backstory(summary)
    return _summarize_backstory(backstory)


def _contains_url(text):
    lowered = text.lower()
    return "http://" in lowered or "https://" in lowered


def _has_banned_phrase(text):
    if not text:
        return False
    lowered = text.lower()
    return any(phrase in lowered for phrase in BANNED_REPLY_PHRASES)


def _is_garbage_reply(text):
    if not text:
        return False
    stripped = text.strip()
    if not stripped:
        return False
    if stripped.startswith("{") or stripped.startswith("["):
        return True
    lowered = stripped.lower()
    if "open_url(" in lowered:
        return True
    if "\"edits\"" in lowered or "\"path\"" in lowered:
        return True
    if "<edit>" in lowered or "<path>" in lowered:
        return True
    if "start_line" in lowered or "end_line" in lowered:
        return True
    if "tool_call" in lowered or "function_call" in lowered:
        return True
    return False


def _fallback_reply(name):
    safe_name = name or "a pony"
    if safe_name.lower() == "pony":
        safe_name = "a pony"
    return f"Hi! I'm {safe_name} from Ponyville. How are you today?"


def _extract_chat_text(response: dict) -> str:
    if not isinstance(response, dict):
        return ""

    # Chat Completions
    choices = response.get("choices")
    if isinstance(choices, list) and choices:
        msg = choices[0].get("message", {})
        content = msg.get("content")
        if isinstance(content, str):
            return content.strip()

    # Responses API (GPT-5 etc)
    output = response.get("output")
    if isinstance(output, list):
        parts = []
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content")
            if not isinstance(content, list):
                continue
            for block in content:
                if not isinstance(block, dict):
                    continue
                if block.get("type") in ("output_text", "text"):
                    text = block.get("text")
                    if text:
                        parts.append(text)
        if parts:
            return "\n".join(parts).strip()

    return ""


def _parse_tool_args(raw_args):
    if not raw_args:
        return {}
    if isinstance(raw_args, dict):
        return raw_args
    if isinstance(raw_args, str):
        try:
            return json.loads(raw_args)
        except json.JSONDecodeError:
            return {}
    return {}


def _extract_tool_calls(response):
    calls = []
    if not isinstance(response, dict):
        return calls
    choices = response.get("choices")
    if isinstance(choices, list) and choices:
        msg = choices[0].get("message", {})
        tool_calls = msg.get("tool_calls") or []
        if isinstance(tool_calls, list):
            for call in tool_calls:
                if not isinstance(call, dict):
                    continue
                function = call.get("function", {})
                name = function.get("name") or call.get("name")
                args_raw = function.get("arguments") or call.get("arguments")
                call_id = call.get("id") or call.get("tool_call_id") or call.get("call_id")
                args = _parse_tool_args(args_raw)
                if name:
                    calls.append({"name": name, "args": args, "call_id": call_id})
        return calls
    output = response.get("output")
    if isinstance(output, list):
        for item in output:
            if not isinstance(item, dict):
                continue
            if item.get("type") in ("function_call", "tool_call"):
                name = item.get("name")
                args_raw = item.get("arguments") or item.get("args")
                call_id = item.get("call_id") or item.get("id")
                args = _parse_tool_args(args_raw)
                if name:
                    calls.append({"name": name, "args": args, "call_id": call_id})
    return calls


def _build_action_payload(args):
    if not isinstance(args, dict):
        return None
    pony_slug = args.get("ponySlug") or args.get("pony_slug")
    command = args.get("command")
    note = args.get("note", "")
    ingredient = args.get("ingredient")
    pony_slug = _safe_slug(pony_slug)
    if not pony_slug or pony_slug == "unknown" or not command:
        return None
    action = {"ponySlug": pony_slug, "command": command, "note": note}
    if ingredient:
        action["ingredient"] = ingredient
    return action


async def _handle_tool_calls(tool_calls, handler, log_event=None):
    outputs = []
    for call in tool_calls:
        name = call.get("name")
        if not name:
            continue
        if log_event:
            log_event("tool_call", f"name={name}")
        output = await handler(call)
        if output is None:
            continue
        call_id = call.get("call_id")
        if not call_id:
            continue
        outputs.append(
            {
                "type": "function_call_output",
                "call_id": call_id,
                "output": output,
            }
        )
    return outputs


def _reply_violations(text):
    violations = []
    if not text:
        violations.append("empty")
        return violations
    if _is_garbage_reply(text):
        violations.append("garbage")
    if _has_banned_phrase(text):
        violations.append("assistant-phrase")
    if _contains_url(text):
        violations.append("url")
    lowered = text.lower()
    if "i can't" in lowered or "i cannot" in lowered:
        violations.append("cannot")
    word_count = len(text.split())
    if word_count > 80:
        violations.append("too-long")
    return violations


async def _stream_chat_events(messages, config, api_key, model, tools=None):
    loop = asyncio.get_running_loop()
    queue = asyncio.Queue()

    def worker():
        try:
            for event in chat_response_stream(
                messages,
                model=model,
                api_key=api_key,
                max_tokens=config.speech_max_output_tokens,
                tools=tools,
                tool_choice="auto" if tools else None,
            ):
                loop.call_soon_threadsafe(queue.put_nowait, ("event", event))
            loop.call_soon_threadsafe(queue.put_nowait, ("done", None))
        except Exception as exc:
            loop.call_soon_threadsafe(queue.put_nowait, ("error", exc))

    threading.Thread(target=worker, daemon=True).start()
    while True:
        kind, payload = await queue.get()
        if kind == "event":
            yield payload
        elif kind == "error":
            raise payload
        else:
            break


def _consume_chat_tool_delta(delta, tool_calls):
    calls = delta.get("tool_calls") or []
    if not isinstance(calls, list):
        return
    for call in calls:
        if not isinstance(call, dict):
            continue
        call_id = call.get("id") or f"index-{call.get('index')}"
        entry = tool_calls.setdefault(call_id, {"name": None, "arguments": ""})
        function = call.get("function") or {}
        name = function.get("name") or call.get("name")
        if name:
            entry["name"] = name
        args = function.get("arguments") or call.get("arguments")
        if args:
            entry["arguments"] += str(args)


def _finalize_chat_tool_calls(tool_calls):
    calls = []
    for call_id, entry in tool_calls.items():
        name = entry.get("name")
        if not name:
            continue
        args = _parse_tool_args(entry.get("arguments"))
        calls.append({"name": name, "args": args, "call_id": call_id})
    return calls


def _maybe_extract_stream_tool_call(event, tool_calls):
    event_type = event.get("type", "")
    item = event.get("item") or {}
    if event_type == "response.output_item.added":
        if isinstance(item, dict) and item.get("type") in ("function_call", "tool_call"):
            tool_calls[item.get("id")] = {
                "name": item.get("name"),
                "arguments": item.get("arguments", ""),
            }
        return None
    if event_type in ("response.output_item.delta", "response.output_item.done"):
        if isinstance(item, dict) and item.get("type") in ("function_call", "tool_call"):
            call_id = item.get("id")
            if not call_id:
                return None
            tool_calls.setdefault(call_id, {"name": item.get("name"), "arguments": ""})
            if item.get("arguments"):
                tool_calls[call_id]["arguments"] += item.get("arguments")
            if event_type == "response.output_item.done":
                return _finalize_stream_tool_call(call_id, tool_calls)
        return None
    if "arguments.delta" in event_type:
        call_id = event.get("call_id") or event.get("item_id") or event.get("id")
        if not call_id:
            return None
        tool_calls.setdefault(call_id, {"name": event.get("name"), "arguments": ""})
        tool_calls[call_id]["arguments"] += event.get("delta", "")
        return None
    if "arguments.done" in event_type:
        call_id = event.get("call_id") or event.get("item_id") or event.get("id")
        if not call_id:
            return None
        return _finalize_stream_tool_call(call_id, tool_calls)
    return None


def _finalize_stream_tool_call(call_id, tool_calls):
    entry = tool_calls.pop(call_id, None)
    if not entry:
        return None
    name = entry.get("name")
    raw_args = entry.get("arguments", "")
    try:
        args = json.loads(raw_args) if raw_args else {}
    except json.JSONDecodeError:
        return None
    return {"name": name, "call_id": call_id, "args": args}


async def _consume_llm_stream(events, on_delta=None):
    text_parts = []
    tool_calls = []
    tool_call_cache = {}
    chat_tool_cache = {}
    saw_chat = False
    async for event in events:
        if not isinstance(event, dict):
            continue
        if "choices" in event:
            saw_chat = True
            choices = event.get("choices") or []
            for choice in choices:
                delta = choice.get("delta") or {}
                content = delta.get("content")
                if content:
                    text_parts.append(content)
                    if on_delta:
                        await on_delta(content)
                _consume_chat_tool_delta(delta, chat_tool_cache)
            continue
        event_type = event.get("type")
        if event_type == "response.output_text.delta":
            delta = event.get("delta") or event.get("text") or ""
            if delta:
                text_parts.append(delta)
                if on_delta:
                    await on_delta(delta)
        tool_call = _maybe_extract_stream_tool_call(event, tool_call_cache)
        if tool_call:
            tool_calls.append(tool_call)
    if saw_chat and chat_tool_cache:
        tool_calls.extend(_finalize_chat_tool_calls(chat_tool_cache))
    return "".join(text_parts), tool_calls


async def _call_chat_with_fallback_stream(
    messages, config, api_key, tools=None, on_delta=None
):
    fast_error = ""
    try:
        events = _stream_chat_events(messages, config, api_key, config.fast_model, tools)
        text, tool_calls = await _consume_llm_stream(events, on_delta=on_delta)
        return text, tool_calls, config.fast_model, fast_error
    except Exception as exc:
        fast_error = str(exc)
        if not config.fallback_to_smart:
            raise RuntimeError(f"fast model failed: {fast_error}") from exc
    try:
        events = _stream_chat_events(messages, config, api_key, config.smart_model, tools)
        text, tool_calls = await _consume_llm_stream(events, on_delta=on_delta)
        return text, tool_calls, config.smart_model, fast_error
    except Exception as exc:
        smart_error = str(exc)
        raise RuntimeError(
            f"fast model failed: {fast_error}; smart model failed: {smart_error}"
        ) from exc


async def _generate_reply(
    messages,
    config,
    api_key,
    retries=3,
    log_event=None,
    tool_handler=None,
    on_delta=None,
):
    attempts = []
    intended_model = config.fast_model
    tools = TOOLS if tool_handler else None
    tool_rounds = 0
    tool_messages = list(messages)

    while True:
        try:
            text, tool_calls, model_used, fast_error = (
                await _call_chat_with_fallback_stream(
                    tool_messages,
                    config,
                    api_key,
                    tools=tools,
                    on_delta=on_delta,
                )
            )
            candidate = _clean_reply(text)
            error_detail = fast_error or ""
            if not candidate and not error_detail:
                error_detail = "empty_stream"
        except Exception as exc:
            candidate = ""
            model_used = intended_model
            error_detail = _truncate(str(exc), 200)
            tool_calls = []
        if tool_calls and tool_handler and tool_rounds < 2:
            tool_rounds += 1
            tool_messages = list(tool_messages)
            tool_outputs = await _handle_tool_calls(
                tool_calls, tool_handler, log_event
            )
            if tool_outputs:
                tool_messages.extend(tool_outputs)
                continue
        break

    violations = _reply_violations(candidate)
    attempts.append(
        {
            "model": model_used,
            "text": candidate,
            "violations": violations,
            "error": error_detail or "",
        }
    )
    if not violations:
        return candidate, {"attempts": attempts}
    for _attempt in range(retries):
        intended_model = config.fast_model
        violations_line = ", ".join(violations)
        rewrite_prompt = (
            "Rewrite the reply to satisfy these constraints:\n"
            "- Stay in-character as a Ponyville pony.\n"
            "- Do not mention being an assistant, AI, or model.\n"
            "- Do not include links or URLs.\n"
            "- Keep it short and friendly (1-3 sentences).\n"
            f"Violations detected: {violations_line}\n"
            "Output only the corrected reply text."
        )
        rewrite_messages = list(tool_messages)
        if candidate:
            rewrite_messages.append({"role": "assistant", "content": candidate})
        rewrite_messages.append({"role": "user", "content": rewrite_prompt})
        try:
            text, tool_calls, model_used, fast_error = (
                await _call_chat_with_fallback_stream(
                    rewrite_messages,
                    config,
                    api_key,
                    tools=tools,
                    on_delta=on_delta,
                )
            )
            candidate = _clean_reply(text)
            error_detail = fast_error or ""
            if not candidate and not error_detail:
                error_detail = "empty_stream"
        except Exception as exc:
            candidate = ""
            model_used = intended_model
            error_detail = _truncate(str(exc), 200)
            tool_calls = []
        if tool_calls and tool_handler and tool_rounds < 2:
            tool_rounds += 1
            tool_messages = list(rewrite_messages)
            tool_outputs = await _handle_tool_calls(
                tool_calls, tool_handler, log_event
            )
            if tool_outputs:
                tool_messages.extend(tool_outputs)
                continue
        violations = _reply_violations(candidate)
        attempts.append(
            {
                "model": model_used,
                "text": candidate,
                "violations": violations,
                "error": error_detail or "",
            }
        )
        if not violations:
            return candidate, {"attempts": attempts}
    return "", {"attempts": attempts}


def _clean_reply(text):
    if not text:
        return ""
    cleaned = str(text).strip()
    if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in ("'", "\""):
        cleaned = cleaned[1:-1].strip()
    return cleaned


def _apply_system_prompt(history_messages, system_prompt):
    if not history_messages:
        return [{"role": "system", "content": system_prompt}]
    if history_messages[0].get("role") != "system":
        return [{"role": "system", "content": system_prompt}] + list(history_messages)
    history_messages[0]["content"] = system_prompt
    return history_messages


def _trim_history(history_messages, history_limit):
    if not history_limit or not history_messages:
        return history_messages
    system = None
    tail = list(history_messages)
    if tail and tail[0].get("role") == "system":
        system = tail.pop(0)
    max_entries = history_limit * 2
    if len(tail) > max_entries:
        tail = tail[-max_entries:]
    if system:
        return [system] + tail
    return tail


def _truncate(text, limit=160):
    if not text:
        return ""
    cleaned = str(text).strip()
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 3] + "..."


def _format_telemetry_detail(client_ts, data):
    detail = "source=client"
    if client_ts:
        detail += f" client_ts={client_ts}"
    if data:
        try:
            encoded = json.dumps(data, ensure_ascii=True)
        except TypeError:
            encoded = str(data)
        detail += f" data={_truncate(encoded, 200)}"
    return detail


def _parse_iso_ts(value):
    if not value:
        return None
    cleaned = str(value).strip()
    if not cleaned:
        return None
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(cleaned)
    except ValueError:
        return None


def _summarize_response(response):
    if not isinstance(response, dict):
        return "empty_response"
    keys = sorted(response.keys())
    summary = f"empty_response keys={','.join(keys)}"
    output = response.get("output")
    if isinstance(output, list):
        types = []
        for item in output:
            if isinstance(item, dict) and item.get("type"):
                types.append(str(item.get("type")))
        if types:
            summary += f" output_types={','.join(types)}"
    return summary


def _build_tool_handler(ws, config, log_event, active_slug, active_name):
    async def handle_tool_call(call):
        name = call.get("name")
        args = call.get("args") or {}
        call_id = call.get("call_id")
        if name == "pony_action":
            action = _build_action_payload(args)
            if not action:
                return "Invalid pony action."
            await _safe_send(ws, {"type": "action", "action": action})
            append_action(
                config.actions_path,
                f"Action: {action.get('ponySlug')} -> {action.get('command')}",
            )
            note = action.get("note") or ""
            ingredient = action.get("ingredient")
            if ingredient:
                return (
                    f"Action queued ({action.get('command')} {ingredient}). {note}"
                ).strip()
            return f"Action queued ({action.get('command')}). {note}".strip()
        if name == "pony_backstory":
            pony_slug = _safe_slug(args.get("ponySlug") or active_slug)
            backstory = _load_backstory(config, pony_slug)
            if not backstory:
                return "No backstory found."
            return backstory
        if log_event:
            log_event("tool_unknown", f"name={name} call_id={call_id}")
        return None

    return handle_tool_call


def _log_stamp():
    return (
        datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        + "Z"
    )
