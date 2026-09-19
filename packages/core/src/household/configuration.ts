import type { MemberType } from "../identity/schemas";
import { AUTONOMY_MODES, type AutonomyMode } from "./autonomy";

/**
 * The household's operating model, and the rules for changing it safely
 * (story 02-001).
 *
 * The tables already exist — playbook items, their dependency graph,
 * responsibilities and versioned policies. What was missing is everything
 * around them: what a setup wizard's steps are, which assignments are
 * self-contradictory and must be refused, and what a change actually *does*
 * once it is saved.
 *
 * That last one is the acceptance criterion worth dwelling on. A household
 * setting AI autonomy to "execute" is agreeing to something specific, and a
 * screen that saves it silently has not really asked. So every change this
 * module accepts can describe its own downstream effect in the household's
 * own terms, and the screens say it out loud before and after saving.
 *
 * Everything here is pure. Whether a member exists is the repository's
 * question; whether an assignment makes sense is this module's, and it is
 * answered the same way by the wizard, the API and any AI tool.
 */

export type ConfigMember = {
  id: string;
  displayName: string;
  memberType: MemberType;
};

export type ResponsibilityInput = {
  outcomeKey: string;
  primaryMemberId: string | null;
  backupMemberId: string | null;
  aiMode: AutonomyMode;
  priority: number;
};

export type Problem = { field: string; message: string };
export type Validation = { ok: boolean; problems: Problem[] };

/** Outcomes a child must never be made accountable for. */
const ADULT_ONLY_PREFIXES = ["finance.", "bills.", "payments.", "security.", "household.admin"];

/**
 * Whether a responsibility assignment holds together (02-001).
 *
 * The database already refuses a backup who is also the primary. These are
 * the contradictions it cannot see: a backup covering nobody, an autonomy
 * level nobody is accountable for, and a child put in charge of the money.
 */
export function validateResponsibility(
  input: ResponsibilityInput,
  members: readonly ConfigMember[],
): Validation {
  const problems: Problem[] = [];
  const byId = new Map(members.map((member) => [member.id, member]));

  if (input.primaryMemberId && !byId.has(input.primaryMemberId)) {
    problems.push({ field: "primaryMemberId", message: "That person is not in this household." });
  }
  if (input.backupMemberId && !byId.has(input.backupMemberId)) {
    problems.push({ field: "backupMemberId", message: "That person is not in this household." });
  }

  if (input.backupMemberId && input.backupMemberId === input.primaryMemberId) {
    problems.push({
      field: "backupMemberId",
      message: "A backup who is also the owner is not a backup. Choose somebody else, or none.",
    });
  }

  // A backup exists to cover for somebody. With nobody to cover for, the row
  // says the outcome is unowned and simultaneously that somebody covers it.
  if (input.backupMemberId && !input.primaryMemberId) {
    problems.push({
      field: "primaryMemberId",
      message: "Give this outcome an owner before naming who covers for them.",
    });
  }

  // Autonomy is consulted at execution time. Letting WonderHome act alone on
  // an outcome nobody owns means there is nobody to answer for what it did.
  if (!input.primaryMemberId && (input.aiMode === "execute" || input.aiMode === "approve")) {
    problems.push({
      field: "aiMode",
      message:
        input.aiMode === "execute"
          ? "Somebody has to own an outcome before WonderHome may act on it alone."
          : "Approval has to go to somebody. Give this outcome an owner first.",
    });
  }

  const primary = input.primaryMemberId ? byId.get(input.primaryMemberId) : undefined;
  if (primary && primary.memberType === "child" && isAdultOnly(input.outcomeKey)) {
    problems.push({
      field: "primaryMemberId",
      message: `${primary.displayName} is a child, and this is not a child's to carry.`,
    });
  }

  if (!AUTONOMY_MODES.includes(input.aiMode)) {
    problems.push({ field: "aiMode", message: "That is not an autonomy level WonderHome has." });
  }
  if (!Number.isInteger(input.priority) || input.priority < 1 || input.priority > 5) {
    problems.push({ field: "priority", message: "Priority runs from 1 to 5." });
  }

  return { ok: problems.length === 0, problems };
}

function isAdultOnly(outcomeKey: string): boolean {
  return ADULT_ONLY_PREFIXES.some((prefix) => outcomeKey.startsWith(prefix));
}

export type PlaybookInput = {
  outcomeKey: string;
  name: string;
  outcomeDefinition: string;
  /** Hours in the household's own day, 0–23. */
  operatingWindow: { startHour: number; endHour: number } | null;
  escalateAfterHours: number | null;
};

/**
 * Turns a household's own name for an outcome into the lowercase, dotted key
 * the planner refers to it by — "Laundry ready" becomes "laundry.ready" — so
 * a household names an outcome once, in their own words, rather than naming
 * it twice for a form that only one of those names is actually theirs.
 *
 * Always produces something `validatePlaybookItem` accepts, whatever the
 * input: a name with no letters gets an `outcome.` prefix, and a result too
 * short to match on its own gets `.outcome` appended, so the one caller of
 * this (the setup wizard, when nobody typed a key by hand) never has to
 * re-validate what it derived.
 */
export function slugifyOutcomeKey(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");

  const lettered = /^[a-z]/.test(cleaned) ? cleaned : `outcome.${cleaned}`.replace(/\.+$/, "");
  const key = lettered.length >= 2 ? lettered : `${lettered}.outcome`;

  return key.slice(0, 61);
}

export function validatePlaybookItem(input: PlaybookInput): Validation {
  const problems: Problem[] = [];

  if (!/^[a-z][a-z0-9_.]{1,60}$/.test(input.outcomeKey)) {
    problems.push({
      field: "outcomeKey",
      message: "A key is lowercase letters, numbers, dots and underscores — like laundry.ready.",
    });
  }
  if (input.name.trim().length === 0) {
    problems.push({ field: "name", message: "Give it a name the family would recognise." });
  }
  if (input.outcomeDefinition.trim().length < 10) {
    problems.push({
      field: "outcomeDefinition",
      message: "Describe what good looks like, in your own words — not the steps.",
    });
  }

  const window = input.operatingWindow;
  if (window) {
    const bounded = [window.startHour, window.endHour].every(
      (hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23,
    );
    if (!bounded) {
      problems.push({ field: "operatingWindow", message: "Hours run from 0 to 23." });
    } else if (window.startHour === window.endHour) {
      problems.push({
        field: "operatingWindow",
        message: "A window that starts and ends at the same hour is not a window.",
      });
    }
  }

  if (input.escalateAfterHours !== null && input.escalateAfterHours <= 0) {
    problems.push({
      field: "escalateAfterHours",
      message: "Escalate after some time has passed, not immediately.",
    });
  }

  return { ok: problems.length === 0, problems };
}

/**
 * Whether one outcome may be made to depend on another (02-001).
 *
 * The database refuses an item depending on itself. This refuses the next
 * case up: a pair that would wait for each other forever. Detecting cycles
 * across the whole graph is story 03-006's job; what must not be possible
 * *here* is creating one two clicks into a setup wizard.
 */
export function canDependOn(
  itemKey: string,
  dependsOnKey: string,
  existing: readonly { itemKey: string; dependsOnKey: string }[],
): Validation {
  if (itemKey === dependsOnKey) {
    return {
      ok: false,
      problems: [{ field: "dependsOn", message: "An outcome cannot wait for itself." }],
    };
  }

  // Walk upstream from the proposed dependency. If we arrive back at the item
  // we are configuring, the new edge would close a loop.
  const upstream = new Map<string, string[]>();
  for (const edge of existing) {
    upstream.set(edge.itemKey, [...(upstream.get(edge.itemKey) ?? []), edge.dependsOnKey]);
  }

  const seen = new Set<string>();
  const queue = [dependsOnKey];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === itemKey) {
      return {
        ok: false,
        problems: [
          {
            field: "dependsOn",
            message: "Those two outcomes would end up waiting for each other. Choose another.",
          },
        ],
      };
    }
    if (seen.has(current)) continue;
    seen.add(current);
    queue.push(...(upstream.get(current) ?? []));
  }

  return { ok: true, problems: [] };
}

export const POLICY_CATEGORIES = [
  "spending",
  "privacy",
  "family_time",
  "notifications",
  "ai_autonomy",
  "safety",
] as const;
export type PolicyCategory = (typeof POLICY_CATEGORIES)[number];

/**
 * The version a change to a policy becomes.
 *
 * A policy is never edited in place: what was in force when something was
 * decided has to stay knowable afterwards, which is the whole point of
 * keeping versions. So a change is always the next number up, and the
 * previous version stays exactly as it was.
 */
export function nextPolicyVersion(existingVersions: readonly number[]): number {
  return existingVersions.length === 0 ? 1 : Math.max(...existingVersions) + 1;
}

export type ConfigChange =
  | { kind: "responsibility"; outcomeKey: string; aiMode: AutonomyMode; owned: boolean }
  | { kind: "policy"; category: PolicyCategory; name: string; version: number }
  | { kind: "playbook"; name: string; window: { startHour: number; endHour: number } | null };

/**
 * What a change will actually do (02-001).
 *
 * The criterion asks that configuration changes "show the affected downstream
 * behaviors". A household agreeing to let WonderHome act on its own is
 * agreeing to something specific, and a screen that saves that silently has
 * not really asked. Each line is what changes for them, not what changes in
 * the database.
 */
export function downstreamOf(change: ConfigChange): string[] {
  switch (change.kind) {
    case "responsibility":
      return [
        ...autonomyEffects(change.aiMode),
        change.owned
          ? "Anything that needs a person goes to the owner, and to their backup if the owner is away."
          : "Nobody owns this yet, so anything it raises goes to the Head of Family.",
      ];

    case "policy":
      return [
        ...policyEffects(change.category),
        `Saved as version ${change.version}. The previous version stays on record, so what was in force before is still knowable.`,
        "Checked on the server every time, so neither a screen nor the assistant can go around it.",
      ];

    case "playbook":
      return [
        "Planning uses this outcome to decide what needs doing and when.",
        change.window
          ? `Nothing for it will be scheduled outside ${formatHour(change.window.startHour)} to ${formatHour(change.window.endHour)}.`
          : "With no operating window, it can be planned at any time of day.",
        "It stays silent while it is on track. You hear about it when it is at risk.",
      ];
  }
}

function autonomyEffects(mode: AutonomyMode): string[] {
  switch (mode) {
    case "observe":
      return ["WonderHome watches this and does nothing else. It will not even suggest."];
    case "prepare":
      return ["WonderHome gets things ready and leaves them for you. Nothing is sent or spent."];
    case "approve":
      return ["WonderHome asks before it acts. You see exactly what it plans to do first."];
    case "execute":
      return [
        "WonderHome acts on this without asking first, and tells you afterwards.",
        "It still refuses anything your spending, privacy and safety policies forbid — autonomy never overrides a policy.",
      ];
  }
}

function policyEffects(category: PolicyCategory): string[] {
  switch (category) {
    case "spending":
      return ["Purchases and payments are measured against this before anything is spent."];
    case "privacy":
      return ["What each person can see is narrowed by this, on the server and in the database."];
    case "family_time":
      return ["Protected time is held against this, and automation may not schedule over it."];
    case "notifications":
      return ["Quiet hours and channels follow this, including anything urgent WonderHome raises."];
    case "ai_autonomy":
      return ["This caps what WonderHome may do on its own, whatever a single responsibility says."];
    case "safety":
      return ["Anything WonderHome judges unsafe is refused under this, with the reason recorded."];
  }
}

function formatHour(hour: number): string {
  const period = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${period}`;
}
