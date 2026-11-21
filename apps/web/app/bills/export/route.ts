import { z } from "zod";

import { may } from "@wonderhome/core/billing/repository";
import { currencyExponent } from "@wonderhome/core/billing/money";
import { billsCsv, type CsvPayment } from "@wonderhome/core/finance/bills-csv";
import { isPartRow } from "@wonderhome/core/finance/part-payment";
import { listObligations } from "@wonderhome/core/finance/repository";
import { listMembers } from "@wonderhome/core/identity/households";

import { requireSession } from "../../_lib/session";

/**
 * "Download {year} as CSV" on Bills (11-025): the year's bills and the
 * payments for its months, for whoever may see Bills. Streamed back to the
 * request that asked, never stored, never cached.
 */
const query = z.object({ year: z.coerce.number().int().min(2000).max(2100) });

export async function GET(request: Request) {
  const parsed = query.safeParse({ year: new URL(request.url).searchParams.get("year") ?? new Date().getUTCFullYear() });
  const noStore = { "cache-control": "no-store, private" };
  if (!parsed.success) return new Response("Pick a year.", { status: 400, headers: noStore });
  const { supabase, membership, view } = await requireSession("/bills");
  const householdId = membership.household.id;
  if (!view.permissions.includes("finance.view")) return new Response("Not available.", { status: 403, headers: noStore });
  const year = parsed.data.year;
  const [entitlement, bills, members, history] = await Promise.all([
    may(supabase, householdId, "finance.bills"),
    listObligations(supabase, householdId),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    // `*` for the 11-019 columns; one year's months, bounded.
    supabase.from("obligation_history").select("*").eq("household_id", householdId).gte("period_label", `${year}-01`).lte("period_label", `${year}-12`).limit(2000),
  ]);
  if (!entitlement.allowed) return new Response("Not in your plan.", { status: 403, headers: noStore });
  const nameOf = (id: string | null) => (id ? (members.find((member) => member.id === id)?.displayName ?? null) : null);
  const payments: CsvPayment[] = ((history.data ?? []) as Record<string, unknown>[]).map((row) => ({
    obligationId: row.obligation_id as string,
    periodLabel: row.period_label as string,
    amountMinor: Number(row.amount_minor),
    currency: row.currency as string,
    paidOn: (row.paid_on as string | null) ?? null,
    paidWith: (row.paid_with as string | null) ?? null,
    partOfMinor: isPartRow(row as never) ? Number(row.due_minor) : null,
    payee: (row.payee as string | null) ?? null,
    kind: (row.kind as string | null) ?? null,
    owner: nameOf((row.owner_member_id as string | null) ?? null),
  }));
  const csv = billsCsv({
    year,
    exponentOf: currencyExponent,
    payments,
    bills: bills.map((bill) => ({ id: bill.id, name: bill.name, kind: bill.kind, payee: bill.payee, dueOn: bill.dueOn, status: bill.status, amountMinor: bill.amountMinor, currency: bill.currency, owner: nameOf(bill.responsibleMemberId), recurrence: bill.recurrence ?? null })),
  });
  return new Response(`﻿${csv}`, {
    headers: { ...noStore, "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="bills-${year}.csv"` },
  });
}
