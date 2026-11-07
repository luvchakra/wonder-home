import type { SupabaseClient } from "@supabase/supabase-js";

import { keptPerServer, forgetPlatformData } from "../lib/platform-cache";

/**
 * Platform settings: small non-secret switches platform staff change in the
 * portal with no redeploy (owner, 2026-11-07). Reads go through the per-server
 * platform cache (TTL 30 s; a change clears this instance at once). Writes go
 * only through `public.platform_setting_set` (service role, audited).
 *
 * NOTE for the typed registry on the portal-redesign branch: this is the
 * smallest equivalent; fold `landing.variant` into that registry and read it
 * through its accessor, then delete this file (docs/progress/2026-11-07-landing-variant.md).
 */
export const PLATFORM_SETTINGS = {
  "landing.variant": { values: ["new", "classic"], fallback: "new" },
} as const;

export type PlatformSettingKey = keyof typeof PLATFORM_SETTINGS;
export type LandingVariant = (typeof PLATFORM_SETTINGS)["landing.variant"]["values"][number];

export function isLandingVariant(value: unknown): value is LandingVariant {
  return value === "new" || value === "classic";
}

type Rows = Record<string, string>;

async function allSettings(supabase: SupabaseClient): Promise<Rows> {
  return keptPerServer("platform_settings", async () => {
    const { data, error } = await supabase.from("platform_settings").select("key, value").limit(100);
    if (error) return { value: {}, keep: false };
    return { value: Object.fromEntries((data ?? []).map((row) => [row.key as string, row.value as string])), keep: true };
  });
}

/** Which landing page a signed-out visitor gets. Any problem reading it means the default. */
export async function landingVariant(supabase: SupabaseClient): Promise<LandingVariant> {
  try {
    const value = (await allSettings(supabase))["landing.variant"];
    return isLandingVariant(value) ? value : PLATFORM_SETTINGS["landing.variant"].fallback;
  } catch {
    return PLATFORM_SETTINGS["landing.variant"].fallback;
  }
}

/** Saves the landing variant (service-role client, after a platform-staff check). Returns false on failure. */
export async function saveLandingVariant(admin: SupabaseClient, actorProfileId: string, variant: unknown): Promise<boolean> {
  if (!isLandingVariant(variant)) return false;
  const { error } = await admin.rpc("platform_setting_set", { p_key: "landing.variant", p_value: variant, p_actor: actorProfileId });
  if (error) return false;
  forgetPlatformData("platform_settings");
  return true;
}
