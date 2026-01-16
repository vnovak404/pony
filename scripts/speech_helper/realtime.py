import asyncio
import json
import os
import re
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from .actions import append_action
from .context import build_session_context
from .openai_client import ensure_api_key

ROOT = Path(__file__).resolve().parents[2]
LOG_ROOT = ROOT / "logs" / "conversations"
ALLOWED_VOICES = [
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "sage",
    "shimmer",
    "verse",
    "marin",
    "cedar",
]
MALE_VOICES = ["ash", "ballad", "echo", "cedar", "sage", "verse"]
FEMALE_VOICES = ["coral", "shimmer", "marin", "alloy"]
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


def start_realtime_server(config, ssl_context=None):
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
        reply_source = None
        pending_actions = {}
        transcript_buffer = ""
        transcript_final_sent = False
        last_audio_at = None
        capture_started_at = None
        session_started_at = None
        session_ready = False
        buffered_audio = False
        active_response_id = None
        suppressed_response_id = None
        session_context_text = ""
        context_inserted = False
        session_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
        capture_active = False
        stt_started = False
        stt_partial_logged = False
        llm_first_token_logged = False
        tts_started = False
        tts_first_audio_logged = False
        last_client_utterance_stop_ts = None
        last_audio_play_start_ts = None
        last_barge_in_ts = None
        backstory_inserted = False
        backstory_text = ""

        def reset_turn_markers():
            nonlocal capture_active, capture_started_at, stt_started, stt_partial_logged
            nonlocal llm_first_token_logged, tts_started, tts_first_audio_logged
            capture_active = False
            capture_started_at = None
            stt_started = False
            stt_partial_logged = False
            llm_first_token_logged = False
            tts_started = False
            tts_first_audio_logged = False

        def reset_transcript_state():
            nonlocal transcript_buffer, transcript_final_sent, stt_partial_logged
            transcript_buffer = ""
            transcript_final_sent = False
            stt_partial_logged = False

        def log_event(event, detail=""):
            nonlocal log_path
            if not log_path:
                log_path = _init_log_path(active_pony_slug)
            line = f"[{_log_stamp()}] {event}"
            if detail:
                line = f"{line} {detail}"
            _append_log(log_path, line)
            print(f"[speech][realtime][{session_id}] {line}")

        async def send_status(status):
            try:
                await ws.send(json.dumps({"type": "status", "status": status}))
            except Exception:
                return

        await send_status("helper_connected")

        async def set_active_pony(slug, context=None):
            nonlocal log_path, active_pony_slug, active_pony_name, session_ready
            nonlocal backstory_inserted, backstory_text, session_context_text
            nonlocal context_inserted
            safe_slug = _safe_slug(slug)
            if context is None:
                context = build_session_context(config, safe_slug)
            pony_entry = (
                context.get("ponyLore", {}).get(safe_slug, {}) if safe_slug else {}
            )
            active_pony_slug = safe_slug or "unknown"
            active_pony_name = pony_entry.get("name") or slug or "Pony"
            log_path = _init_log_path(active_pony_slug)
            if openai_ws:
                session_ready = False
                backstory_text = _load_backstory(config, active_pony_slug)
                session_context_text = _format_realtime_context(context)
                context_inserted = False
                payload = await _send_session_update(
                    openai_ws,
                    config,
                    active_pony=pony_entry or {"name": active_pony_name},
                )
                _append_log_block(log_path, _format_session_log(payload))

        async def close_openai():
            nonlocal openai_ws, openai_task, response_requested, close_after_response
            nonlocal last_audio_at, session_started_at, reply_finalized
            nonlocal response_in_flight, reply_source, session_ready
            nonlocal buffered_audio, active_response_id, backstory_inserted
            nonlocal backstory_text, suppressed_response_id
            nonlocal session_context_text, context_inserted
            nonlocal last_audio_play_start_ts, last_barge_in_ts
            had_session = openai_ws is not None or session_started_at is not None
            response_requested = False
            close_after_response = False
            reply_finalized = False
            response_in_flight = False
            reply_source = None
            last_audio_at = None
            session_started_at = None
            session_ready = False
            buffered_audio = False
            active_response_id = None
            suppressed_response_id = None
            session_context_text = ""
            context_inserted = False
            last_audio_play_start_ts = None
            last_barge_in_ts = None
            backstory_inserted = False
            backstory_text = ""
            reset_transcript_state()
            reset_turn_markers()
            if openai_task and openai_task is not asyncio.current_task():
                openai_task.cancel()
            if openai_ws:
                try:
                    await openai_ws.close()
                except Exception:
                    pass
            openai_ws = None
            openai_task = None
            if had_session:
                await send_status("live_closed")

        async def start_openai(pony_slug):
            nonlocal openai_ws, openai_task, close_after_response, response_requested
            nonlocal last_audio_at, session_started_at, reply_finalized
            nonlocal session_ready, buffered_audio, active_response_id
            nonlocal backstory_inserted, pending_actions, suppressed_response_id
            nonlocal session_context_text, context_inserted
            await close_openai()
            try:
                openai_ws = await _openai_connect_once(websockets, url, headers)
            except Exception as exc:
                await ws.send(json.dumps({"type": "error", "error": str(exc)}))
                await send_status("live_closed")
                return
            close_after_response = False
            response_requested = False
            reply_finalized = False
            tool_calls.clear()
            session_started_at = time.monotonic()
            last_audio_at = session_started_at
            session_ready = False
            buffered_audio = False
            active_response_id = None
            backstory_inserted = False
            pending_actions = {}
            suppressed_response_id = None
            session_context_text = ""
            context_inserted = False
            context = build_session_context(config, pony_slug)
            await set_active_pony(pony_slug, context=context)
            try:
                await openai_ws.send(json.dumps({"type": "input_audio_buffer.clear"}))
            except Exception as exc:
                await ws.send(json.dumps({"type": "error", "error": str(exc)}))
                await close_openai()
                return
            openai_task = asyncio.create_task(forward_openai())

        async def flush_transcript_final(reason):
            nonlocal log_path, transcript_buffer, transcript_final_sent, stt_partial_logged
            if transcript_final_sent:
                return
            text = transcript_buffer.strip()
            if text:
                log_event("stt_final", f"chars={len(text)} reason={reason}")
                await ws.send(
                    json.dumps(
                        {
                            "type": "transcript",
                            "text": text,
                            "delta": "",
                            "final": True,
                        }
                    )
                )
                append_action(config.actions_path, f"Stella said: {text}")
                if not log_path:
                    log_path_local = _init_log_path(active_pony_slug)
                    log_path = log_path_local
                else:
                    log_path_local = log_path
                _append_log(log_path_local, f"Stella: {text}")
            transcript_buffer = ""
            transcript_final_sent = True
            stt_partial_logged = False

        async def cancel_for_barge_in(reason):
            nonlocal response_in_flight, response_requested, reply_source
            nonlocal reply_buffer, reply_streamed, reply_finalized
            nonlocal active_response_id, suppressed_response_id
            nonlocal tts_started, tts_first_audio_logged, llm_first_token_logged
            if not openai_ws:
                return
            if not (
                response_in_flight
                or active_response_id
                or tts_started
                or reply_streamed
            ):
                return
            suppressed_response_id = (
                active_response_id or suppressed_response_id or "unknown"
            )
            active_response_id = None
            response_in_flight = False
            response_requested = False
            reply_source = None
            reply_buffer = ""
            reply_streamed = False
            reply_finalized = False
            tts_started = False
            tts_first_audio_logged = False
            llm_first_token_logged = False
            log_event("barge_in", f"reason={reason}")
            await _cancel_response(openai_ws)
            await ws.send(json.dumps({"type": "audio_reset"}))
            await ws.send(json.dumps({"type": "reply_reset"}))
            reset_transcript_state()

        async def forward_client():
            nonlocal close_after_response, last_audio_at, reply_buffer
            nonlocal reply_streamed, reply_finalized, response_in_flight, response_requested
            nonlocal reply_source, buffered_audio, capture_active, capture_started_at
            nonlocal stt_started, pending_actions, last_client_utterance_stop_ts
            nonlocal last_audio_play_start_ts
            async for message in ws:
                try:
                    payload = json.loads(message)
                except json.JSONDecodeError:
                    continue
                msg_type = payload.get("type")
                if msg_type == "start_convo":
                    pony_slug = payload.get("ponySlug") or ""
                    await start_openai(pony_slug)
                elif msg_type == "hangup":
                    await close_openai()
                elif msg_type in ("start", "switch", "stop"):
                    continue
                elif msg_type == "telemetry":
                    event = payload.get("event")
                    if not event:
                        continue
                    client_ts = payload.get("clientTs") or payload.get("client_ts") or ""
                    data = payload.get("data") or {}
                    log_event(event, _format_telemetry_detail(client_ts, data))
                    if event == "utterance_stop":
                        last_client_utterance_stop_ts = _parse_iso_ts(client_ts)
                    elif event == "audio_play_start":
                        last_audio_play_start_ts = time.monotonic()
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
                elif msg_type == "action_done":
                    if not openai_ws or not session_ready:
                        continue
                    call_id = payload.get("callId") or payload.get("call_id")
                    result = payload.get("result") or ""
                    if not call_id:
                        continue
                    meta = pending_actions.pop(call_id, None)
                    if meta is None:
                        continue
                    elapsed_ms = int((time.monotonic() - meta["started_at"]) * 1000)
                    done_text = f"Action completed: {result}".strip()
                    log_event(
                        "action_done",
                        f"call_id={call_id} elapsed_ms={elapsed_ms} result_len={len(result)}",
                    )
                    await openai_ws.send(
                        json.dumps(
                            {
                                "type": "conversation.item.create",
                                "item": {
                                    "type": "message",
                                    "role": "system",
                                    "content": [
                                        {
                                            "type": "input_text",
                                            "text": done_text,
                                        }
                                    ],
                                },
                            }
                        )
                    )
                    await openai_ws.send(json.dumps({"type": "response.create"}))
                elif msg_type == "audio":
                    if not openai_ws or not session_ready:
                        continue
                    audio = payload.get("audio")
                    if audio:
                        if not capture_active:
                            reset_turn_markers()
                            capture_active = True
                            capture_started_at = time.monotonic()
                            log_event(
                                "capture_start",
                                f"payload_bytes={len(audio)}",
                            )
                        if not stt_started:
                            stt_started = True
                            log_event("stt_start", "note=realtime")
                        last_audio_at = time.monotonic()
                        buffered_audio = True
                        await openai_ws.send(
                            json.dumps(
                                {"type": "input_audio_buffer.append", "audio": audio}
                            )
                        )
                elif msg_type == "clear":
                    if openai_ws:
                        await openai_ws.send(
                            json.dumps({"type": "input_audio_buffer.clear"})
                        )
                        buffered_audio = False

        async def forward_openai():
            nonlocal log_path, active_pony_slug, active_pony_name, close_after_response
            nonlocal reply_buffer, reply_streamed, reply_finalized
            nonlocal response_in_flight, response_requested, reply_source
            nonlocal session_ready, buffered_audio, active_response_id
            nonlocal pending_actions, backstory_inserted, backstory_text
            nonlocal capture_active, stt_partial_logged, llm_first_token_logged
            nonlocal tts_started, tts_first_audio_logged
            nonlocal transcript_buffer, transcript_final_sent, suppressed_response_id
            nonlocal last_audio_play_start_ts, last_barge_in_ts
            nonlocal session_context_text, context_inserted
            async for message in openai_ws:
                event = _safe_json(message)
                if not event:
                    continue
                event_type = event.get("type")
                response_id = _extract_response_id(event)
                if event_type in ("session.updated", "session.created"):
                    if not session_ready:
                        session_ready = True
                        if session_context_text and not context_inserted:
                            await openai_ws.send(
                                json.dumps(
                                    {
                                        "type": "conversation.item.create",
                                        "item": {
                                            "type": "message",
                                            "role": "system",
                                            "content": [
                                                {
                                                    "type": "input_text",
                                                    "text": session_context_text,
                                                }
                                            ],
                                        },
                                    }
                                )
                            )
                            context_inserted = True
                            log_event(
                                "session_context_inserted",
                                f"chars={len(session_context_text)}",
                            )
                        if backstory_text and not backstory_inserted:
                            await openai_ws.send(
                                json.dumps(
                                    {
                                        "type": "conversation.item.create",
                                        "item": {
                                            "type": "message",
                                            "role": "system",
                                            "content": [
                                                {
                                                    "type": "input_text",
                                                    "text": backstory_text,
                                                }
                                            ],
                                        },
                                    }
                                )
                            )
                            backstory_inserted = True
                            log_event(
                                "backstory_inserted",
                                f"chars={len(backstory_text)}",
                            )
                        await send_status("live_ready")
                    continue
                if event_type == "input_audio_buffer.speech_started":
                    now = time.monotonic()
                    if last_audio_play_start_ts:
                        if now - last_audio_play_start_ts < 0.7:
                            continue
                    if last_barge_in_ts:
                        if now - last_barge_in_ts < 0.8:
                            continue
                    await cancel_for_barge_in("vad_speech_started")
                    last_barge_in_ts = now
                    continue
                if event_type == "response.created":
                    response_in_flight = True
                    if response_id:
                        if (
                            suppressed_response_id
                            and response_id != suppressed_response_id
                        ):
                            suppressed_response_id = None
                        active_response_id = response_id
                    await flush_transcript_final("response_created")
                    continue
                elif event_type and event_type.endswith("audio.delta"):
                    if suppressed_response_id and (
                        not response_id or response_id == suppressed_response_id
                    ):
                        continue
                    if not _accept_response_id(response_id, active_response_id):
                        if _debug_enabled():
                            print(
                                "Drop audio delta (response_id mismatch)",
                                response_id,
                                active_response_id,
                            )
                        continue
                    if response_id and not active_response_id:
                        active_response_id = response_id
                    if not tts_started:
                        tts_started = True
                        log_event("tts_start", "note=realtime")
                    if not tts_first_audio_logged:
                        tts_first_audio_logged = True
                        log_event(
                            "tts_first_audio_byte",
                            f"payload_bytes={len(event.get('delta', '') or '')} note=realtime",
                        )
                    await ws.send(
                        json.dumps({"type": "audio", "audio": event.get("delta", "")})
                    )
                elif event_type and event_type.endswith("audio.done"):
                    if suppressed_response_id and (
                        not response_id or response_id == suppressed_response_id
                    ):
                        continue
                    await ws.send(json.dumps({"type": "audio_done"}))
                    log_event("tts_done", "note=realtime")
                    if close_after_response:
                        await close_openai()
                        break
                reply_payload = _extract_reply_payload(event)
                if reply_payload:
                    payload_response_id = reply_payload.get("response_id")
                    if suppressed_response_id and (
                        not payload_response_id
                        or payload_response_id == suppressed_response_id
                    ):
                        continue
                    if not _accept_response_id(payload_response_id, active_response_id):
                        if _debug_enabled():
                            print(
                                "Drop reply payload (response_id mismatch)",
                                payload_response_id,
                                active_response_id,
                            )
                        continue
                    if payload_response_id and not active_response_id:
                        active_response_id = payload_response_id
                    source = reply_payload.get("source")
                    if reply_source and source and reply_source != source:
                        continue
                    if source and not reply_source:
                        reply_source = source
                    delta = reply_payload.get("delta")
                    text = reply_payload.get("text")
                    is_final = reply_payload.get("final")
                    if delta:
                        if not llm_first_token_logged:
                            llm_first_token_logged = True
                            log_event(
                                "llm_first_token",
                                f"source={source or 'unknown'}",
                            )
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
                        response_requested = False
                        reply_source = None
                        if text and not reply_buffer:
                            reply_buffer = text
                        final_text = (reply_buffer or text or "").strip()
                        reply_buffer = ""
                        streamed = reply_streamed
                        reply_streamed = False
                        if final_text:
                            log_event(
                                "llm_done",
                                f"chars={len(final_text)} source={source or 'unknown'}",
                            )
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
                    delta = transcript_payload.get("delta") or ""
                    text = transcript_payload.get("text") or ""
                    is_final = transcript_payload.get("final")
                    if transcript_final_sent:
                        reset_transcript_state()
                    if not stt_partial_logged:
                        stt_partial_logged = True
                        if is_final:
                            log_event("stt_first_partial", "note=final_only")
                        else:
                            log_event(
                                "stt_first_partial",
                                f"chars={len(delta or text)} note=realtime",
                            )
                    if text:
                        transcript_buffer = text
                    elif delta:
                        transcript_buffer += delta
                    await ws.send(
                        json.dumps(
                            {
                                "type": "transcript",
                                "delta": delta,
                                "text": text,
                                "final": False,
                            }
                        )
                    )
                    if is_final and transcript_buffer:
                        log_event(
                            "stt_update",
                            f"chars={len(transcript_buffer)} note=final_update",
                        )
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
                    if suppressed_response_id and (
                        not response_id or response_id == suppressed_response_id
                    ):
                        continue
                    tool_call = _maybe_extract_tool_call(event, tool_calls)
                    if tool_call:
                        name = tool_call.get("name")
                        if name == "pony_action":
                            action = _build_action_payload(tool_call.get("args", {}))
                            if action:
                                call_id = tool_call.get("call_id")
                                await ws.send(
                                    json.dumps(
                                        {
                                            "type": "action",
                                            "action": action,
                                            "callId": call_id,
                                        }
                                    )
                                )
                                if call_id:
                                    pending_actions[call_id] = {
                                        "ponySlug": action.get("ponySlug"),
                                        "command": action.get("command"),
                                        "ingredient": action.get("ingredient"),
                                        "note": action.get("note"),
                                        "started_at": time.monotonic(),
                                    }
                                    log_event(
                                        "action_dispatch",
                                        f"call_id={call_id} "
                                        f"ponySlug={action.get('ponySlug')} "
                                        f"command={action.get('command')}",
                                    )
                                    await _send_tool_output(
                                        openai_ws, call_id, "DISPATCHED"
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
                    error_detail = event.get("message")
                    if not error_detail and isinstance(event.get("error"), dict):
                        error_detail = event.get("error", {}).get("message")
                    await ws.send(
                        json.dumps({"type": "error", "error": error_detail})
                    )
                elif event_type and event_type.endswith("response.done"):
                    suppressed_match = suppressed_response_id and (
                        not response_id or response_id == suppressed_response_id
                    )
                    if not response_id or response_id == active_response_id:
                        active_response_id = None
                        response_in_flight = False
                        response_requested = False
                        reply_source = None
                    if suppressed_match:
                        suppressed_response_id = None
                        continue
                    await flush_transcript_final("response_done")

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
                    log_event("idle_timeout", f"seconds={idle_limit}")
                    await close_openai()
                    continue
                max_session = max(0, config.realtime_max_session or 0)
                if (
                    max_session
                    and session_started_at
                    and now - session_started_at >= max_session
                ):
                    log_event("session_timeout", f"seconds={max_session}")
                    await close_openai()

        watchdog_task = asyncio.create_task(watchdog())

        await forward_client()
        await close_openai()
        if watchdog_task and watchdog_task is not asyncio.current_task():
            watchdog_task.cancel()

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


async def _send_session_update(ws, config, active_pony=None):
    name = None
    species = "pony"
    if isinstance(active_pony, dict):
        name = active_pony.get("name")
        species = active_pony.get("species") or species
    if name:
        instructions = (
            f"You are {name}, a warm, gentle {species} from Ponyville.\n"
            f"Always respond in character as {name}.\n"
            "Never mention being an AI, assistant, or system."
        )
    else:
        instructions = (
            "You are a warm, gentle pony from Ponyville.\n"
            "Always respond in character.\n"
            "Never mention being an AI, assistant, or system."
        )
    voice = _resolve_voice(active_pony, config)
    payload = {
        "type": "session.update",
        "session": {
            "instructions": instructions,
            "voice": voice,
            "turn_detection": {
                "type": "server_vad",
                "silence_duration_ms": config.realtime_silence_duration_ms,
                "create_response": True,
            },
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
    return payload


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


def _append_log_block(path, block):
    if not path or not block:
        return
    try:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(block.rstrip() + "\n")
    except OSError:
        return


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


def _log_stamp():
    return (
        datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        + "Z"
    )


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
        return _sanitize_voice(_pick_voice(MALE_VOICES, slug), config)
    if gender == "female":
        return _sanitize_voice(_pick_voice(FEMALE_VOICES, slug), config)
    return _sanitize_voice(config.realtime_voice, config)


def _sanitize_voice(voice, config):
    if voice in ALLOWED_VOICES:
        return voice
    if config.realtime_voice in ALLOWED_VOICES:
        return config.realtime_voice
    return "coral"


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


async def _cancel_response(ws):
    try:
        await ws.send(json.dumps({"type": "response.cancel"}))
    except Exception:
        return


def _format_session_log(payload):
    if not isinstance(payload, dict):
        return ""
    session = payload.get("session", {})
    lines = [
        "--- Session context start ---",
        "instructions:",
        session.get("instructions", ""),
        f"voice: {session.get('voice', '')}",
        f"input_audio_format: {session.get('input_audio_format', '')}",
        f"output_audio_format: {session.get('output_audio_format', '')}",
        f"input_audio_transcription: {json.dumps(session.get('input_audio_transcription', {}), ensure_ascii=True)}",
        f"turn_detection: {json.dumps(session.get('turn_detection', {}), ensure_ascii=True)}",
        "--- Session context end ---",
    ]
    return "\n".join(line for line in lines if line is not None)


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
    source = None
    if "output_text" in event_type:
        source = "text"
    elif "audio_transcript" in event_type:
        source = "audio"
    else:
        return None
    response_id = _extract_response_id(event)
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
    return {
        "text": text or "",
        "delta": delta or "",
        "final": is_final,
        "source": source,
        "response_id": response_id,
    }


def _extract_response_id(event):
    if not isinstance(event, dict):
        return None
    response_id = event.get("response_id")
    if response_id:
        return response_id
    response = event.get("response")
    if isinstance(response, dict):
        response_id = response.get("id")
        if response_id:
            return response_id
    item = event.get("item")
    if isinstance(item, dict):
        response_id = item.get("response_id")
        if response_id:
            return response_id
    return None


def _accept_response_id(response_id, active_response_id):
    if active_response_id:
        if not response_id:
            return True
        return response_id == active_response_id
    return True


def _debug_enabled():
    return os.getenv("OPENAI_REALTIME_DEBUG", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _ensure_summary(pony_entry, backstory):
    summary = ""
    if isinstance(pony_entry, dict):
        summary = pony_entry.get("backstorySummary") or ""
    summary = summary.strip()
    if summary:
        return _summarize_backstory(summary)
    return _summarize_backstory(backstory)


def _format_realtime_context(context):
    if not isinstance(context, dict):
        return ""
    locations = context.get("ponyvilleLocations", [])
    attitudes = context.get("ponyAttitudes", [])
    place_names = []
    for item in locations:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if name:
            place_names.append(str(name))
    attitude_bits = []
    for item in attitudes:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        sentiment = item.get("sentiment") or ""
        notes = item.get("notes") or ""
        if not name or not (sentiment or notes):
            continue
        if sentiment and notes:
            attitude_bits.append(f"{name}: {sentiment} ({notes})")
        elif sentiment:
            attitude_bits.append(f"{name}: {sentiment}")
        else:
            attitude_bits.append(f"{name}: {notes}")
    if not place_names and not attitude_bits:
        return ""
    lines = []
    if place_names:
        lines.append("Ponyville places: " + ", ".join(place_names))
    if attitude_bits:
        lines.append("Pony attitudes: " + "; ".join(attitude_bits))
    return "\n".join(lines)


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
