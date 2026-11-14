import { decideAutonomy, type AutonomyDecision, type AutonomyMode, type ProposedAction } from "../household/autonomy";
import type { PermissionContext } from "../identity/permissions";
import type { HouseholdIntent } from "./intent";

/**
 * Conversational consent (HomeBrain 4.0 §3.9, story 14-025).
 *
 * The owner, 2026-10-18: "it should just understand user intent and do what
 * is asked during conversation, no separate okay required." Asked for a
 * movie night on Friday, HomeTalk said it needed an OK on screen and to type
 * it in — twice.
 *
 * So a clear request a person makes in the conversation is itself the
 * consent, for everyday changes to the household's own records that can be
 * undone. WonderHome does it, says what it did, and how to take it back.
 *
 * - **act** — done at once, with an undo: the list, reminders, what someone
 *   likes, a plan, a meal, being away oneself, school ticks,
 *   a repair, what is at home, one's own health notes.
 * - **confirm** — one short question in the same conversation, and a
 *   spoken or typed "yes" is the yes: changing who owns a responsibility,
 *   moving something already on the calendar, anyone named back at medium confidence ("I think you mean Manan…"), and
 *   a bill or health appointment while the household keeps money or health
 *   on "Wait for review".
 *
 * Record first (the owner, 2026-11-14; plan "Nothing stuck in review",
 * decision 1): writing information down is reversible, so it never waits.
 * A calendar entry (with guests or not: nobody outside is messaged), someone
 * else's day away, a bill, a health appointment, a reminder, a list or a note
 * is recorded at once and said back with Undo. A yes is asked
 * only for actions: paying, ordering, messaging someone outside the
 * household, booking, cancelling, deleting and sharing.
 * - **step_up** — never by voice and never by a yes alone: paying and
 *   ordering. They keep their card on screen, and step-up where it applies.
 *
 * What stays exactly as it was:
 * - permission, entitlement and RLS run first (`proposeFromIntent`); a
 *   request nobody may make is refused before consent is considered;
 * - what WonderHome does on its own — agents, HomeSend auto-apply — is still
 *   the household's autonomy setting, `prepare` unless set. Consent is only
 *   ever for what the person themselves just asked;
 * - a child's or a helper's request follows the autonomy setting, as before:
 *   a child asking for a sleepover does not put one on the calendar;
 * - paying, changing who can act and deleting always need a person, here as
 *   in `decideAutonomy`;
 * - "Done" is the executor's word, never this module's.
 *
 * A household that wants every change confirmed turns on "Ask before acting
 * on what I say" (Settings → AI Assistant), which makes every act a confirm.
 */

export type ConsentTier = "act" | "confirm" | "step_up";

/** Everyday, undoable changes a person may simply ask for. */
const ACT: ReadonlySet<HouseholdIntent["action"]> = new Set([
  "add_to_list",
  "remove_from_list",
  "set_reminder",
  "set_preference",
  "plan_event",
  "plan_meal",
  "record_absence",
  "complete_school_item",
  "raise_service_request",
  "set_stock",
  "use_stock",
  "mark_bought",
  "record_bill_payment",
  "set_bill_amount",
  "log_vital",
  "log_health_issue",
  "resolve_health_issue",
  "set_fitness_goal",
  // Record first (2026-11-14): written down at once, with Undo.
  "add_bill",
  "record_health_appointment",
  "correct_entry",
]);

/**
 * Who owns a responsibility, and moving something already on the calendar,
 * change a record the household relies on (both are consequential in the
 * evaluation's safety gate): asked once, in the conversation.
 */
const CONFIRM: ReadonlySet<HouseholdIntent["action"]> = new Set(["assign_responsibility", "adjust_schedule"]);

/** Recorded at once unless the household keeps money or health on "Wait for review" (decision 2). */
const MONEY_HEALTH: Partial<Record<HouseholdIntent["action"], "money" | "health">> = { add_bill: "money", record_health_appointment: "health" };

/** Never by a yes alone. */
const STEP_UP: ReadonlySet<HouseholdIntent["action"]> = new Set(["make_payment", "order_items"]);

/**
 * How a person's own request is consented to, or null when consent does not
 * apply (a read, a greeting, a child's or a helper's request): then the
 * household's autonomy setting decides, exactly as before.
 */
export function consentTier(
  intent: HouseholdIntent,
  actor: PermissionContext & { memberId?: string },
  household: { moneyHealthReview?: Partial<Record<"money" | "health", boolean>> } = {},
): ConsentTier | null {
  if (STEP_UP.has(intent.action)) return "step_up";
  if (actor.memberType !== "adult") return null;
  if (CONFIRM.has(intent.action)) return "confirm";
  if (!ACT.has(intent.action)) return null;

  // "Wait for review" on money or health (decision 2 switched back): a bill or appointment is asked first, as before.
  const area = MONEY_HEALTH[intent.action];
  if (area && household.moneyHealthReview?.[area]) return "confirm";
  // A person resolved at medium confidence is named back first ("I think you mean Manan…").
  if (intent.parameters.groundedConfidence === "medium") return "confirm";
  return "act";
}

/**
 * What happens to a person's request, given its consent tier. Built on
 * `decideAutonomy`, so the classes that always need a person still do.
 */
export function decideForRequest(input: {
  tier: ConsentTier | null;
  mode: AutonomyMode;
  action: ProposedAction;
  /** "Ask before acting on what I say" (Settings → AI Assistant). */
  confirmRequested: boolean;
  /** Why this request is asked first, when it is not someone else's plans (`confirmReasonFor`). */
  confirmReason?: string | null;
}): AutonomyDecision {
  const tier = input.tier === "act" && input.confirmRequested ? "confirm" : input.tier;
  switch (tier) {
    case "act": {
      // Asked for in so many words: the request is the consent. What always
      // needs a person still does (`decideAutonomy`'s own floor).
      const decision = decideAutonomy("execute", input.action);
      return decision.outcome === "execute" ? { outcome: "execute", reason: "You asked for it." } : decision;
    }
    case "confirm":
      return { outcome: "needs_approval", reason: input.tier === "act" ? "You asked me to check before acting on what you say." : (input.confirmReason ?? "It changes plans for someone else, so I'm checking first.") };
    case "step_up":
      return decideAutonomy(input.mode, input.action);
    default:
      return decideAutonomy(input.mode, input.action);
  }
}

/** Why a confirm-tier action is asked first, where it is not about someone else's plans. */
export function confirmReasonFor(action: HouseholdIntent["action"]): string | null {
  if (action === "add_bill") return "Your household keeps money entries for review, so I'm checking the details first.";
  if (action === "record_health_appointment") return "Your household keeps health entries for review, so I'm checking first.";
  if (action === "assign_responsibility") return "It changes who looks after something, so I'm checking first.";
  if (action === "adjust_schedule") return "It moves something already on the calendar, so I'm checking first.";
  return null;
}

/** "Undo", "take that back", "scratch that" — the last thing HomeTalk did for this person. */
export function isUndo(utterance: string): boolean {
  return /^(?:please\s+)?(?:undo(?: (?:that|it|the last (?:one|thing)))?|take (?:that|it) back|scratch that|cancel (?:that|it)|revert (?:that|it))[.!]?$/i.test(utterance.trim());
}
