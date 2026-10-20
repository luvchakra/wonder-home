"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { CatCoat } from "@wonderhome/core/school/companion";

import { ApiError, toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";
import { checkInGoal, retireGoal, saveGoal, undoCheckIn } from "@wonderhome/core/school/goal-repository";
import { GOAL_PERIODS } from "@wonderhome/core/school/goals";
import { completeSchoolItem, reopenSchoolItem } from "@wonderhome/core/school/repository";

import type { ActionState } from "./actions";

/**
 * A child's goals (story 08-017): a guardian or an Admin sets, changes and
 * retires one (RLS decides who may); the child, or a guardian, ticks off
 * today or takes it back; and the child marks their own school work done
 * from their Home. The day is always the household's today, decided here,
 * never sent by the browser.
 */

async function inHousehold(householdId: string, work: (supabase: Awaited<ReturnType<typeof createClient>>, actor: { memberId: string }) => Promise<unknown>): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const actor = await requireMembership(supabase, householdId);
    await work(supabase, actor);
    revalidatePath("/");
    revalidatePath("/school");
    return { notice: "Saved." };
  } catch (error) {
    return { error: toErrorBody(error, "school").body.error.message };
  }
}

async function householdToday(supabase: Awaited<ReturnType<typeof createClient>>, householdId: string): Promise<string> {
  const { data } = await supabase.from("households").select("timezone").eq("id", householdId).maybeSingle();
  const timeZone = (data?.timezone as string | undefined) || "UTC";
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

const text = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);

const goalSchema = z.object({
  householdId: z.uuid(),
  childMemberId: z.uuid(),
  id: z.union([z.uuid(), z.literal("")]).optional(),
  title: z.string().trim().min(1, { error: "What is the goal?" }).max(120),
  kind: z.string().trim().min(1).max(40),
  emoji: z.string().trim().min(1).max(16),
  period: z.enum(GOAL_PERIODS),
  target: z.coerce.number().int().min(1).max(7).default(1),
  stars: z.coerce.number().int().min(1).max(5),
  reward: text(120),
  endsOn: z.union([z.iso.date(), z.literal("")]).optional(),
  sourceKind: z.enum(["activity", "school_item", ""]).optional(),
  sourceId: z.union([z.uuid(), z.literal("")]).optional(),
});

const value = (formData: FormData, name: string) => {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw : undefined;
};

/** A goal set with a child, added or changed. */
export async function saveGoalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = goalSchema.safeParse({
    householdId: value(formData, "householdId"),
    childMemberId: value(formData, "childMemberId"),
    id: value(formData, "id"),
    title: value(formData, "title"),
    kind: value(formData, "kind"),
    emoji: value(formData, "emoji"),
    period: value(formData, "period"),
    target: value(formData, "target") || 1,
    stars: value(formData, "stars"),
    reward: value(formData, "reward"),
    endsOn: value(formData, "endsOn"),
    sourceKind: value(formData, "sourceKind"),
    sourceId: value(formData, "sourceId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  const { sourceKind, sourceId, ...goal } = parsed.data;
  return inHousehold(parsed.data.householdId, async (supabase, actor) => {
    // A goal set from a class or a piece of school work names one of this child's own, read as this reader may.
    let source: { kind: "activity" | "school_item"; id: string } | null = null;
    if (sourceKind && sourceId) {
      const { data } = await supabase
        .from(sourceKind === "activity" ? "child_activities" : "school_items")
        .select("id")
        .eq("household_id", goal.householdId)
        .eq("child_member_id", goal.childMemberId)
        .eq("id", sourceId)
        .maybeSingle();
      if (!data) throw ApiError.badRequest("That class or piece of school work is not this child's.");
      source = { kind: sourceKind, id: sourceId };
    }
    // A goal met by finishing school work is a one-off.
    const period = source?.kind === "school_item" ? "once" : goal.period;
    await saveGoal(supabase, { ...goal, period, id: goal.id || null, endsOn: goal.endsOn || null, source, createdBy: actor.memberId });
  });
}

const ids = z.object({ householdId: z.uuid(), id: z.uuid() });

/** A goal the child is done with: retired, its stars kept. */
export async function retireGoalAction(input: { householdId: string; id: string }): Promise<ActionState> {
  const parsed = ids.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  return inHousehold(parsed.data.householdId, (supabase) => retireGoal(supabase, parsed.data));
}

const checkInSchema = z.object({ householdId: z.uuid(), goalId: z.uuid(), childMemberId: z.uuid(), done: z.boolean() });

/** Today ticked off for a goal, or taken back. */
export async function checkInGoalAction(input: { householdId: string; goalId: string; childMemberId: string; done: boolean }): Promise<ActionState> {
  const parsed = checkInSchema.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  return inHousehold(parsed.data.householdId, async (supabase, actor) => {
    const onDay = await householdToday(supabase, parsed.data.householdId);
    if (parsed.data.done) await checkInGoal(supabase, { ...parsed.data, onDay, checkedBy: actor.memberId });
    else await undoCheckIn(supabase, { householdId: parsed.data.householdId, goalId: parsed.data.goalId, onDay });
  });
}

const schoolSchema = z.object({ householdId: z.uuid(), id: z.uuid(), done: z.boolean() });

/** The child's own "I did it" for a piece of school work, or taking it back. */
export async function markSchoolWorkAction(input: { householdId: string; id: string; done: boolean }): Promise<ActionState> {
  const parsed = schoolSchema.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  return inHousehold(parsed.data.householdId, (supabase) =>
    parsed.data.done ? completeSchoolItem(supabase, parsed.data.id) : reopenSchoolItem(supabase, parsed.data.householdId, parsed.data.id),
  );
}

/** The child names their cat companion and picks its colour (story 08-018) — only ever their own, as RLS holds. */
export async function nameCompanionAction(input: { householdId: string; name: string; coat: string }): Promise<{ ok: true; name: string; coat: CatCoat } | { ok: false; error: string }> {
  const parsed = z.object({ householdId: z.uuid(), name: z.string().max(80), coat: z.string().max(20) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Try a shorter name." };
  try {
    const supabase = await createClient();
    const actor = await requireMembership(supabase, parsed.data.householdId);
    const { saveCompanion } = await import("@wonderhome/core/school/companion");
    const saved = await saveCompanion(supabase, { householdId: parsed.data.householdId, memberId: actor.memberId, name: parsed.data.name, coat: parsed.data.coat });
    revalidatePath("/");
    return { ok: true, ...saved };
  } catch (error) {
    if (error instanceof Error && error.message === "companion_name_empty") return { ok: false, error: "Type a name first." };
    return { ok: false, error: toErrorBody(error, "school").body.error.message };
  }
}
