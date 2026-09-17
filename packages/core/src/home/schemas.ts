import { z } from "zod";

import { ASSET_CATEGORIES } from "./assets";

/**
 * Home domain contracts (module 13).
 *
 * The API routes validate with these and the OpenAPI document is generated from
 * them, so the published contract cannot describe something the server does not
 * actually accept.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use YYYY-MM-DD." });

export const createAssetSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.enum(ASSET_CATEGORIES).optional(),
  location: z.string().trim().max(80).optional(),
  /** Null is meaningful: it says this asset genuinely needs no servicing. */
  serviceIntervalDays: z.number().int().min(1).max(3650).nullish(),
  lastServicedOn: isoDate.nullish(),
  warrantyExpiresOn: isoDate.nullish(),
  amcExpiresOn: isoDate.nullish(),
  responsibleMemberId: z.uuid().nullish(),
});

export type CreateAssetBody = z.infer<typeof createAssetSchema>;

/**
 * `nextActionBy` is part of raising a request, not an afterthought: a request
 * with nobody's name on the next step is the informational state story 13-006
 * exists to eliminate.
 */
export const createServiceRequestSchema = z.object({
  subject: z.string().trim().min(1).max(160),
  assetId: z.uuid().nullish(),
  providerName: z.string().trim().max(120).nullish(),
  providerContact: z.string().trim().max(120).nullish(),
  nextAction: z.string().trim().max(200).nullish(),
  nextActionBy: z.enum(["household", "provider"]).nullish(),
});

export type CreateServiceRequestBody = z.infer<typeof createServiceRequestSchema>;
