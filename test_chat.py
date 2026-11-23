import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server
from desk_chat import ask


class ChatTest(unittest.TestCase):
    def test_clarify_retrieve_then_draft(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(server, "DB", Path(folder)/"desk.sqlite"):
            server.setup()
            with server.connect() as db:
                q = "What's blocking King St?"
                first = ask(db, "", q, {})
                self.assertIn("Hamilton or Toronto", first["answer"])
                server.decide(1, "approve", "ORD-1042")

                def reply(request, timeout):
                    payload = json.loads(request.data)
                    data = json.loads(payload["messages"][1]["content"])
                    self.assertEqual([o["id"] for o in data["orders"]], ["ORD-1042"])
                    self.assertTrue(data["orders"][0]["tasks"])
                    self.assertTrue(data["orders"][0]["evidence"])
                    self.assertIn(data["question"], [q,"Draft the follow-up."])
                    return io.BytesIO(b'{"message":{"content":"Please confirm access."}}')

                with patch("desk_chat.urlopen", side_effect=reply):
                    second = ask(db, "mock", "Toronto", first["context"])
                    self.assertEqual(second["sources"][0]["id"], 1)
                    third = ask(db, "mock", "Draft the follow-up.", second["context"])
                    self.assertEqual(third["draft"], "Please confirm access.")
                self.assertEqual(db.execute("select count(*) from audit").fetchone()[0], 1)

    def test_draft_survives_site_then_city(self):
        q = ("Draft a short follow-up asking when the landlord can confirm access. "
             "Mention that we need access before scheduling the installation.")
        with tempfile.TemporaryDirectory() as folder, patch.object(server, "DB", Path(folder)/"db"):
            server.setup()
            with server.connect() as db:
                first = ask(db, "", q, {})
                self.assertEqual(first["sources"], [])
                for replies in [["king st toronto"], ["King St", "Toronto"], ["ORD-1042"]]:
                    context = first["context"]
                    for reply in replies[:-1]:
                        context = ask(db, "", reply, context)["context"]
                    response = io.BytesIO(b'{"message":{"content":"Draft for review"}}')
                    with patch("desk_chat.urlopen", return_value=response) as call:
                        final = ask(db, "mock", replies[-1], context)
                        prompt = json.loads(call.call_args.args[0].data)["messages"][1]
                        records = json.loads(prompt["content"])
                        self.assertEqual(records["question"], q)
                        self.assertEqual([o["id"] for o in records["orders"]], ["ORD-1042"])
                        self.assertEqual(final["draft"], "Draft for review")
