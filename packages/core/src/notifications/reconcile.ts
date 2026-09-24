import type { SupabaseClient } from "@supabase/supabase-js";

import { formatterFor } from "../i18n/format";
import { NO_MEMBER_CHOICES, parseHouseholdSettings, resolvePreferences } from "../i18n/preferences";
import type { ChannelAdapter, DeliveryChannel } from "./channels";
import { deliverNotification } from "./deliver";
import { learnedMinuteFrom } from "./learning";
import {
  backupFor,
  chooseReminderRecipient,
  isUnanswered,
  planEscalation,
  planReminder,
  type ChosenRecipient,
  type DesiredReminder,
  type Directory,
  type DirectoryMember,
} from "./plan";
import { REMINDER_POLICIES } from "./policies";
import {
  RECONCILED_SOURCE_TYPES,
  billSubject,
  familySubject,
  grocerySubject,
  mealSubject,
  petSubject,
  schoolDaySubject,
  schoolSubject,
  type BillRow,
  type FamilyEventRow,
  type MealRow,
  type PetCareRow,
  type ReminderSubject,
  type SchoolItemRow,
  type SourceContext,
} from "./sources";
import { localMoment, quietHoursFrom, type QuietHours } from "./timing";

/**
 * Keeping reminders true to the household (stories 23-001, 23-003, 23-004).
 *
 * Reminders are not fired and forgotten. This pass reads what the household's
 * records say right now — which bills are still unpaid, which school work is
 * still pending, what is planned for dinner — works out the one reminder each
 * deserves for its responsible person, and brings the notifications table in
 * line: a new reminder is created, a changed one updated, a finished source's
 * reminder resolved, a stale one expired. Running it twice changes nothing
 * the second time (story 23-003's idempotency): the thread key plus the
 * one-open-per-thread index are the dedupe key, and an unchanged reminder is
 * never written.
 *
 * It runs when a member opens Home, Today or Notifications (throttled per
 * household) and from the daily cron, so a change in household state is
 * re-evaluated without a finer-grained scheduler. Service role only: nobody
 * can write their own reminders.
 */

export const RECONCILE_EVERY_MINUTES = 5;
/** A reminder that fell due longer ago than this is shown in-app, not pushed late. */
const FRESH_DELIVERY_MINUTES = 120;

export type ReconcileResult = {
  ran: boolean;
  created: number;
  updated: number;
  resolved: number;
  expired: number;
  delivered: number;
};

const NOTHING: ReconcileResult = { ran: false, created: 0, updated: 0, resolved: 0, expired: 0, delivered: 0 };

export type OpenRow = {
  id: string;
  recipient_member_id: string;
  thread_key: string;
  source_type: string | null;
  reminder_seq: number;
  scheduled_for: string;
  snooze_count: number;
  status: string;
  title: string;
  body: string;
  priority: string;
  earliest_at: string | null;
  latest_at: string | null;
  expires_at: string | null;
  reminder_policy: string | null;
  delivered_at: string | null;
};

export async function reconcileHouseholdReminders(
  admin: SupabaseClient,
  householdId: string,
  options: { now?: Date; force?: boolean; adapters?: Record<DeliveryChannel, ChannelAdapter> } = {},
): Promise<ReconcileResult> {
  const now = options.now ?? new Date();
  if (!options.force && !(await claimReconcile(admin, householdId, now))) return NOTHING;

  try {
    return await reconcile(admin, householdId, now, options.adapters);
  } catch {
    // A reminder pass that fails leaves yesterday's reminders exactly as they
    // were; it never takes the page that asked for it down with it.
    return NOTHING;
  }
}

/** Takes this household's turn, or reports that another pass ran recently. */
async function claimReconcile(admin: SupabaseClient, householdId: string, now: Date): Promise<boolean> {
  const cutoff = new Date(now.getTime() - RECONCILE_EVERY_MINUTES * 60_000).toISOString();
  const { data: updated, error: updateError } = await admin
    .from("notification_reconciliations")
    .update({ reconciled_at: now.toISOString() })
    .eq("household_id", householdId)
    .lt("reconciled_at", cutoff)
    .select("household_id");
  if (updateError) return false;
  if (updated && updated.length > 0) return true;

  const { error } = await admin
    .from("notification_reconciliations")
    .insert({ household_id: householdId, reconciled_at: now.toISOString() });
  // A conflict means a recent pass already holds the row.
  return !error;
}

async function reconcile(
  admin: SupabaseClient,
  householdId: string,
  now: Date,
  adapters: Record<DeliveryChannel, ChannelAdapter> | undefined,
): Promise<ReconcileResult> {
  const { data: household } = await admin
    .from("households")
    .select("timezone, region, currency, measurement_system, default_language")
    .eq("id", householdId)
    .maybeSingle();
  if (!household) return NOTHING;

  const settings = parseHouseholdSettings({ ...household, language: household.default_language });
  const timeZone = settings.timezone;
  const context: SourceContext = {
    timeZone,
    format: formatterFor(resolvePreferences(NO_MEMBER_CHOICES, settings)),
    now,
  };

  const horizon = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
  const since = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

  const [bills, school, meals, groceries, pets, events, members, roles, responsibilities, guardians, reminderPrefs, channelPrefs, quietPolicy, open, closed] =
    await Promise.all([
      admin
        .from("obligations")
        .select("id, name, payee, amount_minor, currency, due_on, status, responsible_member_id")
        .eq("household_id", householdId)
        .in("status", ["expected", "received", "scheduled", "overdue"])
        .lte("due_on", horizon(8).slice(0, 10)),
      admin
        .from("school_items")
        .select("id, child_member_id, kind, title, due_at, due_time_known, status")
        .eq("household_id", householdId)
        .in("status", ["pending", "in_progress"])
        .gte("due_at", since(1))
        .lte("due_at", horizon(3)),
      admin
        .from("meals")
        .select("id, name, slot, ready_by, status, cook_member_id, recipes(total_minutes)")
        .eq("household_id", householdId)
        .in("status", ["planned", "at_risk"])
        .gte("ready_by", now.toISOString())
        .lte("ready_by", horizon(2)),
      admin
        .from("cart_suggestions")
        .select("needed_by, consumables(name, category)")
        .eq("household_id", householdId)
        .eq("status", "suggested"),
      admin
        .from("pet_care_needs")
        .select("id, kind, due_on, last_done_on, interval_days, responsible_member_id, pets(name, active)")
        .eq("household_id", householdId),
      admin
        .from("family_events")
        .select("id, title, kind, starts_at, status, owner_member_id")
        .eq("household_id", householdId)
        .in("status", ["proposed", "planned", "confirmed"])
        .gte("starts_at", now.toISOString())
        .lte("starts_at", horizon(2)),
      admin.from("household_members").select("id, profile_id, member_type, status, display_name, nickname").eq("household_id", householdId),
      admin.from("household_roles").select("member_id, role").eq("household_id", householdId),
      admin.from("responsibilities").select("outcome_key, primary_member_id, backup_member_id").eq("household_id", householdId),
      admin.from("member_guardians").select("child_member_id, guardian_member_id").eq("household_id", householdId),
      admin.from("reminder_preferences").select("member_id, category, preset, enabled").eq("household_id", householdId),
      admin
        .from("notification_preferences")
        .select("member_id, enabled, quiet_from, quiet_until, quiet_from_minute, quiet_until_minute, learn_timing")
        .eq("household_id", householdId)
        .eq("channel", "in_app"),
      admin
        .from("policies")
        .select("rule")
        .eq("household_id", householdId)
        .eq("category", "notifications")
        .eq("name", "Quiet hours")
        .eq("active", true)
        .maybeSingle(),
      admin
        .from("notifications")
        .select(
          "id, recipient_member_id, thread_key, source_type, reminder_seq, scheduled_for, snooze_count, status, title, body, priority, earliest_at, latest_at, expires_at, reminder_policy, delivered_at",
        )
        .eq("household_id", householdId)
        .in("status", ["generated", "delivered", "seen"]),
      admin
        .from("notifications")
        .select("recipient_member_id, thread_key, reminder_seq")
        .eq("household_id", householdId)
        .in("status", ["acted", "dismissed"])
        .in("source_type", [...RECONCILED_SOURCE_TYPES])
        .gte("created_at", since(30)),
    ]);

  // 1. What the records say deserves a reminder.
  const memberRows = (members.data ?? []) as {
    id: string;
    profile_id: string | null;
    member_type: DirectoryMember["memberType"];
    status: string;
    display_name: string;
    nickname: string | null;
  }[];
  const displayNames = new Map(memberRows.map((row) => [row.id, row.nickname || row.display_name]));

  const subjects: ReminderSubject[] = [];
  const schoolRows = new Map<ReminderSubject, SchoolItemRow>();
  for (const row of (bills.data ?? []) as BillRow[]) push(subjects, billSubject(row, context));
  for (const row of (school.data ?? []) as SchoolItemRow[]) {
    const subject = schoolSubject(row, displayNames.get(row.child_member_id) ?? "Your child", context);
    // Something already past its moment is no longer worth grouping with the rest.
    if (subject && subject.expiresAt > now) {
      subjects.push(subject);
      schoolRows.set(subject, row);
    }
  }
  for (const row of (meals.data ?? []) as (Omit<MealRow, "recipe_total_minutes"> & { recipes: { total_minutes: number } | { total_minutes: number }[] | null })[]) {
    const recipe = Array.isArray(row.recipes) ? row.recipes[0] : row.recipes;
    push(subjects, mealSubject({ ...row, recipe_total_minutes: recipe?.total_minutes ?? null }, context));
  }
  const groceryNeeds = ((groceries.data ?? []) as { needed_by: string | null; consumables: { name: string; category: string } | { name: string; category: string }[] | null }[])
    .map((row) => ({ needed_by: row.needed_by, item: Array.isArray(row.consumables) ? row.consumables[0] : row.consumables }))
    .filter((row): row is { needed_by: string | null; item: { name: string; category: string } } => Boolean(row.item))
    .map((row) => ({ name: row.item.name, category: row.item.category, needed_by: row.needed_by }));
  push(subjects, grocerySubject(groceryNeeds, context));
  for (const row of (pets.data ?? []) as (Omit<PetCareRow, "pet_name"> & { pets: { name: string; active: boolean } | { name: string; active: boolean }[] | null })[]) {
    const pet = Array.isArray(row.pets) ? row.pets[0] : row.pets;
    if (pet?.active) push(subjects, petSubject({ ...row, pet_name: pet.name }, context));
  }
  for (const row of (events.data ?? []) as FamilyEventRow[]) push(subjects, familySubject(row, context));

  // 2. Who is responsible, and how they like to be reminded.
  const directory = buildDirectory(memberRows, roles.data ?? [], responsibilities.data ?? [], guardians.data ?? []);
  const householdQuiet = quietFromPolicy(quietPolicy.data?.rule);
  const quietByMember = new Map<string, QuietHours | null>();
  for (const row of (channelPrefs.data ?? []) as { member_id: string; enabled: boolean; quiet_from: number | null; quiet_until: number | null; quiet_from_minute: number; quiet_until_minute: number }[]) {
    quietByMember.set(
      row.member_id,
      quietHoursFrom({ quietFrom: row.quiet_from, quietUntil: row.quiet_until, quietFromMinute: row.quiet_from_minute, quietUntilMinute: row.quiet_until_minute }),
    );
  }
  const prefs = new Map(
    ((reminderPrefs.data ?? []) as { member_id: string; category: string; preset: string; enabled: boolean }[]).map((row) => [
      `${row.member_id}|${row.category}`,
      row,
    ]),
  );
  const closedSeq = new Map<string, number>();
  for (const row of (closed.data ?? []) as { recipient_member_id: string; thread_key: string; reminder_seq: number }[]) {
    const key = `${row.recipient_member_id}|${row.thread_key}`;
    closedSeq.set(key, Math.max(closedSeq.get(key) ?? 0, row.reminder_seq));
  }

  const learning = new Set(
    ((channelPrefs.data ?? []) as { member_id: string; learn_timing?: boolean | null }[]).filter((row) => row.learn_timing).map((row) => row.member_id),
  );
  const learned = learning.size > 0 ? await learnedTimes(admin, householdId, learning, timeZone, now) : new Map<string, number>();

  // Each subject's one responsible person; then a child's school things due
  // the same day, going to the same person, become one reminder (23-008).
  const routed: { subject: ReminderSubject; recipient: ChosenRecipient }[] = [];
  for (const subject of subjects) {
    const recipient = chooseReminderRecipient(subject, directory);
    if (recipient) routed.push({ subject, recipient });
  }
  const assignments = REMINDER_POLICIES.school.batching ? batchSchoolDays(routed, schoolRows, displayNames, context) : routed;

  const settingsFor = (memberId: string, category: ReminderSubject["category"]) => {
    const chosen = prefs.get(`${memberId}|${category}`);
    return {
      preset: chosen?.preset ?? null,
      enabled: chosen?.enabled ?? true,
      quiet: quietByMember.has(memberId) ? quietByMember.get(memberId)! : householdQuiet,
      // A timing the person chose themselves always wins over a learned one.
      // Saving the settings writes every kind, so only a preset other than
      // the policy's own default counts as a choice.
      learnedMinute:
        chosen && chosen.preset !== REMINDER_POLICIES[category].defaultPreset ? null : (learned.get(`${memberId}|${category}`) ?? null),
    };
  };

  const desired = new Map<string, DesiredReminder>();
  const subjectOf = new Map<string, ReminderSubject>();
  for (const { subject, recipient } of assignments) {
    const key = `${recipient.memberId}|${subject.threadKey}`;
    const planned = planReminder(subject, recipient, settingsFor(recipient.memberId, subject.category), closedSeq.get(key) ?? 0, timeZone, now);
    if (planned) {
      desired.set(key, planned);
      subjectOf.set(key, subject);
    }
  }

  // The backup hears about it only when the responsible person has not
  // answered the last reminder, and only once (23-010).
  const openRows = (open.data ?? []) as OpenRow[];
  const openByKey = new Map(openRows.map((row) => [`${row.recipient_member_id}|${row.thread_key}`, row]));
  const escalations: { primaryRowId: string; backupId: string }[] = [];
  for (const [key, want] of [...desired]) {
    if (want.recipientRole !== "primary") continue;
    const primaryOpen = openByKey.get(key);
    if (!primaryOpen) continue;
    const backupId = backupFor(subjectOf.get(key)!, directory, want.recipientMemberId);
    if (!backupId) continue;
    const backupKey = `${backupId}|${want.threadKey}`;
    if (desired.has(backupKey)) continue;
    const alreadyEscalated = openByKey.has(backupKey);
    if (!alreadyEscalated && !isUnanswered(want, primaryOpen, now)) continue;
    const escalation = planEscalation(
      want,
      backupId,
      displayNames.get(want.recipientMemberId) ?? "The person responsible",
      settingsFor(backupId, want.category),
      closedSeq.get(backupKey) ?? 0,
      timeZone,
      now,
    );
    if (!escalation) continue;
    desired.set(backupKey, escalation);
    if (!alreadyEscalated) escalations.push({ primaryRowId: primaryOpen.id, backupId });
  }

  // 3. Bring the table in line.
  const result: ReconcileResult = { ran: true, created: 0, updated: 0, resolved: 0, expired: 0, delivered: 0 };
  const managed = new Set<string>(RECONCILED_SOURCE_TYPES);
  const seen = new Set<string>();

  for (const row of openRows) {
    // Anything past its own expiry stops being shown, whoever wrote it.
    if (row.expires_at && new Date(row.expires_at) <= now) {
      if (await setStatus(admin, row.id, "expired", now)) result.expired += 1;
      continue;
    }
    if (!row.source_type || !managed.has(row.source_type)) continue;

    const key = `${row.recipient_member_id}|${row.thread_key}`;
    const want = desired.get(key);
    if (!want) {
      // The source is done, the person turned this off, or it went to someone else.
      if (await setStatus(admin, row.id, "resolved", now)) result.resolved += 1;
      continue;
    }
    seen.add(key);
    const patch = patchFor(row, want, now);
    if (patch) {
      const { error } = await admin.from("notifications").update(patch).eq("id", row.id);
      if (!error) result.updated += 1;
    }
  }

  for (const [key, want] of desired) {
    if (seen.has(key)) continue;
    const { error } = await admin.from("notifications").insert(insertFor(householdId, want));
    // A unique violation is a concurrent pass that got there first.
    if (!error) result.created += 1;
  }

  // The trail says who it went to next, on the reminder that went unanswered.
  for (const { primaryRowId } of escalations) {
    await admin.from("notification_events").insert({
      household_id: householdId,
      notification_id: primaryRowId,
      event_type: "escalated",
      channel: "in_app",
      metadata: { to: "backup" },
    });
  }

  // 4. What has come due is delivered — in the app always, and on the
  //    person's other live channels when it is still fresh.
  const { data: due } = await admin
    .from("notifications")
    .update({ status: "delivered", delivered_at: now.toISOString() })
    .eq("household_id", householdId)
    .eq("status", "generated")
    .lte("scheduled_for", now.toISOString())
    .select("id, recipient_member_id, title, body, priority, scheduled_for, source_type");
  for (const row of (due ?? []) as { id: string; recipient_member_id: string; title: string; body: string; priority: string; scheduled_for: string; source_type: string | null }[]) {
    result.delivered += 1;
    const fresh = now.getTime() - new Date(row.scheduled_for).getTime() <= FRESH_DELIVERY_MINUTES * 60_000;
    const ownDelivery = row.source_type === "reminder" || (row.source_type !== null && managed.has(row.source_type));
    if (fresh && ownDelivery) {
      await deliverNotification(
        admin,
        {
          householdId,
          notificationId: row.id,
          recipientMemberId: row.recipient_member_id,
          notification: { title: row.title, body: row.body, priority: row.priority === "high" ? "high" : row.priority === "low" ? "low" : "normal" },
          now,
        },
        adapters,
      );
    }
  }

  return result;
}

function push(list: ReminderSubject[], subject: ReminderSubject | null): void {
  if (subject) list.push(subject);
}

/**
 * School items for one child, due the same local day and going to the same
 * person, replaced by one grouped subject. Everything else passes through.
 */
export function batchSchoolDays(
  routed: readonly { subject: ReminderSubject; recipient: ChosenRecipient }[],
  schoolRows: ReadonlyMap<ReminderSubject, SchoolItemRow>,
  names: ReadonlyMap<string, string>,
  context: SourceContext,
): { subject: ReminderSubject; recipient: ChosenRecipient }[] {
  const groups = new Map<string, { recipient: ChosenRecipient; items: { row: SchoolItemRow; subject: ReminderSubject }[] }>();
  const rest: { subject: ReminderSubject; recipient: ChosenRecipient }[] = [];
  for (const entry of routed) {
    const row = schoolRows.get(entry.subject);
    if (!row) {
      rest.push(entry);
      continue;
    }
    const day =
      entry.subject.anchor.kind === "day" ? entry.subject.anchor.date : localMoment(entry.subject.anchor.at, context.timeZone).dateKey;
    const key = `${entry.recipient.memberId}|${row.child_member_id}|${day}`;
    const group = groups.get(key) ?? { recipient: entry.recipient, items: [] };
    group.items.push({ row, subject: entry.subject });
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const childId = group.items[0]!.row.child_member_id;
    const batched = schoolDaySubject(group.items, names.get(childId) ?? "Your child", context);
    if (batched) rest.push({ subject: batched, recipient: group.recipient });
    else for (const item of group.items) rest.push({ subject: item.subject, recipient: group.recipient });
  }
  return rest;
}

/** How long a person's past actions are looked at to learn their timing. */
const LEARNING_WINDOW_DAYS = 60;

/**
 * When each learning member usually acts on each kind of reminder, from the
 * times they acted on one (23-012). Only members who asked for it are read.
 */
async function learnedTimes(
  admin: SupabaseClient,
  householdId: string,
  members: ReadonlySet<string>,
  timeZone: string,
  now: Date,
): Promise<Map<string, number>> {
  const { data } = await admin
    .from("notification_events")
    .select("created_at, notifications!inner(recipient_member_id, category)")
    .eq("household_id", householdId)
    .eq("event_type", "acted")
    .gte("created_at", new Date(now.getTime() - LEARNING_WINDOW_DAYS * 86_400_000).toISOString())
    .limit(2000);
  const times = new Map<string, Date[]>();
  for (const row of (data ?? []) as { created_at: string; notifications: { recipient_member_id: string; category: string } | { recipient_member_id: string; category: string }[] | null }[]) {
    const notification = Array.isArray(row.notifications) ? row.notifications[0] : row.notifications;
    if (!notification || !members.has(notification.recipient_member_id)) continue;
    const key = `${notification.recipient_member_id}|${notification.category}`;
    times.set(key, [...(times.get(key) ?? []), new Date(row.created_at)]);
  }
  const learned = new Map<string, number>();
  for (const [key, acted] of times) {
    const time = learnedMinuteFrom(acted, timeZone);
    if (time) learned.set(key, time.minute);
  }
  return learned;
}

export function buildDirectory(
  members: readonly { id: string; profile_id: string | null; member_type: DirectoryMember["memberType"]; status: string }[],
  roles: readonly { member_id: string; role: string }[],
  responsibilities: readonly { outcome_key: string; primary_member_id: string | null; backup_member_id: string | null }[],
  guardians: readonly { child_member_id: string; guardian_member_id: string }[],
): Directory {
  const rolesOf = new Map<string, Set<string>>();
  for (const row of roles) rolesOf.set(row.member_id, (rolesOf.get(row.member_id) ?? new Set()).add(row.role));
  const guardianMap = new Map<string, string[]>();
  for (const row of guardians) guardianMap.set(row.child_member_id, [...(guardianMap.get(row.child_member_id) ?? []), row.guardian_member_id]);
  return {
    members: new Map(
      members.map((row) => {
        const held = rolesOf.get(row.id) ?? new Set<string>();
        return [
          row.id,
          {
            id: row.id,
            hasAccount: row.profile_id !== null,
            active: row.status === "active",
            memberType: row.member_type,
            isAdmin: held.has("head") || held.has("administrator"),
            isHead: held.has("head"),
          },
        ];
      }),
    ),
    responsibilities: new Map(responsibilities.map((row) => [row.outcome_key, { primary: row.primary_member_id, backup: row.backup_member_id }])),
    guardians: guardianMap,
  };
}

/** The household's own quiet-hours rule (set through HomeTalk), for anyone who has not set their own. */
export function quietFromPolicy(rule: unknown): QuietHours | null {
  if (!rule || typeof rule !== "object") return null;
  const { quietFromHour, quietUntilHour } = rule as { quietFromHour?: unknown; quietUntilHour?: unknown };
  if (typeof quietFromHour !== "number" || typeof quietUntilHour !== "number") return null;
  if (quietFromHour < 0 || quietFromHour > 23 || quietUntilHour < 0 || quietUntilHour > 23) return null;
  return { fromMinute: quietFromHour * 60, untilMinute: quietUntilHour * 60 };
}

async function setStatus(admin: SupabaseClient, id: string, status: "resolved" | "expired", now: Date): Promise<boolean> {
  const { error } = await admin
    .from("notifications")
    .update({ status, ...(status === "resolved" ? { resolved_at: now.toISOString() } : {}) })
    .eq("id", id)
    .in("status", ["generated", "delivered", "seen"]);
  return !error;
}

/** Why a reminder is what it is, in closed words — read back to explain it, never shown raw. */
export function decisionFactors(want: DesiredReminder): Record<string, unknown> {
  return {
    recipientRole: want.recipientRole,
    stage: want.stageKey,
    placement: want.placement,
    ...(want.timing === "learned" ? { timing: "learned" } : {}),
    ...(want.escalatedFrom ? { escalatedFrom: want.escalatedFrom } : {}),
    ...(want.items ? { items: want.items } : {}),
  };
}

function contentOf(want: DesiredReminder) {
  return {
    title: want.title.slice(0, 160),
    body: want.body.slice(0, 500),
    priority: want.storedPriority,
    category: want.category,
    earliest_at: want.earliestAt.toISOString(),
    latest_at: want.latestAt.toISOString(),
    expires_at: want.expiresAt.toISOString(),
    reminder_policy: want.reminderPolicy,
  };
}

function insertFor(householdId: string, want: DesiredReminder) {
  return {
    household_id: householdId,
    recipient_member_id: want.recipientMemberId,
    type: "action",
    thread_key: want.threadKey,
    action: want.action,
    status: "generated",
    source_type: want.sourceType,
    source_id: want.sourceId,
    reminder_seq: want.reminderSeq,
    scheduled_for: want.scheduledFor.toISOString(),
    decision_factors: decisionFactors(want),
    ...contentOf(want),
  };
}

/**
 * The smallest update that makes an open reminder what it should be, or null
 * when it already is. A new stage starts the reminder over (it is news
 * again); within a stage, a snooze the person chose is kept.
 */
export function patchFor(row: OpenRow, want: DesiredReminder, now: Date): Record<string, unknown> | null {
  const content = contentOf(want);
  if (want.reminderSeq !== row.reminder_seq) {
    return {
      ...content,
      reminder_seq: want.reminderSeq,
      scheduled_for: want.scheduledFor.toISOString(),
      status: "generated",
      seen_at: null,
      delivered_at: null,
      decision_factors: decisionFactors(want),
    };
  }

  const patch: Record<string, unknown> = {};
  if (row.title !== content.title) patch.title = content.title;
  if (row.body !== content.body) patch.body = content.body;
  if (row.priority !== content.priority) patch.priority = content.priority;
  if (row.reminder_policy !== content.reminder_policy) patch.reminder_policy = content.reminder_policy;
  for (const field of ["earliest_at", "latest_at", "expires_at"] as const) {
    if (!sameInstant(row[field], content[field])) patch[field] = content[field];
  }
  // A snoozed reminder waits for the time its person chose.
  if (row.snooze_count === 0 && !sameInstant(row.scheduled_for, want.scheduledFor.toISOString())) {
    patch.scheduled_for = want.scheduledFor.toISOString();
    // Why it lands when it does travels with the time it lands.
    patch.decision_factors = decisionFactors(want);
    // Moved into the future (the due date changed): it waits again, and is
    // delivered afresh when its new time comes.
    if (want.scheduledFor > now && row.status !== "generated") {
      patch.status = "generated";
      patch.delivered_at = null;
      patch.seen_at = null;
    }
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}

export type SweepSummary = { households: number; created: number; updated: number; resolved: number; expired: number; delivered: number };

/**
 * The daily pass over every active household, for the ones nobody opened
 * today: their reminders still move on, expire and resolve. Forced, since
 * the throttle exists for page loads, not for this.
 */
export async function reconcileAllHouseholds(admin: SupabaseClient, now: Date = new Date(), limit = 500): Promise<SweepSummary> {
  const { data } = await admin.from("households").select("id").eq("status", "active").limit(limit);
  const summary: SweepSummary = { households: 0, created: 0, updated: 0, resolved: 0, expired: 0, delivered: 0 };
  for (const row of (data ?? []) as { id: string }[]) {
    const result = await reconcileHouseholdReminders(admin, row.id, { now, force: true });
    if (!result.ran) continue;
    summary.households += 1;
    summary.created += result.created;
    summary.updated += result.updated;
    summary.resolved += result.resolved;
    summary.expired += result.expired;
    summary.delivered += result.delivered;
  }
  return summary;
}
