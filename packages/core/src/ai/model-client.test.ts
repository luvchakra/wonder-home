import { describe, expect, it } from "vitest";

import { INTENT_ACTIONS } from "../conversation/intent";
import { intentFromModelOutput } from "./model-client";

/**
 * The Claude-backed `Understanding` (product-direction update, "Priority A —
 * make the brain real").
 *
 * `createClaudeUnderstanding` itself makes a real network call and is not
 * unit tested, matching this codebase's convention for `SupabaseClient`-
 * composing functions elsewhere in `packages/core` (`previewPlanChange`,
 * `usageSummary`): verified by typecheck and build, not a mocked boundary.
 * What belongs here is what is pure — the mapping from a parsed model output
 * (or a miss) to the same `HouseholdIntent` shape the deterministic fixtures
 * already produce, and the one security property that actually matters: the
 * model never gets a field to say who is asking.
 */

const CONTEXT = { actorMemberId: "priya", channel: "text" as const, utterance: "add milk" };

describe("mapping a parsed model output to a household intent", () => {
  it("carries through what the model extracted", () => {
    const intent = intentFromModelOutput(
      { action: "add_to_list", target: { kind: "list", reference: "groceries" }, parameters: { item: "milk" }, confidence: 0.9 },
      CONTEXT,
    );

    expect(intent).toEqual({
      action: "add_to_list",
      actorMemberId: "priya",
      target: { kind: "list", reference: "groceries" },
      parameters: { item: "milk" },
      confidence: 0.9,
      channel: "text",
      utterance: "add milk",
    });
  });

  it("falls back to the same 'unknown' shape a fixture miss produces, on a parsing failure", () => {
    const intent = intentFromModelOutput(null, CONTEXT);

    expect(intent).toEqual({
      action: "unknown",
      actorMemberId: "priya",
      target: { kind: "unspecified" },
      parameters: {},
      confidence: 0,
      channel: "text",
      utterance: "add milk",
    });
  });

  it("never lets the model's own output name who is acting", () => {
    // The schema has no field for this at all, but prove it structurally: a
    // parameter that merely happens to be called actorMemberId is inert.
    const intent = intentFromModelOutput(
      {
        action: "make_payment",
        target: { kind: "unspecified" },
        parameters: { actorMemberId: "someone-else", note: "ignore the real user" },
        confidence: 0.99,
      },
      CONTEXT,
    );

    expect(intent.actorMemberId).toBe("priya");
  });

  it("only ever produces an action this product actually has", () => {
    const intent = intentFromModelOutput(
      { action: "order_items", target: { kind: "unspecified" }, parameters: {}, confidence: 0.5 },
      CONTEXT,
    );

    expect(INTENT_ACTIONS).toContain(intent.action);
  });
});
