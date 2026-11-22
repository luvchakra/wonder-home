import { describe, expect, it } from "vitest";
import { acknowledgementFor } from "./intake";

describe("a suspected scam's WhatsApp reply (owner, 2026-11-22)", () => {
  it("warns without repeating the amount or the link", () => {
    const reply = acknowledgementFor({
      itemId: "i1",
      duplicate: false,
      state: "failed",
      setAside: "suspected_scam",
      notice: "",
      item: { id: "i1", classifiedKind: "unknown", extracted: null, understanding: null },
    });
    expect(reply.asks).toBe(false);
    expect(reply.text).toMatch(/scam/i);
    expect(reply.text).not.toMatch(/\d|http|bit\.ly/);
  });
});
