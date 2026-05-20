import type { KnownPlatform } from '../types.js';
import type { PlatformProfile } from './shared.js';
import { gemProfile } from './gem.js';
import { sfccProfile } from './sfcc.js';
import { shopifyProfile } from './shopify.js';
import { unknownProfile } from './unknown.js';

const PROFILES: Record<KnownPlatform, PlatformProfile> = {
  shopify: shopifyProfile,
  sfcc: sfccProfile,
  gem: gemProfile,
  unknown: unknownProfile,
};

export function normalizePlatform(value: unknown): KnownPlatform {
  if (typeof value !== 'string') return 'unknown';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'shopify') return 'shopify';
  if (normalized === 'sfcc' || normalized === 'salesforce commerce cloud' || normalized === 'demandware') return 'sfcc';
  if (normalized === 'gem' || normalized === 'custom' || normalized === 'global-e module' || normalized === 'global e module') return 'gem';
  return 'unknown';
}

export function getPlatformProfile(platform: KnownPlatform | undefined): PlatformProfile {
  return PROFILES[platform || 'unknown'];
}

export function platformLabel(platform: KnownPlatform | undefined): string {
  return getPlatformProfile(platform).label;
}

export type { PlatformProfile } from './shared.js';
