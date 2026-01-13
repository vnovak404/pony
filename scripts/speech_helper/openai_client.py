import base64
import json
import os
import time
import urllib.error
import urllib.request

from .utils import load_env_value

AUDIO_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions"
CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"
RESPONSES_URL = "https://api.openai.com/v1/responses"
TTS_URL = "https://api.openai.com/v1/audio/speech"

DEFAULT_TIMEOUT = 60
DEFAULT_RETRIES = 2


def resolve_api_key(env_file):
    return os.getenv("OPENAI_API_KEY") or load_env_value(env_file, "OPENAI_API_KEY")


def ensure_api_key(env_file):
    api_key = resolve_api_key(env_file)
    if not api_key:
        raise RuntimeError("Missing OPENAI_API_KEY in environment or .env.")
    return api_key


def _encode_multipart(fields, files):
    boundary = f"----speech-helper-{int(time.time() * 1000)}"
    body = bytearray()

    def add_bytes(value):
        if isinstance(value, str):
            body.extend(value.encode("utf-8"))
        else:
            body.extend(value)

    for name, value in fields.items():
        add_bytes(f"--{boundary}\r\n")
        add_bytes(f'Content-Disposition: form-data; name="{name}"\r\n\r\n')
        add_bytes(f"{value}\r\n")

    for name, filename, content_type, data in files:
        add_bytes(f"--{boundary}\r\n")
        add_bytes(
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
        )
        add_bytes(f"Content-Type: {content_type}\r\n\r\n")
        add_bytes(data)
        add_bytes("\r\n")

    add_bytes(f"--{boundary}--\r\n")
    return boundary, bytes(body)


def _request_json(url, payload, api_key, timeout=DEFAULT_TIMEOUT):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    for attempt in range(1, DEFAULT_RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                body = response.read().decode("utf-8")
                return json.loads(body)
        except (urllib.error.HTTPError, urllib.error.URLError) as exc:
            if attempt == DEFAULT_RETRIES:
                if isinstance(exc, urllib.error.HTTPError):
                    detail = exc.read().decode("utf-8", errors="replace")
                    raise RuntimeError(
                        f"OpenAI request failed: {exc.code} {exc.reason}\n{detail}"
                    ) from exc
                raise RuntimeError(f"OpenAI request failed: {exc}") from exc
            time.sleep(2 ** (attempt - 1))
    raise RuntimeError("OpenAI request failed after retries.")


def _request_bytes(url, payload, api_key, timeout=DEFAULT_TIMEOUT):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    for attempt in range(1, DEFAULT_RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except (urllib.error.HTTPError, urllib.error.URLError) as exc:
            if attempt == DEFAULT_RETRIES:
                if isinstance(exc, urllib.error.HTTPError):
                    detail = exc.read().decode("utf-8", errors="replace")
                    raise RuntimeError(
                        f"OpenAI request failed: {exc.code} {exc.reason}\n{detail}"
                    ) from exc
                raise RuntimeError(f"OpenAI request failed: {exc}") from exc
            time.sleep(2 ** (attempt - 1))
    raise RuntimeError("OpenAI request failed after retries.")


def transcribe_audio(audio_bytes, *, filename, content_type, model, api_key):
    fields = {
        "model": model,
        "response_format": "json",
    }
    files = [("file", filename, content_type, audio_bytes)]
    boundary, body = _encode_multipart(fields, files)
    request = urllib.request.Request(
        AUDIO_TRANSCRIPTIONS_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    for attempt in range(1, DEFAULT_RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=DEFAULT_TIMEOUT) as response:
                body = response.read().decode("utf-8")
                return json.loads(body)
        except (urllib.error.HTTPError, urllib.error.URLError) as exc:
            if attempt == DEFAULT_RETRIES:
                if isinstance(exc, urllib.error.HTTPError):
                    detail = exc.read().decode("utf-8", errors="replace")
                    raise RuntimeError(
                        f"STT request failed: {exc.code} {exc.reason}\n{detail}"
                    ) from exc
                raise RuntimeError(f"STT request failed: {exc}") from exc
            time.sleep(2 ** (attempt - 1))
    raise RuntimeError("STT request failed after retries.")


def _uses_max_completion_tokens(model):
    if not model:
        return False
    return model.startswith("gpt-5")


def _coerce_text_content(content):
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if text:
                    parts.append(str(text))
            elif isinstance(item, str):
                parts.append(item)
        if parts:
            return "\n".join(parts)
    if isinstance(content, dict):
        text = content.get("text")
        if text:
            return str(text)
    return str(content or "")


def _messages_to_responses_input(messages):
    input_messages = []
    for message in messages:
        content = _coerce_text_content(message.get("content", ""))
        input_messages.append(
            {
                "role": message.get("role", "user"),
                "content": content,
            }
        )
    return input_messages


def responses_create(messages, *, model, api_key, max_output_tokens=220):
    payload = {
        "model": model,
        "input": _messages_to_responses_input(messages),
        "max_output_tokens": max_output_tokens,
        "text": {"format": {"type": "text"}},
        "reasoning": {"effort": "low"},
    }
    return _request_json(RESPONSES_URL, payload, api_key)


def chat_response(messages, *, model, api_key, max_tokens=220, temperature=0.4):
    if _uses_max_completion_tokens(model):
        return responses_create(messages, model=model, api_key=api_key, max_output_tokens=max_tokens)
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    return _request_json(CHAT_COMPLETIONS_URL, payload, api_key)


def synthesize_speech(text, *, model, voice, response_format, api_key):
    payload = {
        "model": model,
        "input": text,
        "voice": voice,
        "response_format": response_format,
    }
    return _request_bytes(TTS_URL, payload, api_key)


def decode_base64_audio(value):
    try:
        return base64.b64decode(value)
    except Exception as exc:
        raise RuntimeError("Invalid base64 audio payload.") from exc
