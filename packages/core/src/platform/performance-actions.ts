/**
 * What a platform admin can do about a Performance tip (the owner,
 * 2026-10-29). Pure and deterministic.
 *
 * Two kinds of fix, kept apart on purpose:
 *   - "run": a fixed, safe maintenance action the database runs for the
 *     admin (RUN_ACTIONS below; each is its own guarded database function,
 *     never SQL from the browser);
 *   - "copy": a reviewed SQL snippet to copy, for anything that changes the
 *     schema. DDL is never run from the web; it ships through a migration PR.
 *
 * Every identifier that reaches a snippet is quoted here, and a name that
 * cannot be quoted safely produces no snippet at all.
 */
import type { Snapshot, Tip } from "./performance";

export type RunActionId = "analyze" | "reset_statements" | "end_idle_sessions";

export type RunActionInfo = {
  id: RunActionId;
  button: string;
  /** Capability the signed-in person needs (the database checks the role again). */
  capability: "performance.maintain" | "performance.reset";
  /** Re-type the password first. */
  stepUp: boolean;
  what: string;
  reversible: string;
  impact: string;
};

export const RUN_ACTIONS: Record<RunActionId, RunActionInfo> = {
  analyze: {
    id: "analyze",
    button: "Refresh planner statistics",
    capability: "performance.maintain",
    stepUp: false,
    what: "Re-measures the table so the database picks the best plan for its queries. Reads a sample of rows; changes no data.",
    reversible: "Nothing to undo: it only refreshes numbers the database keeps about the table.",
    impact: "Takes a second or two and holds no long lock. Queries on the table may get faster or choose a different plan.",
  },
  reset_statements: {
    id: "reset_statements",
    button: "Reset query statistics",
    capability: "performance.reset",
    stepUp: true,
    what: "Clears the history behind “Slowest queries” and the query tips. The history starts again from nothing.",
    reversible: "Not reversible: the old totals are gone. Nothing else is touched.",
    impact: "Slowest queries will look empty until traffic rebuilds it. Owner only; you confirm with your password.",
  },
  end_idle_sessions: {
    id: "end_idle_sessions",
    button: "End stuck connections",
    capability: "performance.reset",
    stepUp: true,
    what: "Disconnects the app’s own database connections that have sat inside an open transaction for longer than the time you choose. The count is shown first.",
    reversible: "The connection cannot be brought back, but the app reconnects by itself. Work inside that stuck transaction is rolled back.",
    impact: "Frees connections for other requests. A request that was truly in the middle of a slow step could fail once and be retried. Never touches admin, storage, realtime or sign-in connections. Owner only; you confirm with your password.",
  },
};

export const RUN_ACTION_IDS = Object.keys(RUN_ACTIONS) as RunActionId[];

/** Postgres identifiers are at most 63 bytes. Control characters, NUL and empty names are refused. */
const MAX_IDENT_BYTES = 63;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** A double-quoted identifier, or null when the name cannot be written safely. */
export function quoteIdent(name: string): string | null {
  if (typeof name !== "string" || name.length === 0 || CONTROL.test(name)) return null;
  if (new TextEncoder().encode(name).length > MAX_IDENT_BYTES) return null;
  return `"${name.replaceAll('"', '""')}"`;
}

/** A single-quoted string literal (standard_conforming_strings), or null for a control character. */
export function quoteLiteral(value: string): string | null {
  if (typeof value !== "string" || CONTROL.test(value)) return null;
  return `'${value.replaceAll("'", "''")}'`;
}

const qualified = (table: string) => {
  const t = quoteIdent(table);
  return t ? `"public".${t}` : null;
};

const HEADER = "-- Reviewed snippet from the Performance page. Read it before running it.";
const CONCURRENT_NOTE = "-- CONCURRENTLY cannot run inside a transaction: run each statement on its own.";

export function dropIndexSql(indexName: string): string | null {
  const i = quoteIdent(indexName);
  return i ? `${HEADER}\n${CONCURRENT_NOTE}\nDROP INDEX CONCURRENTLY IF EXISTS "public".${i};` : null;
}

export function dropIndexesSql(indexNames: string[]): string | null {
  const statements = indexNames.map((n) => quoteIdent(n));
  if (statements.length === 0 || statements.some((s) => s === null)) return null;
  return `${HEADER}\n${CONCURRENT_NOTE}\n${statements.map((i) => `DROP INDEX CONCURRENTLY IF EXISTS "public".${i};`).join("\n")}`;
}

export function vacuumSql(table: string): string | null {
  const t = qualified(table);
  return t ? `${HEADER}\n-- VACUUM cannot run inside a function or a transaction: paste it in the Supabase SQL editor.\nVACUUM (ANALYZE) ${t};` : null;
}

/** A read-only look at a table's indexes, the first step before adding one. */
export function listIndexesSql(table: string): string | null {
  const t = quoteLiteral(table);
  return t ? `${HEADER}\n-- Read only: the indexes the table already has.\nselect indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = ${t} order by indexname;` : null;
}

export type TipAction =
  | { kind: "run"; action: RunActionId; target: string | null; label: string }
  | { kind: "copy"; label: string; sql: string; note: string };

const APPLY_NOTE = "Schema changes are applied through a migration PR, never from this page.";

/** Last-run key shared by the page and the database: action plus target. */
export const runKey = (action: string, target: string | null) => `${action}:${target ?? ""}`;

/** The buttons a tip earns, from its id and the snapshot it was computed from. */
export function actionsFor(tip: Tip, snapshot: Snapshot | null): TipAction[] {
  const out: TipAction[] = [];
  const copy = (label: string, sql: string | null, note = APPLY_NOTE) => {
    if (sql) out.push({ kind: "copy", label, sql, note });
  };

  if (tip.id.startsWith("seq-")) {
    const table = tip.id.slice(4);
    out.push({ kind: "run", action: "analyze", target: table, label: `Refresh statistics for ${table}` });
    copy("Copy: show this table’s indexes", listIndexesSql(table), "Read only. Use it to see which columns are already indexed before choosing a new index.");
  } else if (tip.id.startsWith("stmt-")) {
    out.push({ kind: "run", action: "reset_statements", target: null, label: RUN_ACTIONS.reset_statements.button });
  } else if (tip.id === "connections" && (snapshot?.connections.idleInTransaction ?? 0) > 0) {
    out.push({ kind: "run", action: "end_idle_sessions", target: null, label: RUN_ACTIONS.end_idle_sessions.button });
  } else if (tip.id === "unused-indexes" && snapshot) {
    copy("Copy: drop the largest unused indexes", dropIndexesSql(snapshot.unusedIndexList.map((i) => i.name)), `${APPLY_NOTE} Re-check the list after real traffic first; with few visitors most indexes look unused.`);
  } else if (tip.id === "duplicate-indexes" && snapshot) {
    copy("Copy: drop the duplicate indexes", dropIndexesSql(snapshot.duplicateIndexes.flatMap((d) => d.drop)));
  } else if (tip.id.startsWith("dead-")) {
    const table = tip.id.slice(5);
    copy("Copy: VACUUM (ANALYZE) command", vacuumSql(table), "Run it yourself in the Supabase SQL editor: VACUUM cannot run from a function.");
  }
  return out;
}

/** Text for a ticket: the finding, the fix and the plan story. */
export function taskText(tip: Tip): string {
  return `[${tip.story}] ${tip.finding}\nFix: ${tip.tip}\nWhere: ${tip.where}\nPlan: docs/plans/2026-10-29-fast-and-secure-at-scale.md. Applied through a migration PR.`;
}

export type RunResult = { tone: "info" | "risk"; message: string };

/** The sentence shown after a run, from the database's answer or its error. Never echoes raw database text. */
export function resultMessage(action: RunActionId, target: string | null, answer: { data?: unknown; error?: { message?: string; code?: string } | null }): RunResult {
  const error = answer.error;
  if (error) {
    if (/rate_limited/.test(error.message ?? "")) return { tone: "risk", message: "That ran less than a minute ago. Wait a minute and try again." };
    if (error.code === "42501") return { tone: "risk", message: "Your platform role cannot run this." };
    return { tone: "risk", message: "The database did not run it. Nothing was changed. Try again in a minute." };
  }
  const data = (answer.data ?? {}) as { ok?: boolean; reason?: string; tables?: number; count?: number };
  if (!data.ok) {
    const reasons: Record<string, string> = {
      busy: "The table is busy right now, so it was skipped. Try again in a moment.",
      timeout: "It took too long and was stopped. Nothing was changed.",
      unknown_table: "That table was not found in the public schema, so nothing ran.",
      extension_off: "The query statistics extension is not switched on for this database, so there is nothing to reset.",
    };
    return { tone: "risk", message: reasons[data.reason ?? ""] ?? "It failed and nothing was changed." };
  }
  if (action === "analyze") return { tone: "info", message: target ? `Statistics refreshed for ${target}.` : `Statistics refreshed for ${data.tables ?? 0} tables.` };
  if (action === "reset_statements") return { tone: "info", message: "Query statistics reset. Slowest queries will fill in again as the app is used." };
  const n = data.count ?? 0;
  return { tone: "info", message: n === 0 ? "No stuck connections were found." : `Ended ${n} stuck ${n === 1 ? "connection" : "connections"}. The app reconnects by itself.` };
}
