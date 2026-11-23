import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server as desk


class DeskTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        db = patch.object(desk, "DB", Path(temp.name) / "db.sqlite")
        db.start()
        self.addCleanup(db.stop)
        desk.setup()

    def test_confirm_and_retry(self):
        proposal = desk.state()["proposals"][1]
        desk.decide(proposal["id"], "approve", "ORD-1086")
        with self.assertRaises(ValueError):
            desk.decide(proposal["id"], "approve", "ORD-1086")
        state = desk.state()
        self.assertEqual(state["orders"][1]["install"], "2026-11-27")
        self.assertEqual(len(state["audit"]), 1)

    def test_ambiguous_match(self):
        title, body, _ = desk.EXAMPLES[2]
        mid = desk.ingest(title, body, desk.DAY)
        self.assertEqual(mid, desk.ingest(title, body, desk.DAY))
        p = desk.state()["proposals"][-1]
        with self.assertRaises(ValueError):
            desk.decide(p["id"], "approve", None)
        desk.decide(p["id"], "approve", "ORD-1184")
        self.assertEqual(desk.state()["tasks"][0]["oid"], "ORD-1184")

    def test_model_validation(self):
        body = "Tentative for Front St."
        action = dict(site="Front St", city="Toronto", kind="clarify", quote=body, target="")
        with patch.object(desk, "MODEL", "test-model"):
            for valid in [True, False]:
                if not valid:
                    action["quote"] = "Confirmed."
                content = json.dumps({"actions": [action]})
                reply = io.BytesIO(json.dumps({"message": {"content": content}}).encode())
                with patch.object(desk, "urlopen", return_value=reply):
                    if valid:
                        self.assertEqual(desk.analyze(body, desk.DAY)[1][0][2], "clarify")
                    else:
                        with self.assertRaises(ValueError):
                            desk.analyze(body, desk.DAY)
