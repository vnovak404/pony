import unittest
from pathlib import Path
import tempfile

from scripts.pony_server.mission_save import _next_mission_index


class MissionSaveIndexTests(unittest.TestCase):
    def test_next_mission_index_uses_generated_folder(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            generated = root / "generated" / "mission-001"
            generated.mkdir(parents=True, exist_ok=True)
            (generated / "mission.json").write_text("{}", encoding="utf-8")
            self.assertEqual(_next_mission_index(root), 2)


if __name__ == "__main__":
    unittest.main()
