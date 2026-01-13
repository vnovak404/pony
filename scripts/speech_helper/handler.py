import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from .actions import append_action
from .context import build_session_context
from .io import load_body_bytes, load_json_body
from .openai_client import (
    chat_response,
    decode_base64_audio,
    ensure_api_key,
    synthesize_speech,
    transcribe_audio,
)
from .pronunciation import load_pronunciation_guide, normalize_text, save_pronunciation_guide
from .prompting import build_system_prompt


class SpeechHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, config=None, **kwargs):
        self.config = config
        super().__init__(*args, **kwargs)

    def _origin_allowed(self):
        origin = self.headers.get("Origin")
        if origin is None:
            return True
        if origin == "null":
            return self.config.allow_null_origin
        return origin in self.config.allowed_origins

    def _send_cors_headers(self):
        origin = self.headers.get("Origin")
        if origin is None:
            return
        if origin == "null" and self.config.allow_null_origin:
            self.send_header("Access-Control-Allow-Origin", "null")
        elif origin in self.config.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _reject_origin(self):
        self.send_response(HTTPStatus.FORBIDDEN)
        self._send_cors_headers()
        self.end_headers()

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_audio(self, status, audio_bytes, content_type):
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(audio_bytes)))
        self.end_headers()
        self.wfile.write(audio_bytes)

    def do_OPTIONS(self):
        if not self._origin_allowed():
            return self._reject_origin()
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        if not self._origin_allowed():
            return self._reject_origin()
        path = self.path.split("?", 1)[0]
        if path == "/health":
            return self._send_json(HTTPStatus.OK, {"ok": True})
        if path == "/pronunciation-guide":
            guide = load_pronunciation_guide(self.config.pronunciation_guide_path)
            return self._send_json(HTTPStatus.OK, guide)
        self._send_json(HTTPStatus.NOT_FOUND, {"error": "Not Found"})

    def do_POST(self):
        if not self._origin_allowed():
            return self._reject_origin()
        path = self.path.split("?", 1)[0]
        if path == "/stt":
            return self._handle_stt()
        if path == "/chat":
            return self._handle_chat()
        if path == "/tts":
            return self._handle_tts()
        if path == "/pronunciation-guide":
            return self._handle_update_pronunciation()
        if path == "/actions":
            return self._handle_actions()
        self._send_json(HTTPStatus.NOT_FOUND, {"error": "Not Found"})

    def _handle_update_pronunciation(self):
        payload = load_json_body(self)
        if payload is None:
            return self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON."})
        guide = load_pronunciation_guide(self.config.pronunciation_guide_path)
        entries = guide.get("entries", {})
        updates = payload.get("entries", {})
        if isinstance(updates, dict):
            for key, value in updates.items():
                if value is None:
                    entries.pop(key, None)
                else:
                    entries[key] = value
        deletes = payload.get("delete", [])
        if isinstance(deletes, list):
            for key in deletes:
                entries.pop(key, None)
        guide["entries"] = entries
        save_pronunciation_guide(self.config.pronunciation_guide_path, guide)
        return self._send_json(HTTPStatus.OK, guide)

    def _extract_audio_payload(self):
        content_type = self.headers.get("Content-Type", "")
        if content_type.startswith("application/json"):
            payload = load_json_body(self)
            if payload is None:
                return None, None, None, "Invalid JSON."
            audio_b64 = payload.get("audio")
            if not audio_b64:
                return None, None, None, "Missing audio field."
            audio_bytes = decode_base64_audio(audio_b64)
            content_type = payload.get("contentType") or payload.get("format") or "audio/wav"
            filename = payload.get("filename") or _default_audio_filename(content_type)
            return audio_bytes, content_type, filename, None

        audio_bytes = load_body_bytes(self)
        if not audio_bytes:
            return None, None, None, "Missing audio body."
        content_type = content_type or "audio/wav"
        filename = _default_audio_filename(content_type)
        return audio_bytes, content_type, filename, None

    def _handle_stt(self):
        audio_bytes, content_type, filename, error = self._extract_audio_payload()
        if error:
            return self._send_json(HTTPStatus.BAD_REQUEST, {"error": error})
        try:
            api_key = ensure_api_key(self.config.env_file)
            result = transcribe_audio(
                audio_bytes,
                filename=filename,
                content_type=content_type,
                model=self.config.stt_model,
                api_key=api_key,
            )
        except Exception as exc:
            return self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})
        text = result.get("text", "")
        guide = load_pronunciation_guide(self.config.pronunciation_guide_path)
        normalized = normalize_text(text, guide.get("entries", {}))
        return self._send_json(
            HTTPStatus.OK,
            {
                "text": text,
                "normalizedText": normalized,
                "model": self.config.stt_model,
            },
        )

    def _handle_chat(self):
        payload = load_json_body(self)
        if payload is None:
            return self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON."})
        text = payload.get("text")
        if not text:
            return self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Missing text."})
        context = build_session_context(self.config)
        guide = load_pronunciation_guide(self.config.pronunciation_guide_path)
        system_prompt = build_system_prompt(context, guide.get("entries", {}))
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ]
        api_key = ensure_api_key(self.config.env_file)
        model_used = self.config.fast_model
        try:
            response = chat_response(messages, model=self.config.fast_model, api_key=api_key)
        except Exception as exc:
            if not self.config.fallback_to_smart:
                return self._send_json(
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    {"error": str(exc)},
                )
            try:
                model_used = self.config.smart_model
                response = chat_response(messages, model=self.config.smart_model, api_key=api_key)
            except Exception as retry_exc:
                return self._send_json(
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    {"error": str(retry_exc)},
                )
        reply = _extract_chat_text(response)
        return self._send_json(
            HTTPStatus.OK,
            {
                "reply": reply,
                "model": model_used,
            },
        )

    def _handle_tts(self):
        payload = load_json_body(self)
        if payload is None:
            return self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON."})
        text = payload.get("text")
        if not text:
            return self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Missing text."})
        voice = payload.get("voice", self.config.tts_voice)
        response_format = payload.get("format", "mp3")
        content_type = _audio_content_type(response_format)
        try:
            api_key = ensure_api_key(self.config.env_file)
            audio_bytes = synthesize_speech(
                text,
                model=self.config.tts_model,
                voice=voice,
                response_format=response_format,
                api_key=api_key,
            )
        except Exception as exc:
            return self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})
        return self._send_audio(HTTPStatus.OK, audio_bytes, content_type)

    def _handle_actions(self):
        payload = load_json_body(self)
        if payload is None:
            return self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON."})
        action = payload.get("action")
        if not action:
            return self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Missing action."})
        actions = append_action(self.config.actions_path, action)
        return self._send_json(HTTPStatus.OK, {"actions": actions})


def _default_audio_filename(content_type):
    if "webm" in content_type:
        return "audio.webm"
    if "mpeg" in content_type or "mp3" in content_type:
        return "audio.mp3"
    if "ogg" in content_type:
        return "audio.ogg"
    return "audio.wav"


def _audio_content_type(response_format):
    if response_format == "wav":
        return "audio/wav"
    if response_format == "ogg":
        return "audio/ogg"
    return "audio/mpeg"


def _extract_chat_text(response):
    if not isinstance(response, dict):
        return ""
    output_text = response.get("output_text")
    if isinstance(output_text, str) and output_text:
        return output_text
    output = response.get("output")
    if isinstance(output, list):
        parts = []
        for item in output:
            if not isinstance(item, dict):
                continue
            for content in item.get("content", []):
                if not isinstance(content, dict):
                    continue
                text = content.get("text")
                if text:
                    parts.append(text)
        if parts:
            return "\n".join(parts)
    choices = response.get("choices")
    if not choices:
        return ""
    message = choices[0].get("message", {})
    return message.get("content", "")
