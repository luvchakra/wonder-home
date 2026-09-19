import { describe, expect, it } from "vitest";

import type { AutonomyMode } from "./autonomy";
import {
  CONFIG_UTTERANCE_FIXTURES,
  UNDERSTOOD_SHAPES,
  proposeConfiguration,
  readConfigurationSentence,
  type ProposalContext,
} from "./configuration-intent";
import type { ConfigMember } from "./configuration";

/**
 * Configuring by conversation (story 02-006).
 *
 * The fixtures are the regression suite the criterion asks for, and they are
 * asserted twice over: that each sentence is read the way the household meant
 * it, and that the sentences deliberately left unreadable stay unreadable. A
 * grammar that quietly starts answering "sort out the house" is a grammar that
 * has started guessing.
 */

const MEMBERS: ConfigMember[] = [
  { id: "11111111-1111-4111-8111-111111111111", displayName: "Priya Nair", memberType: "adult" },
  { id: "22222222-2222-4222-8222-222222222222", displayName: "Ravi Nair", memberType: "adult" },
  { id: "33333333-3333-4333-8333-333333333333", displayName: "Meera Nair", memberType: "adult" },
  { id: "44444444-4444-4444-8444-444444444444", displayName: "Aarav Nair", memberType: "child" },
];

function context(overrides: Partial<ProposalContext> = {}): ProposalContext {
  return {
    members: MEMBERS,
    existing: [],
    nextVersionFor: () => 1,
    ...overrides,
  };
}

describe("reading a household sentence", () => {
  for (const fixture of CONFIG_UTTERANCE_FIXTURES) {
    it(`reads "${fixture.utterance}" — ${fixture.note}`, () => {
      expect(readConfigurationSentence(fixture.utterance)).toEqual(fixture.expect);
    });
  }

  it("every shape it advertises is a shape it can actually read", () => {
    // The screen shows UNDERSTOOD_SHAPES as "here is what you can say". An
    // example that does not parse is worse than no example at all.
    for (const shape of UNDERSTOOD_SHAPES) {
      expect(readConfigurationSentence(shape.example).kind, shape.example).not.toBe("unknown");
    }
  });

  it("ignores case and a trailing full stop", () => {
    expect(readConfigurationSentence("PRIYA HANDLES THE SCHOOL RUN")).toEqual(
      readConfigurationSentence("Priya handles the school run."),
    );
  });

  it("does not read a sentence with no outcome in it", () => {
    expect(readConfigurationSentence("Priya handles that.").kind).toBe("unknown");
  });

  it("refuses an hour range that starts and ends at the same hour", () => {
    // The forms refuse it, so a sentence must not be a way around the rule.
    expect(readConfigurationSentence("No notifications between 9pm and 9pm").kind).toBe("unknown");
  });

  it("reads a quiet window that wraps past midnight", () => {
    expect(readConfigurationSentence("No notifications from 22:00 until 06:00")).toEqual({
      kind: "quiet_hours",
      startHour: 22,
      endHour: 6,
    });
  });
});

describe("proposing a change", () => {
  it("gives an outcome an owner, and says what that means", () => {
    const proposal = proposeConfiguration("Priya handles the school run from now on.", context());

    expect(proposal.kind).toBe("change");
    if (proposal.kind !== "change") return;

    expect(proposal.summary).toBe("Priya Nair owns the school run.");
    expect(proposal.change).toEqual({
      kind: "responsibility",
      responsibility: {
        outcomeKey: "school.run",
        primaryMemberId: MEMBERS[0]!.id,
        backupMemberId: null,
        aiMode: "prepare",
        priority: 3,
      },
    });
    expect(proposal.downstream.length).toBeGreaterThan(0);
  });

  it("keeps the person being replaced on as backup", () => {
    const proposal = proposeConfiguration("Priya handles the school run from now on.", context({
      existing: [
        {
          outcomeKey: "school.run",
          primaryMemberId: MEMBERS[1]!.id,
          backupMemberId: null,
          aiMode: "approve",
          priority: 2,
        },
      ],
    }));

    expect(proposal.kind).toBe("change");
    if (proposal.kind !== "change" || proposal.change.kind !== "responsibility") return;

    expect(proposal.change.responsibility.primaryMemberId).toBe(MEMBERS[0]!.id);
    expect(proposal.change.responsibility.backupMemberId).toBe(MEMBERS[1]!.id);
    // A handover does not quietly reset how much WonderHome may do.
    expect(proposal.change.responsibility.aiMode).toBe("approve");
    expect(proposal.downstream.join(" ")).toContain("Ravi Nair stays on as backup");
  });

  it("asks when the named person is not in the household", () => {
    const proposal = proposeConfiguration("Kabir handles the school run.", context());

    expect(proposal.kind).toBe("clarify");
    if (proposal.kind !== "clarify") return;
    expect(proposal.question).toContain("Kabir");
  });

  it("asks rather than picking between two people with the same first name", () => {
    const proposal = proposeConfiguration("Ravi handles the bills.", context({
      members: [...MEMBERS, { id: "55555555-5555-4555-8555-555555555555", displayName: "Ravi Menon", memberType: "adult" }],
    }));

    expect(proposal.kind).toBe("clarify");
    if (proposal.kind !== "clarify") return;
    expect(proposal.question).toContain("more than one");
    expect(proposal.examples).toHaveLength(2);
  });

  it("refuses to put a child in charge of the money, however it is phrased", () => {
    const proposal = proposeConfiguration("Aarav is responsible for the bills.", context());

    expect(proposal.kind).toBe("refused");
    if (proposal.kind !== "refused") return;
    expect(proposal.reason.length).toBeGreaterThan(0);
  });

  it("will not set autonomy on an outcome nobody owns", () => {
    // Deciding how far WonderHome may go on something with no owner is
    // deciding on nobody's behalf.
    const proposal = proposeConfiguration("Handle the laundry yourself.", context());

    expect(proposal.kind).toBe("clarify");
    if (proposal.kind !== "clarify") return;
    expect(proposal.question).toContain("Nobody owns");
  });

  it("changes autonomy on an owned outcome and spells out what it agreed to", () => {
    const proposal = proposeConfiguration("Handle the laundry yourself.", context({
      existing: [
        {
          outcomeKey: "laundry.ready",
          primaryMemberId: MEMBERS[2]!.id,
          backupMemberId: null,
          aiMode: "prepare",
          priority: 3,
        },
      ],
    }));

    expect(proposal.kind).toBe("change");
    if (proposal.kind !== "change" || proposal.change.kind !== "responsibility") return;

    expect(proposal.change.responsibility.aiMode).toBe("execute");
    expect(proposal.change.responsibility.primaryMemberId).toBe(MEMBERS[2]!.id);
    expect(proposal.downstream.join(" ")).toContain("autonomy never overrides a policy");
  });

  it("every autonomy level is reachable by sentence", () => {
    const existing = [
      {
        outcomeKey: "finance.bills_paid",
        primaryMemberId: MEMBERS[1]!.id,
        backupMemberId: null,
        aiMode: "prepare" as AutonomyMode,
        priority: 3,
      },
    ];
    const said: Record<AutonomyMode, string> = {
      observe: "Just watch the bills for now.",
      prepare: "Get the bills ready and leave it to me.",
      approve: "Ask me before paying the bills.",
      execute: "Handle the bills yourself.",
    };

    for (const [mode, utterance] of Object.entries(said)) {
      const proposal = proposeConfiguration(utterance, context({ existing }));
      expect(proposal.kind, utterance).toBe("change");
      if (proposal.kind !== "change" || proposal.change.kind !== "responsibility") continue;
      expect(proposal.change.responsibility.aiMode, utterance).toBe(mode);
    }
  });

  it("turns a spending sentence into a versioned policy", () => {
    const proposal = proposeConfiguration("Never spend more than ₹2,000 without asking me.", context({
      nextVersionFor: () => 3,
    }));

    expect(proposal.kind).toBe("change");
    if (proposal.kind !== "change" || proposal.change.kind !== "policy") return;

    expect(proposal.change.category).toBe("spending");
    expect(proposal.change.rule.limitMinor).toBe(200000);
    expect(proposal.summary).toContain("₹2,000");
    expect(proposal.downstream.join(" ")).toContain("version 3");
    expect(proposal.downstream.join(" ")).toContain("neither a screen nor the assistant");
  });

  it("keeps the household's own words on the policy", () => {
    const proposal = proposeConfiguration("Never spend more than ₹2,000 without asking me.", context());

    if (proposal.kind !== "change" || proposal.change.kind !== "policy") throw new Error("expected a policy");
    expect(proposal.change.rule.note).toBe("Never spend more than ₹2,000 without asking me.");
  });

  it("promises that something urgent still gets through quiet hours", () => {
    const proposal = proposeConfiguration("No notifications between 9pm and 7am.", context());

    expect(proposal.kind).toBe("change");
    if (proposal.kind !== "change" || proposal.change.kind !== "policy") return;

    expect(proposal.change.category).toBe("notifications");
    expect(proposal.change.rule).toMatchObject({ quietFromHour: 21, quietUntilHour: 7 });
    expect(proposal.downstream.join(" ")).toContain("urgent");
  });

  it("protects family time", () => {
    const proposal = proposeConfiguration("Sunday lunch is family time, 1pm to 3pm.", context());

    expect(proposal.kind).toBe("change");
    if (proposal.kind !== "change" || proposal.change.kind !== "policy") return;

    expect(proposal.change.category).toBe("family_time");
    expect(proposal.change.name).toBe("Sunday Lunch");
    expect(proposal.change.rule).toMatchObject({ startHour: 13, endHour: 15, protected: true });
  });

  it("asks, with examples, when it did not follow the sentence", () => {
    const proposal = proposeConfiguration("Sort out the house.", context());

    expect(proposal.kind).toBe("clarify");
    if (proposal.kind !== "clarify") return;
    expect(proposal.examples.length).toBe(UNDERSTOOD_SHAPES.length);
  });

  it("never returns a change nobody has seen the consequences of", () => {
    // The criterion is that a configuration change shows its downstream
    // behaviours. A change with an empty preview would satisfy the type and
    // break the promise.
    for (const fixture of CONFIG_UTTERANCE_FIXTURES) {
      const proposal = proposeConfiguration(fixture.utterance, context({
        existing: [
          {
            outcomeKey: fixture.expect.kind === "autonomy" ? fixture.expect.outcomeKey : "unused",
            primaryMemberId: MEMBERS[1]!.id,
            backupMemberId: null,
            aiMode: "prepare",
            priority: 3,
          },
        ],
      }));

      if (proposal.kind === "change") {
        expect(proposal.downstream.length, fixture.utterance).toBeGreaterThan(0);
        expect(proposal.summary.length, fixture.utterance).toBeGreaterThan(0);
      }
    }
  });
});
