# One-shot setup: install, clone, and launch Sweep

Send your coworkers this **single prompt**. They create an empty folder, open it in Cursor, paste the prompt, and the AI installs Git and Node (if needed), clones the repo, installs dependencies, starts the app, and opens it in their browser. No Confluence/Jira setup — you can help them with that separately.

---

## What they do (before pasting)

1. **Create a new empty folder** (e.g. `global-sweep` on Desktop).
2. **Open that folder in Cursor** (File → Open Folder → choose that folder).
3. **Start a new chat** and paste the prompt below. Send.

Because they already opened the folder in Cursor, when the AI clones the repo into that folder they stay in the right project — no need to “point Cursor” anywhere after setup.

---

## What they need first

- **Cursor** installed ([cursor.com](https://cursor.com))

**That’s it.** The prompt will install Git and Node if they’re missing, then clone the repo. The repo is **public**, so **no GitHub login or account** is required — clone works without signing in.

**Confluence/Jira** — Not part of this setup. You can help them add API tokens and config later.

---

## The prompt (copy this whole block)

```
Set up Global-sweep from GitHub and launch it in my browser. I have already opened the folder where I want the project (this folder) in Cursor. Do every step below in order. Do not ask for my confirmation; run all commands. Do not set up or ask for Confluence/Jira credentials — those will be configured separately.

Repo: https://github.com/RichWalker3/Global-swEeper.git

1. Ensure Git is installed. If not (git --version fails): on macOS run "brew install git" (install Homebrew first from https://brew.sh if needed); on Windows run "winget install Git.Git". Then ensure Node.js 18+ is installed: if not (or node -v shows older), on macOS run "brew install node", on Windows run "winget install OpenJS.NodeJS.LTS". If something fails, tell me what to install and I can run the prompt again.

2. Clone the repo into the current folder: git clone https://github.com/RichWalker3/Global-swEeper.git .   (the dot means this folder; it must be empty). No GitHub login needed — the repo is public. If this folder already has the repo (.git exists), run "git pull" instead.

3. In this folder run: npm install

4. Then run: npx playwright install chromium

5. If there is no .env file, create it by copying env.example to .env. Do not add or request Confluence/Jira/Atlassian credentials.

6. Start the web app in the background with: npm run web

7. Open http://localhost:3847 in my default browser: on macOS run "open http://localhost:3847", on Windows run "start http://localhost:3847".

When done, tell me briefly that Sweep is running and the browser should have opened. If anything failed, say what to fix.
```

---

## What happens after

- The app runs at **http://localhost:3847** and the AI opens it in their browser.
- They’re already in the project folder in Cursor, so **launch sweep**, **update sweep**, and **/wa** work in future chats (see [TEAM_SETUP.md](./TEAM_SETUP.md)).

**Confluence/Jira:** Not included in this setup. When you’re ready, help them add their API token and base URL to `.env` (see your internal docs or the Atlassian rule in the repo).
