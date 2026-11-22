import type { SupabaseClient } from "@supabase/supabase-js";

import { addFamilyEvent } from "../calendar/add-event";
import { zonedTimeToUtcIso } from "../conversation/executor";
import { datedOperations, readsAboveTheBar, type IntakeUnderstanding, type ValidatedDecision } from "../homebrain/intake-api";
import { recordHomeSendChange } from "./changes";

export type NewKindResult = { added: { id: string; title: string; day: string }[]; duplicates: number };

/**
 * A kind nobody anticipated (14-082, owner 2026-11-22): before it is kept as a
 * household note, each dated thing the model's validated decision named (a
 * water shutdown, a warranty's last day) goes on the calendar as an all-day
 * entry, through HomeEvents' one door (`addFamilyEvent`, which says back what
 * is already there), with a `homesend_changes` row so Undo takes it off.
 * Above the household's bar it is confirmed, below it Checking. Nothing else
 * the decision names is executed here, and nothing that is money, health or
 * an action ever is: those capabilities are never dated operations.
 */
export async function recordNewKindDays(client: SupabaseClient, householdId: string, itemId: string, timeZone: string): Promise<NewKindResult> {
  const result: NewKindResult = { added: [], duplicates: 0 };
  const { data: item } = await client.from("home_send_items").select("understanding, created_by_member_id").eq("household_id", householdId).eq("id", itemId).maybeSingle();
  const decision = ((item?.understanding as IntakeUnderstanding | null) ?? null)?.decision as ValidatedDecision | undefined;
  const dated = datedOperations(decision);
  if (!decision || dated.length === 0) return result;
  let actor = (item?.created_by_member_id as string | null) ?? null;
  if (!actor) {
    const { data: household } = await client.from("households").select("owner_member_id").eq("id", householdId).maybeSingle();
    actor = (household?.owner_member_id as string | null) ?? null;
  }
  if (!actor) return result;
  for (const op of dated.slice(0, 6)) {
    const confidence = decision.operations[op.index]?.confidence ?? null;
    const title = op.reminder ? `Reminder: ${op.title}` : op.title;
    const added = await addFamilyEvent(
      client,
      {
        householdId,
        title,
        kind: "outing",
        startsAt: zonedTimeToUtcIso(op.day, 0, 0, timeZone),
        endsAt: zonedTimeToUtcIso(op.day, 23, 59, timeZone),
        ownerMemberId: actor,
        allDay: true,
      },
      { timeZone },
    );
    if (added.kind === "duplicate") {
      result.duplicates += 1;
      continue;
    }
    const above = await readsAboveTheBar(client, householdId, "event", confidence);
    await recordHomeSendChange(client, {
      householdId,
      intakeId: itemId,
      domain: "event",
      entityId: added.id,
      createdByMemberId: actor,
      auto: { state: above ? "confirmed" : "unconfirmed", confidence, source: "ai_decision" },
    });
    result.added.push({ id: added.id, title, day: op.day });
  }
  return result;
}
