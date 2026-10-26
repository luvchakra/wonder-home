import { inAppVoiceAllows } from "./capabilities";
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
  // Names a screen and nothing from it; a speaker with no screen says so (screens.ts).
  open_screen: "none",
  add_to_list: "groceries.write",
  remove_from_list: "groceries.write",
  set_reminder: "notifications.create",
  // Something a person tells WonderHome about the family is kept as learned,
  // never certified, and is theirs to correct in the app: no scope beyond
  // being the linked member, like a question.
  set_preference: "none",
  // Answering HomeTalk's question about something the member sent to HomeSend:
  // it fills in their own item, which still waits there, and is only ever an
  // answer to a question this channel's own conversation asked.
  complete_homesend_item: "none",
  // "Yes" to the offer to fill in the member's own waiting items: questions only.
  fill_homesend_details: "none",
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
export type ChannelLimits = {
  scopes: readonly VoiceScope[];
  classes?: readonly ContentClass[];
  /**
   * The channel runs inside WonderHome's own HomeTalk screen (Gemini Live in
   * the app), not on a speaker somewhere else: what it answers is also shown
   * on screen, and its refusals never send the person to "the app" they are
   * already in.
   */
  inApp?: boolean;
  /** The channel is WhatsApp: its refusals say WhatsApp, not "this voice assistant". */
  whatsapp?: boolean;
};

/**
 * What WhatsApp may reach: the everyday things a linked adult asks, the same
 * as a new Alexa link. Its answers pass through Meta, so a child's school,
 * health, money and changing the home stay in the app ("kept_off" in the
 * capability matrix); there is no way to widen this from WhatsApp.
 */
export const WHATSAPP_SCOPES: readonly VoiceScope[] = DEFAULT_VOICE_SCOPES;

export const WHATSAPP_NOT_ALLOWED = "I can't do that on WhatsApp. You can do it in the WonderHome app: https://home.wonderapps.biz";

/**
 * What a voice channel inside the app may also answer, once the household
 * lets that content class reach the voice's provider: a place question shows
 * its places as cards on the same screen (the owner, 2026-10-18).
 */
const IN_APP_BY_CLASS: Partial<Record<IntentAction, ContentClass>> = {
  find_places: "location",
};

/** Whether this channel may ask for this action: its scopes, and in the app, what the household's agreement opens. */
export function channelAllowsAction(action: IntentAction, limits: ChannelLimits): boolean {
  if (voiceAllowsAction(action, limits.scopes)) return true;
  // Inside HomeTalk's own screen, voice is typing by mouth: what the matrix
  // places "in_app" goes through the same gates a typed request does.
  if (limits.inApp && inAppVoiceAllows(action)) return true;
  const needs = limits.inApp ? IN_APP_BY_CLASS[action] : undefined;
  return needs !== undefined && (limits.classes ?? []).includes(needs);
}

/**
 * Said when voice in the app cannot do something: it is HomeTalk, inside
 * WonderHome, so the way on is right here — typed, it waits for an OK on
 * screen. Never "use the WonderHome app".
 */
export const IN_APP_VOICE_NOT_ALLOWED =
  "Paying and placing orders always need your own tap on screen, so I can't do that by voice here in HomeTalk. You'll find it under Bills or Groceries, ready for you.";

export function channelRefusal(limits: ChannelLimits): string {
  if (limits.whatsapp) return WHATSAPP_NOT_ALLOWED;
  return limits.inApp ? IN_APP_VOICE_NOT_ALLOWED : VOICE_NOT_ALLOWED;
}

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
