import asyncio
import json
import re
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from .actions import append_action
from .context import build_session_context
from .openai_client import ensure_api_key
from .prompting import build_system_prompt
from .pronunciation import load_pronunciation_guide

ROOT = Path(__file__).resolve().parents[2]
LOG_ROOT = ROOT / "logs" / "conversations"
MALE_VOICES = ["ballad", "echo", "onyx", "ash"]
FEMALE_VOICES = ["coral", "fable", "shimmer"]

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


def start_realtime_server(config):
    try:
        import websockets  # type: ignore
    except ImportError:
        print("Realtime WS disabled (install `websockets` to enable).")
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
        url = config.realtime_url.format(model=config.realtime_model)
        print(f"Realtime connect: {url}")
        headers = [
            ("Authorization", f"Bearer {api_key}"),
            ("OpenAI-Beta", "realtime=v1"),
        ]

        openai_ws = None
        openai_task = None
        watchdog_task = None
        tool_calls = {}
        log_path = None
        active_pony_slug = "unknown"
        active_pony_name = "Pony"
        close_after_response = False
        response_requested = False
        reply_buffer = ""
        reply_streamed = False
        reply_finalized = False
        response_in_flight = False
        last_audio_at = None
        session_started_at = None

        async def send_status(status):
            try:
                await ws.send(json.dumps({"type": "status", "status": status}))
            except Exception:
                return

        async def set_active_pony(slug, context=None):
            nonlocal log_path, active_pony_slug, active_pony_name
            safe_slug = _safe_slug(slug)
            if context is None:
                context = build_session_context(config)
            pony_entry = (
                context.get("ponyLore", {}).get(safe_slug, {}) if safe_slug else {}
            )
            active_pony_slug = safe_slug or "unknown"
            active_pony_name = pony_entry.get("name") or slug or "Pony"
            log_path = _init_log_path(active_pony_slug)
            if openai_ws:
                await _send_session_update(
                    openai_ws,
                    config,
                    context=context,
                    active_pony=pony_entry or {"name": active_pony_name},
                )

        async def close_openai():
            nonlocal openai_ws, openai_task, response_requested, close_after_response
            nonlocal last_audio_at, session_started_at, reply_finalized
            nonlocal response_in_flight
            response_requested = False
            close_after_response = False
            reply_finalized = False
            response_in_flight = False
            last_audio_at = None
            session_started_at = None
            if openai_task and openai_task is not asyncio.current_task():
                openai_task.cancel()
            if openai_ws:
                try:
                    await openai_ws.close()
                except Exception:
                    pass
            openai_ws = None
            openai_task = None

        async def request_response():
            nonlocal response_requested, reply_buffer, reply_streamed, reply_finalized
            nonlocal response_in_flight
            if not openai_ws or response_requested or response_in_flight:
                return
            response_requested = True
            response_in_flight = True
            reply_buffer = ""
            reply_streamed = False
            reply_finalized = False
            await openai_ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
            await openai_ws.send(json.dumps({"type": "response.create"}))

        async def start_openai(pony_slug):
            nonlocal openai_ws, openai_task, close_after_response, response_requested
            nonlocal last_audio_at, session_started_at, reply_finalized
            await close_openai()
            openai_ws = await _openai_connect_once(websockets, url, headers)
            close_after_response = False
            response_requested = False
            reply_finalized = False
            tool_calls.clear()
            session_started_at = time.monotonic()
            last_audio_at = session_started_at
            await send_status("ready")
            context = build_session_context(config)
            await set_active_pony(pony_slug, context=context)
            await openai_ws.send(json.dumps({"type": "input_audio_buffer.clear"}))
            openai_task = asyncio.create_task(forward_openai())

        async def forward_client():
            nonlocal close_after_response, last_audio_at
            async for message in ws:
                try:
                    payload = json.loads(message)
                except json.JSONDecodeError:
                    continue
                msg_type = payload.get("type")
                if msg_type == "start":
                    pony_slug = payload.get("ponySlug") or ""
                    await start_openai(pony_slug)
                elif msg_type == "audio":
                    if not openai_ws:
                        continue
                    audio = payload.get("audio")
                    if audio:
                        last_audio_at = time.monotonic()
                        await openai_ws.send(
                            json.dumps(
                                {"type": "input_audio_buffer.append", "audio": audio}
                            )
                        )
                elif msg_type == "stop":
                    close_after_response = True
                    await request_response()
                elif msg_type == "clear":
                    if openai_ws:
                        await openai_ws.send(
                            json.dumps({"type": "input_audio_buffer.clear"})
                        )

        async def forward_openai():
            nonlocal log_path, active_pony_slug, active_pony_name, close_after_response
            nonlocal reply_buffer, reply_streamed, reply_finalized
            async for message in openai_ws:
                event = _safe_json(message)
                if not event:
                    continue
                event_type = event.get("type")
                if event_type == "input_audio_buffer.speech_stopped":
                    await request_response()
                elif event_type and event_type.endswith("audio.delta"):
                    await ws.send(
                        json.dumps({"type": "audio", "audio": event.get("delta", "")})
                    )
                elif event_type and event_type.endswith("audio.done"):
                    await ws.send(json.dumps({"type": "audio_done"}))
                    if close_after_response:
                        await close_openai()
                        break
                reply_payload = _extract_reply_payload(event)
                if reply_payload:
                    delta = reply_payload.get("delta")
                    text = reply_payload.get("text")
                    is_final = reply_payload.get("final")
                    if delta:
                        reply_buffer += delta
                        reply_streamed = True
                        await ws.send(json.dumps({"type": "reply", "delta": delta}))
                    if is_final:
                        if reply_finalized:
                            reply_buffer = ""
                            reply_streamed = False
                            continue
                        reply_finalized = True
                        response_in_flight = False
                        if text and not reply_buffer:
                            reply_buffer = text
                        final_text = (reply_buffer or text or "").strip()
                        reply_buffer = ""
                        streamed = reply_streamed
                        reply_streamed = False
                        if final_text and not _is_garbage_reply(final_text):
                            if not streamed:
                                await ws.send(
                                    json.dumps({"type": "reply", "text": final_text})
                                )
                            append_action(
                                config.actions_path,
                                f"Pony replied: {final_text}",
                            )
                            if not log_path:
                                log_path = _init_log_path(active_pony_slug)
                            _append_log(log_path, f"{active_pony_name}: {final_text}")
                        await ws.send(json.dumps({"type": "reply_done"}))
                        if close_after_response:
                            await close_openai()
                            break
                    continue
                transcript_payload = _extract_transcript_payload(event)
                if transcript_payload:
                    await ws.send(
                        json.dumps(
                            {
                                "type": "transcript",
                                "delta": transcript_payload.get("delta", ""),
                                "text": transcript_payload.get("text", ""),
                                "final": transcript_payload.get("final", False),
                            }
                        )
                    )
                    if transcript_payload.get("final"):
                        text = transcript_payload.get("text", "")
                        if text:
                            append_action(
                                config.actions_path, f"Stella said: {text}"
                            )
                            if not log_path:
                                log_path = _init_log_path(active_pony_slug)
                            _append_log(log_path, f"Stella: {text}")
                    continue
                elif event_type in (
                    "response.output_item.added",
                    "response.output_item.delta",
                    "response.output_item.done",
                    "response.function_call.arguments.delta",
                    "response.function_call.arguments.done",
                    "response.tool_call.arguments.delta",
                    "response.tool_call.arguments.done",
                ):
                    tool_call = _maybe_extract_tool_call(event, tool_calls)
                    if tool_call:
                        name = tool_call.get("name")
                        if name == "pony_action":
                            action = _build_action_payload(tool_call.get("args", {}))
                            if action:
                                await ws.send(
                                    json.dumps({"type": "action", "action": action})
                                )
                                append_action(
                                    config.actions_path,
                                    f"Action: {action.get('ponySlug')} -> {action.get('command')}",
                                )
                        elif name == "pony_backstory":
                            args = tool_call.get("args", {})
                            pony_slug = _safe_slug(
                                args.get("ponySlug") or active_pony_slug
                            )
                            backstory = _load_backstory(config, pony_slug)
                            await _send_tool_output(
                                openai_ws, tool_call.get("call_id"), backstory
                            )
                elif event_type == "error":
                    await ws.send(
                        json.dumps({"type": "error", "error": event.get("message")})
                    )
                elif event_type and event_type.endswith("response.done"):
                    response_in_flight = False

        async def watchdog():
            nonlocal last_audio_at, session_started_at
            while True:
                await asyncio.sleep(1)
                if not openai_ws:
                    continue
                now = time.monotonic()
                idle_limit = max(0, config.realtime_idle_timeout or 0)
                if (
                    idle_limit
                    and last_audio_at
                    and now - last_audio_at >= idle_limit
                ):
                    await send_status("idle_timeout")
                    await close_openai()
                    continue
                max_session = max(0, config.realtime_max_session or 0)
                if (
                    max_session
                    and session_started_at
                    and now - session_started_at >= max_session
                ):
                    await send_status("session_timeout")
                    await close_openai()

        watchdog_task = asyncio.create_task(watchdog())

        await forward_client()
        await close_openai()
        if watchdog_task and watchdog_task is not asyncio.current_task():
            watchdog_task.cancel()

    async def server_loop():
        async with websockets.serve(
            handle_client, config.host, config.ws_port, max_size=2**20
        ):
            await asyncio.Future()

    def run():
        asyncio.run(server_loop())

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    return thread


@asynccontextmanager
async def _openai_connect(websockets, url, headers):
    try:
        async with websockets.connect(url, extra_headers=headers) as openai_ws:
            yield openai_ws
    except TypeError:
        async with websockets.connect(url, additional_headers=headers) as openai_ws:
            yield openai_ws


async def _openai_connect_once(websockets, url, headers):
    try:
        return await websockets.connect(url, extra_headers=headers)
    except TypeError:
        return await websockets.connect(url, additional_headers=headers)


async def _send_session_update(ws, config, context=None, active_pony=None):
    if context is None:
        context = build_session_context(config)
    guide = load_pronunciation_guide(config.pronunciation_guide_path)
    instructions = build_system_prompt(
        context, guide.get("entries", {}), active_pony=active_pony
    )
    voice = _resolve_voice(active_pony, config)
    instructions += (
        "\n\nIf the user asks a pony to do something in Ponyville, call pony_action."
        "\nUse command=resupply for restocking a pony's job location."
        "\nUse command=gather with ingredient (lumber, water, honey, sugar, lemon, milk, produce)."
        "\nUse command=rest for sleep or naps, and command=vet for clinic visits."
        "\nIf the user asks for a full life story, call pony_backstory."
    )
    payload = {
        "type": "session.update",
        "session": {
            "instructions": instructions,
            "voice": voice,
            "turn_detection": _build_turn_detection(config),
            "input_audio_format": config.realtime_input_format,
            "output_audio_format": config.realtime_output_format,
            "input_audio_transcription": {
                "model": config.realtime_transcription_model
            },
            "modalities": ["audio", "text"],
            "tools": TOOLS,
            "tool_choice": "auto",
        },
    }
    await ws.send(json.dumps(payload))


def _safe_slug(value):
    if not value:
        return "unknown"
    slug = str(value).strip().lower().replace(" ", "-")
    slug = re.sub(r"[^a-z0-9-]+", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    return slug or "unknown"


def _init_log_path(pony_slug):
    safe_slug = _safe_slug(pony_slug)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
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


async def _send_tool_output(ws, call_id, output):
    payload = {
        "type": "conversation.item.create",
        "item": {
            "type": "function_call_output",
            "call_id": call_id,
            "output": output or "",
        },
    }
    await ws.send(json.dumps(payload))
    await ws.send(json.dumps({"type": "response.create"}))


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


def _pick_voice(voices, slug):
    if not voices:
        return None
    if not slug:
        return voices[0]
    index = sum(ord(char) for char in slug) % len(voices)
    return voices[index]


def _resolve_voice(active_pony, config):
    gender = None
    slug = None
    if isinstance(active_pony, dict):
        gender = active_pony.get("gender")
        slug = active_pony.get("slug") or active_pony.get("name")
    if gender:
        gender = str(gender).strip().lower()
    if not gender:
        slug = _safe_slug(slug)
        gender = {
            "taticorn": "male",
            "catohorn": "male",
            "tiny-horn": "male",
            "nessie-star": "female",
            "stellacorn": "female",
        }.get(slug)
    if gender == "male":
        return _pick_voice(MALE_VOICES, slug) or config.realtime_voice
    if gender == "female":
        return _pick_voice(FEMALE_VOICES, slug) or config.realtime_voice
    return config.realtime_voice


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


def _safe_json(message):
    try:
        return json.loads(message)
    except json.JSONDecodeError:
        return None


def _build_turn_detection(config):
    payload = {"type": "server_vad"}
    silence_ms = max(0, config.realtime_silence_duration_ms)
    if silence_ms:
        payload["silence_duration_ms"] = silence_ms
    return payload


def _extract_transcript_payload(event):
    event_type = str(event.get("type") or "").lower()
    if "input_audio_transcription" not in event_type:
        return None
    text = event.get("text") or event.get("transcript")
    delta = event.get("delta")
    item = event.get("item")
    if not text and not delta and isinstance(item, dict):
        text = item.get("text") or item.get("transcript")
        delta = item.get("delta")
    is_final = any(key in event_type for key in ("done", "complete", "completed", "final"))
    if not delta and text and not is_final:
        delta = text
        text = ""
    if is_final and not text and delta:
        text = delta
        delta = ""
    if not text and not delta:
        return None
    return {"text": text or "", "delta": delta or "", "final": is_final}


def _extract_reply_payload(event):
    event_type = str(event.get("type") or "").lower()
    if "input_audio_transcription" in event_type:
        return None
    if not any(
        key in event_type
        for key in ("output_text", "audio_transcript", "text.delta", "text.done")
    ):
        return None
    text = event.get("text") or event.get("transcript")
    delta = event.get("delta")
    item = event.get("item")
    if not text and not delta and isinstance(item, dict):
        text = item.get("text") or item.get("transcript")
        delta = item.get("delta")
    is_final = any(key in event_type for key in ("done", "complete", "completed", "final"))
    if not delta and text and not is_final:
        delta = text
        text = ""
    if is_final and not text and delta:
        text = delta
        delta = ""
    if not text and not delta:
        return None
    return {"text": text or "", "delta": delta or "", "final": is_final}


def _maybe_extract_tool_call(event, tool_calls):
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
                return _finalize_tool_call(call_id, tool_calls)
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
        return _finalize_tool_call(call_id, tool_calls)
    return None


def _finalize_tool_call(call_id, tool_calls):
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
