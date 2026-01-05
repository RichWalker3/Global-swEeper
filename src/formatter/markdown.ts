/**
 * Format WebsiteAssessment as Markdown matching the template
 */

import type { WebsiteAssessment } from '../schema/assessment.js';
import type { Check, Evidence } from '../schema/common.js';

const STATUS_EMOJI = {
  verified: '✅',
  unconfirmed: '❔',
  absent: '❌',
} as const;

export function formatMarkdown(assessment: WebsiteAssessment): string {
  const lines: string[] = [];

  // Header
  lines.push('# Website Assessment');
  lines.push('');
  lines.push('---');
  lines.push('');

  // Merchant Overview
  lines.push('## Merchant Overview');
  lines.push('');
  lines.push(`* **Brand:** ${assessment.meta.brand}`);
  lines.push(`* **Primary URL:** ${assessment.meta.primaryUrl}`);
  if (assessment.meta.otherLocales?.length) {
    lines.push(`* **Other Locales / Sites:** ${assessment.meta.otherLocales.join(', ')}`);
  }
  lines.push(`* **Notes / Scope:** ${assessment.meta.scopeNotes}`);
  lines.push(`* **Assessed:** ${assessment.meta.assessedAt}`);
  lines.push('');

  // Evidence Log
  lines.push('## Evidence Log (Working Links)');
  lines.push('');
  const log = assessment.evidenceLog;
  if (log.home) lines.push(`* **Home:** ${log.home.url}`);
  if (log.pdpExample) lines.push(`* **PDP (example):** ${log.pdpExample.url}`);
  if (log.cart) lines.push(`* **Cart:** ${log.cart.url}`);
  if (log.checkout) lines.push(`* **Checkout:** ${log.checkout.url}${log.checkout.notes ? ` (${log.checkout.notes})` : ''}`);
  if (log.shippingPolicy) lines.push(`* **Shipping policy:** ${log.shippingPolicy.url}`);
  if (log.returnsPolicy) lines.push(`* **Returns policy:** ${log.returnsPolicy.url}`);
  if (log.faq) lines.push(`* **FAQ:** ${log.faq.url}`);
  if (log.loyaltyPage) lines.push(`* **Loyalty / Rewards:** ${log.loyaltyPage.url}`);
  if (log.subscriptionsPage) lines.push(`* **Subscriptions:** ${log.subscriptionsPage.url}`);
  if (log.other.length) {
    lines.push(`* **Other:** ${log.other.map(p => p.url).join(', ')}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Platform & Site Structure
  lines.push('## Platform & Site Structure');
  lines.push('');
  lines.push(formatCheck('Platform & Version', assessment.platform.platform, assessment.platform.platform.platformName));
  lines.push(formatCheck('Headless / Frontend', assessment.platform.headless, assessment.platform.headless.framework));
  lines.push(formatCheck('Domain strategy', assessment.platform.domainStrategy));
  lines.push(formatCheck('Geo / Country selector', assessment.platform.geoSelector));
  lines.push(formatCheck('Languages', assessment.platform.languages));
  lines.push(formatCheck('Mobile experience', assessment.platform.mobileExperience));
  lines.push(formatCheck('Performance', assessment.platform.performance));
  lines.push(formatCheck('Accessibility', assessment.platform.accessibility));
  if (assessment.platform.takeaway) {
    lines.push('');
    lines.push(`**Takeaway:** ${assessment.platform.takeaway}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Catalog & Products
  lines.push('## Catalog & Products');
  lines.push('');
  lines.push(formatCheck('Product types', assessment.catalog.productTypes, 
    assessment.catalog.productTypes.dangerousGoods ? '⚠️ Dangerous goods detected' : undefined));
  lines.push(formatCheck('Bundles / kits', assessment.catalog.bundles));
  lines.push(formatCheck('Customization', assessment.catalog.customization, 
    assessment.catalog.customization.types?.join(', ')));
  lines.push(formatCheck('Virtual / Digital', assessment.catalog.virtualDigital,
    assessment.catalog.virtualDigital.types?.join(', ')));
  lines.push(formatCheck('GWP / Free products', assessment.catalog.gwpPromotions));
  lines.push(formatCheck('Pre-orders', assessment.catalog.preorders,
    assessment.catalog.preorders.chargeTiming));
  lines.push(formatCheck('Subscriptions', assessment.catalog.subscriptions,
    assessment.catalog.subscriptions.provider));
  lines.push(formatCheck('Reviews', assessment.catalog.reviews,
    assessment.catalog.reviews.provider));
  lines.push(formatCheck('PLP filters', assessment.catalog.plpFilters));
  lines.push(formatCheck('On-site search', assessment.catalog.onsiteSearch));
  if (assessment.catalog.takeaway) {
    lines.push('');
    lines.push(`**Takeaway:** ${assessment.catalog.takeaway}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Checkout & Payments
  lines.push('## Checkout & Payments');
  lines.push('');
  lines.push(formatCheck('Flow type', assessment.checkout.flowType,
    assessment.checkout.flowType.type));
  lines.push(formatCheck('Express wallets', assessment.checkout.expressWallets,
    assessment.checkout.expressWallets.wallets?.join(', ')));
  lines.push(formatCheck('Payment methods', assessment.checkout.paymentMethods,
    assessment.checkout.paymentMethods.methods?.join(', ')));
  lines.push(formatCheck('Gift cards', assessment.checkout.giftCards,
    assessment.checkout.giftCards.type));
  lines.push(formatCheck('Fraud hints', assessment.checkout.fraudHints));
  lines.push(formatCheck('Taxes display', assessment.checkout.taxesDisplay,
    assessment.checkout.taxesDisplay.included ? 'Included' : 'Excluded'));
  lines.push(formatCheck('Duties display', assessment.checkout.dutiesDisplay,
    assessment.checkout.dutiesDisplay.prepaidOption ? 'Prepaid option available' : 'DDU'));
  lines.push(formatCheck('Compliance messaging', assessment.checkout.complianceMessaging));
  if (assessment.checkout.takeaway) {
    lines.push('');
    lines.push(`**Takeaway:** ${assessment.checkout.takeaway}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Shipping & Logistics
  lines.push('## Shipping & Logistics');
  lines.push('');
  if (assessment.shipping.shippingTiers.domestic?.length) {
    lines.push('**Domestic shipping:**');
    for (const tier of assessment.shipping.shippingTiers.domestic) {
      lines.push(`  - ${tier.name}: ${tier.sla || ''} ${tier.cost || ''}`);
    }
  }
  if (assessment.shipping.shippingTiers.international?.length) {
    lines.push('**International shipping:**');
    for (const tier of assessment.shipping.shippingTiers.international) {
      lines.push(`  - ${tier.name}: ${tier.sla || ''} ${tier.cost || ''}`);
    }
  }
  lines.push(formatCheck('Carriers', assessment.shipping.carriers,
    assessment.shipping.carriers.carriers?.join(', ')));
  lines.push(formatCheck('Cross-border approach', assessment.shipping.crossBorder,
    assessment.shipping.crossBorder.approach));
  lines.push(formatCheck('Returns', assessment.shipping.returns,
    `${assessment.shipping.returns.window || ''} ${assessment.shipping.returns.vendor ? `via ${assessment.shipping.returns.vendor}` : ''}`));
  lines.push(formatCheck('Final sale items', assessment.shipping.finalSale,
    assessment.shipping.finalSale.categories?.join(', ')));
  lines.push(formatCheck('Tracking', assessment.shipping.tracking,
    assessment.shipping.tracking.provider));
  if (assessment.shipping.takeaway) {
    lines.push('');
    lines.push(`**Takeaway:** ${assessment.shipping.takeaway}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Loyalty, Subscriptions, CRM
  lines.push('## Loyalty, Subscriptions, and CRM');
  lines.push('');
  lines.push(formatCheck('Loyalty program', assessment.loyaltyCrm.loyaltyProgram,
    assessment.loyaltyCrm.loyaltyProgram.vendor));
  lines.push(formatCheck('Subscriptions provider', assessment.loyaltyCrm.subscriptionsProvider,
    assessment.loyaltyCrm.subscriptionsProvider.provider));
  lines.push(formatCheck('Email / SMS', assessment.loyaltyCrm.emailSms,
    assessment.loyaltyCrm.emailSms.vendors?.join(', ')));
  lines.push(formatCheck('Personalization', assessment.loyaltyCrm.personalization,
    assessment.loyaltyCrm.personalization.tools?.join(', ')));
  if (assessment.loyaltyCrm.takeaway) {
    lines.push('');
    lines.push(`**Takeaway:** ${assessment.loyaltyCrm.takeaway}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Internationalization
  lines.push('## Internationalization Testing');
  lines.push('');
  if (assessment.internationalization.marketsTested.length === 0) {
    lines.push('_No international markets tested in this pass_');
  } else {
    for (const market of assessment.internationalization.marketsTested) {
      lines.push(`### ${market.country} (${market.currency})`);
      lines.push(`* **Currency behavior:** ${market.currencyBehavior || 'N/A'}`);
      lines.push(`* **Prices incl tax:** ${market.pricesIncludeTax ? 'Yes' : 'No'}`);
      lines.push(`* **Duties shown:** ${market.dutiesShown ? 'Yes' : 'No'}`);
      lines.push(`* **Prepaid option:** ${market.dutiesPrepaidOption ? 'Yes' : 'No'}`);
      if (market.geoGates) {
        lines.push(`* **Geo-gates:** ${market.geoGates}`);
      }
      lines.push('');
    }
  }
  if (assessment.internationalization.takeaway) {
    lines.push(`**Takeaway:** ${assessment.internationalization.takeaway}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Legal
  lines.push('## Legal and Compliance');
  lines.push('');
  lines.push(formatCheck('Policies present', assessment.legal.policiesPresent,
    assessment.legal.policiesPresent.policies?.join(', ')));
  lines.push(formatCheck('Cookie consent', assessment.legal.cookieConsent,
    assessment.legal.cookieConsent.cmp));
  lines.push(formatCheck('Restricted products', assessment.legal.restrictedProducts));
  if (assessment.legal.takeaway) {
    lines.push('');
    lines.push(`**Takeaway:** ${assessment.legal.takeaway}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Business Restrictions
  lines.push('## Business Restrictions');
  lines.push('');
  lines.push(formatCheck('B2B / wholesale', assessment.businessRestrictions.b2bWholesale));
  lines.push(formatCheck('Marketplace presence', assessment.businessRestrictions.marketplacePresence,
    assessment.businessRestrictions.marketplacePresence.marketplaces?.join(', ')));
  lines.push(formatCheck('Dropshippers', assessment.businessRestrictions.dropshippers));
  if (assessment.businessRestrictions.takeaway) {
    lines.push('');
    lines.push(`**Takeaway:** ${assessment.businessRestrictions.takeaway}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Integrations
  lines.push('## Apps, Integrations, and Data Layer');
  lines.push('');
  if (assessment.integrations.notableApps.apps?.length) {
    lines.push('**Notable apps:**');
    for (const app of assessment.integrations.notableApps.apps) {
      lines.push(`  - ${app.name}${app.category ? ` (${app.category})` : ''}${app.notes ? ` - ${app.notes}` : ''}`);
    }
  }
  lines.push(formatCheck('Analytics', assessment.integrations.analytics,
    assessment.integrations.analytics.tags?.join(', ')));
  lines.push(formatCheck('Sitemaps / robots', assessment.integrations.sitemapsRobots));
  if (assessment.integrations.takeaway) {
    lines.push('');
    lines.push(`**Takeaway:** ${assessment.integrations.takeaway}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Tech Risks
  lines.push('## Tech Risks and Integration Notes');
  lines.push('');
  if (assessment.techRisks.redFlags.length) {
    lines.push('**🚩 Red Flags:**');
    for (const flag of assessment.techRisks.redFlags) {
      lines.push(`  - ${flag}`);
    }
    lines.push('');
  }
  if (assessment.techRisks.constraints.length) {
    lines.push('**Constraints:**');
    for (const c of assessment.techRisks.constraints) {
      lines.push(`  - ${c}`);
    }
    lines.push('');
  }
  if (assessment.techRisks.integrationSurfaces.length) {
    lines.push('**Integration surfaces [Inference]:**');
    for (const s of assessment.techRisks.integrationSurfaces) {
      lines.push(`  - ${s}`);
    }
    lines.push('');
  }
  if (assessment.techRisks.effortEstimate) {
    lines.push(`**Effort estimate [Inference]:** ${assessment.techRisks.effortEstimate}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Open Questions
  lines.push('## Open Questions');
  lines.push('');
  if (assessment.openQuestions.length) {
    for (const q of assessment.openQuestions) {
      lines.push(`* ${q}`);
    }
  } else {
    lines.push('_None identified_');
  }
  lines.push('');

  // Next Steps
  lines.push('## Next Steps');
  lines.push('');
  if (assessment.nextSteps.length) {
    for (const s of assessment.nextSteps) {
      lines.push(`* ${s}`);
    }
  } else {
    lines.push('_None identified_');
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Legend
  lines.push('### Legend');
  lines.push('');
  lines.push('* ✅ **Verified** — Direct UI evidence or authoritative policy page');
  lines.push('* ❔ **Unconfirmed** — Signal seen but not fully proven');
  lines.push('* ❌ **Absent** — Looked in reasonable places and did not find');
  lines.push('* **[Inference]** — Deduction with best available evidence');
  lines.push('');

  return lines.join('\n');
}

function formatCheck(label: string, check: Check, extra?: string): string {
  const emoji = STATUS_EMOJI[check.status];
  let line = `* **${label}** — ${emoji} ${check.status.charAt(0).toUpperCase() + check.status.slice(1)}`;
  
  if (extra) {
    line += `: ${extra}`;
  }

  if (check.notes) {
    line += ` (${check.notes})`;
  }

  if (check.evidence?.length) {
    const mainEvidence = check.evidence[0];
    line += `\n  * Evidence: ${mainEvidence.url}`;
    if (mainEvidence.quote) {
      line += ` — "${mainEvidence.quote.slice(0, 100)}${mainEvidence.quote.length > 100 ? '...' : ''}"`;
    }
    if (mainEvidence.inference) {
      line += ' [Inference]';
    }
  }

  return line;
}

