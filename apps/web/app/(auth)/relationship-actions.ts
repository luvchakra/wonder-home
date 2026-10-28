"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { isHouseholdAdmin, listMembers, requireMembership } from "@wonderhome/core/identity/households";
import {
  checkRelationship,
  listRelationships,
  RELATION_MAX_LENGTH,
  removeRelationship,
  saveRelationship,
  type RelationshipProblem,
} from "@wonderhome/core/identity/relationships";

import type { ActionState } from "./actions";

/**
 * How the family is related (the owner, 2026-10-19). Admins only; the
 * database refuses anyone else too. A row is checked here against the
 * household's people and rows before it is written, so a refusal says why
 * in the person's own words: the problem's code and the names it is about
 * travel back, and the sheet words them from what the page translated.
 */
export type RelationshipState = ActionState & {
  problem?: { code: RelationshipProblem["code"] | "forbidden"; who?: string; whom?: string };
};

const saveSchema = z.object({
  householdId: z.uuid(),
  id: z.uuid().optional(),
  memberId: z.uuid(),
  relation: z.string().trim().min(1).max(RELATION_MAX_LENGTH),
  relatedMemberId: z.uuid(),
});

export async function saveRelationshipAction(_previous: RelationshipState, formData: FormData): Promise<RelationshipState> {
  const parsed = saveSchema.safeParse({
    householdId: formData.get("householdId"),
    id: formData.get("id") || undefined,
    memberId: formData.get("memberId"),
    relation: formData.get("relation"),
    relatedMemberId: formData.get("relatedMemberId"),
  });
  if (!parsed.success) {
    const relation = String(formData.get("relation") ?? "").trim();
    return { error: "Pick both people and how they are related.", problem: { code: relation.length > RELATION_MAX_LENGTH ? "relation_too_long" : "relation_missing" } };
  }
  const input = parsed.data;
  const supabase = await createClient();
  try {
    const actor = await requireMembership(supabase, input.householdId);
    if (!isHouseholdAdmin(actor)) return { error: "Only an Admin can change how the family is related.", problem: { code: "forbidden" } };
    const [members, rows] = await Promise.all([listMembers(supabase, input.householdId, null), listRelationships(supabase, input.householdId)]);
    const problem = checkRelationship(input, members, rows);
    if (problem) {
      const name = (id: string | undefined) => members.find((member) => member.id === id)?.displayName;
      const [who, whom] =
        problem.code === "age"
          ? [name(problem.elder), name(problem.younger)]
          : problem.code === "already_related"
            ? [name(problem.existing.memberId), name(problem.existing.relatedMemberId)]
            : problem.code === "not_family"
              ? [name(problem.memberId), undefined]
              : [name(input.memberId), name(input.relatedMemberId)];
      return { error: "That relationship cannot be kept.", problem: { code: problem.code, who, whom } };
    }
    await saveRelationship(supabase, { ...input, actorMemberId: actor.memberId });
  } catch (error) {
    return { error: toErrorBody(error, "household").body.error.message };
  }
  revalidatePath("/family");
  return { notice: "Saved." };
}

const removeSchema = z.object({ householdId: z.uuid(), id: z.uuid() });

/** Takes a row away; nothing else depends on it. */
export async function removeRelationshipAction(input: { householdId: string; id: string }): Promise<ActionState> {
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  const supabase = await createClient();
  try {
    const actor = await requireMembership(supabase, parsed.data.householdId);
    if (!isHouseholdAdmin(actor)) return { error: "Only an Admin can change how the family is related." };
    await removeRelationship(supabase, parsed.data);
  } catch (error) {
    return { error: toErrorBody(error, "household").body.error.message };
  }
  revalidatePath("/family");
  return {};
}
