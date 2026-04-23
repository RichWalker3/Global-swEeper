#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   export JIRA_EMAIL="you@global-e.com"
#   export JIRA_API_TOKEN="your_api_token"
#   ./scripts/post_anian_dna_update.sh
#
# Optional:
#   ./scripts/post_anian_dna_update.sh --dry-run

if [[ -z "${JIRA_EMAIL:-}" || -z "${JIRA_API_TOKEN:-}" ]]; then
  echo "Missing credentials. Set JIRA_EMAIL and JIRA_API_TOKEN first." >&2
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY_SCRIPT="${ROOT_DIR}/scripts/update_dna_page.py"

if [[ ! -f "${PY_SCRIPT}" ]]; then
  echo "Missing script: ${PY_SCRIPT}" >&2
  exit 3
fi

DRY_RUN_FLAG=""
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN_FLAG="--dry-run"
fi

python3 "${PY_SCRIPT}" \
  --page-id 7071694976 \
  --base-url "https://global-e.atlassian.net" \
  --deal-link "https://global-e.atlassian.net/wiki/spaces/SE/pages/7071694976/ANIAN+-+DNA+-+Deal+Link+https+app.hubspot.com+contacts+2462094+record+0-3+55471213692" \
  --assessment-link "https://global-e.atlassian.net/browse/SOPP-7677" \
  --replace "[[TODO]]=https://app.hubspot.com/contacts/2462094/record/0-3/55471213692" \
  --cleanup-block "TPL Program Notes||Complexities around inbound / outbound logistics, offline orders, customer service support or related, please coordinate with your lead. Topics include:" \
  --answer-after "Does the merchant drop ship orders? marketplaces?=Yes - goods are consolidated in Vancouver 3PL, pre-cleared in bulk, moved to Blaine WA drop site, then handed to FedEx for US domestic ground final-mile delivery." \
  --answer-after "Complexities around inbound / outbound logistics, offline orders, customer service support or related, please coordinate with your lead. Topics include:=TPL program flow: 3PL packs US orders with domestic labels, sends shipping data + pallet count, consolidated invoice prepared for Carsons Brokerage, shipment pre-cleared and freight booked before transfer to Blaine WA." \
  --answer-after "Additional solutions / design specific details to be captured below. Please reference the merchant details topics for questions / topics to cover, as necessary.=Assessment: https://global-e.atlassian.net/browse/SOPP-7677 | Robbie + Dan view: supportable if merchant is IOR on bulk shipment invoice and owner of goods in the US. Pending merchant confirmation for Carson Brokerage setup." \
  --section-title "TPL Program Notes" \
  --insert-under "" \
  --bullet "All products held at Vancouver 3PL warehouse." \
  --bullet "3PL packs all US orders with US domestic shipping labels attached." \
  --bullet "3PL sends shipping data and pallet count." \
  --bullet "Consolidated invoice created for Carsons Brokerage." \
  --bullet "Shipment is pre-cleared and freight booked." \
  --bullet "Pallet is moved from 3PL to US drop ship site (Blaine, Washington)." \
  --bullet "FedEx picks up US domestic shipments for ground delivery." \
  --note "Robbie + Dan: supportable if merchant is IOR on the bulk shipment invoice and owner of the goods in the US." \
  --note "Pending merchant confirmation that this is true in their TPL program with Carson Brokerage." \
  ${DRY_RUN_FLAG}
