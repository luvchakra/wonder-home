import type { ContextDomain, Freshness, HouseholdContextItem } from "./types";

/**
 * Whether a fact still describes the home (Wave 1 §11).
 *
 * Every item leaves here marked current, stale, historical, superseded or
 * unknown — explicitly, so nothing downstream has to guess from a date.
 *
 * Two rules carry the weight:
 *
 *  - **An authoritative record is current as read.** A bill row read a
 *    moment ago *is* the bill; it cannot go stale. Staleness is for what
 *    WonderHome learned or observed — a consumption rate, a laundry
 *    observation, an integration that last synced weeks ago.
 *  - **Within one real thing, only one fact is current.** Items that share
 *    an `identityKey` are ranked: a confirmed fact beats an inferred one
 *    whatever their ages (a person's word is not overturned by a pattern —
 *    `conversation/memory.ts`'s own rule), then the more authoritative
 *    source, then the newer. Old source content can never displace a newer
 *    record, because raw source content ranks lowest of all.
 */

/** How long learned or observed knowledge stays trustworthy, per domain. */
export const STALE_AFTER_DAYS: Partial<Record<ContextDomain, number>> = {
  preferences: 180,
  groceries: 60,
  laundry: 2,
  integrations: 7,
  homesend: 30,
  agents: 14,
  outcomes: 14,
};

const DAY_MS = 86_400_000;

/** The freshness one item has on its own, before it is compared with anything. */
export function assessFreshness(item: HouseholdContextItem, now: Date): Freshness {
  if (item.freshness === "superseded" || item.freshness === "historical") return item.freshness;

  // Authoritative, and read just now: that is the definition of current.
  if (item.authority >= 3 && item.confirmed) return "current";

  const window = STALE_AFTER_DAYS[item.domain];
  if (window === undefined) return item.freshness;

  const at = Date.parse(item.freshnessAt);
  if (Number.isNaN(at)) return "unknown";
  return now.getTime() - at > window * DAY_MS ? "stale" : item.freshness === "unknown" ? "unknown" : "current";
}

/** Higher ranks first: confirmed, then authority, then confidence, then recency. */
function outranks(left: HouseholdContextItem, right: HouseholdContextItem): number {
  if (left.confirmed !== right.confirmed) return left.confirmed ? -1 : 1;
  if (left.authority !== right.authority) return right.authority - left.authority;
  const byTime = Date.parse(right.freshnessAt) - Date.parse(left.freshnessAt);
  if (byTime !== 0 && !Number.isNaN(byTime)) return byTime;
  return right.confidence - left.confidence;
}

/**
 * Marks every item's freshness, and supersedes all but one item in each
 * identity group. Returns new objects; the input is left as it was.
 */
export function applyFreshness(items: readonly HouseholdContextItem[], now: Date): HouseholdContextItem[] {
  const assessed = items.map((item) => ({ ...item, freshness: assessFreshness(item, now) }));

  const groups = new Map<string, HouseholdContextItem[]>();
  for (const item of assessed) {
    if (!item.identityKey || item.freshness === "superseded" || item.freshness === "historical") continue;
    const group = groups.get(item.identityKey) ?? [];
    group.push(item);
    groups.set(item.identityKey, group);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [winner, ...rest] = [...group].sort(outranks);
    for (const loser of rest) {
      loser.freshness = "superseded";
      loser.supersededBy = winner!.id;
    }
  }

  return assessed;
}

/** Whether an item may be stated as how things are now. */
export function isUsable(item: HouseholdContextItem): boolean {
  return item.freshness === "current" || item.freshness === "stale" || item.freshness === "unknown";
}

/** The words a stale or unknown fact carries so a model never states it as certain. */
export function freshnessQualifier(item: HouseholdContextItem): string {
  if (item.freshness === "stale") return " (this may be out of date)";
  if (item.freshness === "unknown") return " (when this was last true is unknown)";
  return "";
}
