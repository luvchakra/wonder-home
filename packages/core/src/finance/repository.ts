import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import type { HomeAssessment } from "../home/assessment";
import {
  assessObligation,
  detectAnomaly,
  type Obligation,
  type ObligationKind,
  type ObligationStatus,
} from "./payments";

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
      "id, name, kind, payee, amount_minor, currency, due_on, responsible_member_id, status, requires_review",
    )
    .eq("household_id", householdId)
    .order("due_on", { ascending: true, nullsFirst: false });

  if (error) throw new Error(`listObligations failed: ${error.code ?? "unknown"}`);

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
  }));
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

  if (error) throw new Error(`arrangedObligationIds failed: ${error.code ?? "unknown"}`);
  return new Set((data ?? []).map((row: Row) => row.obligation_id as string));
}

export type FinanceAgenda = { bills: HomeAssessment[]; anomalies: HomeAssessment[]; checked: number };

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
      .select("id, obligation_id, amount_minor, currency, baseline_minor, baseline_label, ratio")
      .eq("household_id", householdId)
      .eq("status", "open"),
  ]);

  const byId = new Map(obligations.map((obligation) => [obligation.id, obligation]));

  const anomalies: HomeAssessment[] = ((anomalyRows.data as Row[] | null) ?? []).map((row) => {
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
        assessObligation(obligation, { now, hasApprovedIntent: arranged.has(obligation.id) }),
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
export async function recordAmount(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    obligationId: string;
    periodLabel: string;
    amountMinor: number;
    currency: string;
  },
): Promise<{ anomaly: boolean }> {
  const { error } = await supabase.from("obligation_history").upsert(
    {
      household_id: input.householdId,
      obligation_id: input.obligationId,
      period_label: input.periodLabel,
      amount_minor: input.amountMinor,
      currency: input.currency,
    },
    { onConflict: "obligation_id,period_label" },
  );

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You cannot record amounts for this household.");
    throw new Error(`recordAmount failed: ${error.code ?? "unknown"}`);
  }

  const { data: history, error: historyError } = await supabase
    .from("obligation_history")
    .select("period_label, amount_minor")
    .eq("obligation_id", input.obligationId)
    .neq("period_label", input.periodLabel);

  if (historyError) throw new Error(`recordAmount failed: ${historyError.code ?? "unknown"}`);

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
 * Records what somebody is about to approve. Nothing is paid here.
 *
 * The intent is created awaiting approval; approving it, and the step-up that
 * approval requires, are separate deliberate acts.
 */
export async function prepareIntent(
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
    if (error.code === "42501") throw ApiError.forbidden("Only an administrator can arrange a payment.");
    throw new Error(`prepareIntent failed: ${error.code ?? "unknown"}`);
  }

  const row = data as Row;
  return { id: row.id as string, idempotencyKey, status: row.status as string };
}
