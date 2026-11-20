import type { SupabaseClient } from "@supabase/supabase-js";

import manifest from "./reset-tables.json";
import { zipStream, type ZipEntry } from "./zip";

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

/** The area whose tables, and the bucket whose files, are locked with the owner's health password. */
export const HEALTH_AREA = "health";
export const HEALTH_BUCKET = "health-records";
/** The inner archive that holds them, encrypted entry by entry (WinZip AES-256). */
export const HEALTH_ARCHIVE = "health-records-protected.zip";
/**
 * The shortest health password accepted. Longer than the sign-in minimum (8)
 * on purpose: the AES-ZIP format fixes its key stretching at 1,000 PBKDF2
 * rounds, so the password's own length is what keeps the file safe if it is
 * lost or shared.
 */
export const HEALTH_PASSWORD_MIN = 12;
export const HEALTH_PASSWORD_MAX = 200;

/** Pure: why a health password is not acceptable, or null when it is. */
export function healthPasswordProblem(password: string, repeat: string): "too_short" | "too_long" | "mismatch" | null {
  if (password.length < HEALTH_PASSWORD_MIN) return "too_short";
  if (password.length > HEALTH_PASSWORD_MAX) return "too_long";
  if (password !== repeat) return "mismatch";
  return null;
}

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
  /** True when the health part was written, locked with the owner's password. */
  healthLocked?: boolean;
};

type Input = {
  /** The owner's own (RLS-scoped) client. Never the service role. */
  supabase: SupabaseClient;
  householdId: string;
  householdName: string;
  requestedBy: string;
  now: Date;
  /**
   * Locks the health records (the health tables and the uploaded health files)
   * into `health-records-protected.zip`. Without it they are left out entirely:
   * the route only omits it when the owner can see no health records at all.
   * Never stored, logged or audited.
   */
  healthPassword?: string;
};

const encoder = new TextEncoder();

/** Pages of one table as the caller sees it. A missing function surfaces as `ExportUnavailableError`. */
type Page = { data: unknown; error: { code?: string } | null };

function fetchPage(input: Input, table: string, offset: number): Promise<Page> {
  return Promise.resolve(
    input.supabase.rpc("household_export_rows", {
      p_household_id: input.householdId,
      p_table: table,
      p_offset: offset,
      p_limit: EXPORT_PAGE_SIZE,
    }),
  ) as Promise<Page>;
}

/** How many tables' first pages are read ahead while one is being written: the time a slow link costs drops by this much, and memory stays at this many pages. */
export const EXPORT_LOOKAHEAD = 8;

/** Starts each table's first page a few tables ahead of the writer, never more than `EXPORT_LOOKAHEAD` at once. */
function firstPages(input: Input, tables: readonly string[]): (index: number) => Promise<Page> {
  const started = new Map<number, Promise<Page>>();
  const start = (index: number) => {
    if (index < tables.length && !started.has(index)) {
      const page = fetchPage(input, tables[index]!, 0);
      // Awaited later by the writer; this only keeps a failure from being reported as unhandled meanwhile.
      page.catch(() => undefined);
      started.set(index, page);
    }
  };
  return (index: number) => {
    for (let ahead = index; ahead < index + EXPORT_LOOKAHEAD; ahead++) start(ahead);
    const page = started.get(index)!;
    started.delete(index);
    return page;
  };
}

async function* tableJson(input: Input, table: string, record: ExportProgress["tables"][number], firstPage?: Promise<Page>): AsyncIterable<Uint8Array> {
  yield encoder.encode("[\n");
  let offset = 0;
  let first = true;
  for (;;) {
    const { data, error } = offset === 0 && firstPage ? await firstPage : await fetchPage(input, table, offset);
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

/**
 * Whether the owner can see any health record at all: a row in any health
 * table, or a file in the health store. When there is none, the download does
 * not ask for a health password.
 */
export async function hasHealthContent(supabase: SupabaseClient, householdId: string): Promise<boolean> {
  const tables = RESET_MANIFEST.areas[HEALTH_AREA] ?? [];
  const checks = await Promise.all([
    ...tables.map(async (table) => {
      const { data, error } = await supabase.rpc("household_export_rows", { p_household_id: householdId, p_table: table, p_offset: 0, p_limit: 1 });
      return !error && Array.isArray(data) && data.length > 0;
    }),
    (async () => {
      const { data, error } = await supabase.storage.from(HEALTH_BUCKET).list(householdId, { limit: 1 });
      return !error && Array.isArray(data) && data.length > 0;
    })(),
  ]);
  return checks.some(Boolean);
}

/** Pure: a health file's name inside the locked archive: a number and its extension, never its stored name. */
export function lockedFileName(index: number, path: string): string {
  const ext = path.match(/\.[A-Za-z0-9]{1,5}$/)?.[0]?.toLowerCase() ?? "";
  return `files/health-records/file-${String(index).padStart(3, "0")}${ext}`;
}

/** The health tables and files, every entry encrypted with the owner's password. */
async function* lockedHealthEntries(input: Input & { healthPassword: string }, progress: ExportProgress): AsyncIterable<ZipEntry> {
  const password = input.healthPassword;
  const healthTables = [...(RESET_MANIFEST.areas[HEALTH_AREA] ?? [])].sort();
  const healthPage = firstPages(input, healthTables);
  for (const [index, table] of healthTables.entries()) {
    const record = { area: HEALTH_AREA, table, rows: 0 } as ExportProgress["tables"][number];
    progress.tables.push(record);
    yield { name: `data/health/${table}.json`, data: tableJson(input, table, record, healthPage(index)), password };
  }
  const index: { file: string; stored_as: string; bytes: number }[] = [];
  const paths = await listFiles(input.supabase, HEALTH_BUCKET, input.householdId);
  let n = 0;
  for (const path of paths) {
    const { data, error } = await input.supabase.storage.from(HEALTH_BUCKET).download(path);
    if (error || !data) {
      // Counted, never named: a health file's stored name stays inside the lock.
      progress.files.push({ bucket: HEALTH_BUCKET, path: "", bytes: 0, error: "could not be read" });
      continue;
    }
    n += 1;
    const bytes = new Uint8Array(await data.arrayBuffer());
    const name = lockedFileName(n, path);
    index.push({ file: name, stored_as: path.slice(input.householdId.length + 1), bytes: bytes.length });
    progress.files.push({ bucket: HEALTH_BUCKET, path: "", bytes: bytes.length });
    yield { name, data: bytes, password };
  }
  yield { name: "files/health-records/index.json", data: JSON.stringify(index, null, 2) + "\n", password };
}

/** The archive's entries, produced as they are read. `progress` fills in as it goes; the README comes last. */
export async function* householdArchiveEntries(input: Input, progress: ExportProgress = { tables: [], files: [] }): AsyncIterable<ZipEntry> {
  const areas = Object.keys(RESET_MANIFEST.areas)
    .filter((area) => area !== HEALTH_AREA)
    .sort();
  const ordered = areas.flatMap((area) => [...RESET_MANIFEST.areas[area]!].sort().map((table) => ({ area, table })));
  const page = firstPages(
    input,
    ordered.map((entry) => entry.table),
  );
  for (const [index, { area, table }] of ordered.entries()) {
    const record = { area, table, rows: 0 } as ExportProgress["tables"][number];
    progress.tables.push(record);
    yield { name: `data/${area}/${table}.json`, data: tableJson(input, table, record, page(index)) };
  }

  for (const bucket of RESET_MANIFEST.storageBuckets.filter((name) => name !== HEALTH_BUCKET)) {
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

  // Health is never written in clear: with a password it goes into its own
  // AES-256 archive (streamed, one table page or one file at a time); without
  // one it is not read at all.
  if (input.healthPassword) {
    progress.healthLocked = true;
    yield { name: HEALTH_ARCHIVE, data: zipStream(lockedHealthEntries({ ...input, healthPassword: input.healthPassword }, progress), input.now) };
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
    if (area === HEALTH_AREA) {
      lines.push(
        progress.healthLocked
          ? `  ${HEALTH_ARCHIVE} → data/health/  ${AREA_LABELS[area]} (locked with your password, see below)`
          : `  (health)  ${AREA_LABELS[area]}: not in this download, as there were none you could see when you asked for it.`,
      );
    } else {
      lines.push(`  data/${area}/  ${AREA_LABELS[area] ?? area}`);
    }
    for (const table of progress.tables.filter((entry) => entry.area === area)) {
      lines.push(`    ${table.table}.json  ${table.rows} ${table.rows === 1 ? "record" : "records"}${table.error ? ` (${table.error})` : ""}`);
    }
  }
  if (progress.healthLocked) {
    const healthFiles = progress.files.filter((file) => file.bucket === HEALTH_BUCKET && !file.error).length;
    lines.push("");
    lines.push("HEALTH RECORDS: LOCKED WITH YOUR PASSWORD");
    lines.push(`  ${HEALTH_ARCHIVE} holds the health tables above and ${healthFiles} uploaded health ${healthFiles === 1 ? "file" : "files"}.`);
    lines.push("  Every file inside it is encrypted with the password you chose when you downloaded this (AES-256, the");
    lines.push("  standard password-protected ZIP). WonderHome does not keep that password: without it they cannot be opened.");
    lines.push("  Inside: data/health/<table>.json, files/health-records/file-NNN (each health file, numbered), and");
    lines.push("  files/health-records/index.json (which number was which stored file).");
    lines.push("  To open it:");
    lines.push("    Windows: 7-Zip (7-zip.org) or WinZip; right-click → 7-Zip → Extract, then type the password.");
    lines.push("    Mac: Keka or The Unarchiver (the built-in Archive Utility cannot open AES-256 ZIPs).");
    lines.push("    Android: ZArchiver. iPhone/iPad: an app that opens AES-256 password ZIPs, such as iZip.");
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
    for (const file of failed.filter((entry) => entry.bucket !== HEALTH_BUCKET)) lines.push(`  files/${file.bucket}/${file.path}`);
    const healthFailed = failed.filter((entry) => entry.bucket === HEALTH_BUCKET).length;
    if (healthFailed > 0) lines.push(`  ${healthFailed} health ${healthFailed === 1 ? "file" : "files"} (not named here, to keep it private)`);
  }
  lines.push("");
  return lines.join("\n");
}

/** Pure: the download's file name, from the home's name and the day. */
export function archiveFilename(householdName: string, now: Date): string {
  const slug = householdName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "home";
  return `wonderhome-${slug}-${now.toISOString().slice(0, 10)}.zip`;
}
