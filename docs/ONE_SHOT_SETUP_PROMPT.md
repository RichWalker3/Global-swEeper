# One-shot setup: install, clone, and launch Sweep

Use this doc when you want to hand a teammate one lightweight setup path without walking them through the repo manually.

The **only** place the full prompt text lives is **[`SETUP_PROMPT.txt`](../SETUP_PROMPT.txt)** at the repo root. Edit that file when the setup flow changes so this doc stays lightweight and does not drift.

## What Teammates Do

They do not need to read the whole repo first. Give them:

1. The repo URL your team wants them to clone.
2. The `SETUP_PROMPT.txt` file from this repo.

Then they:

1. Create an empty folder and put `SETUP_PROMPT.txt` into it.
2. Open that folder in Cursor.
3. Start a new chat.
4. Either attach `@SETUP_PROMPT.txt` and ask Cursor to execute it, or paste the whole file into chat.

Cursor does not run a dropped file by itself, so they still need to send one chat message that references or pastes the prompt.

## What The Prompt Handles

The prompt is designed to:

- verify Git and Node
- clone or update the repo
- run `npm install`
- run `npx playwright install chromium`
- launch `npm run web`
- open Sweep in Cursor's Simple Browser

It intentionally does not require Confluence or Jira setup for the default local flow.

## Copyable Message

Use this when sending the setup to a teammate:

> Put `SETUP_PROMPT.txt` in an empty folder, open that folder in Cursor, start a new chat, attach `@SETUP_PROMPT.txt`, and ask Cursor to execute every step in the file. When prompted for the repo URL, use the team repo link I sent you.

## Maintainer Notes

- `SETUP_PROMPT.txt` should stay generic so it works for whatever Git remote the team uses.
- `.env` is not required for the default local run; use `env.example` only when optional settings are needed.
- Keep this flow local-first until hosted rollout and security decisions are formalized.