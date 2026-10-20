"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { billType } from "@wonderhome/core/finance/bill-catalog";
import {
  cancelObligation,
  createObligation,
  payBillPeriod,
  recordAmount,
  removeTransaction,
  setBillPeriodAmount,
  updateObligation,
} from "@wonderhome/core/finance/repository";
import { retireBudget, saveBudget } from "@wonderhome/core/finance/budget-repository";
import { BUDGET_PERIODS } from "@wonderhome/core/finance/budgets";
import { OBLIGATION_KINDS } from "@wonderhome/core/finance/payments";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";

import type { ActionState } from "./actions";

/**
 * Adding a bill by hand — there was no "add a bill" anywhere before this, only
 * `prepareIntent` for a bill that already exists (imported by the email
 * connector, or from a provider). Every household with no connector — which
 * is every household today, since none is live — had no way onto this page's
 * data at all beyond the AI chat link.
 */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use YYYY-MM-DD." });

const obligationFields = z.object({
  householdId: z.uuid(),
  name: z.string().trim().min(1, { error: "What's the bill?" }).max(160),
  kind: z.enum(OBLIGATION_KINDS),
  payee: z.string().trim().max(160).optional(),
  // A household types 42.50, never 4250 (CLAUDE.md principle 22) — this is
  // the decimal major-unit amount; it's converted to minor units (paise)
  // right before the repository call, the one boundary that needs them.
  amount: z
    .union([z.coerce.number().min(0), z.literal("")])
    .optional(),
  currency: z.union([z.string().regex(/^[A-Z]{3}$/), z.literal("")]).optional(),
  dueOn: z.union([isoDate, z.literal("")]).optional(),
  recurrence: z
    .enum(["monthly", "quarterly", "yearly", "one_off", ""])
    .optional(),
  /** Which typical bill it is (`bill-catalog.ts`); empty for "something else". */
  billType: z.string().regex(/^[a-z_]{2,40}$/).refine((key) => billType(key) !== null).optional().or(z.literal("")),
  responsibleMemberId: z.union([z.uuid(), z.literal("")]).optional(),
});

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * "Earlier bills" on the add form (11-010): each a month, what it came to and
 * when it was paid, kept in the bill's history from the start. A row with no
 * month or no amount is left out; a bad one says which.
 */
function earlierBillsOf(formData: FormData): { rows: { periodLabel: string; amount: number; paidOn: string | null }[]; error?: string } {
  const rows: { periodLabel: string; amount: number; paidOn: string | null }[] = [];
  for (let index = 0; index < 24; index += 1) {
    const month = String(formData.get(`earlier.${index}.month`) ?? "").trim();
    const amount = String(formData.get(`earlier.${index}.amount`) ?? "").trim();
    const paidOn = String(formData.get(`earlier.${index}.paidOn`) ?? "").trim();
    if (!month && !amount) continue;
    if (!MONTH.test(month)) return { rows, error: "Pick the month each earlier bill was for." };
    const value = Number(amount.replace(/,/g, ""));
    if (!amount || !Number.isFinite(value) || value < 0) return { rows, error: "Say what each earlier bill came to." };
    if (paidOn && !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { rows, error: "Use a date for when it was paid." };
    rows.push({ periodLabel: month, amount: value, paidOn: paidOn || null });
  }
  return { rows };
}

function requiresCurrencyWithAmount() {
  return { error: "Add a currency along with the amount.", path: ["currency"] };
}

function toMinorUnits(amount: number | "" | undefined): number | null {
  return amount === "" || amount === undefined ? null : Math.round(amount * 100);
}

const schema = obligationFields.refine(
  (value) => (value.amount ? Boolean(value.currency) : true),
  requiresCurrencyWithAmount(),
);

export async function createObligationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = schema.safeParse({
    householdId: formData.get("householdId"),
    name: formData.get("name"),
    kind: formData.get("kind"),
    payee: formData.get("payee") || undefined,
    amount: formData.get("amount") || undefined,
    currency: formData.get("currency") || undefined,
    dueOn: formData.get("dueOn") || undefined,
    recurrence: formData.get("recurrence") || undefined,
    billType: formData.get("billType") || undefined,
    responsibleMemberId: formData.get("responsibleMemberId") || undefined,
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Please check the details above.",
    };
  }
  const earlier = earlierBillsOf(formData);
  if (earlier.error) return { error: earlier.error };
  if (earlier.rows.length > 0 && !parsed.data.currency) return { error: "Add a currency for the earlier bills." };

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);

    const created = await createObligation(supabase, {
      householdId: parsed.data.householdId,
      name: parsed.data.name,
      kind: parsed.data.kind,
      payee: parsed.data.payee || null,
      amountMinor: toMinorUnits(parsed.data.amount),
      currency: parsed.data.currency || null,
      dueOn: parsed.data.dueOn || null,
      recurrence: parsed.data.recurrence || null,
      billType: parsed.data.billType || null,
      responsibleMemberId: parsed.data.responsibleMemberId || null,
    });
    // The earlier bills, one history row each, in month order.
    for (const row of [...earlier.rows].sort((a, b) => a.periodLabel.localeCompare(b.periodLabel))) {
      await recordAmount(supabase, {
        householdId: parsed.data.householdId,
        obligationId: created.id,
        periodLabel: row.periodLabel,
        amountMinor: Math.round(row.amount * 100),
        currency: parsed.data.currency!,
        paidOn: row.paidOn,
        payee: parsed.data.payee || null,
        ownerMemberId: parsed.data.responsibleMemberId || null,
      });
    }

    revalidatePath("/bills");
    return {
      notice:
        earlier.rows.length > 0
          ? `Added, with ${earlier.rows.length} earlier ${earlier.rows.length === 1 ? "bill" : "bills"}. The coming months show under it, ready to fill in.`
          : "Added. The coming months show under it, ready to fill in.",
    };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "finance").body.error.message };
  }
}

const updateSchema = obligationFields
  .extend({ id: z.uuid() })
  .refine(
    (value) => (value.amount ? Boolean(value.currency) : true),
    requiresCurrencyWithAmount(),
  );

/** Changing a hand-typed bill's own details — the update half of `createObligationAction`. */
export async function updateObligationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    householdId: formData.get("householdId"),
    name: formData.get("name"),
    kind: formData.get("kind"),
    payee: formData.get("payee") || undefined,
    amount: formData.get("amount") || undefined,
    currency: formData.get("currency") || undefined,
    dueOn: formData.get("dueOn") || undefined,
    recurrence: formData.get("recurrence") || undefined,
    billType: formData.get("billType") || undefined,
    responsibleMemberId: formData.get("responsibleMemberId") || undefined,
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Please check the details above.",
    };
  }

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);

    await updateObligation(supabase, {
      id: parsed.data.id,
      householdId: parsed.data.householdId,
      name: parsed.data.name,
      kind: parsed.data.kind,
      payee: parsed.data.payee || null,
      amountMinor: toMinorUnits(parsed.data.amount),
      currency: parsed.data.currency || null,
      dueOn: parsed.data.dueOn || null,
      recurrence: parsed.data.recurrence || null,
      billType: parsed.data.billType || null,
      responsibleMemberId: parsed.data.responsibleMemberId || null,
    });

    revalidatePath("/bills");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "finance").body.error.message };
  }
}

const cancelSchema = z.object({ id: z.uuid(), householdId: z.uuid() });

/** Standing a bill down — a status flip, never a hard delete (CLAUDE.md principle 12). */
export async function cancelObligationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = cancelSchema.safeParse({
    id: formData.get("id"),
    householdId: formData.get("householdId"),
  });
  if (!parsed.success) return { error: "Something is missing." };

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await cancelObligation(supabase, parsed.data);
    revalidatePath("/bills");
    return { notice: "Cancelled." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "finance").body.error.message };
  }
}

const transactionSchema = z.object({
  householdId: z.uuid(),
  obligationId: z.uuid({ error: "Pick which bill this is for." }),
  periodLabel: z
    .string()
    .trim()
    .min(1, { error: "Say which period this is for, like 2026-09." })
    .max(40),
  amount: z.coerce.number().min(0, { error: "Add the amount." }),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, { error: "Use a 3-letter currency code, like INR." }),
  paidOn: z.union([z.iso.date(), z.literal("")]).optional(),
  payee: z.string().trim().max(160, { error: "Keep the payee under 160 characters." }).optional(),
  kind: z.string().trim().max(60, { error: "Keep the kind under 60 characters." }).optional(),
  ownerMemberId: z.union([z.uuid(), z.literal("")]).optional(),
});

/**
 * Recording what a bill actually came to for a period — the manual half of
 * the email connector's own import, and the thing "Add transaction" on the
 * Transactions tab is for. Wired to the same `recordAmount` an imported bill
 * already uses, so a hand-typed and an imported transaction get identical
 * anomaly review.
 */
export async function recordAmountAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = transactionSchema.safeParse({
    householdId: formData.get("householdId"),
    obligationId: formData.get("obligationId"),
    periodLabel: formData.get("periodLabel"),
    amount: formData.get("amount"),
    currency: formData.get("currency"),
    paidOn: formData.get("paidOn") || undefined,
    payee: formData.get("payee") || undefined,
    kind: formData.get("kind") || undefined,
    ownerMemberId: formData.get("ownerMemberId") || undefined,
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Please check the details above.",
    };
  }

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);

    const { anomaly } = await recordAmount(supabase, {
      payee: parsed.data.payee || null,
      kind: parsed.data.kind || null,
      ownerMemberId: parsed.data.ownerMemberId || null,
      householdId: parsed.data.householdId,
      obligationId: parsed.data.obligationId,
      periodLabel: parsed.data.periodLabel,
      amountMinor: Math.round(parsed.data.amount * 100),
      currency: parsed.data.currency,
      paidOn: parsed.data.paidOn === "" ? null : (parsed.data.paidOn ?? null),
    });

    revalidatePath("/bills");
    return {
      notice: anomaly
        ? "Recorded — this one looks unusual, so WonderHome flagged it for a look."
        : "Recorded.",
    };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "finance").body.error.message };
  }
}

const removeTransactionSchema = z.object({
  householdId: z.uuid(),
  obligationId: z.uuid(),
  periodLabel: z.string().trim().min(1).max(40),
});

/** Removing a mistaken transaction entry — the "remove" half of "Add transaction" (CLAUDE.md principle 12). */
export async function removeTransactionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = removeTransactionSchema.safeParse({
    householdId: formData.get("householdId"),
    obligationId: formData.get("obligationId"),
    periodLabel: formData.get("periodLabel"),
  });
  if (!parsed.success) return { error: "Something is missing." };

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await removeTransaction(supabase, parsed.data);
    revalidatePath("/bills");
    return { notice: "Removed." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "finance").body.error.message };
  }
}

const budgetSchema = z.object({
  householdId: z.uuid(),
  id: z.union([z.uuid(), z.literal("")]).optional(),
  category: z.enum(OBLIGATION_KINDS, { error: "Pick which kind of bill this budget is for." }),
  period: z.enum(BUDGET_PERIODS, { error: "Pick a month, a quarter or a year." }),
  // Decimal major units as typed (CLAUDE.md principle 22), converted once here.
  amount: z.coerce.number({ error: "Add the amount." }).positive({ error: "Add an amount above zero." }),
  currency: z.string().trim().regex(/^[A-Z]{3}$/, { error: "Pick a currency." }),
});

/** Setting or changing a budget for one kind of bill (story 11-007). Planning only — a budget never blocks a bill. */
export async function saveBudgetAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = budgetSchema.safeParse({
    householdId: formData.get("householdId"),
    id: formData.get("id") || undefined,
    category: formData.get("category"),
    period: formData.get("period"),
    amount: formData.get("amount"),
    currency: formData.get("currency"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await saveBudget(supabase, {
      householdId: parsed.data.householdId,
      id: parsed.data.id || undefined,
      category: parsed.data.category,
      period: parsed.data.period,
      limitMinor: Math.round(parsed.data.amount * 100),
      currency: parsed.data.currency,
    });
    revalidatePath("/bills");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "finance").body.error.message };
  }
}

/** Turning a budget off — kept, never deleted (CLAUDE.md principle 12). */
export async function retireBudgetAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = cancelSchema.safeParse({ id: formData.get("id"), householdId: formData.get("householdId") });
  if (!parsed.success) return { error: "Something is missing." };
  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await retireBudget(supabase, parsed.data);
    revalidatePath("/bills");
    return { notice: "Removed." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "finance").body.error.message };
  }
}

const periodSchema = z.object({
  householdId: z.uuid(),
  obligationId: z.uuid(),
  periodLabel: z.string().regex(MONTH),
  amount: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  currency: z.union([z.string().regex(/^[A-Z]{3}$/), z.literal("")]).optional(),
  paidOn: z.union([isoDate, z.literal("")]).optional(),
});

/**
 * Filling in one of a bill's periods (11-010): with a paid date it is paid
 * (the current one moves the bill on; a coming one is paid ahead); without,
 * the amount is what that period comes to. An empty amount clears it.
 */
export async function fillBillPeriodAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = periodSchema.safeParse({
    householdId: formData.get("householdId"),
    obligationId: formData.get("obligationId"),
    periodLabel: formData.get("periodLabel"),
    amount: formData.get("amount") ?? undefined,
    currency: formData.get("currency") || undefined,
    paidOn: formData.get("paidOn") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  const amountMinor = toMinorUnits(parsed.data.amount);
  const currency = parsed.data.currency || null;
  if (amountMinor !== null && !currency) return { error: "Add a currency along with the amount." };
  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);
    if (parsed.data.paidOn) {
      const { current } = await payBillPeriod(supabase, {
        householdId: parsed.data.householdId,
        obligationId: parsed.data.obligationId,
        periodLabel: parsed.data.periodLabel,
        paidOn: parsed.data.paidOn,
        amountMinor,
        currency,
      });
      revalidatePath("/bills");
      return { notice: current ? "Paid. The bill has moved on to its next month." : "Paid ahead. The bill will skip that month." };
    }
    await setBillPeriodAmount(supabase, {
      householdId: parsed.data.householdId,
      obligationId: parsed.data.obligationId,
      periodLabel: parsed.data.periodLabel,
      amountMinor,
      currency,
    });
    revalidatePath("/bills");
    return { notice: amountMinor === null ? "Cleared." : "Saved. Mark it paid here when you pay it." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "finance").body.error.message };
  }
}
