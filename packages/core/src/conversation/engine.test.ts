import { describe, expect, it } from "vitest";

import { CONFIRM_TRANSCRIPT_BELOW, converse, pendingFrom, replyFor, type TurnInput } from "./engine";

const NOW = new Date("2026-09-17T09:00:00.000Z");

const turn = (over: Partial<TurnInput> = {}): TurnInput => ({
  utterance: "Add coriander to the grocery list.",
  channel: "text",
  actor: { memberId: "priya", roles: ["adult"], memberType: "adult" },
  pending: null,
  autonomyFor: () => "approve",
  entitledFor: () => true,
  sessionId: "session-1",
  now: NOW,
  ...over,
});

describe("one turn of conversation", () => {
  it("turns a request into a proposal and a short reply", async () => {
    const result = await converse(turn({ utterance: "Sunita won't be here tomorrow." }));

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.intent.action).toBe("record_absence");
    expect(result.proposal.kind).toBe("needs_approval");
    expect(result.text).toMatch(/shall i go ahead/i);
    expect(result.record).toBe(true);
  });

  it("never says done unless a tool actually did it", async () => {
    // Drafting is harmless, so autonomy lets it execute — but nothing is wired
    // to add to a list yet, so the honest answer is "prepared".
    const withoutTool = await converse(turn());
    expect(withoutTool.kind).toBe("reply");
    if (withoutTool.kind !== "reply") return;
    expect(withoutTool.proposal.kind).toBe("prepared");
    expect(withoutTool.text).toMatch(/not done it/);

    const withTool = await converse(turn({ executable: () => true }));
    if (withTool.kind !== "reply") return;
    expect(withTool.proposal.kind).toBe("executed");
  });

  it("asks rather than guesses when it did not follow", async () => {
    const result = await converse(turn({ utterance: "Do the thing with the stuff." }));

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.proposal.kind).toBe("clarify");
    expect(result.record).toBe(false);
  });

  it("reads a shaky voice transcript back before acting on money", async () => {
    const result = await converse(
      turn({ utterance: "Pay the electricity bill.", channel: "voice", transcriptConfidence: CONFIRM_TRANSCRIPT_BELOW - 0.1 }),
    );

    expect(result.kind).toBe("confirm_transcript");
  });

  it("does not bother confirming a shaky transcript of something harmless", async () => {
    const result = await converse(
      turn({ utterance: "Add coriander to the grocery list.", channel: "voice", transcriptConfidence: 0.3 }),
    );

    expect(result.kind).toBe("reply");
  });

  it("treats a yes as consent only for what was just proposed", async () => {
    const pending = pendingFrom({ id: "action-1", summary: "Add coriander to the grocery list", createdAt: NOW });

    await expect(converse(turn({ utterance: "Yes", pending }))).resolves.toMatchObject({ kind: "approve", actionId: "action-1" });
    await expect(converse(turn({ utterance: "No", pending }))).resolves.toMatchObject({ kind: "reject", actionId: "action-1" });
  });

  it("does not take a stale yes as consent", async () => {
    const old = pendingFrom({ id: "action-1", summary: "Pay the electricity bill", createdAt: new Date("2026-09-17T08:00:00.000Z") });
    const result = await converse(turn({ utterance: "yes", pending: old }));

    expect(result.kind).toBe("reply");
    expect(result.text).toMatch(/a while ago/i);
  });

  it("says so when there is nothing to say yes to", async () => {
    const result = await converse(turn({ utterance: "ok" }));

    expect(result.kind).toBe("reply");
    expect(result.text).toMatch(/nothing waiting/i);
  });

  it("remembers a stated preference, but only as learned", async () => {
    const result = await converse(turn({ utterance: "We prefer dinner at 8." }));

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.memory?.status).toBe("learned");
    expect(result.memory?.sourceType).toBe("conversation");
  });

  it("refuses in plain words when the plan does not cover it", async () => {
    const result = await converse(turn({ utterance: "Pay the electricity bill.", entitledFor: () => false }));

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.proposal.kind).toBe("refused");
    expect(result.text).toMatch(/plan/i);
  });

  it("never lets a child pay a bill, whatever they say", async () => {
    const result = await converse(
      turn({ utterance: "Pay the electricity bill.", actor: { memberId: "aarav", roles: ["child"], memberType: "child" } }),
    );

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.proposal.kind).toBe("refused");
  });
});

describe("a live provider behind the same seam", () => {
  it("awaits an asynchronous understanding, not just a synchronous one", async () => {
    const result = await converse(
      turn({
        utterance: "anything at all",
        understand: async (utterance, context) => ({
          action: "ask_status",
          actorMemberId: context.actorMemberId,
          target: { kind: "unspecified" },
          parameters: {},
          confidence: 1,
          channel: context.channel,
          utterance,
        }),
      }),
    );

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.intent.action).toBe("ask_status");
  });
});

describe("what the assistant says", () => {
  it("keeps 'prepared' and 'done' unmistakably different", () => {
    const preview = { summary: "Place the order", changes: [], because: "", reversible: false };

    expect(replyFor({ kind: "prepared", preview })).toMatch(/not done it/);
    expect(replyFor({ kind: "executed", preview })).toMatch(/^Done/);
  });
});
