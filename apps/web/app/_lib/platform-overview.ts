import "server-only";

import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import type { PlatformAdmin } from "@wonderhome/core/platform/admin";
import { parseOverview, type AdvisorSignal, type OverviewSnapshot } from "@wonderhome/core/platform/overview";

import { advisorCounts } from "./platform-performance";

/**
 * The Overview's platform-wide aggregates, kept per server for a minute
 * ("platform data is cached per server with a TTL"). Safe to share between
 * staff: counts only, no household id, name or content, and every caller has
 * passed the staff check before asking. Nothing household-scoped is cached.
 */
const TTL_MS = 60_000;

export type OverviewData = { snapshot: OverviewSnapshot | null; advisor: AdvisorSignal | null };

let kept: { at: number; value: Promise<OverviewData> } | null = null;

async function load(staff: PlatformAdmin): Promise<OverviewData> {
  const snapshot = (async () => {
    try {
      const admin = adminClientFor(adminGrant.platformAdmin(staff, "read the platform overview aggregates"));
      const { data, error } = await admin.rpc("platform_overview", { p_staff_profile_id: staff.profileId });
      return error ? null : parseOverview(data);
    } catch {
      return null;
    }
  })();
  const advisor = advisorCounts()
    .then((a): AdvisorSignal => ({ source: a.source === "live" ? "live" : "baseline", gated: a.gated, accepted: a.accepted }))
    .catch(() => null);
  const [s, a] = await Promise.all([snapshot, advisor]);
  return { snapshot: s, advisor: a };
}

/** The aggregates, at most a minute old. A failed read is not kept, so the next request tries again. */
export function platformOverview(staff: PlatformAdmin, now = Date.now()): Promise<OverviewData> {
  if (kept && now - kept.at < TTL_MS) return kept.value;
  const value = load(staff);
  kept = { at: now, value };
  void value.then((v) => {
    if (!v.snapshot && kept?.value === value) kept = null;
  });
  return value;
}
