#!/usr/bin/env python3
"""Create future Global Sweep subtasks under SOLI-452 via Jira REST API."""

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
    acceptance: list[str]


TICKETS: list[Ticket] = [
    Ticket(
        summary="Add direct LLM integration in the web UI",
        description=(
            "Remove the copy/paste workflow by allowing the tool to call the "
            "model directly after the scrape and return assessment output in "
            "the same UI flow."
        ),
        acceptance=[
            "The web app can call an LLM directly after scraping.",
            "Manual prompt copy/paste is no longer required for the standard path.",
            "The UI shows useful progress and error states during generation.",
        ],
    ),
    Ticket(
        summary="Add local LLM support for formatting and lightweight automation",
        description=(
            "Evaluate and integrate a small local model that can run on employee "
            "laptops for formatting or lighter-weight reasoning, reducing reliance "
            "on large hosted models for simple output generation."
        ),
        acceptance=[
            "At least one local-model path is evaluated or integrated.",
            "The tool can use a smaller local model for formatting-oriented tasks.",
            "The team understands where local models are sufficient and where hosted models are still needed.",
        ],
    ),
    Ticket(
        summary="Replace email-only feedback with Jira-based issue capture",
        description=(
            "Route in-product feedback into Jira instead of relying only on email "
            "so issues and enhancement requests are easier to triage and track."
        ),
        acceptance=[
            "The feedback flow can create or link to Jira issues.",
            "Feedback no longer depends solely on a personal email inbox.",
            "Users can report issues without leaving the tool.",
        ],
    ),
    Ticket(
        summary="Auto-fill BRD Jira tickets with assessment output",
        description=(
            "Push Global Sweep output into the relevant Jira workflow so "
            "assessment data is written directly into the target ticket instead "
            "of being pasted manually."
        ),
        acceptance=[
            "Assessment output can be written back into the target Jira ticket.",
            "The team defines where automated output should live, such as a field or comment.",
            "Manual review still happens before final submission where needed.",
        ],
    ),
    Ticket(
        summary="Define a structured Jira field for automated assessment output",
        description=(
            "Create a cleaner destination for machine-generated assessment data "
            "so the output is not just pasted as one large unstructured block."
        ),
        acceptance=[
            "The target Jira field or comment strategy is defined.",
            "Automated output can be stored in a predictable location.",
            "The resulting ticket layout is readable to end users.",
        ],
    ),
    Ticket(
        summary="Expand scraper support beyond Shopify",
        description=(
            "Continue widening merchant compatibility while balancing depth of "
            "analysis against the complexity of building a universal scraper."
        ),
        acceptance=[
            "The scraper supports more non-Shopify merchants reliably.",
            "Known gaps for non-Shopify checkout or policy discovery are documented and reduced.",
            "Expansion decisions stay aligned with the Website Assessment use case.",
        ],
    ),
    Ticket(
        summary="Improve bot-detection mitigation and scrape resilience",
        description=(
            "Reduce assessment failures caused by bot protection or fragile site "
            "behavior through better mitigation strategies and recovery patterns."
        ),
        acceptance=[
            "The team has a clearer strategy for handling bot-detection blockers.",
            "Scrape resilience improves on difficult merchants.",
            "Bot-related limitations are surfaced clearly when they cannot be bypassed.",
        ],
    ),
    Ticket(
        summary="Add multi-merchant processing",
        description=(
            "Allow the tool to assess multiple merchants in one workflow to "
            "support broader testing, rollout, or pipeline usage."
        ),
        acceptance=[
            "Multiple merchants can be queued or processed in one workflow.",
            "The tool returns clear per-merchant status and results.",
            "Batch-style usage improves pilot or operational efficiency.",
        ],
    ),
    Ticket(
        summary="Add HubSpot integration for merchant context",
        description=(
            "Pull merchant or account context from HubSpot so assessments can be "
            "enriched with business context and used more effectively in BRD workflows."
        ),
        acceptance=[
            "HubSpot data can be retrieved for relevant merchant workflows.",
            "The integration supports useful assessment context rather than raw data dumps.",
            "The team can define how HubSpot context should influence the workflow.",
        ],
    ),
    Ticket(
        summary="Improve copy and export usability in the assessment UI",
        description=(
            "Polish the current user experience by making high-frequency actions "
            "easier, such as moving copy/export actions higher in the page and "
            "reducing unnecessary scrolling."
        ),
        acceptance=[
            "Copy or export actions are easier to access during normal use.",
            "Users no longer need excessive scrolling to complete the workflow.",
            "The tool feels more polished for broader team usage.",
        ],
    ),
    Ticket(
        summary="Improve truncated-content handling in scrape output",
        description=(
            "Reduce cases where important site information is lost due to "
            "truncation by improving what content is selected and retained for "
            "downstream analysis."
        ),
        acceptance=[
            "Important blurbs are less likely to be dropped from the prompt context.",
            "Truncation behavior is more predictable and easier to tune.",
            "The resulting outputs preserve higher-value context for analysis.",
        ],
    ),
    Ticket(
        summary="Continue improving third-party detection coverage",
        description=(
            "Strengthen one of the tool's core value areas by expanding and "
            "refining the detection logic for third-party providers, red flags, "
            "and platform signals."
        ),
        acceptance=[
            "More integrations and edge cases are detected reliably.",
            "Detection updates can be added without excessive rework.",
            "Accuracy continues improving against known manual assessments.",
        ],
    ),
    Ticket(
        summary="Formalize hosting and security model for team rollout",
        description=(
            "Move from individual local usage toward a supported rollout model "
            "by deciding how the tool should be hosted, secured, and governed "
            "for team-wide adoption."
        ),
        acceptance=[
            "The team aligns on whether the tool stays local-first or becomes centrally hosted.",
            "Security and IT considerations are documented for wider rollout.",
            "The tool has a clearer path from prototype to internal product.",
        ],
    ),
    Ticket(
        summary="Package Global Sweep for broader internal deployment",
        description=(
            "Use the existing dockerized, env-driven architecture as the basis "
            "for a deployable internal app that can be rolled out beyond the "
            "original builder."
        ),
        acceptance=[
            "The deployment path is documented and repeatable.",
            "The app can be run outside a single developer's local environment.",
            "The team can evaluate rollout options with less engineering overhead.",
        ],
    ),
    Ticket(
        summary="Define phased rollout and enablement plan for the team",
        description=(
            "Roll out Global Sweep in phases so the team can learn from early "
            "manual-review usage before relying more heavily on automation."
        ),
        acceptance=[
            "Phase 1 manual-review usage is clearly defined.",
            "Follow-up phases are based on improved accuracy and output quality.",
            "Team enablement has a clear path rather than one-off handoffs.",
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
        description="Create the future Global Sweep subtasks under SOLI-452."
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
