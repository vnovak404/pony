#!/usr/bin/env python3
import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

DEFAULT_MODEL = "gpt-image-1"
DEFAULT_SIZE = "1024x1024"
DEFAULT_QUALITY = "auto"
DEFAULT_API_URL = "https://api.openai.com/v1/images/generations"
DEFAULT_ENV_PATH = ".env"


def load_pony_data(path):
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    style = data.get("style", {})
    ponies = data.get("ponies", [])
    return style, ponies


def is_gpt_image_model(model):
    return bool(model) and model.startswith("gpt-image-")


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


def slugify(name):
    return "-".join(
        "".join(ch.lower() if ch.isalnum() else " " for ch in name).split()
    )


def build_prompt(pony, style, extra_prompt):
    style_prompt = style.get(
        "prompt",
        "Cheerful children's book illustration, bright and friendly, clean outlines, soft shading.",
    )
    background = style.get(
        "background",
        "Soft pastel meadow with a few sparkles and simple clouds.",
    )
    palette = style.get("palette", "yellow and purple")

    name = pony.get("name", "Unknown")
    species = pony.get("species", "pony")
    body_color = pony.get("body_color", "pastel yellow")
    mane_color = pony.get("mane_color", "lavender")
    accent_color = pony.get("accent_color", "cream")
    talent = pony.get("talent", "making friends")
    personality = pony.get("personality", "kind and curious")

    lines = [
        style_prompt,
        f"Character: {name}, a {species}.",
        f"Body color: {body_color}.",
        f"Mane color: {mane_color}.",
        f"Accent color: {accent_color}.",
        f"Personality: {personality}.",
        f"Talent: {talent}.",
        f"Palette: {palette}.",
        f"Background: {background}.",
        "Full body, standing, smiling, side view facing right.",
        "No text, no watermark.",
    ]

    if species.lower() == "unicorn":
        lines.append("Include a small, friendly unicorn horn.")

    if extra_prompt:
        lines.append(extra_prompt)

    return " ".join(lines)


def request_images(api_url, api_key, prompt, model, size, quality, count):
    payload = {"model": model, "prompt": prompt, "size": size, "n": count}
    if quality and quality != "auto":
        payload["quality"] = quality
    if not is_gpt_image_model(model):
        payload["response_format"] = "b64_json"

    request = urllib.request.Request(
        api_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            body = response.read().decode("utf-8")
            data = json.loads(body)
            return data.get("data", [])
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        message = f"Request failed: {exc.code} {exc.reason}\n{detail}"
        if exc.code == 404:
            message += (
                "\nCheck the API URL. For OpenAI use "
                "https://api.openai.com/v1/images/generations."
            )
        raise RuntimeError(message) from exc


def save_images(image_data, output_dir, slug, overwrite):
    paths = []
    for idx, entry in enumerate(image_data, start=1):
        b64_json = entry.get("b64_json")
        url = entry.get("url")
        if not b64_json:
            if not url:
                continue
        suffix = f"-{idx}" if len(image_data) > 1 else ""
        filename = f"{slug}{suffix}.png"
        path = os.path.join(output_dir, filename)
        if os.path.exists(path) and not overwrite:
            print(f"Skipping existing file: {path}")
            continue
        if b64_json:
            with open(path, "wb") as handle:
                handle.write(base64.b64decode(b64_json))
        else:
            try:
                with urllib.request.urlopen(url, timeout=120) as response:
                    content = response.read()
                with open(path, "wb") as handle:
                    handle.write(content)
            except urllib.error.URLError as exc:
                print(f"Failed to download image for {slug}: {exc}")
                continue
        paths.append(path)
    return paths


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate pony/unicorn images using the OpenAI Images API."
    )
    parser.add_argument(
        "--data",
        default="data/ponies.json",
        help="Path to pony data JSON (default: data/ponies.json).",
    )
    parser.add_argument(
        "--output-dir",
        default="assets/ponies",
        help="Directory for generated images (default: assets/ponies).",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"Image model to use (default: {DEFAULT_MODEL}).",
    )
    parser.add_argument(
        "--size",
        default=DEFAULT_SIZE,
        help=f"Image size (default: {DEFAULT_SIZE}).",
    )
    parser.add_argument(
        "--quality",
        default=DEFAULT_QUALITY,
        help=f"Image quality (default: {DEFAULT_QUALITY}).",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=1,
        help="Images per pony (default: 1).",
    )
    parser.add_argument(
        "--only",
        default="",
        help="Comma-separated list of pony slugs to generate.",
    )
    parser.add_argument(
        "--extra-prompt",
        default="",
        help="Extra prompt text appended to every request.",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.0,
        help="Seconds to sleep between requests (default: 0).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print prompts without calling the API.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing images.",
    )
    parser.add_argument(
        "--env-file",
        default=DEFAULT_ENV_PATH,
        help=f"Path to .env file (default: {DEFAULT_ENV_PATH}).",
    )
    parser.add_argument(
        "--api-url",
        default=DEFAULT_API_URL,
        help=f"Images API URL (default: {DEFAULT_API_URL}).",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    api_key = os.getenv("OPENAI_API_KEY") or load_env_value(
        args.env_file, "OPENAI_API_KEY"
    )
    if not api_key and not args.dry_run:
        print("Missing OPENAI_API_KEY in the environment.")
        return 1

    style, ponies = load_pony_data(args.data)
    if not ponies:
        print("No ponies found in data file.")
        return 1

    only = {slug.strip() for slug in args.only.split(",") if slug.strip()}
    os.makedirs(args.output_dir, exist_ok=True)
    api_url = args.api_url
    model = args.model

    for pony in ponies:
        slug = pony.get("slug") or slugify(pony.get("name", "pony"))
        if only and slug not in only:
            continue

        prompt = build_prompt(pony, style, args.extra_prompt)
        if args.dry_run:
            print(f"[{slug}] {prompt}\n")
            continue

        print(f"Generating image for {slug}...")
        image_data = request_images(
            api_url,
            api_key,
            prompt,
            model,
            args.size,
            args.quality,
            args.count,
        )
        paths = save_images(image_data, args.output_dir, slug, args.overwrite)
        for path in paths:
            print(f"Saved {path}")

        if args.sleep > 0:
            time.sleep(args.sleep)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
