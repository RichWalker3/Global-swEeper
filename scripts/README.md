# Development Scripts

Testing and development scripts for Global-swEep. These are **not** part of the main application.

## Scripts

### `test-wa.ts`
Tests scraper results against existing Jira WA tickets for validation.
```bash
npx tsx scripts/test-wa.ts
```

### `compare-results.ts`
Compares saved scrape results to Jira ticket content for accuracy analysis.
```bash
npx tsx scripts/compare-results.ts
```

### `batch-test.ts`
Runs scrapes on multiple merchant sites for bulk testing.
```bash
npx tsx scripts/batch-test.ts
```

## Configuration

These scripts use hardcoded ticket IDs and merchant URLs for testing. Edit the arrays in each script to test different sites.

## Requirements

- Jira credentials in `.env` (for test-wa.ts and compare-results.ts)
- Network access to merchant sites (for batch-test.ts)
