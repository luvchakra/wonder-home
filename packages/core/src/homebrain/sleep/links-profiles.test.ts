import { describe, expect, it } from "vitest";

import type { HouseholdContextItem } from "../../context/types";
import { speechFrom } from "../../hometalk/contract";
import { buildHouseholdGraph } from "../graph";
import { attachLinks, ruleLinks, validModelLinks } from "./links";
import { profileFacts } from "./profiles";
import { namesIn, withoutNames } from "./embeddings";

function item(id: string, overrides: Partial<HouseholdContextItem>): HouseholdContextItem {
  const [entityType, entityId] = id.split(":") as [string, string];
  return {
    id,
    householdId: "h",
    domain: "preferences",
    entityType,
    entityId,
    subjectMemberIds: [],
    summary: "",
    need: "",
    attributes: {},
    source: { type: "test", sourceId: entityId, capturedAt: null },
    evidence: [],
    confidence: 1,
    confirmed: true,
    privacyClass: "general",
    validFrom: null,
    validUntil: null,
    freshnessAt: "2026-10-19T00:00:00Z",
    freshness: "current",
    tier: 2,
    aliases: [],
    relatedEntityIds: [],
    ...overrides,
  } as HouseholdContextItem;
}

const asmi = item("member:asmi", { domain: "people", subjectMemberIds: ["asmi"], attributes: { displayName: "Asmi Mehta", memberType: "child" }, privacyClass: "child" });
const kunal = item("member:kunal", { domain: "people", subjectMemberIds: ["kunal"], attributes: { displayName: "Kunal Mehta", memberType: "adult" } });
const likesPasta = item("memory:m1", { summary: "Asmi likes pasta (registered).", subjectMemberIds: ["asmi"], privacyClass: "child", attributes: { value: { statement: "Asmi likes pasta", object: "pasta", stance: "likes" } } });
const dislikesOkra = item("memory:m2", { summary: "Asmi doesn't like okra (registered).", subjectMemberIds: ["asmi"], privacyClass: "child", attributes: { value: { statement: "Asmi doesn't like okra", object: "okra", stance: "dislikes" } } });
const pastaDinner = item("meal:d1", { domain: "meals", summary: "Dinner on 2026-10-23 is Pink sauce pasta.", attributes: { title: "Pink sauce pasta", date: "2026-10-23" } });
const okraLunch = item("meal:d2", { domain: "meals", summary: "Lunch on 2026-10-24 is Okra fry.", attributes: { title: "Okra fry", date: "2026-10-24" } });
const pizzaNight = item("event:e1", { domain: "calendar", summary: "Pizza night", subjectMemberIds: ["asmi"], attributes: { title: "Pizza night", date: "2026-10-25" } });
const father = item("relationship:r1", { domain: "people", subjectMemberIds: ["kunal", "asmi"], attributes: { relation: "father", memberId: "kunal", relatedMemberId: "asmi" } });

describe("associations (REM)", () => {
  it("links a liking to the meal that plans it, and a dislike to the meal that would upset it", () => {
    const links = ruleLinks([asmi, likesPasta, dislikesOkra, pastaDinner, okraLunch]);
    expect(links).toContainEqual(expect.objectContaining({ from: "memory:m1", to: "meal:d1", kind: "likes_what_is_planned" }));
    expect(links).toContainEqual(expect.objectContaining({ from: "memory:m2", to: "meal:d2", kind: "related", reason: expect.stringContaining("doesn't like okra") }));
    expect(links.some((link) => link.from === "memory:m1" && link.to === "meal:d2")).toBe(false);
  });

  it("reads a note kept only as a sentence, so an older note still links", () => {
    const old = item("memory:m9", { summary: "Kunal likes dal makhani (registered).", subjectMemberIds: ["kunal"], attributes: { value: { statement: "Kunal likes dal makhani" } } });
    const dal = item("meal:d9", { domain: "meals", attributes: { title: "Dal makhani", date: "2026-10-21" } });
    expect(ruleLinks([old, dal])).toContainEqual(expect.objectContaining({ from: "memory:m9", to: "meal:d9", kind: "likes_what_is_planned" }));
  });

  it("keeps a model's link only between records it was shown, of a known kind, across parts of the home", () => {
    const shown = new Map([["I1", likesPasta], ["I2", pizzaNight], ["I3", dislikesOkra]]);
    const valid = validModelLinks(
      [
        { from: "I1", to: "I2", kind: "related", reason: "Pasta and pizza night both suit Asmi" },
        { from: "I1", to: "I9", kind: "related", reason: "made up" },
        { from: "I1", to: "I3", kind: "related", reason: "same part of the home" },
        { from: "I2", to: "I1", kind: "friends_with", reason: "unknown kind" },
      ],
      shown,
    );
    expect(valid).toEqual([expect.objectContaining({ from: "memory:m1", to: "event:e1", byModel: true })]);
  });

  it("puts links on the items, and the graph follows one only when both ends are in the viewer's list", () => {
    const linked = attachLinks([likesPasta, pastaDinner], [{ from: "memory:m1", to: "meal:d1", kind: "likes_what_is_planned", reason: "r" }, { from: "memory:m1", to: "meal:hidden", kind: "related", reason: "r" }]);
    const graph = buildHouseholdGraph(linked);
    expect(graph.edges.filter((edge) => edge.kind === "associated")).toEqual([{ from: "memory:m1", to: "meal:d1", kind: "associated" }]);
  });
});

describe("a person at a glance", () => {
  it("brings what someone likes, who they are to the family and what is next into one fact", () => {
    const [profile] = profileFacts([asmi, kunal, likesPasta, dislikesOkra, pizzaNight, father], { memberIds: ["asmi"], today: "2026-10-20" });
    expect(profile).toMatchObject({ memberId: "asmi", privacyClass: "child" });
    expect(profile!.statement).toBe("Asmi at a glance: likes pasta; doesn't like okra; family: Kunal is their father; next: Pizza night on 2026-10-25");
  });

  it("reads a note kept only as a sentence, and leaves a resting one out", () => {
    const said = item("memory:m7", { subjectMemberIds: ["kunal"], attributes: { value: { statement: "Kunal likes dal makhani" } } });
    const resting = item("memory:m8", { subjectMemberIds: ["kunal"], attributes: { value: { statement: "Kunal likes jazz" }, resting: true } });
    expect(profileFacts([kunal, said, resting], { memberIds: ["kunal"], today: "2026-10-20" })[0]!.statement).toBe("Kunal at a glance: likes dal makhani");
  });

  it("leaves out health and money, and says nothing about someone with nothing on record", () => {
    const vital = item("health_issue:h1", { domain: "health", subjectMemberIds: ["kunal"], privacyClass: "health", summary: "Kunal has asthma." });
    expect(profileFacts([kunal, vital], { memberIds: ["kunal"], today: "2026-10-20" })).toEqual([]);
  });
});

describe("names never leave for meaning", () => {
  it("replaces every name a member goes by", () => {
    const names = namesIn([asmi, kunal]);
    expect(withoutNames("What does Asmi like? Kunal's dinner and Asmi Mehta's lunch", names)).toBe("What does someone like? someone dinner and someone lunch");
  });
});

describe("a spoken list fits the whole family", () => {
  it("reads each person's lines as one sentence, so nobody is cut off for 'and 10 more'", () => {
    const text = [
      "Here's what's on record about what the family likes:",
      "**Asmi**\n- Asmi likes Indian food\n- Asmi likes pasta\n- Asmi likes pink pasta\n- Asmi likes pizza\n- Asmi likes garlic bread\n- Asmi doesn't like Assamese food",
      "**Kunal**\n- Kunal likes North Indian food",
      "**Upasana**\n- Upasana likes Italian food\n- Upasana likes French food\n- Upasana likes Chinese food",
      "**Manan**\n- Manan likes home-cooked food",
    ].join("\n\n");
    const spoken = speechFrom(text);
    expect(spoken).toContain("Asmi likes Indian food, pasta, pink pasta, pizza and garlic bread; doesn't like Assamese food.");
    expect(spoken).toContain("Upasana likes Italian food, French food and Chinese food.");
    expect(spoken).toContain("Manan likes home-cooked food.");
    expect(spoken).not.toContain("more —");
  });
});
