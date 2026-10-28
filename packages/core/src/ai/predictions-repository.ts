import type { SupabaseClient } from "@supabase/supabase-js";

import { listConsumables } from "../commerce/repository";
import { listObligations } from "../finance/repository";
import { listMembers } from "../identity/households";
import { listSchoolItems } from "../school/repository";
import { lookAheadWindow, predictHousehold, type Prediction } from "./predictions";

/**
 * The household's look-ahead (story 14-008), read through the member's own
 * session: a domain the member cannot read is simply not predicted from,
 * and one that fails to load is left out rather than guessed at.
 */
export async function householdPredictions(
  supabase: SupabaseClient,
  householdId: string,
  ownerMemberId: string | null,
  now: Date = new Date(),
): Promise<Prediction[]> {
  const ahead = lookAheadWindow(now);
  const [consumables, obligations, schoolItems, members] = await Promise.all([
    listConsumables(supabase, householdId).catch(() => []),
    listObligations(supabase, householdId, { dueFrom: ahead.billsFrom, dueTo: ahead.billsTo }).catch(() => []),
    listSchoolItems(supabase, householdId, { dueFrom: ahead.schoolFrom, dueTo: ahead.schoolTo }).catch(() => []),
    listMembers(supabase, householdId, ownerMemberId).catch(() => []),
  ]);
  const names = new Map(members.map((member) => [member.id, member.displayName]));
  return predictHousehold({
    consumables,
    obligations,
    schoolItems,
    childName: (id) => names.get(id) ?? "your child",
    now,
  });
}
