/**
 * The notification decision engine (stories 06-001 through 06-007).
 *
 * The rule this module exists to enforce: no notification is emitted because an
 * event occurred. Something happening is not a reason to interrupt a person —
 * the engine has to establish that a *specific* recipient needs information or
 * an action they can actually take.
 *
 * Everything here is a pure decision. Delivery belongs elsewhere; this decides
 * whether, whom, when, and what the person can do about it.
 */

export type NotificationType = "action" | "decision" | "risk" | "completion";

export type HouseholdEvent = {
  /** Stable identity for the thing being reported, e.g. an outcome. */
  threadKey: string;
  outcomeKey: string;
  kind: "exception" | "state_change" | "approval_needed" | "completed";
  /** Whether WonderHome can still fix this without anybody. */
  aiResolvable: boolean;
  riskLevel: "none" | "low" | "medium" | "high";
  /** When the thing this concerns is actually due. */
  dueAt: Date | null;
  impact: string;
  recommendedAction: { action: string; target?: string } | null;
};

export type Candidate = {
  memberId: string;
  role: "primary" | "backup" | "administrator";
  /** Whether this person could act on it if told. */
  canAct: boolean;
  availability: { quietFrom: number; quietUntil: number } | null;
};

export type DecisionContext = {
  candidates: Candidate[];
  /** Threads already live, so an evolving situation does not start a new one. */
  openThreadKeys: readonly string[];
  now: Date;
};

export type NotificationDecision =
  | { kind: "stay_silent"; because: string }
  | {
      kind: "notify";
      recipientMemberId: string;
      type: NotificationType;
      threadKey: string;
      /** Whether this joins an existing thread rather than starting one. */
      updatesExistingThread: boolean;
      deliverAt: Date;
      impact: string;
      action: { action: string; target?: string } | null;
      /** The factors behind the decision, kept so it can be explained later. */
      factors: Record<string, unknown>;
    };

/** Below this, a risk is not worth a person's attention on its own. */
const INTERRUPT_RISK: ReadonlySet<HouseholdEvent["riskLevel"]> = new Set(["medium", "high"]);

export function decideNotification(
  event: HouseholdEvent,
  context: DecisionContext,
): NotificationDecision {
  // 1. Can WonderHome still handle it? Then it is not yet anyone's problem.
  if (event.aiResolvable) {
    return { kind: "stay_silent", because: "WonderHome can still resolve this without anyone." };
  }

  // 2. Completion is not news. The family sees what was handled on the home
  //    screen; being told each time is the mental load this product removes.
  if (event.kind === "completed") {
    return { kind: "stay_silent", because: "Routine work completing is not worth an interruption." };
  }

  // 3. Something merely changing state is not a reason to speak.
  if (event.kind === "state_change" && !INTERRUPT_RISK.has(event.riskLevel)) {
    return { kind: "stay_silent", because: "Nothing is at risk and nothing is needed from anyone." };
  }

  // 4. Nothing to offer means nothing to say. An interruption a person cannot
  //    act on is a worry with no outlet.
  if (!event.recommendedAction && event.kind !== "approval_needed") {
    return { kind: "stay_silent", because: "There is no action anyone could take yet." };
  }

  const recipient = chooseRecipient(context.candidates);
  if (!recipient) {
    return { kind: "stay_silent", because: "Nobody here could act on this." };
  }

  const type = typeFor(event);
  const deliverAt = chooseTime(event, recipient, context.now);

  return {
    kind: "notify",
    recipientMemberId: recipient.memberId,
    type,
    threadKey: event.threadKey,
    updatesExistingThread: context.openThreadKeys.includes(event.threadKey),
    deliverAt,
    impact: event.impact,
    action: event.recommendedAction,
    factors: {
      recipientRole: recipient.role,
      riskLevel: event.riskLevel,
      aiResolvable: event.aiResolvable,
      urgent: isUrgent(event, context.now),
      deferredForQuietHours: deliverAt.getTime() !== context.now.getTime(),
    },
  };
}

/**
 * The responsible member, or an authorized backup if they cannot act.
 *
 * One recipient, never a broadcast: telling everybody is how a household learns
 * to ignore notifications, and it means nobody is actually accountable.
 */
export function chooseRecipient(candidates: Candidate[]): Candidate | null {
  const order: Record<Candidate["role"], number> = { primary: 0, backup: 1, administrator: 2 };
  return (
    candidates
      .filter((candidate) => candidate.canAct)
      .sort((a, b) => order[a.role] - order[b.role])[0] ?? null
  );
}

function typeFor(event: HouseholdEvent): NotificationType {
  if (event.kind === "approval_needed") return "decision";
  if (event.kind === "completed") return "completion";
  return event.riskLevel === "high" ? "risk" : "action";
}

/**
 * When to deliver.
 *
 * Quiet hours are respected unless waiting would make the thing undoable. A
 * product that wakes a family for something that could have waited until
 * morning has not saved them anything.
 */
export function chooseTime(event: HouseholdEvent, recipient: Candidate, now: Date): Date {
  if (isUrgent(event, now)) return now;
  if (!recipient.availability) return now;

  const { quietFrom, quietUntil } = recipient.availability;
  if (!inQuietHours(now, quietFrom, quietUntil)) return now;

  const wakeAt = new Date(now);
  wakeAt.setUTCHours(quietUntil, 0, 0, 0);
  if (wakeAt <= now) wakeAt.setUTCDate(wakeAt.getUTCDate() + 1);

  // If it would be too late by morning, it was urgent after all.
  if (event.dueAt && wakeAt >= event.dueAt) return now;

  return wakeAt;
}

/** Quiet hours may wrap midnight, which is the normal case. */
export function inQuietHours(now: Date, from: number, until: number): boolean {
  const hour = now.getUTCHours();
  return from <= until ? hour >= from && hour < until : hour >= from || hour < until;
}

function isUrgent(event: HouseholdEvent, now: Date): boolean {
  if (event.riskLevel === "high") return true;
  if (!event.dueAt) return false;
  return event.dueAt.getTime() - now.getTime() <= 2 * 3_600_000;
}

export type NotificationState =
  | "generated"
  | "delivered"
  | "seen"
  | "acted"
  | "resolved"
  | "expired";

export type EscalationInput = {
  state: NotificationState;
  deliveredAt: Date | null;
  riskLevel: HouseholdEvent["riskLevel"];
  dueAt: Date | null;
  /** Who has already been told, so escalation moves on rather than repeating. */
  alreadyNotified: readonly string[];
  candidates: Candidate[];
};

export type EscalationDecision =
  | { kind: "hold"; because: string }
  | { kind: "escalate"; toMemberId: string; because: string };

/** How long an unanswered notification stands before anyone else is involved. */
export const ESCALATE_AFTER_MINUTES: Record<HouseholdEvent["riskLevel"], number> = {
  high: 30,
  medium: 120,
  low: 480,
  none: 480,
};

/**
 * Whether to involve somebody else (story 06-005).
 *
 * Only when the thing is still unresolved *and* still at risk. Escalating
 * something that has been dealt with, or that never mattered, is how a
 * household learns that escalation means nothing.
 */
export function decideEscalation(input: EscalationInput, now: Date): EscalationDecision {
  if (input.state === "acted" || input.state === "resolved") {
    return { kind: "hold", because: "It has been dealt with." };
  }
  if (input.state === "expired") {
    return { kind: "hold", because: "It is no longer relevant." };
  }
  if (!input.deliveredAt) {
    return { kind: "hold", because: "It has not reached anyone yet." };
  }
  if (input.dueAt && input.dueAt <= now) {
    return { kind: "hold", because: "The deadline has passed; this is now a missed outcome." };
  }

  const waitedMinutes = (now.getTime() - input.deliveredAt.getTime()) / 60_000;
  if (waitedMinutes < ESCALATE_AFTER_MINUTES[input.riskLevel]) {
    return { kind: "hold", because: "There is still time for the first person to act." };
  }

  const next = input.candidates.find(
    (candidate) => candidate.canAct && !input.alreadyNotified.includes(candidate.memberId),
  );

  return next
    ? { kind: "escalate", toMemberId: next.memberId, because: "Still unresolved and still at risk." }
    : { kind: "hold", because: "There is nobody else who could act." };
}

/**
 * Whether an outstanding notification should now resolve itself (story 06-006).
 *
 * The family should never have to dismiss something that stopped being true.
 */
export function shouldAutoResolve(input: {
  state: NotificationState;
  outcomeStatus: "pending" | "on_track" | "at_risk" | "blocked" | "met" | "missed" | "cancelled";
}): boolean {
  if (input.state === "resolved" || input.state === "expired") return false;
  return input.outcomeStatus === "met" || input.outcomeStatus === "cancelled";
}
