import { describe, expect, it } from "vitest";

import { itemHash, selectNew, type PortalItemIdentity } from "./dedupe";

const item = (over: Partial<PortalItemIdentity>): PortalItemIdentity => ({
  connectionId: "c1",
  sourceUrl: "https://portal.example.com/task/list",
  kind: "homework",
  title: "Maths worksheet 3",
  occurredOn: "2026-10-27",
  ...over,
});

describe("itemHash", () => {
  it("is stable across whitespace and case in the title", () => {
    expect(itemHash(item({ title: "Maths worksheet 3" }))).toBe(itemHash(item({ title: "  maths   WORKSHEET 3 " })));
  });

  it("differs by day, kind and connection", () => {
    expect(itemHash(item({ occurredOn: "2026-10-27" }))).not.toBe(itemHash(item({ occurredOn: "2026-10-28" })));
    expect(itemHash(item({ kind: "homework" }))).not.toBe(itemHash(item({ kind: "message" })));
    expect(itemHash(item({ connectionId: "c1" }))).not.toBe(itemHash(item({ connectionId: "c2" })));
  });
});

describe("selectNew", () => {
  it("drops items already in the cursor and keeps input order", () => {
    const a = item({ title: "A" });
    const b = item({ title: "B" });
    const c = item({ title: "C" });
    const { fresh, hashes } = selectNew([a, b, c], [itemHash(b)]);
    expect(fresh.map((i) => i.title)).toEqual(["A", "C"]);
    expect(hashes).toEqual([itemHash(a), itemHash(c)]);
  });

  it("collapses duplicates within the same batch", () => {
    const a = item({ title: "A" });
    const { fresh } = selectNew([a, item({ title: " a " }), a], []);
    expect(fresh).toHaveLength(1);
  });
});
