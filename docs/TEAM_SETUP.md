# Global-sweep: Team Setup Guide

**Repo:** use the clone URL your team shares for this project.

This guide is for **non-coders** who want to run Global-sweep on their own machine and get updates when the tool improves. You can get the tool from your team's Git host and use **Cursor** to run it with simple slash-style commands.

**Want one prompt that does everything?** Use **`SETUP_PROMPT.txt`** at the repo root — see **[ONE_SHOT_SETUP_PROMPT.md](./ONE_SHOT_SETUP_PROMPT.md)** (`@SETUP_PROMPT.txt` or paste into Cursor chat).

---

## What you need

- A **Mac or Windows** computer
- **Node.js** (we’ll install it below)
- **Cursor** (Cursor IDE, from cursor.com)
- **Git** (optional but recommended for updates — we’ll use GitHub Desktop or the website)

---

## Step 1: Install Node.js

Node.js is the runtime the tool needs.

1. Go to **https://nodejs.org**
2. Download the **LTS** version (green button).
3. Run the installer and accept the defaults.
4. **Check it worked:**  
   - Open **Terminal** (Mac) or **Command Prompt** (Windows).  
   - Type: `node -v`  
   - You should see a version number like `v20.x.x`.

---

## Step 2: Get the tool from your team's repo

### Option A: Download as ZIP (easiest, but updates are manual)

1. Open the repo URL your team gives you.
2. Click the green **Code** button → **Download ZIP**.
3. Unzip the folder and remember where it is (e.g. `Desktop/global-sweep`).

**To update later:** download the ZIP again and replace the folder (or merge the new files into your folder).

### Option B: Clone with GitHub Desktop (best for regular updates)

1. Install **GitHub Desktop**: https://desktop.github.com
2. Sign in with your Git account if needed.
3. **File → Clone repository**.  
   - Choose **URL**, then paste the clone URL your team provides.  
   - Pick a folder (e.g. `Desktop/global-sweep`) and clone.
4. **To update later:** open the repo in GitHub Desktop and click **Fetch origin** / **Pull origin**.

### Option C: Clone with Git (if you already use it)

```bash
git clone <repo-url>
cd global-sweep
```

**To update later:** `cd global-sweep` then run `git pull`.

---

## Step 3: Install the tool (first time only)

1. Open **Terminal** (Mac) or **Command Prompt** (Windows).
2. Go into the project folder, for example:
   - Mac: `cd ~/Desktop/global-sweep`
   - Windows: `cd C:\Users\YourName\Desktop\global-sweep`
3. Run these commands **one at a time**:

```bash
npm install
npx playwright install chromium
```

4. **Environment file (optional):**  
   You do **not** need a `.env` file for the default web app and scraper — it runs with built-in defaults (including port **3847**).  
   Create `.env` only if you need optional settings (custom port, proxy, Anthropic key, Atlassian/Jira). Copy `env.example` to `.env` and add values your team lead provides (open in Cursor or Notepad).

---

## Step 4: Open the project in Cursor

1. Open **Cursor**.
2. **File → Open Folder** and select the `global-sweep` folder.
3. Cursor will load the project. The first time, it may index files; wait until it’s done.

The project includes **Cursor rules** so you can use simple phrases instead of remembering commands.

---

## Step 5: One-time Cursor setup (paste this prompt)

In Cursor, start a **new chat** and paste the text below. (You can also open [CURSOR_SETUP_PROMPT.md](./CURSOR_SETUP_PROMPT.md) and copy the prompt from there.) The AI will check your setup and tell you what to do next (e.g. run `npm install`, open the app).

```text
I'm setting up Global-sweep on my machine. Please:

1. Confirm Node is v18+ (I can run `node -v` if needed).
2. Run `npm install` in this project if dependencies aren't installed.
3. Remind me to run `npx playwright install chromium` if I haven't already.
4. If I need optional settings (proxy, API keys, custom port), remind me I can copy env.example to .env — otherwise .env is not required.
5. Tell me the exact command to launch the app and how to open http://localhost:3847 in Cursor’s Simple Browser (task **Open Sweep in Simple Browser**, or Command Palette → **Simple Browser: Show**).

After that, tell me how to use "/launch sweep" and "/update sweep" in future chats.
```

---

## Using the tool: slash-style commands

You don’t need to remember terminal commands. In **Cursor chat**, you can say:

| You say (in Cursor)      | What happens |
|--------------------------|--------------|
| **Launch sweep** or **/launch sweep** | Start the web app. You’ll get the command to run and the URL (e.g. http://localhost:3847). Open in **Cursor’s Simple Browser** or your external browser. |
| **Update sweep** or **/update sweep** | Get the latest code and reinstall dependencies so you’re up to date. |
| **/wa https://example.com**          | Run a Website Assessment for that URL (see main README for the full workflow). |

The project’s Cursor rules (in `.cursor/rules/`) define these behaviors so the AI knows what to do when you use these phrases.

---

## Getting regular updates

- **If you use GitHub Desktop:** Open the repo → **Fetch origin** → **Pull origin**. Then in the project folder run: `npm install` (or ask Cursor: “update sweep”).
- **If you use Git in terminal:** `cd` into the project folder and run `git pull`, then `npm install`.
- **If you use ZIP:** Download the latest ZIP from the repo and replace (or merge) your project folder, then run `npm install` in that folder.

After any update, you can say **“launch sweep”** in Cursor to start the app again.

---

## Troubleshooting

- **“Command not found: npm”**  
  Node.js isn’t installed or isn’t on your PATH. Reinstall Node from nodejs.org and restart Terminal/Command Prompt.

- **“Cannot find module” or install errors**  
  In the project folder run: `npm install` and `npx playwright install chromium`.

- **Port 3847 already in use**  
  Another app is using that port. Close the other app or create a `.env` with `PORT=3848` and use http://localhost:3848.

- **Cursor doesn’t run commands**  
  Make sure you’ve opened the **global-sweep folder** in Cursor (File → Open Folder), not a single file. The slash-style commands rely on the project’s rules.

### Windows-specific

- **`winget` doesn’t work** (policy, no admin, not installed): Install **Git** from [git-scm.com](https://git-scm.com/download/win) and **Node.js LTS** from [nodejs.org](https://nodejs.org), then **close and reopen** Command Prompt or PowerShell and verify `git --version` and `node -v`.
- **Open the app in Cursor:** Command Palette (**Ctrl+Shift+P** / **Cmd+Shift+P**) → **Simple Browser: Show** → `http://localhost:3847`, or **Tasks: Run Task** → **Open Sweep in Simple Browser** (from `.vscode/tasks.json`).
- **Paths:** Use `cd` into your project folder, e.g. `cd %USERPROFILE%\Desktop\global-sweep` (adjust if your folder is elsewhere).

---

## Summary

1. Install Node.js and (optional) GitHub Desktop.
2. Get the repo (ZIP or clone) from the Git URL your team provides.
3. In the project folder: `npm install` and `npx playwright install chromium`.
4. **Optional:** copy `env.example` to `.env` only if you need proxy, API keys, or a custom port.
5. Open the project in Cursor and paste the setup prompt once.
6. Use **“launch sweep”** and **“update sweep”** (and **/wa &lt;url&gt;** for assessments) in Cursor chat.

For what the tool does and how to run a full WA, see the main [README](../README.md).
