import type { Permission, PermissionContext } from "../identity/permissions";
import { can } from "../identity/permissions";

/**
 * Househelper and home operations (stories 07-001 through 07-005).
 *
 * The product rule this module exists to honour: a househelper does not update
 * WonderHome. They do their work; the system notices when something is *not*
 * normal. Anything that would require the helper to tick a box, confirm a task
 * or otherwise keep the app accurate is a design failure, not a missing feature.
 *
 * The screens' canonical moment lives here too — "Sunita won't be here
 * tomorrow" is not a note. It is an absence with a household impact, and
 * working out that impact is what the family actually wanted.
 */

export type Engagement = "regular" | "occasional" | "service";

export type AvailabilityWindow = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type AvailabilityException = {
  onDate: string;
  available: boolean;
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
};

/**
 * Whether someone is expected on a given date.
 *
 * Exceptions override the pattern for that day rather than replacing it, so a
 * single absence never rewrites a schedule — which matters because the pattern
 * is what tells us the absence is unusual in the first place.
 */
export function isExpectedOn(
  date: Date,
  windows: readonly AvailabilityWindow[],
  exceptions: readonly AvailabilityException[],
): boolean {
  const isoDate = date.toISOString().slice(0, 10);
  const exception = exceptions.find((entry) => entry.onDate === isoDate);
  if (exception) return exception.available;

  return windows.some((window) => window.dayOfWeek === date.getUTCDay());
}

export type HelperResponsibility = {
  outcomeKey: string;
  /** Who covers when the helper is not there. Null means nobody yet. */
  backupMemberId: string | null;
  priority: number;
};

export type AbsenceImpact = {
  date: string;
  /** Outcomes that will not happen unless something changes. */
  affected: HelperResponsibility[];
  /** Those with somebody already named to cover. */
  covered: HelperResponsibility[];
  /** Those with nobody — the part a person actually needs to see. */
  uncovered: HelperResponsibility[];
  /** Whether this needs anyone's attention at all. */
  notable: boolean;
  summary: string;
};

/**
 * What an absence actually means for the household (story 07-002).
 *
 * An absence with full cover is not news. The household does not need to be
 * told that a system it trusts handled something — that is the mental load this
 * product removes, not a status update it should generate.
 */
export function assessAbsence(input: {
  date: string;
  responsibilities: readonly HelperResponsibility[];
  /** Outcome keys the helper would have covered on that date. */
  scheduledOutcomeKeys: readonly string[];
}): AbsenceImpact {
  const affected = input.responsibilities.filter((responsibility) =>
    input.scheduledOutcomeKeys.includes(responsibility.outcomeKey),
  );

  const covered = affected.filter((responsibility) => responsibility.backupMemberId !== null);
  const uncovered = affected.filter((responsibility) => responsibility.backupMemberId === null);

  return {
    date: input.date,
    affected,
    covered,
    uncovered,
    notable: uncovered.length > 0,
    summary: describeImpact(affected.length, uncovered.length),
  };
}

function describeImpact(affected: number, uncovered: number): string {
  if (affected === 0) return "Nothing was due that day.";
  if (uncovered === 0) {
    return `${affected} ${plural(affected, "thing", "things")} affected, all covered.`;
  }
  return `${uncovered} of ${affected} ${plural(affected, "thing", "things")} affected ${plural(uncovered, "has", "have")} nobody to cover.`;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export type HelperException = {
  kind: "blocked" | "missing_supplies" | "extra_work" | "not_arrived";
  outcomeKey: string;
  detail: string;
};

export type HelperExceptionHandling =
  | { kind: "handle_silently"; because: string }
  | { kind: "tell_household"; impact: string; action: { action: string; target?: string } };

/**
 * What to do when the helper's work hits a problem (story 07-004).
 *
 * The test applied here is whether a person is needed, not whether something
 * went wrong. A missing supply WonderHome can reorder is not an interruption;
 * one it cannot is.
 */
export function handleHelperException(
  exception: HelperException,
  context: { canReorder: boolean; hasBackup: boolean },
): HelperExceptionHandling {
  switch (exception.kind) {
    case "missing_supplies":
      return context.canReorder
        ? { kind: "handle_silently", because: "WonderHome can reorder this without anyone." }
        : {
            kind: "tell_household",
            impact: `${exception.outcomeKey} is short of what it needs: ${exception.detail}`,
            action: { action: "add_to_list", target: exception.outcomeKey },
          };

    case "not_arrived":
      return context.hasBackup
        ? { kind: "handle_silently", because: "Someone is already covering." }
        : {
            kind: "tell_household",
            impact: `Nobody is covering ${exception.outcomeKey} today.`,
            action: { action: "find_cover", target: exception.outcomeKey },
          };

    case "blocked":
      return {
        kind: "tell_household",
        impact: `${exception.outcomeKey} cannot proceed: ${exception.detail}`,
        action: { action: "unblock", target: exception.outcomeKey },
      };

    case "extra_work":
      // Extra work getting done is good news, and good news is not urgent.
      return { kind: "handle_silently", because: "Extra work is not a problem to solve." };
  }
}

/**
 * What a helper with an account may see (story 07-005).
 *
 * Their own schedule and the work they are responsible for. Not the family's
 * finances, not their conversations, not the children's plans. A helper account
 * is a convenience for the helper, never a window into the household.
 */
export const HELPER_VISIBLE: readonly Permission[] = [] as const;

export function helperMaySee(
  helper: PermissionContext,
  subject: "own_schedule" | "own_responsibilities" | "household_finances" | "family_plans" | "child_school",
): boolean {
  switch (subject) {
    case "own_schedule":
    case "own_responsibilities":
      // Always: this is what the account is for.
      return true;
    case "household_finances":
      return can(helper, "finance.view");
    case "child_school":
      return can(helper, "school.manage");
    case "family_plans":
      return can(helper, "conversation.private");
  }
}

/**
 * Whether the helper should be asked to do anything in the app at all.
 *
 * Almost never. A daily summary is offered as an opt-in convenience, and
 * nothing in the product depends on the helper responding to it.
 */
export function helperNeedsToRespond(exception: HelperException | null): boolean {
  return exception !== null && exception.kind === "blocked";
}
