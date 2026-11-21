import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";

/**
 * Split a bill between adults; a year's spend by kind (11-026, the owner
 * 2026-11-21). A split is kept as each adult's share in basis points (100.00%
 * = 10000), so it fits every month's amount; the money each owes is worked
 * out per amount with the largest remainder, so the shares always add up to
 * the bill exactly, in its own currency's smallest unit (rule 22). Nothing is
 * paid or settled between people: it says who owes what.
 */

export type Share = { memberId: string; basisPoints: number };
export const MAX_SHARES = 8;

export function validShares(shares: readonly Share[]): boolean {
  if (shares.length < 2 || shares.length > MAX_SHARES) return false;
  if (new Set(shares.map((share) => share.memberId)).size !== shares.length) return false;
  if (shares.some((share) => !Number.isInteger(share.basisPoints) || share.basisPoints <= 0)) return false;
  return shares.reduce((sum, share) => sum + share.basisPoints, 0) === 10000;
}

/** Equal shares for these adults, the odd basis points to the first ones. */
export function equalShares(memberIds: readonly string[]): Share[] {
  const base = Math.floor(10000 / memberIds.length);
  const extra = 10000 - base * memberIds.length;
  return memberIds.map((memberId, index) => ({ memberId, basisPoints: base + (index < extra ? 1 : 0) }));
}

/** What each owes of this amount; the parts add up to it exactly. */
export function splitAmount(totalMinor: number, shares: readonly Share[]): { memberId: string; minor: number }[] {
  const exact = shares.map((share) => (totalMinor * share.basisPoints) / 10000);
  const parts = exact.map((value) => Math.floor(value));
  let left = totalMinor - parts.reduce((sum, part) => sum + part, 0);
  const order = exact.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    parts[index]! += 1;
    left -= 1;
  }
  return shares.map((share, index) => ({ memberId: share.memberId, minor: parts[index]! }));
}

export type KindYear = { kind: string; currency: string; minor: number; payments: number };

/** What was paid in the year, by kind and currency — never added across currencies. */
export function yearByKind(payments: readonly { kind: string | null; amountMinor: number; currency: string; periodLabel: string }[], year: number): KindYear[] {
  const totals = new Map<string, KindYear>();
  for (const payment of payments) {
    if (!payment.periodLabel.startsWith(`${year}-`) || !payment.kind) continue;
    const key = `${payment.kind}|${payment.currency}`;
    const row = totals.get(key) ?? { kind: payment.kind, currency: payment.currency, minor: 0, payments: 0 };
    row.minor += payment.amountMinor;
    row.payments += 1;
    totals.set(key, row);
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency) || b.minor - a.minor);
}

// ── Storage ───────────────────────────────────────────────────────────────

const missingTable = (code: string | undefined) => code === "42P01" || code === "PGRST205";

/** Every bill's split, by bill. None before the 11-026 migration. */
export async function listShares(supabase: SupabaseClient, householdId: string): Promise<Map<string, Share[]>> {
  const shares = new Map<string, Share[]>();
  const { data, error } = await supabase.from("obligation_shares").select("obligation_id, member_id, basis_points").eq("household_id", householdId).limit(1000);
  if (error) return shares;
  for (const row of (data ?? []) as { obligation_id: string; member_id: string; basis_points: number }[]) {
    const list = shares.get(row.obligation_id) ?? [];
    list.push({ memberId: row.member_id, basisPoints: Number(row.basis_points) });
    shares.set(row.obligation_id, list);
  }
  return shares;
}

/** Replaces a bill's split; an empty list takes the split off. */
export async function saveShares(supabase: SupabaseClient, input: { householdId: string; obligationId: string; shares: Share[] }): Promise<void> {
  if (input.shares.length > 0 && !validShares(input.shares)) throw ApiError.badRequest("Pick at least two adults, with shares that add up to 100%.");
  const { error: clearError } = await supabase.from("obligation_shares").delete().eq("household_id", input.householdId).eq("obligation_id", input.obligationId);
  if (clearError) {
    if (missingTable(clearError.code)) throw ApiError.badRequest("Splitting a bill isn't switched on yet.");
    if (clearError.code === "42501") throw ApiError.forbidden("Only a household administrator can split a bill.");
    throw new Error(`saveShares failed: ${clearError.code ?? "unknown"}`);
  }
  if (input.shares.length === 0) return;
  const { error } = await supabase
    .from("obligation_shares")
    .insert(input.shares.map((share) => ({ household_id: input.householdId, obligation_id: input.obligationId, member_id: share.memberId, basis_points: share.basisPoints })));
  if (error) {
    if (error.code === "23503") throw ApiError.badRequest("Pick adults from this household.");
    throw new Error(`saveShares failed: ${error.code ?? "unknown"}`);
  }
}
