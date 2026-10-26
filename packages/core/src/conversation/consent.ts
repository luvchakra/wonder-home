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
 *   spoken or typed "yes" is the yes: changing someone else's duty or
 *   schedule, a plan that asks other people (guests), marking someone else
 *   away, booking a health appointment, anyone named back at medium
 *   confidence ("I think you mean Manan…").
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
]);

/** Changes that touch someone else's commitments: asked once, in the conversation. */
const CONFIRM: ReadonlySet<HouseholdIntent["action"]> = new Set(["adjust_schedule", "assign_responsibility", "record_health_appointment", "add_bill"]);

/** Never by a yes alone. */
const STEP_UP: ReadonlySet<HouseholdIntent["action"]> = new Set(["make_payment", "order_items"]);

/**
 * How a person's own request is consented to, or null when consent does not
 * apply (a read, a greeting, a child's or a helper's request): then the
 * household's autonomy setting decides, exactly as before.
 */
export function consentTier(intent: HouseholdIntent, actor: PermissionContext & { memberId?: string }): ConsentTier | null {
  if (STEP_UP.has(intent.action)) return "step_up";
  if (actor.memberType !== "adult") return null;
  if (CONFIRM.has(intent.action)) return "confirm";
  if (!ACT.has(intent.action)) return null;

  // A plan that asks other people is theirs to hear about: one question first.
  if (intent.action === "plan_event" && Array.isArray(intent.parameters.guests) && intent.parameters.guests.length > 0) return "confirm";
  // Marking someone else away changes what others plan around them.
  if (intent.action === "record_absence" && intent.target.kind === "member" && intent.target.reference && actor.memberId && intent.target.reference !== actor.memberId) {
    return "confirm";
  }
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
  return action === "add_bill" ? "A new bill goes on the household's money records, so I'm checking the details first." : null;
}

/** "Undo", "take that back", "scratch that" — the last thing HomeTalk did for this person. */
export function isUndo(utterance: string): boolean {
  return /^(?:please\s+)?(?:undo(?: (?:that|it|the last (?:one|thing)))?|take (?:that|it) back|scratch that|cancel (?:that|it)|revert (?:that|it))[.!]?$/i.test(utterance.trim());
}
