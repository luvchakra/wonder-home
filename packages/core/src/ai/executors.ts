import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { createConsumable } from "../commerce/repository";
import { prepareIntent } from "../finance/repository";
import { getCheckup } from "../health/checkups";
import { candidatesFor } from "../health/reminders";
import { createServiceRequest } from "../home/repository";
import { createNotification } from "../notifications/create";
import { chooseRecipient, decideNotification, type HouseholdEvent } from "../notifications/decide";
import type { PlannedStep } from "./orchestrator";

/**
 * What actually happens when a step is authorized to run (14-007).
 *
 * `executeStep` (orchestrator.ts) only decides whether a call may proceed —
 * it was never wired to anything that performs the write. This is that
 * wiring, one function per tool name, each calling the same repository
 * function the household's own screens call: an agent never mutates
 * Supabase directly (CLAUDE.md), it calls a governed tool, and a governed
 * tool calls the one write path everything else already goes through.
 *
 * A tool with no safe real target — `outcomes.replan` has no backing write
 * anywhere in the schema, and payments/orders must never auto-execute
 * regardless of what the autonomy gate decided — returns `performed: false`
 * rather than claiming a write that did not happen. `run.ts` records that
 * honestly (as `refused`, never as `executed`): a step nothing actually did
 * is not a step that succeeded, whatever authorizeToolCall said in advance.
 */

export type ExecutorResult = { performed: true; detail: string } | { performed: false; reason: string };

export async function runExecutor(
  supabase: SupabaseClient,
  householdId: string,
  step: PlannedStep,
  // Only `health.notify_overdue` needs this so far — `createNotification`
  // requires a service-role client (no RLS INSERT policy for `authenticated`
  // on `notifications`), and `run.ts` already has one locally for its own
  // `notifyApproval` call. Optional so every other executor stays untouched.
  admin?: SupabaseClient,
): Promise<ExecutorResult> {
  switch (step.toolName) {
    case "list.add_item":
      return addListItem(supabase, householdId, step);
    case "home.book_service":
      return raiseServiceRequest(supabase, householdId, step);
    case "bills.pay":
      // Never a real payment: no payment provider is configured, and per
      // CLAUDE.md none is live until it has credentials and a contract.
      // Always routes to the same "record what somebody is about to
      // approve, and stop" function the Bills screen uses — regardless of
      // what the autonomy gate decided, because `decideAutonomy` already
      // forces every payment to `needs_approval` (it is in
      // `ALWAYS_NEEDS_A_PERSON`), so this path should be unreachable in
      // practice. It stays a real, safe function rather than a silent
      // no-op in case that ever changes.
      return preparePayment(supabase, householdId, step);
    case "health.notify_overdue":
      return notifyOverdueHealth(supabase, admin ?? null, householdId, step);
    default:
      return { performed: false, reason: `No automated action exists yet for ${step.toolName}.` };
  }
}

async function addListItem(supabase: SupabaseClient, householdId: string, step: PlannedStep): Promise<ExecutorResult> {
  const name = String(step.arguments.name ?? "").trim();
  if (!name) return { performed: false, reason: "No item name was proposed." };
  const unit = typeof step.arguments.unit === "string" && step.arguments.unit.trim() ? step.arguments.unit.trim() : "item";
  const quantity = typeof step.arguments.quantity === "number" && step.arguments.quantity > 0 ? step.arguments.quantity : 1;

  try {
    await createConsumable(supabase, {
      householdId,
      name: name.charAt(0).toUpperCase() + name.slice(1),
      category: "grocery",
      unit,
      typicalQuantity: quantity,
    });
    return { performed: true, detail: `Added ${name} to the groceries.` };
  } catch (thrown) {
    // Already tracked is not a failure — the household already has this.
    if (thrown instanceof ApiError && thrown.code === "conflict") {
      return { performed: true, detail: `${name} was already on the groceries.` };
    }
    throw thrown;
  }
}

async function raiseServiceRequest(supabase: SupabaseClient, householdId: string, step: PlannedStep): Promise<ExecutorResult> {
  const assetId = typeof step.arguments.assetId === "string" ? step.arguments.assetId : null;
  // No technician-booking provider is connected (CLAUDE.md: never claim a
  // live integration), so "book a service" honestly means raising the
  // request for a person to take from here — the real capability behind
  // the tool's name.
  await createServiceRequest(supabase, {
    householdId,
    assetId,
    subject: step.rationale,
    nextActionBy: "household",
  });
  return { performed: true, detail: `Raised a service request: ${step.rationale}.` };
}

async function preparePayment(supabase: SupabaseClient, householdId: string, step: PlannedStep): Promise<ExecutorResult> {
  const billId = typeof step.arguments.billId === "string" ? step.arguments.billId : null;
  if (!billId) return { performed: false, reason: "No bill was identified." };

  const { data, error } = await supabase
    .from("obligations")
    .select("amount_minor, currency")
    .eq("id", billId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (error || !data || data.amount_minor === null) {
    return { performed: false, reason: "This bill has no recorded amount to prepare a payment for." };
  }

  await prepareIntent(supabase, {
    householdId,
    obligationId: billId,
    amountMinor: Number(data.amount_minor),
    currency: (data.currency as string | null) ?? "INR",
  });
  return { performed: false, reason: "Prepared and waiting for someone to approve — WonderHome never pays on its own." };
}

async function notifyOverdueHealth(
  supabase: SupabaseClient,
  admin: SupabaseClient | null,
  householdId: string,
  step: PlannedStep,
): Promise<ExecutorResult> {
  // `createNotification` requires the service-role client; without one this
  // tool genuinely cannot act yet, same honesty as every other "no backing
  // write" case in this file.
  if (!admin) return { performed: false, reason: "No automated action exists yet for health.notify_overdue." };

  const checkupId = typeof step.arguments.checkupId === "string" ? step.arguments.checkupId : null;
  if (!checkupId) return { performed: false, reason: "No checkup was identified." };

  const checkup = await getCheckup(supabase, householdId, checkupId);
  if (!checkup) return { performed: false, reason: "That checkup could not be found." };

  const candidates = await candidatesFor(admin, householdId, checkup.memberId);
  const recipient = chooseRecipient(candidates);
  if (!recipient) return { performed: false, reason: "Nobody could be notified about this." };

  const event: HouseholdEvent = {
    threadKey: `health_checkup:${checkup.id}:overdue`,
    outcomeKey: `checkup.${checkup.id}`,
    kind: "exception",
    aiResolvable: false,
    riskLevel: "low",
    dueAt: new Date(checkup.nextDueOn),
    impact: step.rationale,
    recommendedAction: { action: "view_checkup" },
  };

  const decision = decideNotification(event, { candidates, openThreadKeys: [], now: new Date() });
  if (decision.kind !== "notify") return { performed: false, reason: "Nothing new to tell anyone about this yet." };

  const created = await createNotification(admin, {
    householdId,
    decision,
    title: "Health checkup overdue",
    body: decision.impact,
    category: "appointments",
    source: { type: "health_checkup", id: checkup.id },
  });
  return created
    ? { performed: true, detail: `Told ${recipient.memberId === checkup.memberId ? "them" : "a guardian"} about the overdue checkup.` }
    : { performed: false, reason: "Could not send the reminder just now." };
}
