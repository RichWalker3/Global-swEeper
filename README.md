# Global-sweep

Global-sweep is a Shopify-first Website Assessment assistant for Global-e presales work. It crawls a merchant site, gathers high-signal evidence, and produces structured output that can be turned into a WA without doing the whole review manually in a browser.

![Global-sweep home screen](docs/assets/sweep-home.png)

## Why It Exists

Global-sweep is built to speed up the evidence-gathering part of a Website Assessment without turning the process into a black box.

Instead of manually clicking through every merchant site from scratch, the tool helps you:

- scan the storefront and key policy flows quickly
- collect higher-signal evidence for scoping
- surface likely integration callouts earlier
- generate output that is easier to turn into a final WA

It is meant to support presales review, not replace judgment.

## Current Status

- Beta, usable for internal pilot testing
- Strongest on Shopify storefronts
- Web UI is available locally
- Checkout reachability has been hardened, but edge cases still exist
- Final WA writeup is still a human-in-the-loop workflow

## How It Works

1. Enter a merchant URL and run a quick scan or fuller WA-style assessment.
2. Global-sweep crawls high-value pages like homepage, PDPs, cart, checkout, shipping, and returns.
3. Copy the Website Assessment prompt into Cursor to produce the final WA plus the BRD Output for Sweep section.
4. Paste the finished WA into the BRD Workspace, review the generated SE output rows, and send reviewed updates to Jira.

![Global-sweep running an assessment](docs/assets/sweep-run.png)

## What It Does

Global-sweep helps with the evidence-gathering part of a Website Assessment:

- Crawl key site pages like homepage, PDPs, cart, checkout, shipping, and returns
- Detect platform and common ecommerce integrations
- Pull out policy and catalog signals that matter for scoping
- Generate a Cursor-ready WA prompt with BRD 1-30 instructions
- Support BRD review rows that update Jira SE Scoping Output and Done/Canceled status
- Support quick scans and fuller WA-style runs

The tool is intended to document a merchant's current state and surface integration callouts before signature. It is not meant to auto-sell a solution or replace human review.

## Core Workflow

- Run the merchant through the web UI.
- Review the summary, detected signals, and page evidence.
- Copy the Website Assessment prompt into Cursor.
- Paste Cursor's completed WA back into the BRD Workspace.
- Review SE output notes and Done/Canceled status before sending Jira updates.

## Pilot Scope

### In Scope

- Single-merchant runs
- Shopify-first storefront coverage
- US-based reachability checks
- Evidence collection for WA drafting
- Manual review and copy/paste workflow in the UI
- BRD Workspace updates to Jira SE Scoping Output for validated SOPP child tickets

### Not Ready Yet

- Broad non-Shopify coverage
- Fully automated Confluence publishing
- Hosted/team-managed Jira credential storage
- In-product direct LLM generation in the web UI
- Multi-merchant batch workflow for regular team use
- Hosted multi-user deployment with a locked-down security model

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Install

Clone the repo from your team's Git remote, then run:

```bash
npm install
```

No `.env` file is required for the default local app. Create `.env` only if you need optional settings like a custom port, hosted base URL, allowed origins, or proxy. Use `env.example` as the template.

For BRD Jira updates, use the Jira Credentials panel in the web UI. Credentials stay in local server memory by default and are not written to browser storage. If you choose **Remember on this computer**, Sweep stores the Jira credentials in the OS credential store, using macOS Keychain on Mac or Windows Credential Locker on PC, so they survive Sweep restarts. Clearing Jira credentials removes both the in-memory session and any saved credential-store entry. `.env` Jira credentials are still supported for maintainer or automation workflows.

### Run

```bash
npm run web
```

Then open `http://localhost:3847` in Cursor's Simple Browser or your normal browser.

### Verify

```bash
npm run build
npm test
```

## Assessment Workflow

1. Enter a merchant URL in the web UI.
2. Run either a quick scan or a full WA-style pass.
3. Review the collected evidence and summary fields.
4. Copy the Website Assessment prompt into Cursor.
5. Have Cursor produce the final WA, including the `BRD Output for Sweep` section.
6. Paste the finished WA into BRD Workspace, enter the top-level SOPP key, and click `Process BRD`.
7. Review the SE output notes and status dropdowns, then click `Send to Jira`.

## Common Commands

```bash
npm run web
npm run build
npm test
```

## Troubleshooting (Pilot)

### Playwright or Chromium install issues

The app uses Playwright's full bundled Chromium browser. Fresh installs run:

```bash
npm install
```

which also runs `playwright install chromium --no-shell`. If a teammate sees browser launch errors, have them pull the latest package, run `npm install` again, and restart `npm run web`.

### Many pages time out

Page navigation defaults to `30000` ms. On slow networks, VPNs, or heavy CMP/CDN pages, create a local `.env` file and add:

```bash
SWEEP_PAGE_GOTO_TIMEOUT_MS=45000
```

Then restart `npm run web`. The accepted range is `10000` to `120000` ms.

## Documentation

- `docs/TEMPLATE.md`
- `docs/DOMAIN_KNOWLEDGE.md`
- `docs/TEAM_SETUP.md`
- `docs/PILOT_READINESS.md`
- `docs/GITHUB_SHARE.md`

## Current Limitations

- Best results are still on Shopify and Shopify-adjacent storefronts.
- Some merchants will block or degrade automated browsing.
- Checkout success is heuristic-based and can still fail on unusual carts, drawers, or auth-gated flows.
- The web UI helps produce WA-ready material, but the final writeup is still reviewed and finished by a human.
- Internal deployment, packaging, and enablement work are still pending before a broader rollout.

## Sharing Guidance

Before handing this to a wider team, verify:

- `npm install` works from a fresh clone
- `npm run build` passes
- `npm test` passes
- `npm run pilot:package` creates a release archive
- `env.example` matches the current optional configuration
- docs reflect the actual workflow and current limitations

To generate a curated shareable copy without maintainer-only repo clutter, run:

```bash
npm run pilot:bundle
```

To package that clean share as a GitHub-friendly release archive, run:

```bash
npm run pilot:package
```

See `docs/PILOT_READINESS.md` for the current checklist and rollout notes.

