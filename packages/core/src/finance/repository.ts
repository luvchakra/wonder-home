import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import type { HomeAssessment } from "../home/assessment";
import type {
  ExistingObligationImport,
  ImportedObligation,
  ObligationSyncPlan,
} from "./email-connector";
import {
  assessObligation,
  detectAnomaly,
  type Obligation,
  type ObligationKind,
  type ObligationStatus,
  nextDueDate,
} from "./payments";
import { invalidatesContext } from "../context/invalidation";

/**
 * Reading bills and preparing payments (module 11).
 *
 * `prepareIntent` records what somebody is about to approve and stops. It does
 * not reach a provider, and there is no code path here that does — no payment
 * provider is configured, and per CLAUDE.md none will be considered live until
 * credentials, authentication, contract behaviour and integration tests exist.
 */

type Row = Record<string, unknown>;

export async function listObligations(
  supabase: SupabaseClient,
  householdId: string,
): Promise<Obligation[]> {
  const { data, error } = await supabase
    .from("obligations")
    .select(
      "id, name, kind, payee, amount_minor, currency, due_on, responsible_member_id, status, requires_review, updated_at",
    )
    .eq("household_id", householdId)
    .order("due_on", { ascending: true, nullsFirst: false });

  if (error)
    throw new Error(`listObligations failed: ${error.code ?? "unknown"}`);

  return (data ?? []).map((row: Row) => ({
    id: row.id as string,
    name: row.name as string,
    kind: row.kind as ObligationKind,
    payee: (row.payee as string | null) ?? null,
    amountMinor: row.amount_minor === null ? null : Number(row.amount_minor),
    currency: (row.currency as string | null) ?? null,
    dueOn: (row.due_on as string | null) ?? null,
    responsibleMemberId: (row.responsible_member_id as string | null) ?? null,
    status: row.status as ObligationStatus,
    requiresReview: row.requires_review as boolean,
    updatedAt: (row.updated_at as string | null) ?? null,
  }));
}

export type CreateObligationInput = {
  householdId: string;
  name: string;
  kind: ObligationKind;
  payee?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  dueOn?: string | null;
  recurrence?: "monthly" | "quarterly" | "yearly" | "one_off" | null;
  responsibleMemberId?: string | null;
};

/**
 * A bill typed in by hand — "member_stated", the table's own default source,
 * same standing as the email connector's "imported" or a provider's own feed.
 */
async function createObligationImpl(
  supabase: SupabaseClient,
  input: CreateObligationInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("obligations")
    .insert({
      household_id: input.householdId,
      name: input.name,
      kind: input.kind,
      payee: input.payee ?? null,
      amount_minor: input.amountMinor ?? null,
      currency: input.currency ?? null,
      due_on: input.dueOn ?? null,
      recurrence: input.recurrence ?? null,
      responsible_member_id: input.responsibleMemberId ?? null,
      status: "received",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501")
      throw ApiError.forbidden(
        "Only a household administrator can add a bill.",
      );
    if (error.code === "23503")
      throw ApiError.badRequest("That member is not part of this household.");
    throw new Error(`createObligation failed: ${error.code ?? "unknown"}`);
  }

  return { id: (data as Row).id as string };
}

export type UpdateObligationInput = {
  id: string;
  householdId: string;
  name?: string;
  kind?: ObligationKind;
  payee?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  dueOn?: string | null;
  recurrence?: "monthly" | "quarterly" | "yearly" | "one_off" | null;
};

/** Changing what a hand-typed bill says — the other half of `createObligation` (CLAUDE.md's "every entity can be added, updated and removed"). */
async function updateObligationImpl(
  supabase: SupabaseClient,
  input: UpdateObligationInput,
): Promise<void> {
  const patch: Row = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.payee !== undefined) patch.payee = input.payee;
  if (input.amountMinor !== undefined) patch.amount_minor = input.amountMinor;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.dueOn !== undefined) patch.due_on = input.dueOn;
  if (input.recurrence !== undefined) patch.recurrence = input.recurrence;

  const { error } = await supabase
    .from("obligations")
    .update(patch)
    .eq("id", input.id)
    .eq("household_id", input.householdId);

  if (error) {
    if (error.code === "42501")
      throw ApiError.forbidden(
        "Only a household administrator can change a bill.",
      );
    throw new Error(`updateObligation failed: ${error.code ?? "unknown"}`);
  }
}

/**
 * Standing down a bill that should not be tracked any more — a status flip,
 * never a hard delete (CLAUDE.md principle 12): its payment/transaction
 * history stays intact and explained rather than orphaned.
 */
async function cancelObligationImpl(
  supabase: SupabaseClient,
  input: { id: string; householdId: string },
): Promise<void> {
  const { error } = await supabase
    .from("obligations")
    .update({ status: "cancelled" })
    .eq("id", input.id)
    .eq("household_id", input.householdId);

  if (error) {
    if (error.code === "42501")
      throw ApiError.forbidden(
        "Only a household administrator can cancel a bill.",
      );
    throw new Error(`cancelObligation failed: ${error.code ?? "unknown"}`);
  }
}

/**
 * Puts a cancelled bill back the way it was — HomeSend's undo of a
 * cancellation it made (Wave 3 §10). Only ever from `cancelled`.
 */
async function restoreObligationImpl(
  supabase: SupabaseClient,
  input: { id: string; householdId: string; status: string },
): Promise<void> {
  const { error } = await supabase
    .from("obligations")
    .update({ status: input.status })
    .eq("id", input.id)
    .eq("household_id", input.householdId)
    .eq("status", "cancelled");

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can change a bill.");
    throw new Error(`restoreObligation failed: ${error.code ?? "unknown"}`);
  }
}

/** Intents that are approved or in flight, so a settled bill stays quiet. */
async function arrangedObligationIds(
  supabase: SupabaseClient,
  householdId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("payment_intents")
    .select("obligation_id, status")
    .eq("household_id", householdId)
    .in("status", ["approved", "executing", "succeeded"]);

  if (error)
    throw new Error(`arrangedObligationIds failed: ${error.code ?? "unknown"}`);
  return new Set((data ?? []).map((row: Row) => row.obligation_id as string));
}

export type FinanceAgenda = {
  bills: HomeAssessment[];
  anomalies: HomeAssessment[];
  checked: number;
};

export async function financeAgenda(
  supabase: SupabaseClient,
  householdId: string,
  options: { now?: Date } = {},
): Promise<FinanceAgenda> {
  const now = options.now ?? new Date();

  const [obligations, arranged, anomalyRows] = await Promise.all([
    listObligations(supabase, householdId),
    arrangedObligationIds(supabase, householdId),
    supabase
      .from("spend_anomalies")
      .select(
        "id, obligation_id, amount_minor, currency, baseline_minor, baseline_label, ratio",
      )
      .eq("household_id", householdId)
      .eq("status", "open"),
  ]);

  const byId = new Map(
    obligations.map((obligation) => [obligation.id, obligation]),
  );

  const anomalies: HomeAssessment[] = (
    (anomalyRows.data as Row[] | null) ?? []
  ).map((row) => {
    const obligation = byId.get(row.obligation_id as string);
    return {
      subjectKey: `anomaly.${row.id as string}`,
      title: obligation?.name ?? "A bill",
      status: "at_risk" as const,
      riskLevel: "medium" as const,
      notable: true,
      // The comparison travels with the finding: an anomaly a household cannot
      // check is an accusation rather than a question.
      reason: `${Number(row.ratio)}× the ${row.baseline_label as string}.`,
      action: { action: "review_bill", target: row.id as string },
      dueOn: obligation?.dueOn ?? null,
    };
  });

  return {
    bills: obligations
      .map((obligation) =>
        assessObligation(obligation, {
          now,
          hasApprovedIntent: arranged.has(obligation.id),
        }),
      )
      .filter((assessment) => assessment.notable),
    anomalies,
    checked: obligations.length,
  };
}

/**
 * Records a bill's amount for a period and raises an anomaly if it is unusual.
 *
 * The anomaly is written as a review, never as a block: the payment path is
 * untouched by it, which is what the acceptance criterion requires.
 */
async function recordAmountImpl(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    obligationId: string;
    periodLabel: string;
    amountMinor: number;
    currency: string;
    /** When the household actually paid it — distinct from the period it covers. */
    paidOn?: string | null;
    /** Who it was paid to, when the household says; null falls back to the bill's payee. */
    payee?: string | null;
    /** What kind of payment it was, in the household's words; null falls back to the bill's kind. */
    kind?: string | null;
    /** Whose payment it was to make; null falls back to the bill's responsible member. */
    ownerMemberId?: string | null;
  },
): Promise<{ anomaly: boolean }> {
  const { error } = await supabase.from("obligation_history").upsert(
    {
      household_id: input.householdId,
      obligation_id: input.obligationId,
      period_label: input.periodLabel,
      amount_minor: input.amountMinor,
      currency: input.currency,
      paid_on: input.paidOn ?? null,
      payee: input.payee ?? null,
      kind: input.kind ?? null,
      owner_member_id: input.ownerMemberId ?? null,
    },
    { onConflict: "obligation_id,period_label" },
  );

  if (error) {
    if (error.code === "42501")
      throw ApiError.forbidden("You cannot record amounts for this household.");
    throw new Error(`recordAmount failed: ${error.code ?? "unknown"}`);
  }

  const { data: history, error: historyError } = await supabase
    .from("obligation_history")
    .select("period_label, amount_minor")
    .eq("obligation_id", input.obligationId)
    .neq("period_label", input.periodLabel);

  if (historyError)
    throw new Error(`recordAmount failed: ${historyError.code ?? "unknown"}`);

  const anomaly = detectAnomaly({
    amountMinor: input.amountMinor,
    currency: input.currency,
    history: (history ?? []).map((row: Row) => ({
      periodLabel: row.period_label as string,
      amountMinor: Number(row.amount_minor),
    })),
  });

  if (!anomaly) return { anomaly: false };

  await supabase.from("spend_anomalies").upsert(
    {
      household_id: input.householdId,
      obligation_id: input.obligationId,
      amount_minor: anomaly.amountMinor,
      currency: anomaly.currency,
      baseline_minor: anomaly.baselineMinor,
      baseline_label: anomaly.baselineLabel,
      ratio: anomaly.ratio,
      status: "open",
    },
    { onConflict: "obligation_id,baseline_label,amount_minor" },
  );

  return { anomaly: true };
}

/**
 * "Mark as paid" (story 23-005): the household says this bill is settled.
 *
 * The payment is kept in the bill's history when its amount is known, and a
 * recurring bill moves on to its next due date rather than being closed —
 * next month's electricity bill is the same bill, not a new one to re-enter.
 * A one-off bill is marked paid. Either way, the reminder about it resolves
 * on its own, because its source no longer needs anyone.
 */
async function markObligationPaidImpl(
  supabase: SupabaseClient,
  input: { householdId: string; obligationId: string; paidOn: string },
): Promise<{ nextDueOn: string | null }> {
  const { data, error } = await supabase
    .from("obligations")
    .select("id, status, due_on, recurrence, amount_minor, currency, payee, kind, responsible_member_id")
    .eq("id", input.obligationId)
    .eq("household_id", input.householdId)
    .maybeSingle();
  if (error) throw new Error(`markObligationPaid failed: ${error.code ?? "unknown"}`);
  if (!data) throw ApiError.notFound("That bill is no longer here.");
  const bill = data as Row;
  if (!["expected", "received", "scheduled", "overdue"].includes(bill.status as string)) {
    throw ApiError.badRequest("That bill is already settled.");
  }

  const dueOn = (bill.due_on as string | null) ?? null;
  if (bill.amount_minor !== null && bill.currency) {
    await recordAmountImpl(supabase, {
      householdId: input.householdId,
      obligationId: input.obligationId,
      periodLabel: (dueOn ?? input.paidOn).slice(0, 7),
      amountMinor: Number(bill.amount_minor),
      currency: bill.currency as string,
      paidOn: input.paidOn,
      payee: (bill.payee as string | null) ?? null,
      kind: (bill.kind as string | null) ?? null,
      ownerMemberId: (bill.responsible_member_id as string | null) ?? null,
    });
  }

  const nextDueOn = dueOn ? nextDueDate(dueOn, (bill.recurrence as string | null) ?? null) : null;
  const { error: updateError } = await supabase
    .from("obligations")
    .update(nextDueOn ? { due_on: nextDueOn, status: "expected" } : { status: "paid" })
    .eq("id", input.obligationId)
    .eq("household_id", input.householdId);
  if (updateError) {
    if (updateError.code === "42501") throw ApiError.forbidden("Only a household administrator can mark a bill paid.");
    throw new Error(`markObligationPaid failed: ${updateError.code ?? "unknown"}`);
  }
  return { nextDueOn };
}

/**
 * Removes one recorded transaction — a household correcting a mistaken
 * entry, not a ledger requiring an audit trail of every deletion (unlike a
 * bill definition, which stands down rather than disappearing, a single
 * recorded amount is closer to a typo that should just go away).
 */
async function removeTransactionImpl(
  supabase: SupabaseClient,
  input: { householdId: string; obligationId: string; periodLabel: string },
): Promise<void> {
  const { error } = await supabase
    .from("obligation_history")
    .delete()
    .eq("household_id", input.householdId)
    .eq("obligation_id", input.obligationId)
    .eq("period_label", input.periodLabel);

  if (error) {
    if (error.code === "42501")
      throw ApiError.forbidden("You cannot remove transactions for this household.");
    throw new Error(`removeTransaction failed: ${error.code ?? "unknown"}`);
  }
}

/**
 * Records what somebody is about to approve. Nothing is paid here.
 *
 * The intent is created awaiting approval; approving it, and the step-up that
 * approval requires, are separate deliberate acts.
 */
async function prepareIntentImpl(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    obligationId: string;
    amountMinor: number;
    currency: string;
  },
): Promise<{ id: string; idempotencyKey: string; status: string }> {
  const idempotencyKey = `${input.householdId}:${input.obligationId}:${input.amountMinor}`;

  const { data, error } = await supabase
    .from("payment_intents")
    .upsert(
      {
        household_id: input.householdId,
        obligation_id: input.obligationId,
        amount_minor: input.amountMinor,
        currency: input.currency,
        idempotency_key: idempotencyKey,
        status: "awaiting_approval",
      },
      { onConflict: "household_id,idempotency_key" },
    )
    .select("id, status")
    .single();

  if (error) {
    if (error.code === "42501")
      throw ApiError.forbidden("Only an administrator can arrange a payment.");
    throw new Error(`prepareIntent failed: ${error.code ?? "unknown"}`);
  }

  const row = data as Row;
  return { id: row.id as string, idempotencyKey, status: row.status as string };
}

/**
 * Obligations this connection has imported before, as reconciliation needs
 * them (17-003). Identity only, so a sync decides from provider ids and
 * content hashes, never by comparing bill names.
 */
export async function listImportedObligations(
  supabase: SupabaseClient,
  integrationId: string,
): Promise<ExistingObligationImport[]> {
  const { data, error } = await supabase
    .from("obligations")
    .select("id, external_id")
    .eq("integration_id", integrationId);

  if (error)
    throw new Error(
      `listImportedObligations failed: ${error.code ?? "unknown"}`,
    );

  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    externalId: row.external_id as string,
  }));
}

/**
 * Writes an obligation sync plan (17-003).
 *
 * An insert is source 'imported' and starts life as 'received' — the bill has
 * arrived, which is the one fact an email can honestly report — and marked
 * `requires_review`, because auto-extracted amounts and dates are exactly the
 * kind of thing a household should get to check once before trusting them. An
 * update touches only the content columns: `status` is never part of what
 * changes, so a bill a person already marked paid stays paid even if a
 * corrected copy of the same email arrives later.
 */
async function applyObligationSyncPlanImpl(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    integrationId: string;
    plan: ObligationSyncPlan;
  },
): Promise<void> {
  const { householdId, integrationId, plan } = input;
  const fail = (step: string, error: { code?: string }) => {
    if (error.code === "42501")
      throw ApiError.forbidden("You cannot add bills to this household.");
    return new Error(
      `applyObligationSyncPlan ${step} failed: ${error.code ?? "unknown"}`,
    );
  };

  if (plan.insert.length > 0) {
    const { error } = await supabase.from("obligations").insert(
      plan.insert.map((obligation) => ({
        household_id: householdId,
        integration_id: integrationId,
        source: "imported",
        status: "received",
        requires_review: true,
        ...obligationColumns(obligation),
      })),
    );
    if (error) throw fail("insert", error);
  }

  for (const { id, obligation } of plan.update) {
    const { error } = await supabase
      .from("obligations")
      .update({ requires_review: true, ...obligationColumns(obligation) })
      .eq("id", id);
    if (error) throw fail("update", error);
  }
}

function obligationColumns(obligation: ImportedObligation) {
  return {
    external_id: obligation.externalId,
    name: obligation.name,
    kind: obligation.kind,
    payee: obligation.payee,
    amount_minor: obligation.amountMinor,
    currency: obligation.currency,
    due_on: obligation.dueOn,
    recurrence: obligation.recurrence,
  };
}

// Every write forgets the household's cached context once it succeeds, so
// the next HomeTalk answer sees the change (Wave 1 §14).
export const createObligation = invalidatesContext(createObligationImpl, (_supabase, input) => input.householdId);
export const updateObligation = invalidatesContext(updateObligationImpl, (_supabase, input) => input.householdId);
export const cancelObligation = invalidatesContext(cancelObligationImpl, (_supabase, input) => input.householdId);
export const restoreObligation = invalidatesContext(restoreObligationImpl, (_supabase, input) => input.householdId);
export const recordAmount = invalidatesContext(recordAmountImpl, (_supabase, input) => input.householdId);
export const markObligationPaid = invalidatesContext(markObligationPaidImpl, (_supabase, input) => input.householdId);
export const removeTransaction = invalidatesContext(removeTransactionImpl, (_supabase, input) => input.householdId);
export const applyObligationSyncPlan = invalidatesContext(applyObligationSyncPlanImpl, (_supabase, input) => input.householdId);
export const prepareIntent = invalidatesContext(prepareIntentImpl, (_supabase, input) => input.householdId);
