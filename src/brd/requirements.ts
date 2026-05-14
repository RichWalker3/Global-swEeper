export type BrdGate = 'SIGN' | 'LOCK';

export interface BrdRequirement {
  id: string;
  category: string;
  requirement: string;
  gate: BrdGate;
  hubspotField?: string;
}

export const BRD_REQUIREMENTS: BrdRequirement[] = [
  {
    id: 'BRD-001',
    category: 'Logistics & Fulfilment',
    requirement: 'Hub locations and entities',
    gate: 'SIGN',
    hubspotField: 'HubSpot Scoping Details',
  },
  {
    id: 'BRD-002',
    category: 'Logistics & Fulfilment',
    requirement: '3PL / Shipping Platform',
    gate: 'SIGN',
    hubspotField: '3PL/Hub',
  },
  {
    id: 'BRD-003',
    category: 'Logistics & Fulfilment',
    requirement: 'Outbound carriers',
    gate: 'SIGN',
    hubspotField: 'Outbound Logistics',
  },
  {
    id: 'BRD-004',
    category: 'Logistics & Fulfilment',
    requirement: 'Inbound carriers',
    gate: 'SIGN',
    hubspotField: 'Inbound Logistics',
  },
  {
    id: 'BRD-005',
    category: 'Logistics & Fulfilment',
    requirement: 'Ship from bond',
    gate: 'SIGN',
    hubspotField: 'Bonded Warehouse',
  },
  {
    id: 'BRD-006',
    category: 'Logistics & Fulfilment',
    requirement: 'Dropship / Multi-node Fulfilment',
    gate: 'SIGN',
  },
  {
    id: 'BRD-007',
    category: 'Logistics & Fulfilment',
    requirement: '3B2C',
    gate: 'SIGN',
    hubspotField: '3b2c Status',
  },
  {
    id: 'BRD-008',
    category: 'Logistics & Fulfilment',
    requirement: 'Collection Points',
    gate: 'LOCK',
    hubspotField: 'PUDO',
  },
  {
    id: 'BRD-009',
    category: 'Logistics & Fulfilment',
    requirement: 'Store (BOPIS / Ship to Store)',
    gate: 'LOCK',
    hubspotField: 'Shipping to shop?',
  },
  {
    id: 'BRD-010',
    category: 'Logistics & Fulfilment',
    requirement: 'Fulfilment Process (API vs Admin)',
    gate: 'LOCK',
    hubspotField: 'Fulfilment Type',
  },
  {
    id: 'BRD-011',
    category: 'Commerce Models',
    requirement: 'Marketplace',
    gate: 'SIGN',
  },
  {
    id: 'BRD-012',
    category: 'Commerce Models',
    requirement: 'B2B',
    gate: 'SIGN',
    hubspotField: 'Does the merchant have B2B customers?',
  },
  {
    id: 'BRD-013',
    category: 'Storefront & Experience',
    requirement: 'Subscriptions',
    gate: 'SIGN',
    hubspotField: 'Subscriptions?',
  },
  {
    id: 'BRD-014',
    category: 'Storefront & Experience',
    requirement: 'Loyalty & Reward',
    gate: 'LOCK',
    hubspotField: 'Loyalty program/ awards points',
  },
  {
    id: 'BRD-015',
    category: 'Storefront & Experience',
    requirement: 'Gift Cards',
    gate: 'LOCK',
    hubspotField: 'Gift Cards (physical / virtual, in-house / 3rd party)',
  },
  {
    id: 'BRD-016',
    category: 'Catalog',
    requirement: 'Dangerous Goods',
    gate: 'SIGN',
    hubspotField: 'Selling Dangerous Goods?',
  },
  {
    id: 'BRD-017',
    category: 'Catalog',
    requirement: 'Restrictions',
    gate: 'SIGN',
    hubspotField: 'Ops Catalogue Review Notes',
  },
  {
    id: 'BRD-018',
    category: 'Catalog',
    requirement: 'High Value shipments',
    gate: 'SIGN',
    hubspotField: 'High-Value shipments',
  },
  {
    id: 'BRD-019',
    category: 'Catalog',
    requirement: 'Digital / Gaming',
    gate: 'SIGN',
    hubspotField: 'Virtual products?',
  },
  {
    id: 'BRD-020',
    category: 'Catalog',
    requirement: 'CITES',
    gate: 'LOCK',
    hubspotField: 'Selling CITES?',
  },
  {
    id: 'BRD-021',
    category: 'Catalog',
    requirement: 'Ugly Freight',
    gate: 'LOCK',
    hubspotField: 'Selling ugly freight (not standard size, shape, or weight)?',
  },
  {
    id: 'BRD-022',
    category: 'Catalog',
    requirement: 'Customised Products',
    gate: 'LOCK',
    hubspotField: 'Customized / Personalized products?',
  },
  {
    id: 'BRD-023',
    category: 'Catalog',
    requirement: 'Bundles',
    gate: 'LOCK',
    hubspotField: 'Bundles (pricing promotions or parent-child)',
  },
  {
    id: 'BRD-024',
    category: 'Catalog',
    requirement: 'Free Products / Orders',
    gate: 'LOCK',
    hubspotField: 'Free Products (GWP/BOGO free)',
  },
  {
    id: 'BRD-025',
    category: 'Catalog',
    requirement: 'Pre-orders',
    gate: 'LOCK',
    hubspotField: 'Pre Orders?',
  },
  {
    id: 'BRD-026',
    category: 'Storefront & Experience',
    requirement: 'Mobile App',
    gate: 'LOCK',
    hubspotField: 'Mobile App as part of the app store',
  },
  {
    id: 'BRD-027',
    category: 'Storefront & Experience',
    requirement: 'Storefront Setup',
    gate: 'LOCK',
  },
  {
    id: 'BRD-028',
    category: 'Storefront & Experience',
    requirement: 'Headless',
    gate: 'LOCK',
    hubspotField: 'Headless site?',
  },
  {
    id: 'BRD-029',
    category: 'Storefront & Experience',
    requirement: 'Flash sales / Raffles',
    gate: 'LOCK',
    hubspotField: 'Flash sales / Raffles',
  },
  {
    id: 'BRD-030',
    category: 'Storefront & Experience',
    requirement: 'Returns Platform',
    gate: 'LOCK',
    hubspotField: 'RMS Type + RMS Name',
  },
];

export function findRequirementBySummary(summary: string): BrdRequirement | undefined {
  const normalized = summary.toLowerCase();
  return BRD_REQUIREMENTS.find((requirement) => {
    const numericId = requirement.id.replace('BRD-', 'BRD-0');
    return normalized.includes(requirement.id.toLowerCase())
      || normalized.includes(numericId.toLowerCase())
      || normalized.includes(requirement.requirement.toLowerCase());
  });
}
