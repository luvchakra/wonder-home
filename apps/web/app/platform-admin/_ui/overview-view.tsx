import {
  Activity,
  AlertTriangle,
  BellRing,
  CircleCheck,
  Clock,
  CloudCog,
  CreditCard,
  Database,
  House,
  Inbox,
  KeyRound,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

import {
  BACKGROUND_JOBS_RUNS_URL,
  deltaWords,
  growth,
  homesendAdded,
  jobStatuses,
  needsYou,
  nothingWaitsNeed,
  openingSentence,
  plansAddUp,
  type GrowthMetric,
  type JobState,
  type NeedItem,
  type NeedKind,
  type OverviewSnapshot,
  type Period,
  type AdvisorSignal,
} from "@wonderhome/core/platform/overview";
import { nothingWaitsOnTarget, type NothingWaitsMetrics } from "@wonderhome/core/homesend/metrics";
import { ButtonLink } from "@wonderhome/core/ui/button";
import type { IconTone } from "@wonderhome/core/ui/icon-tile";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { MetricGrid } from "@wonderhome/core/ui/metric-card";
import { Badge } from "@wonderhome/core/ui/pill";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { Sparkline } from "@wonderhome/core/ui/sparkline";

import { PageBody, PageTitle, Panel } from "./page-title";


const NEED_ICON: Record<NeedKind, ComponentType<{ className?: string }>> = {
  "jobs-failing": Workflow,
  "ai-key": KeyRound,
  "hometalk-failing": MessageCircle,
  billing: CreditCard,
  "jobs-stale": Clock,
  "homesend-failures": Inbox,
  "homesend-stuck": Inbox,
  "delivery-failures": BellRing,
  advisor: Database,
  "payments-failed": CreditCard,
  "support-grants": ShieldCheck,
  "settings-from-vercel": CloudCog,
  "vercel-variables": KeyRound,
  "quiet-setups": House,
};
const SEVERITY_TONE: Record<NeedItem["severity"], IconTone> = { critical: "risk", attention: "attention", tidy: "neutral" };
const GROWTH_ICON: Record<GrowthMetric["key"], { icon: ComponentType<{ className?: string }>; tone: IconTone }> = {
  newHouseholds: { icon: House, tone: "home" },
  activeHouseholds: { icon: Activity, tone: "home" },
  activePeople: { icon: UserRound, tone: "people" },
  turns: { icon: MessageCircle, tone: "ai" },
  homesendItems: { icon: Inbox, tone: "ai" },
  remindersDelivered: { icon: BellRing, tone: "primary" },
};
const JOB_STATE: Record<JobState, { label: string; tone: "handled" | "attention" | "risk" }> = {
  healthy: { label: "On GitHub", tone: "handled" },
  stale: { label: "Vercel doing it", tone: "attention" },
  failing: { label: "Failing", tone: "risk" },
};
const PLAN_LABEL: Record<string, string> = { free: "Free", pro: "Pro", max: "Max" };

const IST = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

function ago(iso: string | null, now: number): string {
  if (!iso) return "never";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "never";
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return IST.format(new Date(at));
}


export type ServiceState = { name: string; href: string; ready: boolean };
export type OverviewViewProps = {
  snapshot: OverviewSnapshot | null;
  advisor: AdvisorSignal | null;
  /** "Nothing waits" measures (2026-11-14); null when not measured. */
  nothingWaits?: NothingWaitsMetrics | null;
  settings: { saved: number; environment: number; stillInVercel: number; storeReady: boolean };
  services: readonly ServiceState[];
  period: Period;
  role: string;
};

/**
 * The Overview, drawn from figures already read (the page does the reading):
 * what needs the admin first, then growth and use, then health (rule 17).
 */
export function OverviewView({ snapshot, advisor, nothingWaits = null, settings, services, period, role }: OverviewViewProps) {
  // Every age on the page is measured from when the figures were read, so they agree with each other.
  const nowMs = snapshot ? Date.parse(snapshot.takenAt) : 0;
  const now = new Date(nowMs);
  const isOwner = role === "owner";
  // The grants list (`/platform-admin/households/grants`) is the owner's; everyone else gets Security.
  const stuck = nothingWaitsNeed(nothingWaits);
  const items = (snapshot ? [...needsYou(snapshot, settings, advisor, now), ...(stuck ? [stuck] : [])] : []).map((item) =>
    item.kind === "support-grants" && isOwner ? { ...item, action: { label: "See the grants", href: "/platform-admin/households/grants" } } : item,
  );
  const lede = snapshot
    ? openingSentence(items)
    : "The overview's figures couldn't be read just now, so nothing below is measured. Settings and services still show.";

  return (
    <PageBody>
      <PageTitle title="Platform admin" subtitle={lede} />

      {/* 1. What needs the reader, most urgent first. */}
      <Panel title="Needs you" description={snapshot ? "Raised only from real signals, most urgent first." : undefined}>
        {!snapshot ? (
          <p className="text-sm text-[var(--wh-foreground-muted)]">Not measured: the database didn&apos;t return the overview.</p>
        ) : items.length === 0 ? (
          <div className="flex items-center gap-3 py-2">
            <IconTile icon={CircleCheck} tone="handled" />
            <p className="text-sm font-medium">Nothing needs you right now.</p>
          </div>
        ) : (
          <ol className="divide-y divide-[var(--wh-border)]">
            {items.map((item) => (
              <li
                key={`${item.kind}-${item.title}`}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
              >
                <IconTile icon={NEED_ICON[item.kind]} tone={SEVERITY_TONE[item.severity]} />
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">{item.title.charAt(0).toUpperCase() + item.title.slice(1)}</p>
                  <p className="text-xs break-words text-[var(--wh-foreground-subtle)]">{item.why}</p>
                </div>
                <div className="col-start-2 sm:col-start-3">
                  {item.action.external ? (
                    <a
                      href={item.action.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex min-h-11 items-center rounded-[var(--wh-radius-pill)] border border-[var(--wh-border)] px-4 text-sm font-semibold text-[var(--wh-primary)] hover:bg-[var(--wh-primary-soft)]"
                    >
                      {item.action.label}
                    </a>
                  ) : (
                    <ButtonLink href={item.action.href} variant="secondary">
                      {item.action.label}
                    </ButtonLink>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      {/* 2. Growth & use. Aggregates only: never a household's name or content. */}
      <Panel
        title="Growth & use"
        description={`The last ${period} days against the ${period} before, on India time. Counts only; nothing here names a household.`}
      >
        <SegmentedControl
          label="Period"
          active={String(period)}
          segments={[
            { key: "7", label: "Last 7 days", href: "/platform-admin" },
            { key: "30", label: "Last 30 days", href: "/platform-admin?period=30" },
          ]}
        />

        <MetricGrid
          metrics={[
            { label: "Households", value: snapshot?.totals.households ?? "—", icon: House, tone: "home", href: "/platform-admin/households" },
            { label: "People", value: snapshot?.totals.people ?? "—", icon: Users, tone: "people", href: "/platform-admin/households" },
            {
              label: "Support grants",
              value: snapshot?.totals.supportGrantsOpen ?? "—",
              icon: ShieldCheck,
              tone: "health",
              ...(isOwner ? { href: "/platform-admin/households/grants" } : {}),
            },
          ]}
          pairs
        />

        {snapshot ? (
          <>
            <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {growth(snapshot, period).map((metric) => {
                const look = GROWTH_ICON[metric.key];
                const low = Math.min(...metric.series);
                const high = Math.max(...metric.series);
                return (
                  <li key={metric.key} className="min-w-0 space-y-2 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3.5 py-3">
                    <div className="flex items-center gap-2">
                      <IconTile icon={look.icon} tone={look.tone} size="sm" />
                      <p className="min-w-0 text-sm font-medium break-words">{metric.label}</p>
                    </div>
                    <div className="flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-2xl font-semibold leading-tight tracking-tight">{metric.value}</p>
                        <p className="text-xs text-[var(--wh-foreground-muted)]">{deltaWords(metric.value, metric.previous, period)}</p>
                      </div>
                      <Sparkline values={metric.series} label={`${metric.label} per day over ${period} days, from ${low} to ${high}`} />
                    </div>
                    <p className="text-[0.6875rem] text-[var(--wh-foreground-subtle)]">{metric.how}</p>
                  </li>
                );
              })}
            </ul>

            <div className="grid gap-3 sm:grid-cols-2">
              <PlansBreakdown snapshot={snapshot} linkPlans={isOwner} />
              <HomeSendSplit snapshot={snapshot} period={period} />
              <NothingWaitsPanel metrics={nothingWaits} />
            </div>
          </>
        ) : null}
      </Panel>

      {/* 3. Health: what is running, and how well. */}
      <Panel title="Health" description="Background jobs, replies and errors. Each figure links to where you'd act on it.">
        {snapshot ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">Background jobs</h3>
                <a href={BACKGROUND_JOBS_RUNS_URL} target="_blank" rel="noreferrer noopener" className="text-xs font-semibold text-[var(--wh-primary)]">
                  Runs on GitHub
                </a>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {jobStatuses(snapshot.jobs, now).map((job) => (
                  <li key={job.step} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2 text-sm">
                    <span className="min-w-0 break-words">
                      <span className="font-medium">{job.step}</span>
                      <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                        Last finished {ago(job.lastOkAt, nowMs)}
                        {job.runner && job.runner !== "github" ? ` on ${job.runner}` : ""}
                      </span>
                    </span>
                    <Badge tone={JOB_STATE[job.state].tone}>{JOB_STATE[job.state].label}</Badge>
                  </li>
                ))}
              </ul>
            </div>

            <MetricGrid
              metrics={[
                {
                  label: "HomeTalk reply time, 95th percentile (7 days)",
                  value: snapshot.hometalk7d.p95Ms == null ? "No turns" : `${(snapshot.hometalk7d.p95Ms / 1000).toFixed(1)} s`,
                  icon: Clock,
                  tone: "ai",
                  href: "/platform-admin/ai",
                },
                {
                  label: `Failed in 7 days: HomeTalk ${snapshot.hometalk7d.failed}, HomeSend ${sumLast(snapshot.daily, "homesendFailed", 7)}, deliveries ${sumLast(snapshot.daily, "deliveryFailed", 7)}`,
                  value: snapshot.hometalk7d.failed + sumLast(snapshot.daily, "homesendFailed", 7) + sumLast(snapshot.daily, "deliveryFailed", 7),
                  icon: AlertTriangle,
                  tone: snapshot.hometalk7d.failed + sumLast(snapshot.daily, "homesendFailed", 7) + sumLast(snapshot.daily, "deliveryFailed", 7) > 0 ? "attention" : "handled",
                },
                {
                  label:
                    advisor?.source === "live"
                      ? `Advisor findings now (accepted baseline ${advisor.accepted})`
                      : "Advisor findings at the last CI run",
                  value: advisor ? advisor.gated : "—",
                  icon: Database,
                  tone: "neutral",
                  href: "/platform-admin/performance",
                },
              ]}
            />

            <p className="text-xs text-[var(--wh-foreground-subtle)]">
              {snapshot.migrations
                ? `${snapshot.migrations.count} migrations applied to the live database, the latest stamped ${snapshot.migrations.latest ?? "—"}. `
                : ""}
              Figures as of {IST.format(new Date(snapshot.takenAt))}, refreshed at most once a minute.
            </p>
            <p className="text-xs text-[var(--wh-foreground-subtle)]">
              Not watched here yet: the nightly end-to-end run and other scheduled workflows, and the production deploy state (the portal holds no GitHub or
              Vercel token); migration drift (CI&apos;s migration check covers it); and CSP reports (logged, not stored).
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--wh-foreground-muted)]">Not measured just now.</p>
        )}
      </Panel>

      {/* 4. Settings, one compact row. */}
      <Panel title="Settings">
        <Link
          href="/platform-admin/configuration"
          className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2 text-sm hover:bg-[var(--wh-primary-soft)]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <CloudCog aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-subtle)]" />
            <span className="break-words">
              {settings.storeReady
                ? `${settings.saved} saved here · ${settings.environment} still from Vercel · ${settings.stillInVercel} also in Vercel, can be deleted`
                : "The settings store isn't reachable just now, so every setting comes from Vercel."}
            </span>
          </span>
          <span className="font-semibold text-[var(--wh-primary)]">Open</span>
        </Link>
      </Panel>

      <Panel title="Services" description="Each one is off until everything it needs is set.">
        <ul className="grid gap-2 sm:grid-cols-2">
          {services.map((service) => {
            const ready = service.ready;
            return (
              <li key={service.name}>
                <Link
                  href={service.href}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2 text-sm hover:bg-[var(--wh-primary-soft)]"
                >
                  <span className="min-w-0 break-words font-medium">{service.name}</span>
                  <Badge tone={ready ? "handled" : "neutral"}>{ready ? "On" : "Off"}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      </Panel>

      <p className="text-center text-sm text-[var(--wh-foreground-muted)]">
        You&apos;re signed in as {role}. Nothing on this page shows a household&apos;s own data.
      </p>
    </PageBody>
  );
}

function sumLast(daily: readonly { homesendFailed: number; deliveryFailed: number }[], key: "homesendFailed" | "deliveryFailed", days: number): number {
  return daily.slice(-days).reduce((s, d) => s + d[key], 0);
}

function PlansBreakdown({ snapshot, linkPlans }: { snapshot: OverviewSnapshot; linkPlans: boolean }) {
  const { rows, total, addsUp } = plansAddUp(snapshot);
  return (
    <div className="space-y-2 rounded-[var(--wh-radius)] border border-[var(--wh-border)] px-3.5 py-3">
      <div className="flex items-center gap-2">
        <IconTile icon={CreditCard} tone="money" size="sm" />
        <h3 className="text-sm font-semibold">Households by plan</h3>
      </div>
      <ul className="space-y-1.5 text-sm">
        {rows.map((row) => (
          <li key={row.plan} className="space-y-1">
            <div className="flex justify-between gap-2">
              {linkPlans ? (
                <Link href={`/platform-admin/households/all?plan=${row.plan}`} className="font-medium text-[var(--wh-primary)]">
                  {PLAN_LABEL[row.plan] ?? row.plan}
                </Link>
              ) : (
                <span>{PLAN_LABEL[row.plan] ?? row.plan}</span>
              )}
              <span className="font-semibold tabular-nums">{row.households}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--wh-surface-muted)]" aria-hidden>
              <div className="h-1.5 rounded-full bg-[var(--wh-primary)]" style={{ width: `${total > 0 ? (row.households / total) * 100 : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-[var(--wh-foreground-subtle)]">
        {addsUp
          ? `${rows.map((r) => r.households).join(" + ")} = ${total} households. A household with no plan of its own is on Free.`
          : `These add up to ${total}, not ${snapshot.totals.households}: a household changed while the figures were read.`}
      </p>
    </div>
  );
}

/** The four "Nothing waits" measures (2026-11-14), each beside its target, counts out of totals (principle 9). */
function NothingWaitsPanel({ metrics }: { metrics: NothingWaitsMetrics | null }) {
  if (!metrics) {
    return (
      <div className="space-y-2 rounded-[var(--wh-radius)] border border-[var(--wh-border)] px-3.5 py-3">
        <h3 className="text-sm font-semibold">Nothing waits</h3>
        <p className="text-sm text-[var(--wh-foreground-muted)]">Not measured yet.</p>
      </div>
    );
  }
  const on = nothingWaitsOnTarget(metrics);
  const oldest = metrics.openByHousehold[0]?.oldestHours ?? null;
  const rows: { label: string; value: string; target: string; ok: boolean }[] = [
    { label: "Sends that needed a person (30 days)", value: `${metrics.neededPerson.count} of ${metrics.neededPerson.of}`, target: "under 1 in 10", ok: on.neededPerson },
    {
      label: "Open in Needs you",
      value: metrics.openByHousehold.length === 0 ? "none" : `${metrics.openTotal} in ${metrics.openByHousehold.length} ${metrics.openByHousehold.length === 1 ? "household" : "households"}; most ${Math.max(...metrics.openByHousehold.map((row) => row.open))}, oldest ${oldest} h`,
      target: "at most 3 a household, none past 48 h",
      ok: on.open,
    },
    { label: "Checking entries older than 7 days, no stated reason", value: `${metrics.checkingOver7d}${metrics.checkingKept > 0 ? ` (and ${metrics.checkingKept} kept Checking: check before paying)` : ""}`, target: "none", ok: on.checking },
    { label: "Entries undone within 7 days (30 days)", value: `${metrics.undoneWithin7d.count} of ${metrics.undoneWithin7d.of}`, target: "under 1 in 20", ok: on.undone },
  ];
  return (
    <div className="space-y-2 rounded-[var(--wh-radius)] border border-[var(--wh-border)] px-3.5 py-3">
      <div className="flex items-center gap-2">
        <IconTile icon={Inbox} tone="ai" size="sm" />
        <h3 className="text-sm font-semibold">Nothing waits</h3>
      </div>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.label} className="text-sm">
            <span className="font-medium">{row.label}:</span> {row.value}{" "}
            <span className={row.ok ? "text-[var(--wh-handled)]" : "text-[var(--wh-attention)]"}>· {row.ok ? "on target" : "off target"} ({row.target})</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-[var(--wh-foreground-subtle)]">Aggregate only, across every household. Per household figures carry no name.</p>
    </div>
  );
}

function HomeSendSplit({ snapshot, period }: { snapshot: OverviewSnapshot; period: Period }) {
  const added = homesendAdded(snapshot, period);
  const share = added.total > 0 ? Math.round((added.confirmed / added.total) * 100) : null;
  return (
    <div className="space-y-2 rounded-[var(--wh-radius)] border border-[var(--wh-border)] px-3.5 py-3">
      <div className="flex items-center gap-2">
        <IconTile icon={Sparkles} tone="ai" size="sm" />
        <h3 className="text-sm font-semibold">What HomeSend added</h3>
      </div>
      <p className="text-sm">
        {added.total === 0
          ? `Nothing added in the last ${period} days.`
          : `${added.total} ${added.total === 1 ? "entry" : "entries"}: ${added.confirmed} confirmed, ${added.checking} still checking${share == null ? "" : ` (${share}% confirmed)`}.`}
      </p>
      {added.total > 0 ? (
        <div className="flex h-1.5 overflow-hidden rounded-full bg-[var(--wh-surface-muted)]" aria-hidden>
          <div className="h-1.5 bg-[var(--wh-handled)]" style={{ width: `${(added.confirmed / added.total) * 100}%` }} />
          <div className="h-1.5 bg-[var(--wh-attention)]" style={{ width: `${(added.checking / added.total) * 100}%` }} />
        </div>
      ) : null}
      <p className="text-xs text-[var(--wh-foreground-subtle)]">Entries created from what people sent, not undone. Checking ones wait for their sender to confirm.</p>
    </div>
  );
}
