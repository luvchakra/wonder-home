import { createHash } from "node:crypto";

import { ApiError } from "../api/errors";
import { withIdempotency, type IdempotencyStore } from "../api/idempotency";
import { log } from "../observability/logger";
import { toHomeTalkResponse, type HomeTalkRequest, type HomeTalkResponse, type TurnReply } from "./contract";

/**
 * The HomeTalk gateway for channels other than the web composer (voice
 * integration phase 1). An adapter — Alexa, Gemini Voice — does exactly two
 * things before calling this: proves who is speaking (a linked identity,
 * never the provider's say-so) and opens that member's own session. From
 * here on it is the same turn the web runs: the same understanding, the same
 * grounding, the same permission, entitlement and autonomy gates, the same
 * governed executors.
 *
 * It fails closed. A session that is not the member the request names, a
 * household the member is not in, or anything thrown on the way is an
 * answer that changes nothing and says so — never a guess and never "done".
 */

export const FAILED_SPEECH = "I couldn't do that right now. Nothing was changed.";

/** What a turn needs said to it: the same body the web composer posts, always as voice. */
export type GatewayTurnBody = { utterance: string; channel: "voice"; transcriptConfidence?: number };

export type GatewayDeps = {
  /** The member the session belongs to in this household. Throws when there is none. */
  membership: (householdId: string) => Promise<{ memberId: string }>;
  /** One HomeTalk turn, under that session. */
  turn: (body: GatewayTurnBody) => Promise<{ reply?: TurnReply } | unknown>;
  /** Where a delivery's response is kept so a retry replays it. */
  idempotency: IdempotencyStore | null;
};

/** A delivery's retry key, whatever shape the provider's request id has. */
export function gatewayIdempotencyKey(request: Pick<HomeTalkRequest, "channel" | "requestId">): string {
  return `ht-${request.channel}-${createHash("sha256").update(`${request.channel}:${request.requestId}`).digest("hex").slice(0, 40)}`;
}

export async function runHomeTalkGateway(request: HomeTalkRequest, deps: GatewayDeps): Promise<HomeTalkResponse> {
  const startedAt = Date.now();
  const refuse = (status: "not_authorized" | "failed", speech: string): HomeTalkResponse => ({ requestId: request.requestId, status, speech, displayText: speech });
  let response: HomeTalkResponse;

  try {
    const text = request.input.text.trim();
    if (!text) {
      response = { requestId: request.requestId, status: "clarification_required", speech: "Sorry, I didn't catch that. What would you like?", displayText: "Sorry, I didn't catch that. What would you like?", clarification: { question: "What would you like?" } };
    } else {
      // Identity before context: the session must be the member the request
      // names, in the household it names, before anything is read.
      const membership = await deps.membership(request.householdId);
      if (membership.memberId !== request.memberId) {
        response = refuse("not_authorized", "That account is not linked to you in this household, so I can't help with it.");
      } else {
        const body: GatewayTurnBody = {
          utterance: text.slice(0, 1000),
          channel: "voice",
          ...(request.input.transcriptConfidence !== undefined ? { transcriptConfidence: request.input.transcriptConfidence } : {}),
        };
        const recorded = await withIdempotency(deps.idempotency, { key: gatewayIdempotencyKey(request), endpoint: `hometalk:${request.channel}`, body }, async () => {
          const turn = await deps.turn(body);
          const reply = (turn as { reply?: TurnReply } | null)?.reply;
          return { status: 200, body: reply ? toHomeTalkResponse(request.requestId, reply) : refuse("failed", FAILED_SPEECH) };
        });
        response = recorded.body as HomeTalkResponse;
      }
    }
  } catch (thrown) {
    const code = thrown instanceof ApiError ? thrown.code : null;
    const forbidden = code === "forbidden" || code === "unauthenticated" || code === "not_found";
    if (code === "rate_limited") response = refuse("failed", (thrown as ApiError).message);
    else if (code === "conflict") response = refuse("failed", "I'm still working on that one. Give me a moment.");
    else if (forbidden) response = refuse("not_authorized", "I can't do that for this account. Nothing was changed.");
    else {
      response = refuse("failed", FAILED_SPEECH);
      log.warn("hometalk gateway: turn failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
    }
  }

  // Safe metadata only: never the words, never a token (phase 1 §Observability).
  log.info("hometalk turn", {
    requestId: request.requestId,
    channel: request.channel,
    householdId: request.householdId,
    memberId: request.memberId,
    status: response.status,
    actionId: response.action?.actionId ?? null,
    latencyMs: Date.now() - startedAt,
    allow: ["requestId", "channel", "householdId", "memberId", "status", "actionId", "latencyMs"],
  });
  return response;
}
