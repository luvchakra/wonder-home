import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The household records HomeBrain's memory reads on HomeSend's behalf
 * (knowing instead of asking, 2026-11-20). Reads only, bounded, with the
 * caller's client (RLS, or a service client the caller already holds for
 * this one household). HomeSend itself never touches a domain table (X-003);
 * it asks HomeBrain what the household's records say.
 */

type Row = Record<string, unknown>;

export type BillOnRecord = { id: string; payee: string | null; amountMinor: number | null; currency: string | null; dueOn: string | null; status: string | null };

/** Bills with a payee, newest due first: what a payee's "usual" is worked out from. */
export async function listPayeeBills(client: SupabaseClient, householdId: string, options: { ids?: readonly string[]; limit?: number } = {}): Promise<BillOnRecord[]> {
  let query = client.from("obligations").select("id, payee, amount_minor, currency, due_on, status").eq("household_id", householdId).not("payee", "is", null);
  if (options.ids) {
    if (options.ids.length === 0) return [];
    query = query.in("id", [...options.ids]);
  }
  const { data, error } = await query.order("due_on", { ascending: false, nullsFirst: false }).limit(options.limit ?? 200);
  if (error) throw new Error(`listPayeeBills failed: ${error.code ?? "unknown"}`);
  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id as string,
    payee: (row.payee as string | null) ?? null,
    amountMinor: row.amount_minor === null || row.amount_minor === undefined ? null : Number(row.amount_minor),
    currency: (row.currency as string | null) ?? null,
    dueOn: (row.due_on as string | null) ?? null,
    status: (row.status as string | null) ?? null,
  }));
}

/** The child each of these school entries is for. */
export async function childrenOfSchoolItems(client: SupabaseClient, householdId: string, ids: readonly string[]): Promise<{ id: string; childMemberId: string }[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client.from("school_items").select("id, child_member_id").eq("household_id", householdId).in("id", [...ids]);
  if (error) throw new Error(`childrenOfSchoolItems failed: ${error.code ?? "unknown"}`);
  return ((data ?? []) as Row[]).filter((row) => typeof row.child_member_id === "string").map((row) => ({ id: row.id as string, childMemberId: row.child_member_id as string }));
}

/**
 * Who the household's records say writes to it (decision 4, 2026-11-20):
 * members' own email addresses, teachers' contacts, the children's schools,
 * and payees on bills. One wave of bounded reads.
 */
export async function readKnownCorrespondents(client: SupabaseClient, householdId: string): Promise<{ memberEmails: string[]; teacherContacts: string[]; schoolNames: string[]; payeeNames: string[] }> {
  const [members, teachers, schools, bills] = await Promise.all([
    client.from("household_member_emails").select("email").eq("household_id", householdId).limit(50),
    client.from("school_teachers").select("contact").eq("household_id", householdId).eq("active", true).not("contact", "is", null).limit(100),
    client.from("school_enrolments").select("school_name").eq("household_id", householdId).eq("active", true).limit(20),
    client.from("obligations").select("payee").eq("household_id", householdId).not("payee", "is", null).order("created_at", { ascending: false }).limit(200),
  ]);
  const column = (rows: unknown, name: string) =>
    [...new Set(((rows ?? []) as Row[]).map((row) => row[name]).filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
  return { memberEmails: column(members.data, "email"), teacherContacts: column(teachers.data, "contact"), schoolNames: column(schools.data, "school_name"), payeeNames: column(bills.data, "payee") };
}
