import type { ContentClass } from "../ai/privacy";
import { contentClassFor } from "../context/privacy";
import type { ContextDomain, HouseholdContextItem } from "../context/types";
import type { IntentAction } from "../conversation/intent";

/**
 * What a linked voice account may do (voice integration phase 2, least
 * privilege). The member chooses these when they link it; a voice channel
 * can never do more than its scopes allow, and never more than the member
 * could do in the app — the scopes only ever narrow, RLS and permissions
 * still decide.
 */

export const VOICE_SCOPES = [
  "household.read",
  "calendar.read",
  "meals.read",
  "groceries.read",
  "groceries.write",
  "school.read",
  "bills.read",
  "health.read",
  "health.write",
  "home.read",
  "home.write",
  "pets.read",
  "notifications.create",
] as const;
export type VoiceScope = (typeof VOICE_SCOPES)[number];

/** What a new link starts with: the everyday things a speaker in the kitchen asks. */
export const DEFAULT_VOICE_SCOPES: readonly VoiceScope[] = [
  "household.read",
  "calendar.read",
  "meals.read",
  "groceries.read",
  "groceries.write",
  "home.read",
  "pets.read",
  "notifications.create",
];

/** Off unless the member turns them on: a child's school, money, health, and changing the home. */
export const SENSITIVE_VOICE_SCOPES: readonly VoiceScope[] = ["school.read", "bills.read", "health.read", "health.write", "home.write"];

export const SCOPE_LABELS: Record<VoiceScope, string> = {
  "household.read": "Who is in the home, and what needs attention",
  "calendar.read": "Plans, events and who is away",
  "meals.read": "What's for dinner",
  "groceries.read": "The grocery list and what is running low",
  "groceries.write": "Add to and remove from the grocery list",
  "school.read": "Children's homework, exams and school events",
  "bills.read": "Bills and what is due",
  "health.read": "Health appointments and records",
  "health.write": "Record health appointments, symptoms and readings",
  "home.read": "Home upkeep, laundry and services",
  "home.write": "Report a problem with an appliance",
  "pets.read": "Pets and their care",
  "notifications.create": "Set reminders for you",
};

/** Which household facts each read scope opens. */
const READ_DOMAINS: Partial<Record<VoiceScope, readonly ContextDomain[]>> = {
  "household.read": ["household", "people", "responsibilities", "outcomes", "preferences", "attention", "notifications"],
  "calendar.read": ["calendar", "absences"],
  "meals.read": ["meals"],
  "groceries.read": ["groceries", "orders"],
  "school.read": ["school"],
  "bills.read": ["bills"],
  "health.read": ["health"],
  "home.read": ["home", "laundry"],
  "pets.read": ["pets", "pet_care"],
};

/**
 * The scope an action needs over a voice link. Actions missing from this map
 * are not available over a voice link at all — paying, ordering, changing
 * who is responsible for what, running the household's agents — and belong
 * in the app, where approval and step-up authentication live.
 */
const ACTION_SCOPE: Partial<Record<IntentAction, VoiceScope | "none">> = {
  greet: "none",
  unknown: "none",
  ask_status: "none",
  add_to_list: "groceries.write",
  remove_from_list: "groceries.write",
  set_reminder: "notifications.create",
  raise_service_request: "home.write",
  record_health_appointment: "health.write",
  log_health_issue: "health.write",
  resolve_health_issue: "health.write",
  log_vital: "health.write",
};

/** Which of the agenda's domains each read scope opens (the "what needs attention" summary). */
const AGENDA_SCOPE: Record<"home" | "school" | "shopping" | "meals" | "bills" | "family", VoiceScope> = {
  home: "home.read",
  school: "school.read",
  shopping: "groceries.read",
  meals: "meals.read",
  bills: "bills.read",
  family: "calendar.read",
};

export function agendaAllows(key: keyof typeof AGENDA_SCOPE, scopes: readonly VoiceScope[]): boolean {
  return scopes.includes(AGENDA_SCOPE[key]);
}

export function isVoiceScope(value: unknown): value is VoiceScope {
  return typeof value === "string" && (VOICE_SCOPES as readonly string[]).includes(value);
}

/** Only known scopes, each once — whatever a form or a stored row said. */
export function normaliseScopes(values: readonly unknown[]): VoiceScope[] {
  return VOICE_SCOPES.filter((scope) => values.includes(scope));
}

export function domainsFor(scopes: readonly VoiceScope[]): ReadonlySet<ContextDomain> {
  return new Set(scopes.flatMap((scope) => READ_DOMAINS[scope] ?? []));
}

/** Whether a voice link with these scopes may ask for this action. */
export function voiceAllowsAction(action: IntentAction, scopes: readonly VoiceScope[]): boolean {
  const needed = ACTION_SCOPE[action];
  if (needed === undefined) return false;
  return needed === "none" || scopes.includes(needed);
}

/** What a voice link says when an action is outside it. Never "not allowed" without where it is allowed. */
export const VOICE_NOT_ALLOWED = "I can't do that from this voice assistant. You can do it in the WonderHome app.";

/** What an external channel may reach: a voice link's scopes and, for a provider-voiced channel, the content classes it may hear. */
export type ChannelLimits = { scopes: readonly VoiceScope[]; classes?: readonly ContentClass[] };

/**
 * A household's facts narrowed to what a channel may reach: the domains its
 * scopes open (voice phase 2) and, where the channel's own provider hears
 * every answer — Gemini Voice — only the content classes the household
 * agreed may go to a model provider (voice phase 3).
 */
export function narrowToChannel<T extends Pick<HouseholdContextItem, "domain" | "privacyClass">>(items: readonly T[], limits: ChannelLimits): T[] {
  const open = domainsFor(limits.scopes);
  const classes = limits.classes ? new Set(limits.classes) : null;
  return items.filter((item) => open.has(item.domain) && (!classes || classes.has(contentClassFor(item.privacyClass))));
}
