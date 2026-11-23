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
            server.decide(20, "dismiss", "ORD-1120")
            for action, old in [("approve",None),("reschedule","2026-12-07")]:
                with self.assertRaises(ValueError):
                    server.decide(21, action, "ORD-1120", old)
            with server.connect() as db:
                self.assertEqual(db.execute("SELECT install FROM orders WHERE id='ORD-1120'").fetchone()[0],"2026-12-08")
            server.decide(21, "reschedule", "ORD-1120", "2026-12-08")
            with server.connect() as db:
                self.assertEqual(db.execute("SELECT install FROM orders WHERE id='ORD-1120'").fetchone()[0],"2026-12-10")
                self.assertIn("2026-12-08 → 2026-12-10",db.execute("SELECT note FROM audit WHERE pid=21").fetchone()[0])
