# Global-swEep Presentation Slides

Copy this text directly into your slides.

---

## SLIDE 1: Title

**Title:** Global-swEep

**Subtitle:** Automated Website Assessment Tool

**Footer:** [Your Name] | [Date]

---

## SLIDE 2: Executive Summary

**Title:** Executive Summary

**Body:**

Global-swEep automates Website Assessment research, reducing creation time from 45 minutes to 10 minutes.

**Key Results:**
- Detects 30+ third-party integrations automatically
- Identifies red flags: Smile.io, Recharge, competitors
- Extracts checkout flow, BNPL, policy info
- Validated against 10 real Jira WA tickets

**Ask:** Approve for team-wide pilot

---

## SLIDE 3: The Problem

**Title:** Current WA Process is Manual & Time-Consuming

**Body:**

- Browse merchant site manually (home, PDPs, cart, checkout)
- Hunt for third-party apps in footer, scripts, checkout
- Check policies page for return windows, warranties
- Document everything in Jira manually
- Easy to miss integrations buried in page source
- Inconsistent coverage between team members

**Callout Box:** Average time per WA: 30-60 minutes

---

## SLIDE 4: The Solution

**Title:** Global-swEep Automates the Research

**Body:**

- Browser automation crawls the site for you
- Visits: Home → Collections → PDPs → Cart → Checkout → Policies
- Detects third-parties via Wappalyzer + custom patterns
- Extracts policy details, checkout options, BNPL widgets
- Outputs structured evidence ready for formatting

**Callout Box:** Research phase: 20-40 seconds

**[Screenshot: Web UI with URL input]**

---

## SLIDE 5: How It Works

**Title:** 8-Step Workflow

**Body:**

1. **Enter URL:** Paste merchant website
2. **Run Assessment:** Click button (20-40 sec)
3. **Review Summary:** Check detected apps, red flags
4. **Copy Prompt:** Click "Copy for Cursor"
5. **Paste in Cursor:** Start new chat, paste
6. **Get JSON:** Cursor returns structured data
7. **Convert:** Paste JSON, get Markdown
8. **Copy to Jira:** Done!

**[Screenshot: "How It Works" section from UI]**

---

## SLIDE 6: What Gets Detected

**Title:** Automatic Detection Coverage

**Body:**

| Category | Examples |
|----------|----------|
| Platform | Shopify, Shopify Plus, BigCommerce |
| Red Flags | Smile.io, Recharge, Bold, Competitors |
| Payments | Shop Pay, Apple Pay, PayPal |
| BNPL | Affirm, Klarna, Afterpay, Sezzle |
| Loyalty | Smile.io, LoyaltyLion, Yotpo |
| Subscriptions | Recharge, Bold, Ordergroove |
| Support | Gorgias, Zendesk, Gladly |
| Returns | Loop, Narvar, Happy Returns |
| Reviews | Yotpo, Stamped, Judge.me |
| Email/SMS | Klaviyo, Attentive, Postscript |

**Callout Box:** 30+ third-party apps detected

**[Screenshot: Summary panel showing detected third-parties]**

---

## SLIDE 7: Sample Output

**Title:** From Raw Data to Jira-Ready Format

**Left Column - Before (Manual):**
- Scattered notes
- Inconsistent formatting
- Easy to miss details

**Right Column - After (Global-swEep):**
- Structured Markdown
- Consistent template
- Evidence URLs included

**[Screenshot: Output panel with formatted Markdown]**

---

## SLIDE 8: Validation Results

**Title:** Tested Against Real WA Tickets

**Body:**

| Metric | Result |
|--------|--------|
| Tickets Tested | 11 |
| Successfully Scraped | 10 (91%) |
| Data Matches | 70 |
| Issues Identified | 20 (fixed iteratively) |

**What Matched:**
- Platform detection: 100%
- Third-party apps: 85%+
- Checkout flow: Captured on all sites
- Policy extraction: Return windows, warranties

**[Screenshot: Test report summary]**

---

## SLIDE 9: Roadmap

**Title:** Current State & What's Next

**Available Now (Beta):**
- ✅ Web scraping engine
- ✅ Third-party detection (30+ apps)
- ✅ Policy extraction
- ✅ Checkout flow analysis
- ✅ BNPL widget detection
- ✅ Copy-to-Cursor workflow

**Coming Soon:**
- 🚧 Direct LLM integration (no copy-paste)
- 🚧 Screenshot capture
- 🚧 Jira API integration

**[Screenshot: "Coming Soon" badge on API key section]**

---

## SLIDE 10: Next Steps

**Title:** Call to Action

**Body:**

**Try It:**
```
npm run web → http://localhost:3847
```

**Pilot Program:**
- Use Global-swEep for all new WA tickets this sprint
- Report edge cases and missing detections
- Compare time spent vs. manual process

**Decision Needed:**
- Approve team-wide pilot?
- Allocate time for LLM integration?
- Provide Jira API access for Phase 2?

**Contact:** [Your email/Slack]

---

## APPENDIX: Talking Points

**"Why now?"**
> WA volume is increasing. Manual research doesn't scale. This tool lets us maintain quality while handling more merchants.

**"Is it accurate?"**
> Tested against 10 real WAs with 70 data matches. The tool captures evidence; humans still review and finalize.

**"What about edge cases?"**
> Some sites timeout or have unusual structures. The tool reports what it finds; you fill gaps as needed.

**"What does it cost?"**
> Free to run locally. Uses Cursor's Claude access (already licensed). Future direct API: ~$0.02-0.05 per assessment.
