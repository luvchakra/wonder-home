import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { invalidatesContext } from "../context/invalidation";
import { GOAL_PERIODS, type ChildGoal, type GoalCheckIn, type GoalPeriod } from "./goals";

/**
 * A child's goals and the days they kept them (story 08-017):
 * `child_goals`, `child_goal_checkins`. The child, their guardians and Admins
 * read them; guardians and Admins set and change goals; the child or a
 * guardian checks a day in or takes it back (RLS). A goal is retired, never
 * deleted, so the stars its check-ins earned stay counted (rule 12).
 */

type Row = Record<string, unknown>;
const GOAL_COLUMNS = "id, child_member_id, title, kind, emoji, period, target, stars, reward, ends_on, active, source_kind, source_id";
/** Enough for years of a child ticking things off; stars are counted from these rows. */
const CHECKIN_LIMIT = 3000;

export type StoredGoal = ChildGoal & { active: boolean };

function toGoal(row: Row): StoredGoal {
  return {
    id: row.id as string,
    childMemberId: row.child_member_id as string,
    title: row.title as string,
    kind: row.kind as string,
    emoji: row.emoji as string,
    period: row.period as GoalPeriod,
    target: Number(row.target),
    stars: Number(row.stars),
    reward: (row.reward as string | null) ?? null,
    endsOn: (row.ends_on as string | null) ?? null,
    source: row.source_kind && row.source_id ? { kind: row.source_kind as "activity" | "school_item", id: row.source_id as string } : null,
    active: Boolean(row.active),
  };
}

function refused(error: { code?: string } | null, what: string): never {
  if (error?.code === "42501") throw ApiError.forbidden("Only the child's guardians or an Admin can change this.");
  if (error?.code === "23514") throw ApiError.badRequest("Please check the details above.");
  if (error?.code === "23505") throw ApiError.conflict("That day is already ticked off.");
  throw new Error(`${what} failed: ${error?.code ?? "unknown"}`);
}

/** Every goal, retired ones included (their check-ins still earned stars), for the children this viewer may see. */
export async function listGoals(supabase: SupabaseClient, householdId: string, childMemberId?: string): Promise<StoredGoal[]> {
  let query = supabase.from("child_goals").select(GOAL_COLUMNS).eq("household_id", householdId);
  if (childMemberId) query = query.eq("child_member_id", childMemberId);
  const { data, error } = await query.order("created_at").limit(500);
  if (error) throw new Error(`listGoals failed: ${error.code ?? "unknown"}`);
  return ((data ?? []) as Row[]).map(toGoal);
}

/** Postgres' "no such column": a database without the verification migration yet, read as before it. */
const NO_COLUMN = "42703";

/**
 * Reads check-in rows with whether each is verified, falling back to the
 * columns before verification existed (every row then counts, as it did).
 */
async function checkInRows(supabase: SupabaseClient, columns: string, scope: (query: ReturnType<ReturnType<SupabaseClient["from"]>["select"]>) => PromiseLike<{ data: unknown; error: { code?: string } | null }>): Promise<Row[]> {
  const first = await scope(supabase.from("child_goal_checkins").select(`${columns}, verified_at`));
  const { data, error } = first.error?.code === NO_COLUMN ? await scope(supabase.from("child_goal_checkins").select(columns)) : first;
  if (error) throw new Error(`child_goal_checkins read failed: ${error.code ?? "unknown"}`);
  return (data ?? []) as Row[];
}

const verifiedOf = (row: Row): boolean => !("verified_at" in row) || row.verified_at !== null;

export async function listCheckIns(supabase: SupabaseClient, householdId: string, childMemberId?: string): Promise<(GoalCheckIn & { childMemberId: string; checkedBy: string | null })[]> {
  const rows = await checkInRows(supabase, "goal_id, child_member_id, on_day, checked_by", (select) => {
    let query = select.eq("household_id", householdId);
    if (childMemberId) query = query.eq("child_member_id", childMemberId);
    return query.order("on_day", { ascending: false }).limit(CHECKIN_LIMIT);
  });
  return rows.map((row) => ({
    goalId: row.goal_id as string,
    childMemberId: row.child_member_id as string,
    onDay: row.on_day as string,
    verified: verifiedOf(row),
    checkedBy: (row.checked_by as string | null) ?? null,
  }));
}

/**
 * The stars a child has, for the header of every screen they open: their
 * check-ins' stars plus one for each piece of school work marked done. Two
 * small reads in one wave; zero on any failure, never a guess.
 */
export async function childStarCount(supabase: SupabaseClient, householdId: string, childMemberId: string): Promise<number> {
  const [checkIns, school] = await Promise.all([
    checkInRows(supabase, "child_goals(stars)", (select) => select.eq("household_id", householdId).eq("child_member_id", childMemberId).limit(CHECKIN_LIMIT)).then(
      (data) => ({ data, error: null }),
      () => ({ data: null, error: true }),
    ),
    supabase
      .from("school_items")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId)
      .eq("child_member_id", childMemberId)
      .in("status", ["done", "submitted"]),
  ]);
  if (checkIns.error || school.error) return 0;
  // A check-in still waiting for a grown-up earns nothing yet.
  const fromGoals = ((checkIns.data ?? []) as Row[]).filter(verifiedOf).reduce((sum, row) => {
    const goal = row.child_goals as { stars?: number } | { stars?: number }[] | null;
    const stars = Array.isArray(goal) ? goal[0]?.stars : goal?.stars;
    return sum + (Number(stars) || 0);
  }, 0);
  return fromGoals + (school.count ?? 0);
}

export type GoalInput = {
  householdId: string;
  childMemberId: string;
  /** Present to change a goal already on record. */
  id?: string | null;
  title: string;
  kind: string;
  emoji: string;
  period: GoalPeriod;
  target: number;
  stars: number;
  reward?: string | null;
  endsOn?: string | null;
  createdBy?: string | null;
  /** The class or school work it was set from; null for a goal of its own. */
  source?: { kind: "activity" | "school_item"; id: string } | null;
};

async function saveGoalImpl(supabase: SupabaseClient, input: GoalInput): Promise<{ id: string }> {
  const title = input.title.trim().slice(0, 120);
  if (!title) throw ApiError.badRequest("What is the goal?");
  if (!GOAL_PERIODS.includes(input.period)) throw ApiError.badRequest("How often should it count?");
  const target = input.period === "week" ? Math.min(7, Math.max(1, Math.round(input.target))) : 1;
  const row = {
    household_id: input.householdId,
    child_member_id: input.childMemberId,
    title,
    kind: input.kind.trim().slice(0, 40) || "other",
    emoji: input.emoji.trim().slice(0, 16) || "⭐",
    period: input.period,
    target,
    stars: Math.min(5, Math.max(1, Math.round(input.stars))),
    reward: input.reward?.trim().slice(0, 120) || null,
    ends_on: input.endsOn || null,
    source_kind: input.source?.kind ?? null,
    source_id: input.source?.id ?? null,
  };
  const query = input.id
    ? supabase.from("child_goals").update(row).eq("id", input.id).eq("household_id", input.householdId).select("id").single()
    : supabase
        .from("child_goals")
        .insert({ ...row, created_by: input.createdBy ?? null })
        .select("id")
        .single();
  const { data, error } = await query;
  if (error || !data) refused(error, "saveGoal");
  return { id: (data as Row).id as string };
}

async function retireGoalImpl(supabase: SupabaseClient, input: { householdId: string; id: string }): Promise<void> {
  const { data, error } = await supabase.from("child_goals").update({ active: false }).eq("id", input.id).eq("household_id", input.householdId).select("id");
  if (error) refused(error, "retireGoal");
  if (!data || data.length === 0) throw ApiError.forbidden("Only the child's guardians or an Admin can change this.");
}

/**
 * Ticks off a day for a goal. Ticking a day already ticked is not an error:
 * it is already done. The child's own tick waits for a grown-up; a guardian's
 * or an Admin's (`verified`) counts at once — RLS decides who may claim that.
 */
async function checkInGoalImpl(
  supabase: SupabaseClient,
  input: { householdId: string; goalId: string; childMemberId: string; onDay: string; checkedBy: string; verified?: boolean },
): Promise<void> {
  const row = {
    household_id: input.householdId,
    goal_id: input.goalId,
    child_member_id: input.childMemberId,
    on_day: input.onDay,
    checked_by: input.checkedBy,
  };
  const verified = input.verified ? { verified_at: new Date().toISOString(), verified_by: input.checkedBy } : {};
  let { error } = await supabase.from("child_goal_checkins").insert({ ...row, ...verified });
  // Before the verification migration there is nothing to wait on: the tick counts as it always did.
  if (error?.code === "PGRST204" || error?.code === NO_COLUMN) ({ error } = await supabase.from("child_goal_checkins").insert(row));
  if (error && error.code !== "23505") refused(error, "checkInGoal");
}

/**
 * A grown-up's answer to a child's "Done": yes verifies it (it earns its
 * stars from now on), "not yet" takes the tick back so the child can try
 * again. Only a guardian or an Admin may (RLS); one already answered is left.
 */
async function answerCheckInImpl(
  supabase: SupabaseClient,
  input: { householdId: string; goalId: string; onDay: string; verifiedBy: string; approve: boolean },
): Promise<void> {
  const scope = supabase.from("child_goal_checkins");
  const { error } = input.approve
    ? await scope.update({ verified_at: new Date().toISOString(), verified_by: input.verifiedBy }).eq("household_id", input.householdId).eq("goal_id", input.goalId).eq("on_day", input.onDay).is("verified_at", null)
    : await scope.delete().eq("household_id", input.householdId).eq("goal_id", input.goalId).eq("on_day", input.onDay).is("verified_at", null);
  if (error) refused(error, "answerCheckIn");
}

async function undoCheckInImpl(supabase: SupabaseClient, input: { householdId: string; goalId: string; onDay: string }): Promise<void> {
  const { error } = await supabase.from("child_goal_checkins").delete().eq("household_id", input.householdId).eq("goal_id", input.goalId).eq("on_day", input.onDay);
  if (error) refused(error, "undoCheckIn");
}

export const saveGoal = invalidatesContext(saveGoalImpl, (_s, input) => input.householdId);
export const retireGoal = invalidatesContext(retireGoalImpl, (_s, input) => input.householdId);
export const checkInGoal = invalidatesContext(checkInGoalImpl, (_s, input) => input.householdId);
export const undoCheckIn = invalidatesContext(undoCheckInImpl, (_s, input) => input.householdId);
export const answerCheckIn = invalidatesContext(answerCheckInImpl, (_s, input) => input.householdId);
