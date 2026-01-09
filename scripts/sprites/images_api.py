import base64
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_PATH = ROOT / ".env"
DEFAULT_API_URL = "https://api.openai.com/v1/images/generations"
DEFAULT_EDIT_URL = "https://api.openai.com/v1/images/edits"
DEFAULT_MODEL = os.getenv("OPENAI_SPRITE_MODEL", "gpt-image-1")
DEFAULT_TIMEOUT = 120
DEFAULT_RETRIES = 3
DEFAULT_WEBP_QUALITY = 85
DEFAULT_WEBP_METHOD = 6


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


def get_api_key():
    return os.getenv("OPENAI_API_KEY") or load_env_value(DEFAULT_ENV_PATH, "OPENAI_API_KEY")


def ensure_api_key():
    api_key = get_api_key()
    if not api_key:
        raise RuntimeError("Missing OPENAI_API_KEY in environment or .env.")
    return api_key


def is_gpt_image_model(model):
    return bool(model) and model.startswith("gpt-image-")


def _parse_target_size(size):
    if isinstance(size, int):
        return size
    if isinstance(size, str) and "x" in size:
        parts = size.lower().split("x", 1)
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            if parts[0] == parts[1]:
                return int(parts[0])
    return None


def _resolve_request_size(model, size):
    if is_gpt_image_model(model):
        if isinstance(size, str) and size in {"auto", "1024x1024", "1024x1536", "1536x1024"}:
            return size
        return "1024x1024"
    if isinstance(size, int):
        return f"{size}x{size}"
    return str(size)


def _resize_image(path, target_size):
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Pillow is required for resizing. Install with: pip install pillow") from exc

    image_path = Path(path)
    with Image.open(image_path) as image:
        if image.size == (target_size, target_size):
            return
        image = image.convert("RGBA")
        resample = getattr(Image, "Resampling", Image).LANCZOS
        resized = image.resize((target_size, target_size), resample=resample)
        resized.save(image_path)


def resize_image(path, target_size):
    if not target_size:
        return
    _resize_image(path, target_size)


def convert_to_webp(
    source_path,
    output_path=None,
    *,
    target_size=None,
    quality=DEFAULT_WEBP_QUALITY,
    method=DEFAULT_WEBP_METHOD,
    lossless=False,
    remove_source=True,
):
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Pillow is required for WebP conversion.") from exc

    source_path = Path(source_path)
    if output_path is None:
        output_path = source_path.with_suffix(".webp")
    else:
        output_path = Path(output_path)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source_path) as image:
        if target_size:
            image = image.convert("RGBA")
            resample = getattr(Image, "Resampling", Image).LANCZOS
            image = image.resize((target_size, target_size), resample=resample)
        elif image.mode not in ("RGB", "RGBA"):
            has_alpha = "A" in image.getbands()
            image = image.convert("RGBA" if has_alpha else "RGB")
        save_kwargs = {
            "format": "WEBP",
            "quality": quality,
            "method": method,
        }
        if lossless:
            save_kwargs["lossless"] = True
        image.save(output_path, **save_kwargs)

    if remove_source:
        source_path.unlink(missing_ok=True)
    return output_path


def _log(message):
    print(message, flush=True)


def _request_images(payload, api_key):
    request = urllib.request.Request(
        DEFAULT_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    for attempt in range(1, DEFAULT_RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=DEFAULT_TIMEOUT) as response:
                body = response.read().decode("utf-8")
                data = json.loads(body)
                request_id = response.headers.get("x-request-id")
                return data, request_id
        except (urllib.error.HTTPError, urllib.error.URLError) as exc:
            if attempt == DEFAULT_RETRIES:
                if isinstance(exc, urllib.error.HTTPError):
                    detail = exc.read().decode("utf-8", errors="replace")
                    raise RuntimeError(
                        f"Images API request failed: {exc.code} {exc.reason}\n{detail}"
                    ) from exc
                raise RuntimeError(f"Images API request failed: {exc}") from exc
            time.sleep(2 ** (attempt - 1))

    raise RuntimeError("Images API request failed after retries.")


def _encode_multipart(fields, files):
    boundary = f"----openai-sprite-{int(time.time() * 1000)}"
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


def _request_edit(fields, files, api_key):
    boundary, body = _encode_multipart(fields, files)
    request = urllib.request.Request(
        DEFAULT_EDIT_URL,
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
                payload = response.read().decode("utf-8")
                data = json.loads(payload)
                request_id = response.headers.get("x-request-id")
                return data, request_id
        except (urllib.error.HTTPError, urllib.error.URLError) as exc:
            if attempt == DEFAULT_RETRIES:
                if isinstance(exc, urllib.error.HTTPError):
                    detail = exc.read().decode("utf-8", errors="replace")
                    raise RuntimeError(
                        f"Images API edit failed: {exc.code} {exc.reason}\n{detail}"
                    ) from exc
                raise RuntimeError(f"Images API edit failed: {exc}") from exc
            time.sleep(2 ** (attempt - 1))

    raise RuntimeError("Images API edit failed after retries.")


def generate_png(prompt, size, out_path):
    api_key = ensure_api_key()
    model = DEFAULT_MODEL

    target_size = _parse_target_size(size)
    size_value = _resolve_request_size(model, size)

    payload = {
        "model": model,
        "prompt": prompt,
        "size": size_value,
        "n": 1,
    }

    if is_gpt_image_model(model):
        payload["output_format"] = "png"
    else:
        payload["response_format"] = "b64_json"

    data, request_id = _request_images(payload, api_key)
    response_id = data.get("id")
    short_prompt = prompt if len(prompt) <= 140 else f"{prompt[:137]}..."
    _log(f"Images API ok request_id={request_id} response_id={response_id} prompt=\"{short_prompt}\"")

    image_data = data.get("data", [])
    if not image_data:
        raise RuntimeError("Images API returned no image data.")

    b64_json = image_data[0].get("b64_json")
    if not b64_json:
        raise RuntimeError("Images API response missing b64_json.")

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(base64.b64decode(b64_json))
    if target_size and is_gpt_image_model(model):
        _resize_image(out_path, target_size)


def generate_png_from_image(prompt, size, out_path, image_path):
    api_key = ensure_api_key()
    model = DEFAULT_MODEL

    target_size = _parse_target_size(size)
    size_value = _resolve_request_size(model, size)

    image_path = Path(image_path)
    if not image_path.exists():
        raise RuntimeError(f"Source image not found: {image_path}")

    fields = {"model": model, "prompt": prompt, "n": "1"}
    if size_value:
        fields["size"] = size_value
    if is_gpt_image_model(model):
        fields["background"] = "transparent"
        fields["output_format"] = "png"
    else:
        fields["response_format"] = "b64_json"

    files = [("image", image_path.name, "image/png", image_path.read_bytes())]

    data, request_id = _request_edit(fields, files, api_key)
    response_id = data.get("id")
    short_prompt = prompt if len(prompt) <= 140 else f"{prompt[:137]}..."
    _log(
        f"Images API edit ok request_id={request_id} response_id={response_id} "
        f"prompt=\"{short_prompt}\""
    )

    image_data = data.get("data", [])
    if not image_data:
        raise RuntimeError("Images API returned no image data.")

    b64_json = image_data[0].get("b64_json")
    if not b64_json:
        raise RuntimeError("Images API response missing b64_json.")

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(base64.b64decode(b64_json))
    if target_size and is_gpt_image_model(model):
        _resize_image(out_path, target_size)
