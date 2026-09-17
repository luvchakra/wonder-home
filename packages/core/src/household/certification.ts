/**
 * Household certification (stories 05-001 through 05-006).
 *
 * The family's answer to "what does WonderHome think it knows about us?" — and,
 * just as importantly, "why does it think that?". Every item carries its source,
 * so a belief can always be traced back to setup, something said, an
 * integration, or a pattern the system noticed.
 *
 * The coverage indicator is explainable by construction: it is a count of items
 * in known states, not a model's estimate of its own reliability. A number
 * nobody can explain is worse than no number, because a family will trust it.
 */

export const CERTIFICATION_CATEGORIES = [
  "family_roles",
  "home_routines",
  "education",
  "finance",
  "lifestyle",
  "safety",
] as const;
export type CertificationCategory = (typeof CERTIFICATION_CATEGORIES)[number];

export type CertificationStatus = "learned" | "confirmed" | "needs_review" | "corrected" | "removed";
export type CertificationRisk = "low" | "medium" | "high" | "critical";
export type CertificationSource = "setup" | "conversation" | "integration" | "observed";

export type CertificationItem = {
  id: string;
  category: CertificationCategory;
  claim: string;
  sourceType: CertificationSource;
  sourceDetail?: string | null;
  status: CertificationStatus;
  riskLevel: CertificationRisk;
  lastReviewedAt: Date | null;
};

/**
 * How long a belief stands before it is worth re-checking, by risk.
 *
 * High-risk beliefs go stale faster because the cost of being wrong is higher,
 * not because they change more often.
 */
export const REVIEW_INTERVAL_DAYS: Record<CertificationRisk, number> = {
  critical: 30,
  high: 90,
  medium: 180,
  low: 365,
};

/**
 * Risk is a property of the subject, not of the system's confidence.
 *
 * Being wrong about a payment limit or a child's school is expensive whatever
 * the confidence attached to it, which is why risk is assigned by category and
 * source rather than derived from a score.
 */
export function assessRisk(input: {
  category: CertificationCategory;
  sourceType: CertificationSource;
  affectsMoney?: boolean;
  affectsChild?: boolean;
  affectsAccess?: boolean;
}): CertificationRisk {
  if (input.affectsMoney || input.affectsAccess) return "critical";
  if (input.affectsChild || input.category === "safety") return "high";
  if (input.category === "finance" || input.category === "education") return "high";
  // A pattern the system noticed carries more risk than something it was told.
  if (input.sourceType === "observed") return "medium";
  return "low";
}

export function needsReview(item: CertificationItem, now: Date = new Date()): boolean {
  if (item.status === "needs_review") return true;
  if (item.status === "removed" || item.status === "corrected") return false;

  // Anything never reviewed, and not yet confirmed, is by definition unreviewed.
  if (!item.lastReviewedAt) return item.status !== "confirmed";

  const ageDays = (now.getTime() - item.lastReviewedAt.getTime()) / 86_400_000;
  return ageDays > REVIEW_INTERVAL_DAYS[item.riskLevel];
}

export type CertificationSummary = {
  confirmed: number;
  learned: number;
  needsReview: number;
  /** Whole percent of live items that are confirmed. */
  understanding: number;
  /** Per-category counts, for the breakdown the family actually reads. */
  byCategory: Record<CertificationCategory, { confirmed: number; total: number }>;
};

export function summarize(
  items: CertificationItem[],
  now: Date = new Date(),
): CertificationSummary {
  const live = items.filter((item) => item.status !== "removed" && item.status !== "corrected");

  const byCategory = Object.fromEntries(
    CERTIFICATION_CATEGORIES.map((category) => [category, { confirmed: 0, total: 0 }]),
  ) as CertificationSummary["byCategory"];

  let confirmed = 0;
  let learned = 0;
  let review = 0;

  for (const item of live) {
    byCategory[item.category].total += 1;

    if (needsReview(item, now)) {
      review += 1;
    } else if (item.status === "confirmed") {
      confirmed += 1;
      byCategory[item.category].confirmed += 1;
    } else {
      learned += 1;
    }
  }

  return {
    confirmed,
    learned,
    needsReview: review,
    // A household with nothing recorded is not 100% understood; it is 0%.
    understanding: live.length === 0 ? 0 : Math.round((confirmed / live.length) * 100),
    byCategory,
  };
}

export type CertificationAlert = {
  itemId: string;
  claim: string;
  riskLevel: CertificationRisk;
  /** What the family can do about it, in one word. */
  action: "review" | "confirm" | "fix" | "set_up";
  reason: string;
};

/**
 * The items worth putting in front of someone, highest risk first.
 *
 * Every alert carries an action. An alert a family can read but not act on is
 * a worry with no outlet, which is the opposite of what this screen is for.
 */
export function alertsFor(
  items: CertificationItem[],
  now: Date = new Date(),
  limit = 5,
): CertificationAlert[] {
  const order: Record<CertificationRisk, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  return items
    .filter((item) => needsReview(item, now))
    .sort((a, b) => order[a.riskLevel] - order[b.riskLevel])
    .slice(0, limit)
    .map((item) => ({
      itemId: item.id,
      claim: item.claim,
      riskLevel: item.riskLevel,
      action: actionFor(item),
      reason: reasonFor(item, now),
    }));
}

function actionFor(item: CertificationItem): CertificationAlert["action"] {
  if (item.status === "needs_review") return "fix";
  if (item.sourceType === "observed") return "confirm";
  if (!item.lastReviewedAt) return "review";
  return "review";
}

function reasonFor(item: CertificationItem, now: Date): string {
  if (item.status === "needs_review") return "Something contradicts this.";
  if (!item.lastReviewedAt) return `Learned from ${describeSource(item.sourceType)}, never checked.`;

  const ageDays = Math.floor((now.getTime() - item.lastReviewedAt.getTime()) / 86_400_000);
  return `Last checked ${ageDays} days ago.`;
}

function describeSource(source: CertificationSource): string {
  switch (source) {
    case "setup":
      return "setup";
    case "conversation":
      return "something you said";
    case "integration":
      return "a connected account";
    case "observed":
      return "a pattern WonderHome noticed";
  }
}

export type ReviewDecision = "confirmed" | "corrected" | "removed" | "deferred";

/** What a review does to an item's status. */
export function applyReview(
  item: CertificationItem,
  decision: ReviewDecision,
  now: Date = new Date(),
): CertificationItem {
  switch (decision) {
    case "confirmed":
      return { ...item, status: "confirmed", lastReviewedAt: now };
    case "corrected":
      // The corrected item is retired; the replacement is a new item, so the
      // history of what was believed stays intact.
      return { ...item, status: "corrected", lastReviewedAt: now };
    case "removed":
      return { ...item, status: "removed", lastReviewedAt: now };
    case "deferred":
      // Deferring records that someone looked, without claiming they agreed.
      return { ...item, lastReviewedAt: now };
  }
}
