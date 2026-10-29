import type { ReactNode } from "react";

import { Card } from "@wonderhome/core/ui/card";
import {
  advisorStatus,
  cacheStatus,
  computeTips,
  connectionStatus,
  deadTupleStatus,
  routeStatus,
  seqScanStatus,
  statementStatus,
  unusedIndexStatus,
  type Snapshot,
  type Status,
} from "@wonderhome/core/platform/performance";

import { platformCan } from "@wonderhome/core/platform/admin";
import { actionsFor, RUN_ACTIONS, runKey, taskText } from "@wonderhome/core/platform/performance-actions";

import { advisorCounts, committedBudgets, databaseSnapshot, lastRuns, type LastRun } from "../../_lib/platform-performance";
import { platformStaff } from "../../_lib/platform-staff";
import { RecheckButton, TipActions, type CopyButtonProps, type RunButtonProps } from "./tip-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Performance", robots: { index: false, follow: false } };

const WORD: Record<Status, string> = { good: "Good", watch: "Watch", act: "Act" };
const TONE: Record<Status, string> = {
  good: "bg-[var(--wh-handled-soft)] text-[var(--wh-handled)]",
  watch: "bg-[var(--wh-attention-soft)] text-[var(--wh-attention)]",
  act: "bg-[var(--wh-risk-soft)] text-[var(--wh-risk)]",
};

const number = (n: number) => n.toLocaleString("en-GB");
const size = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.round(bytes / 1024).toLocaleString("en-GB")} KB`);
const percent = (ratio: number | null) => (ratio === null ? "not measured" : `${(ratio * 100).toFixed(2)}%`);
const when = (iso: string) => (iso ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso)) : "");

const REASON: Record<string, string> = { "55P03": "the table was busy", "57014": "it timed out", extension_off: "the statistics extension is off", "22023": "the table was not found" };

/** "Never run", "Ran on …" or "Failed on …: reason", from the audit trail. */
function statusLine(run: LastRun | undefined): string {
  if (!run) return "Never run.";
  if (run.outcome === "ok") return `Last ran ${when(run.at)}.`;
  return `Failed ${when(run.at)}: ${REASON[run.reason ?? ""] ?? "database error"}.`;
}

function Pill({ status }: { status: Status }) {
  return <span className={`inline-flex shrink-0 items-center rounded-[var(--wh-radius-pill)] px-2.5 py-0.5 text-xs font-semibold ${TONE[status]}`}>{WORD[status]}</span>;
}

/** One measurement: what it is, its figure, a status in words, and what it means. */
function Metric({ title, value, status, meaning }: { title: string; value: ReactNode; status?: Status | null; meaning: string }) {
  return (
    <div className="space-y-1 border-t border-[var(--wh-border)] pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        {status ? <Pill status={status} /> : null}
      </div>
      <p className="break-words text-sm">{value}</p>
      <p className="text-xs text-[var(--wh-foreground-muted)]">What this means: {meaning}</p>
    </div>
  );
}

function NotMeasured({ children }: { children: ReactNode }) {
  return <p className="text-sm text-[var(--wh-foreground-muted)]">Not measured yet: {children}</p>;
}

function Section({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <Card className="space-y-4 p-5">
      <div className="space-y-1">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {intro ? <p className="text-sm text-[var(--wh-foreground-muted)]">{intro}</p> : null}
      </div>
      {children}
    </Card>
  );
}

function StatementList({ rows }: { rows: { shape: string; calls: number; total_ms: number; mean_ms: number }[] }) {
  if (rows.length === 0) return <p className="text-sm text-[var(--wh-foreground-muted)]">Nothing recorded yet.</p>;
  return (
    <ol className="space-y-2 text-sm">
      {rows.map((s) => (
        <li key={`${s.shape}-${s.calls}`} className="space-y-0.5">
          <p className="break-words font-mono text-xs">{s.shape}</p>
          <p className="text-xs text-[var(--wh-foreground-muted)]">
            {number(s.calls)} calls · {number(s.total_ms)} ms in total · {s.mean_ms} ms each <Pill status={statementStatus(s)} />
          </p>
        </li>
      ))}
    </ol>
  );
}

function DatabaseSection({ snapshot }: { snapshot: Snapshot }) {
  const c = snapshot.connections;
  const usable = c.max - c.reserved;
  return (
    <>
      <Section title="Database" intro={`Read from the database itself${snapshot.takenAt ? ` on ${when(snapshot.takenAt)}` : ""}. Totals since the statistics were last reset, so a quiet site looks busier than it is.`}>
        <Metric
          title="Memory hit rate, tables"
          value={percent(snapshot.cache.tableHit)}
          status={cacheStatus(snapshot.cache.tableHit)}
          meaning="how often a read is answered from memory instead of disk. 99% or more is healthy; below 95% the database is short of memory or reading too much."
        />
        <Metric
          title="Memory hit rate, indexes"
          value={percent(snapshot.cache.indexHit)}
          status={cacheStatus(snapshot.cache.indexHit)}
          meaning="the same for the lookup structures that keep reads fast."
        />
        <Metric
          title="Connections"
          value={`${c.total} open of ${usable} usable (limit ${c.max}); ${c.active} working, ${c.idle} idle, ${c.idleInTransaction} waiting inside a transaction`}
          status={connectionStatus(c)}
          meaning="every page load that talks to the database holds one. Near the limit, new requests queue or fail; the pooler exists to prevent that."
        />
        <Metric
          title="Unused indexes"
          value={`${number(snapshot.unusedIndexes.count)} (${size(snapshot.unusedIndexes.bytes)})`}
          status={unusedIndexStatus(snapshot.unusedIndexes.count)}
          meaning="indexes nothing has used yet. Each one slows every write a little. With few visitors most look unused, so wait for real traffic before dropping any."
        />
      </Section>

      <Section title="Tables read in full" intro="Tables the database scans end to end more often than it uses an index. Cheap while a table is small; costly as it grows.">
        {snapshot.seqScanHeavy.length === 0 ? (
          <p className="text-sm text-[var(--wh-foreground-muted)]">None.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {snapshot.seqScanHeavy.map((t) => (
              <li key={t.name} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="break-all">
                  <span className="font-mono">{t.name}</span>
                  <span className="text-[var(--wh-foreground-muted)]"> · {number(t.seq_scan)} full scans, {number(t.idx_scan)} index uses, {number(t.rows)} rows</span>
                </span>
                <Pill status={seqScanStatus(t)} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Slowest queries" intro="Shapes of the queries, with every value removed. By total time shows where the database spends its day; by average time shows what is slow each time.">
        {snapshot.statements ? (
          <>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">By total time</h3>
              <StatementList rows={snapshot.statements.byTotal} />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">By average time (5 calls or more)</h3>
              <StatementList rows={snapshot.statements.byMean} />
            </div>
          </>
        ) : (
          <NotMeasured>the query statistics extension is not switched on for this database.</NotMeasured>
        )}
      </Section>

      <Section title="Biggest tables and indexes" intro="Where the storage goes. Names and sizes only.">
        <ul className="space-y-1 text-sm">
          {snapshot.largestTables.map((t) => (
            <li key={t.name} className="break-all">
              <span className="font-mono">{t.name}</span>
              <span className="text-[var(--wh-foreground-muted)]"> · {size(t.bytes)} · about {number(t.rows)} rows</span>
            </li>
          ))}
        </ul>
        <ul className="space-y-1 border-t border-[var(--wh-border)] pt-3 text-sm">
          {snapshot.largestIndexes.map((i) => (
            <li key={i.name} className="break-all">
              <span className="font-mono">{i.name}</span>
              <span className="text-[var(--wh-foreground-muted)]"> · {i.table} · {size(i.bytes)} · used {number(i.scans)} times</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Dead rows" intro="Rows that were changed or deleted but not yet cleaned up. A high share makes a table slower and larger than it needs to be.">
        {snapshot.deadTuples.length === 0 ? (
          <p className="text-sm text-[var(--wh-foreground-muted)]">None.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {snapshot.deadTuples.map((t) => (
              <li key={t.name} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="break-all">
                  <span className="font-mono">{t.name}</span>
                  <span className="text-[var(--wh-foreground-muted)]"> · {number(t.dead)} dead of {number(t.live + t.dead)} ({t.dead_pct ?? 0}%)</span>
                </span>
                <Pill status={deadTupleStatus(t)} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

/**
 * Where a platform admin sees how fast and healthy WonderHome is (the owner,
 * 2026-10-29). Aggregate only and read-only; every figure comes from a real
 * source or says it is not measured. Anyone else sees a 404.
 */
export default async function PerformancePage() {
  const staff = await platformStaff("operations.read");
  if (!staff) return null; // the layout has already answered 404

  const [database, advisors, runs] = await Promise.all([databaseSnapshot(staff), advisorCounts(), lastRuns(staff)]);
  const lastRun = new Map(runs.map((r) => [runKey(r.action, r.target), r]));
  const budgets = committedBudgets();
  const snapshot = database.state === "ok" ? database.value : null;
  const tips = computeTips({ snapshot, advisors, budgets });
  const heaviest = budgets.routes.slice(0, 5);
  const accepted = advisors.accepted;

  /** What each tip's card can do, with this person's role and each action's last run. */
  const buttonsFor = (tip: (typeof tips)[number]) => {
    const all = actionsFor(tip, snapshot);
    const runButtons: RunButtonProps[] = [];
    const copies: CopyButtonProps[] = [];
    for (const a of all) {
      if (a.kind === "copy") {
        copies.push({ label: a.label, sql: a.sql, note: a.note });
        continue;
      }
      const info = RUN_ACTIONS[a.action];
      runButtons.push({
        action: a.action,
        target: a.target,
        label: a.label,
        what: info.what,
        reversible: info.reversible,
        impact: info.impact,
        stepUp: info.stepUp,
        allowed: platformCan(staff, info.capability),
        status: statusLine(lastRun.get(runKey(a.action, a.target))),
      });
    }
    return { runs: runButtons, copies, task: { text: taskText(tip), story: tip.story } };
  };

  return (
    <main className="min-h-dvh px-4 py-10 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-[length:var(--wh-text-title)] font-bold tracking-tight">Performance</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            How the database, the platform checks and the app&rsquo;s own budgets are doing. Only totals: no household, member or email is shown here. Each tip has the safe action for it; changes to the database&rsquo;s shape are only ever offered as SQL to copy, never run from this page.
          </p>
          <RecheckButton />
        </header>

        <Section title="Tips to improve" intro="Worked out from the figures below by fixed rules, most useful first. No AI is involved.">
          {tips.length === 0 ? (
            <p className="text-sm">Nothing to act on right now.</p>
          ) : (
            <ol className="space-y-4">
              {tips.map((tip) => (
                <li key={tip.id} className="space-y-1 border-t border-[var(--wh-border)] pt-3 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill status={tip.severity} />
                    <p className="min-w-0 break-words text-sm font-semibold">{tip.finding}</p>
                  </div>
                  <p className="break-words text-sm">{tip.tip}</p>
                  <p className="break-words text-xs text-[var(--wh-foreground-muted)]">
                    Where to fix: {tip.where} Plan: {tip.story} in docs/plans/2026-10-29-fast-and-secure-at-scale.md.
                  </p>
                  <TipActions {...buttonsFor(tip)} />
                </li>
              ))}
            </ol>
          )}
        </Section>

        {snapshot ? (
          <DatabaseSection snapshot={snapshot} />
        ) : (
          <Section title="Database">
            <NotMeasured>{database.state === "unavailable" ? database.reason : "no snapshot."}</NotMeasured>
          </Section>
        )}

        <Section
          title="Platform advisors"
          intro="Supabase's own security and performance checks."
        >
          <Metric
            title="Warnings"
            value={`${advisors.gated} now; ${accepted} accepted in perf/advisor-baseline.json`}
            status={advisorStatus(advisors)}
            meaning="warnings the platform raises about the database setup. Anything above the accepted list is new and should be fixed."
          />
          <Metric
            title="Notes (unused indexes and the like)"
            value={number(advisors.info)}
            meaning="advice that depends on traffic. Not a failure."
          />
          <p className="text-xs text-[var(--wh-foreground-muted)]">
            {advisors.source === "live" ? "Counted just now from the Supabase Management API." : "As of the last CI run (the committed baseline); live counts need SUPABASE_ACCESS_TOKEN on the server."}
          </p>
        </Section>

        <Section title="Budgets" intro="The ceilings the build enforces. Shown as of the last build: CI fails a change that goes over one.">
          <Metric
            title="Heaviest screens (JavaScript before the screen is usable, compressed)"
            value={
              <span className="block space-y-1">
                {heaviest.map((r) => (
                  <span key={r.route} className="flex flex-wrap items-center justify-between gap-x-3">
                    <span className="break-all font-mono">{r.route}</span>
                    <span>
                      {size(r.capGz)} <Pill status={routeStatus(r.capGz)} />
                    </span>
                  </span>
                ))}
              </span>
            }
            meaning={`the more a screen has to download first, the slower it opens on a phone. The code every screen shares is capped at ${size(budgets.sharedCapGz)}.`}
          />
          <Metric
            title="Database read budgets"
            value={
              <span className="block space-y-1">
                {budgets.queries.map((q) => (
                  <span key={q.id} className="block break-all">
                    <span className="font-mono">{q.id}</span>
                    <span className="text-[var(--wh-foreground-muted)]"> · up to {number(q.maxBuffers)} pages, {number(q.maxRowsRead)} rows, {number(q.maxMs)} ms</span>
                  </span>
                ))}
              </span>
            }
            meaning="how much work each busy screen's database reads may do, measured on a test household set. A change that reads more fails the build."
          />
        </Section>

        <Section title="App health" intro="Refused requests and browser security reports.">
          <NotMeasured>
            rate-limit refusals and CSP or CSRF reports are written to the Vercel logs, not to a table, so there is no count to show here. Search the logs for &ldquo;rate limit&rdquo; and &ldquo;csp violation&rdquo;; see docs/security/rate-limits.md and docs/security/csp.md.
          </NotMeasured>
        </Section>
      </div>
    </main>
  );
}
