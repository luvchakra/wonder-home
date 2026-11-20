import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { archiveFilename, AREA_LABELS, EXPORT_PAGE_SIZE, ExportUnavailableError, householdArchiveEntries, RESET_MANIFEST, type ExportProgress } from "./full-export";
import { removeWithRetry } from "./reset-repository";

const HOUSEHOLD = "h-1";

type Call = { table: string; offset: number };

/** A stand-in for the owner's client: rows per table, files per bucket. */
function fakeClient(rows: Record<string, unknown[]>, files: Record<string, Record<string, string>> = {}, options: { missing?: boolean } = {}) {
  const calls: Call[] = [];
  const client = {
    rpc: async (name: string, args: { p_table: string; p_offset: number; p_limit: number }) => {
      expect(name).toBe("household_export_rows");
      calls.push({ table: args.p_table, offset: args.p_offset });
      if (options.missing) return { data: null, error: { code: "PGRST202" } };
      const all = rows[args.p_table] ?? [];
      return { data: all.slice(args.p_offset, args.p_offset + args.p_limit), error: null };
    },
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string) => {
          const inBucket = files[bucket] ?? {};
          const names = new Map<string, boolean>();
          for (const path of Object.keys(inBucket)) {
            if (!path.startsWith(`${prefix}/`)) continue;
            const rest = path.slice(prefix.length + 1);
            const [head, ...tail] = rest.split("/");
            names.set(head!, tail.length > 0);
          }
          return { data: [...names].map(([name, folder]) => ({ name, id: folder ? null : `id-${name}` })), error: null };
        },
        download: async (path: string) => ({ data: new Blob([files[bucket]?.[path] ?? ""]), error: null }),
      }),
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

async function entries(client: SupabaseClient, progress: ExportProgress) {
  const out = new Map<string, string>();
  for await (const entry of householdArchiveEntries({ supabase: client, householdId: HOUSEHOLD, householdName: "Sharma Home", requestedBy: "Asha", now: new Date("2026-11-20T10:00:00Z") }, progress)) {
    let text = "";
    if (typeof entry.data === "string") text = entry.data;
    else if (entry.data instanceof Uint8Array) text = new TextDecoder().decode(entry.data);
    else for await (const chunk of entry.data) text += new TextDecoder().decode(chunk);
    out.set(entry.name, text);
  }
  return out;
}

describe("the full household download (story 15-014)", () => {
  it("has one JSON file per classified table, every area labelled, and no secret table", async () => {
    const { client } = fakeClient({});
    const out = await entries(client, { tables: [], files: [] });
    const tables = Object.values(RESET_MANIFEST.areas).flat();
    for (const [area, list] of Object.entries(RESET_MANIFEST.areas)) {
      expect(AREA_LABELS[area], `a README label for ${area}`).toBeTruthy();
      for (const table of list) expect(JSON.parse(out.get(`data/${area}/${table}.json`)!)).toEqual([]);
    }
    expect([...out.keys()].filter((name) => name.startsWith("data/"))).toHaveLength(tables.length);
    for (const secret of Object.keys(RESET_MANIFEST.notExported)) {
      expect([...out.keys()].some((name) => name.endsWith(`/${secret}.json`))).toBe(false);
    }
    expect(Object.keys(RESET_MANIFEST.notExported)).toEqual(expect.arrayContaining(["household_ai_credentials", "school_portal_credentials", "instamart_tokens", "push_subscriptions"]));
  });

  it("pages a big table and writes valid JSON with every row", async () => {
    const many = Array.from({ length: EXPORT_PAGE_SIZE * 2 + 3 }, (_, i) => ({ id: i, name: `Recipe ${i}` }));
    const { client, calls } = fakeClient({ recipes: many, household_members: [{ id: "m-1", display_name: "Asha" }] });
    const progress: ExportProgress = { tables: [], files: [] };
    const out = await entries(client, progress);
    expect(JSON.parse(out.get("data/meals-and-recipes/recipes.json")!)).toEqual(many);
    expect(calls.filter((call) => call.table === "recipes").map((call) => call.offset)).toEqual([0, EXPORT_PAGE_SIZE, EXPORT_PAGE_SIZE * 2]);
    expect(JSON.parse(out.get("data/people/household_members.json")!)).toEqual([{ id: "m-1", display_name: "Asha" }]);
    expect(progress.tables.find((table) => table.table === "recipes")?.rows).toBe(many.length);
  });

  it("includes the uploaded files under files/<store>/ and the README says what is in it and what is not", async () => {
    const { client } = fakeClient(
      { recipes: [{ id: 1 }] },
      { "home-send": { [`${HOUSEHOLD}/2026/bill.pdf`]: "PDF" }, "health-records": { [`${HOUSEHOLD}/scan.jpg`]: "JPG" } },
    );
    const out = await entries(client, { tables: [], files: [] });
    expect(out.get("files/home-send/2026/bill.pdf")).toBe("PDF");
    expect(out.get("files/health-records/scan.jpg")).toBe("JPG");
    const readme = out.get("README.txt")!;
    expect(readme).toContain("Sharma Home");
    expect(readme).toContain("1 records in");
    expect(readme).toContain("2 uploaded files");
    expect(readme).toMatch(/Other members' private health records/);
    expect(readme).toMatch(/Secrets are never included/);
    expect(readme).toContain("data/meals-and-recipes/");
  });

  it("refuses plainly when the database function is not there yet", async () => {
    const { client } = fakeClient({}, {}, { missing: true });
    await expect(entries(client, { tables: [], files: [] })).rejects.toBeInstanceOf(ExportUnavailableError);
  });

  it("names the file after the home and the day", () => {
    expect(archiveFilename("Sharma Home!", new Date("2026-11-20T10:00:00Z"))).toBe("wonderhome-sharma-home-2026-11-20.zip");
    expect(archiveFilename("घर", new Date("2026-11-20T10:00:00Z"))).toBe("wonderhome-home-2026-11-20.zip");
  });
});

describe("removing a reset home's files", () => {
  it("retries a failed batch and reports only what is still there", async () => {
    let calls = 0;
    const left = await removeWithRetry(async (batch) => {
      calls += 1;
      if (batch.includes("stuck")) return { error: new Error("no") };
      return { error: calls === 1 ? new Error("blip") : null };
    }, ["a", "b"]);
    expect(left).toEqual([]);
    const stuck = await removeWithRetry(async (batch) => ({ error: batch.includes("stuck") ? new Error("no") : null }), ["stuck"]);
    expect(stuck).toEqual(["stuck"]);
  });
});
