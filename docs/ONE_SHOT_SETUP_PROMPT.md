# One-shot setup: install, clone, and launch Sweep

**Canonical repo:** `https://github.com/RichWalker3/Global-swEeper.git` — [github.com/RichWalker3/Global-swEeper](https://github.com/RichWalker3/Global-swEeper)

The **only** place the full prompt text lives is **[`SETUP_PROMPT.txt`](../SETUP_PROMPT.txt)** at the repo root. **Edit that file** when you change install steps — do not duplicate the prompt body here (avoids drift).

---

## What teammates do (no reading required)

They do **not** need to open this documentation. Give them **one file** and **one line** from you (Slack, email, etc.):

1. **Create an empty folder** and put **`SETUP_PROMPT.txt`** in it. They can save it from the repo after you send a link, or download:  
   **`https://raw.githubusercontent.com/RichWalker3/Global-swEeper/main/SETUP_PROMPT.txt`**
2. **Open that folder in Cursor** (File → Open Folder).
3. **New chat** — either:
   - **@mention the file:** `@SETUP_PROMPT.txt` and send: *Execute every step in this file in order.*  
   - **Or** paste the **entire** contents of `SETUP_PROMPT.txt` into the chat and send.

Cursor does **not** run a dropped file by itself — they need **one chat message** that attaches or pastes the prompt. That’s the whole “instruction surface” for them.

After that, the AI installs Git/Node if needed, clones the repo into the folder, runs `npm install`, Playwright, `npm run web`, and opens Sweep in **Cursor’s Simple Browser** (see the prompt file). No Confluence/Jira in this flow.

---

## What you can tell them (copy)

Use this as the only sentence they need:

> Put **`SETUP_PROMPT.txt`** in an empty folder, open that folder in Cursor, start a new chat, type **`@SETUP_PROMPT.txt`** and say to run every step — or paste the whole file into chat.

---

## Maintainer notes (optional)

- **Cursor** — [cursor.com](https://cursor.com)
- Repo is **public** — no GitHub login to clone.
- **`.env`** — not required for default use; see `env.example` if needed later.
- **Windows** — covered inside `SETUP_PROMPT.txt` (PowerShell/CMD, `winget`, fallbacks, Simple Browser).
</think>


<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
Read