import { describe, expect, it } from "vitest";

import { intentFromModelOutput } from "../ai/model-client";
import { converse, resolveDeterministicIntent, type TurnInput } from "./engine";
import { disposeIntent } from "./intent";

/**
 * The truth about how a turn was understood — and what the person is told
 * when it was not.
 */
const turn = (over: Partial<TurnInput> = {}): TurnInput => ({
  utterance: "add a grocery item of milk",
  channel: "text",
  actor: { memberId: "priya", roles: ["adult"], memberType: "adult" },
  pending: null,
  autonomyFor: () => "approve",
  entitledFor: () => true,
  sessionId: "session-1",
  now: new Date("2026-09-20T09:00:00.000Z"),
  ...over,
});

describe("understanding without a model", () => {
  it("answers the taught sentences from the fixtures, and the ordinary ones from the rules", () => {
    const fixture = resolveDeterministicIntent("Add coriander to the grocery list.", { actorMemberId: "p", channel: "text" });
    expect(fixture.understanding).toEqual({ source: "fixture" });

    const rule = resolveDeterministicIntent("add a grocery item of milk", { actorMemberId: "p", channel: "text" });
    expect(rule.action).toBe("add_to_list");
    expect(rule.understanding).toEqual({ source: "rules" });
  });

  it("carries an ordinary request all the way to done when something can do it", async () => {
    const result = await converse(turn({ executable: () => true }));
    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.intent.action).toBe("add_to_list");
    expect(result.proposal.kind).toBe("executed");
  });
});

describe("when a model was asked and did not answer", () => {
  const failed = (utterance: string) =>
    intentFromModelOutput(null, { actorMemberId: "p", channel: "text", utterance }, { source: "model", provider: "anthropic", failure: "provider_error" });

  it("falls back to the rules for a request they read", async () => {
    const result = await converse(turn({ understand: (utterance) => failed(utterance) }));
    if (result.kind !== "reply") throw new Error("expected a reply");
    expect(result.intent.action).toBe("add_to_list");
    expect(result.intent.understanding).toEqual({ source: "rules" });
  });

  it("says it could not reach its model, rather than that it did not follow", async () => {
    const result = await converse(turn({ utterance: "Do the thing with the stuff.", understand: (utterance) => failed(utterance) }));
    if (result.kind !== "reply") throw new Error("expected a reply");
    expect(result.proposal.kind).toBe("clarify");
    expect(result.text).toMatch(/could not reach my model/);
    expect(result.text).not.toMatch(/did not follow/);
  });

  it("offers what it can do when it genuinely did not follow", () => {
    const disposition = disposeIntent({
      action: "unknown",
      actorMemberId: "p",
      target: { kind: "unspecified" },
      parameters: {},
      confidence: 0,
      channel: "text",
      utterance: "hmm",
    });
    expect(disposition.kind).toBe("clarify");
    if (disposition.kind === "clarify") expect(disposition.question).toMatch(/groceries/);
  });
});
