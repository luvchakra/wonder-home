import type { ContentClass } from "../ai/privacy";
import type { IntentAction } from "../conversation/intent";
import type { VoiceScope } from "./scopes";

/**
 * What each HomeTalk channel may do (voice integration phase 5,
 * `design/voice-integration/05-unified-voice-ux-and-capabilities.md`).
 *
 * One household, one context, one engine: a channel is only ever a door.
 * This matrix is the product policy written down, and it is not a gate of
 * its own — the gates are `voiceAllowsAction` and the link's scopes, the
 * consent gate, and HomeTalk's permission, entitlement and autonomy checks.
 * `capabilities.test.ts` holds every cell to those gates, so the matrix can
 * never promise something a channel is not actually allowed, and every
 * HomeTalk action has to be placed in it on purpose.
 */

export const CAPABILITY_CHANNELS = ["app", "gemini_voice", "alexa"] as const;
export type CapabilityChannel = (typeof CAPABILITY_CHANNELS)[number];

export type ChannelPolicy =
  /** Available. */
  | "yes"
  /** Gemini Voice: only where the household's data-use agreement lets this class reach a model provider — Gemini hears every answer. */
  | "consent"
  /** A linked assistant: only when the member turned this on when they linked it. */
  | "opt_in"
  /** Always waits for a person's yes in the app, with step-up where the action asks for it. */
  | "approval"
  /** Never by voice. The answer says so and points to the app, where approval and step-up live. */
  | "app_only"
  /** An exchange as long as the channel's own session allows. */
  | "session";

export type CapabilityCategory = "informational" | "low_risk" | "sensitive" | "conversation";

export type Capability = {
  id: string;
  label: string;
  category: CapabilityCategory;
  /** The HomeTalk actions this capability is. Every action belongs to exactly one capability. */
  actions: readonly IntentAction[];
  /** The voice scope that opens reading it, or making it. */
  scope?: VoiceScope;
  /** The content class a Gemini answer about it carries, where that is gated by consent. */
  contentClass?: ContentClass;
  /** Gemini Live tools that reach it. */
  geminiTools: readonly string[];
  policy: Record<CapabilityChannel, ChannelPolicy>;
  /** Said to the household when a voice channel cannot do it. */
  note?: string;
};

const everywhere = { app: "yes", gemini_voice: "yes", alexa: "yes" } as const;

export const VOICE_CAPABILITIES: readonly Capability[] = [
  {
    id: "household_questions",
    label: "Questions about the household",
    category: "informational",
    actions: ["ask_status", "greet", "unknown"],
    scope: "household.read",
    geminiTools: ["ask_household", "get_household_status", "get_recent_household_activity"],
    policy: everywhere,
  },
  {
    id: "todays_agenda",
    label: "Today's agenda",
    category: "informational",
    actions: [],
    scope: "household.read",
    geminiTools: ["get_today_agenda"],
    policy: everywhere,
  },
  {
    id: "calendar_read",
    label: "Plans and events",
    category: "informational",
    actions: [],
    scope: "calendar.read",
    geminiTools: ["get_upcoming_events"],
    policy: everywhere,
  },
  {
    id: "meals",
    label: "What's for dinner",
    category: "informational",
    actions: [],
    scope: "meals.read",
    geminiTools: ["get_meal_plan"],
    policy: everywhere,
  },
  {
    id: "groceries_read",
    label: "The grocery list",
    category: "informational",
    actions: [],
    scope: "groceries.read",
    geminiTools: ["get_grocery_status"],
    policy: everywhere,
  },
  {
    id: "groceries_write",
    label: "Add to and remove from the grocery list",
    category: "low_risk",
    actions: ["add_to_list", "remove_from_list"],
    scope: "groceries.write",
    geminiTools: ["add_grocery_item"],
    policy: everywhere,
  },
  {
    id: "reminders",
    label: "Reminders for you",
    category: "low_risk",
    actions: ["set_reminder"],
    scope: "notifications.create",
    geminiTools: ["create_reminder"],
    policy: everywhere,
  },
  {
    id: "school",
    label: "Children's homework, exams and school events",
    category: "sensitive",
    actions: [],
    scope: "school.read",
    contentClass: "child",
    geminiTools: ["get_school_items"],
    policy: { app: "yes", gemini_voice: "consent", alexa: "opt_in" },
  },
  {
    id: "health",
    label: "Health appointments, symptoms and readings",
    category: "sensitive",
    actions: ["record_health_appointment", "log_health_issue", "resolve_health_issue", "log_vital"],
    scope: "health.write",
    contentClass: "health",
    geminiTools: [],
    policy: { app: "yes", gemini_voice: "consent", alexa: "opt_in" },
  },
  {
    id: "financial_status",
    label: "Bills and what is due",
    category: "sensitive",
    actions: [],
    scope: "bills.read",
    contentClass: "financial",
    geminiTools: ["get_bill_status"],
    policy: { app: "yes", gemini_voice: "consent", alexa: "opt_in" },
  },
  {
    id: "home_problems",
    label: "Report a problem with an appliance",
    category: "low_risk",
    actions: ["raise_service_request"],
    scope: "home.write",
    geminiTools: [],
    policy: { app: "yes", gemini_voice: "yes", alexa: "opt_in" },
  },
  {
    id: "payments",
    label: "Paying a bill",
    category: "sensitive",
    actions: ["make_payment"],
    geminiTools: [],
    // Stricter than the spec's "step-up + approval" by voice: a spoken yes
    // is not step-up authentication, and a speaker in a shared kitchen is
    // not the member alone. Paying stays in the app.
    policy: { app: "approval", gemini_voice: "app_only", alexa: "app_only" },
    note: "Paying happens in the WonderHome app, where it asks for your approval.",
  },
  {
    id: "orders",
    label: "Placing an order",
    category: "sensitive",
    actions: ["order_items"],
    geminiTools: [],
    policy: { app: "approval", gemini_voice: "app_only", alexa: "app_only" },
    note: "Orders are placed in the WonderHome app, where you approve them.",
  },
  {
    id: "planning_changes",
    label: "Changing plans, meals, schedules and school items",
    category: "sensitive",
    actions: ["record_absence", "plan_event", "plan_meal", "adjust_schedule", "complete_school_item", "set_fitness_goal"],
    geminiTools: [],
    policy: { app: "yes", gemini_voice: "app_only", alexa: "app_only" },
    note: "Changing the plan happens in the WonderHome app, where you can see what else it moves.",
  },
  {
    id: "household_admin",
    label: "Responsibilities, preferences and the household's agents",
    category: "sensitive",
    actions: ["assign_responsibility", "set_preference", "check_agents"],
    geminiTools: [],
    policy: { app: "yes", gemini_voice: "app_only", alexa: "app_only" },
    note: "Changing who does what, and running WonderHome's checks, happen in the app.",
  },
  {
    id: "conversation",
    label: "A back-and-forth conversation",
    category: "conversation",
    actions: [],
    geminiTools: ["answer_pending_question"],
    policy: { app: "yes", gemini_voice: "yes", alexa: "session" },
  },
];

/** The capability an action belongs to. Every HomeTalk action has one. */
export function capabilityForAction(action: IntentAction): Capability | undefined {
  return VOICE_CAPABILITIES.find((capability) => capability.actions.includes(action));
}

/** What a channel may do, as the household would read it: available, conditional, or in the app. */
export function channelSummary(channel: CapabilityChannel): { available: Capability[]; conditional: Capability[]; appOnly: Capability[] } {
  const available: Capability[] = [];
  const conditional: Capability[] = [];
  const appOnly: Capability[] = [];
  for (const capability of VOICE_CAPABILITIES) {
    const policy = capability.policy[channel];
    if (policy === "yes" || policy === "session") available.push(capability);
    else if (policy === "consent" || policy === "opt_in" || policy === "approval") conditional.push(capability);
    else appOnly.push(capability);
  }
  return { available, conditional, appOnly };
}
