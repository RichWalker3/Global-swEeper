# Global-sweep: Team Setup Guide

**Repo:** `https://github.com/RichWalker3/Global-swEeper.git`  
**Branch:** `pilot/team-handoff`

This guide is for **non-developers** with a normal work laptop — no Node, Git, or terminal experience required.

---

## What you need before setup

- **Cursor** — you already have this; Sweep runs inside it.
- **GitHub access** — your team lead must add you to the repo so clone/update works.

You do **not** need Node.js or Git installed beforehand. The setup prompt installs them if missing, then downloads Sweep and launches the app.

---

## First-time setup (recommended)

### 1. Create a place for Sweep

On your Desktop (or anywhere you like), create an **empty folder** named `global-sweep`.

### 2. Open it in Cursor

- **File → Open Folder** → choose that empty `global-sweep` folder

### 3. Run the one-time setup prompt

- Start a **new chat** in Cursor
- Attach or paste the full contents of **`SETUP_PROMPT.txt`** from the repo root  
  (After the first clone, the file lives inside your `global-sweep` folder. Before clone, your lead can send you the file or you paste it from the GitHub repo.)

The assistant will:

- Install **Node.js** if you don’t have it (tries automatic install; may ask you to run the installer from nodejs.org)
- Install **Git** if you don’t have it (same — automatic or a simple download)
- Download Sweep from the **team handoff** branch
- Install dependencies and start the app
- Open **http://localhost:3847** in Cursor’s **Simple Browser** (inside Cursor, not Chrome/Edge/Safari)

You may need to type **done** once or twice if the assistant asks you to finish a graphical installer (Node or Git). That’s normal on locked-down company laptops.

### 4. If the assistant stops

- **Quit Cursor completely**, reopen it, open the `global-sweep` folder, and say: **continue setup**
- Or send your team lead a screenshot of the error

---

## Day to day (no terminal)

Open the `global-sweep` folder in Cursor and say:

| You say | What happens |
|--------|----------------|
| **launch sweep** | Starts the web app → http://localhost:3847 |
| **update sweep** | Gets the latest team handoff from GitHub and relaunches |
| **/wa https://example.com** | Website Assessment for that URL |

You can also paste **`UPDATE_SWEEP_PROMPT.txt`** for updates.

---

## Manual install (only if the prompt cannot install Node)

If your company blocks automatic installs:

1. **Node.js:** https://nodejs.org → download **LTS** → run installer → defaults → restart Cursor  
2. **Git:** https://desktop.github.com (easiest) **or** https://git-scm.com/download/win (Windows)  
3. Clone in GitHub Desktop: URL above, branch **`pilot/team-handoff`**, folder `global-sweep`  
4. Open that folder in Cursor → paste **`SETUP_PROMPT.txt`** again (it will skip installs and finish setup)

---

## Jira

You do **not** need Jira credentials to launch Sweep. For BRD Jira updates, use the **hamburger menu** in the web app. Credentials stay in memory unless you choose **Remember on this computer** (saved to macOS Keychain or Windows Credential Locker).

---

## Basic Sweep workflow

1. Launch Sweep → http://localhost:3847  
2. Paste a merchant URL and run the assessment  
3. Copy the **Website Assessment Prompt** into Cursor  
4. Paste Cursor’s completed WA back into BRD Workspace  
5. Connect Jira from the hamburger menu when needed  
6. Process BRD and send to Jira when ready  

---

## Troubleshooting

- **“Command not found: npm” or “node”**  
  Node isn’t installed or Cursor needs a restart after install. Re-run **`SETUP_PROMPT.txt`** or install Node from nodejs.org, quit Cursor, reopen.

- **Clone / access denied**  
  Ask your team lead for access to `Global-swEeper` on GitHub.

- **Playwright / Chromium errors**  
  Sweep installs Chromium inside the **same project folder** you run it from (`.playwright-browsers`). If you have more than one copy of `global-sweep` (for example Desktop and Downloads), install and run Sweep from **one folder only**.

  In Cursor, say: run `npm install` and `npm run playwright:install` in my global-sweep folder, then restart with **launch sweep**.

  **Windows (PowerShell)** — run these in the folder where you open Sweep (check the path in the error message):

  ```powershell
  cd "C:\Users\YOURNAME\Desktop\global-sweep"
  Remove-Item -Recurse -Force ".\.playwright-browsers\__dirlock" -ErrorAction SilentlyContinue
  npm run playwright:install
  npm run web
  ```

  Do **not** run `npx playwright install chromium` without `npm run playwright:install` — that can install the wrong browser type (headless-shell) or into the wrong folder.

- **Port 3847 in use**  
  Say **launch sweep** again (it should stop the old server) or ask the assistant to use port 3848.

- **Cursor won’t run commands**  
  Use **File → Open Folder** on `global-sweep`, not a single file.

### Windows

- If **winget** is blocked: use the nodejs.org and GitHub Desktop links in the manual section above.  
- Open the app: **Ctrl+Shift+P** → **Simple Browser: Show** → `http://localhost:3847`

---

## Summary

1. Open an **empty** `global-sweep` folder in Cursor (you already use Cursor).  
2. Paste **`SETUP_PROMPT.txt`** once — it installs Node/Git if needed and launches Sweep.  
3. Use **launch sweep** and **update sweep** after that.

For maintainers sharing the repo, see [GITHUB_SHARE.md](./GITHUB_SHARE.md).
