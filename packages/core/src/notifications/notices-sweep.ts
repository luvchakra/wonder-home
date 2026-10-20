import type { SupabaseClient } from "@supabase/supabase-js";

import { formatterFor } from "../i18n/format";
import { NO_MEMBER_CHOICES, parseHouseholdSettings, resolvePreferences } from "../i18n/preferences";
import { log } from "../observability/logger";
import type { ChannelAdapter, DeliveryChannel } from "./channels";
import { createNotification } from "./create";
import {
  eventChangeNotices,
  eventReplyNotices,
  helperAbsenceNotices,
  homesendNotices,
  NOTICE_SOURCE_TYPES,
  orderNotices,
  weatherNotices,
  type AbsenceRow,
  type EventChangeRow,
  type ParticipantRow,
  type EventRow,
  type GuestRow,
  type HelperRow,
  type HomeSendRow,
  type Notice,
  type OrderRow,
} from "./notices";
import { householdWeather } from "../home/weather-service";
import type { LaundryNeed, LaundryState } from "../home/laundry";
import { buildDirectory } from "./plan";
import { reminderText } from "./sources";
import { localMoment } from "./timing";

/**
 * Bringing a household's notices in line with its records (stories 27-004 to
 * 27-014). The same shape as the reminder pass: read what the records say,
 * work out the one notice each deserves for one person, and make the
 * notifications table agree — create what is new (and send it, once), rewrite
 * what changed, resolve what has settled. Running it twice changes nothing.
 *
 * It is called from the reminder pass (a page opened, the daily sweep) and by
 * the delivery clock for any household whose records changed since its last
 * tick (`householdsWithNoticeChanges`), so a notice lands within minutes of the
 * thing that happened, whether or not anyone has the app open.
 *
 * A person who dismissed a notice is not told the same thing again; one whose
 * words have since changed (an order that shipped after it was placed) is.
 */

export type NoticeSweep = { created: number; updated: number; resolved: number };
const NOTHING: NoticeSweep = { created: 0, updated: 0, resolved: 0 };
const OPEN = ["generated", "delivered", "seen"];

type Open = { id: string; recipient_member_id: string; thread_key: string; title: string; body: string };

export async function sweepNotices(
  admin: SupabaseClient,
  householdId: string,
  now: Date = new Date(),
  options: { adapters?: Record<DeliveryChannel, ChannelAdapter> } = {},
): Promise<NoticeSweep> {
  try {
    return await sweep(admin, householdId, now, options.adapters);
  } catch (thrown) {
    // A notice pass that fails leaves the notices as they were; it never takes a page down.
    log.warn("notice sweep failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
    return NOTHING;
  }
}

async function sweep(admin: SupabaseClient, householdId: string, now: Date, adapters: Record<DeliveryChannel, ChannelAdapter> | undefined): Promise<NoticeSweep> {
  const { data: household } = await admin.from("households").select("timezone, region, currency, measurement_system, default_language").eq("id", householdId).maybeSingle();
  if (!household) return NOTHING;
  const settings = parseHouseholdSettings({ ...household, language: household.default_language });
  const format = formatterFor(resolvePreferences(NO_MEMBER_CHOICES, { ...settings, language: "en" }));
  const timeZone = settings.timezone;
  const since = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const today = localMoment(now, timeZone).dateKey;

  const [members, roles, responsibilities, guardians, items, events, absences, helpers, orders, changes, open, closed] = await Promise.all([
    admin.from("household_members").select("id, profile_id, member_type, status, display_name, nickname").eq("household_id", householdId),
    admin.from("household_roles").select("member_id, role").eq("household_id", householdId),
    admin.from("responsibilities").select("outcome_key, primary_member_id, backup_member_id").eq("household_id", householdId),
    admin.from("member_guardians").select("child_member_id, guardian_member_id").eq("household_id", householdId),
    admin.from("home_send_items").select("id, created_by_member_id, status, classified_kind, updated_at").eq("household_id", householdId).in("status", ["classified", "failed"]).gte("updated_at", since(14)).limit(200),
    admin.from("family_events").select("id, title, owner_member_id, starts_at, ends_at, kind, status, all_day").eq("household_id", householdId).gte("starts_at", since(1)).limit(300),
    admin.from("availability_exceptions").select("id, member_id, on_date").eq("household_id", householdId).eq("available", false).gte("on_date", today).limit(200),
    admin.from("helper_profiles").select("member_id").eq("household_id", householdId),
    admin.from("orders").select("id, provider, status, total_minor, currency, approved_by_member_id, updated_at").eq("household_id", householdId).gte("updated_at", since(3)).limit(100),
    admin.from("family_event_changes").select("id, event_id, kind, changed_by_member_id, new_starts_at, created_at").eq("household_id", householdId).gte("created_at", since(3)).limit(100),
    admin.from("notifications").select("id, recipient_member_id, thread_key, title, body").eq("household_id", householdId).in("source_type", [...NOTICE_SOURCE_TYPES]).in("status", OPEN).limit(1000),
    admin.from("notifications").select("recipient_member_id, thread_key, title, body").eq("household_id", householdId).in("source_type", [...NOTICE_SOURCE_TYPES]).in("status", ["acted", "dismissed"]).gte("created_at", since(14)).limit(1000),
  ]);

  const memberRows = (members.data ?? []) as { id: string; profile_id: string | null; member_type: "adult" | "child" | "helper"; status: string; display_name: string; nickname: string | null }[];
  const names = new Map(memberRows.map((row) => [row.id, row.nickname || row.display_name]));
  const directory = buildDirectory(memberRows, roles.data ?? [], responsibilities.data ?? [], guardians.data ?? []);

  const eventRows = (events.data ?? []) as EventRow[];
  const guestRows = eventRows.length > 0
    ? (((await admin.from("event_guests").select("event_id, response, party_size").eq("household_id", householdId).in("event_id", eventRows.map((row) => row.id)).limit(3000)).data ?? []) as GuestRow[])
    : [];
  const participantRows = eventRows.length > 0
    ? (((await admin.from("event_participants").select("event_id, member_id, response").eq("household_id", householdId).in("event_id", eventRows.map((row) => row.id)).limit(3000)).data ?? []) as ParticipantRow[])
    : [];
  const helperRows: HelperRow[] = ((helpers.data ?? []) as { member_id: string }[]).map((row) => ({ member_id: row.member_id, name: names.get(row.member_id) ?? "Your helper" }));

  // Weather speaks only where it changes a plan, and only where the household has weather on:
  // read the forecast only when there is an outing or outdoor washing for it to change.
  const weatherNeeds = await weatherCandidates(admin, householdId, eventRows, now);
  const forecast = weatherNeeds.outings || weatherNeeds.laundry.length > 0 ? await householdWeather(admin, householdId, { now, hours: 36 }) : null;
  const weather = forecast?.state === "ready" ? weatherNotices(forecast.windows, eventRows, weatherNeeds.laundry, directory, now, timeZone) : [];

  const wanted: Notice[] = [
    ...homesendNotices((items.data ?? []) as HomeSendRow[], directory, now, names),
    ...eventReplyNotices(eventRows, guestRows, directory, now),
    ...helperAbsenceNotices((absences.data ?? []) as AbsenceRow[], helperRows, directory, now, timeZone),
    ...orderNotices((orders.data ?? []) as OrderRow[], directory, now),
    ...weather,
    ...eventChangeNotices((changes.data ?? []) as EventChangeRow[], eventRows, participantRows, directory, names, now, timeZone),
  ];

  const result: NoticeSweep = { created: 0, updated: 0, resolved: 0 };
  const openByKey = new Map(((open.data ?? []) as Open[]).map((row) => [`${row.recipient_member_id}|${row.thread_key}`, row]));
  const closedKeys = new Set(((closed.data ?? []) as { recipient_member_id: string; thread_key: string; title: string; body: string }[]).map((row) => `${row.recipient_member_id}|${row.thread_key}|${row.title}|${row.body}`));
  const wantedKeys = new Set<string>();

  for (const notice of wanted) {
    const key = `${notice.recipientMemberId}|${notice.threadKey}`;
    wantedKeys.add(key);
    const words = reminderText(notice.title, notice.body, notice.priority === "high" ? "high" : "medium", format);
    const existing = openByKey.get(key);
    if (existing && existing.title === words.title.slice(0, 160) && existing.body === words.body.slice(0, 500)) continue;
    if (!existing && closedKeys.has(`${key}|${words.title.slice(0, 160)}|${words.body.slice(0, 500)}`)) continue;
    const created = await createNotification(
      admin,
      {
        householdId,
        decision: {
          kind: "notify",
          recipientMemberId: notice.recipientMemberId,
          type: "action",
          threadKey: notice.threadKey,
          updatesExistingThread: Boolean(existing),
          deliverAt: now,
          impact: words.body,
          action: notice.action,
          factors: { riskLevel: notice.priority === "high" ? "high" : "low", source: notice.sourceType },
        },
        title: words.title,
        body: words.body,
        category: notice.category,
        source: { type: notice.sourceType, id: notice.sourceId },
        copy: words.copy,
        reason: "reminder",
        refreshUnread: true,
        expiresAt: notice.expiresAt,
      },
      { now, ...(adapters ? { adapters } : {}) },
    );
    if (created) result[existing ? "updated" : "created"] += 1;
  }

  // What the records no longer say is resolved: the item was confirmed, the absence undone, the event over.
  for (const [key, row] of openByKey) {
    if (wantedKeys.has(key)) continue;
    const { error } = await admin.from("notifications").update({ status: "resolved", resolved_at: now.toISOString() }).eq("id", row.id).in("status", OPEN);
    if (!error) result.resolved += 1;
  }
  return result;
}

/**
 * The households whose records a notice reads from changed since `since`: the
 * delivery clock sweeps these, so nobody has to open the app for a notice to
 * land. Bounded, and read from each table's own "recently changed" index.
 */
export async function householdsWithNoticeChanges(admin: SupabaseClient, since: Date, limit = 200): Promise<string[]> {
  const iso = since.toISOString();
  const [items, guests, orders, absences, changes] = await Promise.all([
    admin.from("home_send_items").select("household_id").gte("updated_at", iso).limit(limit),
    admin.from("event_guests").select("household_id").gte("updated_at", iso).limit(limit),
    admin.from("orders").select("household_id").gte("updated_at", iso).limit(limit),
    admin.from("availability_exceptions").select("household_id").gte("created_at", iso).limit(limit),
    admin.from("family_event_changes").select("household_id").gte("created_at", iso).limit(limit),
  ]);
  const ids = new Set<string>();
  for (const result of [items, guests, orders, absences, changes]) for (const row of (result.data ?? []) as { household_id: string }[]) ids.add(row.household_id);
  return [...ids].slice(0, limit);
}

/** What a forecast could change: an outing in the next day and a half, or washing that has to dry outside by then. */
async function weatherCandidates(admin: SupabaseClient, householdId: string, events: readonly EventRow[], now: Date): Promise<{ outings: boolean; laundry: LaundryNeed[] }> {
  const soon = now.getTime() + 36 * 3_600_000;
  const outings = events.some((event) => event.kind === "outing" && event.status !== "cancelled" && new Date(event.starts_at).getTime() >= now.getTime() && new Date(event.starts_at).getTime() <= soon);
  const { data } = await admin
    .from("laundry_needs")
    .select("id, label, for_member_id, needed_by, state, state_as_of, drying_hours, requires_outdoor_drying")
    .eq("household_id", householdId)
    .eq("requires_outdoor_drying", true)
    .neq("state", "ready")
    .gte("needed_by", now.toISOString())
    .lte("needed_by", new Date(soon).toISOString())
    .limit(50);
  const laundry = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    label: row.label as string,
    forMemberId: (row.for_member_id as string | null) ?? null,
    neededBy: new Date(row.needed_by as string),
    state: row.state as LaundryState,
    stateAsOf: row.state_as_of ? new Date(row.state_as_of as string) : null,
    dryingHours: Number(row.drying_hours),
    requiresOutdoorDrying: true,
  }));
  return { outings, laundry };
}
