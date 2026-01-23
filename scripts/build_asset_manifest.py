#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.generate_adventure_assets import (  # noqa: E402
    HERO_PROMPTS,
    ICON_PROMPTS,
    OVERLAY_ICON_PROMPTS,
    OVERLAY_PROMPTS,
    SPRITE_PROMPTS,
    TILE_PROMPTS,
    TREE_PROMPTS,
)


def parse_args():
    parser = argparse.ArgumentParser(description="Build the centralized asset manifest JSON.")
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "assets" / "library" / "manifest.json",
        help="Output manifest path (default: assets/library/manifest.json).",
    )
    parser.add_argument(
        "--library-root",
        type=Path,
        default=ROOT / "assets" / "library" / "maps",
        help="Asset library root (default: assets/library/maps).",
    )
    return parser.parse_args()


def rel(path):
    return "/" + str(Path(path).resolve().relative_to(ROOT).as_posix())


def list_webp(directory):
    return sorted(Path(directory).glob("*.webp"))


def read_prompt_variations(path):
    try:
        with Path(path).open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError:
        return None
    base_prompt = str(data.get("base_prompt", "")).strip()
    variants = {}
    for entry in data.get("variants", []) or []:
        variant_id = str(entry.get("id", "")).strip() or "01"
        variants[variant_id] = str(entry.get("prompt", "")).strip()
    return {
        "base_prompt": base_prompt,
        "variants": variants,
    }


def prompt_profile():
    return {
        "summary": "Shared prompt guidance for isometric/top-down adventure maps.",
        "prompt": (
            "Isometric/top-down adventure style, storybook fantasy palette, "
            "no text, no borders, clean silhouettes, consistent lighting."
        ),
    }


def build_regenerate_command(script, flag, name, extra=None):
    parts = ["python3", script, flag, name, "--force"]
    if extra:
        parts.extend(extra)
    return " ".join(parts)


def build_manifest(library_root):
    base_meta = {
        "style": "storybook_fantasy",
        "alpha_correction": "none",
        "prompt_profile": "isometric_topdown",
        "source_format": "png",
        "target_format": "webp",
    }
    manifest = {
        "schema_version": 2,
        "generated_at": "manual",
        "prompt_profiles": {"isometric_topdown": prompt_profile()},
        "assets": [],
    }

    assets = manifest["assets"]

    def add_asset(**payload):
        assets.append(payload)

    def add_webp_assets(
        directory,
        *,
        system,
        type_label,
        stage,
        script,
        collection,
        source_path,
        meta,
        role,
        title_prefix,
        prompt_lookup=None,
        prompt_source=None,
        regen_builder=None,
    ):
        for path in list_webp(directory):
            label = path.stem
            prompt = prompt_lookup.get(label) if prompt_lookup else None
            prompt_status = "ok" if prompt else "missing"
            regenerate = None
            if regen_builder and prompt:
                regenerate = regen_builder(label)
            add_asset(
                id=f"{collection}-{type_label}-{label}",
                title=f"{title_prefix}: {label.replace('-', ' ').replace('_', ' ')}",
                system=system,
                type=type_label,
                stage=stage,
                script=script,
                source={"path": source_path},
                preview=rel(path),
                prompt=prompt,
                prompt_profile=meta.get("prompt_profile"),
                prompt_status=prompt_status,
                prompt_source=prompt_source,
                regenerate=regenerate,
                meta={**meta, "collection": collection},
                files=[{"role": role, "label": label, "path": rel(path)}],
            )

    tile_prompts = {**TILE_PROMPTS, **OVERLAY_PROMPTS}

    add_webp_assets(
        library_root / "tilesets" / "packed" / "base",
        system="adventure_map",
        type_label="tile",
        stage="packed",
        script="scripts/generate_adventure_assets.py",
        collection="adventure_base",
        source_path="adventures/tiles",
        meta={**base_meta, "tile_size_px": 64, "tileset": "adventure_base"},
        role="tile",
        title_prefix="Base Tile",
        prompt_lookup=tile_prompts,
        prompt_source="scripts/generate_adventure_assets.py:TILE_PROMPTS/OVERLAY_PROMPTS",
        regen_builder=lambda name: {
            "command": build_regenerate_command(
                "scripts/generate_adventure_assets.py", "--tile", name
            ),
            "notes": "Uses generate_adventure_assets tile prompts.",
        },
    )

    def overlay_regen(name):
        if name in TREE_PROMPTS:
            return {
                "command": build_regenerate_command(
                    "scripts/generate_adventure_assets.py", "--tree", name
                ),
                "notes": "Tree overlays are generated via --tree.",
            }
        return {
            "command": build_regenerate_command(
                "scripts/generate_adventure_assets.py", "--overlay", name
            ),
            "notes": "Overlay icons and borders are generated via --overlay.",
        }

    overlay_prompts = {**OVERLAY_PROMPTS, **OVERLAY_ICON_PROMPTS, **TREE_PROMPTS}

    add_webp_assets(
        library_root / "overlays" / "packed" / "base",
        system="adventure_map",
        type_label="overlay",
        stage="packed",
        script="scripts/generate_adventure_assets.py",
        collection="adventure_base",
        source_path="adventures/overlays",
        meta={**base_meta, "overlay_size_px": "varies"},
        role="overlay",
        title_prefix="Base Overlay",
        prompt_lookup=overlay_prompts,
        prompt_source="scripts/generate_adventure_assets.py:OVERLAY_PROMPTS/TREE_PROMPTS/OVERLAY_ICON_PROMPTS",
        regen_builder=overlay_regen,
    )

    add_webp_assets(
        library_root / "icons" / "packed" / "base",
        system="adventure_map",
        type_label="icon",
        stage="packed",
        script="scripts/generate_adventure_assets.py",
        collection="adventure_base",
        source_path="adventures/icons",
        meta={**base_meta, "icon_size_px": 32},
        role="icon",
        title_prefix="Base Icon",
        prompt_lookup=ICON_PROMPTS,
        prompt_source="scripts/generate_adventure_assets.py:ICON_PROMPTS",
        regen_builder=lambda name: {
            "command": build_regenerate_command(
                "scripts/generate_adventure_assets.py", "--icon", name
            ),
            "notes": "Uses generate_adventure_assets icon prompts.",
        },
    )

    add_webp_assets(
        library_root / "heroes" / "packed" / "base",
        system="adventure_map",
        type_label="hero",
        stage="packed",
        script="scripts/generate_adventure_assets.py",
        collection="adventure_base",
        source_path="adventures/heroes",
        meta={**base_meta, "hero_size_px": 256},
        role="hero",
        title_prefix="Base Hero",
        prompt_lookup=HERO_PROMPTS,
        prompt_source="scripts/generate_adventure_assets.py:HERO_PROMPTS",
        regen_builder=lambda name: {
            "command": build_regenerate_command(
                "scripts/generate_adventure_assets.py", "--hero", name
            ),
            "notes": "Uses generate_adventure_assets hero prompts.",
        },
    )

    add_webp_assets(
        library_root / "sprites" / "packed" / "base",
        system="adventure_map",
        type_label="sprite",
        stage="packed",
        script="scripts/generate_adventure_assets.py",
        collection="adventure_base",
        source_path="adventures/sprites",
        meta={**base_meta, "sprite_size_px": "varies"},
        role="sprite",
        title_prefix="Base Sprite",
        prompt_lookup=SPRITE_PROMPTS,
        prompt_source="scripts/generate_adventure_assets.py:SPRITE_PROMPTS",
        regen_builder=lambda name: {
            "command": build_regenerate_command(
                "scripts/generate_adventure_assets.py", "--sprite", name
            ),
            "notes": "Uses generate_adventure_assets sprite prompts.",
        },
    )

    add_webp_assets(
        library_root / "tilesets" / "packed" / "stellacorn" / "mission1" / "terrain",
        system="adventure_map",
        type_label="tile",
        stage="packed",
        script="manual",
        collection="stellacorn_mission1_tiles",
        source_path="adventures/missions/stellacorn/mission1/adventures/tiles/terrain",
        meta={**base_meta, "tile_size_px": "varies", "tileset": "stellacorn_adventure"},
        role="tile",
        title_prefix="Mission 1 Tile",
        prompt_lookup=None,
    )

    add_asset(
        id="stellacorn-mission1-tileset-data",
        title="Mission 1 Tile Definitions",
        system="adventure_map",
        type="tile-data",
        stage="data",
        script="manual",
        source={"mission": "stellacorn/mission1", "path": "adventures/missions/stellacorn/mission1/data"},
        preview=rel(
            library_root
            / "tilesets"
            / "packed"
            / "stellacorn"
            / "mission1"
            / "terrain"
            / "plains_grass_v2.webp"
        ),
        prompt=None,
        prompt_status="missing",
        prompt_profile=base_meta["prompt_profile"],
        meta={**base_meta, "collection": "stellacorn_mission1_tiles"},
        files=[
            {
                "role": "tile_definitions",
                "path": rel(
                    library_root
                    / "tilesets"
                    / "packed"
                    / "stellacorn"
                    / "mission1"
                    / "adventure_tiles.json"
                ),
            }
        ],
    )

    add_asset(
        id="stellacorn-mission1-objects-data",
        title="Mission 1 Object Definitions",
        system="adventure_map",
        type="map-data",
        stage="data",
        script="manual",
        source={"mission": "stellacorn/mission1", "path": "adventures/missions/stellacorn/mission1/data"},
        preview=rel(
            library_root
            / "minimaps"
            / "packed"
            / "stellacorn"
            / "mission1"
            / "stellacorn-whispering-forest.webp"
        ),
        prompt=None,
        prompt_status="missing",
        prompt_profile=base_meta["prompt_profile"],
        meta={**base_meta, "collection": "stellacorn_mission1"},
        files=[
            {
                "role": "objects_json",
                "path": rel(
                    library_root / "data" / "stellacorn" / "mission1" / "adventure_objects.json"
                ),
            }
        ],
    )

    add_webp_assets(
        library_root / "sprites" / "packed" / "stellacorn" / "mission1",
        system="adventure_map",
        type_label="sprite",
        stage="packed",
        script="manual",
        collection="stellacorn_mission1_sprites",
        source_path="adventures/missions/stellacorn/mission1/adventures/sprites/mission1",
        meta={**base_meta, "sprite_size_px": "varies"},
        role="sprite",
        title_prefix="Mission 1 Sprite",
        prompt_lookup=None,
    )

    prompt_variations = read_prompt_variations(
        ROOT / "adventures" / "missions" / "stellacorn" / "mission2" / "prompts" / "corrupted-oak.json"
    )
    variation_prompts = {}
    if prompt_variations:
        for variant_id, variant_prompt in prompt_variations["variants"].items():
            variation_prompts[variant_id] = {
                "base": prompt_variations["base_prompt"],
                "variant": variant_prompt,
                "prompt": f"{prompt_variations['base_prompt']} {variant_prompt}".strip(),
            }

    for path in list_webp(
        library_root / "sprites" / "packed" / "stellacorn" / "mission2"
    ):
        label = path.stem
        parts = label.split("-")
        variant_id = parts[-1] if parts else ""
        prompt_data = variation_prompts.get(variant_id, {})
        prompt = prompt_data.get("prompt")
        add_asset(
            id=f"stellacorn-mission2-sprite-{label}",
            title=f"Mission 2 Sprite: {label.replace('-', ' ')}",
            system="adventure_map",
            type="sprite",
            stage="packed",
            script="scripts/generate_prompt_variations.py",
            source={
                "mission": "stellacorn/mission2",
                "path": "adventures/missions/stellacorn/mission2/adventures/sprites/mission2",
            },
            preview=rel(path),
            prompt=prompt,
            prompt_base=prompt_data.get("base"),
            prompt_variant=prompt_data.get("variant"),
            prompt_profile=base_meta["prompt_profile"],
            prompt_status="ok" if prompt else "missing",
            prompt_source="adventures/missions/stellacorn/mission2/prompts/corrupted-oak.json",
            regenerate={
                "command": (
                    "python3 scripts/generate_prompt_variations.py "
                    "--prompt-json adventures/missions/stellacorn/mission2/prompts/corrupted-oak.json "
                    "--force"
                ),
                "notes": "Regenerates all corrupted-oak variants.",
            }
            if prompt
            else None,
            meta={**base_meta, "collection": "stellacorn_mission2_sprites"},
            files=[{"role": "sprite", "label": label, "path": rel(path)}],
        )

    add_asset(
        id="stellacorn-mission1-minimap",
        title="Mission 1 Minimap",
        system="adventure_map",
        type="minimap",
        stage="packed",
        script="manual",
        source={"mission": "stellacorn/mission1", "path": "adventures/missions/stellacorn"},
        preview=rel(
            library_root
            / "minimaps"
            / "packed"
            / "stellacorn"
            / "mission1"
            / "stellacorn-whispering-forest.webp"
        ),
        prompt=None,
        prompt_status="missing",
        prompt_profile=base_meta["prompt_profile"],
        meta={**base_meta, "collection": "stellacorn_mission1", "minimap_size_px": "varies"},
        files=[
            {
                "role": "minimap",
                "path": rel(
                    library_root
                    / "minimaps"
                    / "packed"
                    / "stellacorn"
                    / "mission1"
                    / "stellacorn-whispering-forest.webp"
                ),
            }
        ],
    )

    add_asset(
        id="stellacorn-mission1-map-draft",
        title="Mission 1 Map Draft",
        system="adventure_map",
        type="map-export",
        stage="draft",
        script="manual",
        source={
            "mission": "stellacorn/mission1",
            "path": "adventures/missions/stellacorn/mission1/adventures/maps/_drafts",
        },
        preview=rel(
            library_root
            / "minimaps"
            / "packed"
            / "stellacorn"
            / "mission1"
            / "stellacorn-whispering-forest.webp"
        ),
        prompt=None,
        prompt_status="missing",
        prompt_profile=base_meta["prompt_profile"],
        meta={**base_meta, "collection": "stellacorn_mission1"},
        files=[
            {
                "role": "map_json",
                "path": rel(
                    library_root
                    / "exports"
                    / "drafts"
                    / "stellacorn"
                    / "mission1"
                    / "stellacorn-mission1-map-6.json"
                ),
            }
        ],
    )

    return manifest


def main():
    args = parse_args()
    manifest = build_manifest(args.library_root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    print(f"Wrote {len(manifest['assets'])} assets to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
