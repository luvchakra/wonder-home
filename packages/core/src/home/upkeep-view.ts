import { coverageOn, nextServiceDue, type HomeAsset } from "./assets";
import type { ServiceRequest } from "./services";

/**
 * What the Home & Upkeep screen says about each thing and request (the owner,
 * 2026-10-21: "design and develop this page based on other modules"). Pure:
 * every date comes from what the household recorded — a service interval and
 * the last service, a warranty or AMC end — never an estimate.
 */

export type DatedKind = "service" | "warranty" | "amc";
export type UpkeepDate = { assetId: string; name: string; kind: DatedKind; on: Date };

/** The one line under a thing's name: the next date that matters for it, or null when nothing is dated. */
export function assetHeadline(asset: HomeAsset, now = new Date()): UpkeepDate | null {
  if (asset.status === "retired") return null;
  const due = nextServiceDue(asset, [], now);
  if (due) return { assetId: asset.id, name: asset.name, kind: "service", on: due };
  const cover = coverageOn(asset, now);
  if (cover.kind !== "none" && cover.expiresOn) return { assetId: asset.id, name: asset.name, kind: cover.kind, on: new Date(`${cover.expiresOn}T00:00:00Z`) };
  return null;
}

/**
 * Every dated thing in the next `days` days — a service falling due, a
 * warranty or AMC ending — soonest first. `skip` leaves out the things already
 * shown as needing a person, so nothing is said twice on one screen.
 */
export function comingUp(assets: readonly HomeAsset[], now = new Date(), days = 60, skip: ReadonlySet<string> = new Set()): UpkeepDate[] {
  const until = now.getTime() + days * 86_400_000;
  const dates: UpkeepDate[] = [];
  for (const asset of assets) {
    if (asset.status === "retired" || skip.has(asset.id)) continue;
    const due = nextServiceDue(asset, [], now);
    if (due && due.getTime() >= now.getTime() - 86_400_000 && due.getTime() <= until) dates.push({ assetId: asset.id, name: asset.name, kind: "service", on: due });
    for (const [kind, raw] of [["warranty", asset.warrantyExpiresOn], ["amc", asset.amcExpiresOn]] as const) {
      if (!raw) continue;
      const on = new Date(`${raw}T00:00:00Z`);
      if (on.getTime() >= now.getTime() - 86_400_000 && on.getTime() <= until) dates.push({ assetId: asset.id, name: asset.name, kind, on });
    }
  }
  return dates.sort((a, b) => a.on.getTime() - b.on.getTime() || a.name.localeCompare(b.name));
}

/** Open requests first (whose move it is decides nothing here — the newest change first), then settled ones. */
export function splitRequests(requests: readonly ServiceRequest[]): { open: ServiceRequest[]; settled: ServiceRequest[] } {
  const settled = (request: ServiceRequest) => request.status === "completed" || request.status === "cancelled";
  const byRecent = (a: ServiceRequest, b: ServiceRequest) => b.updatedAt.getTime() - a.updatedAt.getTime();
  return {
    open: requests.filter((request) => !settled(request)).sort(byRecent),
    settled: requests.filter(settled).sort(byRecent),
  };
}
