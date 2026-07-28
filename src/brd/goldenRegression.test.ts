import { describe, expect, it } from 'vitest';
import { composeBrdReview } from './composer.js';
import { generateBrdDraft } from './generator.js';
import { BRD_REQUIREMENTS } from './requirements.js';
import type { BrdParentContext } from './types.js';

/**
 * Golden BRD Output from a reviewed OAK + FORT WA (legacy format still includes
 * Status: Canceled lines). Sweep must accept that format and map absences to
 * Phase Out Of Scope without transitioning Jira status to Canceled.
 */
const goldenLegacyWaBrdOutput = [
  '## BRD Output for Sweep',
  '',
  '- BRD-001 | Hub locations and entities | Status: Done | SE Output: Store locations across Canada and US are listed; warehouse/entity details not evidenced.',
  '- BRD-002 | 3PL / Shipping Platform | Status: Canceled | SE Output: No WA evidence found.',
  '- BRD-003 | Outbound carriers | Status: Done | SE Output: Policy references parcel carriers and 1-7 business day transit, but no carrier names are visible.',
  '- BRD-004 | Inbound carriers | Status: Done | SE Output: Returns require customer-selected tracked shipping back to warehouse; inbound carrier names not specified.',
  '- BRD-005 | Ship from bond | Status: Canceled | SE Output: No WA evidence found.',
  '- BRD-006 | Dropship / Multi-node Fulfilment | Status: Canceled | SE Output: No WA evidence found.',
  '- BRD-007 | 3B2C | Status: Canceled | SE Output: No WA evidence found.',
  '- BRD-008 | Collection Points | Status: Canceled | SE Output: No WA evidence found.',
  '- BRD-009 | Store (BOPIS / Ship to Store) | Status: Done | SE Output: Cart supports “Pick up in-store” and store inventory checks.',
  '- BRD-010 | Fulfilment Process (API vs Admin) | Status: Canceled | SE Output: No WA evidence found.',
  '- BRD-011 | Marketplace | Status: Canceled | SE Output: Marketplace presence not detected.',
  '- BRD-012 | B2B | Status: Done | SE Output: B2B indicator terms “dealer” and “distributor” detected, but no wholesale flow confirmed.',
  '- BRD-013 | Subscriptions | Status: Canceled | SE Output: Subscriptions not detected.',
  '- BRD-014 | Loyalty & Reward | Status: Canceled | SE Output: Loyalty or rewards program not detected.',
  '- BRD-015 | Gift Cards | Status: Done | SE Output: Gift cards are linked in footer and gift card option was detected in checkout.',
  '- BRD-016 | Dangerous Goods | Status: Canceled | SE Output: No dangerous goods detected.',
  '- BRD-017 | Restrictions | Status: Done | SE Output: Sale items at 20%+ discount and orders outside Canada/US are final sale.',
  '- BRD-018 | High Value shipments | Status: Canceled | SE Output: No WA evidence found.',
  '- BRD-019 | Digital / Gaming | Status: Canceled | SE Output: Virtual/digital products not detected.',
  '- BRD-020 | CITES | Status: Canceled | SE Output: No WA evidence found.',
  '- BRD-021 | Ugly Freight | Status: Done | SE Output: Shipping policy mentions additional surcharge for heavier items shown at checkout.',
  '- BRD-022 | Customised Products | Status: Done | SE Output: Customization/personalization signals detected, but no concrete PDP configurator evidence provided.',
  '- BRD-023 | Bundles | Status: Done | SE Output: Bundle/set product evidence detected, including layered shirt set language.',
  '- BRD-024 | Free Products / Orders | Status: Canceled | SE Output: Gift-with-purchase and free product promotions not detected.',
  '- BRD-025 | Pre-orders | Status: Done | SE Output: Policy states orders containing pre-order items ship once pre-order item is available.',
  '- BRD-026 | Mobile App | Status: Done | SE Output: Shipping policy references order status through the Shop App powered by Shopify.',
  '- BRD-027 | Storefront Setup | Status: Done | SE Output: Shopify storefront on oakandfort.com with USA country selector, USD pricing, cart, and Shopify Checkout.',
  '- BRD-028 | Headless | Status: Canceled | SE Output: Headless not detected.',
  '- BRD-029 | Flash sales / Raffles | Status: Done | SE Output: Active sale promotion and “extra 20% off sale/new markdowns” messaging observed; no raffle evidence.',
  '- BRD-030 | Returns Platform | Status: Done | SE Output: ReturnGO detected and returns policy supports online return requests plus in-store returns/exchanges.',
].join('\n');

/**
 * Modern WA format: only BRDs with evidence use Status: Done.
 * Absent BRDs are omitted from the BRD Output section.
 */
const goldenModernWaBrdOutput = [
  '## Merchant Overview',
  '- **Brand:** OAK + FORT',
  '',
  '## BRD Output for Sweep',
  '',
  '- BRD-001 | Hub locations and entities | Status: Done | SE Output: Store locations across Canada and US are listed; warehouse/entity details not evidenced.',
  '- BRD-015 | Gift Cards | Status: Done | SE Output: Gift cards are linked in footer and gift card option was detected in checkout.',
  '- BRD-030 | Returns Platform | Status: Done | SE Output: ReturnGO detected and returns policy supports online return requests plus in-store returns/exchanges.',
].join('\n');

const parent: BrdParentContext = {
  key: 'SOPP-10383',
  summary: 'OAK + FORT (2026 ShopTalk)',
  subtasks: BRD_REQUIREMENTS.map((requirement, index) => ({
    key: `SOPP-${10448 + index}`,
    summary: `${requirement.id}: ${requirement.requirement}`,
    status: 'New',
    descriptionText: `${requirement.id} description context.`,
    seOutputText: '',
  })),
};

describe('golden BRD regression from completed WA output', () => {
  it('maps legacy Canceled lines to Out Of Scope phase without status transition', () => {
    const result = composeBrdReview({
      merchantName: 'OAK + FORT',
      parent,
      websiteAssessmentMarkdown: goldenLegacyWaBrdOutput,
    });

    expect(result.rows).toHaveLength(30);
    expect(result.rows.map((row) => row.requirementId)).toEqual(
      BRD_REQUIREMENTS.map((requirement) => requirement.id)
    );

    const doneRows = result.rows.filter((row) => row.statusAction === 'done');
    const outOfScopeRows = result.rows.filter((row) => row.phaseAction === 'out_of_scope');
    // HubSpot-primary BRDs with WA Done lines still count; no-evidence HubSpot-primary leave phase alone.
    expect(doneRows).toHaveLength(15);
    expect(outOfScopeRows.length).toBe(11);
    expect(result.rows.every((row) => row.statusAction === 'done' || row.statusAction === undefined)).toBe(true);

    expect(result.rows.find((row) => row.requirementId === 'BRD-001')).toMatchObject({
      jiraKey: 'SOPP-10448',
      finalText: 'Store locations across Canada and US are listed; warehouse/entity details not evidenced.',
      statusAction: 'done',
      phaseAction: 'in_scope',
    });

    expect(result.rows.find((row) => row.requirementId === 'BRD-002')).toMatchObject({
      jiraKey: 'SOPP-10449',
      statusAction: undefined,
      phaseAction: undefined,
      finalText: 'Sweep found no evidence for this BRD',
    });

    expect(result.rows.find((row) => row.requirementId === 'BRD-013')).toMatchObject({
      statusAction: undefined,
      phaseAction: 'out_of_scope',
      finalText: 'Subscriptions not detected.',
    });

    expect(result.rows.find((row) => row.requirementId === 'BRD-030')).toMatchObject({
      jiraKey: 'SOPP-10477',
      finalText: 'ReturnGO detected and returns policy supports online return requests plus in-store returns/exchanges.',
      statusAction: 'done',
      phaseAction: 'in_scope',
    });
  });

  it('maps modern evidence-only BRD Output to Done + Out Of Scope defaults', () => {
    const result = composeBrdReview({
      merchantName: 'OAK + FORT',
      parent,
      websiteAssessmentMarkdown: goldenModernWaBrdOutput,
    });

    expect(result.rows.find((row) => row.requirementId === 'BRD-015')).toMatchObject({
      statusAction: 'done',
      phaseAction: 'in_scope',
      finalText: 'Gift cards are linked in footer and gift card option was detected in checkout.',
    });

    const absent = result.rows.find((row) => row.requirementId === 'BRD-013');
    expect(absent?.statusAction).toBeUndefined();
    expect(absent?.phaseAction).toBe('out_of_scope');
    expect(absent?.finalText).toBe('Sweep found no evidence for this BRD');

    const hubspotOnly = result.rows.find((row) => row.requirementId === 'BRD-002');
    expect(hubspotOnly?.phaseAction).toBeUndefined();
    expect(hubspotOnly?.finalText).toBe('Sweep found no evidence for this BRD');
  });

  it('keeps generated BRD outputs stable for known WA signals', () => {
    const draft = generateBrdDraft({
      merchantName: 'Regression Merchant',
      parent,
      websiteAssessmentMarkdown: [
        'Shopify storefront with country selector and USD currency.',
        'ReturnGO return portal detected.',
        'Gift cards are available at checkout.',
        'Subscriptions not detected.',
      ].join('\n'),
    });

    expect(draft.outputs.matrixMarkdown).toContain('BRD-015');
    expect(draft.outputs.matrixMarkdown).toContain('Gift Cards');
    expect(draft.outputs.matrixMarkdown.toLowerCase()).toContain('gift card');
    expect(draft.outputs.jiraUpdatePlan).toContain('Parent SOPP: SOPP-10383 - OAK + FORT (2026 ShopTalk)');
    expect(draft.outputs.confluenceNarrative).toContain('Merchant: Regression Merchant');
    expect(draft.outputs.openQuestions).toContain('BRD-015');
  });
});
