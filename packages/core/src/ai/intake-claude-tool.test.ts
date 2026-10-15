import { describe, expect, it } from "vitest";

import { CLAUDE_INTAKE_TOOL, unwrapToolInput, withAbsentAsNull } from "./classify-intake";

/**
 * Claude reads HomeSend intake through a non-strict tool, because the intake
 * schema is past what strict structured output will compile. A non-strict
 * tool may leave out a key it had nothing for; absent reads as "not shown".
 */

const schema = CLAUDE_INTAKE_TOOL.input_schema;

describe("withAbsentAsNull", () => {
  it("fills every absent nullable field with null and every absent list with an empty one", () => {
    const filled = withAbsentAsNull({ readable: true, kind: "bill", change: "new", confidence: "high", pages: {} }, schema) as Record<string, unknown>;

    for (const key of ["title", "notes", "payee", "amount", "dueDate", "summary", "issuedOn"]) expect(filled[key]).toBeNull();
    for (const key of ["lines", "people", "facts", "needs", "records"]) expect(filled[key]).toEqual([]);
    expect(filled.pages).toEqual({ total: null, unreadable: [] });
  });

  it("never changes what was sent, and fills inside nested records too", () => {
    const filled = withAbsentAsNull(
      { readable: true, kind: "school_item", title: "Sports day", amount: 0, records: [{ domain: "school_item", title: "Sports day", change: "new" }] },
      schema,
    ) as { title: unknown; amount: unknown; records: Record<string, unknown>[] };

    expect(filled.title).toBe("Sports day");
    expect(filled.amount).toBe(0);
    expect(filled.records[0]!.title).toBe("Sports day");
    expect(filled.records[0]!.notes).toBeNull();
  });

  it("does not invent a value for a required field that is not nullable", () => {
    const filled = withAbsentAsNull({ readable: true }, schema) as Record<string, unknown>;
    expect(filled.kind).toBeUndefined();
    expect(filled.confidence).toBeUndefined();
  });
});

describe("unwrapToolInput", () => {
  const reading = { readable: true, kind: "grocery_item", title: "Milk", change: "new", confidence: "high" };

  it.each(["data", "query", "input"])("unwraps a reading nested under %s, as Claude sometimes sends it", (key) => {
    expect(unwrapToolInput({ [key]: reading }, schema)).toEqual(reading);
  });

  it("leaves a genuine reading exactly as it is", () => {
    expect(unwrapToolInput(reading, schema)).toBe(reading);
    const withPages = { readable: true, pages: { total: 2, unreadable: [] } };
    expect(unwrapToolInput(withPages, schema)).toBe(withPages);
  });

  it("does not unwrap a single key whose value is not a reading, or several keys", () => {
    const stray = { note: { text: "hello" } };
    expect(unwrapToolInput(stray, schema)).toBe(stray);
    const two = { data: reading, extra: reading };
    expect(unwrapToolInput(two, schema)).toBe(two);
  });
});
