import { describe, expect, it } from "vitest";

import { negotiateLanguage } from "./negotiate";

describe("negotiateLanguage", () => {
  it("matches a regional tag to the language WonderHome speaks", () => {
    expect(negotiateLanguage("zh-SG,zh;q=0.9")).toBe("zh");
    expect(negotiateLanguage("hi-IN")).toBe("hi");
    expect(negotiateLanguage("mr-IN,en;q=0.5")).toBe("mr");
    expect(negotiateLanguage("ar-AE,ar;q=0.9,en;q=0.8")).toBe("ar");
    expect(negotiateLanguage("de-DE")).toBe("de");
    expect(negotiateLanguage("FR-ca")).toBe("fr");
  });

  it("is English when nothing matches, or nothing is sent", () => {
    expect(negotiateLanguage("pt-BR")).toBe("en");
    expect(negotiateLanguage("pt-BR,pt;q=0.9")).toBe("en");
    expect(negotiateLanguage("")).toBe("en");
    expect(negotiateLanguage(null)).toBe("en");
    expect(negotiateLanguage(undefined)).toBe("en");
    expect(negotiateLanguage("*")).toBe("en");
    expect(negotiateLanguage(";;;,,,q=abc")).toBe("en");
  });

  it("falls through to the next language listed, never to a neighbour", () => {
    expect(negotiateLanguage("pt-BR,es;q=0.8,en;q=0.5")).toBe("es");
    expect(negotiateLanguage("ur-PK,hi;q=0.7")).toBe("hi");
  });

  it("respects q-values rather than the order written", () => {
    expect(negotiateLanguage("en;q=0.3,fr;q=0.9")).toBe("fr");
    expect(negotiateLanguage("es;q=0.5, de;q=0.8, zh;q=0.6")).toBe("de");
    // An equal weight keeps the browser's own order.
    expect(negotiateLanguage("es;q=0.5,de;q=0.5")).toBe("es");
  });

  it("never picks a language the browser refused with q=0", () => {
    expect(negotiateLanguage("hi;q=0,pt")).toBe("en");
    expect(negotiateLanguage("hi;q=0,mr;q=0.4")).toBe("mr");
  });
});
