# GitLab Share Flow

This is the maintainer workflow for handing Global-sweep to teammates through GitLab.

## Two Supported Share Modes

### Option 1: GitLab Repo Clone

Best when teammates are comfortable pulling updates.

Use this when:

- teammates should stay on the latest pilot branch
- you want normal Git-based updates
- you are okay exposing the curated share branch contents

Teammate flow:

1. Clone the GitLab repo or pilot branch.
2. Run `npm install`.
3. Run `npm run web`.
4. Open `http://localhost:3847`.

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

## Recommendation

For the first internal GitLab rollout:

- use a curated pilot branch for people who want updates
- use the packaged release archive for people who just need a stable installable snapshot

That gives you both a living pilot and a cleaner release artifact without sacrificing your main dev repo.
