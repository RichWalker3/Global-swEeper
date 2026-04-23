# DNA update instruction manual

This document describes how to copy **Website Assessment (WA)** findings into a **Discovery Notes & Analysis (DNA)** Confluence page while keeping DNA structure intact, protecting the **Jira Tickets** block, and writing only into **value** cells.

## Principles

1. **DNA structure wins.** Do not invent new sections or rearrange the template. Fill existing rows, prompts, and placeholders.
2. **Jira Tickets is read-only.** The section headed **JIRA Tickets** must be sent back **byte-for-byte unchanged**. The automation refuses to publish if that block changes after edits.
3. **Values go in the value column.** Table updates must replace the **second** cell of the matching row, not the label cell. If WA text ever lands in the label column, clean it and re-apply the value.
4. **Unknown / not evidenced → `No`.** When a line item has no confirmed WA evidence for that DNA row, set the value to the literal word **`No`** (unless the team agrees on a different convention such as `TBD`).
5. **Leftovers go to the bottom only if needed.** Prefer mapping into existing DNA fields. Use an appended notes section only for content that truly has no home in the template.

## Tooling

### Script: `scripts/update_dna_page.py`

Location: `global-sweep/scripts/update_dna_page.py`

It:

- `GET`s the DNA page body (Confluence storage HTML) via REST.
- Extracts and **isolates** the Jira Tickets block before edits.
- Applies updates (placeholders, `--field`, `--answer-after`, `--cleanup-block`, WA ingestion, etc.).
- Verifies the Jira Tickets block is unchanged, then `PUT`s the page with `version.number + 1`.

### Credentials

The script expects:

- `JIRA_EMAIL` — Atlassian account email  
- `JIRA_API_TOKEN` — API token (same token works for Confluence REST on the same site)

Optional: `JIRA_BASE_URL` if not using default `https://global-e.atlassian.net` (the script uses `--base-url`).

Example (local):

```bash
export JIRA_EMAIL="you@global-e.com"
export JIRA_API_TOKEN="your_token"
```

If your repo has `mcp-servers-master/.env` with `ATLASSIAN_EMAIL` / `ATLASSIAN_KEY`, you can mirror them:

```bash
set -a && source /path/to/mcp-servers-master/.env && set +a
export JIRA_EMAIL="$ATLASSIAN_EMAIL"
export JIRA_API_TOKEN="$ATLASSIAN_KEY"
```

### MCP vs REST

- **MCP** (`user-confluence`, plugin Atlassian tools): good for **reading** pages/issues and quick checks.
- **Publishing DNA updates** uses **Confluence REST** from the script (same credentials as above). Some MCP servers only expose read or create; the script is the reliable path for **in-place page updates**.

## Common flags

| Flag | Purpose |
|------|--------|
| `--page-id` | Confluence page ID (numeric string from the URL). |
| `--base-url` | Default `https://global-e.atlassian.net`. |
| `--deal-link` | HubSpot or deal URL for placeholder patterns / links. |
| `--assessment-link` | WA Jira link (browse or filter URL) for placeholders. |
| `--wa-jira-key` | e.g. `SOPP-8013` — pulls WA text from Jira issue description. |
| `--wa-jira-url` | Full Jira URL containing `selectedIssue=KEY`. |
| `--wa-file` | Local markdown/plain WA file instead of Jira. |
| `--field 'Label=Value'` | Sets a DNA row whose first column matches `Label` (value HTML allowed; plain text is fine). Repeatable. |
| `--answer-after 'Prompt=Answer'` | Inserts after an exact prompt string (plain or HTML). Repeatable. |
| `--replace 'OLD=NEW'` | Literal string replace in storage body. Repeatable. |
| `--cleanup-block 'START\|\|END'` | Removes from `START` through `END` (inclusive) once per block. |
| `--remove-section-title 'Heading'` | Removes a full `<h1..h6>Heading</h6>` section. |
| `--insert-under` | Comma-separated heading keywords to insert notes under; use `""` to force append-only. |
| `--dry-run` | Writes `/tmp/dna_update_payload.json` but does **not** PUT. |

## Recommended workflow

### 1. Dry run (always)

```bash
python3 scripts/update_dna_page.py \
  --page-id "<DNA_PAGE_ID>" \
  --deal-link "<HUBSPOT_OR_DEAL_URL>" \
  --assessment-link "<WA_JIRA_URL_OR_BROWSE_LINK>" \
  --wa-jira-key "<WA_KEY>" \
  --insert-under "" \
  --dry-run
```

Check the printed summary:

- `Updated fields` — mapped into DNA.
- `Unmatched fields moved to notes` — should be low; if high, add explicit `--field` lines or fix label spelling to match the DNA table.
- `Protected Jira Tickets` — if the script aborts here, **do not** force publish; fix the edit that touched Jira.

### 2. Apply

Same command **without** `--dry-run`.

### 3. “Value column only” + `No` pass

After WA mapping, run a focused pass:

- Set any row with **no** WA signal to `--field 'RowLabel=No'`.
- Fix any corrupted label cell with `--cleanup-block` or `--replace` on the exact HTML fragment.

Use `--dry-run` first until `Unmatched field labels:` is empty.

## WA → DNA mapping notes

- Jira WA descriptions are often **one long document**. The script parses standard WA section titles when possible; some rows still need **manual `--field`** lines because DNA labels do not match WA headings 1:1.
- HTML entities (e.g. `&amp;` in labels like **GWP / Try & Buy**) must match storage: use `GWP / Try &amp; Buy / Free Products` in `--field` if the row label is encoded that way in HTML.

## Jira Tickets protection (non-negotiable)

Implementation detail: the script extracts the first `<h1..h6>…jira tickets…</h1..h6>` through the next heading (or end of document), replaces it with a unique placeholder, performs all edits, restores the block, and **compares** before/after. Any mismatch aborts the update.

## Links for this repo’s examples

- **Underoutfit WA:** [SOPP-8013](https://global-e.atlassian.net/issues?filter=40159&selectedIssue=SOPP-8013)  
- **Underoutfit DNA:** [page 7128940561](https://global-e.atlassian.net/wiki/spaces/SE/pages/7128940561/Underoutfit+-+DNA+-+Deal+Link+https+app.hubspot.com+contacts+2462094+record+0-3+58760925001)

## Troubleshooting

| Symptom | Likely cause | Fix |
|--------|----------------|-----|
| Values appear in the **label** column | Older regex matched across rows | Use current `replace_field` (row-scoped); clean with `--cleanup-block` / `--replace`; re-apply `--field`. |
| `Unmatched field labels` | Label text does not match first cell | Open DNA page source, copy exact label string; use `--replace` for typos in template. |
| Script exits “Jira Tickets section changed” | Edit matched inside Jira block | Narrow `--replace` / `--field` / avoid global regex; re-fetch page and retry. |
| `Missing JIRA_EMAIL or JIRA_API_TOKEN` | Env not set | Export vars or `source` `.env` as above. |

## Maintenance

When Confluence changes the DNA **storage** HTML shape, update `replace_field` / table matching in `scripts/update_dna_page.py` and extend this manual with the new row patterns.
