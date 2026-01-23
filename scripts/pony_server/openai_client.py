import json
import os
import time
import urllib.error
import urllib.request


CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"
RESPONSES_URL = "https://api.openai.com/v1/responses"

DEFAULT_TIMEOUT = 60
DEFAULT_RETRIES = 2


def load_env_value(path, key):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith("export "):
                    line = line[7:].lstrip()
                if "=" not in line:
                    continue
                name, value = line.split("=", 1)
                if name.strip() != key:
                    continue
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in ("\"", "'"):
                    value = value[1:-1]
                return value
    except FileNotFoundError:
        return None
    return None


def ensure_api_key(env_file):
    api_key = os.getenv("OPENAI_API_KEY") or load_env_value(env_file, "OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("Missing OPENAI_API_KEY in environment or .env.")
    return api_key


def chat_response(
    messages,
    *,
    model,
    api_key,
    max_tokens=220,
    temperature=0.4,
    timeout=DEFAULT_TIMEOUT,
):
    if _uses_responses(model):
        payload = {
            "model": model,
            "input": _messages_to_responses_input(messages),
            "max_output_tokens": max_tokens,
            "text": {"format": {"type": "text"}},
            "reasoning": {"effort": "low"},
        }
        return _request_json(RESPONSES_URL, payload, api_key, timeout=timeout)
    payload = {
        "model": model,
        "messages": _messages_to_chat_messages(messages),
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    return _request_json(CHAT_COMPLETIONS_URL, payload, api_key, timeout=timeout)


def _uses_responses(model):
    if not model:
        return False
    return str(model).startswith("gpt-5")


def _messages_to_chat_messages(messages):
    output = []
    for message in messages:
        output.append(
            {
                "role": message.get("role", "user"),
                "content": str(message.get("content", "")),
            }
        )
    return output


def _messages_to_responses_input(messages):
    output = []
    for message in messages:
        output.append(
            {
                "role": message.get("role", "user"),
                "content": str(message.get("content", "")),
            }
        )
    return output


def _request_json(url, payload, api_key, timeout=DEFAULT_TIMEOUT):
    data = json.dumps(payload).encode("utf-8")
    for attempt in range(1, DEFAULT_RETRIES + 1):
        request = urllib.request.Request(
            url,
            data=data,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
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
