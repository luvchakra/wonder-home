"use server";

import { after } from "next/server";
import { z } from "zod";

import { auditChange } from "@wonderhome/core/api/audit";
import { createClient } from "@wonderhome/core/db/server";
import { isOfferedAnswer } from "@wonderhome/core/hometalk/needs-you";
import { applyNeedsYouAnswer } from "@wonderhome/core/hometalk/needs-you-answer";
import { closeNeedsYou, getNeedsYou } from "@wonderhome/core/hometalk/needs-you-repository";
import { requireMembership } from "@wonderhome/core/identity/households";
import { log } from "@wonderhome/core/observability/logger";
import { undoHomeSendDocumentAction } from "./home-send-actions";
import { reconcileRemindersNow } from "../_lib/reminders";

export type NeedsYouState = { result?: "done" | "settled" | "failed"; id?: string };

const answerSchema = z.object({
  householdId: z.uuid(),
  id: z.uuid(),
  answer: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/),
});

/**
 * One tap on a "Needs you" question (2026-11-14). The question is read as the
 * member (RLS: their own, or the Admins' when they are one), the answer must
 * be one it offered, and what it does goes through the same switch the
 * 24-hour default uses (`hometalk/needs-you-answer.ts`), in the member's own
 * name. "Not right" runs the same Undo the HomeSend screen offers. Audited
 * `needs_you.answered`.
 */
export async function answerNeedsYouAction(_previous: NeedsYouState, formData: FormData): Promise<NeedsYouState> {
  const parsed = answerSchema.safeParse({ householdId: formData.get("householdId"), id: formData.get("id"), answer: formData.get("answer") });
  if (!parsed.success) return { result: "failed" };
  const { householdId, id, answer } = parsed.data;
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    const item = await getNeedsYou(supabase, householdId, id);
    if (!item) return { result: "settled", id };
    if (!isOfferedAnswer(item, answer)) return { result: "failed", id };
    const now = new Date();

    let outcome = await applyNeedsYouAnswer(supabase, item, answer, { byDefault: false, actor: { householdId, memberId: membership.memberId }, now });
    if (outcome === "undo") {
      const undo = new FormData();
      undo.set("householdId", householdId);
      undo.set("itemId", item.subjectId);
      const undone = await undoHomeSendDocumentAction({}, undo);
      outcome = undone.error ? "settled" : "done";
    }
    if (outcome === "unhandled") return { result: "failed", id };

    const closed = await closeNeedsYou(supabase, id, { status: outcome === "done" ? "answered" : "withdrawn", answer: outcome === "done" ? answer : null, memberId: membership.memberId, now });
    if (closed && outcome === "done") {
      await auditChange({ householdId, actorMemberId: membership.memberId, eventType: "needs_you.answered", targetTable: item.subjectTable, targetId: item.subjectId, metadata: { source: item.source, answer, question: id } });
    }
    // A confirmed entry's reminders lose "not yet confirmed" now, not at the next clock pass.
    if (item.source === "homesend_check") after(() => reconcileRemindersNow(householdId, { force: true }));
    // No revalidatePath: any revalidation in an action re-draws the page the tap came from, which would take the
    // row (and its "Done") away before it is read. The row says the outcome; every page showing the list renders
    // per request, so it is fresh on the next visit.
    return { result: outcome === "done" ? "done" : "settled", id };
  } catch (thrown) {
    log.warn("answering a needs-you question failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
    return { result: "failed", id };
  }
}
