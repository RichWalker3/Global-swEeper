# Pilot Readiness

This document tracks what Global-sweep needs before it is shared as an internal pilot repo that teammates can clone and run on their own machines.

## Goal

Make the repo easy to:

- clone
- install
- run
- understand
- troubleshoot

without relying on tribal knowledge or local one-off setup.

## Current Readiness Snapshot

### Ready Enough For A Small Internal Pilot

- Local web UI exists and can run with `npm run web`
- Default local run does not require a committed `.env`
- Build and test commands are available
- Team setup docs and Cursor setup prompts exist
- WA evidence gathering is materially stronger than the early MVP

### Still Needs Care Before Wider Sharing

- Repo is still Shopify-first
- Checkout automation is improved but not universal
- Final WA drafting still depends on a human reviewer
- Hosted deployment and security posture are not formalized

## Latest Validation Snapshot

- Fresh-folder packaged release install succeeded
- Packaged release launched successfully
- `Underoutfit` completed successfully as a quick scan
- `Felina` completed a full run and reached checkout
- `HATCH` completed a corrected full-budget rerun and reached checkout

This is strong enough for a small internal pilot, but not for broad "works everywhere" positioning.

## Share-Now Checklist

Use this before giving the repo to a small test group.

- Confirm the branch contents are intentional and do not include local-only scratch files.
- Confirm `npm install` works from a fresh clone.
- Confirm `npx playwright install chromium` completes on a clean machine.
- Confirm `npm run build` passes.
- Confirm `npm test` passes.
- Confirm the app launches with `npm run web`.
- Confirm `env.example` reflects every supported optional setting.
- Confirm docs do not include personal secrets, real token locations, or machine-specific instructions that should not be shared.
- Confirm README matches the actual workflow in the current UI.
- Confirm known limitations are written down plainly.
- If you want a curated handoff folder instead of the full repo, run `npm run pilot:bundle`.
- If you want a GitLab release artifact instead of a raw folder, run `npm run pilot:package`.

## Recommended Pilot Package

For an initial internal share, include:

- source code
- `README.md`
- `docs/TEAM_SETUP.md`
- `SETUP_PROMPT.txt`
- `env.example`

For the first pilot, do not depend on:

- committed secrets
- undocumented local tools
- personal MCP configuration
- one person's machine-specific file paths

## Known Limitations To State Explicitly

- Shopify is the strongest-supported platform today.
- Some sites will block automation or degrade the crawl.
- Checkout reachability is heuristic and merchant-specific.
- Output quality is best when a human reviews the evidence before finalizing the WA.
- Team rollout items like hosting, packaging, and direct LLM integration are still future work.

## Suggested Rollout Order

1. Share with a very small internal group who already understand the WA process.
2. Gather setup friction and false-negative merchant examples.
3. Tighten docs and defaults based on that pilot.
4. Only then package for a broader internal rollout.

## Practical Next Steps

- Keep the shared doc set lean: `README.md`, `docs/TEAM_SETUP.md`, and this file.
- Use a very small internal pilot group first.
- Capture non-Shopify misses and hard merchants from real usage.
- Start the next product branch around non-Shopify coverage.
Use `docs/GITLAB_SHARE.md` for the maintainer workflow to distribute the clean share through GitLab.
