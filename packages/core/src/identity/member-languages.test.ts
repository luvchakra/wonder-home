import { describe, expect, it } from "vitest";

import { isFluency, languageName, normalizeLanguage, replaceMemberLanguages, spokenSummary } from "./member-languages";

describe("member languages", () => {
  it("names a code in the reader's language, and keeps a typed language as written", () => {
    expect(languageName("hi", "en")).toBe("Hindi");
    expect(languageName("hi", "hi")).toBe("हिन्दी");
    expect(languageName("Konkani", "en")).toBe("Konkani");
  });

  it("turns a typed name we offer into its code, and tidies the rest", () => {
    expect(normalizeLanguage(" hindi ")).toBe("hi");
    expect(normalizeLanguage("KN")).toBe("kn");
    expect(normalizeLanguage("  Tulu   Nadu ")).toBe("Tulu Nadu");
    expect(normalizeLanguage("   ")).toBeNull();
  });

  it("knows only the four levels", () => {
    expect(isFluency("fluent")).toBe(true);
    expect(isFluency("expert")).toBe(false);
  });

  it("tells the assistant the strongest language first", () => {
    expect(spokenSummary([{ language: "en", fluency: "conversational" }, { language: "mr", fluency: "native" }, { language: "Konkani", fluency: "basic" }])).toBe(
      "Marathi (native), English (conversational), Konkani (basic)",
    );
  });

  it("adds, changes and removes only what the form changed", async () => {
    const calls: string[] = [];
    const current = [{ language: "hi", fluency: "native" }, { language: "en", fluency: "basic" }, { language: "ta", fluency: "basic" }];
    const builder = (table: string) => ({
      select: () => ({ eq: () => ({ eq: async () => ({ data: current, error: null }) }) }),
      delete: () => ({ eq: () => ({ eq: () => ({ in: async (_column: string, values: string[]) => (calls.push(`delete ${values.join(",")}`), { error: null }) }) }) }),
      upsert: async (rows: { language: string; fluency: string }[]) => (calls.push(`upsert ${rows.map((row) => `${row.language}:${row.fluency}`).join(",")}`), { error: null }),
      table,
    });
    const supabase = { from: builder } as never;
    const result = await replaceMemberLanguages(supabase, {
      householdId: "h",
      memberId: "m",
      languages: [{ language: "hi", fluency: "native" }, { language: "English", fluency: "fluent" }, { language: "Konkani", fluency: "basic" }],
    });
    expect(result.changed).toBe(true);
    expect(calls).toEqual(["delete ta", "upsert en:fluent,Konkani:basic"]);
  });
});
