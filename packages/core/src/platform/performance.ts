/**
 * The platform-admin Performance section: turns the database snapshot
 * (`public.platform_performance_snapshot`), the advisor counts and the
 * committed budgets into statuses and tips. Pure and deterministic: no model,
 * no I/O, and every figure comes from a real source or is absent.
 *
 * Aggregate only. Nothing here carries a household, member, email, query
 * parameter or row content.
 */

export type Status = "good" | "watch" | "act";

export type StatementShape = { shape: string; calls: number; total_ms: number; mean_ms: number };
export type Snapshot = {
  statements: { byTotal: StatementShape[]; byMean: StatementShape[] } | null;
  cache: { tableHit: number | null; indexHit: number | null };
  largestTables: { name: string; bytes: number; rows: number }[];
  largestIndexes: { name: string; table: string; bytes: number; scans: number }[];
  seqScanHeavy: { name: string; seq_scan: number; idx_scan: number; rows: number; seq_tup_read: number }[];
  unusedIndexes: { count: number; bytes: number };
  /** The biggest never-used indexes that back no constraint, by name. */
  unusedIndexList: { name: string; table: string; bytes: number }[];
  /** Indexes that repeat another on the same table: `keep` stays, `drop` are the plain copies. */
  duplicateIndexes: { table: string; keep: string; drop: string[] }[];
  deadTuples: { name: string; live: number; dead: number; dead_pct: number | null }[];
  connections: { max: number; reserved: number; total: number; active: number; idle: number; idleInTransaction: number };
  takenAt: string;
};

export type AdvisorCounts = {
  /** "live" from the Management API now, "baseline" from perf/advisor-baseline.json (the last CI run). */
  source: "live" | "baseline";
  /** WARN/ERROR findings now. */
  gated: number;
  /** INFO findings (unused indexes and the like). */
  info: number;
  /** WARN/ERROR findings the committed baseline accepts. */
  accepted: number;
  /** WARN/ERROR findings per lint name. */
  byLint: Record<string, number>;
};

export type BudgetRoute = { route: string; capGz: number };
export type Budgets = {
  routes: BudgetRoute[];
  sharedCapGz: number;
  queries: { id: string; maxBuffers: number; maxRowsRead: number; maxMs: number; noSeqScan: string[] }[];
};

/** A number from the database arrives as a number or a numeric string. */
const num = (value: unknown): number => {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
};
const nullableNum = (value: unknown): number | null => (value === null || value === undefined ? null : num(value));

/** The RPC's JSON, normalised; null when it is not shaped like a snapshot. */
export function parseSnapshot(raw: unknown): Snapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, any>;
  if (!r.connections || !r.cache) return null;
  const shapes = (list: any): StatementShape[] =>
    Array.isArray(list) ? list.map((s) => ({ shape: String(s.shape ?? ""), calls: num(s.calls), total_ms: num(s.total_ms), mean_ms: num(s.mean_ms) })) : [];
  const rows = (list: any): any[] => (Array.isArray(list) ? list : []);
  return {
    statements: r.statements ? { byTotal: shapes(r.statements.byTotal), byMean: shapes(r.statements.byMean) } : null,
    cache: { tableHit: nullableNum(r.cache.tableHit), indexHit: nullableNum(r.cache.indexHit) },
    largestTables: rows(r.largestTables).map((t) => ({ name: String(t.name), bytes: num(t.bytes), rows: num(t.rows) })),
    largestIndexes: rows(r.largestIndexes).map((i) => ({ name: String(i.name), table: String(i.table), bytes: num(i.bytes), scans: num(i.scans) })),
    seqScanHeavy: rows(r.seqScanHeavy).map((t) => ({ name: String(t.name), seq_scan: num(t.seq_scan), idx_scan: num(t.idx_scan), rows: num(t.rows), seq_tup_read: num(t.seq_tup_read) })),
    unusedIndexes: { count: num(r.unusedIndexes?.count), bytes: num(r.unusedIndexes?.bytes) },
    unusedIndexList: rows(r.unusedIndexList).map((i) => ({ name: String(i.name), table: String(i.table), bytes: num(i.bytes) })),
    duplicateIndexes: rows(r.duplicateIndexes).map((d) => ({ table: String(d.table), keep: String(d.keep), drop: rows(d.drop).map(String) })),
    deadTuples: rows(r.deadTuples).map((t) => ({ name: String(t.name), live: num(t.live), dead: num(t.dead), dead_pct: nullableNum(t.dead_pct) })),
    connections: {
      max: num(r.connections.max),
      reserved: num(r.connections.reserved),
      total: num(r.connections.total),
      active: num(r.connections.active),
      idle: num(r.connections.idle),
      idleInTransaction: num(r.connections.idleInTransaction),
    },
    takenAt: String(r.takenAt ?? ""),
  };
}

/** A table is "big enough for a sequential scan to hurt" from here. */
export const SEQ_SCAN_ROW_FLOOR = 1000;

export function cacheStatus(ratio: number | null): Status | null {
  if (ratio === null) return null;
  if (ratio >= 0.99) return "good";
  if (ratio >= 0.95) return "watch";
  return "act";
}

export function connectionStatus(c: Snapshot["connections"]): Status {
  const usable = Math.max(1, c.max - c.reserved);
  const used = c.total / usable;
  if (used >= 0.85 || c.idleInTransaction >= 5) return "act";
  if (used >= 0.6 || c.idleInTransaction > 0) return "watch";
  return "good";
}

export function deadTupleStatus(t: Snapshot["deadTuples"][number]): Status {
  const pct = t.dead_pct ?? 0;
  if (t.dead >= 10_000 && pct >= 20) return "act";
  if (t.dead >= 1_000 && pct >= 10) return "watch";
  return "good";
}

export function seqScanStatus(t: Snapshot["seqScanHeavy"][number]): Status {
  if (t.rows < SEQ_SCAN_ROW_FLOOR) return "good";
  return t.rows >= 50_000 ? "act" : "watch";
}

export function statementStatus(s: StatementShape): Status {
  if (s.mean_ms >= 500) return "act";
  if (s.mean_ms >= 100) return "watch";
  return "good";
}

export function unusedIndexStatus(count: number): Status {
  if (count >= 300) return "act";
  if (count >= 50) return "watch";
  return "good";
}

export const ROUTE_WATCH_GZ = 200_000;
export const ROUTE_ACT_GZ = 240_000;
export function routeStatus(capGz: number): Status {
  if (capGz >= ROUTE_ACT_GZ) return "act";
  if (capGz >= ROUTE_WATCH_GZ) return "watch";
  return "good";
}

export function advisorStatus(a: AdvisorCounts): Status {
  if (a.gated > a.accepted) return "act";
  return a.gated > 0 ? "watch" : "good";
}

export type Tip = {
  id: string;
  severity: Status;
  /** Weight inside a severity: bigger is more worth doing first. */
  impact: number;
  finding: string;
  tip: string;
  where: string;
  story: string;
};

const SEVERITY_RANK: Record<Status, number> = { act: 2, watch: 1, good: 0 };

const kb = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString("en-GB")} KB`;

/** The rule table. Every tip is computed from measured data; none is generic advice. */
export function computeTips(input: { snapshot: Snapshot | null; advisors: AdvisorCounts | null; budgets: Budgets | null }): Tip[] {
  const tips: Tip[] = [];
  const { snapshot, advisors, budgets } = input;

  if (snapshot) {
    for (const t of snapshot.seqScanHeavy) {
      const severity = seqScanStatus(t);
      if (severity === "good") continue;
      tips.push({
        id: `seq-${t.name}`,
        severity,
        impact: t.seq_tup_read,
        finding: `${t.name} is read by scanning every row (${t.seq_scan.toLocaleString("en-GB")} scans vs ${t.idx_scan.toLocaleString("en-GB")} index uses, about ${t.rows.toLocaleString("en-GB")} rows).`,
        tip: "Add an index on the columns the hot reads filter and sort by, or drop a partial index's status condition so the read can use it.",
        where: `A new migration for ${t.name} (index on the filter columns); check with perf/queries.mjs.`,
        story: "PERF-01 / PERF-15",
      });
    }

    for (const [label, ratio] of [["table", snapshot.cache.tableHit], ["index", snapshot.cache.indexHit]] as const) {
      const severity = cacheStatus(ratio);
      if (!severity || severity === "good") continue;
      tips.push({
        id: `cache-${label}`,
        severity,
        impact: 1_000_000,
        finding: `Only ${((ratio ?? 0) * 100).toFixed(1)}% of ${label} reads come from memory.`,
        tip: "The working set no longer fits in memory: trim the largest reads first, then consider a bigger database compute size.",
        where: "Top queries below; Supabase dashboard, Settings, Compute.",
        story: "PERF-12",
      });
    }

    if (unusedIndexStatus(snapshot.unusedIndexes.count) !== "good" || snapshot.unusedIndexes.count > 0) {
      const severity = unusedIndexStatus(snapshot.unusedIndexes.count);
      tips.push({
        id: "unused-indexes",
        severity: severity === "good" ? "watch" : severity,
        impact: snapshot.unusedIndexes.bytes,
        finding: `${snapshot.unusedIndexes.count} indexes have never been used (${kb(snapshot.unusedIndexes.bytes)} in total).`,
        tip: "Drop candidates, but only after real traffic: with few users most indexes look unused. Re-check after launch and drop one at a time.",
        where: "A migration that drops the index; confirm with the performance advisor first.",
        story: "PERF-14",
      });
    }

    if (snapshot.duplicateIndexes.length > 0) {
      const extra = snapshot.duplicateIndexes.reduce((n, d) => n + d.drop.length, 0);
      tips.push({
        id: "duplicate-indexes",
        severity: "watch",
        impact: extra * 1_000_000,
        finding: `${extra} indexes repeat another index on the same table (${snapshot.duplicateIndexes.map((d) => d.table).join(", ")}).`,
        tip: "A duplicate does the same job as the index beside it and slows every write: keep one and drop the copy, one at a time.",
        where: "A migration that drops the copy (DROP INDEX CONCURRENTLY); the performance advisor lists them as duplicate_index.",
        story: "PERF-14",
      });
    }

    for (const t of snapshot.deadTuples) {
      const severity = deadTupleStatus(t);
      if (severity === "good") continue;
      tips.push({
        id: `dead-${t.name}`,
        severity,
        impact: t.dead,
        finding: `${t.name} carries ${t.dead.toLocaleString("en-GB")} dead rows (${t.dead_pct ?? 0}% of the table).`,
        tip: "Autovacuum is behind on a busy table: tune its vacuum settings, or prune old rows on a schedule.",
        where: `Table settings for ${t.name}, or the retention job.`,
        story: "PERF-05",
      });
    }

    const status = connectionStatus(snapshot.connections);
    if (status !== "good") {
      tips.push({
        id: "connections",
        severity: status,
        impact: snapshot.connections.total,
        finding: `${snapshot.connections.total} of ${snapshot.connections.max - snapshot.connections.reserved} usable connections are open${snapshot.connections.idleInTransaction ? `, ${snapshot.connections.idleInTransaction} idle in a transaction` : ""}.`,
        tip: "Serverless functions open many short connections: route them through the Supavisor pooler in transaction mode, and look for code that holds a transaction open.",
        where: "Connection string settings in Vercel; the database client in packages/core/src/db.",
        story: "PERF-04",
      });
    }

    for (const s of snapshot.statements?.byMean ?? []) {
      const severity = statementStatus(s);
      if (severity === "good") continue;
      tips.push({
        id: `stmt-${s.shape.slice(0, 40)}`,
        severity,
        impact: s.total_ms,
        finding: `A query averages ${s.mean_ms} ms over ${s.calls.toLocaleString("en-GB")} calls: ${s.shape.slice(0, 80)}`,
        tip: "Run EXPLAIN ANALYZE on it with a real member's claims; if it is a cascade delete, the cost is the foreign keys without an index.",
        where: "The repository that issues it; indexes on the foreign keys it touches.",
        story: "PERF-12",
      });
    }
  }

  if (advisors) {
    const extra = advisors.gated - advisors.accepted;
    if (extra > 0) {
      tips.push({
        id: "advisors-new",
        severity: "act",
        impact: extra * 1000,
        finding: `${extra} more advisor findings than the committed baseline accepts.`,
        tip: "Open the Supabase advisors and fix the new finding, rather than adding it to the baseline.",
        where: "Supabase dashboard, Advisors; perf/advisor-baseline.json.",
        story: "PERF-17",
      });
    }
    const perRow = Object.entries(advisors.byLint).filter(([name]) => /rls_initplan|multiple_permissive/.test(name));
    for (const [name, count] of perRow) {
      if (count === 0) continue;
      tips.push({
        id: `advisor-${name}`,
        severity: "watch",
        impact: count * 100,
        finding: `${count} advisor findings of type ${name}.`,
        tip: "Policies that call a per-row helper or overlap run for every row: use the set forms (x in (select wh.member_households())) and one permissive policy per role and action.",
        where: "Row-level security policies in supabase/migrations; scripts/test-setup-counts-rls.mjs.",
        story: "PERF-02",
      });
    }
  }

  if (budgets) {
    const heavy = budgets.routes.filter((r) => routeStatus(r.capGz) !== "good").sort((a, b) => b.capGz - a.capGz);
    for (const r of heavy.slice(0, 3)) {
      tips.push({
        id: `route-${r.route}`,
        severity: routeStatus(r.capGz),
        impact: r.capGz,
        finding: `${r.route} may load up to ${kb(r.capGz)} of JavaScript before it is usable (gzip).`,
        tip: "Lazy-load the form bodies and rarely used panels behind a dynamic import, so the first screen ships less.",
        where: `The client components under apps/web/app${r.route === "/" ? "" : r.route}.`,
        story: "PERF-11",
      });
    }
  }

  return tips.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.impact - a.impact);
}

/** WARN/ERROR and INFO counts from a Management API advisor body (flat or grouped lints). */
export function countAdvisorLints(body: unknown): { gated: number; info: number; byLint: Record<string, number> } {
  const b = body as any;
  const lints: any[] = Array.isArray(b) ? b : Array.isArray(b?.lints) ? b.lints : Array.isArray(b?.result?.lints) ? b.result.lints : Array.isArray(b?.result) ? b.result : [];
  let gated = 0;
  let info = 0;
  const byLint: Record<string, number> = {};
  for (const lint of lints) {
    const n = Array.isArray(lint.findings) ? lint.findings.length || 1 : 1;
    if (lint.level === "INFO") info += n;
    else {
      gated += n;
      byLint[String(lint.name)] = (byLint[String(lint.name)] ?? 0) + n;
    }
  }
  return { gated, info, byLint };
}
