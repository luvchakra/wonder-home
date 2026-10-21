import { describe, expect, it } from "vitest";

import { parseReply } from "../conversation/reply-format";
import { isoDaysInWords, personFacing, placeForSubject, placeOf, sayFact } from "./say";

describe("a fact as a person reads it (the owner, 2026-10-21)", () => {
  it("says an ISO day as a day and drops the agenda's action code", () => {
    expect(personFacing("Needs attention (urgent): Electricity — Electricity was due 21 days ago. (due 2026-10-01); suggested: pay_bill.")).toBe(
      "Needs attention (urgent): Electricity — Electricity was due 21 days ago. (due Thu 1 Oct).",
    );
    expect(personFacing("Kunal is an adult (the person asking).")).toBe("Kunal is an adult (you).");
  });

  it("leaves a day inside a link alone, and a timestamp becomes its day", () => {
    expect(isoDaysInWords("Due 2026-10-14T00:00:00Z → [Bills](/bills?due=2026-10-14)")).toBe("Due Wed 14 Oct → [Bills](/bills?due=2026-10-14)");
  });

  it("sends each kind of agenda row to the screen it is handled on", () => {
    expect(placeForSubject("bill.e-1")).toBe("/bills");
    expect(placeForSubject("anomaly.x")).toBe("/bills");
    expect(placeForSubject("asset.ac-1")).toBe("/household/home");
    expect(placeForSubject("pet.milo.food")).toBe("/household/home");
    expect(placeForSubject("school.s-1")).toBe("/school");
    expect(placeForSubject("order.o-1")).toBe("/groceries");
    expect(placeForSubject("meal.dinner-1")).toBe("/meals");
    expect(placeForSubject("event.e-1")).toBe("/calendar");
    expect(placeForSubject("appointment.a-1")).toBe("/health");
    expect(placeForSubject("something.else")).toBe("/");
    expect(placeOf("bills")).toBe("/bills");
    expect(placeOf("hometalk")).toBeNull();
  });

  it("every line is a real, rendered link — never a label left as plain text", () => {
    for (const domain of ["bills", "school", "calendar", "health", "home", "meals", "groceries", "people", "places", "homesend", "attention", "profile", "conflict"]) {
      const line = sayFact({ statement: "Something on 2026-10-01.", domain });
      const blocks = parseReply(`- ${line}`);
      const inlines = blocks[0]?.kind === "list" ? blocks[0].items[0]! : [];
      expect(inlines.some((inline) => inline.kind === "link"), `${domain}: ${line}`).toBe(true);
      expect(line).not.toContain("2026-10-01");
    }
  });

  it("a fact with no screen ends as a sentence, with no link", () => {
    expect(sayFact({ statement: "You asked about this earlier.", domain: "hometalk" })).toBe("You asked about this earlier.");
  });
});
