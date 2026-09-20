"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { createObligation } from "@wonderhome/core/finance/repository";
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
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use YYYY-MM-DD." });

const schema = z
  .object({
    householdId: z.uuid(),
    name: z.string().trim().min(1, { error: "What's the bill?" }).max(160),
    kind: z.enum(OBLIGATION_KINDS),
    payee: z.string().trim().max(160).optional(),
    amountMinor: z.union([z.coerce.number().int().min(0), z.literal("")]).optional(),
    currency: z.union([z.string().regex(/^[A-Z]{3}$/), z.literal("")]).optional(),
    dueOn: z.union([isoDate, z.literal("")]).optional(),
    recurrence: z.enum(["monthly", "quarterly", "yearly", "one_off", ""]).optional(),
  })
  .refine((value) => (value.amountMinor ? Boolean(value.currency) : true), {
    error: "Add a currency along with the amount.",
    path: ["currency"],
  });

export async function createObligationAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({
    householdId: formData.get("householdId"),
    name: formData.get("name"),
    kind: formData.get("kind"),
    payee: formData.get("payee") || undefined,
    amountMinor: formData.get("amountMinor") || undefined,
    currency: formData.get("currency") || undefined,
    dueOn: formData.get("dueOn") || undefined,
    recurrence: formData.get("recurrence") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);

    await createObligation(supabase, {
      householdId: parsed.data.householdId,
      name: parsed.data.name,
      kind: parsed.data.kind,
      payee: parsed.data.payee || null,
      amountMinor: parsed.data.amountMinor === "" || parsed.data.amountMinor === undefined ? null : parsed.data.amountMinor,
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
