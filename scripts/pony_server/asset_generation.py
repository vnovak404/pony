import base64
import os
import sys
import time
from pathlib import Path

from .config import (
    DEFAULT_ASSET_GENERATED_ROOT,
    DEFAULT_ASSET_LIBRARY_ROOT,
    DEFAULT_ASSET_MANIFEST,
    ROOT,
)
from .io import load_data, save_data
from .utils import sanitize_value, slugify

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.sprites import images_api

DEFAULT_PROVIDER = "openai"
SUPPORTED_PROVIDERS = {"openai"}

ASSET_TYPE_CONFIG = {
    "tile": {"dir": "tilesets", "role": "tile", "size_key": "tile_size_px", "default_size": 64},
    "sprite": {"dir": "sprites", "role": "sprite", "size_key": "sprite_size_px", "default_size": 64},
    "icon": {"dir": "icons", "role": "icon", "size_key": "icon_size_px", "default_size": 32},
    "overlay": {"dir": "overlays", "role": "overlay", "size_key": "overlay_size_px", "default_size": 32},
    "hero": {"dir": "heroes", "role": "hero", "size_key": "hero_size_px", "default_size": 256},
    "minimap": {"dir": "minimaps", "role": "minimap", "size_key": "minimap_size_px", "default_size": 512},
}

PLACEHOLDER_PNG = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJ"
    "TYQAAAAASUVORK5CYII="
)
PLACEHOLDER_WEBP = "UklGRiIAAABXRUJQVlA4TCEAAAAvAAAAAAfQ//73v/+BiOh/AAA="


def _iso_timestamp():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _coerce_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _resolve_paths(asset_type, stage, slug, library_root, generated_root):
    config = ASSET_TYPE_CONFIG[asset_type]
    rel_dir = Path(config["dir"]) / stage
    library_dir = Path(library_root) / rel_dir
    generated_dir = Path(generated_root) / rel_dir
    webp_path = library_dir / f"{slug}.webp"
    png_path = generated_dir / f"{slug}.png"
    return config, webp_path, png_path


def _ensure_openai_key(env_file):
    if os.getenv("OPENAI_API_KEY"):
        return
    if env_file:
        key = images_api.load_env_value(env_file, "OPENAI_API_KEY")
        if key:
            os.environ["OPENAI_API_KEY"] = key


def _web_path(path):
    try:
        rel = Path(path).resolve().relative_to(ROOT)
        return f"/{rel.as_posix()}"
    except ValueError:
        return Path(path).as_posix()


def _reserve_slug(slug_base, existing_ids):
    slug = slug_base
    suffix = 1
    existing = set(existing_ids)
    while slug in existing:
        slug = f"{slug_base}-{suffix}"
        suffix += 1
    return slug


def _write_placeholder(path, encoded):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(base64.b64decode(encoded))


def generate_asset(
    payload,
    *,
    manifest_path=None,
    library_root=None,
    generated_root=None,
    env_file=None,
):
    if not isinstance(payload, dict):
        raise ValueError("Payload must be a JSON object.")

    provider = sanitize_value(payload.get("provider"), fallback=DEFAULT_PROVIDER, max_len=40)
    if provider not in SUPPORTED_PROVIDERS:
        raise ValueError(f"Provider '{provider}' is not configured.")

    asset_type = sanitize_value(payload.get("type"), fallback="", max_len=40)
    if asset_type not in ASSET_TYPE_CONFIG:
        raise ValueError("Unsupported asset type.")

    prompt = sanitize_value(payload.get("prompt"), fallback="", max_len=4000)
    if not prompt:
        raise ValueError("Prompt text is required.")

    title = sanitize_value(payload.get("title"), fallback=f"{asset_type.title()} Asset", max_len=120)
    system = sanitize_value(payload.get("system"), fallback="adventure_map", max_len=80)
    stage = sanitize_value(payload.get("stage"), fallback="generated", max_len=40)
    style = sanitize_value(payload.get("style"), fallback="storybook_fantasy", max_len=80)
    collection = sanitize_value(payload.get("collection"), fallback="asset_forge", max_len=80)
    prompt_profile = sanitize_value(payload.get("prompt_profile"), fallback="", max_len=80)
    prompt_base = sanitize_value(payload.get("prompt_base"), fallback="", max_len=4000)
    prompt_variant = sanitize_value(payload.get("prompt_variant"), fallback="", max_len=4000)
    alpha_correction = sanitize_value(payload.get("alpha_correction"), fallback="none", max_len=40)
    request_size = payload.get("request_size") or 1024
    target_override = _coerce_int(payload.get("target_size"))
    dry_run = bool(payload.get("dry_run"))

    base_slug = sanitize_value(payload.get("slug"), fallback="", max_len=120)
    if not base_slug:
        base_slug = slugify(title)
    if not base_slug:
        base_slug = f"{asset_type}-{int(time.time())}"

    manifest_path = Path(manifest_path or DEFAULT_ASSET_MANIFEST)
    library_root = Path(library_root or (ROOT / DEFAULT_ASSET_LIBRARY_ROOT)).resolve()
    generated_root = Path(generated_root or (ROOT / DEFAULT_ASSET_GENERATED_ROOT)).resolve()

    if not manifest_path.exists():
        raise ValueError("Asset manifest not found.")

    manifest = load_data(manifest_path)
    assets = manifest.get("assets") if isinstance(manifest, dict) else None
    if not isinstance(assets, list):
        assets = []
        manifest["assets"] = assets

    existing_ids = [entry.get("meta", {}).get("slug") for entry in assets if entry.get("meta")]
    slug = _reserve_slug(base_slug, [entry for entry in existing_ids if entry])
    config, webp_path, png_path = _resolve_paths(
        asset_type, stage, slug, library_root, generated_root
    )

    if dry_run:
        _write_placeholder(png_path, PLACEHOLDER_PNG)
        _write_placeholder(webp_path, PLACEHOLDER_WEBP)
    else:
        _ensure_openai_key(env_file)
        images_api.generate_png(prompt, request_size, png_path)
        images_api.convert_to_webp(
            png_path,
            output_path=webp_path,
            target_size=target_override or config["default_size"],
            remove_source=False,
        )

    asset_id = f"{slugify(system)}-{asset_type}-{slug}"
    preview_path = _web_path(webp_path)

    size_value = target_override or config["default_size"]
    meta = {
        "style": style,
        "alpha_correction": alpha_correction,
        "prompt_profile": prompt_profile or None,
        "source_format": "png",
        "target_format": "webp",
        config["size_key"]: size_value,
        "collection": collection,
        "provider": provider,
        "slug": slug,
    }
    meta = {key: value for key, value in meta.items() if value is not None}

    asset_entry = {
        "id": asset_id,
        "title": title,
        "system": system,
        "type": asset_type,
        "stage": stage,
        "script": "Asset Forge API",
        "source": {"path": str(png_path)},
        "preview": preview_path,
        "prompt": prompt,
        "prompt_profile": prompt_profile or None,
        "prompt_status": "ok",
        "prompt_base": prompt_base or None,
        "prompt_variant": prompt_variant or None,
        "meta": meta,
        "files": [
            {
                "role": config["role"],
                "label": slug,
                "path": preview_path,
            }
        ],
        "regenerate": {
            "notes": "Regenerate via Asset Forge API.",
            "provider": provider,
            "payload": {
                "provider": provider,
                "type": asset_type,
                "prompt": prompt,
                "title": title,
                "system": system,
                "stage": stage,
                "style": style,
                "collection": collection,
                "request_size": request_size,
                "target_size": size_value,
            },
        },
    }
    asset_entry = {key: value for key, value in asset_entry.items() if value is not None}

    assets.append(asset_entry)
    manifest["generated_at"] = _iso_timestamp()
    save_data(manifest_path, manifest)
    return asset_entry
