/**
 * Common schema types used across all assessment sections
 */

import { z } from 'zod';

// Evidence piece with URL and quote
export const EvidenceSchema = z.object({
  url: z.string().url(),
  quote: z.string(),
  screenshot: z.string().optional(),
  inference: z.boolean().optional(),
});

export type Evidence = z.infer<typeof EvidenceSchema>;

// Status type for all checks
export const StatusSchema = z.enum(['verified', 'unconfirmed', 'absent']);

// Base check structure used everywhere
export const CheckSchema = z.object({
  status: StatusSchema,
  evidence: z.array(EvidenceSchema).optional(),
  notes: z.string().optional(),
  searchedUrls: z.array(z.string()).optional(),
});

export type Check = z.infer<typeof CheckSchema>;

// Page reference for evidence log
export const PageRefSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  screenshot: z.string().optional(),
  notes: z.string().optional(),
});

export type PageRef = z.infer<typeof PageRefSchema>;

// Shipping tier
export const ShippingTierSchema = z.object({
  name: z.string(),
  sla: z.string().optional(),
  cost: z.string().optional(),
});

export type ShippingTier = z.infer<typeof ShippingTierSchema>;

// App info
export const AppInfoSchema = z.object({
  name: z.string(),
  category: z.string().optional(),
  notes: z.string().optional(),
});

export type AppInfo = z.infer<typeof AppInfoSchema>;

