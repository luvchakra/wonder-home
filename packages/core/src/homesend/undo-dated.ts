import type { SupabaseClient } from "@supabase/supabase-js";
import { hasActiveHomeSendChanges, listHomeSendChanges, undoHomeSendChange } from "./changes";
import { markHomeSendUndone } from "./repository";

/**
 * Takes back the dated thing a HomeTalk reminder recorded through HomeSend
 * (2026-11-22, `homebrain/dated-reminder.ts`): "undo" after "a reminder for
 * Asmi's music exam on 24th" removes the exam or event as well as the
 * reminder. Only the kinds that path records — a calendar event, a school
 * item, an exam, a class note — each through the same service HomeSend's own
 * Undo uses (`home-send-actions.ts` `reverseChange`); anything else it made is
 * left for that screen. True when nothing of it is left live.
 */
export async function undoRecordedThing(supabase: SupabaseClient, input: { householdId: string; memberId: string; itemId: string }): Promise<boolean> {
  const { householdId, memberId, itemId } = input;
  const live = (await listHomeSendChanges(supabase, householdId)).filter((change) => change.intakeId === itemId && !change.undoneAt);
  for (const change of live) {
    if (change.changeType !== "created") return false;
    if (change.domain === "event") {
      const { setEventCancelled } = await import("../family/event-detail");
      await setEventCancelled(supabase, { householdId, eventId: change.entityId, cancelled: true });
    } else if (change.domain === "school_item") {
      const { cancelSchoolItem } = await import("../school/repository");
      await cancelSchoolItem(supabase, householdId, change.entityId);
    } else if (change.domain === "school_exam") {
      const { standDownSchoolRecord } = await import("../school/exams");
      await standDownSchoolRecord(supabase, { householdId, id: change.entityId, kind: "exam" });
    } else if (change.domain === "activity_item") {
      const { standDownActivityNote } = await import("../school/activities");
      await standDownActivityNote(supabase, { householdId, id: change.entityId });
    } else {
      return false;
    }
    await undoHomeSendChange(supabase, householdId, change.id, memberId);
  }
  if (!(await hasActiveHomeSendChanges(supabase, householdId, itemId))) await markHomeSendUndone(supabase, householdId, itemId);
  return true;
}
