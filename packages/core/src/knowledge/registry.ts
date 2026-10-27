import type { ContextRecords } from "../context/builders";
import type { ContextDomain, HealthScope, PrivacyClass } from "../context/types";

/**
 * The household record index's registry (Phase 1, `design/HOUSEHOLD-RECORD-INDEX.md`).
 *
 * Every table that holds a household's records is named here exactly once, as
 * one of three things:
 *  - `builder`: a hand-written builder in `context/builders.ts` already turns
 *    its rows into HomeBrain facts; `records` names the `ContextRecords` list
 *    it arrives in, so the claim is checked by the compiler.
 *  - `registry`: no builder of its own; the generic describer
 *    (`knowledge/describe.ts`) reads it through the viewer's own session and
 *    says every field below as a fact.
 *  - `excluded`: not knowledge about the household, with the reason.
 *
 * `scripts/lint-knowledge-registry.mjs` fails CI when a migration creates a
 * table with a `household_id` that is not named here, or when a table read as
 * knowledge has no `wh.mark_context_stale` trigger. HomeTalk once did not know
 * a child's classes the Calendar showed (2026-10-23) because nothing made a
 * new table visible to it; this registry is what does.
 */

export type Row = Record<string, unknown>;

/** What a describer may call: names and formats from the household's own records. */
export type DescribeWords = {
  /** A member's display name, or null when the id is not a member of this household. */
  name: (memberId: unknown) => string | null;
  /** "Sat 24 Oct 2026" for an ISO date or timestamp, in the household's zone. */
  date: (value: unknown) => string | null;
  /** "6:00pm" for a "HH:MM[:SS]" local time. */
  clock: (value: unknown) => string | null;
  /** "Sat 24 Oct 2026, 6:00pm" for a timestamp, in the household's zone. */
  moment: (value: unknown) => string | null;
  /** "₹1,200" for a minor-unit amount, or null without one. */
  money: (minor: unknown, currency: unknown) => string | null;
  /** The local ISO day of a timestamp or date. */
  day: (value: unknown) => string | null;
};

export type Description = {
  /** What the record is called, as the household would name it. */
  title: string;
  /** The whole fact, every field a person might ask about, in plain words. */
  summary: string;
  /** The local day it is about, when it has one: "what's on that day" finds it. */
  date?: string | null;
  /** Other words for the same thing. */
  aliases?: (string | null | undefined)[];
  attributes?: Record<string, unknown>;
  /** Past things are history; present and future ones are current. */
  current?: boolean;
};

export type RegistrySpec = {
  covered: "registry";
  domain: ContextDomain;
  /** One row, in a few words: "class goal", "budget". Also the entity type. */
  noun: string;
  /** Why an answer would want it, shown when the household asks what was sent. */
  need: string;
  /** Columns, and embeds of the rows it points at. */
  select: string;
  /** Only rows still in use. */
  activeOnly?: boolean;
  /** Only rows whose column is on or after this many days ago (bounded history). */
  since?: { column: string; days: number };
  order: { column: string; ascending: boolean };
  /** Every read is bounded. */
  limit: number;
  privacy: PrivacyClass;
  /** A health row's own per-person visibility column. */
  healthScope?: (row: Row) => HealthScope | undefined;
  /** A permission the viewer must hold for the table to be read at all. */
  permission?: string;
  /** The people the row is about. */
  subjects: (row: Row) => unknown[];
  describe: (row: Row, words: DescribeWords) => Description | null;
  /** A realistic row, for the generated tests: every registered table is tested without anyone writing a case. */
  example: Row;
};

/** `live`: read for the person asking on every turn, never from the stored context, so no stale trigger is needed. */
export type BuilderSpec = { covered: "builder"; records: keyof ContextRecords; live?: true };
export type ExcludedSpec = { covered: "excluded"; reason: string };
export type TableSpec = RegistrySpec | BuilderSpec | ExcludedSpec;

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() && Number.isFinite(Number(value)) ? Number(value) : null);
const embed = (value: unknown): Row | null => (Array.isArray(value) ? ((value[0] as Row | undefined) ?? null) : value && typeof value === "object" ? (value as Row) : null);
const humanise = (value: unknown): string | null => text(value)?.replace(/_/g, " ") ?? null;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** `day_of_week` 0–6 from Sunday, or ISO 1–7 from Monday; both end on Sunday at 0 or 7. */
const weekday = (value: unknown, iso: boolean): string | null => {
  const n = num(value);
  if (n === null) return null;
  return iso ? (WEEKDAYS[n % 7] ?? null) : (WEEKDAYS[n] ?? null);
};
const healthScope = (row: Row): HealthScope | undefined => {
  const scope = row.privacy_scope;
  return scope === "private" || scope === "selected_family" || scope === "household_operational" ? scope : "private";
};
const join = (...parts: (string | null | undefined | false)[]): string => parts.filter(Boolean).join(" ").replace(/\s+([.,;])/g, "$1").replace(/\s{2,}/g, " ");

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const CHILD = "33333333-3333-4333-8333-333333333333";
const ADULT = "44444444-4444-4444-8444-444444444444";

export const REGISTRY_EXAMPLE_MEMBERS = { child: CHILD, adult: ADULT } as const;

/**
 * Every household table, alphabetically. A new migration's table goes here in
 * the same pull request, or CI fails.
 */
export const KNOWLEDGE_REGISTRY = {
  agent_runs: { covered: "builder", records: "agentRuns" },
  agent_tool_calls: { covered: "excluded", reason: "Each step of an agent run, kept for audit; the run itself is known." },
  ai_corrections: { covered: "excluded", reason: "Evaluation evidence about the AI, not about the household; append-only." },
  amaf_answers: { covered: "excluded", reason: "Each answer is written into its own domain record, which is what HomeBrain reads." },
  approvals: { covered: "excluded", reason: "A request waiting for an adult's tap; it reaches the approver as a notification." },
  asset_service_events: {
    covered: "registry",
    domain: "home",
    noun: "appliance service",
    need: "when something at home was last serviced",
    select: "id, asset_id, kind, occurred_on, provider_name, cost_minor, currency, notes, home_assets(name)",
    since: { column: "occurred_on", days: 730 },
    order: { column: "occurred_on", ascending: false },
    limit: 200,
    privacy: "general",
    subjects: () => [],
    describe: (row, w) => {
      const asset = text(embed(row.home_assets)?.name) ?? "an appliance";
      const cost = w.money(row.cost_minor, row.currency);
      return {
        title: `${asset} ${humanise(row.kind) ?? "service"}`,
        summary: join(`${asset} had a ${humanise(row.kind) ?? "service"}`, w.date(row.occurred_on) ? `on ${w.date(row.occurred_on)}` : null, text(row.provider_name) ? `by ${text(row.provider_name)}` : null, cost ? `costing ${cost}` : null) + `.${text(row.notes) ? ` ${text(row.notes)}` : ""}`,
        date: w.day(row.occurred_on),
        aliases: [asset, text(row.provider_name)],
        current: false,
      };
    },
    example: { id: UUID_A, asset_id: UUID_B, kind: "repair", occurred_on: "2026-09-10", provider_name: "CoolAir Services", cost_minor: 120000, currency: "INR", notes: "Gas refilled", home_assets: { name: "Bedroom AC" } },
  },
  audit_events: { covered: "excluded", reason: "Security audit trail; who did what to which record, never the record itself." },
  availability_exceptions: { covered: "builder", records: "absences" },
  backup_services: {
    covered: "registry",
    domain: "home",
    noun: "backup service",
    need: "who to call when the usual help is away",
    select: "id, name, contact, covers, notes, active",
    activeOnly: true,
    order: { column: "name", ascending: true },
    limit: 100,
    privacy: "general",
    subjects: () => [],
    describe: (row) => ({
      title: text(row.name) ?? "a backup service",
      summary: `${text(row.name) ?? "A backup service"} is the household's backup${humanise(row.covers) ? ` for ${humanise(row.covers)}` : ""}${text(row.contact) ? ` (contact: ${text(row.contact)})` : ""}.${text(row.notes) ? ` ${text(row.notes)}` : ""}`,
      aliases: [text(row.name), humanise(row.covers)],
    }),
    example: { id: UUID_A, name: "QuickClean Agency", contact: "98765 43210", covers: "cleaning", notes: "Call a day ahead", active: true },
  },
  billing_events: { covered: "excluded", reason: "Payment provider events for WonderHome's own subscription, not the household's affairs." },
  billing_intents: { covered: "excluded", reason: "WonderHome subscription checkout state." },
  billing_invoices: { covered: "excluded", reason: "WonderHome's own invoices to the household, shown under Your plan." },
  billing_reconciliation_findings: { covered: "excluded", reason: "Staff reconciliation of the subscription ledger." },
  budgets: {
    covered: "registry",
    domain: "bills",
    noun: "budget",
    need: "what the household set out to spend",
    select: "id, category, period, limit_minor, currency, active",
    activeOnly: true,
    order: { column: "category", ascending: true },
    limit: 100,
    privacy: "financial",
    permission: "finance.view",
    subjects: () => [],
    describe: (row, w) => {
      const amount = w.money(row.limit_minor, row.currency);
      const category = humanise(row.category) ?? "spending";
      return {
        title: `${category} budget`,
        summary: `The ${humanise(row.period) ?? "monthly"} budget for ${category} is ${amount ?? "not set"}.`,
        aliases: [category, `${category} budget`],
        attributes: { category: text(row.category), period: text(row.period), amountMinor: num(row.limit_minor), currency: text(row.currency) },
      };
    },
    example: { id: UUID_A, category: "groceries", period: "monthly", limit_minor: 1500000, currency: "INR", active: true },
  },
  calendar_preferences: { covered: "excluded", reason: "How one person's Calendar screen looks (view, filters, holiday list)." },
  cart_suggestions: { covered: "excluded", reason: "Derived suggestions recomputed from the shopping list and stock, which are known." },
  certification_items: { covered: "builder", records: "beliefs" },
  certification_reviews: { covered: "excluded", reason: "The review history of what WonderHome believes; the beliefs themselves are known." },
  chat_message_reactions: { covered: "excluded", reason: "FamilyChat is private conversation between members; HomeTalk is not told what they say to each other." },
  chat_messages: { covered: "excluded", reason: "FamilyChat is private conversation between members; HomeTalk is not told what they say to each other." },
  chat_participants: { covered: "excluded", reason: "FamilyChat is private conversation between members." },
  chat_threads: { covered: "excluded", reason: "FamilyChat is private conversation between members." },
  child_activities: { covered: "builder", records: "activities" },
  child_activity_notes: { covered: "builder", records: "activities" },
  child_companions: { covered: "excluded", reason: "The child's companion cat's name and colour: screen decoration." },
  child_goal_checkins: {
    covered: "registry",
    domain: "school",
    noun: "goal check-in",
    need: "how a child is doing on their goals",
    select: "id, goal_id, child_member_id, on_day, verified_at, child_goals(title)",
    since: { column: "on_day", days: 60 },
    order: { column: "on_day", ascending: false },
    limit: 300,
    privacy: "child",
    subjects: (row) => [row.child_member_id],
    describe: (row, w) => {
      const goal = text(embed(row.child_goals)?.title) ?? "a goal";
      return {
        title: `${goal} check-in`,
        summary: `${w.name(row.child_member_id) ?? "A child"} checked in "${goal}" on ${w.date(row.on_day) ?? "a day"}${row.verified_at ? ", verified by an adult" : ", waiting for an adult to verify"}.`,
        date: w.day(row.on_day),
        aliases: [goal],
        current: false,
      };
    },
    example: { id: UUID_A, goal_id: UUID_B, child_member_id: CHILD, on_day: "2026-10-22", verified_at: null, child_goals: { title: "Practise piano 20 minutes" } },
  },
  child_goals: {
    covered: "registry",
    domain: "school",
    noun: "child goal",
    need: "what a child is working towards",
    select: "id, child_member_id, title, kind, period, target, stars, reward, ends_on, active",
    activeOnly: true,
    order: { column: "created_at", ascending: false },
    limit: 200,
    privacy: "child",
    subjects: (row) => [row.child_member_id],
    describe: (row, w) => ({
      title: text(row.title) ?? "a goal",
      summary: join(
        `${w.name(row.child_member_id) ?? "A child"} has the goal "${text(row.title) ?? "a goal"}"`,
        num(row.target) ? `(${num(row.target)} times ${humanise(row.period) ?? ""})`.replace(/ \)/, ")") : null,
        num(row.stars) ? `worth ${num(row.stars)} stars` : null,
        text(row.reward) ? `with the reward "${text(row.reward)}"` : null,
        w.date(row.ends_on) ? `until ${w.date(row.ends_on)}` : null,
      ) + ".",
      aliases: [text(row.title), humanise(row.kind)],
    }),
    example: { id: UUID_A, child_member_id: CHILD, title: "Practise piano 20 minutes", kind: "practice", period: "week", target: 5, stars: 3, reward: "Ice cream on Sunday", ends_on: "2026-11-30", active: true },
  },
  companion_sayings_heard: { covered: "excluded", reason: "Which of the cat's sayings a child has already heard, so none repeats." },
  consumable_purchases: {
    covered: "registry",
    domain: "groceries",
    noun: "purchase",
    need: "when something was last bought and for how much",
    select: "id, consumable_id, purchased_on, quantity, unit, unit_cost_minor, currency, merchant, best_before, consumables(name)",
    since: { column: "purchased_on", days: 180 },
    order: { column: "purchased_on", ascending: false },
    limit: 300,
    privacy: "general",
    subjects: () => [],
    describe: (row, w) => {
      const item = text(embed(row.consumables)?.name) ?? "something";
      const cost = w.money(row.unit_cost_minor, row.currency);
      return {
        title: `${item} purchase`,
        summary: join(`${item}`, num(row.quantity) ? `(${num(row.quantity)}${text(row.unit) ? ` ${text(row.unit)}` : ""})` : null, `was bought on ${w.date(row.purchased_on) ?? "a day"}`, text(row.merchant) ? `from ${text(row.merchant)}` : null, cost ? `at ${cost} each` : null, w.date(row.best_before) ? `, best before ${w.date(row.best_before)}` : null).replace(" ,", ",") + ".",
        date: w.day(row.purchased_on),
        aliases: [item, text(row.merchant)],
        current: false,
      };
    },
    example: { id: UUID_A, consumable_id: UUID_B, purchased_on: "2026-10-20", quantity: 2, unit: "l", unit_cost_minor: 6800, currency: "INR", merchant: "Blinkit", best_before: "2026-10-25", consumables: { name: "Toned milk" } },
  },
  consumable_unit_changes: { covered: "excluded", reason: "A history of unit conversions on stock; the current stock is known." },
  consumables: { covered: "builder", records: "consumables" },
  conversation_actions: { covered: "builder", records: "proposals", live: true },
  conversation_messages: { covered: "excluded", reason: "HomeTalk's own conversation, read by the conversation engine for the current thread." },
  conversation_sessions: { covered: "excluded", reason: "Which surface a HomeTalk conversation belongs to." },
  developer_api_keys: { covered: "excluded", reason: "Credentials (hashed partner keys)." },
  event_exceptions: {
    covered: "registry",
    domain: "calendar",
    noun: "changed occurrence",
    need: "a single day of a repeating event that moved or was cancelled",
    select: "id, event_id, occurrence_date, cancelled, title, starts_at, ends_at, location, family_events(title)",
    since: { column: "occurrence_date", days: 30 },
    order: { column: "occurrence_date", ascending: true },
    limit: 300,
    privacy: "general",
    subjects: () => [],
    describe: (row, w) => {
      const event = text(row.title) ?? text(embed(row.family_events)?.title) ?? "a repeating event";
      const when = w.date(row.occurrence_date) ?? "one day";
      return {
        title: event,
        summary: row.cancelled
          ? `${event} on ${when} is cancelled; the other days are unchanged.`
          : join(`${event} on ${when} is changed`, w.moment(row.starts_at) ? `to ${w.moment(row.starts_at)}` : null, text(row.location) ? `at ${text(row.location)}` : null) + "; the other days are unchanged.",
        date: text(row.occurrence_date),
        aliases: [event, text(embed(row.family_events)?.title)],
        attributes: { eventId: text(row.event_id), cancelled: row.cancelled === true },
      };
    },
    example: { id: UUID_A, event_id: UUID_B, occurrence_date: "2026-10-31", cancelled: true, title: null, starts_at: null, ends_at: null, location: null, family_events: { title: "Sunday swimming" } },
  },
  event_guests: { covered: "builder", records: "eventGuests" },
  event_invite_links: { covered: "excluded", reason: "Credentials (an invite link's secret token)." },
  event_participants: { covered: "builder", records: "events" },
  external_voice_identities: { covered: "excluded", reason: "Which Alexa or Google account is linked to which member: credentials." },
  family_event_changes: { covered: "excluded", reason: "A change log that feeds 'moved by someone else' notices; the events are known." },
  family_events: { covered: "builder", records: "events" },
  food_preferences: { covered: "builder", records: "foodPreferences" },
  gift_plans: {
    covered: "registry",
    domain: "calendar",
    noun: "gift plan",
    need: "gifts being planned for an occasion",
    select: "id, event_id, recipient, occasion, needed_by, budget_minor, currency, idea, status, responsible_member_id",
    order: { column: "needed_by", ascending: true },
    limit: 100,
    privacy: "general",
    subjects: (row) => [row.responsible_member_id],
    describe: (row, w) => {
      const budget = w.money(row.budget_minor, row.currency);
      return {
        title: `gift for ${text(row.recipient) ?? "someone"}`,
        summary: join(`A gift for ${text(row.recipient) ?? "someone"}`, text(row.occasion) ? `(${text(row.occasion)})` : null, w.date(row.needed_by) ? `is needed by ${w.date(row.needed_by)}` : "is being planned", text(row.idea) ? `; the idea is ${text(row.idea)}` : null, budget ? `, budget ${budget}` : null, w.name(row.responsible_member_id) ? `; ${w.name(row.responsible_member_id)} is getting it` : null, `(${humanise(row.status) ?? "planned"})`) + ".",
        date: w.day(row.needed_by),
        aliases: [text(row.recipient), text(row.occasion), text(row.idea)],
      };
    },
    example: { id: UUID_A, event_id: UUID_B, recipient: "Grandma", occasion: "80th birthday", needed_by: "2026-11-14", budget_minor: 300000, currency: "INR", idea: "A photo album", status: "idea", responsible_member_id: ADULT },
  },
  health_appointments: { covered: "builder", records: "healthAppointments" },
  health_checkups: { covered: "builder", records: "healthCheckups" },
  health_consents: { covered: "excluded", reason: "Whether a member agreed to health features: a setting." },
  health_fitness_goals: { covered: "builder", records: "fitnessGoals" },
  health_fitness_sessions: {
    covered: "registry",
    domain: "health",
    noun: "workout",
    need: "exercise someone did",
    select: "id, member_id, activity_type, custom_label, duration_minutes, distance_value, distance_unit, started_at, privacy_scope, status, notes",
    since: { column: "started_at", days: 60 },
    order: { column: "started_at", ascending: false },
    limit: 200,
    privacy: "health",
    healthScope,
    subjects: (row) => [row.member_id],
    describe: (row, w) => {
      const what = text(row.custom_label) ?? humanise(row.activity_type) ?? "exercise";
      return {
        title: what,
        summary: join(`${w.name(row.member_id) ?? "Someone"} did ${what}`, w.moment(row.started_at) ? `on ${w.moment(row.started_at)}` : null, num(row.duration_minutes) ? `for ${num(row.duration_minutes)} minutes` : null, num(row.distance_value) ? `covering ${num(row.distance_value)} ${text(row.distance_unit) ?? ""}`.trim() : null) + ".",
        date: w.day(row.started_at),
        aliases: [what],
        current: false,
      };
    },
    example: { id: UUID_A, member_id: ADULT, activity_type: "walk", custom_label: null, duration_minutes: 40, distance_value: 3.5, distance_unit: "km", started_at: "2026-10-22T01:30:00Z", privacy_scope: "selected_family", status: "completed", notes: null },
  },
  health_issues: { covered: "builder", records: "healthIssues" },
  health_measurement_routines: {
    covered: "registry",
    domain: "health",
    noun: "measurement routine",
    need: "what someone measures regularly and when it is next due",
    select: "id, member_id, vital_type, custom_label, cadence_days, preferred_time, reminder_enabled, privacy_scope, status, next_due_on, last_completed_on, notes",
    order: { column: "next_due_on", ascending: true },
    limit: 100,
    privacy: "health",
    healthScope,
    subjects: (row) => [row.member_id],
    describe: (row, w) => {
      const what = text(row.custom_label) ?? humanise(row.vital_type) ?? "a measurement";
      return {
        title: what,
        summary: join(`${w.name(row.member_id) ?? "Someone"} measures ${what}`, num(row.cadence_days) ? `every ${num(row.cadence_days)} days` : null, w.clock(row.preferred_time) ? `around ${w.clock(row.preferred_time)}` : null, w.date(row.next_due_on) ? `; next due ${w.date(row.next_due_on)}` : null, w.date(row.last_completed_on) ? `, last done ${w.date(row.last_completed_on)}` : null) + ".",
        date: w.day(row.next_due_on),
        aliases: [what],
      };
    },
    example: { id: UUID_A, member_id: ADULT, vital_type: "blood_pressure", custom_label: null, cadence_days: 7, preferred_time: "08:00:00", reminder_enabled: true, privacy_scope: "private", status: "active", next_due_on: "2026-10-26", last_completed_on: "2026-10-19", notes: null },
  },
  health_profiles: { covered: "excluded", reason: "Who may see a member's health information and whether AI may help: settings." },
  health_provenance: { covered: "excluded", reason: "Where a health reading came from (device, import): audit for the readings that are known." },
  health_record_readings: {
    covered: "registry",
    domain: "health",
    noun: "report reading",
    need: "what a medical report said",
    select: "id, record_id, findings, test_date, read_at, health_records(label, member_id, privacy_scope)",
    since: { column: "read_at", days: 730 },
    order: { column: "read_at", ascending: false },
    limit: 100,
    privacy: "health",
    healthScope: (row) => healthScope(embed(row.health_records) ?? {}),
    subjects: (row) => [embed(row.health_records)?.member_id],
    describe: (row, w) => {
      const record = embed(row.health_records);
      const findings = Array.isArray(row.findings) ? (row.findings as Row[]) : [];
      const said = findings
        .map((finding) => join(text(finding.name) ?? text(finding.label) ?? text(finding.test), text(finding.value) ?? (num(finding.value) !== null ? String(num(finding.value)) : null), text(finding.unit), text(finding.flag) ? `(${text(finding.flag)})` : null))
        .filter(Boolean)
        .slice(0, 20);
      const title = text(record?.label) ?? "a report";
      return {
        title,
        summary: `${w.name(record?.member_id) ?? "Someone"}'s ${title}${w.date(row.test_date) ? ` from ${w.date(row.test_date)}` : ""} reads: ${said.length > 0 ? said.join("; ") : "nothing readable"}.`,
        date: w.day(row.test_date),
        aliases: [title],
        current: false,
      };
    },
    example: { id: UUID_A, record_id: UUID_B, findings: [{ name: "Haemoglobin", value: "13.2", unit: "g/dL", flag: "normal" }], test_date: "2026-10-05", read_at: "2026-10-06T05:00:00Z", health_records: { label: "Blood test", member_id: ADULT, privacy_scope: "private" } },
  },
  health_records: { covered: "builder", records: "healthRecords" },
  health_vitals: { covered: "builder", records: "vitals" },
  helper_profiles: {
    covered: "registry",
    domain: "people",
    noun: "helper profile",
    need: "how a helper works with the household",
    select: "id, member_id, engagement, started_on, notes",
    order: { column: "created_at", ascending: true },
    limit: 50,
    privacy: "general",
    subjects: (row) => [row.member_id],
    describe: (row, w) => ({
      title: `${w.name(row.member_id) ?? "helper"}'s work`,
      summary: join(`${w.name(row.member_id) ?? "A helper"} works with the household`, humanise(row.engagement) ? `(${humanise(row.engagement)})` : null, w.date(row.started_on) ? `since ${w.date(row.started_on)}` : null) + `.${text(row.notes) ? ` ${text(row.notes)}` : ""}`,
      aliases: [w.name(row.member_id), humanise(row.engagement)],
    }),
    example: { id: UUID_A, member_id: ADULT, engagement: "full_day", started_on: "2025-04-01", notes: "Off on Sundays" },
  },
  home_assets: { covered: "builder", records: "assets" },
  home_device_links: { covered: "excluded", reason: "Which smart device is linked to which appliance: connection settings." },
  home_device_signals: { covered: "excluded", reason: "Raw device telemetry; what it means for an appliance reaches the appliance's record." },
  home_send_items: { covered: "builder", records: "homeSendItems" },
  homebrain_consolidations: { covered: "excluded", reason: "HomeBrain's own record of what it tidied at night." },
  homebrain_embeddings: { covered: "excluded", reason: "HomeBrain's own index of meaning." },
  homebrain_links: { covered: "excluded", reason: "HomeBrain's own links between records; they ride on the records' facts." },
  homebrain_misses: { covered: "excluded", reason: "Content-free telemetry about HomeBrain's own lookups." },
  homebrain_recall: { covered: "excluded", reason: "Counts of which memories HomeBrain used." },
  homebrain_runs: { covered: "excluded", reason: "When HomeBrain's nightly tidy ran." },
  homesend_addresses: { covered: "excluded", reason: "The household's forwarding address: a credential." },
  homesend_changes: { covered: "builder", records: "homeSendItems" },
  homesend_email_events: { covered: "excluded", reason: "Content-free delivery telemetry for forwarded email." },
  hometalk_channel_events: { covered: "excluded", reason: "Content-free telemetry for each HomeTalk turn." },
  household_addresses: { covered: "builder", records: "address" },
  household_ai_credentials: { covered: "excluded", reason: "Credentials (the household's AI key)." },
  household_context: { covered: "excluded", reason: "HomeBrain's stored context itself." },
  household_facts: { covered: "excluded", reason: "The record index's facts themselves (Phase 2), made from the tables this registry names." },
  household_feature_flags: { covered: "excluded", reason: "Which features are switched on: settings." },
  household_gemini_voice_credentials: { covered: "excluded", reason: "Credentials (the household's Gemini voice key)." },
  household_invitations: { covered: "excluded", reason: "Pending invitations with their tokens: credentials." },
  household_member_emails: { covered: "excluded", reason: "Members' sign-in email addresses: contact details are not facts for an assistant." },
  household_member_phones: { covered: "excluded", reason: "Members' sign-in phone numbers: contact details are not facts for an assistant." },
  household_members: { covered: "builder", records: "members" },
  household_onboarding: { covered: "excluded", reason: "How far the household got through first-time setup." },
  household_places: { covered: "builder", records: "places" },
  household_roles: { covered: "builder", records: "members" },
  household_subscriptions: { covered: "excluded", reason: "WonderHome plan state, shown under Your plan." },
  household_voice_credentials: { covered: "excluded", reason: "Credentials (voice provider keys)." },
  household_voice_settings: { covered: "excluded", reason: "How voice works for the household: settings." },
  household_webhooks: { covered: "excluded", reason: "Integration endpoints and their secrets." },
  idempotency_keys: { covered: "excluded", reason: "Request deduplication." },
  instamart_connections: { covered: "excluded", reason: "Whether a member's Swiggy account is connected: a connection setting." },
  instamart_oauth_states: { covered: "excluded", reason: "A sign-in in flight: credentials." },
  instamart_tokens: { covered: "excluded", reason: "Credentials (Swiggy tokens)." },
  integration_events: { covered: "excluded", reason: "Sync telemetry for connected accounts; the integrations themselves are known." },
  integration_identities: { covered: "excluded", reason: "Provider account ids for connected accounts: credentials." },
  integrations: { covered: "builder", records: "integrations" },
  inventory_balances: { covered: "builder", records: "consumables" },
  inventory_events: { covered: "excluded", reason: "The stock ledger's individual movements; the current stock is known." },
  jobs: { covered: "excluded", reason: "The background job queue." },
  knowledge_outbox: { covered: "excluded", reason: "The record index's queue of records written since their fact was made." },
  laundry_needs: { covered: "builder", records: "laundry" },
  meal_ingredient_needs: { covered: "builder", records: "meals" },
  meal_week_plans: { covered: "excluded", reason: "A log of when a week of meals was generated; the meals themselves are known." },
  meal_week_template_options: {
    covered: "registry",
    domain: "meals",
    noun: "weekly meal template",
    need: "the household's usual meal for a day of the week",
    select: "id, weekday, slot, recipe_id, position, recipes(name)",
    order: { column: "weekday", ascending: true },
    limit: 200,
    privacy: "general",
    subjects: () => [],
    describe: (row) => {
      const dish = text(embed(row.recipes)?.name) ?? "a dish";
      const day = weekday(row.weekday, true) ?? "one day";
      return {
        title: `${day} ${humanise(row.slot) ?? "meal"}`,
        summary: `In the weekly template, ${humanise(row.slot) ?? "a meal"} on ${day}s can be ${dish}.`,
        aliases: [dish, `${day} ${humanise(row.slot) ?? ""}`.trim()],
      };
    },
    example: { id: UUID_A, weekday: 1, slot: "dinner", recipe_id: UUID_B, position: 1, recipes: { name: "Dal tadka" } },
  },
  meals: { covered: "builder", records: "meals" },
  member_availability: {
    covered: "registry",
    domain: "people",
    noun: "weekly availability",
    need: "when someone is usually available",
    select: "id, member_id, day_of_week, start_time, end_time, source",
    order: { column: "day_of_week", ascending: true },
    limit: 300,
    privacy: "general",
    subjects: (row) => [row.member_id],
    describe: (row, w) => {
      const day = weekday(row.day_of_week, false) ?? "one day";
      return {
        title: `${w.name(row.member_id) ?? "someone"} on ${day}s`,
        summary: `${w.name(row.member_id) ?? "Someone"} is usually available on ${day}s from ${w.clock(row.start_time) ?? "?"} to ${w.clock(row.end_time) ?? "?"}.`,
        aliases: [w.name(row.member_id), day],
      };
    },
    example: { id: UUID_A, member_id: ADULT, day_of_week: 6, start_time: "09:00:00", end_time: "13:00:00", source: "member" },
  },
  member_guardians: { covered: "builder", records: "members" },
  member_languages: { covered: "builder", records: "languages" },
  member_location_sharing: { covered: "excluded", reason: "Who shares their location with whom: a consent setting." },
  member_locations: { covered: "excluded", reason: "Live location, shown only on Location sharing to the people a member chose; never an assistant's fact." },
  member_relationships: { covered: "builder", records: "relationships" },
  member_work_places: {
    covered: "registry",
    domain: "people",
    noun: "office",
    need: "where someone works",
    select: "member_id, name, address",
    order: { column: "created_at", ascending: true },
    limit: 50,
    privacy: "location",
    subjects: (row) => [row.member_id],
    describe: (row, w) => ({
      title: `${w.name(row.member_id) ?? "someone"}'s office`,
      summary: `${w.name(row.member_id) ?? "Someone"} works at ${text(row.name) ?? "an office"}${text(row.address) ? `, ${text(row.address)}` : ""}.`,
      aliases: [text(row.name), "office", "work"],
    }),
    example: { member_id: ADULT, name: "Embassy Tech Village", address: "Outer Ring Road, Bengaluru" },
  },
  memories: { covered: "builder", records: "memories" },
  merchant_offers: { covered: "excluded", reason: "Price observations from shops, recomputed often; not something the household said or did." },
  notification_channel_mutes: { covered: "excluded", reason: "Which channel a person keeps a kind of reminder off: a setting." },
  notification_events: { covered: "excluded", reason: "Delivery telemetry for reminders; the reminders themselves are known." },
  notification_preferences: { covered: "excluded", reason: "Quiet hours and channels: settings." },
  notification_reconciliations: { covered: "excluded", reason: "When reminders were last brought in line with their records." },
  notifications: { covered: "builder", records: "notifications", live: true },
  obligation_history: { covered: "builder", records: "billPayments" },
  obligation_periods: { covered: "builder", records: "billAhead" },
  obligations: { covered: "builder", records: "obligations" },
  onboarding_events: { covered: "excluded", reason: "Setup telemetry." },
  order_items: {
    covered: "registry",
    domain: "orders",
    noun: "order line",
    need: "what was in an order",
    select: "id, order_id, description, quantity, unit_price_minor, created_at, orders(provider, status, placed_at, currency)",
    since: { column: "created_at", days: 120 },
    order: { column: "created_at", ascending: false },
    limit: 300,
    privacy: "general",
    subjects: () => [],
    describe: (row, w) => {
      const order = embed(row.orders);
      const item = text(row.description) ?? "an item";
      const price = w.money(row.unit_price_minor, order?.currency);
      return {
        title: item,
        summary: join(`${item}`, num(row.quantity) ? `× ${num(row.quantity)}` : null, `was in the ${text(order?.provider) ?? "online"} order`, w.date(order?.placed_at) ? `placed ${w.date(order?.placed_at)}` : null, price ? `at ${price} each` : null, humanise(order?.status) ? `(order ${humanise(order?.status)})` : null) + ".",
        date: w.day(order?.placed_at),
        aliases: [item, text(order?.provider)],
        current: false,
      };
    },
    example: { id: UUID_A, order_id: UUID_B, description: "Amul Taaza toned milk 1 l", quantity: 2, unit_price_minor: 5600, created_at: "2026-10-21T04:00:00Z", orders: { provider: "Swiggy Instamart", status: "delivered", placed_at: "2026-10-21T04:00:00Z", currency: "INR" } },
  },
  orders: { covered: "builder", records: "orders" },
  outcome_exceptions: { covered: "excluded", reason: "Agent-detected exceptions on an outcome; the outcome and its attention are known." },
  outcomes: { covered: "builder", records: "outcomes" },
  payment_attempts: { covered: "excluded", reason: "WonderHome subscription payment attempts." },
  payment_customers: { covered: "excluded", reason: "Payment provider customer ids." },
  payment_intents: { covered: "excluded", reason: "Payment provider intents." },
  payment_refunds: { covered: "excluded", reason: "WonderHome subscription refunds." },
  payments: { covered: "excluded", reason: "WonderHome's subscription ledger, not the household's own bills." },
  pet_care_needs: { covered: "builder", records: "petCare" },
  pet_preferences: { covered: "builder", records: "pets" },
  pets: { covered: "builder", records: "pets" },
  playbook_dependencies: { covered: "excluded", reason: "How playbook items depend on each other: configuration for the agents." },
  playbook_items: { covered: "builder", records: "responsibilities" },
  policies: { covered: "excluded", reason: "Versioned household rules (autonomy, notifications), enforced where they apply." },
  portal_fetch_cursors: { covered: "excluded", reason: "Idempotency bookkeeping for portal fetches (hashes of items already filed); the items themselves become HomeSend items, which are known." },
  portal_fetch_jobs: { covered: "excluded", reason: "Queue of portal fetches for the worker (which connection to run, how it went); no portal content, operational." },
  portal_scrape_urls: { covered: "excluded", reason: "Which post-auth portal pages a household has WonderHome read: connection config. What they bring in becomes HomeSend items, which are known." },
  portal_sessions: { covered: "excluded", reason: "A connected portal's persisted browser session (cookies/tokens): credentials, never readable; the server reads it with the service role to run the fetch." },
  privacy_requests: { covered: "excluded", reason: "Data export and deletion requests." },
  purchase_policies: { covered: "excluded", reason: "Spending limits for agents: configuration." },
  push_subscriptions: { covered: "excluded", reason: "Devices that receive push: credentials." },
  recipe_ingredients: { covered: "builder", records: "meals" },
  recipes: { covered: "builder", records: "meals" },
  reminder_preferences: { covered: "excluded", reason: "When each kind of reminder lands: settings." },
  responsibilities: { covered: "builder", records: "responsibilities" },
  routines: {
    covered: "registry",
    domain: "responsibilities",
    noun: "routine",
    need: "what happens regularly and when it is next due",
    select: "id, playbook_item_id, schedule, next_due_at, active, playbook_items(name, cadence)",
    activeOnly: true,
    order: { column: "next_due_at", ascending: true },
    limit: 200,
    privacy: "general",
    subjects: () => [],
    describe: (row, w) => {
      const title = text(embed(row.playbook_items)?.name) ?? "a routine";
      const schedule = row.schedule && typeof row.schedule === "object" ? (row.schedule as Row) : {};
      const every = humanise(schedule.frequency) ?? humanise(schedule.every) ?? humanise(schedule.cadence) ?? humanise(embed(row.playbook_items)?.cadence);
      return {
        title,
        summary: join(`${title} is a routine`, every ? `(${every})` : null, w.moment(row.next_due_at) ? `next due ${w.moment(row.next_due_at)}` : null) + ".",
        date: w.day(row.next_due_at),
        aliases: [title],
      };
    },
    example: { id: UUID_A, playbook_item_id: UUID_B, schedule: { frequency: "weekly" }, next_due_at: "2026-10-26T03:30:00Z", active: true, playbook_items: { name: "Water the plants", cadence: "weekly" } },
  },
  schedule_conflicts: { covered: "excluded", reason: "Clashes derived from the events, which are known; recomputed on each change." },
  school_channels: { covered: "excluded", reason: "Which portal message channels a household tracks: connection config. The messages they bring in become HomeSend items, which are known." },
  school_communications: { covered: "builder", records: "communications" },
  school_portal_credentials: { covered: "excluded", reason: "Credentials (a connected school portal's sign-in). Never readable; the messages a portal brings in become HomeSend items, which are known." },
  school_documents: {
    covered: "registry",
    domain: "school",
    noun: "school document",
    need: "papers the school sent",
    select: "id, child_member_id, school_item_id, title, content_type, created_at",
    since: { column: "created_at", days: 365 },
    order: { column: "created_at", ascending: false },
    limit: 200,
    privacy: "child",
    subjects: (row) => [row.child_member_id],
    describe: (row, w) => ({
      title: text(row.title) ?? "a school document",
      summary: `${w.name(row.child_member_id) ?? "A child"}'s school document "${text(row.title) ?? "untitled"}" was added on ${w.date(row.created_at) ?? "a day"}.`,
      date: w.day(row.created_at),
      aliases: [text(row.title)],
      current: false,
    }),
    example: { id: UUID_A, child_member_id: CHILD, school_item_id: null, title: "Term 1 report card", content_type: "application/pdf", created_at: "2026-10-10T06:00:00Z" },
  },
  school_enrolments: { covered: "builder", records: "enrolments" },
  school_exam_papers: { covered: "builder", records: "exams" },
  school_exam_types: { covered: "builder", records: "exams" },
  school_exams: { covered: "builder", records: "exams" },
  school_items: { covered: "builder", records: "schoolItems" },
  school_teachers: {
    covered: "registry",
    domain: "school",
    noun: "teacher",
    need: "who teaches a child",
    select: "id, child_member_id, role, subject, name, contact, note, active",
    activeOnly: true,
    order: { column: "name", ascending: true },
    limit: 200,
    privacy: "child",
    subjects: (row) => [row.child_member_id],
    describe: (row, w) => ({
      title: text(row.name) ?? "a teacher",
      summary: join(`${text(row.name) ?? "A teacher"} is ${w.name(row.child_member_id) ?? "a child"}'s`, text(row.subject) ? `${text(row.subject)}` : null, `${humanise(row.role) ?? "teacher"}`, text(row.contact) ? `(contact: ${text(row.contact)})` : null) + `.${text(row.note) ? ` ${text(row.note)}` : ""}`,
      aliases: [text(row.name), text(row.subject) ? `${text(row.subject)} teacher` : null, humanise(row.role)],
    }),
    example: { id: UUID_A, child_member_id: CHILD, role: "class_teacher", subject: null, name: "Mrs Iyer", contact: null, note: null, active: true },
  },
  school_timetable_periods: { covered: "builder", records: "timetable" },
  service_requests: { covered: "builder", records: "serviceRequests" },
  shopping_list_entries: { covered: "builder", records: "consumables" },
  shopping_list_events: { covered: "excluded", reason: "The shopping list's change history; the list itself is known." },
  spend_anomalies: { covered: "excluded", reason: "Derived spending signals recomputed from bills and purchases." },
  step_up_verifications: { covered: "excluded", reason: "Security step-up checks." },
  study_sessions: {
    covered: "registry",
    domain: "school",
    noun: "study session",
    need: "when a child studies",
    select: "id, child_member_id, school_item_id, starts_at, ends_at, school_items(title)",
    since: { column: "starts_at", days: 30 },
    order: { column: "starts_at", ascending: true },
    limit: 200,
    privacy: "child",
    subjects: (row) => [row.child_member_id],
    describe: (row, w) => {
      const work = text(embed(row.school_items)?.title);
      return {
        title: work ? `study for ${work}` : "study time",
        summary: join(`${w.name(row.child_member_id) ?? "A child"} has study time`, work ? `for ${work}` : null, w.moment(row.starts_at) ? `on ${w.moment(row.starts_at)}` : null, w.moment(row.ends_at) ? `until ${w.clock(String(row.ends_at).slice(11, 16)) ?? ""}`.trim() : null) + ".",
        date: w.day(row.starts_at),
        aliases: [work, "study", "revision"],
      };
    },
    example: { id: UUID_A, child_member_id: CHILD, school_item_id: UUID_B, starts_at: "2026-10-24T11:30:00Z", ends_at: "2026-10-24T12:30:00Z", school_items: { title: "Maths worksheet" } },
  },
  support_access_grants: { covered: "excluded", reason: "Staff support access: security." },
  usage_counters: { covered: "excluded", reason: "Plan usage metering." },
  voice_oauth_grants: { covered: "excluded", reason: "Voice assistant sign-in grants: credentials." },
  weather_locations: { covered: "excluded", reason: "The weather area (rounded coordinates) and its cached forecast, shown on Home's date card." },
  webhook_deliveries: { covered: "excluded", reason: "Outgoing webhook delivery log." },
  whatsapp_events: { covered: "excluded", reason: "Content-free WhatsApp telemetry." },
  whatsapp_identities: { covered: "excluded", reason: "Which WhatsApp number is linked to which member: a credential." },
  whatsapp_link_requests: { covered: "excluded", reason: "A linking code in flight: a credential." },
  whatsapp_messages: { covered: "excluded", reason: "Raw inbound WhatsApp messages; what they became is a HomeSend item, which is known." },
} as const satisfies Record<string, TableSpec>;

export type RegistryTable = keyof typeof KNOWLEDGE_REGISTRY;

/** The tables the generic describer reads, with their specs. */
export const REGISTRY_READ: readonly (RegistrySpec & { table: RegistryTable })[] = (Object.entries(KNOWLEDGE_REGISTRY) as [RegistryTable, TableSpec][])
  .filter((entry): entry is [RegistryTable, RegistrySpec] => entry[1].covered === "registry")
  .map(([table, spec]) => ({ ...spec, table }));
