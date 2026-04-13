from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PAGE_JSON_PATH = ROOT / "logs" / "confluence" / "members-only-dna-page.json"
OUTPUT_DIR = ROOT / "logs" / "confluence"
BODY_HTML_PATH = OUTPUT_DIR / "members-only-body.html"
PAYLOAD_JSON_PATH = OUTPUT_DIR / "members-only-update.json"
WA_PATH = ROOT / "logs" / "assessments" / "2026-04-06_membersonly.com_WA.md"

HUBSPOT_URL = "https://app.hubspot.com/contacts/2462094/record/0-3/2894527616"


def p(text: str) -> str:
    return f"<p>{text}</p>"


def replace_exact(text: str, old: str, new: str) -> str:
    if old not in text:
        raise ValueError(f"Expected snippet not found: {old[:80]}")
    return text.replace(old, new, 1)


def replace_row_value(body: str, label: str, new_value_html: str) -> str:
    pattern = re.compile(
        rf"(<tr><(?:td|th)[^>]*>\s*<p><strong>\s*{re.escape(label)}\s*</strong></p>"
        rf"(?:<p><em>.*?</em></p>)?\s*</(?:td|th)>\s*<td[^>]*>)(.*?)(</td></tr>)",
        re.S,
    )
    updated, count = pattern.subn(rf"\1{new_value_html}\3", body, count=1)
    if count != 1:
        raise ValueError(f"Could not replace row for label: {label}")
    return updated


def replace_section_table(body: str, heading: str, new_table_html: str) -> str:
    pattern = re.compile(rf"(<h[12][^>]*>.*?{re.escape(heading)}.*?</h[12]>.*?)(<table.*?</table>)", re.S)
    match = pattern.search(body)
    if not match:
        raise ValueError(f"Could not find table for heading: {heading}")
    start, end = match.span(2)
    return body[:start] + new_table_html + body[end:]


def inject_after_macro(body: str, heading: str, new_html: str) -> str:
    pattern = re.compile(
        rf"(<h2[^>]*>.*?{re.escape(heading)}.*?</h2><ac:structured-macro.*?</ac:structured-macro>)",
        re.S,
    )
    match = pattern.search(body)
    if not match:
        raise ValueError(f"Could not find macro block for heading: {heading}")
    return body[: match.end(1)] + new_html + body[match.end(1) :]


def build_risks_table() -> str:
    return (
        '<table data-table-width="1800" data-layout="center" ac:local-id="17023163-040b-44ed-bda9-5ae5a3521abb">'
        "<tbody>"
        "<tr><th><p><strong>Topic</strong></p></th><th><p><strong>Solution / Details</strong></p></th></tr>"
        "<tr><td>"
        + p("Cross-border scope")
        + "</td><td>"
        + p(
            "Current public flow appears limited to US domestic plus Canada and Mexico. Duties and taxes are not prepaid, and the Mexico market switch showed unstable checkout behavior during testing. Presales should confirm target market rollout, expected landed-cost model, and whether broader international expansion is planned."
        )
        + "</td></tr>"
        "<tr><td>"
        + p("Yotpo")
        + "</td><td>"
        + p(
            "Yotpo reviews are live on PDP. Because Yotpo support remains partial/in progress, any review- or loyalty-adjacent expectations should be caveated early and validated in discovery."
        )
        + "</td></tr>"
        "<tr><td>"
        + p("Product personalization / embroidery")
        + "</td><td>"
        + p(
            "The tested PDP supports paid embroidery via Zepto Product Personalizer. We should confirm how customization data is stored on the line item, how it flows into downstream order data, and whether any operational handling is required."
        )
        + "</td></tr>"
        "<tr><td>"
        + p("International returns")
        + "</td><td>"
        + p(
            "Current returns policy excludes shipments outside the contiguous United States. If cross-border growth is in scope, the business will need a clear returns posture before rollout."
        )
        + "</td></tr>"
        "</tbody></table>"
    )


def build_api_usage_table() -> str:
    return (
        '<table data-table-width="1800" data-layout="wide" ac:local-id="5c054555-d177-430c-ac64-07717f600aed">'
        '<colgroup><col style="width: 197.0px;" /><col style="width: 454.0px;" /><col style="width: 309.0px;" /></colgroup>'
        "<tbody>"
        "<tr><th><p><strong>API endpoint</strong></p></th><th><p><strong>from / to</strong></p></th><th><p><strong>Context and details</strong></p></th></tr>"
        "<tr><td>"
        + p("No public Global-e API usage identified")
        + "</td><td>"
        + p("Shopify storefront / Shopify hosted checkout")
        + "</td><td>"
        + p(
            "Public assessment showed a standard Shopify theme plus hosted checkout. No direct Global-e API surfaces were visible from the storefront pass. Assume standard platform-led integration unless implementation discovery uncovers custom services."
        )
        + "</td></tr>"
        "</tbody></table>"
    )


def build_apps_table() -> str:
    rows = [
        (
            "Yotpo",
            "Reviews widget is live on PDP. Support caveat applies because Yotpo is still partial/in progress in the current support matrix.",
            "Review during app assessment. Confirm there is no Yotpo loyalty or checkout dependency in scope.",
        ),
        (
            "Afterpay",
            "BNPL is visible on-site and in checkout. Need confirmation on enabled markets and whether CA or MX have any restrictions.",
            "Likely manageable. Validate exact market coverage and shopper messaging during discovery.",
        ),
        (
            "Kiwi Sizing",
            "Sizing-chart widget is present on PDP. Usually storefront-only, but it should still be reviewed for any theme or localization dependencies.",
            "Low risk from the public pass; include in app review.",
        ),
        (
            "Zepto Product Personalizer",
            "Embroidery/customization flow is visible on PDP. Need to confirm line-item properties, order data mapping, and any downstream fulfillment dependency.",
            "Discovery required before sign-off because customization can affect catalog and operations.",
        ),
    ]
    cells = [
        "<tr><th><p><strong>App Name</strong></p></th><th><p><strong>Issue (Potential or known)</strong></p></th><th><p><strong>Status/Resolution/Merchant Sign-off</strong></p></th></tr>"
    ]
    for app_name, issue, status in rows:
        cells.append(
            "<tr><td>"
            + p(app_name)
            + "</td><td>"
            + p(issue)
            + "</td><td>"
            + p(status)
            + "</td></tr>"
        )
    return (
        '<table data-table-width="1800" data-layout="wide" ac:local-id="bc2b798d-77e7-4870-a73d-348533a5d68e">'
        '<colgroup><col style="width: 197.0px;" /><col style="width: 454.0px;" /><col style="width: 309.0px;" /></colgroup>'
        "<tbody>"
        + "".join(cells)
        + "</tbody></table>"
    )


def main() -> None:
    page = json.loads(PAGE_JSON_PATH.read_text())
    _ = WA_PATH.read_text()
    body = page["body"]["storage"]["value"]

    body = replace_exact(
        body,
        "<p><strong>Hubspot URL:</strong> [[TODO]]</p>",
        f'<p><strong>Hubspot URL:</strong> <a href="{HUBSPOT_URL}">{HUBSPOT_URL}</a></p>',
    )

    body = replace_section_table(body, "Risks / Workarounds / Custom Solutions:", build_risks_table())
    body = replace_section_table(body, "Global-e API Usage", build_api_usage_table())
    body = replace_section_table(body, "3rd Party Apps / Integrations", build_apps_table())

    storefront_values = {
        "IPGeolocation": p(
            "Not confirmed in the public pass. A country selector is visible, but there was no hard evidence of IP-driven redirection or locale assignment. Treat as unconfirmed until merchant confirms current behavior."
        ),
        "Country / Currency Switcher": p(
            "Visible on storefront and checkout. Current behavior appears platform-managed through Shopify markets/store configuration rather than a GE-owned switcher. USD and CAD were observed directly; Mexico support is claimed in policy but needs retesting."
        ),
        "Marketing Banner": p(
            'Homepage messaging includes "Free 2nd Day Air Shipping Over $50." This appears to be theme-managed storefront content and should remain merchant owned.'
        ),
        "Translations": p("No language selector or multilingual storefront behavior was detected in this pass. Current public experience appears English-only."),
    }
    for label, value in storefront_values.items():
        body = replace_row_value(body, label, value)

    pricing_values = {
        "Fixed price": p(
            "Localized currency behavior is visible: USD on the default US flow and CAD after switching checkout country to Canada. No direct proof of market-specific fixed-price books was visible from the public pass."
        ),
        "Free Orders": p("No influencer, gratis, or free-order workflow was detected publicly."),
        "Coupons/Promotions/Discounts": p(
            "Standard Shopify discount code / gift card field is present in checkout. No advanced promotion engine or custom discount workflow was visible during testing."
        ),
        "GWP / Try &amp; Buy / Free Products": p("No gift-with-purchase, try-before-you-buy, or auto-add free product flow was detected."),
        "Subscriptions": p(
            "No subscription engine or recurring-order flow was detected. Keep out of baseline scope unless the merchant raises it explicitly."
        ),
        "B2B": p("No wholesale or B2B-specific international flow was visible from the public storefront."),
        "Loyalty Program / Rewards Program": p(
            "No loyalty or rewards program was detected. This is a positive signal because Smile.io was not found in the public pass."
        ),
        "Gift Cards": p(
            "Gift cards are sold on-site and checkout supports gift-card redemption. Discovery should confirm whether gift cards are intended to work cross-border."
        ),
    }
    for label, value in pricing_values.items():
        body = replace_row_value(body, label, value)

    catalog_values = {
        "Customizable products": p(
            "Yes. The tested apparel PDP offered paid embroidery. Discovery should confirm which products support customization and how the customization payload appears in order data."
        ),
        "Restricted Products": p("No clear restricted-product tagging or exclusion mechanism was visible in the public pass. Merchant confirmation required."),
        "Bundles!!!!": p("No bundles or kits were detected on tested pages."),
        "Virtual / Digital products": p("Gift cards are sold on-site, so at least one digital/non-shippable product type exists."),
        "Repairs / Services Cost": p("No repair or service-cost flow was detected."),
        "Dangerous Goods": p("No obvious dangerous-goods categories were visible. Assortment appears apparel-led."),
        "CITES": p("No CITES-sensitive products were identified in the public pass."),
        "Glasses/Contact lenses": p("Not detected."),
        "Jewelry or items with PRECIOUS STONES": p("Not detected from the public pass."),
        "Knives / Cutlery": p("Not detected."),
        "Iron / Steel products": p("Not detected."),
        "Cosmetics": p("Not detected."),
        "Ugly Freight": p("Unlikely based on the apparel-led assortment; no ugly-freight indicators were visible."),
        "Business restrictions": p("No business-specific product restriction handling was visible publicly."),
        "Manufacturers Identification (MID)": p(
            "Unconfirmed. Only relevant if applicable COO/order-value thresholds are in scope. Ops/catalog confirmation required."
        ),
        "Pre-orders": p("No pre-order flow was detected."),
        "Product Information": p(
            "Product data appears to be maintained directly in Shopify using standard variants plus third-party widgets for reviews, sizing, and personalization."
        ),
        "Product Updates": p("Not visible publicly. Likely standard Shopify catalog/admin updates unless discovery uncovers external feeds or APIs."),
    }
    for label, value in catalog_values.items():
        body = replace_row_value(body, label, value)

    sales_channel_values = {
        "Offline orders / Orders on behalf": p("No assisted-selling or offline-order workflow was visible publicly."),
        "Shopping feed (international markets)": p("Ad-tech is active, but no direct proof of international shopping-feed automation was captured in this pass."),
        "Drop shipping / Market Place": p("No marketplace or dropship model was visible from public navigation."),
        "Mobile App": p("No transactional mobile app was detected during this pass."),
    }
    for label, value in sales_channel_values.items():
        body = replace_row_value(body, label, value)

    body = inject_after_macro(
        body,
        "3B2C",
        p("No 3B2C requirement was surfaced in the public pass. Confirm in discovery whether any assisted-selling, B2B-injection, or xB2C use case exists."),
    )
    body = inject_after_macro(
        body,
        "Order Flow, Returns and Customer Services",
        p(
            "Current flow is standard Shopify hosted checkout. Returns are allowed within 30 days and exchanges within 45 days for contiguous US shipments, while international returns and exchanges are currently excluded. Tracking is handled via a dedicated tracking page referencing USPS or UPS tracking numbers."
        ),
    )
    body = inject_after_macro(
        body,
        "Architectural / Solution Details",
        p(
            "Public assessment indicates a standard Shopify theme plus Shopify hosted checkout rather than a custom headless implementation. The main discovery focus areas are cross-border scope, Yotpo caveats, and embroidery/personalization order-data handling."
        ),
    )
    body = inject_after_macro(
        body,
        "Architectural / Solution Details",
        "<ul>"
        "<li><p>Open question: Is Canada/Mexico the true long-term international scope, or are more markets planned?</p></li>"
        "<li><p>Open question: Does the merchant want duties and taxes shown and collected upfront, or is delivery-paid acceptable?</p></li>"
        "<li><p>Open question: Should gift cards and embroidery/customization remain in initial scope for cross-border rollout?</p></li>"
        "</ul>",
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    BODY_HTML_PATH.write_text(body)

    payload = {
        "id": page["id"],
        "type": page["type"],
        "title": page["title"],
        "version": {"number": page["version"]["number"] + 1},
        "body": {"storage": {"value": body, "representation": "storage"}},
    }
    PAYLOAD_JSON_PATH.write_text(json.dumps(payload, indent=2))

    print(f"Wrote {BODY_HTML_PATH}")
    print(f"Wrote {PAYLOAD_JSON_PATH}")


if __name__ == "__main__":
    main()
