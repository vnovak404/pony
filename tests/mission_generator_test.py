import sys
import unittest
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from scripts.pony_server.mission_generator import validate_mission
from scripts.pony_server.mission_core import generate_mission


def build_bundle():
    tiles = {"tiles": [{"id": 0, "name": "grass", "walkable": True, "color": "#ffffff"}]}
    objects = {
        "objects": [
            {"type": "npc", "name": "Friendly NPC", "class": "creature", "categories": []},
            {"type": "apple_tree", "name": "Apple Tree", "class": "structure", "categories": ["apple_tree"]},
        ]
    }
    map_data = {
        "width": 3,
        "height": 3,
        "tiles": [0] * 9,
        "spawn": {"tx": 1, "ty": 1},
        "objects": [
            {"id": "objective_1", "type": "npc", "x": 2, "y": 1},
            {"id": "tree_1", "type": "apple_tree", "x": 0, "y": 1},
            {"id": "tree_2", "type": "apple_tree", "x": 1, "y": 2},
        ],
    }
    mission = {
        "version": 1,
        "seed": "test",
        "vibe": "test",
        "title": "Test",
        "subtitle": "Test",
        "tileSize": 64,
        "layout": {"biome": "forest", "size": {"w": 3, "h": 3}},
        "objectives": [
            {"type": "talk_count", "label": "Talk", "targetCount": 1, "targetId": "objective_1"}
        ],
        "zones": [],
        "interactions": [
            {"targetId": "objective_1", "action": "talk", "dialog": "intro"}
        ],
        "triggers": {"onEnterZones": []},
        "dialog": {
            "nodes": [
                {"id": "intro", "speaker": "Narrator", "text": ["Hello"], "choices": []}
            ],
            "startByTarget": {"objective_1": "intro"},
            "entry": "intro",
        },
        "narrative": {
            "intro": {"text": ["A new mission starts."]},
            "outro": {"text": ["Mission done."]},
            "onEnterZones": [],
            "onInteract": [],
        },
        "flags": {"local": {}, "global": {}},
        "checkpoints": [
            {"id": "start", "label": "Start", "tx": 1, "ty": 1},
            {"id": "objective", "label": "Objective", "targetId": "objective_1"},
        ],
    }
    return {"mission": mission, "map": map_data, "tiles": tiles, "objects": objects}


class MissionGeneratorValidationTests(unittest.TestCase):
    def test_valid_bundle_passes(self):
        bundle = build_bundle()
        errors = validate_mission(bundle)
        self.assertEqual(errors, [])

    def test_dialog_reachability(self):
        bundle = build_bundle()
        bundle["mission"]["dialog"]["nodes"].append(
            {"id": "orphan", "speaker": "Ghost", "text": ["..."]}
        )
        errors = validate_mission(bundle)
        self.assertTrue(any("unreachable" in err for err in errors))

    def test_start_by_target_is_entry_point(self):
        bundle = build_bundle()
        bundle["mission"]["dialog"]["entry"] = None
        bundle["mission"]["interactions"] = []
        bundle["mission"]["triggers"]["onEnterZones"] = []
        errors = validate_mission(bundle)
        self.assertFalse(any("unreachable" in err for err in errors))

    def test_checkpoint_bounds(self):
        bundle = build_bundle()
        bundle["mission"]["checkpoints"].append({"id": "bad", "tx": 9, "ty": 9})
        errors = validate_mission(bundle)
        self.assertTrue(any("Checkpoint" in err and "out of bounds" in err for err in errors))

    def test_objective_target_count_requires_ids(self):
        bundle = build_bundle()
        bundle["mission"]["objectives"] = [
            {"type": "interact_count", "label": "Collect", "targetCount": 2}
        ]
        errors = validate_mission(bundle)
        self.assertTrue(any("targetIds" in err for err in errors))

    def test_target_category_requires_matching_ids(self):
        bundle = build_bundle()
        bundle["mission"]["objectives"] = [
            {
                "type": "interact_count",
                "label": "Collect apples",
                "targetCount": 2,
                "targetCategory": "apple_tree",
                "targetIds": ["tree_1", "tree_2"],
            }
        ]
        bundle["mission"]["interactions"] = [
            {"targetId": "tree_1", "action": "interact"},
            {"targetId": "tree_2", "action": "interact"},
        ]
        errors = validate_mission(bundle)
        self.assertEqual(errors, [])

        bundle["mission"]["objectives"][0]["targetIds"] = ["tree_1", "objective_1"]
        errors = validate_mission(bundle)
        self.assertTrue(any("targetCategory" in err for err in errors))

    def test_generate_mission_fills_target_ids_for_category(self):
        manifest = {
            "assets": [
                {
                    "type": "tile",
                    "id": "tile-grass",
                    "title": "Grass",
                    "files": [{"path": "grass.webp", "label": "grass"}],
                    "meta": {"tileset": "adventure_base", "slug": "grass"},
                },
                {
                    "type": "sprite",
                    "id": "sprite-squirrel",
                    "title": "Squirrel",
                    "files": [{"path": "squirrel.webp", "label": "squirrel"}],
                    "meta": {"collection": "adventure_base", "slug": "squirrel"},
                },
            ]
        }
        plan = {
            "vibe": "test",
            "title": "Test",
            "layout": {"biome": "forest", "size": {"w": 8, "h": 8}},
            "objectives": [
                {
                    "type": "heal_count",
                    "label": "Heal squirrel",
                    "targetCount": 1,
                    "targetId": "animal_squirrel_1",
                    "targetCategory": "squirrel",
                }
            ],
            "interactions": [{"targetId": "animal_squirrel_1", "action": "heal"}],
            "zones": [],
            "triggers": {"onEnterZones": []},
            "dialog": {"nodes": [], "startByTarget": [], "entry": None},
            "narrative": {
                "intro": {"text": ["A new mission starts."]},
                "outro": {"text": ["Mission done."]},
                "onEnterZones": [],
                "onInteract": [],
            },
            "flags": {"local": [], "global": []},
            "checkpoints": [{"id": "start", "tx": 0, "ty": 0}],
        }
        bundle = generate_mission(plan, seed=123, manifest=manifest)
        mission = bundle["mission"]
        objective = mission["objectives"][0]
        self.assertEqual(objective.get("targetIds"), ["animal_squirrel_1"])
        self.assertEqual(objective.get("targetCount"), 1)

    def test_generate_mission_creates_missing_dialog_nodes(self):
        manifest = {
            "assets": [
                {
                    "type": "tile",
                    "id": "tile-grass",
                    "title": "Grass",
                    "files": [{"path": "grass.webp", "label": "grass"}],
                    "meta": {"tileset": "adventure_base", "slug": "grass"},
                }
            ]
        }
        plan = {
            "vibe": "test",
            "title": "Dialog Fill",
            "layout": {"biome": "forest", "size": {"w": 6, "h": 6}},
            "objectives": [
                {"type": "interact_count", "label": "Inspect", "targetCount": 1, "targetId": "obj_1"}
            ],
            "interactions": [{"targetId": "obj_1", "action": "interact", "dialog": "missing_node"}],
            "zones": [],
            "triggers": {"onEnterZones": []},
            "dialog": {"nodes": [], "startByTarget": [], "entry": None},
            "narrative": {
                "intro": {"text": ["A new mission starts."], "dialog": "missing_node"},
                "outro": {"text": ["Mission done."], "dialog": None},
                "onEnterZones": [],
                "onInteract": [],
            },
            "flags": {"local": [], "global": []},
            "checkpoints": [{"id": "start", "tx": 0, "ty": 0}],
        }
        bundle = generate_mission(plan, seed=7, manifest=manifest)
        node_ids = {node.get("id") for node in bundle["mission"]["dialog"]["nodes"]}
        self.assertIn("missing_node", node_ids)

    def test_generated_mission_targets_are_reachable(self):
        manifest = {
            "assets": [
                {
                    "type": "tile",
                    "id": "tile-grass",
                    "title": "Grass",
                    "files": [{"path": "grass.webp", "label": "grass"}],
                    "meta": {"tileset": "adventure_base", "slug": "grass"},
                },
                {
                    "type": "tile",
                    "id": "tile-road",
                    "title": "Road",
                    "files": [{"path": "road.webp", "label": "road"}],
                    "meta": {"tileset": "adventure_base", "slug": "road"},
                },
                {
                    "type": "sprite",
                    "id": "sprite-owl",
                    "title": "Owl",
                    "files": [{"path": "owl.webp", "label": "owl"}],
                    "meta": {"collection": "adventure_base", "slug": "owl", "class": "creature"},
                },
                {
                    "type": "sprite",
                    "id": "sprite-rune",
                    "title": "Rune Stone",
                    "files": [{"path": "rune.webp", "label": "rune"}],
                    "meta": {"collection": "adventure_base", "slug": "rune", "class": "prop"},
                },
            ]
        }
        plan = {
            "vibe": "test",
            "title": "Reachable",
            "layout": {"biome": "forest", "size": {"w": 16, "h": 12}},
            "objectives": [
                {
                    "type": "talk_count",
                    "label": "Talk",
                    "targetCount": 1,
                    "targetId": "npc_owl_1",
                },
                {
                    "type": "magic_count",
                    "label": "Soften runes",
                    "targetCount": 2,
                    "targetIds": ["rune_1", "rune_2"],
                },
            ],
            "interactions": [
                {"targetId": "npc_owl_1", "action": "talk", "dialog": "dlg_owl"},
                {"targetId": "rune_1", "action": "magic", "dialog": "dlg_rune"},
                {"targetId": "rune_2", "action": "magic", "dialog": "dlg_rune"},
            ],
            "zones": [],
            "triggers": {"onEnterZones": []},
            "dialog": {"nodes": [{"id": "dlg_owl", "speaker": None, "text": ["hi"], "choices": []}], "startByTarget": [], "entry": None},
            "narrative": {
                "intro": {"text": ["A new mission starts."]},
                "outro": {"text": ["Mission done."]},
                "onEnterZones": [],
                "onInteract": [],
            },
            "flags": {"local": [], "global": []},
            "checkpoints": [{"id": "start", "tx": 0, "ty": 0}],
        }
        bundle = generate_mission(plan, seed=42, manifest=manifest)
        errors = validate_mission(bundle)
        self.assertFalse(any("not reachable" in err for err in errors))


if __name__ == "__main__":
    unittest.main()
