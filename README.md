# Global-sweep

Global-sweep is a Shopify-first Website Assessment assistant for Global-e presales work. It crawls a merchant site, gathers high-signal evidence, and produces structured output that can be turned into a WA without doing the whole review manually in a browser.

## Current Status

- Beta, usable for internal pilot testing
- Strongest on Shopify storefronts
- Web UI is available locally
- Checkout reachability has been hardened, but edge cases still exist
- Final WA writeup is still a human-in-the-loop workflow

## What It Does

Global-sweep helps with the evidence-gathering part of a Website Assessment:

- Crawl key site pages like homepage, PDPs, cart, checkout, shipping, and returns
- Detect platform and common ecommerce integrations
- Pull out policy and catalog signals that matter for scoping
- Generate structured assessment data and markdown-friendly output
- Support quick scans and fuller WA-style runs

The tool is intended to document a merchant's current state and surface integration callouts before signature. It is not meant to auto-sell a solution or replace human review.

## Pilot Scope

### In Scope

- Single-merchant runs
- Shopify-first storefront coverage
- US-based reachability checks
- Evidence collection for WA drafting
- Manual review and copy/paste workflow in the UI

### Not Ready Yet

- Broad non-Shopify coverage
- Fully automated Jira or Confluence publishing
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
npx playwright install chromium
```

No `.env` file is required for the default local app. Create `.env` only if you need optional settings like a custom port, base URL, allowed origins, proxy, or future API integrations. Use `env.example` as the template.

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
4. Copy the generated prompt or structured output.
5. Use that output to draft the final WA.
6. Review, edit, and paste the final markdown into the destination system manually.

## Common Commands

```bash
npm run web
npm run cli -- --url https://example.com
npm run build
npm test
```

## Environment Notes

The repo is shareable without live credentials. Do not commit real secrets.

Optional settings are documented in `env.example`, including:

- `PORT`
- `BASE_URL`
- `ALLOWED_ORIGINS`
- `ANTHROPIC_API_KEY`
- `PROXY_URL`

If Jira, Confluence, or other internal integrations are added for a given team setup, those credentials should be configured locally and documented outside the repo's committed defaults.

## Documentation

- `docs/TEMPLATE.md`
- `docs/DOMAIN_KNOWLEDGE.md`
- `docs/TEAM_SETUP.md`
- `docs/PILOT_READINESS.md`
- `docs/SHAREABLE_BRANCH_AUDIT.md`
- `docs/GITLAB_SHARE.md`

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
- `env.example` matches the current optional configuration
- docs reflect the actual workflow and current limitations

To generate a curated shareable copy without maintainer-only repo clutter, run:

```bash
npm run pilot:bundle
```

To package that clean share as a GitLab-friendly release archive, run:

```bash
npm run pilot:package
```

See `docs/PILOT_READINESS.md` for the current checklist and rollout notes.

