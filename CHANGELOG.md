# Changelog

Global-sweep uses `major.minor.patch` style versioning during the internal pilot.

## v0.2.2 - 2026-06-12

Sweep now handles slow office networks and VPNs much better, and you can see what changed in each update right from the app.

### Added

- A "What's new" button in the header that shows this release history, so you always know what changed after an update.
- Automatic slow-connection handling: Sweep checks how fast it can reach the merchant site at the start of each run and extends its time limits when the connection is slow (common on office VPNs). You'll see a "Slow connection detected" note in the progress feed when this kicks in.

### Changed

- Fewer "page timed out" errors and partial scrapes for teammates running Sweep over VPNs routed through another region (for example AU offices exiting via Europe).
- Updated the README and team setup guide: timeouts now adjust themselves, and if you see "blocked" errors instead of timeouts on a VPN, disconnecting the VPN is the fix.

## v0.2.1 - 2026-06-10

Hosted Product Forge deployment fix.

### Fixed

- Routed frontend API and SSE calls through the current app base path so `/sweep` deployments connect to `/sweep/events` and `/sweep/api/*`.

### Added

- Regression coverage for hosted base-path routing.

## v0.2.0 - 2026-05-18

First serious internal pilot baseline.

### Added

- BRD Workspace flow for reviewing BRD 1-30 rows before Jira updates.
- Manual BRD mode for building editable BRD tables without a completed WA.
- Optional Jira credential persistence through the OS credential store.
- GitHub update workflow for teammate installs.
- Golden BRD regression coverage on the maintainer branch.
- Subtle frontend version label.

### Changed

- Improved Jira update reliability with ADF field payloads and dynamic status transitions.
- Moved Jira send failures closer to the `Send to Jira` action.
- Cleaned stale Anthropic API key UI and unused server endpoints.
- Pruned test files and fixtures from the coworker-facing pilot branch.
- Refreshed README guidance for GitLab/GitHub users.

### Verified

- `npm run build`
- `npm run lint`
- `npm test -- --run` on `main` before the pilot branch test pruning
