# GitHub Share Flow

This is the maintainer workflow for handing Global-sweep to teammates through GitHub.

Current GitHub remote:

```bash
https://github.com/RichWalker3/Global-swEeper.git
```

## Two Supported Share Modes

### Option 1: GitHub Repo Clone

Best when teammates are comfortable pulling updates.

Use this when:

- teammates should stay on the latest pilot branch
- you want normal Git-based updates
- you are okay exposing the curated share branch contents

Teammate flow (no dev tools assumed — Node and Git are installed by the setup prompt):

1. Create an empty folder (e.g. `Desktop/global-sweep`), open it in Cursor (teammate already uses Cursor).
2. Paste **`SETUP_PROMPT.txt`** into Cursor chat. The assistant installs Node.js and Git if needed, clones `pilot/team-handoff`, runs `npm install`, starts the app, and opens `http://localhost:3847` in Simple Browser.
3. For BRD updates, connect Jira from the hamburger menu. Jira credentials stay in local server memory by default; selecting **Remember on this computer** stores them in the OS credential store, using macOS Keychain on Mac or Windows Credential Locker on PC. Clearing credentials removes both.

Manual clone (if they already have Git): `git clone -b pilot/team-handoff https://github.com/RichWalker3/Global-swEeper.git global-sweep`

Update flow for teammates:

- Open the `global-sweep` folder in Cursor.
- Say **update sweep** in Cursor chat, or paste `UPDATE_SWEEP_PROMPT.txt`.
- Cursor should stop the current server, replace the local copy with `origin/pilot/team-handoff`, run `npm install`, run `npm run playwright:install`, and relaunch Sweep.

### Option 2: GitHub Release Download

Best when you want a more product-like handoff.

Use this when:

- you want to upload one packaged artifact to GitHub Releases
- you want a fixed snapshot instead of a moving branch
- you want teammates to download a clean bundle instead of cloning the full working repo

Maintainer flow:

1. Run `npm run pilot:package`.
2. Upload the generated `.tar.gz` from `tmp/pilot-release/` to a GitHub release.
3. Tell teammates to download and extract that archive.
4. From the extracted folder, they run `npm install` and `npm run web`.
5. They open `http://localhost:3847` and connect Jira from the hamburger menu only when they need BRD Jira updates.

## Commands

Generate a clean bundle folder:

```bash
npm run pilot:bundle
```

Generate a GitHub-friendly packaged release:

```bash
npm run pilot:package
```

That creates:

- a clean folder in `tmp/pilot-release/global-sweep-pilot-v<version>/`
- a release archive in `tmp/pilot-release/global-sweep-pilot-v<version>.tar.gz`

## Suggested GitHub Release

Title:

```text
Global-sweep Pilot v0.3.0
```

Description:

```text
Internal pilot release for running Sweep locally.

Setup:
1. Download and extract the archive.
2. Run npm install.
3. Run npm run web.
4. Open http://localhost:3847.

Jira credentials are entered in the web UI only when using BRD Workspace Jira updates. They stay in memory by default and are only persisted if you select **Remember on this computer**, which saves them to the OS credential store.
```

## Recommendation

For the first internal GitHub rollout:

- use a curated pilot branch for people who want updates
- use the packaged release archive for people who just need a stable installable snapshot

That gives you both a living pilot and a cleaner release artifact without sacrificing your main dev repo.
