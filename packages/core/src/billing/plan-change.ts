import { FEATURES, type FeatureKey, type PlanFeature, type Subscription } from "./entitlements";

/**
 * Changing plans without losing anything (story 20-004).
 *
 * The criterion is short — "change plans without data loss" — and the way
 * products usually break it is not by running a DELETE. It is by letting a
 * downgrade quietly make things unreachable and calling that "no longer
 * available". A household that had fourteen connected accounts and now has
 * one has not lost data in the database's sense and has absolutely lost it in
 * theirs.
 *
 * So this module does one thing: it says exactly what a change will do,
 * **before** it happens, in the household's own terms, and it distinguishes
 * the two things a downgrade can mean.
 *
 * **A capability stops.** The feature is gone from the new plan. Whatever it
 * produced stays and is still readable; the thing that made more of it stops.
 *
 * **A limit is now lower than what is already there.** Nothing is removed to
 * fit. Existing records stay over the line and no new ones are added until
 * usage falls back under it — which is what "fail gracefully and preserve
 * existing records" has to mean if it means anything.
 *
 * Nothing here knows what a plan costs. Pricing is not a thing a domain module
 * should be able to learn, which is the last criterion, and the reason this
 * takes plan *features* rather than a plan.
 */

export type ChangeDirection = "upgrade" | "downgrade" | "lateral";

export type StoppingCapability = {
  featureKey: string;
  label: string;
  /** What actually happens to what they already have. */
  whatHappens: string;
};

export type ExceededLimit = {
  featureKey: string;
  label: string;
  /** What they have used in the current period. */
  have: number;
  /** What the new plan allows. */
  allowed: number;
  whatHappens: string;
};

export type PlanChangeAssessment = {
  direction: ChangeDirection;
  fromPlanKey: string | null;
  toPlanKey: string;
  /** Features the new plan adds. */
  gaining: { featureKey: string; label: string }[];
  stopping: StoppingCapability[];
  exceeded: ExceededLimit[];
  /**
   * Whether anything at all is removed by this change.
   *
   * Always false. It is a field rather than a comment because the promise is
   * load-bearing, and a test asserts it for every possible change — so a
   * future version that starts deleting has to change this line, in the open,
   * rather than change behaviour quietly.
   */
  deletesData: false;
};

export function assessPlanChange(input: {
  from: Subscription | null;
  toPlanKey: string;
  toFeatures: readonly PlanFeature[];
  /** What the household has used this period, by feature. */
  usage: Readonly<Record<string, number>>;
}): PlanChangeAssessment {
  const { from, toPlanKey, toFeatures, usage } = input;

  const before = new Map((from?.features ?? []).map((feature) => [feature.featureKey, feature]));
  const after = new Map(toFeatures.map((feature) => [feature.featureKey, feature]));

  const gaining: PlanChangeAssessment["gaining"] = [];
  const stopping: StoppingCapability[] = [];
  const exceeded: ExceededLimit[] = [];

  for (const [featureKey, next] of after) {
    const current = before.get(featureKey);
    if (next.enabled && !current?.enabled) {
      gaining.push({ featureKey, label: labelFor(featureKey) });
    }
  }

  for (const [featureKey, current] of before) {
    if (!current.enabled) continue;
    const next = after.get(featureKey);

    if (!next?.enabled) {
      stopping.push({
        featureKey,
        label: labelFor(featureKey),
        whatHappens: `${keeps(featureKey)} Nothing new is added until this is back in your plan.`,
      });
      continue;
    }

    // A limit that is now below what has already been used. Not an error and
    // not a deletion — a ceiling somebody is already above.
    const used = usage[featureKey] ?? 0;
    if (next.limitPerPeriod !== null && used > next.limitPerPeriod) {
      exceeded.push({
        featureKey,
        label: labelFor(featureKey),
        have: used,
        allowed: next.limitPerPeriod,
        whatHappens:
          next.limitPerPeriod === 0
            ? `${keeps(featureKey)} Nothing new is added while your plan allows none.`
            : `${keeps(featureKey)} Nothing new is added until you are back under ${next.limitPerPeriod}.`,
      });
    }
  }

  return {
    direction: directionOf(gaining.length, stopping.length, exceeded.length),
    fromPlanKey: from?.planKey ?? null,
    toPlanKey,
    gaining: gaining.sort(byLabel),
    stopping: stopping.sort(byLabel),
    exceeded: exceeded.sort(byLabel),
    deletesData: false,
  };
}

function directionOf(gaining: number, stopping: number, exceeded: number): ChangeDirection {
  const losing = stopping + exceeded;
  if (gaining > 0 && losing === 0) return "upgrade";
  if (losing > 0 && gaining === 0) return "downgrade";
  // Both, or neither. "Lateral" is the honest word for a change that trades
  // one capability for another, and calling it an upgrade would be a sales
  // word in a place that should only carry facts.
  return "lateral";
}

function byLabel(a: { label: string }, b: { label: string }): number {
  return a.label.localeCompare(b.label);
}

function labelFor(featureKey: string): string {
  return FEATURES[featureKey as FeatureKey] ?? featureKey;
}

/**
 * What stays, per feature, in the household's terms.
 *
 * Named per feature rather than "your data is kept", because "your data" is
 * not a thing anybody pictures. A person worried about downgrading is
 * picturing their bills, or their children's school work, and wants to be told
 * about *that*.
 */
function keeps(featureKey: string): string {
  switch (featureKey) {
    case "conversation.text":
    case "conversation.voice":
      return "Everything you have said to the assistant stays, and stays readable.";
    case "school.connector":
      return "Your children's school work and documents stay.";
    case "commerce.orders":
      return "Your orders and their history stay.";
    case "finance.bills":
      return "Your bills, what was paid and when all stay.";
    case "meals.planning":
      return "Your recipes and meal plans stay.";
    case "family.events":
      return "Your family calendar stays.";
    case "home.maintenance":
      return "Your home, pets and maintenance records stay.";
    case "integrations.deep":
    case "home.weather":
      return "Everything already brought in stays, and connections stop syncing.";
    case "ai.agent_runs":
    case "ai.autonomous_action":
      return "Everything WonderHome has already done stays on record.";
    case "household.outcomes":
    case "household.notifications":
      return "Your playbook, responsibilities and history stay.";
    default:
      return "Everything already recorded stays, and stays readable.";
  }
}

/**
 * The change, as sentences a household reads before agreeing to it.
 *
 * Deliberately leads with what is lost. A downgrade screen that opens with
 * what you keep is a screen written to get somebody through it.
 */
export function describePlanChange(assessment: PlanChangeAssessment): string[] {
  const lines: string[] = [];

  for (const capability of assessment.stopping) {
    lines.push(`${capability.label} stops. ${capability.whatHappens}`);
  }

  for (const limit of assessment.exceeded) {
    lines.push(
      `${limit.label}: you have used ${limit.have} this period and the new plan allows ${limit.allowed}. ${limit.whatHappens}`,
    );
  }

  if (assessment.gaining.length > 0) {
    lines.push(`You gain: ${assessment.gaining.map((entry) => entry.label).join(", ")}.`);
  }

  if (lines.length === 0) {
    lines.push("Nothing changes about what you can do. The plan name changes, and that is all.");
  }

  // Last, and always. The one sentence somebody scrolling for reassurance is
  // looking for, and the one this module exists to be able to make truthfully.
  lines.push("Nothing is deleted. Changing plans never removes anything your household has.");

  return lines;
}

/**
 * Whether this change needs a person to agree to it first.
 *
 * An upgrade does not: nothing a household has stops working because they were
 * given more. Anything that takes a capability away does, whoever asked for
 * it — including the household itself, because "I did not realise that would
 * happen" is the complaint this exists to prevent.
 */
export function needsConfirmation(assessment: PlanChangeAssessment): boolean {
  return assessment.stopping.length > 0 || assessment.exceeded.length > 0;
}
