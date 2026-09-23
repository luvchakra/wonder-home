import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { ApiError } from "../api/errors";
import { invalidatesContext } from "../context/invalidation";
import { assessAbsence, type HelperResponsibility } from "./helpers";

/**
 * Backup services (story 07-008).
 *
 * When a helper is away and nobody in the household covers an outcome, the
 * household may know someone outside it who can: a cleaning service, a cook
 * who fills in, a laundry pick-up. This keeps that list, one row per
 * service, saying which outcomes it can cover. When an absence leaves an
 * outcome uncovered, the planner names the services that fit, and the
 * household arranges one with a single tap.
 *
 * Arranging it creates an ordinary service request, the same record 13-006
 * uses for any outside provider, with the household's next move on it. From
 * there it follows the path every service request follows. Nothing is booked
 * on anyone's behalf: no marketplace or booking provider is connected, so
 * the household still calls the service itself, and the record says so.
 *
 * What the planner looks at is outcomes and days, never the helper's work.
 * A covered absence is silent. Only an uncovered one needs a person.
 */

export type BackupService = {
  id: string;
  name: string;
  contact: string | null;
  /** Outcome keys this service can cover. */
  covers: string[];
  notes: string | null;
  active: boolean;
};

export type Absence = { memberId: string; onDate: string; reason: string | null };

export type CoverageItem = {
  date: string;
  helperMemberId: string;
  outcomeKey: string;
  outcomeName: string;
  /**
   * `arranged`: a cover request already exists for the outcome that day.
   * `service_available`: someone the household keeps can cover it.
   * `nobody`: neither, so the household is asked to decide.
   */
  state: "arranged" | "service_available" | "nobody";
  services: BackupService[];
};

/**
 * Which uncovered outcomes the coming absences leave, and who could cover
 * each. An outcome a household member already backs up is not listed. That
 * absence is handled, and handled is silent.
 */
export function planBackupCoverage(input: {
  absences: readonly Absence[];
  responsibilities: readonly (HelperResponsibility & { outcomeName: string; primaryMemberId: string | null })[];
  services: readonly BackupService[];
  /** `${outcomeKey}@${date}` for every cover request already open. */
  arranged: ReadonlySet<string>;
}): CoverageItem[] {
  const items: CoverageItem[] = [];
  const active = input.services.filter((service) => service.active);

  for (const absence of [...input.absences].sort((a, b) => a.onDate.localeCompare(b.onDate))) {
    const theirs = input.responsibilities.filter((responsibility) => responsibility.primaryMemberId === absence.memberId);
    const impact = assessAbsence({
      date: absence.onDate,
      responsibilities: theirs,
      scheduledOutcomeKeys: theirs.map((responsibility) => responsibility.outcomeKey),
    });
    for (const responsibility of [...impact.uncovered].sort((a, b) => a.priority - b.priority)) {
      const named = theirs.find((entry) => entry.outcomeKey === responsibility.outcomeKey)!;
      const services = active.filter((service) => service.covers.includes(responsibility.outcomeKey));
      items.push({
        date: absence.onDate,
        helperMemberId: absence.memberId,
        outcomeKey: responsibility.outcomeKey,
        outcomeName: named.outcomeName,
        state: input.arranged.has(coverKey(responsibility.outcomeKey, absence.onDate))
          ? "arranged"
          : services.length > 0
            ? "service_available"
            : "nobody",
        services,
      });
    }
  }
  return items;
}

export function coverKey(outcomeKey: string, date: string): string {
  return `${outcomeKey}@${date}`;
}

/** The words on a cover request, so the service-request list reads plainly. */
export function coverSubject(outcomeName: string, date: string): string {
  return `Cover ${outcomeName.toLowerCase()} on ${date}`.slice(0, 160);
}

// ---------------------------------------------------------------------------
// Reading and writing (Admin only, by RLS as well as here).
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function serviceFromRow(row: Row): BackupService {
  return {
    id: row.id as string,
    name: row.name as string,
    contact: (row.contact as string | null) ?? null,
    covers: (row.covers as string[] | null) ?? [],
    notes: (row.notes as string | null) ?? null,
    active: row.active === true,
  };
}

export async function listBackupServices(supabase: SupabaseClient, householdId: string): Promise<BackupService[]> {
  const { data, error } = await supabase
    .from("backup_services")
    .select("id, name, contact, covers, notes, active")
    .eq("household_id", householdId)
    .order("active", { ascending: false })
    .order("name");
  if (error) throw new Error(`listBackupServices failed: ${error.code ?? "unknown"}`);
  return ((data ?? []) as Row[]).map(serviceFromRow);
}

export type BackupServiceInput = { name: string; contact: string | null; covers: string[]; notes: string | null };

function writeError(error: { code?: string }, verb: string): Error {
  if (error.code === "42501") return ApiError.forbidden(`Only an Admin can ${verb} a backup service.`);
  if (error.code === "23505") return ApiError.conflict("There is already a backup service with that name.");
  if (error.code === "23514") return ApiError.badRequest("Check the service's name, contact and what it covers.");
  return new Error(`backup service ${verb} failed: ${error.code ?? "unknown"}`);
}

async function createBackupServiceImpl(
  supabase: SupabaseClient,
  input: BackupServiceInput & { householdId: string; createdByMemberId: string },
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("backup_services")
    .insert({
      household_id: input.householdId,
      name: input.name.trim(),
      contact: input.contact?.trim() || null,
      covers: [...new Set(input.covers)],
      notes: input.notes?.trim() || null,
      created_by_member_id: input.createdByMemberId,
    })
    .select("id")
    .single();
  if (error) throw writeError(error, "add");
  return { id: (data as Row).id as string };
}

async function updateBackupServiceImpl(
  supabase: SupabaseClient,
  input: BackupServiceInput & { householdId: string; id: string },
): Promise<void> {
  const { data, error } = await supabase
    .from("backup_services")
    .update({ name: input.name.trim(), contact: input.contact?.trim() || null, covers: [...new Set(input.covers)], notes: input.notes?.trim() || null })
    .eq("id", input.id)
    .eq("household_id", input.householdId)
    .select("id");
  if (error) throw writeError(error, "change");
  if ((data ?? []).length === 0) throw ApiError.notFound("That backup service is not in this household.");
}

/**
 * Retiring a service keeps it, and every cover request already made with
 * it keeps its provider's name. A hard delete would leave those requests
 * naming someone the household can no longer see. Bringing it back is the
 * same switch.
 */
async function setBackupServiceActiveImpl(
  supabase: SupabaseClient,
  input: { householdId: string; id: string; active: boolean },
): Promise<void> {
  const { data, error } = await supabase
    .from("backup_services")
    .update({ active: input.active })
    .eq("id", input.id)
    .eq("household_id", input.householdId)
    .select("id");
  if (error) throw writeError(error, input.active ? "restore" : "retire");
  if ((data ?? []).length === 0) throw ApiError.notFound("That backup service is not in this household.");
}

/**
 * Arranges cover: one service request for this outcome on this day, with
 * the service's name and contact and the household's move next. Asking
 * twice finds the first one; the database's unique index on
 * (household, outcome, day) for an open cover request makes that true even
 * for two taps at once.
 */
async function arrangeCoverImpl(
  supabase: SupabaseClient,
  input: { householdId: string; serviceId: string; outcomeKey: string; outcomeName: string; date: string },
): Promise<{ id: string; created: boolean }> {
  const { data: service, error: readError } = await supabase
    .from("backup_services")
    .select("id, name, contact, covers, active")
    .eq("id", input.serviceId)
    .eq("household_id", input.householdId)
    .maybeSingle();
  if (readError) throw new Error(`arrangeCover failed: ${readError.code ?? "unknown"}`);
  if (!service) throw ApiError.notFound("That backup service is not in this household.");
  const found = serviceFromRow(service as Row);
  if (!found.active) throw ApiError.conflict("That backup service is retired. Restore it first.");
  if (!found.covers.includes(input.outcomeKey)) throw ApiError.conflict(`${found.name} is not set up to cover that.`);

  const existing = await openCover(supabase, input.householdId, input.outcomeKey, input.date);
  if (existing) return { id: existing, created: false };

  const { data, error } = await supabase
    .from("service_requests")
    .insert({
      household_id: input.householdId,
      subject: coverSubject(input.outcomeName, input.date),
      provider_name: found.name,
      provider_contact: found.contact,
      scheduled_for: `${input.date}T00:00:00Z`,
      next_action: `Confirm with ${found.name} that they can cover it`.slice(0, 200),
      next_action_by: "household",
      backup_service_id: found.id,
      cover_outcome_key: input.outcomeKey,
      cover_on: input.date,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      const raced = await openCover(supabase, input.householdId, input.outcomeKey, input.date);
      if (raced) return { id: raced, created: false };
    }
    if (error.code === "42501") throw ApiError.forbidden("Only an Admin can arrange cover.");
    throw new Error(`arrangeCover failed: ${error.code ?? "unknown"}`);
  }
  return { id: (data as Row).id as string, created: true };
}

async function openCover(supabase: SupabaseClient, householdId: string, outcomeKey: string, date: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("service_requests")
    .select("id")
    .eq("household_id", householdId)
    .eq("cover_outcome_key", outcomeKey)
    .eq("cover_on", date)
    .neq("status", "cancelled")
    .limit(1);
  if (error) throw new Error(`arrangeCover failed: ${error.code ?? "unknown"}`);
  return ((data ?? []) as Row[])[0]?.id as string | undefined ?? null;
}

/** `${outcomeKey}@${date}` for every cover request still standing from `fromDate` on. */
export async function arrangedCover(supabase: SupabaseClient, householdId: string, fromDate: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("service_requests")
    .select("cover_outcome_key, cover_on")
    .eq("household_id", householdId)
    .not("cover_outcome_key", "is", null)
    .gte("cover_on", fromDate)
    .neq("status", "cancelled");
  if (error) throw new Error(`arrangedCover failed: ${error.code ?? "unknown"}`);
  return new Set(((data ?? []) as Row[]).map((row) => coverKey(row.cover_outcome_key as string, row.cover_on as string)));
}

export const createBackupService = invalidatesContext(createBackupServiceImpl, (_supabase, input) => input.householdId);
export const updateBackupService = invalidatesContext(updateBackupServiceImpl, (_supabase, input) => input.householdId);
export const setBackupServiceActive = invalidatesContext(setBackupServiceActiveImpl, (_supabase, input) => input.householdId);
export const arrangeCover = invalidatesContext(arrangeCoverImpl, (_supabase, input) => input.householdId);

/**
 * The coming fortnight's cover, read for a household — the same planner the
 * Househelper screen runs, for the API.
 */
export async function loadBackupCoverage(supabase: SupabaseClient, householdId: string, now: Date = new Date()): Promise<CoverageItem[]> {
  const today = now.toISOString().slice(0, 10);
  const until = new Date(now.getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
  const [members, exceptions, responsibilities, services, arranged] = await Promise.all([
    supabase.from("household_members").select("id, member_type").eq("household_id", householdId),
    supabase
      .from("availability_exceptions")
      .select("member_id, on_date, available, reason")
      .eq("household_id", householdId)
      .eq("available", false)
      .gte("on_date", today)
      .lte("on_date", until),
    supabase
      .from("responsibilities")
      .select("outcome_key, primary_member_id, backup_member_id, priority, playbook_items(name)")
      .eq("household_id", householdId),
    listBackupServices(supabase, householdId),
    arrangedCover(supabase, householdId, today),
  ]);
  for (const result of [members, exceptions, responsibilities]) {
    if (result.error) throw new Error(`loadBackupCoverage failed: ${result.error.code ?? "unknown"}`);
  }
  const helpers = new Set(((members.data ?? []) as Row[]).filter((row) => row.member_type === "helper").map((row) => row.id as string));
  return planBackupCoverage({
    absences: ((exceptions.data ?? []) as Row[])
      .filter((row) => helpers.has(row.member_id as string))
      .map((row) => ({ memberId: row.member_id as string, onDate: row.on_date as string, reason: (row.reason as string | null) ?? null })),
    responsibilities: ((responsibilities.data ?? []) as Row[]).map((row) => {
      const embedded = Array.isArray(row.playbook_items) ? row.playbook_items[0] : row.playbook_items;
      return {
        outcomeKey: row.outcome_key as string,
        outcomeName: ((embedded as { name?: string } | null)?.name as string | undefined) ?? (row.outcome_key as string).replace(/[._]/g, " "),
        primaryMemberId: (row.primary_member_id as string | null) ?? null,
        backupMemberId: (row.backup_member_id as string | null) ?? null,
        priority: Number(row.priority ?? 3),
      };
    }),
    services,
    arranged,
  });
}

const outcomeKeySchema = z.string().regex(/^[a-z][a-z0-9_.]{1,60}$/);

/** A new backup service, as the API accepts it. */
export const createBackupServiceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  contact: z.string().trim().max(120).nullable().optional(),
  covers: z.array(outcomeKeySchema).max(40),
  notes: z.string().trim().max(300).nullable().optional(),
});

/** Arranging one service to cover one outcome on one day. */
export const arrangeCoverSchema = z.object({
  serviceId: z.uuid(),
  outcomeKey: outcomeKeySchema,
  outcomeName: z.string().trim().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
