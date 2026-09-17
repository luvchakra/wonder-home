import { addDays, daysBetween, isoDate, parseDate, silent, type HomeAssessment } from "./assessment";
import { assessWear, type DeviceSignal } from "./signals";

/**
 * The asset registry and maintenance outcomes (stories 13-001, 13-002).
 *
 * An inventory of what the household owns would be a list nobody maintains and
 * nobody reads. What earns its place is the part that produces action: when
 * this was last serviced, how often it needs to be, who is responsible, and
 * whether it is still under warranty or an AMC — because the answer to that
 * last question changes what the household should do about a fault, and by how
 * much.
 *
 * Everything here is a pure function of the asset and the time, so the same
 * judgement holds in a request, in a worker and in a test.
 */

export const ASSET_CATEGORIES = [
  "appliance",
  "fixture",
  "vehicle",
  "electronics",
  "furniture",
  "other",
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export type HomeAsset = {
  id: string;
  name: string;
  category: AssetCategory;
  location: string | null;
  /** How often this needs servicing. Null means it simply does not. */
  serviceIntervalDays: number | null;
  lastServicedOn: string | null;
  warrantyExpiresOn: string | null;
  amcExpiresOn: string | null;
  /** Who the household expects to deal with this. */
  responsibleMemberId: string | null;
  status: "active" | "retired";
};

export type Coverage = {
  kind: "warranty" | "amc" | "none";
  expiresOn: string | null;
  daysRemaining: number | null;
};

/**
 * What cover an asset has on a given day.
 *
 * Warranty is reported ahead of an AMC when both are live, because a warranty
 * claim usually costs the household nothing, and knowing which one applies is
 * the difference between a free repair and a paid one.
 */
export function coverageOn(asset: HomeAsset, on: Date): Coverage {
  const candidates: { kind: Coverage["kind"]; date: Date | null; raw: string | null }[] = [
    { kind: "warranty", date: parseDate(asset.warrantyExpiresOn), raw: asset.warrantyExpiresOn },
    { kind: "amc", date: parseDate(asset.amcExpiresOn), raw: asset.amcExpiresOn },
  ];

  for (const candidate of candidates) {
    if (candidate.date && candidate.date >= on) {
      return {
        kind: candidate.kind,
        expiresOn: candidate.raw,
        daysRemaining: daysBetween(on, candidate.date),
      };
    }
  }

  return { kind: "none", expiresOn: null, daysRemaining: null };
}

/** When the next service falls due, or null when the asset needs none. */
export function nextServiceDue(asset: HomeAsset, signals: readonly DeviceSignal[] = [], now = new Date()): Date | null {
  if (asset.status === "retired" || asset.serviceIntervalDays === null) return null;

  const last = parseDate(asset.lastServicedOn);
  // Never serviced: it is due from the moment the household told us about it,
  // which is the honest answer rather than quietly starting the clock now.
  const base = last ?? now;
  const scheduled = addDays(base, asset.serviceIntervalDays);

  const wear = assessWear(signals, { powerDraw: null }, now);
  return wear.bringForwardDays > 0 ? addDays(scheduled, -wear.bringForwardDays) : scheduled;
}

/**
 * How far ahead a due service becomes something to act on.
 *
 * Long enough to actually book somebody, short enough that it is not noise.
 */
export const SERVICE_LEAD_DAYS = 14;

/** How long before cover lapses the household should be told, while it still matters. */
export const COVERAGE_LEAD_DAYS = 30;

/**
 * What, if anything, this asset needs from the household today.
 *
 * The bar is deliberately high. An asset serviced on schedule, under warranty
 * and reporting nothing unusual produces silence — and that is most assets,
 * most days.
 */
export function assessAsset(
  asset: HomeAsset,
  options: { now?: Date; signals?: readonly DeviceSignal[]; openServiceRequest?: boolean } = {},
): HomeAssessment {
  const now = options.now ?? new Date();
  const signals = options.signals ?? [];
  const subjectKey = `asset.${asset.id}`;

  if (asset.status === "retired") {
    return silent(subjectKey, "This asset is retired.");
  }

  // The scheduled date and the wear-adjusted one are kept apart deliberately.
  // A household has not *missed* a service that only became due because a
  // sensor noticed something this morning, and telling them they did would be
  // both untrue and the kind of thing that teaches people to ignore an app.
  const scheduled = nextServiceDue(asset, [], now);
  const wear = assessWear(signals, { powerDraw: null }, now);
  const effective = nextServiceDue(asset, signals, now);

  if (scheduled && effective) {
    if (options.openServiceRequest) {
      // Somebody is already on it. Saying it again is how a household learns to
      // stop reading these.
      return silent(subjectKey, "A service request is already open for this.");
    }

    const daysOverdue = -daysBetween(now, scheduled);
    const cover = coverageOn(asset, now);
    const covered = cover.kind !== "none" ? ` It is covered by ${describeCoverage(cover.kind)}.` : "";

    if (daysOverdue > 0) {
      return {
        subjectKey,
        status: "missed",
        riskLevel: "high",
        notable: true,
        reason: `${asset.name} was due for service ${daysOverdue} days ago.${covered}`,
        action: { action: "book_service", target: asset.id },
        dueOn: isoDate(scheduled),
      };
    }

    if (wear.bringForwardDays > 0 && daysBetween(now, effective) <= SERVICE_LEAD_DAYS) {
      return {
        subjectKey,
        status: "at_risk",
        riskLevel: "high",
        notable: true,
        reason: `${asset.name} needs service sooner than scheduled: ${lowerFirst(wear.reason)}${covered}`,
        action: { action: "book_service", target: asset.id },
        // The date the household should now work to, not the one on the calendar.
        dueOn: isoDate(effective > now ? effective : now),
      };
    }

    const daysUntil = daysBetween(now, scheduled);
    if (daysUntil <= SERVICE_LEAD_DAYS) {
      return {
        subjectKey,
        status: "at_risk",
        riskLevel: "medium",
        notable: true,
        reason: `${asset.name} is due for service in ${daysUntil} days.${covered}`,
        action: { action: "book_service", target: asset.id },
        dueOn: isoDate(scheduled),
      };
    }
  }

  const cover = coverageOn(asset, now);
  if (
    cover.kind !== "none" &&
    cover.daysRemaining !== null &&
    cover.daysRemaining <= COVERAGE_LEAD_DAYS
  ) {
    return {
      subjectKey,
      status: "at_risk",
      riskLevel: "low",
      notable: true,
      reason: `${asset.name}'s ${describeCoverage(cover.kind)} expires in ${cover.daysRemaining} days.`,
      action: { action: "review_coverage", target: asset.id },
      dueOn: cover.expiresOn,
    };
  }

  return silent(subjectKey, `${asset.name} needs nothing right now.`);
}

function describeCoverage(kind: Coverage["kind"]): string {
  switch (kind) {
    case "warranty":
      return "warranty";
    case "amc":
      return "annual maintenance contract";
    case "none":
      return "no cover";
  }
}

/**
 * The assets worth putting in front of somebody, most urgent first.
 *
 * Only the notable ones: a maintenance screen that lists everything the
 * household owns is an inventory, and an inventory is the thing this module
 * exists not to be.
 */
export function maintenanceAgenda(
  assets: readonly HomeAsset[],
  options: { now?: Date; signalsFor?: (assetId: string) => readonly DeviceSignal[]; hasOpenRequest?: (assetId: string) => boolean } = {},
): HomeAssessment[] {
  const order = { high: 0, medium: 1, low: 2, none: 3 } as const;

  return assets
    .map((asset) =>
      assessAsset(asset, {
        now: options.now,
        signals: options.signalsFor?.(asset.id) ?? [],
        openServiceRequest: options.hasOpenRequest?.(asset.id) ?? false,
      }),
    )
    .filter((assessment) => assessment.notable)
    .sort((a, b) => order[a.riskLevel] - order[b.riskLevel] || (a.dueOn ?? "").localeCompare(b.dueOn ?? ""));
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
