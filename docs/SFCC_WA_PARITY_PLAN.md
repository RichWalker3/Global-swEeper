# SFCC Website Assessment Parity Plan

This document defines the operating procedure for building Salesforce Commerce Cloud (SFCC) Website Assessment parity with the current Shopify experience.

## Scope

- Build SFCC assessment quality to a "usable by default" standard.
- Keep `pilot/team-handoff` stable while feature work happens in `feat/sfcc-wa-parity`.
- Include assisted browser handling as a required capability inside SFCC parity.
- Defer `GEM / Unknown` parity until SFCC parity is merged.

## Branching and Merge Strategy

1. Build in `feat/sfcc-wa-parity`.
2. Keep `main` as integration target.
3. Keep `pilot/team-handoff` unchanged during active development.
4. Merge order:
   - `feat/sfcc-wa-parity` -> `main`
   - `main` -> `pilot/team-handoff` (post-validation handoff sync)

If assisted browser work is split to a secondary branch, merge it into `feat/sfcc-wa-parity` before merging to `main`.

## Definition of Done (SFCC Parity)

A milestone is "done" only when all conditions below are met:

1. Discovery quality
   - Crawl target selection avoids low-value loops (store-locator traps, repetitive utility pages).
   - Assessment collects enough policy/catalog evidence for WA completion on most SFCC runs.

2. PDP and variant handling
   - Variant or option selection works on common SFCC PDP patterns (radios, swatches, selects, ARIA-driven options).
   - Add-to-cart no longer fails systematically due to unselected options.

3. Checkout attempt quality
   - Checkout status reports meaningful progression with clear stop reasons.
   - Redirect/tracking shells are reported as staged outcomes, not generic failures.

4. Prompt/report quality
   - Prompt distinguishes partial limitations from full crawl failures.
   - Output remains usable for writing complete WA drafts.

5. Assisted browser path
   - Watch-browser flow can be enabled for blocked/challenge scenarios.
   - Logs clearly indicate when manual challenge handling is needed.

6. Validation coverage
   - Verified against a 10-merchant SFCC-only, non-Shopify, non-Global-e set.
   - At least 5 full assessments reviewed, including at least 2 merchants with harder option/checkout behaviors.

## Validation Workflow

For each merchant:

1. Run full WA with SFCC platform selected.
2. Review crawl targets, product scraping, checkout progression, and prompt quality.
3. Record outcomes:
   - `Pass`: usable assessment output without major manual patching.
   - `Partial`: usable but with clear known limitations.
   - `Fail`: blocked by recurring crawler/checkout defects.
4. Log failure class and owner fix:
   - discovery
   - variant selection
   - add-to-cart confirmation
   - checkout navigation
   - prompt quality
   - bot/challenge handling

## Execution Discipline

- Ship in small, test-backed increments.
- After each meaningful change:
  - run focused tests
  - rerun at least one SFCC merchant
  - update validation notes
- Keep unresolved blockers explicit; do not hide them under generic "timed out" summaries.

