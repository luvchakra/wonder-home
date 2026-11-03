"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auditChange } from "@wonderhome/core/api/audit";
import { toErrorBody } from "@wonderhome/core/api/errors";
import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { createClient } from "@wonderhome/core/db/server";
import { DEFAULT_AUTO_ADD_PERCENT } from "@wonderhome/core/homesend/auto-add";
import { addAnywayVerdict, CLEAR_ALL_LIMIT, type KeptBecause } from "@wonderhome/core/homesend/inbox-view";
import { archiveWaitingHomeSendItems, claimWaitingHomeSendItem, listHomeSendItems, PENDING_STATUSES, restoreHomeSendItems } from "@wonderhome/core/homesend/repository";
import { beginChecking } from "@wonderhome/core/hometalk/checking-questions";
import { loadAutoAddPercent } from "@wonderhome/core/household/auto-add-repository";
import { loadDirectAdd } from "@wonderhome/core/household/direct-add-repository";
import { isHouseholdAdmin, requireMembership } from "@wonderhome/core/identity/households";
import { log } from "@wonderhome/core/observability/logger";
import { hitRateLimit, rateLimitMessage } from "@wonderhome/core/security/rate-limit";

import { autoApplyHomeSendItem } from "./home-send-auto";
import { prepareReview } from "./home-send-review";

/**
 * HomeSend's one-tap clear actions (the owner, 2026-11-03): "Archive all"
 * and "Add all anyway", each behind its own confirm on the screen, both for
 * Admins only — checked here, on the server, never by the button being hidden.
 *
 * "Archive all" sets aside every waiting and unreadable item in one go: no
 * checks per item, because archiving adds nothing and deletes nothing, and
 * Undo (or Restore under Archived, for 30 days) puts each back.
 *
 * "Add all anyway" adds every waiting item through the same governed write a
 * person's confirm uses, even below the household's bar, each marked Checking
 * with how sure HomeSend was — so HomeTalk's questions still follow and each
 * has its own Undo. It passes every check but the ones no button may pass:
 * money and health wait while their "Add … directly" switch is off, paying
 * never happens, and what arrived by email from outside keeps waiting.
 * Unreadable items are never added. One run a minute per household.
 */

export type ClearState = {
  error?: string;
  done?: "archived" | "restored" | "added";
  /** What "Archive all" moved, so Undo puts back exactly these. */
  archivedIds?: string[];
  count?: number;
  added?: number;
  kept?: number;
  /** Kept behind a guard, by guard, for the sentence after "Add all anyway". */
  keptBecause?: Partial<Record<KeptBecause | "needs_you", number>>;
};

const householdSchema = z.object({ householdId: z.uuid() });
const idsSchema = z.object({ householdId: z.uuid(), itemIds: z.array(z.uuid()).min(1).max(CLEAR_ALL_LIMIT) });

function revalidateAll() {
  for (const path of ["/ai", "/home-send", "/bills", "/school", "/groceries", "/health", "/notifications", "/today"]) revalidatePath(path);
}

async function adminMembership(householdId: string) {
  const supabase = await createClient();
  const membership = await requireMembership(supabase, householdId);
  return { supabase, membership, isAdmin: isHouseholdAdmin(membership) };
}

const ADMINS_ONLY = "Only an Admin can clear HomeSend in one go.";

/** "Archive all": every waiting and unreadable item, set aside, restorable. */
export async function archiveAllHomeSendAction(_previous: ClearState, formData: FormData): Promise<ClearState> {
  const parsed = householdSchema.safeParse({ householdId: formData.get("householdId") });
  if (!parsed.success) return { error: "Please try again." };
  return archive(parsed.data.householdId, undefined, "all");
}

/** "Archive these": the ids chosen (a folded group, or what was selected). Any member may set aside what they can review. */
export async function archiveSelectedHomeSendAction(_previous: ClearState, formData: FormData): Promise<ClearState> {
  const ids = [...new Set(formData.getAll("itemId").filter((value): value is string => typeof value === "string"))];
  const parsed = idsSchema.safeParse({ householdId: formData.get("householdId"), itemIds: ids });
  if (!parsed.success) return { error: "Choose at least one." };
  return archive(parsed.data.householdId, parsed.data.itemIds, "selected");
}

async function archive(householdId: string, ids: string[] | undefined, scope: "all" | "selected"): Promise<ClearState> {
  try {
    const { supabase, membership, isAdmin } = await adminMembership(householdId);
    if (membership.memberType === "child") return { error: "Ask a grown-up to check these." };
    if (scope === "all" && !isAdmin) return { error: ADMINS_ONLY };
    const moved = await archiveWaitingHomeSendItems(supabase, householdId, { ids, limit: CLEAR_ALL_LIMIT });
    if (moved.length > 0) {
      await auditChange({ householdId, actorMemberId: membership.memberId, eventType: "homesend.archived_all", targetTable: "home_send_items", targetId: null, metadata: { count: moved.length, scope } });
    }
    revalidateAll();
    return { done: "archived", archivedIds: moved, count: moved.length };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}

/** The Undo after archiving: exactly what that tap moved, back where each was. */
export async function restoreArchivedHomeSendAction(_previous: ClearState, formData: FormData): Promise<ClearState> {
  const ids = [...new Set(formData.getAll("itemId").filter((value): value is string => typeof value === "string"))];
  const parsed = idsSchema.safeParse({ householdId: formData.get("householdId"), itemIds: ids });
  if (!parsed.success) return { error: "Please try again." };
  const { householdId, itemIds } = parsed.data;
  try {
    const { supabase, membership } = await adminMembership(householdId);
    if (membership.memberType === "child") return { error: "Ask a grown-up to check these." };
    const restored = await restoreHomeSendItems(supabase, householdId, itemIds);
    if (restored.length > 0) {
      await auditChange({ householdId, actorMemberId: membership.memberId, eventType: "homesend.restored_all", targetTable: "home_send_items", targetId: null, metadata: { count: restored.length } });
    }
    revalidateAll();
    return { done: "restored", count: restored.length };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}

/** "Add all anyway": every waiting item added as Checking, except behind the guards no button passes. */
export async function addAllAnywayHomeSendAction(_previous: ClearState, formData: FormData): Promise<ClearState> {
  const parsed = householdSchema.safeParse({ householdId: formData.get("householdId") });
  if (!parsed.success) return { error: "Please try again." };
  const { householdId } = parsed.data;
  try {
    const { supabase, membership, isAdmin } = await adminMembership(householdId);
    if (!isAdmin) return { error: ADMINS_ONLY };
    // The counter is service-role only; the grant covers this Admin's household alone.
    const admin = adminClientFor(adminGrant.householdAdmin(membership, "count one HomeSend add-all-anyway run"), householdId);
    if (!(await hitRateLimit(admin, "homesend.add_all", householdId))) return { error: rateLimitMessage("homesend.add_all") };

    const [items, directAdd, percent] = await Promise.all([
      listHomeSendItems(supabase, householdId),
      loadDirectAdd(supabase, householdId),
      loadAutoAddPercent(supabase, householdId).catch(() => DEFAULT_AUTO_ADD_PERCENT),
    ]);
    const waiting = items.filter((item) => PENDING_STATUSES.includes(item.status)).slice(0, CLEAR_ALL_LIMIT);
    const keptBecause: NonNullable<ClearState["keptBecause"]> = {};
    const keep = (because: KeptBecause | "needs_you") => {
      keptBecause[because] = (keptBecause[because] ?? 0) + 1;
    };
    let added = 0;
    // One at a time, oldest first: each is its own governed write, and one that fails never stops the rest.
    for (const item of [...waiting].reverse()) {
      const verdict = addAnywayVerdict(item, directAdd);
      if (!verdict.add) {
        keep(verdict.because);
        continue;
      }
      try {
        if (!item.classifiedKind) {
          keep("unclear");
          continue;
        }
        const review = await prepareReview(supabase, membership, item);
        // A document with several records is confirmed record by record, on its own form.
        if (review.plan || !(await claimWaitingHomeSendItem(supabase, householdId, item.id))) {
          keep("needs_you");
          continue;
        }
        const confidence = review.understanding?.score ?? item.understanding?.score ?? null;
        const applied = await autoApplyHomeSendItem(
          supabase,
          membership,
          { id: item.id, kind: item.classifiedKind, extracted: item.extracted, subject: review.subject },
          { decision: "added", checking: { unconfirmed: true, confidence, source: item.source } },
        );
        if (!applied) {
          keep("needs_you");
          continue;
        }
        added += 1;
        await auditChange({ householdId, actorMemberId: membership.memberId, eventType: "homesend.added_anyway", targetTable: "home_send_items", targetId: item.id, metadata: { kind: item.classifiedKind, confidence } });
        // Its questions follow it, to the person who sent it (14-061).
        await beginChecking(supabase, { householdId, itemId: item.id, recipientMemberId: item.createdByMemberId ?? membership.memberId, score: confidence, percent });
      } catch (thrown) {
        log.warn("homesend add all anyway: one item not added", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
        keep("needs_you");
      }
    }
    const kept = Object.values(keptBecause).reduce((sum, count) => sum + (count ?? 0), 0);
    await auditChange({ householdId, actorMemberId: membership.memberId, eventType: "homesend.added_all_anyway", targetTable: "home_send_items", targetId: null, metadata: { added, kept, ...keptBecause } });
    revalidateAll();
    return { done: "added", added, kept, keptBecause };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}
