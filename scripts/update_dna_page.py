#!/usr/bin/env python3
"""Update a Confluence DNA page without changing section structure."""

from __future__ import annotations

import argparse
import base64
import hashlib
import html as html_lib
import json
import os
import re
import sys
from collections import OrderedDict
from datetime import date
from typing import Any
from urllib import error, request


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Update existing DNA fields and append leftover notes."
    )
    parser.add_argument("--page-id", required=True, help="Confluence page ID")
    parser.add_argument(
        "--base-url",
        default="https://global-e.atlassian.net",
        help="Atlassian base URL",
    )
    parser.add_argument("--deal-link", help="DNA/deal link value")
    parser.add_argument("--assessment-link", help="Assessment/Jira link value")
    parser.add_argument(
        "--replace",
        action="append",
        default=[],
        help='Exact placeholder replacement in form "PLACEHOLDER=Value" (can be repeated)',
    )
    parser.add_argument(
        "--field",
        action="append",
        default=[],
        help='Extra field in form "Label=Value" (can be repeated)',
    )
    parser.add_argument(
        "--normalize-field-label",
        action="append",
        default=[],
        help="Normalize a table row first-column label to just the label text (repeatable)",
    )
    parser.add_argument(
        "--wa-file",
        help="Path to Website Assessment markdown/plain-text file to map into DNA fields",
    )
    parser.add_argument(
        "--wa-jira-key",
        help="Jira issue key containing WA content (e.g. SOPP-7677)",
    )
    parser.add_argument(
        "--wa-jira-url",
        help="Jira issue URL containing selectedIssue query parameter or issue key",
    )
    parser.add_argument(
        "--answer-after",
        action="append",
        default=[],
        help='Insert answer right after matching prompt text: "Prompt=Answer"',
    )
    parser.add_argument(
        "--cleanup-block",
        action="append",
        default=[],
        help='Remove text block using "START||END" markers (repeatable)',
    )
    parser.add_argument(
        "--remove-section-title",
        action="append",
        default=[],
        help="Remove a full section by heading title (repeatable)",
    )
    parser.add_argument(
        "--section-title",
        default=f"Additional Merchant Notes ({date.today().isoformat()})",
        help="Title for appended/inserted notes section",
    )
    parser.add_argument(
        "--bullet",
        action="append",
        default=[],
        help="Bullet item for notes section (can be repeated)",
    )
    parser.add_argument(
        "--note",
        action="append",
        default=[],
        help="Paragraph note for notes section (can be repeated)",
    )
    parser.add_argument(
        "--insert-under",
        default="Shipping,Logistics,Fulfillment,Operations,Notes,Assumptions,Open Questions",
        help="Comma-separated heading keywords to try before append-to-bottom",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only generate payload; do not send PUT",
    )
    parser.add_argument(
        "--payload-out",
        default="/tmp/dna_update_payload.json",
        help="Where to write payload JSON",
    )
    return parser.parse_args()


def auth_header(email: str, token: str) -> str:
    raw = f"{email}:{token}".encode("utf-8")
    return f"Basic {base64.b64encode(raw).decode('ascii')}"


def api_json(
    method: str, url: str, email: str, token: str, payload: dict[str, Any] | None = None
) -> dict[str, Any]:
    data = None
    headers = {"Authorization": auth_header(email, token), "Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = request.Request(url=url, data=data, headers=headers, method=method)
    try:
        with request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed: HTTP {exc.code}: {body}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"{method} {url} failed: {exc}") from exc

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{method} {url} returned non-JSON: {raw[:300]}") from exc


JIRA_SECTION_PATTERN = re.compile(
        r"(<h[1-6][^>]*>\s*[^<]*jira\s*tickets[^<]*</h[1-6]>.*?)(?=<h[1-6][^>]*>|$)",
        flags=re.I | re.S,
    )


def extract_jira_section(html: str) -> str | None:
    match = JIRA_SECTION_PATTERN.search(html)
    if not match:
        return None
    return match.group(1)


def split_jira_section(html: str) -> tuple[str, str | None, str | None]:
    jira_section = extract_jira_section(html)
    if not jira_section:
        return html, None, None

    section_hash = hashlib.sha256(jira_section.encode("utf-8")).hexdigest()[:16]
    placeholder = f"__JIRA_TICKETS_SECTION_PROTECTED_{section_hash}__"
    return html.replace(jira_section, placeholder, 1), jira_section, placeholder


def restore_jira_section(html: str, jira_section: str | None, placeholder: str | None) -> str:
    if not jira_section or not placeholder:
        return html
    return html.replace(placeholder, jira_section, 1)


def ensure_jira_section_unchanged(original: str | None, updated_html: str) -> None:
    if original is None:
        return
    updated = extract_jira_section(updated_html)
    if updated != original:
        raise RuntimeError("Protected Jira Tickets section changed; aborting DNA update.")


def replace_field(html: str, label: str, value_html: str) -> tuple[str, bool]:
    target_label = normalize_heading(label)
    row_pat = re.compile(
        r"(<tr[^>]*>\s*)(<(?:td|th)[^>]*>.*?</(?:td|th)>)(\s*<(?:td|th)[^>]*>)(.*?)(</(?:td|th)>\s*</tr>)",
        flags=re.I | re.S,
    )
    for match in row_pat.finditer(html):
        row_prefix, first_cell_html, second_cell_open, _second_cell_val, row_suffix = (
            match.groups()
        )
        first_cell_text = re.sub(r"<[^>]+>", " ", first_cell_html, flags=re.S)
        first_cell_text = html_lib.unescape(first_cell_text)
        first_cell_norm = normalize_heading(first_cell_text)
        if target_label in first_cell_norm:
            replacement = (
                f"{row_prefix}{first_cell_html}{second_cell_open}{value_html}{row_suffix}"
            )
            start, end = match.span()
            return html[:start] + replacement + html[end:], True

    escaped = re.escape(label).replace(r"\ ", r"\s*")

    strong_pat = re.compile(
        rf"(<p[^>]*>\s*<strong[^>]*>\s*{escaped}\s*:?\s*</strong>\s*)(.*?)(\s*</p>)",
        flags=re.I | re.S,
    )
    if strong_pat.search(html):
        return strong_pat.sub(rf"\1{value_html}\3", html, count=1), True
    return html, False


def build_notes_html(
    section_title: str,
    bullets: list[str],
    notes: list[str],
    leftover_fields: list[tuple[str, str]],
) -> str:
    lines: list[str] = [f"<h2>{section_title}</h2>"]
    if leftover_fields:
        lines.append("<p><strong>Fields not found in existing structure:</strong></p>")
        lines.append("<ul>")
        for label, value in leftover_fields:
            lines.append(f"<li><strong>{label}:</strong> {value}</li>")
        lines.append("</ul>")
    if bullets:
        lines.append("<ul>")
        for bullet in bullets:
            lines.append(f"<li>{bullet}</li>")
        lines.append("</ul>")
    for note in notes:
        lines.append(f"<p>{note}</p>")
    return "\n".join(lines) + "\n"


def has_notes_content(
    bullets: list[str], notes: list[str], leftover_fields: list[tuple[str, str]]
) -> bool:
    return bool(bullets or notes or leftover_fields)


def insert_or_append(html: str, notes_html: str, heading_keywords: list[str]) -> tuple[str, str]:
    if notes_html.strip() and notes_html.strip() in html:
        return html, "already present (skipped append)"
    for keyword in heading_keywords:
        k = re.escape(keyword.strip())
        if not k:
            continue
        pattern = re.compile(rf"(<h[1-6][^>]*>[^<]*{k}[^<]*</h[1-6]>)", flags=re.I)
        match = pattern.search(html)
        if match:
            return html[: match.end()] + notes_html + html[match.end() :], f"inserted under '{keyword.strip()}'"
    return html + notes_html, "appended at bottom"


def parse_field_args(raw_fields: list[str]) -> list[tuple[str, str]]:
    parsed: list[tuple[str, str]] = []
    for item in raw_fields:
        if "=" not in item:
            raise ValueError(f"Invalid --field '{item}'. Use Label=Value format.")
        label, value = item.split("=", 1)
        label = label.strip()
        value = value.strip()
        if not label:
            raise ValueError(f"Invalid --field '{item}'. Label cannot be empty.")
        parsed.append((label, value))
    return parsed


WA_SECTION_TITLES = [
    "Merchant Overview",
    "Evidence Log (Working Links)",
    "Platform & Site Structure",
    "Catalog & Products",
    "Checkout & Payments",
    "Shipping & Logistics",
    "Loyalty, Subscriptions, and CRM",
    "Internationalization Testing",
    "Legal and Compliance",
    "Business Restrictions",
    "Apps, Integrations, and Data Layer",
    "Tech Risks and Integration Notes",
    "Open Questions",
    "Next Steps",
    "Appendix",
    "Legend",
]


def normalize_heading(heading: str) -> str:
    return re.sub(r"\s+", " ", heading.strip().lower())


def parse_wa_sections(wa_text: str) -> OrderedDict[str, str]:
    normalized_titles = {normalize_heading(title): title for title in WA_SECTION_TITLES}
    sections: OrderedDict[str, list[str]] = OrderedDict()
    current_title: str | None = None

    for raw_line in wa_text.splitlines():
        line = raw_line.strip()
        if not line:
            if current_title is not None:
                sections[current_title].append("")
            continue

        heading_candidate = line.lstrip("#").strip()
        heading_candidate = re.sub(r"^[-*]\s*", "", heading_candidate).strip()
        heading_key = normalize_heading(heading_candidate)
        matched_title = normalized_titles.get(heading_key)
        if matched_title:
            current_title = matched_title
            sections.setdefault(matched_title, [])
            continue

        if current_title is not None:
            sections[current_title].append(line)

    collapsed: OrderedDict[str, str] = OrderedDict()
    for title, lines in sections.items():
        value = "\n".join(lines).strip()
        if value:
            collapsed[title] = value
    if len(collapsed) >= 2:
        return collapsed

    # Fallback for flattened Jira text where section titles are inline.
    normalized = re.sub(r"\s+", " ", wa_text).strip()
    if not normalized:
        return collapsed

    sorted_titles = sorted(WA_SECTION_TITLES, key=len, reverse=True)
    markers: dict[str, str] = {}
    for idx, title in enumerate(sorted_titles):
        marker = f"@@WA_SECTION_{idx}@@"
        pattern = re.compile(re.escape(title), flags=re.I)
        normalized, count = pattern.subn(f"\n{marker}\n", normalized)
        if count:
            markers[marker] = title

    fallback_sections: OrderedDict[str, list[str]] = OrderedDict()
    current_title: str | None = None
    for line in normalized.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped in markers:
            current_title = markers[stripped]
            fallback_sections.setdefault(current_title, [])
            continue
        if current_title is not None:
            fallback_sections[current_title].append(stripped)

    collapsed = OrderedDict()
    for title, lines in fallback_sections.items():
        value = "\n".join(lines).strip()
        if value:
            collapsed[title] = value
    return collapsed


def format_wa_value_html(raw_value: str) -> str:
    lines = [line.strip() for line in raw_value.splitlines() if line.strip()]
    if not lines:
        return ""

    bullet_items: list[str] = []
    plain_items: list[str] = []
    for line in lines:
        match = re.match(r"^[\-\*\u2022]\s*(.+)$", line)
        if match:
            bullet_items.append(match.group(1).strip())
        else:
            plain_items.append(line)

    chunks: list[str] = []
    if plain_items:
        chunks.append("<br/>".join(plain_items))
    if bullet_items:
        chunks.append("<ul>" + "".join(f"<li>{item}</li>" for item in bullet_items) + "</ul>")
    return "".join(chunks)


def wa_section_label_candidates(section_title: str) -> list[str]:
    candidates: list[str] = [section_title]
    without_parens = re.sub(r"\s*\([^)]*\)", "", section_title).strip()
    if without_parens and without_parens not in candidates:
        candidates.append(without_parens)

    if "&" in without_parens:
        and_form = without_parens.replace("&", "and").strip()
        if and_form and and_form not in candidates:
            candidates.append(and_form)

    if "and" in without_parens.lower():
        amp_form = re.sub(r"\band\b", "&", without_parens, flags=re.I).strip()
        if amp_form and amp_form not in candidates:
            candidates.append(amp_form)

    # Common alternative seen in some DNA templates.
    if section_title == "Shipping & Logistics":
        candidates.append("Shipping, Logistics, Fulfillment")

    return candidates


def parse_wa_file_fields(path: str) -> list[tuple[str, str]]:
    try:
        with open(path, encoding="utf-8") as f:
            wa_text = f.read()
    except OSError as exc:
        raise ValueError(f"Failed reading --wa-file '{path}': {exc}") from exc

    sections = parse_wa_sections(wa_text)
    return wa_sections_to_fields(sections)


def wa_sections_to_fields(sections: OrderedDict[str, str]) -> list[tuple[str, str]]:
    parsed: list[tuple[str, str]] = []
    for title, value in sections.items():
        html_value = format_wa_value_html(value)
        if html_value:
            parsed.append((title, html_value))
    return parsed


def extract_jira_key(raw_value: str) -> str | None:
    raw = raw_value.strip()
    if not raw:
        return None

    match = re.search(r"\b([A-Z][A-Z0-9]+-\d+)\b", raw)
    if match:
        return match.group(1)

    selected_issue = re.search(
        r"(?:\?|&)selectedIssue=([A-Z][A-Z0-9]+-\d+)\b", raw, flags=re.I
    )
    if selected_issue:
        return selected_issue.group(1).upper()
    return None


def adf_node_to_text(node: dict[str, Any]) -> str:
    node_type = node.get("type")
    content = node.get("content", [])

    if node_type == "text":
        return str(node.get("text", ""))
    if node_type == "hardBreak":
        return "\n"

    child_text = "".join(adf_node_to_text(child) for child in content)
    if node_type == "heading":
        return f"{child_text.strip()}\n"
    if node_type == "paragraph":
        text = child_text.strip()
        return f"{text}\n" if text else ""
    if node_type == "listItem":
        text = child_text.strip()
        return f"{text}\n" if text else ""
    if node_type == "bulletList":
        items: list[str] = []
        for child in content:
            line = adf_node_to_text(child).strip()
            if line:
                items.append(f"- {line}")
        return "\n".join(items) + ("\n" if items else "")
    if node_type == "orderedList":
        items = []
        for idx, child in enumerate(content, start=1):
            line = adf_node_to_text(child).strip()
            if line:
                items.append(f"{idx}. {line}")
        return "\n".join(items) + ("\n" if items else "")

    return child_text


def adf_description_to_text(description: Any) -> str:
    if isinstance(description, str):
        return description
    if not isinstance(description, dict):
        return ""
    content = description.get("content", [])
    text = "".join(adf_node_to_text(node) for node in content)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def fetch_wa_fields_from_jira(
    base_url: str, jira_issue_key: str, email: str, token: str
) -> list[tuple[str, str]]:
    issue_url = (
        f"{base_url.rstrip('/')}/rest/api/3/issue/{jira_issue_key}"
        "?fields=summary,description"
    )
    issue = api_json("GET", issue_url, email, token)
    fields = issue.get("fields", {})
    if not isinstance(fields, dict):
        return []
    description = adf_description_to_text(fields.get("description"))
    sections = parse_wa_sections(description)
    return wa_sections_to_fields(sections)


def parse_replace_args(raw_replacements: list[str]) -> list[tuple[str, str]]:
    parsed: list[tuple[str, str]] = []
    for item in raw_replacements:
        if "=" not in item:
            raise ValueError(f"Invalid --replace '{item}'. Use PLACEHOLDER=Value format.")
        placeholder, value = item.split("=", 1)
        placeholder = placeholder.strip()
        value = value.strip()
        if not placeholder:
            raise ValueError(f"Invalid --replace '{item}'. Placeholder cannot be empty.")
        parsed.append((placeholder, value))
    return parsed


def parse_key_value_pairs(raw_items: list[str], flag_name: str) -> list[tuple[str, str]]:
    parsed: list[tuple[str, str]] = []
    for item in raw_items:
        if "=" not in item:
            raise ValueError(f"Invalid {flag_name} '{item}'. Use Key=Value format.")
        key, value = item.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            raise ValueError(f"Invalid {flag_name} '{item}'. Key cannot be empty.")
        parsed.append((key, value))
    return parsed


def parse_cleanup_blocks(raw_items: list[str]) -> list[tuple[str, str]]:
    parsed: list[tuple[str, str]] = []
    for item in raw_items:
        if "||" not in item:
            raise ValueError(
                f"Invalid --cleanup-block '{item}'. Use START||END format."
            )
        start, end = item.split("||", 1)
        start = start.strip()
        end = end.strip()
        if not start or not end:
            raise ValueError(
                f"Invalid --cleanup-block '{item}'. START and END must be non-empty."
            )
        parsed.append((start, end))
    return parsed


def apply_common_placeholder_patterns(
    html: str, deal_link: str | None, assessment_link: str | None
) -> tuple[str, list[str]]:
    replaced: list[str] = []
    replacement_specs: list[tuple[str, str]] = []

    if deal_link:
        replacement_specs.extend(
            [
                (r"\{\{\s*deal[_\s-]*link\s*\}\}", deal_link),
                (r"\[\[\s*deal[_\s-]*link\s*\]\]", deal_link),
                (r"<\s*deal[_\s-]*link\s*>", deal_link),
                (r"\bTBD[_\s-]*DEAL[_\s-]*LINK\b", deal_link),
            ]
        )
    if assessment_link:
        replacement_specs.extend(
            [
                (r"\{\{\s*assessment(?:[_\s-]*(?:link|jira))?\s*\}\}", assessment_link),
                (r"\[\[\s*assessment(?:[_\s-]*(?:link|jira))?\s*\]\]", assessment_link),
                (r"<\s*assessment(?:[_\s-]*(?:link|jira))?\s*>", assessment_link),
                (r"\bTBD[_\s-]*(?:ASSESSMENT|JIRA)(?:[_\s-]*LINK)?\b", assessment_link),
            ]
        )

    out = html
    for pattern, value in replacement_specs:
        out, count = re.subn(pattern, value, out, flags=re.I)
        if count:
            replaced.append(pattern)
    return out, replaced


def apply_exact_replacements(html: str, replacements: list[tuple[str, str]]) -> tuple[str, list[str]]:
    out = html
    changed: list[str] = []
    for placeholder, value in replacements:
        if placeholder in out:
            out = out.replace(placeholder, value)
            changed.append(placeholder)
    return out, changed


def insert_answers_after_prompts(
    html: str, prompt_answers: list[tuple[str, str]]
) -> tuple[str, list[str]]:
    out = html
    inserted: list[str] = []
    for prompt, answer in prompt_answers:
        if answer in out:
            continue

        if prompt not in out:
            continue

        # Plain text-like storage body.
        replacement_plain = f"{prompt}\n{answer}"
        new_out = out.replace(prompt, replacement_plain, 1)
        if new_out != out:
            out = new_out
            inserted.append(prompt)
            continue

        # HTML-like storage body fallback.
        pattern = re.compile(re.escape(prompt), flags=re.I)
        out2, count = pattern.subn(lambda m: f"{m.group(0)}<br/>{answer}", out, count=1)
        if count:
            out = out2
            inserted.append(prompt)
    return out, inserted


def remove_cleanup_blocks(
    html: str, cleanup_blocks: list[tuple[str, str]]
) -> tuple[str, list[str]]:
    out = html
    removed: list[str] = []
    for start, end in cleanup_blocks:
        pattern = re.compile(
            rf"(?:\n{{0,2}}){re.escape(start)}.*?(?:\n{{0,2}}){re.escape(end)}",
            flags=re.S,
        )
        out2, count = pattern.subn(end, out, count=1)
        if count:
            out = out2
            removed.append(start)
    return out, removed


def remove_sections_by_title(
    html: str, section_titles: list[str]
) -> tuple[str, list[str]]:
    out = html
    removed: list[str] = []
    for title in section_titles:
        title_text = title.strip()
        if not title_text:
            continue
        pattern = re.compile(
            rf"<h[1-6][^>]*>\s*{re.escape(title_text)}\s*</h[1-6]>.*?(?=<h[1-6][^>]*>|$)",
            flags=re.I | re.S,
        )
        out2, count = pattern.subn("", out, count=1)
        if count:
            out = out2
            removed.append(title_text)
    return out, removed


def normalize_table_field_labels(
    html: str, labels: list[str]
) -> tuple[str, list[str]]:
    out = html
    normalized: list[str] = []
    for label in labels:
        clean_label = label.strip()
        if not clean_label:
            continue
        escaped = re.escape(clean_label).replace(r"\ ", r"\s*")
        pattern = re.compile(
            rf"(<tr[^>]*>\s*<(?:td|th)[^>]*>)(.*?{escaped}.*?)(</(?:td|th)>\s*<(?:td|th)[^>]*>.*?</(?:td|th)>\s*</tr>)",
            flags=re.I | re.S,
        )
        replacement = rf"\1<p><strong>{clean_label}</strong></p>\3"
        out2, count = pattern.subn(replacement, out, count=1)
        if count:
            out = out2
            normalized.append(clean_label)
    return out, normalized


def main() -> int:
    args = parse_args()

    email = os.getenv("JIRA_EMAIL")
    token = os.getenv("JIRA_API_TOKEN")
    if not email or not token:
        print("Missing JIRA_EMAIL or JIRA_API_TOKEN in environment.", file=sys.stderr)
        return 2

    get_url = f"{args.base_url.rstrip('/')}/wiki/api/v2/pages/{args.page_id}?body-format=storage"
    page = api_json("GET", get_url, email, token)
    if "id" not in page or "body" not in page:
        print(f"Unexpected API response: {json.dumps(page)[:500]}", file=sys.stderr)
        return 3

    body = page["body"]["storage"]["value"]
    body, jira_section, jira_placeholder = split_jira_section(body)

    # 1) Old workflow first: direct placeholder replacements.
    replaced_common: list[str] = []
    body, replaced_common = apply_common_placeholder_patterns(
        body, args.deal_link, args.assessment_link
    )
    exact_replacements = parse_replace_args(args.replace)
    body, replaced_exact = apply_exact_replacements(body, exact_replacements)

    cleanup_blocks = parse_cleanup_blocks(args.cleanup_block)
    body, removed_blocks = remove_cleanup_blocks(body, cleanup_blocks)
    body, removed_sections = remove_sections_by_title(body, args.remove_section_title)
    body, normalized_labels = normalize_table_field_labels(body, args.normalize_field_label)

    # 2) Then field-based updates for existing structure.
    fields: list[tuple[str, str]] = parse_field_args(args.field)
    if args.wa_file:
        fields.extend(parse_wa_file_fields(args.wa_file))
    jira_source = args.wa_jira_key or args.wa_jira_url
    if jira_source:
        jira_key = extract_jira_key(jira_source)
        if not jira_key:
            raise ValueError(
                "Could not extract Jira issue key from --wa-jira-key/--wa-jira-url value."
            )
        fields.extend(fetch_wa_fields_from_jira(args.base_url, jira_key, email, token))

    prompt_answers = parse_key_value_pairs(args.answer_after, "--answer-after")
    body, inserted_prompts = insert_answers_after_prompts(body, prompt_answers)

    leftover_fields: list[tuple[str, str]] = []
    changed_fields: list[str] = []
    for label, value in fields:
        updated = False
        for candidate_label in wa_section_label_candidates(label):
            body, candidate_updated = replace_field(body, candidate_label, value)
            if candidate_updated:
                updated = True
                break
        if updated:
            changed_fields.append(label)
        else:
            leftover_fields.append((label, value))

    placement = "no notes supplied"
    if has_notes_content(args.bullet, args.note, leftover_fields):
        notes_html = build_notes_html(
            section_title=args.section_title,
            bullets=args.bullet,
            notes=args.note,
            leftover_fields=leftover_fields,
        )
        keywords = [k.strip() for k in args.insert_under.split(",")]
        body, placement = insert_or_append(body, notes_html, keywords)

    body = restore_jira_section(body, jira_section, jira_placeholder)
    ensure_jira_section_unchanged(jira_section, body)

    payload = {
        "id": page["id"],
        "status": "current",
        "title": page["title"],
        "body": {"representation": "storage", "value": body},
        "version": {"number": page["version"]["number"] + 1},
    }

    with open(args.payload_out, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))

    if args.dry_run:
        print("Dry run complete.")
        print(f"Payload written to: {args.payload_out}")
        print(
            f"Placeholder replacements: {len(replaced_exact)} exact, {len(replaced_common)} pattern"
        )
        print(f"Cleanup blocks removed: {len(removed_blocks)}")
        print(f"Sections removed by title: {len(removed_sections)}")
        print(f"Field labels normalized: {len(normalized_labels)}")
        print(f"Prompt answers inserted: {len(inserted_prompts)}")
        print(f"Updated fields: {', '.join(changed_fields) if changed_fields else 'none'}")
        print(f"Unmatched fields moved to notes: {len(leftover_fields)}")
        if leftover_fields:
            print("Unmatched field labels: " + ", ".join(k for k, _ in leftover_fields))
        print(f"Notes placement: {placement}")
        return 0

    put_url = f"{args.base_url.rstrip('/')}/wiki/api/v2/pages/{args.page_id}"
    result = api_json("PUT", put_url, email, token, payload=payload)
    print(
        json.dumps(
            {
                "status": "updated",
                "pageId": result.get("id"),
                "title": result.get("title"),
                "version": result.get("version", {}).get("number"),
                "exactPlaceholderReplacements": replaced_exact,
                "patternPlaceholderReplacements": replaced_common,
                "cleanupBlocksRemoved": removed_blocks,
                "sectionsRemovedByTitle": removed_sections,
                "fieldLabelsNormalized": normalized_labels,
                "promptAnswersInserted": inserted_prompts,
                "updatedFields": changed_fields,
                "notesPlacement": placement,
                "leftoverFields": [k for k, _ in leftover_fields],
            },
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
