import argparse
import sys
from http import HTTPStatus

from ..config import ROOT
from ..generators import (
    launch_async,
    run_generator,
    run_post_create_tasks,
    run_sprite_generator,
    run_spritesheet_packer,
)
from ..io import load_data, load_json_body, save_data
from ..pony import (
    assign_house,
    build_pony,
    ensure_house_on_map,
    ensure_output_dir,
    ensure_pony_asset_dirs,
)
from ..utils import normalize_name


class PonyHandlerMixin:
    def _handle_sprite_actions(self):
        parts = self.path.strip("/").split("/")
        if len(parts) != 4 or parts[0] != "api" or parts[1] != "ponies":
            self.send_error(HTTPStatus.NOT_FOUND, "Not Found")
            return

        pony_id = parts[2]
        action = parts[3]
        if action not in {"sprites", "spritesheet"}:
            self.send_error(HTTPStatus.NOT_FOUND, "Not Found")
            return

        payload = load_json_body(self) or {}
        data_path = ROOT / self.data_path
        data = load_data(data_path)
        ponies = data.get("ponies", [])
        if not any(pony.get("slug") == pony_id for pony in ponies):
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Pony not found."})
            return

        try:
            if action == "sprites":
                result = run_sprite_generator(pony_id, payload)
                self.send_json(
                    HTTPStatus.OK,
                    {
                        "status": "ok",
                        "message": "Sprite frames generated.",
                        "pony": pony_id,
                        "output": result,
                    },
                )
                return

            result = run_spritesheet_packer(pony_id, payload)
            self.send_json(
                HTTPStatus.OK,
                {
                    "status": "ok",
                    "message": "Spritesheet packed.",
                    "pony": pony_id,
                    "output": result,
                },
            )
        except Exception as exc:
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": str(exc)},
            )
        return

    def _handle_create_pony(self):
        payload = load_json_body(self)
        if payload is None:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "Invalid JSON body."},
            )
            return

        data_path = ROOT / self.data_path
        data = load_data(data_path)
        ponies = data.get("ponies", [])

        pony = build_pony(payload)
        if not pony["slug"]:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "Pony name is required."},
            )
            return

        normalized_name = normalize_name(pony["name"])
        if any(normalize_name(existing.get("name", "")) == normalized_name for existing in ponies):
            self.send_json(
                HTTPStatus.CONFLICT,
                {"error": "A pony with that name already exists."},
            )
            return

        if any(existing.get("slug") == pony["slug"] for existing in ponies):
            self.send_json(
                HTTPStatus.CONFLICT,
                {"error": "A pony with that name already exists."},
            )
            return

        house_id, _is_new_house = assign_house(ponies, pony)

        ponies.append(pony)
        data["ponies"] = ponies

        try:
            save_data(data_path, data)
            try:
                residents = [
                    entry.get("name")
                    for entry in ponies
                    if (entry.get("house") or {}).get("id") == house_id
                ]
                if residents:
                    ensure_house_on_map(
                        ROOT / self.map_path,
                        pony.get("house", {}),
                        residents,
                    )
            except Exception as exc:
                print(f"Map update failed for {pony['slug']}: {exc}", file=sys.stderr)
            ensure_output_dir(self.output_dir)
            ensure_pony_asset_dirs(pony["slug"])
            run_generator(
                argparse.Namespace(
                    data=self.data_path,
                    output_dir=self.output_dir,
                    env_file=self.env_file,
                ),
                pony["slug"],
            )
        except Exception as exc:
            ponies.pop()
            data["ponies"] = ponies
            save_data(data_path, data)
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": str(exc)},
            )
            return

        generate_variants = True
        launch_async(run_post_create_tasks, pony["slug"], generate_variants, self.env_file)

        image_path = f"{self.output_dir}/{pony['slug']}.webp"
        self.send_json(
            HTTPStatus.CREATED,
            {"pony": pony, "image_path": image_path},
        )
        return
