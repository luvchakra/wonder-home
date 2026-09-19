import { describe, expect, it } from "vitest";

import {
  CONTENT_CLASSES,
  DEFAULT_DATA_USE,
  NO_PROVIDER_DATA_USE,
  dataUseFromRule,
  describeDataUse,
  minimiseContext,
  routeToProvider,
  type ContextCandidate,
  type DataUsePolicy,
  type Person,
} from "./privacy";

/**
 * The AI privacy gate (story 15-005).
 *
 * These are release-blocking tests. Everything here is about content not
 * leaving, so a test that passes for the wrong reason is worse than no test:
 * each one names the specific thing that must not happen.
 */

const PEOPLE: Person[] = [
  { id: "a1", displayName: "Priya Nair", memberType: "adult" },
  { id: "b2", displayName: "Aarav Nair", memberType: "child" },
  { id: "c3", displayName: "Sunita", memberType: "helper" },
];

function candidate(overrides: Partial<ContextCandidate> = {}): ContextCandidate {
  return {
    id: "x",
    contentClass: "general",
    need: "what is on today",
    text: "Dinner is at 8.",
    relevant: true,
    ...overrides,
  };
}

function policy(overrides: Partial<DataUsePolicy> = {}): DataUsePolicy {
  return { ...DEFAULT_DATA_USE, ...overrides };
}

describe("the default, before a household has said anything", () => {
  it("allows ordinary household matters and nothing else", () => {
    expect(DEFAULT_DATA_USE.allowedClasses).toEqual(["general"]);
  });

  it("does not agree to retention on the household's behalf", () => {
    expect(DEFAULT_DATA_USE.allowRetention).toBe(false);
  });

  it("holds back a child, health, money, whereabouts and private messages", () => {
    const sensitive = CONTENT_CLASSES.filter((entry) => entry !== "general" && entry !== "credential");

    const result = minimiseContext(
      sensitive.map((contentClass) => candidate({ id: contentClass, contentClass })),
      { policy: DEFAULT_DATA_USE, people: PEOPLE },
    );

    expect(result.included).toHaveLength(0);
    expect(result.withheld.map((entry) => entry.reason)).toEqual(sensitive.map(() => "class_not_permitted"));
  });
});

describe("what a household may never agree to", () => {
  it("refuses to parse a credential class into an allowed list", () => {
    const parsed = dataUseFromRule({ allowedClasses: ["general", "credential", "child"] });
    expect(parsed.allowedClasses).toEqual(["general", "child"]);
  });

  it("withholds a credential even when the policy somehow names it", () => {
    // Belt and braces: the parser strips it, and the filter would still
    // catch it if a policy reached here another way.
    const result = minimiseContext([candidate({ id: "token", contentClass: "credential" })], {
      policy: policy({ allowedClasses: [...CONTENT_CLASSES] }),
      people: PEOPLE,
    });

    expect(result.included).toHaveLength(0);
    expect(result.withheld[0]).toMatchObject({ id: "token", reason: "never_transmitted" });
  });
});

describe("reading the household's policy row", () => {
  it("falls back to the default when the rule is missing or unreadable", () => {
    expect(dataUseFromRule(null)).toEqual(DEFAULT_DATA_USE);
    expect(dataUseFromRule("nonsense")).toEqual(DEFAULT_DATA_USE);
    expect(dataUseFromRule({})).toEqual(DEFAULT_DATA_USE);
  });

  it("does not let an unparseable value become a permissive one", () => {
    const parsed = dataUseFromRule({ allowedClasses: ["nonsense", "child"], allowedProviders: ["acme"] });
    expect(parsed.allowedClasses).toEqual(["child"]);
    expect(parsed.allowedProviders).toEqual([]);
  });

  it("caps how much may be sent in one turn", () => {
    expect(dataUseFromRule({ maxItems: 5000 }).maxItems).toBe(50);
    expect(dataUseFromRule({ maxItems: 0 }).maxItems).toBe(DEFAULT_DATA_USE.maxItems);
    expect(dataUseFromRule({ maxItems: 2.5 }).maxItems).toBe(DEFAULT_DATA_USE.maxItems);
  });

  it("takes an explicit refusal seriously", () => {
    expect(dataUseFromRule({ allowProviderContent: false }).allowProviderContent).toBe(false);
  });
});

describe("routing to a provider", () => {
  it("refuses before anything is assembled when the household has said no", () => {
    const decision = routeToProvider({
      provider: "anthropic",
      keySource: "platform",
      policy: NO_PROVIDER_DATA_USE,
      hasContent: true,
    });

    expect(decision).toMatchObject({ ok: false, code: "provider_content_not_allowed" });
  });

  it("refuses a provider the household has not agreed to, even with a key for it", () => {
    const decision = routeToProvider({
      provider: "openai",
      keySource: "household",
      policy: policy({ allowedProviders: ["anthropic"] }),
      hasContent: true,
    });

    expect(decision).toMatchObject({ ok: false, code: "provider_not_allowed" });
    if (decision.ok) return;
    expect(decision.reason).toContain("openai");
  });

  it("refuses when no provider is configured", () => {
    expect(
      routeToProvider({ provider: null, keySource: "none", policy: policy(), hasContent: true }),
    ).toMatchObject({ ok: false, code: "no_provider_configured" });
  });

  it("does not make an empty round trip when everything was withheld", () => {
    // An empty request still tells a provider that this household asked
    // something, and it cannot be answered.
    expect(
      routeToProvider({ provider: "anthropic", keySource: "platform", policy: policy(), hasContent: false }),
    ).toMatchObject({ ok: false, code: "nothing_to_send" });
  });

  it("allows a permitted provider and carries the retention term", () => {
    const decision = routeToProvider({
      provider: "anthropic",
      keySource: "household",
      policy: policy({ allowRetention: true }),
      hasContent: true,
    });

    expect(decision).toEqual({ ok: true, provider: "anthropic", keySource: "household", retention: true });
  });

  it("a household's own key does not widen which classes may be sent", () => {
    // BYOK changes whose agreement with the provider governs the call. It
    // does not make a child's information the household's to trade.
    const own = minimiseContext([candidate({ contentClass: "child" })], {
      policy: policy(),
      people: PEOPLE,
    });
    expect(own.included).toHaveLength(0);
  });
});

describe("minimising what goes out", () => {
  it("sends only what the turn actually needs", () => {
    const result = minimiseContext(
      [
        candidate({ id: "needed", text: "Dinner is at 8." }),
        candidate({ id: "spare", text: "The car was serviced in March.", relevant: false }),
      ],
      { policy: policy(), people: PEOPLE },
    );

    expect(result.included.map((entry) => entry.id)).toEqual(["needed"]);
    expect(result.withheld[0]).toMatchObject({ id: "spare", reason: "not_relevant" });
  });

  it("stops at the household's budget rather than sending everything relevant", () => {
    const many = Array.from({ length: 5 }, (_, index) => candidate({ id: `i${index}` }));
    const result = minimiseContext(many, { policy: policy({ maxItems: 2 }), people: PEOPLE });

    expect(result.included).toHaveLength(2);
    expect(result.withheld.every((entry) => entry.reason === "over_budget")).toBe(true);
  });

  it("replaces names with roles before anything leaves", () => {
    const result = minimiseContext(
      [candidate({ text: "Priya Nair is collecting Aarav, and Sunita will cook." })],
      { policy: policy(), people: PEOPLE },
    );

    const sent = result.included[0]!.text;
    expect(sent).not.toContain("Priya");
    expect(sent).not.toContain("Aarav");
    expect(sent).not.toContain("Sunita");
    expect(sent).toContain("Adult A");
    expect(sent).toContain("Child A");
    expect(sent).toContain("Helper A");
  });

  it("replaces a full name rather than leaving the surname behind", () => {
    const result = minimiseContext([candidate({ text: "Ask Priya Nair." })], {
      policy: policy(),
      people: PEOPLE,
    });

    expect(result.included[0]!.text).not.toContain("Nair");
  });

  it("gives the same person the same placeholder every turn", () => {
    const first = minimiseContext([candidate({ text: "Priya is away." })], { policy: policy(), people: PEOPLE });
    const second = minimiseContext([candidate({ text: "Priya is back." })], { policy: policy(), people: PEOPLE });

    expect(first.pseudonyms).toEqual(second.pseudonyms);
    expect(first.included[0]!.text).toContain(second.pseudonyms.a1!);
  });

  it("keeps the mapping back to real people on this side only", () => {
    const result = minimiseContext([candidate({ text: "Priya is away." })], {
      policy: policy(),
      people: PEOPLE,
    });

    // The mapping exists so an answer can be read back — and every name in it
    // is absent from everything that goes out.
    expect(Object.keys(result.pseudonyms)).toEqual(["a1", "b2", "c3"]);
    for (const person of PEOPLE) {
      expect(result.included.map((entry) => entry.text).join(" ")).not.toContain(person.displayName);
    }
  });

  it("can tell the household exactly what went out and what did not", () => {
    const result = minimiseContext(
      [
        candidate({ id: "one", need: "what is on today" }),
        candidate({ id: "two", contentClass: "financial", need: "the electricity bill" }),
      ],
      { policy: policy(), people: PEOPLE },
    );

    expect(result.disclosure.join(" ")).toContain("1 thing");
    expect(result.disclosure.join(" ")).toContain("what is on today");
    expect(result.disclosure.join(" ")).toContain("1 thing was held back");
  });

  it("says plainly when nothing was sent", () => {
    const result = minimiseContext([candidate({ relevant: false })], { policy: policy(), people: PEOPLE });
    expect(result.disclosure).toEqual(["Nothing about your home was sent."]);
  });

  it("gives the most fundamental reason when several apply", () => {
    // Irrelevant and a credential: the credential rule is the one that would
    // still hold if the turn needed it.
    const result = minimiseContext([candidate({ contentClass: "credential", relevant: false })], {
      policy: policy(),
      people: PEOPLE,
    });

    expect(result.withheld[0]!.reason).toBe("never_transmitted");
  });
});

describe("telling a household what they have agreed to", () => {
  it("says so plainly when nothing is sent at all", () => {
    expect(describeDataUse(NO_PROVIDER_DATA_USE).join(" ")).toContain("Nothing about your home is sent");
  });

  it("always mentions the two things that hold whatever they agreed", () => {
    for (const p of [policy(), policy({ allowedClasses: ["general", "child"], allowRetention: true })]) {
      const said = describeDataUse(p).join(" ");
      expect(said).toContain("Keys and tokens are never sent");
      expect(said).toContain("Names are replaced");
    }
  });

  it("names the extra classes a household has opted into", () => {
    const said = describeDataUse(policy({ allowedClasses: ["general", "child", "health"] })).join(" ");
    expect(said).toContain("information about your children");
    expect(said).toContain("health information");
  });
});
