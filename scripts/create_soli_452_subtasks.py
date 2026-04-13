#!/usr/bin/env python3
"""Create Global Sweep subtasks under SOLI-452 via Jira REST API."""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass


PARENT_KEY = "SOLI-452"
PROJECT_KEY = "SOLI"
SUBTASK_ISSUE_TYPE_ID = "10835"


@dataclass(frozen=True)
class Ticket:
    summary: str
    description: str
    scope: list[str]
    acceptance: list[str]


TICKETS: list[Ticket] = [
    Ticket(
        summary="Scraper reliability and coverage improvements",
        description=(
            "Improve scraper stability, timeout handling, and crawl coverage "
            "for repeated merchant assessments."
        ),
        scope=[
            "Define phased scrape orchestration across discovery, collection, checkout, and analysis.",
            "Add bounded browser teardown and timeout handling.",
            "Return partial results when scrapes time out.",
            "Support optional checkout probing with safe abort behavior.",
            "Expand progress metadata and warning fields for downstream consumers.",
        ],
        acceptance=[
            "Scrape runs expose clear phase transitions.",
            "Browser teardown cannot hang indefinitely.",
            "Timed-out runs can still return partial results with warnings.",
            "Checkout probing can be enabled or skipped safely.",
            "Web and CLI clients can consume the resulting progress and warning fields.",
        ],
    ),
    Ticket(
        summary="Detection and Website Assessment intelligence pipeline",
        description=(
            "Convert raw merchant-site evidence into a structured Website "
            "Assessment aligned to the working template."
        ),
        scope=[
            "Add keyword-based page tagging before extraction.",
            "Define and evolve the Website Assessment schema in Zod.",
            "Build prompt generation for Website Assessment extraction.",
            "Harden extraction against malformed model responses.",
            "Format validated Website Assessments as markdown.",
        ],
        acceptance=[
            "Evidence pages can be tagged into reusable business categories.",
            "The Website Assessment schema validates generated output reliably.",
            "Prompting supports structured extraction instead of free-form summaries.",
            "Common model formatting issues can be recovered or reported clearly.",
            "Markdown output is ready to paste into Jira.",
        ],
    ),
    Ticket(
        summary="Web app assessment workflow and operator UX",
        description=(
            "Provide a dependable local UI for running, monitoring, and reviewing "
            "assessments."
        ),
        scope=[
            "Build the local web flow for merchant assessments.",
            "Add SSE progress updates with elapsed and remaining time.",
            "Default web runs to skip checkout with optional override support.",
            "Surface partial-result warnings in the web UI.",
            "Improve assessment layout and responsive rendering.",
            "Add utility endpoints for health, status, and JSON-to-markdown.",
        ],
        acceptance=[
            "Operators can submit a merchant URL and run a sweep through the UI.",
            "Live progress updates show meaningful phase and timing information.",
            "Checkout is optional and defaults to off for web runs.",
            "Partial runs display clear warnings rather than failing silently.",
            "The results panel is readable across common screen sizes.",
        ],
    ),
    Ticket(
        summary="DNA generation and Confluence context support",
        description=(
            "Extend the product from Website Assessments into discovery notes "
            "and enterprise-context generation."
        ),
        scope=[
            "Build the DNA prompt composition flow.",
            "Implement server-side DNA generation.",
            "Expose a dedicated DNA API endpoint.",
            "Add Confluence helpers for recent DNA and merchant lookup.",
            "Capture follow-up work to integrate DNA into the main product flow.",
        ],
        acceptance=[
            "DNA prompts can combine WA, Jira, and Confluence inputs.",
            "The server can generate DNA markdown successfully.",
            "Clients can call a dedicated DNA endpoint with optional context.",
            "Confluence helpers support recent-link and merchant-based lookup.",
            "Remaining product-integration gaps are documented.",
        ],
    ),
    Ticket(
        summary="CLI tools and regression workflows",
        description=(
            "Support internal validation, comparison, and repeated testing "
            "through focused command-line tools."
        ),
        scope=[
            "Add batch tooling for running assessments against known merchants.",
            "Build tooling to compare scrape output with Jira tickets.",
            "Add focused CLIs for fast validation workflows.",
            "Standardize CLI output and error handling.",
            "Track follow-up parity work between CLI and web flows.",
        ],
        acceptance=[
            "Engineers can run repeatable batches against known merchants.",
            "Comparison tooling highlights missing, extra, or conflicting findings.",
            "Focused CLIs support faster debugging workflows.",
            "CLI outputs and error messages are standardized.",
            "Known parity gaps between CLI and web are documented.",
        ],
    ),
    Ticket(
        summary="Tooling, install flow, and developer enablement",
        description=(
            "Reduce setup friction and establish a maintainable local "
            "development baseline."
        ),
        scope=[
            "Add Playwright browser install automation to project scripts.",
            "Keep local browser binaries and generated assets out of git.",
            "Introduce ESLint configuration for the TypeScript codebase.",
            "Document team setup and local launch workflows.",
            "Maintain optional env and troubleshooting guidance.",
        ],
        acceptance=[
            "Browser installation is part of the normal local setup flow.",
            "Local-only generated assets are ignored correctly.",
            "ESLint runs against the main TypeScript sources.",
            "Setup documentation covers prerequisites, launch, and troubleshooting.",
            "Optional configuration is documented clearly.",
        ],
    ),
    Ticket(
        summary="Domain knowledge and stakeholder-facing collateral",
        description=(
            "Maintain the business context, stakeholder narrative, and collateral "
            "surrounding Global Sweep."
        ),
        scope=[
            "Expand domain knowledge coverage for assessment edge cases.",
            "Build presentation-ready messaging for Global Sweep.",
            "Create reusable Confluence update scripts for stakeholder sharing.",
            "Add supporting diagrams and adjacent operational collateral.",
            "Keep generated output aligned with stakeholder-facing templates.",
        ],
        acceptance=[
            "Domain docs cover key ecommerce and assessment edge cases.",
            "Presentation material reflects the current product workflow and value.",
            "Confluence update scripts reduce repeated manual work.",
            "Supporting diagrams help explain adjacent operational flows.",
            "Product output stays aligned with the working assessment template.",
        ],
    ),
]


def adf_paragraph(text: str) -> dict:
    return {
        "type": "paragraph",
        "content": [{"type": "text", "text": text}],
    }


def adf_bullet_list(items: list[str]) -> dict:
    return {
        "type": "bulletList",
        "content": [
            {
                "type": "listItem",
                "content": [adf_paragraph(item)],
            }
            for item in items
        ],
    }


def build_description(ticket: Ticket) -> dict:
    return {
        "type": "doc",
        "version": 1,
        "content": [
            adf_paragraph(ticket.description),
            adf_paragraph("Scope"),
            adf_bullet_list(ticket.scope),
            adf_paragraph("Acceptance criteria"),
            adf_bullet_list(ticket.acceptance),
        ],
    }


def load_env_file(path: str) -> None:
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key, value.strip().strip('"').strip("'"))


def jira_request(url: str, email: str, token: str, payload: dict) -> dict:
    auth = base64.b64encode(f"{email}:{token}".encode("utf-8")).decode("ascii")
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Basic {auth}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))


def build_payload(ticket: Ticket) -> dict:
    return {
        "fields": {
            "project": {"key": PROJECT_KEY},
            "parent": {"key": PARENT_KEY},
            "summary": ticket.summary,
            "issuetype": {"id": SUBTASK_ISSUE_TYPE_ID},
            "description": build_description(ticket),
            "labels": ["global-sweep"],
        }
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create the Global Sweep subtasks under SOLI-452."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually create the subtasks. Without this flag, the script prints the payloads only.",
    )
    parser.add_argument(
        "--env-file",
        default=".env",
        help="Optional env file containing JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN.",
    )
    args = parser.parse_args()

    load_env_file(args.env_file)

    base_url = os.getenv("JIRA_BASE_URL", "https://global-e.atlassian.net")
    email = os.getenv("JIRA_EMAIL") or os.getenv("ATLASSIAN_EMAIL")
    token = os.getenv("JIRA_API_TOKEN") or os.getenv("ATLASSIAN_KEY")

    if not email or not token:
        print(
            "Missing Jira credentials. Set JIRA_EMAIL/JIRA_API_TOKEN or "
            "ATLASSIAN_EMAIL/ATLASSIAN_KEY.",
            file=sys.stderr,
        )
        return 1

    payloads = [build_payload(ticket) for ticket in TICKETS]

    if not args.apply:
        print(json.dumps(payloads, indent=2))
        return 0

    create_url = f"{base_url}/rest/api/3/issue"
    for payload in payloads:
        try:
            created = jira_request(create_url, email, token, payload)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            print(f"Failed to create {payload['fields']['summary']}: {body}", file=sys.stderr)
            return 1
        print(f"Created {created['key']}: {payload['fields']['summary']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
