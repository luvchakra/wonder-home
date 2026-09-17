import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { consume, may } from "@wonderhome/core/billing/repository";
import { converse, pendingFrom, previewOf } from "@wonderhome/core/conversation/engine";
import type { HouseholdIntent } from "@wonderhome/core/conversation/intent";
import {
  currentSessionId,
  decideAction,
  listMessages,
  openSession,
  pendingAction,
  recordMessage,
  recordProposal,
  remember,
  type ConversationAction,
} from "@wonderhome/core/conversation/repository";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import type { AutonomyMode } from "@wonderhome/core/household/autonomy";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * The conversation: one engine for talk and text (module 04).
 *
 * POST takes what was said and returns what WonderHome says back, with an
 * action preview when it is prepared to do something. Consent is a separate
 * POST naming the action — or a "yes" that resolves against the last proposal
 * inside its time limit. Nothing here executes a domain effect: an approved
 * action is handed to the governed tools, whose own gate checks again.
 */
const sayScheme = z.object({
  utterance: z.string().trim().min(1).max(1000),
  channel: z.enum(["text", "voice"]).default("text"),
  transcriptConfidence: z.number().min(0).max(1).optional(),
});

const decideScheme = z.object({
  actionId: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
});

const bodySchema = z.union([sayScheme, decideScheme]);

type Params = { params: Promise<{ householdId: string }> };

/** Feature keys a consequential intent needs, beyond the conversation itself. */
const FEATURE_FOR_ACTION: Partial<Record<HouseholdIntent["action"], "finance.bills" | "commerce.orders" | "family.events">> = {
  make_payment: "finance.bills",
  order_items: "commerce.orders",
  plan_event: "family.events",
};

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ authenticate: requireUser }, async () => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    const sessionId = await currentSessionId(supabase, householdId, membership.memberId);
    if (!sessionId) return { sessionId: null, messages: [] };

    return { sessionId, messages: await listMessages(supabase, householdId, sessionId) };
  })(request);
}

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ input: bodySchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    const actor = { memberId: membership.memberId, roles: membership.roles, memberType: membership.memberType };
    const admin = createAdminClient();

    if ("actionId" in body) {
      const action = await decideAction(admin, { householdId, actionId: body.actionId, memberId: membership.memberId, decision: body.decision });
      if (!action) throw ApiError.notFound("That proposal is no longer waiting for a decision.");

      const sessionId = await openSession(admin, { householdId, memberId: membership.memberId, channel: "text" });
      const text = body.decision === "approved" ? "Done — I have your go-ahead and it is on its way." : "Understood. I have left that alone.";
      const messageId = await recordMessage(admin, { householdId, sessionId, role: "assistant", content: text, metadata: { decidedActionId: action.id } });

      return { reply: { id: messageId, text, action } };
    }

    // Entitlement first, on the server, before anything is read or written.
    const feature = body.channel === "voice" ? "conversation.voice" : "conversation.text";
    const entitlement = await may(supabase, householdId, feature);
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const [entitled, sessionId, autonomyFor] = await Promise.all([
      consequentialEntitlements(supabase, householdId),
      openSession(admin, { householdId, memberId: membership.memberId, channel: body.channel }),
      autonomyLookup(supabase, householdId),
    ]);
    const pending = await pendingAction(admin, sessionId);

    const memberMessageId = await recordMessage(admin, {
      householdId,
      sessionId,
      role: "member",
      content: body.utterance,
      transcriptConfidence: body.transcriptConfidence,
      metadata: { channel: body.channel },
    });

    const result = converse({
      utterance: body.utterance,
      channel: body.channel,
      transcriptConfidence: body.transcriptConfidence,
      actor,
      pending: pending ? pendingFrom(pending) : null,
      autonomyFor,
      entitledFor: (intent) => {
        const needed = FEATURE_FOR_ACTION[intent.action];
        return needed ? entitled[needed] : true;
      },
      sessionId,
    });

    await consume(supabase, householdId, feature).catch(() => undefined);

    let action: ConversationAction | null = null;
    const replyId = await recordMessage(admin, {
      householdId,
      sessionId,
      role: "assistant",
      content: result.text,
      metadata: result.kind === "reply" ? { proposal: result.proposal.kind, intent: result.intent.action } : { kind: result.kind },
    });

    if (result.kind === "approve" || result.kind === "reject") {
      action = await decideAction(admin, {
        householdId,
        actionId: result.actionId,
        memberId: membership.memberId,
        decision: result.kind === "approve" ? "approved" : "rejected",
      });
    } else if (result.kind === "reply") {
      if (result.record) {
        action = await recordProposal(admin, { householdId, sessionId, messageId: replyId, intent: result.intent, proposal: result.proposal });
      }
      if (result.memory) await remember(admin, householdId, result.memory);
    }

    return {
      sessionId,
      memberMessageId,
      reply: {
        id: replyId,
        text: result.text,
        action,
        preview: result.kind === "reply" ? previewOf(result.proposal) : null,
        proposal: result.kind === "reply" ? result.proposal.kind : result.kind,
      },
    };
  })(request);
}

/** Autonomy per outcome, from the responsibilities matrix; "approve" if unset. */
async function autonomyLookup(supabase: Awaited<ReturnType<typeof createClient>>, householdId: string) {
  const { data } = await supabase.from("responsibilities").select("outcome_key, ai_mode").eq("household_id", householdId);
  const modes = new Map<string, AutonomyMode>(((data as { outcome_key: string; ai_mode: AutonomyMode }[] | null) ?? []).map((row) => [row.outcome_key, row.ai_mode]));
  return (outcomeKey: string | null): AutonomyMode => (outcomeKey && modes.get(outcomeKey)) || "approve";
}

/**
 * The engine is synchronous, so the three features a consequential intent can
 * need are checked before the turn rather than inside it. Kept explicit rather
 * than generic: these are the only actions whose entitlement differs from the
 * conversation's own.
 */
async function consequentialEntitlements(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string,
): Promise<Record<"finance.bills" | "commerce.orders" | "family.events", boolean>> {
  const [bills, orders, events] = await Promise.all([
    may(supabase, householdId, "finance.bills"),
    may(supabase, householdId, "commerce.orders"),
    may(supabase, householdId, "family.events"),
  ]);
  return { "finance.bills": bills.allowed, "commerce.orders": orders.allowed, "family.events": events.allowed };
}

export const dynamic = "force-dynamic";
