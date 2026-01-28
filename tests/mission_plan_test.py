import os
import tempfile
import unittest
from pathlib import Path

from scripts.pony_server.mission_plan import _extract_tool_args, request_mission_plan
from scripts.pony_server.mission_constants import MissionPlanError


class MissionPlanParsingTests(unittest.TestCase):
    def test_extract_tool_args_from_function_call(self):
        response = {
            "output": [
                {
                    "type": "function_call",
                    "name": "submit_mission_plan",
                    "arguments": "{\"title\":\"Test\",\"summary\":\"Ok\"}",
                }
            ]
        }
        plan = _extract_tool_args(response)
        self.assertEqual(plan["title"], "Test")
        self.assertEqual(plan["summary"], "Ok")

    def test_extract_tool_args_missing(self):
        response = {"output": []}
        with self.assertRaises(MissionPlanError):
            _extract_tool_args(response)

    def test_extract_tool_args_incomplete(self):
        response = {
            "status": "incomplete",
            "incomplete_details": {"reason": "max_output_tokens"},
            "output": [],
        }
        with self.assertRaises(MissionPlanError):
            _extract_tool_args(response)

    def test_default_plan_used_when_cache_missing(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            default_path = tmp_path / "default.json"
            cache_path = tmp_path / "last.json"
            default_path.write_text("{\"title\":\"Default Plan\"}", encoding="utf-8")
            original_key = os.environ.pop("OPENAI_API_KEY", None)
            try:
                plan, meta = request_mission_plan(
                    "vibe",
                    seed="seed",
                    manifest={"assets": []},
                    cache_only=True,
                    cache_path=cache_path,
                    default_path=default_path,
                )
            finally:
                if original_key:
                    os.environ["OPENAI_API_KEY"] = original_key
            self.assertEqual(plan.get("title"), "Default Plan")
            self.assertEqual(meta.get("source"), "default")


if __name__ == "__main__":
    unittest.main()
