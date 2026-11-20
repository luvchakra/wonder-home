import type { SupabaseClient } from "@supabase/supabase-js";

import type { HomeSendKind } from "../homesend/items";
import { learnFromAnswer } from "./rules-repository";

/**
 * Every answer teaches (HomeSend on its own, 2026-11-20). A person's tap on a
 * "Needs you" question that keeps an entry as recorded ("Looks right", "Add",
 * "Update", "They're different") says the entry is right, so what it was
 * recorded with becomes the household's rules, as a review pick does:
 *
 *   - the sender's area (sender → kind),
 *   - a bill's category (payee → bill kind),
 *   - who a school or class notice was for (sender → child, from the routed
 *     row), and who an event, bill or receipt was for where its row keeps one.
 *
 * Never from a default (nobody said so), never from a health document (a wrong
 * rule would show one person's health to another), never an amount, a date or
 * an approval (`rules.ts` refuses those anyway). Never throws: a rule is a
 * convenience, and failing to keep one changes nothing about the entry.
 */

/** The answers that keep an entry as recorded, by question source. */
const TEACHING_ANSWERS: Record<string, readonly string[]> = {
  homesend_check: ["looks_right"],
  homesend_add: ["add"],
  homesend_update: ["update"],
  homebrain_conflict: ["keep"],
};

/** Whether a person's answer to this question says the entry is right. A default never teaches. */
export function answerTeaches(source: string, answer: string, byDefault: boolean): boolean {
  if (byDefault) return false;
  return TEACHING_ANSWERS[source]?.includes(answer) ?? false;
}

const KINDS: ReadonlySet<string> = new Set(["bill", "school_item", "activity_item", "event", "grocery_item", "receipt"]);

/** Where a routed row keeps who it is for; tables with no member column are not read. */
const MEMBER_COLUMN: Record<string, { column: string; kinds: readonly HomeSendKind[] }> = {
  school_items: { column: "child_member_id", kinds: ["school_item"] },
};

type ItemRow = {
  classified_kind: string | null;
  extracted: Record<string, unknown> | null;
  sender_address: string | null;
  understanding: { provenance?: { sender?: string | null } | null } | null;
  routed_table: string | null;
  routed_id: string | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Teaches what a person's keeping answer endorsed. Returns how many rules were kept. */
export async function teachFromEntry(client: SupabaseClient, input: { householdId: string; itemId: string; memberId: string }): Promise<number> {
  try {
    const { data } = await client
      .from("home_send_items")
      .select("classified_kind, extracted, sender_address, understanding, routed_table, routed_id")
      .eq("household_id", input.householdId)
      .eq("id", input.itemId)
      .maybeSingle();
    const item = data as ItemRow | null;
    if (!item?.classified_kind || !KINDS.has(item.classified_kind)) return 0;
    const kind = item.classified_kind as HomeSendKind;
    const sender = text(item.sender_address) ?? text(item.understanding?.provenance?.sender);
    const teach = { householdId: input.householdId, memberId: input.memberId, kind, sender, itemId: input.itemId, source: "pick" as const };
    let kept = 0;
    if (sender) kept += await learnFromAnswer(client, { ...teach, field: "area", to: { text: kind } });
    const payee = text(item.extracted?.payee);
    const billKind = text(item.extracted?.billKind);
    if (kind === "bill" && payee && billKind) kept += await learnFromAnswer(client, { ...teach, field: "category", vendor: payee, to: { text: billKind } });
    const where = item.routed_table ? MEMBER_COLUMN[item.routed_table] : undefined;
    if (sender && where && item.routed_id && where.kinds.includes(kind)) {
      const { data: routed } = await client.from(item.routed_table!).select(where.column).eq("household_id", input.householdId).eq("id", item.routed_id).maybeSingle();
      const memberId = text((routed as Record<string, unknown> | null)?.[where.column]);
      if (memberId) kept += await learnFromAnswer(client, { ...teach, field: "person", to: { memberId, memberType: where.column === "child_member_id" ? "child" : null } });
    }
    return kept;
  } catch {
    return 0;
  }
}
