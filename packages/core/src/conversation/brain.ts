import type { SupabaseClient } from "@supabase/supabase-js";

import type { ContentClass, ContextCandidate } from "../ai/privacy";
import { listConsumables, listOrders } from "../commerce/repository";
import { listEvents } from "../family/repository";
import type { FamilyEvent } from "../family/schedule";
import { listObligations } from "../finance/repository";
import type { Obligation } from "../finance/payments";
import type { HomeAssessment } from "../home/assessment";
import { listResponsibilities, type ResponsibilityRow } from "../household/configuration-repository";
import { listMembers, type HouseholdMember } from "../identity/households";
import type { PersonalView } from "../identity/views";
import { listMeals } from "../meals/repository";
import type { Meal } from "../meals/meals";
import { listCommunications, listSchoolItems } from "../school/repository";
import type { SchoolCommunication } from "../school/communications";
import type { SchoolItem } from "../school/items";
import { assessConsumable, type Consumable } from "../commerce/consumables";
import type { Order } from "../commerce/orders";

/**
 * The Household Brain's working memory (product-direction v4 §5): everything
 * WonderHome currently knows about a home, gathered in one place so a
 * question can be answered from all of it rather than from one domain's
 * summary line.
 *
 * Two halves, deliberately apart. `factsFrom` is pure: it turns the domain
 * records into plain-language facts, each labelled with the content class
 * the consent gate (15-005) decides on — a bill is `financial`, a child's
 * homework is `child`, an absence is `location`. `householdContext` is the
 * read: every domain through the member's own client, so RLS is the last
 * word on what this person may know, and each domain isolated so one that
 * cannot be read costs the answer that domain, never the whole reply.
 *
 * The facts carry real names. The gate replaces them with placeholders on
 * the way out, and puts them back on the way in; nothing here needs to know.
 *
 * Gathered once per viewer and kept briefly (`CONTEXT_TTL_MS`), because a
 * conversation is a burst of questions about the same home, and re-reading
 * six domains for "and tomorrow?" would be the wrong place to spend the
 * latency budget. Anything the conversation itself changes forgets it.
 */

export type BrainAgenda = {
  needsYou: readonly HomeAssessment[];
  handled: readonly { key: string; title: string; meta?: string }[];
  checked: number;
  /** Domain labels that could not be read this time. */
  unavailable: readonly string[];
};

export type Memory = {
  scope: "household" | "member";
  memberId: string | null;
  category: string;
  key: string;
  value: unknown;
  status: string;
};

export type Absence = { memberId: string; onDate: string; available: boolean; reason: string | null };

export type BrainSnapshot = {
  householdName: string;
  timezone: string;
  now: Date;
  viewer: { memberId: string; roleLabel: string; tone: PersonalView["tone"] };
  members: readonly HouseholdMember[];
  responsibilities: readonly ResponsibilityRow[];
  events: readonly FamilyEvent[];
  meals: readonly Meal[];
  consumables: readonly Consumable[];
  orders: readonly Order[];
  obligations: readonly Obligation[];
  schoolItems: readonly SchoolItem[];
  communications: readonly SchoolCommunication[];
  memories: readonly Memory[];
  absences: readonly Absence[];
  agenda: BrainAgenda;
};

export type HouseholdContext = {
  facts: ContextCandidate[];
  /** Domains that could not be read, for the honest line at the end of an answer. */
  unavailable: string[];
  gatheredAt: Date;
};

const DAY_MS = 86_400_000;
const HORIZON_DAYS = 7;
/** Enough for a whole conversation's worth of follow-ups, short enough that a change shows up. */
export const CONTEXT_TTL_MS = 45_000;
/** A budget on how much of each list is spelled out; the counts still say how many there were. */
const MAX_PER_LIST = 12;

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

export function factsFrom(snapshot: BrainSnapshot): ContextCandidate[] {
  const facts: ContextCandidate[] = [];
  const name = nameLookup(snapshot.members);
  const isChild = (memberId: string | null | undefined) => snapshot.members.find((member) => member.id === memberId)?.memberType === "child";
  const dateOf = (date: Date) => formatDate(date, snapshot.timezone);
  const timeOf = (date: Date) => formatTime(date, snapshot.timezone);
  const today = isoDateIn(snapshot.now, snapshot.timezone);
  let sequence = 0;
  const add = (contentClass: ContentClass, need: string, text: string, subjects: string[] = []) => {
    facts.push({ id: `fact-${++sequence}`, contentClass, need, text, subjects, relevant: true });
  };

  // --- The household and who is in it -----------------------------------------
  add("general", "who is in the household", `The household is called "${snapshot.householdName}", in the ${snapshot.timezone} time zone. Today is ${dateOf(snapshot.now)}.`);
  const active = snapshot.members.filter((member) => member.status === "active");
  const family = active.filter((member) => member.memberType !== "helper");
  const helpers = active.filter((member) => member.memberType === "helper");
  for (const member of family) {
    const roles = member.roles.map(roleWord).filter(Boolean);
    const kind = member.memberType === "child" ? "a child" : "an adult";
    add(member.memberType === "child" ? "child" : "general", "who is in the household", `${member.displayName} is ${kind}${roles.length > 0 ? ` and ${roles.join(" and ")}` : ""}${member.id === snapshot.viewer.memberId ? " (the person asking)" : ""}.`, [member.id]);
  }
  for (const helper of helpers) add("general", "who helps the household", `${helper.displayName} is a househelper.`, [helper.id]);
  const invited = snapshot.members.filter((member) => member.status === "invited");
  if (invited.length > 0) add("general", "who is in the household", `${invited.map((member) => member.displayName).join(", ")} ${invited.length === 1 ? "has" : "have"} been invited but not joined yet.`);

  // --- Who does what -----------------------------------------------------------
  for (const responsibility of snapshot.responsibilities.slice(0, MAX_PER_LIST * 2)) {
    const owner = name(responsibility.primaryMemberId) ?? "nobody";
    const backup = name(responsibility.backupMemberId);
    add("general", "who is responsible for what", `${humanKey(responsibility.outcomeKey)} is looked after by ${owner}${backup ? ` (backup: ${backup})` : ""}; WonderHome may ${autonomyWord(responsibility.aiMode)} for it.`, [responsibility.primaryMemberId, responsibility.backupMemberId].filter((id): id is string => Boolean(id)));
  }
  if (snapshot.responsibilities.length === 0) add("general", "who is responsible for what", "No responsibilities have been assigned yet.");

  // --- What needs a person, and what was checked -----------------------------
  for (const need of snapshot.agenda.needsYou.slice(0, MAX_PER_LIST)) {
    add(classForSubject(need.subjectKey), "what needs attention", `Needs attention${need.riskLevel === "high" ? " (urgent)" : ""}: ${need.title} — ${need.reason}${need.dueOn ? ` (due ${need.dueOn})` : ""}${need.action ? `; suggested: ${need.action.action}` : ""}.`);
  }
  if (snapshot.agenda.needsYou.length > MAX_PER_LIST) add("general", "what needs attention", `And ${snapshot.agenda.needsYou.length - MAX_PER_LIST} more things need attention.`);
  if (snapshot.agenda.checked > 0) {
    add("general", "what was checked", `WonderHome checked ${snapshot.agenda.checked} things across ${snapshot.agenda.handled.map((entry) => entry.title.toLowerCase()).join(", ") || "the household"} and ${snapshot.agenda.needsYou.length === 0 ? "nothing needs anyone right now" : `${snapshot.agenda.needsYou.length} need someone`}.`);
  }
  for (const label of snapshot.agenda.unavailable) add("general", "what could not be read", `${label} could not be read just now.`);

  // --- Calendar ---------------------------------------------------------------
  const upcoming = snapshot.events.filter((event) => event.status !== "cancelled" && event.endsAt.getTime() >= snapshot.now.getTime() - DAY_MS);
  for (const event of upcoming.slice(0, MAX_PER_LIST)) {
    const who = event.participants.map((participant) => name(participant.memberId)).filter(Boolean);
    add(event.participants.some((participant) => isChild(participant.memberId)) ? "child" : "general", "what is on the calendar", `${event.title} (${event.kind.replace(/_/g, " ")}) is on ${dateOf(event.startsAt)} at ${timeOf(event.startsAt)}${who.length > 0 ? `, with ${who.join(", ")}` : ""}${event.protected ? ", protected family time" : ""}${event.status === "proposed" ? ", not yet confirmed" : ""}${event.actionState && event.actionState !== "ready" ? `; ${event.actionState.replace(/_/g, " ")}` : ""}.`, event.participants.map((participant) => participant.memberId));
  }
  if (upcoming.length === 0) add("general", "what is on the calendar", `Nothing is on the family calendar for the next ${HORIZON_DAYS} days.`);

  // --- Meals -------------------------------------------------------------------
  const meals = snapshot.meals.filter((meal) => meal.onDate >= today);
  for (const meal of meals.slice(0, MAX_PER_LIST)) {
    const missing = meal.ingredients.filter((need) => need.essential && need.status !== "have" && need.status !== "substituted").map((need) => need.name);
    add("general", "what is planned for meals", `${capitalize(meal.slot)} on ${meal.onDate} is ${meal.name}, ready by ${timeOf(meal.readyBy)}, cooked by ${name(meal.cookMemberId) ?? "nobody yet"}; status ${meal.status.replace(/_/g, " ")}${missing.length > 0 ? `; missing ${missing.join(", ")}` : ""}.`, meal.cookMemberId ? [meal.cookMemberId] : []);
  }
  if (meals.length === 0) add("general", "what is planned for meals", "No meals are planned from today onwards.");

  // --- Groceries and orders ----------------------------------------------------
  // Each item with what WonderHome actually knows about it — the same
  // judgement the Groceries screen shows — so "what should I order next" can
  // be answered, or honestly declined, item by item.
  const supplies = snapshot.consumables.slice(0, MAX_PER_LIST * 2);
  for (const item of supplies) {
    const kind = item.category.replace(/_/g, " ");
    if (!item.lastPurchasedOn) {
      // Without a purchase on record there is nothing to count down from,
      // whatever the rate says — so say that, rather than "should last".
      const rate = item.daysPerUnit != null ? `typically ${item.typicalQuantity} ${item.unit} lasts about ${item.daysPerUnit} ${item.daysPerUnit === 1 ? "day" : "days"}` : "WonderHome does not know how fast it goes yet";
      add("general", "what groceries and supplies are tracked", `${item.name} (${kind}): ${rate}. No purchase has been recorded yet, so when it runs out is unknown.`);
      continue;
    }
    const assessment = assessConsumable(item, snapshot.now);
    add("general", "what groceries and supplies are tracked", `${item.name} (${kind}): ${assessment.reason.replace(/\.$/, "")}. Last bought ${item.lastPurchasedOn}${item.lastPurchasedQuantity ? ` (${item.lastPurchasedQuantity} ${item.unit})` : ""}.`);
  }
  if (snapshot.consumables.length > supplies.length) add("general", "what groceries and supplies are tracked", `And ${snapshot.consumables.length - supplies.length} more items are tracked.`);
  if (snapshot.consumables.length === 0) add("general", "what groceries and supplies are tracked", "No groceries or supplies are tracked yet.");
  const openOrders = snapshot.orders.filter((order) => order.status !== "delivered" && order.status !== "cancelled" && order.status !== "failed");
  for (const order of openOrders.slice(0, MAX_PER_LIST)) {
    add("financial", "what orders are open", `An order with ${order.provider} is ${order.status.replace(/_/g, " ")}${order.totalMinor > 0 ? ` for ${money(order.totalMinor, order.currency)}` : ""}${order.expectedAt ? `, expected ${dateOf(order.expectedAt)}` : ""}.`);
  }

  // --- Bills ------------------------------------------------------------------
  const bills = snapshot.obligations.filter((bill) => bill.status !== "paid" && bill.status !== "cancelled");
  for (const bill of bills.slice(0, MAX_PER_LIST)) {
    add("financial", "what bills are due", `${bill.name} (${bill.kind.replace(/_/g, " ")}${bill.payee ? `, ${bill.payee}` : ""}) is ${bill.status.replace(/_/g, " ")}${bill.amountMinor != null && bill.currency ? `, ${money(bill.amountMinor, bill.currency)}` : ""}${bill.dueOn ? `, due ${bill.dueOn}` : ""}${bill.responsibleMemberId ? `, ${name(bill.responsibleMemberId)}'s to handle` : ""}${bill.requiresReview ? "; needs a review" : ""}.`, bill.responsibleMemberId ? [bill.responsibleMemberId] : []);
  }
  if (bills.length === 0 && snapshot.obligations.length > 0) add("financial", "what bills are due", "Every bill on record is paid or cancelled.");
  if (snapshot.obligations.length === 0) add("financial", "what bills are due", "No bills are on record yet.");

  // --- School -------------------------------------------------------------------
  const work = snapshot.schoolItems.filter((item) => item.status !== "done" && item.status !== "submitted" && item.status !== "cancelled");
  for (const item of work.slice(0, MAX_PER_LIST)) {
    add("child", "what school work is open", `${name(item.childMemberId) ?? "A child"} has ${item.kind.replace(/_/g, " ")}: ${item.title}${item.subject ? ` (${item.subject})` : ""}${item.dueAt ? `, due ${dateOf(item.dueAt)}` : ""}, ${item.status.replace(/_/g, " ")}${item.estimatedMinutes ? `, about ${item.estimatedMinutes} minutes` : ""}.`, [item.childMemberId]);
  }
  for (const note of snapshot.communications.filter((entry) => entry.requiresAction).slice(0, MAX_PER_LIST)) {
    add("child", "what the school asked for", `The school asked${note.childMemberId ? ` about ${name(note.childMemberId)}` : ""}: ${note.subject ?? note.summary}${note.actionLabel ? ` — ${note.actionLabel}` : ""}${note.actionDueAt ? `, by ${dateOf(note.actionDueAt)}` : ""}.`, note.childMemberId ? [note.childMemberId] : []);
  }

  // --- Absences -------------------------------------------------------------------
  for (const absence of snapshot.absences.filter((entry) => !entry.available).slice(0, MAX_PER_LIST)) {
    add("location", "who is away", `${name(absence.memberId) ?? "Someone"} is away on ${absence.onDate}${absence.reason ? ` (${absence.reason})` : ""}.`, [absence.memberId]);
  }

  // --- What the household has said ----------------------------------------------
  for (const memory of snapshot.memories.slice(0, MAX_PER_LIST * 2)) {
    const about = memory.scope === "member" ? name(memory.memberId) : null;
    add(memory.scope === "member" && isChild(memory.memberId) ? "child" : "general", "what the household prefers", `${about ? `${about}: ` : ""}${humanKey(memory.key)} — ${describeValue(memory.value)}${memory.status === "confirmed" ? " (confirmed)" : ""}.`, memory.memberId ? [memory.memberId] : []);
  }

  return facts;
}

// ---------------------------------------------------------------------------
// Gathering, with a short memory
// ---------------------------------------------------------------------------

type CacheEntry = { at: number; value: Promise<HouseholdContext> };
const cache = new Map<string, CacheEntry>();

export function forgetHouseholdContext(householdId: string): void {
  for (const key of cache.keys()) if (key.startsWith(`${householdId}:`)) cache.delete(key);
}

export type BrainInput = {
  householdId: string;
  householdName: string;
  timezone: string;
  viewer: PersonalView;
  agenda: BrainAgenda;
  now?: Date;
};

/** Everything this member may know about the home, as facts for the gate — read once, kept briefly. */
export function householdContext(supabase: SupabaseClient, input: BrainInput): Promise<HouseholdContext> {
  const key = `${input.householdId}:${input.viewer.memberId}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CONTEXT_TTL_MS) return hit.value;

  const value = gather(supabase, input).catch((thrown) => {
    cache.delete(key);
    throw thrown;
  });
  cache.set(key, { at: now, value });
  return value;
}

async function gather(supabase: SupabaseClient, input: BrainInput): Promise<HouseholdContext> {
  const now = input.now ?? new Date();
  const horizon = new Date(now.getTime() + HORIZON_DAYS * DAY_MS);
  const today = isoDateIn(now, input.timezone);
  const permitted = (permission: string) => input.viewer.permissions.includes(permission as never);
  const unavailable: string[] = [];

  const read = async <T,>(label: string, reader: () => Promise<T>, empty: T): Promise<T> => {
    try {
      return await reader();
    } catch {
      unavailable.push(label);
      return empty;
    }
  };

  const [members, responsibilities, events, meals, consumables, orders, obligations, schoolItems, communications, memories, absences] = await Promise.all([
    read("who is in the household", () => listMembers(supabase, input.householdId, null), [] as HouseholdMember[]),
    read("responsibilities", () => listResponsibilities(supabase, input.householdId), [] as ResponsibilityRow[]),
    read("the calendar", () => listEvents(supabase, input.householdId, { from: now, to: horizon }), [] as FamilyEvent[]),
    input.viewer.tone === "child" ? Promise.resolve([] as Meal[]) : read("meals", () => listMeals(supabase, input.householdId, { from: today, to: isoDateIn(horizon, input.timezone) }), [] as Meal[]),
    input.viewer.tone === "child" ? Promise.resolve([] as Consumable[]) : read("groceries", () => listConsumables(supabase, input.householdId), [] as Consumable[]),
    input.viewer.tone === "child" ? Promise.resolve([] as Order[]) : read("orders", () => listOrders(supabase, input.householdId), [] as Order[]),
    permitted("finance.view") ? read("bills", () => listObligations(supabase, input.householdId), [] as Obligation[]) : Promise.resolve([] as Obligation[]),
    permitted("school.manage") || permitted("school.view_own")
      ? read("school work", () => listSchoolItems(supabase, input.householdId, permitted("school.manage") ? {} : { childMemberId: input.viewer.memberId }), [] as SchoolItem[])
      : Promise.resolve([] as SchoolItem[]),
    permitted("school.manage") ? read("school messages", () => listCommunications(supabase, input.householdId), [] as SchoolCommunication[]) : Promise.resolve([] as SchoolCommunication[]),
    read("what the household has said", () => listMemories(supabase, input.householdId), [] as Memory[]),
    read("who is away", () => listAbsences(supabase, input.householdId, today, isoDateIn(horizon, input.timezone)), [] as Absence[]),
  ]);

  const facts = factsFrom({
    householdName: input.householdName,
    timezone: input.timezone,
    now,
    viewer: { memberId: input.viewer.memberId, roleLabel: input.viewer.roleLabel, tone: input.viewer.tone },
    members,
    responsibilities,
    events,
    meals,
    consumables,
    orders,
    obligations,
    schoolItems,
    communications,
    memories,
    absences,
    agenda: { ...input.agenda, unavailable: [...input.agenda.unavailable, ...unavailable] },
  });

  return { facts, unavailable: [...input.agenda.unavailable, ...unavailable], gatheredAt: now };
}

async function listMemories(supabase: SupabaseClient, householdId: string): Promise<Memory[]> {
  const { data, error } = await supabase
    .from("memories")
    .select("scope, member_id, category, key, value, status")
    .eq("household_id", householdId)
    .in("status", ["learned", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw new Error(`listMemories failed: ${error.code ?? "unknown"}`);
  return ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
    scope: row.scope as Memory["scope"],
    memberId: (row.member_id as string | null) ?? null,
    category: row.category as string,
    key: row.key as string,
    value: row.value,
    status: row.status as string,
  }));
}

async function listAbsences(supabase: SupabaseClient, householdId: string, from: string, to: string): Promise<Absence[]> {
  const { data, error } = await supabase
    .from("availability_exceptions")
    .select("member_id, on_date, available, reason")
    .eq("household_id", householdId)
    .gte("on_date", from)
    .lte("on_date", to)
    .order("on_date", { ascending: true });
  if (error) throw new Error(`listAbsences failed: ${error.code ?? "unknown"}`);
  return ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
    memberId: row.member_id as string,
    onDate: row.on_date as string,
    available: row.available as boolean,
    reason: (row.reason as string | null) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

function nameLookup(members: readonly HouseholdMember[]): (memberId: string | null | undefined) => string | null {
  const byId = new Map(members.map((member) => [member.id, member.displayName]));
  return (memberId) => (memberId ? (byId.get(memberId) ?? null) : null);
}

function roleWord(role: string): string {
  switch (role) {
    case "head":
      return "the Head of Family";
    case "administrator":
      return "a Household Administrator";
    default:
      return "";
  }
}

function autonomyWord(mode: string): string {
  switch (mode) {
    case "execute":
      return "act on its own";
    case "approve":
      return "act once approved";
    case "prepare":
      return "prepare but not act";
    default:
      return "only observe";
  }
}

/** "school.run" → "School run"; "meals.dinner" → "Meals dinner". */
export function humanKey(key: string): string {
  const words = key.replace(/[._]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function classForSubject(subjectKey: string): ContentClass {
  if (/^(?:bill|obligation|finance|payment|order)/i.test(subjectKey)) return "financial";
  if (/^(?:school|homework|child)/i.test(subjectKey)) return "child";
  return "general";
}

function describeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.statement === "string") return `${record.statement}${typeof record.time === "string" ? ` (${record.time})` : ""}`;
    return Object.entries(record)
      .filter(([, entry]) => entry !== null && entry !== undefined && typeof entry !== "object")
      .map(([entryKey, entry]) => `${entryKey} ${String(entry)}`)
      .join(", ");
  }
  return String(value);
}

function money(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(0)}`;
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function isoDateIn(now: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function formatDate(date: Date, timezone: string): string {
  try {
    // Assembled from parts: "en-GB" spells September "Sept" on some ICU
    // builds and "Sep" on others, and a fact must read the same everywhere.
    const parts = new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: timezone }).formatToParts(date);
    const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
    return `${part("weekday")} ${part("day")} ${part("month")}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function formatTime(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: timezone }).format(date).replace(/\s?(am|pm)/i, (m) => m.trim());
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

/** "Sat 20 Sep, 6:40pm" for the model's briefing, in the household's own zone. */
export function describeLocalNow(now: Date, timezone: string): string {
  return `${formatDate(now, timezone)}, ${formatTime(now, timezone)}`;
}
