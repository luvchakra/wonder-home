import type { SupabaseClient } from "@supabase/supabase-js";

import manifest from "./reset-tables.json";
import type { ZipEntry } from "./zip";

/**
 * The full household download (story 15-014): one ZIP, a JSON file per table
 * grouped by area, the uploaded files, and a README saying what each is.
 *
 * Read with the **owner's own session**: every page comes from
 * `public.household_export_rows`, a security-invoker function, so row level
 * security and column grants apply exactly as on every screen. The download is
 * everything the owner can see in WonderHome and nothing more — another
 * member's private health records and private HomeTalk conversations are not
 * in it (the README says so). Secrets (keys, tokens, passwords) are never in
 * it: their tables are not read, and secret-named columns are dropped by the
 * database function as well.
 *
 * The table list is the schema's (`reset-tables.json`, which
 * `scripts/test-household-reset-rls.mjs` holds to the live catalog), so a new
 * household table is in the download as soon as it is classified.
 */

export const EXPORT_PAGE_SIZE = 500;

type Manifest = {
  kept: string[];
  storageBuckets: string[];
  areas: Record<string, string[]>;
  notExported: Record<string, string>;
};

export const RESET_MANIFEST = manifest as Manifest;

/** What each area folder holds, for the README. */
export const AREA_LABELS: Record<string, string> = {
  "assistant-learning": "What WonderHome learned: memories, corrections and the assistant's working notes",
  "bills-and-money": "Bills, budgets and payments you recorded",
  "calendar-and-events": "Calendar, events, guests and days away",
  connections: "Connected services and what they sent (never their passwords or keys)",
  "groceries-and-pantry": "Groceries, pantry, shopping lists and orders",
  health: "Health records, appointments and vitals you can see",
  home: "The home itself: address, places, assets, services and setup",
  homesend: "HomeSend: what was sent in and what became of it",
  "hometalk-and-chat": "HomeTalk conversations you can see, family chat and Needs you questions",
  "meals-and-recipes": "Meals, meal plans and recipes",
  notifications: "Notifications and reminder settings",
  people: "Members, roles, guardians, contact details and invitations",
  pets: "Pets and their care",
  "plan-and-billing": "Your plan, invoices and payments to WonderHome, usage, and the activity record",
  "routines-and-responsibilities": "Responsibilities, routines, playbook, rules and certification",
  "school-and-kids": "School, activities, goals and Kids Trivia",
};

export type ExportProgress = {
  tables: { area: string; table: string; rows: number; error?: string }[];
  files: { bucket: string; path: string; bytes: number; error?: string }[];
};

type Input = {
  /** The owner's own (RLS-scoped) client. Never the service role. */
  supabase: SupabaseClient;
  householdId: string;
  householdName: string;
  requestedBy: string;
  now: Date;
};

const encoder = new TextEncoder();

/** Pages of one table as the caller sees it. A missing function surfaces as `ExportUnavailableError`. */
async function* tableJson(input: Input, table: string, record: ExportProgress["tables"][number]): AsyncIterable<Uint8Array> {
  yield encoder.encode("[\n");
  let offset = 0;
  let first = true;
  for (;;) {
    const { data, error } = await input.supabase.rpc("household_export_rows", {
      p_household_id: input.householdId,
      p_table: table,
      p_offset: offset,
      p_limit: EXPORT_PAGE_SIZE,
    });
    if (error) {
      if (error.code === "PGRST202") throw new ExportUnavailableError();
      record.error = "could not be read";
      break;
    }
    const rows = Array.isArray(data) ? (data as unknown[]) : [];
    if (rows.length > 0) {
      yield encoder.encode((first ? "" : ",\n") + rows.map((row) => JSON.stringify(row)).join(",\n"));
      first = false;
    }
    record.rows += rows.length;
    if (rows.length < EXPORT_PAGE_SIZE) break;
    offset += rows.length;
  }
  yield encoder.encode("\n]\n");
}

/** Every object under the household's folder in a bucket that the caller may list, depth first. */
async function listFiles(supabase: SupabaseClient, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 6) return [];
  const paths: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error || !data) break;
    for (const item of data) {
      const path = `${prefix}/${item.name}`;
      if (item.id === null) paths.push(...(await listFiles(supabase, bucket, path, depth + 1)));
      else paths.push(path);
    }
    if (data.length < 100) break;
  }
  return paths;
}

export class ExportUnavailableError extends Error {
  constructor() {
    super("The full download isn't available yet.");
    this.name = "ExportUnavailableError";
  }
}

/** Whether the database can serve the download yet (the migration may not have run). */
export async function exportAvailable(supabase: SupabaseClient, householdId: string): Promise<boolean> {
  const { error } = await supabase.rpc("household_export_rows", {
    p_household_id: householdId,
    p_table: "household_members",
    p_offset: 0,
    p_limit: 1,
  });
  return !error || error.code !== "PGRST202";
}

/** The archive's entries, produced as they are read. `progress` fills in as it goes; the README comes last. */
export async function* householdArchiveEntries(input: Input, progress: ExportProgress = { tables: [], files: [] }): AsyncIterable<ZipEntry> {
  const areas = Object.keys(RESET_MANIFEST.areas).sort();
  for (const area of areas) {
    for (const table of [...RESET_MANIFEST.areas[area]!].sort()) {
      const record = { area, table, rows: 0 } as ExportProgress["tables"][number];
      progress.tables.push(record);
      yield { name: `data/${area}/${table}.json`, data: tableJson(input, table, record) };
    }
  }

  for (const bucket of RESET_MANIFEST.storageBuckets) {
    const paths = await listFiles(input.supabase, bucket, input.householdId);
    for (const path of paths) {
      const { data, error } = await input.supabase.storage.from(bucket).download(path);
      const relative = path.slice(input.householdId.length + 1);
      if (error || !data) {
        progress.files.push({ bucket, path: relative, bytes: 0, error: "could not be read" });
        continue;
      }
      const bytes = new Uint8Array(await data.arrayBuffer());
      progress.files.push({ bucket, path: relative, bytes: bytes.length });
      yield { name: `files/${bucket}/${relative}`, data: bytes };
    }
  }

  yield { name: "README.txt", data: readme(input, progress) };
}

/** Pure: the README, written last so it can count what the archive holds. */
export function readme(input: Pick<Input, "householdName" | "requestedBy" | "now">, progress: ExportProgress): string {
  const lines: string[] = [];
  const rows = progress.tables.reduce((sum, table) => sum + table.rows, 0);
  lines.push(`WonderHome — full data for ${input.householdName}`);
  lines.push(`Downloaded by ${input.requestedBy} on ${input.now.toISOString()}.`);
  lines.push("");
  lines.push("This is everything your home holds in WonderHome that you can see yourself:");
  lines.push(`${rows} records in ${progress.tables.length} tables, and ${progress.files.filter((file) => !file.error).length} uploaded files.`);
  lines.push("");
  lines.push("HOW IT IS LAID OUT");
  lines.push("  data/<area>/<table>.json   one JSON array per table: one object per record, with its own column names.");
  lines.push("  files/<store>/<path>       the photos, documents and voice notes uploaded to your home, as they were.");
  lines.push("  Dates and times are ISO 8601 in UTC. Money is in the smallest unit (paise) where a column ends in _minor.");
  lines.push("");
  lines.push("WHAT IS IN EACH AREA");
  for (const area of Object.keys(RESET_MANIFEST.areas).sort()) {
    lines.push(`  data/${area}/  ${AREA_LABELS[area] ?? area}`);
    for (const table of progress.tables.filter((entry) => entry.area === area)) {
      lines.push(`    ${table.table}.json  ${table.rows} ${table.rows === 1 ? "record" : "records"}${table.error ? ` (${table.error})` : ""}`);
    }
  }
  lines.push("");
  lines.push("WHAT IS NOT IN IT, AND WHY");
  lines.push("  Other members' private health records, and their private HomeTalk conversations: only the person (or their");
  lines.push("  guardian, for a child) can see those in WonderHome, so they are not in your download either.");
  lines.push("  Each person can see their own in WonderHome until the home is reset.");
  lines.push("  Secrets are never included: keys, passwords, tokens and sign-in codes. Their tables:");
  for (const [table, reason] of Object.entries(RESET_MANIFEST.notExported).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`    ${table}: ${reason}`);
  }
  const failed = progress.files.filter((file) => file.error);
  if (failed.length > 0) {
    lines.push("");
    lines.push("FILES THAT COULD NOT BE READ");
    for (const file of failed) lines.push(`  files/${file.bucket}/${file.path}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** Pure: the download's file name, from the home's name and the day. */
export function archiveFilename(householdName: string, now: Date): string {
  const slug = householdName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "home";
  return `wonderhome-${slug}-${now.toISOString().slice(0, 10)}.zip`;
}
