from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PAGE_JSON_PATH = ROOT / "logs" / "confluence" / "toybox-dna-page.json"
OUTPUT_DIR = ROOT / "logs" / "confluence"
BODY_HTML_PATH = OUTPUT_DIR / "toybox-body.html"
PAYLOAD_JSON_PATH = OUTPUT_DIR / "toybox-update.json"
WA_PATH = ROOT / "logs" / "assessments" / "2026-03-10_toybox_WA.md"

HUBSPOT_URL = "https://app.hubspot.com/contacts/2462094/record/0-3/55478345364"


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
        + p("Custom subscription architecture")
        + "</td><td>"
        + p(
            "Toybox built a bespoke subscription-management service on its own server. It uses Shopify subscription contracts and native Shopify billing attempts rather than a third-party subscription platform. This is workable, but discovery must confirm the operational boundaries between merchant-owned logic and Shopify-owned payment objects."
        )
        + "</td></tr>"
        "<tr><td>"
        + p("Checkout separation requirement")
        + "</td><td>"
        + p(
            "Current agreed support model is to isolate subscription purchases into a dedicated checkout flow routed to GEM. Mixed carts that combine subscriptions with other catalog items are not supported under this design. This is the core commercial and UX trade-off to align with the merchant."
        )
        + "</td></tr>"
        "<tr><td>"
        + p("Discounting tied to subscriptions")
        + "</td><td>"
        + p(
            "Toybox applies broad cart discounts when a subscription is added, for example discounting the printer while forcing a subscription line into the order. The discount itself is native Shopify, but the business logic depends on the subscription item being present and should be validated carefully once checkout separation is introduced."
        )
        + "</td></tr>"
        "<tr><td>"
        + p("Business dependency on subscriptions")
        + "</td><td>"
        + p(
            "Merchant stated that about 70% of printer buyers also buy a subscription and that the majority of their charge volume is subscription-based. Any solution constraint around mixed carts or checkout routing has meaningful conversion and revenue impact."
        )
        + "</td></tr>"
        "<tr><td>"
        + p("Digital / app ecosystem")
        + "</td><td>"
        + p(
            "Toybox also has app-related subscription handling involving Apple Pay and Google. Merchant said these flows are separate and use standard provider behavior, but they still increase scope complexity and should remain out of baseline until explicitly reviewed."
        )
        + "</td></tr>"
        "</tbody></table>"
    )


def build_api_usage_table() -> str:
    rows = [
        (
            "Shopify Subscription Contracts API",
            "Toybox server <-> Shopify",
            "Merchant's custom subscription service keeps most subscription state itself but relies on Shopify's subscription contract model.",
        ),
        (
            "subscriptionBillingAttemptCreate",
            "Toybox server -> Shopify",
            "Merchant server triggers recurring billing attempts directly through Shopify. Shopify then charges the shopper, sends emails, and performs normal Shopify processing.",
        ),
        (
            "Shopify webhooks",
            "Shopify -> Toybox server",
            "Merchant receives a webhook after the initial order creates a subscription contract and then begins recurring processing from its own server.",
        ),
    ]
    cells = [
        "<tr><th><p><strong>API endpoint</strong></p></th><th><p><strong>from / to</strong></p></th><th><p><strong>Context and details</strong></p></th></tr>"
    ]
    for endpoint, src_dst, details in rows:
        cells.append(
            "<tr><td>"
            + p(endpoint)
            + "</td><td>"
            + p(src_dst)
            + "</td><td>"
            + p(details)
            + "</td></tr>"
        )
    return (
        '<table data-table-width="1800" data-layout="wide" ac:local-id="5c054555-d177-430c-ac64-07717f600aed">'
        '<colgroup><col style="width: 197.0px;" /><col style="width: 454.0px;" /><col style="width: 309.0px;" /></colgroup>'
        "<tbody>"
        + "".join(cells)
        + "</tbody></table>"
    )


def build_apps_table() -> str:
    rows = [
        (
            "Toybox Plus private Shopify app / custom subscription service",
            "This is the merchant's own bespoke subscription infrastructure rather than a standard external app. It is central to scope because recurring billings are orchestrated by the merchant server.",
            "Requires architectural validation. Treat as custom integration logic rather than a standard supported subscription partner.",
        ),
        (
            "Amazon Pay",
            "Visible on cart as an express wallet. Need to confirm expected behavior for international flows and whether it remains on any non-GEM paths.",
            "Low-to-medium risk. Validate wallet expectations during checkout design.",
        ),
        (
            "Shop Pay",
            "Detected on-site and likely part of the existing native Shopify checkout experience.",
            "Validate whether it applies only to standard Shopify checkout flows or needs any merchant expectation management once checkouts are separated.",
        ),
        (
            "Rep.ai",
            "Chat / AI assistant detected in the storefront network traffic. Usually storefront-only but should be included in app review.",
            "Low risk from the public pass; include in app assessment.",
        ),
        (
            "Creator Space / make.toys",
            "Separate domain is used for parts of the customer experience and legal content, and the merchant referenced app-related Apple/Google subscription flows.",
            "Confirm whether this remains fully separate from the ecommerce checkout scope.",
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
        "IPGeolocation": p("Not confirmed. Public storefront showed no clear IP-driven routing or market detection."),
        "Country / Currency Switcher": p(
            "No country or currency selector was visible. Current experience appears US-centric and platform-managed with standard Shopify behavior rather than a GE-owned switcher."
        ),
        "Marketing Banner": p(
            'Homepage messaging emphasizes printer pricing and subscription-led value, including "Starting at $18/month." This is merchant-managed storefront content.'
        ),
        "Translations": p(
            "English-only storefront from the public pass. A translation-missing string appeared on cart, which suggests i18n is incomplete even before broader internationalization."
        ),
    }
    for label, value in storefront_values.items():
        body = replace_row_value(body, label, value)

    pricing_values = {
        "Fixed price": p(
            "Public storefront showed USD pricing only. No market-based currency switching or localized price books were visible."
        ),
        "Free Orders": p("No free-order or influencer-order workflow was detected."),
        "Coupons/Promotions/Discounts": p(
            "Discounting is primarily native Shopify. Merchant explained that subscription offers can discount the printer or broader cart when a subscription line item is included. This logic should be revalidated if subscription checkout is separated."
        ),
        "GWP / Try &amp; Buy / Free Products": p(
            "No explicit GWP or try-before-you-buy flow was detected. Bundles and discounted starter offers are present instead."
        ),
        "Subscriptions": p(
            "Subscriptions are handled by the merchant's own service using Shopify subscription contracts and Shopify billing attempts. Initial purchase happens in Shopify native checkout today, while recurring charges are later triggered by the merchant server. Approved support model requires separating subscription purchases into their own GEM checkout path, with no mixed carts containing subscriptions plus other items."
        ),
        "B2B": p("No B2B or wholesale process was visible. Terms indicate a consumer-only business model."),
        "Loyalty Program / Rewards Program": p("No loyalty or rewards program was detected."),
        "Gift Cards": p(
            "Gift cards are sold on-site. They should be treated as digital/non-physical scope unless the merchant confirms a specific international handling model."
        ),
    }
    for label, value in pricing_values.items():
        body = replace_row_value(body, label, value)

    catalog_values = {
        "Customizable products": p("No configurable or personalized products were detected."),
        "Restricted Products": p(
            "No explicit product restriction framework was visible publicly. Merchant sells consumer 3D printers and accessories, so operational review should confirm whether any hardware attributes create lane restrictions."
        ),
        "Bundles!!!!": p(
            "Yes. Multiple bundled SKUs are visible, including printer bundles, filament bundles, and offers that combine hardware with membership value."
        ),
        "Virtual / Digital products": p(
            "Yes. Digital scope includes Bolts currency, gift cards, and recurring memberships. These should be treated carefully and likely remain outside baseline physical cross-border scope."
        ),
        "Repairs / Services Cost": p("No repair-service SKU or service-cost product flow was detected from the public pass."),
        "Dangerous Goods": p(
            "Printers are consumer electronics. No visible lithium or hazmat warning was found, but Ops should confirm there are no battery or DG constraints."
        ),
        "CITES": p("No CITES-sensitive assortment was visible."),
        "Glasses/Contact lenses": p("Not detected."),
        "Jewelry or items with PRECIOUS STONES": p("Not detected."),
        "Knives / Cutlery": p("Not detected."),
        "Iron / Steel products": p("Not detected as a meaningful catalog concern from the public pass."),
        "Cosmetics": p("Not detected."),
        "Ugly Freight": p(
            "Not an obvious issue from the public pass, but printer hardware dimensions and bundle packaging should still be reviewed for lane-specific shipping constraints."
        ),
        "Business restrictions": p("No business-specific catalog restriction handling was visible publicly."),
        "Manufacturers Identification (MID)": p(
            "Unconfirmed. Could become relevant for electronics into the US depending on COO and value thresholds."
        ),
        "Pre-orders": p("No pre-order flow was detected."),
        "Product Information": p(
            "Catalog appears to be managed in Shopify with standard product pages, collection filters, bundles, and digital product entries."
        ),
        "Product Updates": p("Not visible publicly. Likely standard Shopify admin updates unless discovery uncovers separate feeds."),
    }
    for label, value in catalog_values.items():
        body = replace_row_value(body, label, value)

    sales_channel_values = {
        "Offline orders / Orders on behalf": p("No offline-order or assisted-selling workflow was visible."),
        "Shopping feed (international markets)": p("Unconfirmed. No direct international shopping-feed automation was identified in the public pass."),
        "Drop shipping / Market Place": p("Amazon marketplace presence is confirmed, but no dropship model was surfaced."),
        "Mobile App": p(
            "Yes, effectively app-connected. The merchant referenced app subscription/payment handling involving Apple Pay and Google, which should be treated as a separate ecosystem from the core Shopify storefront."
        ),
    }
    for label, value in sales_channel_values.items():
        body = replace_row_value(body, label, value)

    body = inject_after_macro(
        body,
        "3B2C",
        p("No 3B2C requirement was surfaced from the public pass or the technical call."),
    )
    body = inject_after_macro(
        body,
        "Order Flow, Returns and Customer Services",
        p(
            "Current initial purchase flow uses a single native Shopify checkout where shoppers can buy a printer and subscription together in one order. After purchase, Shopify creates the subscription contract and the merchant's own server takes over recurring billing orchestration. Customers can cancel or resume subscriptions through the merchant website; pause is effectively handled as cancel/resume. If the agreed GEM support model is adopted, subscriptions must move to a separate checkout path and can no longer be purchased together with other catalog items."
        ),
    )
    body = inject_after_macro(
        body,
        "Order Flow, Returns and Customer Services",
        p(
            "Returns policy is relatively generous: six months for printers and thirty days for accessories, subscriptions, and Printer Food, with prepaid labels offered in some cases. International return nuances for UK, EU, and Canada are mentioned in policy but not validated in live checkout."
        ),
    )
    body = inject_after_macro(
        body,
        "Architectural / Solution Details",
        p(
            "Toybox is standard Shopify on the storefront side, but subscriptions are not standard. The merchant built a custom service running on its own server that uses Shopify subscription contracts, Shopify tokenization, and native billing attempts. The merchant does not store payment details or addresses itself; Shopify retains those responsibilities."
        ),
    )
    body = inject_after_macro(
        body,
        "Architectural / Solution Details",
        p(
            "Merchant confirmed that the recurring trigger comes from its own server, while Shopify calculates taxes and executes the actual charge. The current checkout is a single Shopify checkout for initial purchase, and subscription-heavy promotions depend on the subscription line being present in the cart."
        ),
    )
    body = inject_after_macro(
        body,
        "Architectural / Solution Details",
        "<ul>"
        "<li><p>Decision / proposed support model: subscription purchases must be isolated into a dedicated GEM checkout if they are to be supported.</p></li>"
        "<li><p>Constraint: shoppers cannot buy subscriptions together with printers or other catalog items in the same checkout under this model.</p></li>"
        "<li><p>Open question: does the merchant accept the UX and conversion trade-off created by mixed-cart separation?</p></li>"
        "<li><p>Open question: should app-based Apple / Google subscription flows remain completely out of scope?</p></li>"
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
