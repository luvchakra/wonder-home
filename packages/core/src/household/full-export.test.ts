import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  archiveFilename,
  AREA_LABELS,
  EXPORT_PAGE_SIZE,
  ExportUnavailableError,
  HEALTH_ARCHIVE,
  HEALTH_AREA,
  hasHealthContent,
  healthPasswordProblem,
  householdArchiveEntries,
  lockedFileName,
  RESET_MANIFEST,
  type ExportProgress,
} from "./full-export";
import { zipStream } from "./zip";
import { removeWithRetry } from "./reset-repository";

const HOUSEHOLD = "h-1";

function has(command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const HAS_7Z = has("7z", ["i"]);
const HAS_PYZIPPER = has("python3", ["-I", "-c", "import pyzipper"]);

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

const NOW = new Date("2026-11-20T10:00:00Z");
const input = (client: SupabaseClient, healthPassword?: string) => ({ supabase: client, householdId: HOUSEHOLD, householdName: "Sharma Home", requestedBy: "Asha", now: NOW, ...(healthPassword ? { healthPassword } : {}) });

async function entries(client: SupabaseClient, progress: ExportProgress, healthPassword?: string) {
  const out = new Map<string, string>();
  for await (const entry of householdArchiveEntries(input(client, healthPassword), progress)) {
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
      if (area === HEALTH_AREA) continue;
      for (const table of list) expect(JSON.parse(out.get(`data/${area}/${table}.json`)!)).toEqual([]);
    }
    const health = RESET_MANIFEST.areas[HEALTH_AREA]!;
    expect([...out.keys()].filter((name) => name.startsWith("data/"))).toHaveLength(tables.length - health.length);
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
    // Without a health password, health is not read at all (the route asks for one whenever there is any).
    expect([...out.keys()].some((name) => name.includes("health"))).toBe(false);
    const readme = out.get("README.txt")!;
    expect(readme).toContain("Sharma Home");
    expect(readme).toContain("1 records in");
    expect(readme).toContain("1 uploaded files");
    expect(readme).toMatch(/not in this download, as there were none you could see/);
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

describe("the health part, locked with the owner's password", () => {
  const PASSWORD = "our family's long phrase";
  const rows = { health_records: [{ id: "r-1", label: "Asha thyroid report", notes: "TSH high" }], health_vitals: [{ id: "v-1", kind: "bp", value: "150/95" }] };
  const files = { "health-records": { [`${HOUSEHOLD}/asha-thyroid-scan.jpg`]: "XRAY-PIXELS-OF-ASHA" }, "home-send": { [`${HOUSEHOLD}/bill.pdf`]: "PDF" } };

  async function archive(): Promise<{ dir: string; file: string; bytes: Buffer }> {
    const { client } = fakeClient({ ...rows, recipes: [{ id: 1, name: "Dal" }] }, files);
    const parts: Uint8Array[] = [];
    for await (const part of zipStream(householdArchiveEntries(input(client, PASSWORD)), NOW)) parts.push(part);
    const bytes = Buffer.concat(parts);
    const dir = mkdtempSync(join(tmpdir(), "wh-health-"));
    const file = join(dir, "download.zip");
    writeFileSync(file, bytes);
    return { dir, file, bytes };
  }

  it("never writes a health row, a health file or its stored name in clear", async () => {
    const { dir, bytes } = await archive();
    try {
      for (const secret of ["Asha thyroid report", "TSH high", "150/95", "XRAY-PIXELS-OF-ASHA", "asha-thyroid-scan"]) {
        expect(bytes.includes(Buffer.from(secret)), secret).toBe(false);
      }
      // The rest stays readable.
      expect(bytes.includes(Buffer.from('"name":"Dal"'))).toBe(true);
      expect(bytes.includes(Buffer.from("PDF"))).toBe(true);
      expect(bytes.includes(Buffer.from(HEALTH_ARCHIVE))).toBe(true);
      expect(bytes.includes(Buffer.from("HEALTH RECORDS: LOCKED WITH YOUR PASSWORD"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.runIf(HAS_7Z)("opens in 7-Zip with the password (and not with a wrong one), holding every health table and file", async () => {
    const { dir, file } = await archive();
    try {
      execFileSync("7z", ["x", `-o${join(dir, "outer")}`, "-y", file], { stdio: "ignore" });
      const inner = join(dir, "outer", HEALTH_ARCHIVE);
      expect(() => execFileSync("7z", ["x", "-pnot-the-password", `-o${join(dir, "bad")}`, "-y", inner], { stdio: "ignore" })).toThrow();
      execFileSync("7z", ["x", `-p${PASSWORD}`, `-o${join(dir, "inner")}`, "-y", inner], { stdio: "ignore" });
      expect(JSON.parse(readFileSync(join(dir, "inner/data/health/health_records.json"), "utf8"))).toEqual(rows.health_records);
      expect(JSON.parse(readFileSync(join(dir, "inner/data/health/health_vitals.json"), "utf8"))).toEqual(rows.health_vitals);
      expect(readFileSync(join(dir, "inner/files/health-records/file-001.jpg"), "utf8")).toBe("XRAY-PIXELS-OF-ASHA");
      expect(JSON.parse(readFileSync(join(dir, "inner/files/health-records/index.json"), "utf8"))).toEqual([{ file: "files/health-records/file-001.jpg", stored_as: "asha-thyroid-scan.jpg", bytes: 19 }]);
      for (const table of RESET_MANIFEST.areas[HEALTH_AREA]!) {
        expect(Array.isArray(JSON.parse(readFileSync(join(dir, `inner/data/health/${table}.json`), "utf8")))).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.runIf(HAS_PYZIPPER)("opens with pyzipper too, an independent reader", async () => {
    const { dir, file } = await archive();
    try {
      const script = [
        "import io, sys, zipfile, pyzipper",
        `inner = zipfile.ZipFile(sys.argv[1]).read(${JSON.stringify(HEALTH_ARCHIVE)})`,
        "z = pyzipper.AESZipFile(io.BytesIO(inner))",
        "z.setpassword(sys.argv[2].encode())",
        "print(z.read('files/health-records/file-001.jpg').decode())",
      ].join("\n");
      expect(execFileSync("python3", ["-I", "-c", script, file, PASSWORD], { encoding: "utf8" }).trim()).toBe("XRAY-PIXELS-OF-ASHA");
      expect(() => execFileSync("python3", ["-I", "-c", script, file, "not-the-password"], { stdio: "ignore" })).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("asks for a long, repeated password", () => {
    expect(healthPasswordProblem("short", "short")).toBe("too_short");
    expect(healthPasswordProblem("x".repeat(201), "x".repeat(201))).toBe("too_long");
    expect(healthPasswordProblem("twelve chars!", "twelve chars?")).toBe("mismatch");
    expect(healthPasswordProblem("twelve chars!", "twelve chars!")).toBeNull();
  });

  it("names a health file by number and extension only", () => {
    expect(lockedFileName(7, "h-1/Asha Thyroid.PDF")).toBe("files/health-records/file-007.pdf");
    expect(lockedFileName(12, "h-1/0f3a9c")).toBe("files/health-records/file-012");
  });

  it("knows when there is nothing to lock, so the download need not ask", async () => {
    expect(await hasHealthContent(fakeClient({ recipes: [{ id: 1 }] }, { "home-send": { [`${HOUSEHOLD}/a.pdf`]: "x" } }).client, HOUSEHOLD)).toBe(false);
    expect(await hasHealthContent(fakeClient({ health_vitals: [{ id: 1 }] }).client, HOUSEHOLD)).toBe(true);
    expect(await hasHealthContent(fakeClient({}, { "health-records": { [`${HOUSEHOLD}/a.jpg`]: "x" } }).client, HOUSEHOLD)).toBe(true);
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
