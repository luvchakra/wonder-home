"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import {
  cancelObligation,
  createObligation,
  recordAmount,
  removeTransaction,
  updateObligation,
} from "@wonderhome/core/finance/repository";
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
});

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

    await createObligation(supabase, {
      householdId: parsed.data.householdId,
      name: parsed.data.name,
      kind: parsed.data.kind,
      payee: parsed.data.payee || null,
      amountMinor: toMinorUnits(parsed.data.amount),
      currency: parsed.data.currency || null,
      dueOn: parsed.data.dueOn || null,
      recurrence: parsed.data.recurrence || null,
    });

    revalidatePath("/bills");
    return { notice: "Added. It’ll appear on the bills list from here." };
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
      householdId: parsed.data.householdId,
      obligationId: parsed.data.obligationId,
      periodLabel: parsed.data.periodLabel,
      amountMinor: Math.round(parsed.data.amount * 100),
      currency: parsed.data.currency,
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
