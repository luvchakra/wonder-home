import { describe, expect, it } from "vitest";

import { ApiError } from "../api/errors";
import type { IdempotencyStore, RecordedResponse } from "../api/idempotency";
import { speechFrom, toHomeTalkResponse, MAX_SPEECH, type HomeTalkRequest, type TurnReply } from "./contract";
import { gatewayIdempotencyKey, runHomeTalkGateway, type GatewayTurnBody } from "./gateway";

/**
 * Voice integration phase 1: one canonical HomeTalk gateway (spec
 * `design/voice-integration/01-hometalk-voice-gateway-foundation.md`, §Tests).
 */

function memoryStore(): IdempotencyStore {
  const rows = new Map<string, { requestHash: string; response: RecordedResponse }>();
  return {
    lookup: async (key, endpoint) => rows.get(`${endpoint}:${key}`) ?? null,
    record: async ({ key, endpoint, requestHash, response }) => void rows.set(`${endpoint}:${key}`, { requestHash, response }),
    reserve: async ({ key, endpoint, requestHash }) => {
      if (rows.has(`${endpoint}:${key}`)) return false;
      rows.set(`${endpoint}:${key}`, { requestHash, response: { status: 102, body: null } });
      return true;
    },
    release: async (key, endpoint) => void rows.delete(`${endpoint}:${key}`),
  };
}

const request = (over: Partial<HomeTalkRequest> = {}): HomeTalkRequest => ({
  channel: "alexa",
  householdId: "h-1",
  memberId: "m-1",
  requestId: "amzn1.echo-api.request.0001",
  input: { text: "Add milk to the grocery list", modality: "voice" },
  device: { provider: "amazon" },
  ...over,
});

function gateway(reply: TurnReply | null, over: { memberId?: string; membershipError?: Error; turnError?: Error } = {}) {
  const calls: GatewayTurnBody[] = [];
  const deps = {
    membership: async () => {
      if (over.membershipError) throw over.membershipError;
      return { memberId: over.memberId ?? "m-1" };
    },
    turn: async (body: GatewayTurnBody) => {
      calls.push(body);
      if (over.turnError) throw over.turnError;
      return reply ? { reply } : {};
    },
    idempotency: memoryStore(),
  };
  return { deps, calls };
}

const executed: TurnReply = { text: "Done — milk is on the grocery list.", proposal: "executed", action: { id: "a-1", status: "executed" } };

describe("the gateway runs the same turn for every channel", () => {
  it("a voice request reaches the turn as voice, under the linked member, and comes back completed", async () => {
    const { deps, calls } = gateway(executed);
    const response = await runHomeTalkGateway(request(), deps);
    expect(calls).toEqual([{ utterance: "Add milk to the grocery list", channel: "voice" }]);
    expect(response).toMatchObject({ status: "completed", action: { executed: true, actionId: "a-1" } });
  });

  it("a text request from a web-like channel goes through the same way", async () => {
    const { deps, calls } = gateway({ text: "Dinner tonight is pasta.", proposal: "answer", action: null });
    const response = await runHomeTalkGateway(request({ channel: "web", input: { text: "What's for dinner?", modality: "text" } }), deps);
    expect(calls).toHaveLength(1);
    expect(response.status).toBe("answered");
  });

  it("carries a shaky transcript's confidence so the turn reads it back rather than acting", async () => {
    const { deps, calls } = gateway({ text: 'I heard "pay the bill" but I am not certain.', proposal: "confirm_transcript", action: null });
    const response = await runHomeTalkGateway(request({ input: { text: "pay the bill", modality: "voice", transcriptConfidence: 0.4 } }), deps);
    expect(calls[0]!.transcriptConfidence).toBe(0.4);
    expect(response.status).toBe("clarification_required");
  });
});

describe("identity is resolved before anything is read", () => {
  it("an unlinked or signed-out session is not authorized, and no turn runs", async () => {
    const { deps, calls } = gateway(executed, { membershipError: ApiError.forbidden("You are not a member of this household.") });
    expect((await runHomeTalkGateway(request(), deps)).status).toBe("not_authorized");
    expect(calls).toHaveLength(0);
  });

  it("a session that is another member (or another household's) is refused, and no turn runs", async () => {
    const { deps, calls } = gateway(executed, { memberId: "m-2" });
    const response = await runHomeTalkGateway(request(), deps);
    expect(response.status).toBe("not_authorized");
    expect(calls).toHaveLength(0);
  });

  it("nothing said is a question, not a turn", async () => {
    const { deps, calls } = gateway(executed);
    expect((await runHomeTalkGateway(request({ input: { text: "   ", modality: "voice" } }), deps)).status).toBe("clarification_required");
    expect(calls).toHaveLength(0);
  });
});

describe("what happened is read from the turn, never invented by the channel", () => {
  it("an ambiguous person is one question", () => {
    const response = toHomeTalkResponse("r", { text: "Do you mean Asmi or Manan?", proposal: "clarify", action: null });
    expect(response).toMatchObject({ status: "clarification_required", clarification: { question: "Do you mean Asmi or Manan?" } });
  });

  it("a proposal waiting for a yes names its action and says it is not done", () => {
    const response = toHomeTalkResponse("r", { text: "The electricity bill is ready to pay. Shall I go ahead?", proposal: "needs_approval", action: { id: "a-9", status: "proposed", expiresAt: "2026-09-23T10:10:00Z" } });
    expect(response).toMatchObject({ status: "approval_required", action: { proposed: true, executed: false, actionId: "a-9" }, approval: { approvalId: "a-9", expiresAt: "2026-09-23T10:10:00.000Z" } });
  });

  it("\"done\" only when the executor recorded the action as executed", () => {
    expect(toHomeTalkResponse("r", executed).status).toBe("completed");
    expect(toHomeTalkResponse("r", { ...executed, action: { id: "a-1", status: "failed" } }).status).toBe("failed");
    expect(toHomeTalkResponse("r", { ...executed, action: null }).status).toBe("failed");
  });

  it("a refusal is not authorized", () => {
    expect(toHomeTalkResponse("r", { text: "You are not set up to make payments for this household.", proposal: "refused", action: null }).status).toBe("not_authorized");
  });

  it("an executor failure is failed and says nothing changed", async () => {
    const { deps } = gateway(null, { turnError: new Error("boom") });
    const response = await runHomeTalkGateway(request(), deps);
    expect(response.status).toBe("failed");
    expect(response.speech).toMatch(/Nothing was changed/);
    expect(response.speech).not.toMatch(/done|added/i);
  });

  it("a turn with no reply is failed, never answered", async () => {
    const { deps } = gateway(null);
    expect((await runHomeTalkGateway(request(), deps)).status).toBe("failed");
  });
});

describe("a delivery runs once", () => {
  it("the same request id twice runs one turn and replays the first answer", async () => {
    const { deps, calls } = gateway(executed);
    const first = await runHomeTalkGateway(request(), deps);
    const second = await runHomeTalkGateway(request(), deps);
    expect(calls).toHaveLength(1);
    expect(second).toEqual(first);
  });

  it("a different request id is a different delivery; the key never carries the raw id", async () => {
    const { deps, calls } = gateway(executed);
    await runHomeTalkGateway(request(), deps);
    await runHomeTalkGateway(request({ requestId: "amzn1.echo-api.request.0002" }), deps);
    expect(calls).toHaveLength(2);
    const key = gatewayIdempotencyKey(request());
    expect(key).toMatch(/^ht-alexa-[0-9a-f]{40}$/);
    expect(key).not.toContain("amzn1");
  });

  it("the same request id on another channel is not the same delivery", () => {
    expect(gatewayIdempotencyKey(request({ channel: "gemini_voice" }))).not.toBe(gatewayIdempotencyKey(request()));
  });
});

describe("speech is short and heard once", () => {
  it("drops links, markdown, arrows and screen words", () => {
    expect(speechFrom("**Done** — milk is on the [grocery list](/groceries). → [Groceries](/groceries)")).toBe("Done — milk is on the grocery list.");
    expect(speechFrom("Click here to see more.\nDinner is dal and rice")).toBe("Dinner is dal and rice.");
    expect(speechFrom("See https://example.com for details")).toBe("");
  });

  it("reads a list as sentences and counts what does not fit", () => {
    const list = ["Here is what is on record for tomorrow:", ...Array.from({ length: 30 }, (_, i) => `- Item number ${i + 1} is due tomorrow at school`)].join("\n");
    const spoken = speechFrom(list);
    expect(spoken.length).toBeLessThanOrEqual(MAX_SPEECH + 80);
    expect(spoken).toMatch(/^Here is what is on record for tomorrow: Item number 1 is due tomorrow at school\./);
    expect(spoken).toMatch(/And \d+ more/);
  });
});
