what # Global-swEep Presentation Slides

Copy this text directly into your slides.

---

## SLIDE 1: Title

**Title:** Global-swEep

**Subtitle:** Automated Website Assessment Tool

**Footer:** [Your Name] | [Date]

---

## SLIDE 2: Problem → Solution

**Title:** From 1 Hour to 10 Minutes

**The Problem:**
- Website Assessments require 1+ hour of manual research
- Browse every page, hunt for third-party apps, check policies
- Easy to miss integrations buried in checkout or page source
- Inconsistent coverage between team members

**The Solution:**
- Global-swEep automates the research phase
- Crawls home, collections, PDPs, cart, checkout, policies
- Detects 30+ third-party integrations automatically
- Outputs structured evidence ready for Jira

**Callout Box:** 1 hour → 10 minutes

---

## SLIDE 3: How It Works

**Title:** Simple 4-Step Workflow

**Body:**

1. **Enter URL** → Paste merchant website
2. **Run Assessment** → Automated scrape (30-60 sec)
3. **Copy Prompt** → Click "Copy for Cursor"
4. **Get WA** → Paste in Cursor, get formatted output

**Visual:** Screenshot of the web UI

**Callout Box:** No setup required. Run locally with `npm run web`

---

## SLIDE 4: What It Detects

**Title:** Automatic Detection

| Category | Examples |
|----------|----------|
| **Platform** | Shopify, BigCommerce, Magento |
| **Red Flags** | Smile.io, Recharge, Competitors |
| **Payments** | Shop Pay, PayPal, Apple Pay, Google Pay |
| **BNPL** | Afterpay, Klarna, Affirm |
| **Subscriptions** | Recharge, Bold, Ordergroove |
| **Returns** | Loop, ReturnGO, Happy Returns |
| **Policies** | Return windows, warranties, final sale items |

**Callout Box:** 30+ apps detected automatically

---

## SLIDE 5: Validation

**Title:** Tested Against Real WA Tickets

**Test Results:**
- 24 merchants tested
- 7 excluded (URL failures, timeouts - not sweEp's fault)
- 17 successfully scraped (100% of valid URLs)

**Accuracy:**
- 13/17 successful (76%) - matches or found MORE than Jira
- 100% platform detection

**Key Finding:** Scraper often finds MORE integrations than manual WAs

---

## SLIDE 6: Next Steps

**Title:** Try It Today

**How to Start:**
```
npm run web → http://localhost:3847
```

**Pilot Proposal:**
- Use for all new WA tickets this sprint
- Compare time spent vs. manual process
- Report edge cases for improvement

**Roadmap:**
- ✅ Working now: Scraping, detection, Cursor workflow
- 🚧 Coming: Direct LLM integration, Jira API

**Ask:** Approve team pilot?

---

## SLIDE 7: What's Next

**Title:** What's Next

**Immediate Need:**
- Global-e access to Cursor API / Anthropic API
- Removes copy-paste step → fully automated WA generation

**Planned Features:**
- Direct LLM integration in web UI
- Jira API integration → auto-create WA tickets
- Batch processing for multiple merchants
- Enhanced third-party detection patterns

**Timeline:**
- API access → Same-week integration
- Jira integration → Fast follow

---

## Appendix: Talking Points (if asked)

**"How accurate is it?"**
> Tested against 24 real merchant sites. 17 scraped successfully (7 excluded for bad URLs/timeouts). 76% accuracy - and sweEp often finds MORE integrations than manual WAs. 100% platform detection.

**"What about edge cases?"**
> Some sites timeout or block scrapers. The tool reports what it finds; you review and fill gaps.

**"What does it cost?"**
> Free to run locally. Uses Cursor's Claude access. Future direct API: ~$0.03 per assessment.
