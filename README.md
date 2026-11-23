# Dispatch Desk

A local service delivery coordinator for carrier correspondence. Review a proposed install date next to the sentence that supports it, resolve an ambiguous site, or turn an access blocker into a follow-up draft. All orders and correspondence supplied here are fictional.

## Run on macOS

From the extracted dispatch-desk directory, run `python3 server.py` (Python 3.9 or newer). Open http://127.0.0.1:8765. Stop with Control-C. No package installation, account, or API key is needed for the sample desk. Changes persist in desk.sqlite.

## Try the workflow

1. Open the seeded downtown update. Approve the Queen St install. Open Orders to see November 27, 2026.
2. Approve the separate King St access request. Open Follow-ups to see the draft. Approval stores a task locally. A coordinator can copy its text for delivery.
3. Choose New update and load Revised Queen St window. Its tentative wording produces a clarification request. The confirmed date stays in the register.
4. Load King St access request. Two cities have a King St order. Choose the correct order before approving. Activity records the decision alongside its source update.

## Run live AI extraction

Install and launch Ollama on the same computer. In Terminal, download a model with `ollama pull qwen2.5:7b`. Model downloads require network access, disk space, and enough memory to run the model. Stop the desk if it is already running. From the project directory launch `DISPATCH_MODEL=qwen2.5:7b python3 server.py`. Any other locally installed chat model can be selected by its Ollama model name.

Choose New update → Write a custom update. Try “The carrier has confirmed the Front St installation in Toronto for December 8, 2026.” Inspect the order, date, and quoted evidence before approving. The model can misread dates and intent. The Python service calls Ollama on loopback, validates action types, checks that evidence occurs in the original text, and allows approvals only for matching directory records. An unmatched extraction can be dismissed.

## Architecture

The browser submits correspondence to a local Python HTTP server. Three exact sample messages with their original received date use pre-recorded extractions labeled Sample replay. Other messages go through the local model. SQLite stores incoming messages, proposals, orders, tasks, and audit entries. Each review decision commits together with its order or task change. Identical message bodies received on the same date reuse their first extraction. Follow-up drafts use templates.

## Development

Run `python3 -m unittest -v` from this directory. The tests use a temporary database and a simulated model response. The frontend is plain HTML, CSS, and JavaScript. This single-user prototype listens on loopback and accepts pasted correspondence.

## Ask the desk

Start the application with DISPATCH_MODEL set, approve your carrier proposals, and open Ask the desk. Ask “What’s blocking King St?”, answer “Toronto”, then ask “Draft the follow-up.” The server resolves the site against the SQLite order directory and provides selected orders, tasks and approved evidence to Ollama. Source buttons open the corresponding carrier messages. Review and edit the suggested draft before copying it. Conversation context lasts until the page reloads or you start a new conversation.
