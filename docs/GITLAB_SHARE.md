# GitLab Share Flow

This is the maintainer workflow for handing Global-sweep to teammates through GitLab.

Current GitLab remote:

```bash
git@gitlab.com:global-e/solutions/global-sweep.git
```

## Two Supported Share Modes

### Option 1: GitLab Repo Clone

Best when teammates are comfortable pulling updates.

Use this when:

- teammates should stay on the latest pilot branch
- you want normal Git-based updates
- you are okay exposing the curated share branch contents

Teammate flow:

1. Clone the GitLab repo or pilot branch:

   ```bash
   git clone git@gitlab.com:global-e/solutions/global-sweep.git
   cd global-sweep
   ```

2. Run `npm install`.
3. Run `npm run web`.
4. Open `http://localhost:3847`.
5. For BRD updates, connect Jira from the hamburger menu. Jira credentials are kept in local server memory only and are cleared when Sweep restarts or when credentials are cleared.

### Option 2: GitLab Release Download

Best when you want a more product-like handoff.

Use this when:

- you want to upload one packaged artifact to GitLab Releases
- you want a fixed snapshot instead of a moving branch
- you want teammates to download a clean bundle instead of cloning the full working repo

Maintainer flow:

1. Run `npm run pilot:package`.
2. Upload the generated `.tar.gz` from `tmp/pilot-release/` to a GitLab release.
3. Tell teammates to download and extract that archive.
4. From the extracted folder, they run `npm install` and `npm run web`.
5. They open `http://localhost:3847` and connect Jira from the hamburger menu only when they need BRD Jira updates.

## Commands

Generate a clean bundle folder:

```bash
npm run pilot:bundle
```

Generate a GitLab-friendly packaged release:

```bash
npm run pilot:package
```

That creates:

- a clean folder in `tmp/pilot-release/global-sweep-pilot-v<version>/`
- a release archive in `tmp/pilot-release/global-sweep-pilot-v<version>.tar.gz`

## Suggested GitLab Release

Title:

```text
Global-sweep Pilot v0.1.0
```

Description:

```text
Internal pilot release for running Sweep locally.

Setup:
1. Download and extract the archive.
2. Run npm install.
3. Run npm run web.
4. Open http://localhost:3847.

Jira credentials are entered in the web UI only when using BRD Workspace Jira updates. They are stored in memory for the running Sweep session and are not written to disk.
```

## Recommendation

For the first internal GitLab rollout:

- use a curated pilot branch for people who want updates
- use the packaged release archive for people who just need a stable installable snapshot

That gives you both a living pilot and a cleaner release artifact without sacrificing your main dev repo.
