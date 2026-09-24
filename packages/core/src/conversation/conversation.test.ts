import { describe, expect, it } from "vitest";

import { UTTERANCE_FIXTURES, resolveFixtureIntent } from "./fixtures";
import {
  CLARIFY_BELOW_CONFIDENCE,
  classifyShortReply,
  disposeIntent,
  isConsequential,
  resolveShortReply,
  type HouseholdIntent,
} from "./intent";
import { proposeFromIntent, type ProposalContext } from "./proposal";

const ctx = (over: Partial<ProposalContext> = {}): ProposalContext => ({
  actor: { roles: ["head"] },
  autonomy: "approve",
  entitled: true,
  ...over,
});

const intentFor = (utterance: string, channel: "text" | "voice" = "text"): HouseholdIntent =>
  resolveFixtureIntent(utterance, { actorMemberId: "m-1", channel });

describe("one engine for text and voice", () => {
  it("produces an identical intent whichever channel it arrived on", () => {
    const spoken = intentFor("Sunita won't be here tomorrow.", "voice");
    const typed = intentFor("Sunita won't be here tomorrow.", "text");

    const { channel: _spokenChannel, ...spokenRest } = spoken;
    const { channel: _typedChannel, ...typedRest } = typed;

    expect(spokenRest).toEqual(typedRest);
    expect(spoken.channel).toBe("voice");
  });

  it("reaches the same proposal from speech as from text", () => {
    const fromVoice = proposeFromIntent(intentFor("Pay the electricity bill.", "voice"), ctx());
    const fromText = proposeFromIntent(intentFor("Pay the electricity bill.", "text"), ctx());
    expect(fromVoice).toEqual(fromText);
  });

  it("ignores case and trailing punctuation", () => {
    expect(intentFor("add coriander to the grocery list").action).toBe("add_to_list");
  });

  it("returns unknown for anything it was not taught, rather than guessing", () => {
    expect(intentFor("Reticulate the household splines").action).toBe("unknown");
    expect(intentFor("Pay the electric bill").action).toBe("unknown");
  });
});

describe("ambiguity becomes a question, not a guess", () => {
  it("asks which bill rather than paying one", () => {
    const disposition = disposeIntent(intentFor("Pay it."));
    expect(disposition.kind).toBe("clarify");
    expect(disposition.kind === "clarify" && disposition.question).toMatch(/which bill/i);
  });

  it("asks what 'the usual' means", () => {
    expect(disposeIntent(intentFor("Order the usual.")).kind).toBe("clarify");
  });

  it("proceeds when a consequential request is clear", () => {
    expect(disposeIntent(intentFor("Pay the electricity bill.")).kind).toBe("proceed");
  });

  it("does not interrogate a harmless request that is merely unspecific", () => {
    // A question about tomorrow's schedule has no target, and that is fine.
    expect(disposeIntent(intentFor("Show me tomorrow's schedule.")).kind).toBe("proceed");
  });

  it("holds every consequential fixture above the threshold or expects a question", () => {
    for (const fixture of UTTERANCE_FIXTURES) {
      if (!isConsequential(fixture.action)) continue;
      const disposition = disposeIntent(intentFor(fixture.utterance));
      const expected = fixture.confidence >= CLARIFY_BELOW_CONFIDENCE ? "proceed" : "clarify";
      expect(disposition.kind, `${fixture.utterance} → ${fixture.note}`).toBe(expected);
    }
  });
});

describe("short replies only mean something in context", () => {
  const pending = {
    actionId: "a-1",
    summary: "Pay the electricity bill",
    expiresAt: new Date("2026-09-17T12:00:00Z"),
  };
  const before = new Date("2026-09-17T11:00:00Z");
  const after = new Date("2026-09-17T13:00:00Z");

  it("recognises the ways people say yes and no", () => {
    expect(classifyShortReply("yes")).toBe("affirm");
    expect(classifyShortReply("Do it!")).toBe("affirm");
    expect(classifyShortReply("no")).toBe("decline");
    expect(classifyShortReply("not now")).toBe("decline");
    expect(classifyShortReply("what is it")).toBe("unclear");
  });

  it("reads a bare yes or no in the other languages WonderHome speaks, never inside a sentence (story 22-005)", () => {
    for (const yes of ["हाँ", "हां जी।", "haan", "होय", "sí", "Oui", "ja", "نعم"]) expect(classifyShortReply(yes), yes).toBe("affirm");
    for (const no of ["नहीं", "nahi", "नाही", "non", "Nein", "لا"]) expect(classifyShortReply(no), no).toBe("decline");
    // A yes that approves something is a whole reply, in any language.
    expect(classifyShortReply("हाँ, पर पहले दूध जोड़ो")).toBe("unclear");
    expect(classifyShortReply("oui mais attends")).toBe("unclear");
  });

  it("approves the proposal that is actually pending", () => {
    expect(resolveShortReply("yes", pending, before)).toEqual({ kind: "approve", actionId: "a-1" });
  });

  it("does nothing when a stray yes arrives with nothing pending", () => {
    expect(resolveShortReply("yes", null, before)).toEqual({ kind: "no_pending_proposal" });
  });

  it("treats a stale yes as expired rather than as consent", () => {
    const resolution = resolveShortReply("yes", pending, after);
    expect(resolution.kind).toBe("expired");
    expect(resolution.kind === "expired" && resolution.summary).toBe("Pay the electricity bill");
  });

  it("leaves a real sentence to the ordinary path", () => {
    expect(resolveShortReply("pay the water bill instead", pending, before)).toEqual({
      kind: "not_a_short_reply",
    });
  });
});

describe("proposals are decided by policy, never by the model", () => {
  it("never executes a payment, even for the head on full autonomy", () => {
    const proposal = proposeFromIntent(intentFor("Pay the electricity bill."), ctx({ autonomy: "execute" }));
    expect(proposal.kind).toBe("needs_approval");
  });

  it("refuses a payment outright for someone who cannot pay", () => {
    const proposal = proposeFromIntent(
      intentFor("Pay the electricity bill."),
      ctx({ actor: { roles: ["adult"] } }),
    );
    expect(proposal.kind).toBe("refused");
    expect(proposal.kind === "refused" && proposal.reason).toMatch(/not set up to make payments/i);
  });

  it("refuses a child's request without pretending to consider it", () => {
    const proposal = proposeFromIntent(
      intentFor("Priya handles the school run from now on."),
      ctx({ actor: { roles: ["child"], memberType: "child" } }),
    );
    expect(proposal.kind).toBe("refused");
  });

  it("says the feature is not in the plan rather than implying distrust", () => {
    const proposal = proposeFromIntent(intentFor("Order the usual."), ctx({ entitled: false }));
    // Clarification comes first: an ambiguous request is not an entitlement question.
    expect(proposal.kind).toBe("clarify");

    const clear = proposeFromIntent(intentFor("Pay the electricity bill."), ctx({ entitled: false }));
    expect(clear.kind).toBe("refused");
    expect(clear.kind === "refused" && clear.reason).toMatch(/current plan/i);
  });

  it("changes nothing when the outcome is set to observe", () => {
    const proposal = proposeFromIntent(intentFor("Add coriander to the grocery list."), ctx({ autonomy: "observe" }));
    // Drafting is harmless, so it still happens — observe restricts change, not thought.
    expect(proposal.kind).toBe("executed");

    const scheduling = proposeFromIntent(intentFor("Sunita won't be here tomorrow."), ctx({ autonomy: "observe" }));
    expect(scheduling.kind).toBe("refused");
  });

  it("answers a question without proposing anything", () => {
    expect(proposeFromIntent(intentFor("How is Anaya's project coming along?"), ctx()).kind).toBe("answer");
  });
});

describe("action previews", () => {
  it("say what will change, and why, before it happens", () => {
    const proposal = proposeFromIntent(intentFor("Move Aarav's karate class to Thursday."), ctx());
    expect(proposal.kind).toBe("needs_approval");

    if (proposal.kind !== "needs_approval") throw new Error("expected an approval proposal");
    expect(proposal.preview.summary).toMatch(/karate/i);
    expect(proposal.preview.changes.length).toBeGreaterThan(1);
    expect(proposal.preview.because.length).toBeGreaterThan(10);
  });

  it("mark an irreversible action as such", () => {
    const payment = proposeFromIntent(intentFor("Pay the electricity bill."), ctx());
    if (payment.kind !== "needs_approval") throw new Error("expected an approval proposal");
    expect(payment.preview.reversible).toBe(false);

    const absence = proposeFromIntent(intentFor("Sunita won't be here tomorrow."), ctx());
    if (absence.kind !== "needs_approval") throw new Error("expected an approval proposal");
    expect(absence.preview.reversible).toBe(true);
  });

  it("name the knock-on effects, not just the change itself", () => {
    const proposal = proposeFromIntent(intentFor("Sunita won't be here tomorrow."), ctx());
    if (proposal.kind !== "needs_approval") throw new Error("expected an approval proposal");
    // The screens' example: an absence is not a note, it is a household impact.
    expect(proposal.preview.changes.join(" ")).toMatch(/outcomes they normally handle/i);
  });
});

describe("the fixture suite itself", () => {
  it("explains why each utterance reads the way it does", () => {
    for (const fixture of UTTERANCE_FIXTURES) {
      expect(fixture.note.length, `${fixture.utterance} needs a note`).toBeGreaterThan(20);
    }
  });

  it("covers both the confident and the ambiguous case for consequential actions", () => {
    const consequential = UTTERANCE_FIXTURES.filter((fixture) => isConsequential(fixture.action));
    expect(consequential.some((fixture) => fixture.confidence >= CLARIFY_BELOW_CONFIDENCE)).toBe(true);
    expect(consequential.some((fixture) => fixture.confidence < CLARIFY_BELOW_CONFIDENCE)).toBe(true);
  });

  it("has no duplicate utterances", () => {
    const seen = UTTERANCE_FIXTURES.map((fixture) => fixture.utterance.toLowerCase());
    expect(new Set(seen).size).toBe(seen.length);
  });
});
