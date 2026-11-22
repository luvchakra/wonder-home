import { describe, expect, it } from "vitest";
import { reidentifyIntent } from "./privacy";

const people = [{ id: "m-asmi", displayName: "Asmi Shah", role: "child" }] as unknown as Parameters<typeof reidentifyIntent>[3];
const pseudonyms = { "m-asmi": "Child A" };

describe("reidentifyIntent puts names back everywhere a model wrote a placeholder (I-26)", () => {
  it("restores an event target's reference and nested parameters", () => {
    const intent = reidentifyIntent(
      { utterance: "x", target: { kind: "event", reference: "Child A's birthday party" }, parameters: { items: [{ title: "Child A party" }], about: { who: "Child A" } } },
      "Who is coming to Asmi's birthday party?",
      pseudonyms,
      people,
    );
    expect(intent.target.reference).toBe("Asmi's birthday party");
    expect(JSON.stringify(intent.parameters)).not.toMatch(/Child A/);
  });
});
