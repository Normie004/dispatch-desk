import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import server


class DateReviewTest(unittest.TestCase):
    def test_rescheduling(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(server, "DB", Path(folder)/"db"):
            server.setup()
            with server.connect() as db:
                db.execute("UPDATE orders SET install='2026-12-08' WHERE id='ORD-1120'")
                for pid in [20,21]:
                    db.execute("INSERT INTO proposals(id,mid,site,city,kind,quote,target) VALUES (?,1,'Front St','Toronto','confirm','Confirmed','2026-12-10')",(pid,))
            with self.assertRaises(ValueError):
                server.decide(20, "dismiss", "ORD-1120", "2026-12-07")
            server.decide(20, "dismiss", "ORD-1120", "2026-12-08")
            state = server.state()
            self.assertEqual(state["audit"][-1]["note"],
                             "ORD-1120 · Kept install date 2026-12-08 (declined 2026-12-10)")
            self.assertEqual(next(p["state"] for p in state["proposals"] if p["id"] == 20), "dismissed")
            for action, old in [("approve",None),("reschedule","2026-12-07")]:
                with self.assertRaises(ValueError):
                    server.decide(21, action, "ORD-1120", old)
            with server.connect() as db:
                self.assertEqual(db.execute("SELECT install FROM orders WHERE id='ORD-1120'").fetchone()[0],"2026-12-08")
            server.decide(21, "reschedule", "ORD-1120", "2026-12-08")
            with server.connect() as db:
                self.assertEqual(db.execute("SELECT install FROM orders WHERE id='ORD-1120'").fetchone()[0],"2026-12-10")
                self.assertIn("2026-12-08 → 2026-12-10",db.execute("SELECT note FROM audit WHERE pid=21").fetchone()[0])

    def test_offline_reschedule_demo(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(server, "DB", Path(folder)/"db"), patch.object(server, "MODEL", ""):
            server.setup()
            state = server.state()
            original = next(p for p in state["proposals"] if p["site"] == "Queen St")
            order = next(o for o in state["orders"] if o["site"] == "Queen St")
            server.decide(original["id"], "approve", order["id"])
            sample = next(s for s in state["samples"] if s["subject"] == "Queen St confirmed reschedule")
            mid = server.ingest(sample["subject"], sample["body"], sample["day"])
            revised = next(p for p in server.state()["proposals"] if p["mid"] == mid)
            self.assertIn(revised["quote"], sample["body"])
            self.assertNotEqual(mid, original["mid"])
            server.decide(revised["id"], "reschedule", order["id"], original["target"])
            state = server.state()
            self.assertEqual(next(o["install"] for o in state["orders"] if o["id"] == order["id"]), "2026-11-30")
            self.assertIn("2026-11-27 → 2026-11-30", state["audit"][-1]["note"])
