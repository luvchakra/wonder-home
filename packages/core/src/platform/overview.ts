import { isFresh, JOB_STEPS, type JobStep } from "../jobs/heartbeat";

/**
 * The platform-admin Overview (owner, 2026-11-07: "make the overview more
 * insightful, useful and actionable for the admin").
 *
 * Everything here is pure: the page reads one aggregate snapshot
 * (`public.platform_overview`, counts only), the settings totals and the
 * advisor counts, and these functions turn them into the opening sentence,
 * the "Needs you" list and the growth figures. Each item comes from a real
 * signal with a threshold written down here, never a guess (rule 9), and
 * every figure is a count someone can trace back to a table.
 */

export type DailyPoint = {
  day: string;
  newHouseholds: number;
  newPeople: number;
  activeHouseholds: number;
  activePeople: number;
  turns: number;
  homesendItems: number;
  homesendFailed: number;
  remindersDelivered: number;
  deliveryFailed: number;
};

type Pair = { households: number; people: number };
type Added = { confirmed: number; checking: number };
type Windows<T> = { last7: T; prev7: T; last30: T; prev30: T };

export type JobRow = {
  step: string;
  runner: string;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  runUrl: string | null;
};

export type OverviewSnapshot = {
  takenAt: string;
  totals: { households: number; people: number; supportGrantsOpen: number };
  byPlan: { plan: string; households: number }[];
  daily: DailyPoint[];
  active: Windows<Pair>;
  homesendAdded: Windows<Added>;
  last24h: { homesendFailed: number; homesendItems: number; deliveryFailed: number; delivered: number; hometalkTurns: number; hometalkFailed: number };
  hometalk7d: { turns: number; failed: number; p95Ms: number | null };
  quietSetups: number;
  aiKeyAlerts: { provider: string; kind: string; failures: number; lastSeenAt: string }[];
  billing: { openFindings: number; failedPayments7d: number; lastRun: { outcome: string; at: string } | null };
  jobs: JobRow[];
  migrations: { latest: string | null; count: number } | null;
};

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function windows<T>(v: unknown, read: (x: Record<string, unknown>) => T): Windows<T> {
  const o = obj(v);
  return { last7: read(obj(o.last7)), prev7: read(obj(o.prev7)), last30: read(obj(o.last30)), prev30: read(obj(o.prev30)) };
}

/** The RPC's answer, checked field by field; null when it is not an overview at all. */
export function parseOverview(raw: unknown): OverviewSnapshot | null {
  const o = obj(raw);
  if (!o.totals || !Array.isArray(o.daily)) return null;
  const totals = obj(o.totals);
  const last24h = obj(o.last24h);
  const ht = obj(o.hometalk7d);
  const billing = obj(o.billing);
  const lastRun = obj(billing.lastRun);
  const migrations = o.migrations ? obj(o.migrations) : null;
  return {
    takenAt: str(o.takenAt) ?? new Date(0).toISOString(),
    totals: { households: num(totals.households), people: num(totals.people), supportGrantsOpen: num(totals.supportGrantsOpen) },
    byPlan: arr(o.byPlan).map((p) => ({ plan: str(obj(p).plan) ?? "free", households: num(obj(p).households) })),
    daily: arr(o.daily).map((d) => {
      const x = obj(d);
      return {
        day: str(x.day) ?? "",
        newHouseholds: num(x.newHouseholds),
        newPeople: num(x.newPeople),
        activeHouseholds: num(x.activeHouseholds),
        activePeople: num(x.activePeople),
        turns: num(x.turns),
        homesendItems: num(x.homesendItems),
        homesendFailed: num(x.homesendFailed),
        remindersDelivered: num(x.remindersDelivered),
        deliveryFailed: num(x.deliveryFailed),
      };
    }),
    active: windows(o.active, (x) => ({ households: num(x.households), people: num(x.people) })),
    homesendAdded: windows(o.homesendAdded, (x) => ({ confirmed: num(x.confirmed), checking: num(x.checking) })),
    last24h: {
      homesendFailed: num(last24h.homesendFailed),
      homesendItems: num(last24h.homesendItems),
      deliveryFailed: num(last24h.deliveryFailed),
      delivered: num(last24h.delivered),
      hometalkTurns: num(last24h.hometalkTurns),
      hometalkFailed: num(last24h.hometalkFailed),
    },
    hometalk7d: { turns: num(ht.turns), failed: num(ht.failed), p95Ms: ht.p95Ms == null ? null : num(ht.p95Ms) },
    quietSetups: num(o.quietSetups),
    aiKeyAlerts: arr(o.aiKeyAlerts).map((a) => {
      const x = obj(a);
      return { provider: str(x.provider) ?? "", kind: str(x.kind) ?? "", failures: num(x.failures), lastSeenAt: str(x.lastSeenAt) ?? "" };
    }),
    billing: {
      openFindings: num(billing.openFindings),
      failedPayments7d: num(billing.failedPayments7d),
      lastRun: str(lastRun.outcome) ? { outcome: str(lastRun.outcome) as string, at: str(lastRun.at) ?? "" } : null,
    },
    jobs: arr(o.jobs).map((j) => {
      const x = obj(j);
      return {
        step: str(x.step) ?? "",
        runner: str(x.runner) ?? "",
        lastOkAt: str(x.lastOkAt),
        lastErrorAt: str(x.lastErrorAt),
        lastError: str(x.lastError),
        runUrl: str(x.runUrl),
      };
    }),
    migrations: migrations ? { latest: str(migrations.latest), count: num(migrations.count) } : null,
  };
}

/* ------------------------------------------------------------------ jobs */

export type JobState = "healthy" | "stale" | "failing";
export type JobStatus = { step: string; runner: string | null; state: JobState; lastOkAt: string | null; lastError: string | null; runUrl: string | null };

/** Where the background-jobs workflow's runs are listed. */
export const BACKGROUND_JOBS_RUNS_URL = "https://github.com/luvchakra/wonder-home/actions/workflows/background-jobs.yml";

/**
 * Every known background step, with its state: failing when its last error is
 * newer than its last success; stale when GitHub has not finished it recently
 * (Vercel has taken it back, as designed, but GitHub has stopped); else healthy.
 */
export function jobStatuses(jobs: readonly JobRow[], now: Date): JobStatus[] {
  const byStep = new Map(jobs.map((j) => [j.step, j]));
  return (Object.keys(JOB_STEPS) as JobStep[]).map((step) => {
    const row = byStep.get(step);
    if (!row) return { step, runner: null, state: "stale", lastOkAt: null, lastError: null, runUrl: null };
    const ok = row.lastOkAt ? Date.parse(row.lastOkAt) : NaN;
    const err = row.lastErrorAt ? Date.parse(row.lastErrorAt) : NaN;
    const failing = Number.isFinite(err) && (!Number.isFinite(ok) || err > ok);
    const fresh = isFresh({ step, runner: row.runner, last_ok_at: row.lastOkAt }, step, now);
    return {
      step,
      runner: row.runner,
      state: failing ? "failing" : fresh ? "healthy" : "stale",
      lastOkAt: row.lastOkAt,
      lastError: failing ? row.lastError : null,
      runUrl: row.runUrl,
    };
  });
}

/* ------------------------------------------------------------- needs you */

export type NeedSeverity = "critical" | "attention" | "tidy";
export type NeedKind =
  | "jobs-failing"
  | "ai-key"
  | "hometalk-failing"
  | "billing"
  | "jobs-stale"
  | "homesend-failures"
  | "delivery-failures"
  | "advisor"
  | "payments-failed"
  | "support-grants"
  | "settings-from-vercel"
  | "vercel-variables"
  | "quiet-setups";

export type NeedItem = {
  kind: NeedKind;
  severity: NeedSeverity;
  /** A sentence fragment that also reads inside the opening sentence: "23 Vercel variables can be deleted". */
  title: string;
  /** Why it matters, in one line. */
  why: string;
  action: { label: string; href: string; external?: boolean };
};

export type SettingsSignal = { saved: number; environment: number; stillInVercel: number; storeReady: boolean };
export type AdvisorSignal = { source: "live" | "baseline"; gated: number; accepted: number };

/** Thresholds, written down so the list never raises an item on a hunch. */
export const NEED_THRESHOLDS = {
  /** HomeTalk: at least this many failed turns in 24 hours, and at least this share of them. */
  hometalkFailedMin: 3,
  hometalkFailedShare: 0.2,
  /** HomeSend: at least this many failed items in 24 hours, and more than twice the previous week's daily average. */
  homesendFailedMin: 3,
  /** Deliveries: at least this many failures in 24 hours, and at least this share of attempts. */
  deliveryFailedMin: 3,
  deliveryFailedShare: 0.1,
} as const;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const KEY_KIND: Record<string, string> = {
  key_rejected: "is refusing WonderHome's key",
  out_of_credits: "says WonderHome's key is out of credits",
  quota_exhausted: "says WonderHome's key has used its quota",
};
const PROVIDER: Record<string, string> = { anthropic: "Anthropic", google: "Google", openai: "OpenAI" };
const SEVERITY_ORDER: Record<NeedSeverity, number> = { critical: 0, attention: 1, tidy: 2 };

/**
 * What needs a platform admin, most urgent first. Only real signals raise an
 * item; with none, the list is empty and the page says so.
 */
export function needsYou(
  snapshot: OverviewSnapshot,
  settings: SettingsSignal | null,
  advisor: AdvisorSignal | null,
  now: Date,
): NeedItem[] {
  const items: NeedItem[] = [];
  const jobs = jobStatuses(snapshot.jobs, now);

  const failing = jobs.filter((j) => j.state === "failing");
  const first = failing[0];
  if (first) {
    items.push({
      kind: "jobs-failing",
      severity: "critical",
      title: failing.length === 1 ? `the background job ${first.step} is failing` : `${failing.length} background jobs are failing`,
      why: first.lastError ? `Last error on ${first.step}: ${first.lastError}` : "Its last run on GitHub ended in an error; Vercel picks the work up once it goes stale.",
      action: { label: "Open the run", href: first.runUrl ?? BACKGROUND_JOBS_RUNS_URL, external: true },
    });
  }

  for (const alert of snapshot.aiKeyAlerts) {
    const provider = PROVIDER[alert.provider] ?? alert.provider;
    items.push({
      kind: "ai-key",
      severity: "critical",
      title: `${provider} ${KEY_KIND[alert.kind] ?? "has a problem with WonderHome's key"}`,
      why: `${plural(alert.failures, "request has", "requests have")} failed since it started. Households without their own key get no AI replies.`,
      action: { label: "Open AI & providers", href: "/platform-admin/ai" },
    });
  }

  const ht = snapshot.last24h;
  if (ht.hometalkFailed >= NEED_THRESHOLDS.hometalkFailedMin && ht.hometalkFailed >= NEED_THRESHOLDS.hometalkFailedShare * Math.max(ht.hometalkTurns, 1)) {
    items.push({
      kind: "hometalk-failing",
      severity: "critical",
      title: `${ht.hometalkFailed} of ${ht.hometalkTurns} HomeTalk turns failed today`,
      why: "In the last 24 hours, a model provider errored or the turn failed. People are getting no answer.",
      action: { label: "Open AI & providers", href: "/platform-admin/ai" },
    });
  }

  const billing = snapshot.billing;
  if (billing.openFindings > 0 || billing.lastRun?.outcome === "failed") {
    items.push({
      kind: "billing",
      severity: "critical",
      title:
        billing.openFindings > 0
          ? `${plural(billing.openFindings, "payment differs", "payments differ")} from the provider's record`
          : "the last payment reconciliation failed",
      why: "Our ledger and the payment provider must agree before a plan changes or a refund is given.",
      action: { label: "Open Plans & billing", href: "/platform-admin/plans" },
    });
  }

  const stale = jobs.filter((j) => j.state === "stale");
  if (stale.length > 0) {
    items.push({
      kind: "jobs-stale",
      severity: "attention",
      title:
        stale.length === 1 && stale[0]
          ? `the background job ${stale[0].step} stopped running on GitHub`
          : `${stale.length} background jobs stopped running on GitHub`,
      why: "Vercel is doing the work again, as designed, which spends its own budget. Check the GitHub schedule and secrets.",
      action: { label: "Open background jobs", href: BACKGROUND_JOBS_RUNS_URL, external: true },
    });
  }

  const prevWeek = snapshot.daily.slice(-8, -1);
  const prevAvg = prevWeek.length > 0 ? prevWeek.reduce((s, d) => s + d.homesendFailed, 0) / prevWeek.length : 0;
  if (ht.homesendFailed >= NEED_THRESHOLDS.homesendFailedMin && ht.homesendFailed > 2 * prevAvg) {
    items.push({
      kind: "homesend-failures",
      severity: "attention",
      title: `${ht.homesendFailed} HomeSend items failed today`,
      why: `That is more than twice the usual (${prevAvg.toFixed(1)} a day over the week before). Things people sent are not being read.`,
      action: { label: "Open Vercel logs", href: "https://vercel.com/kunals-projects-9f64757f/wonderhome/logs", external: true },
    });
  }

  const attempts = ht.deliveryFailed + ht.delivered;
  if (ht.deliveryFailed >= NEED_THRESHOLDS.deliveryFailedMin && ht.deliveryFailed >= NEED_THRESHOLDS.deliveryFailedShare * Math.max(attempts, 1)) {
    items.push({
      kind: "delivery-failures",
      severity: "attention",
      title: `${ht.deliveryFailed} of ${attempts} reminder deliveries failed today`,
      why: "Push, email or WhatsApp refused them in the last 24 hours. Reminders still show in the app.",
      action: { label: "Open Integrations", href: "/platform-admin/integrations" },
    });
  }

  if (advisor && advisor.source === "live" && advisor.gated > advisor.accepted) {
    const fresh = advisor.gated - advisor.accepted;
    items.push({
      kind: "advisor",
      severity: "attention",
      title: `the database advisor has ${plural(fresh, "new finding", "new findings")}`,
      why: "Supabase flagged security or performance lints beyond the accepted baseline.",
      action: { label: "Open Performance", href: "/platform-admin/performance" },
    });
  }

  if (billing.failedPayments7d > 0) {
    items.push({
      kind: "payments-failed",
      severity: "attention",
      title: `${plural(billing.failedPayments7d, "plan payment", "plan payments")} failed this week`,
      why: "Those households stay on their current plan until a payment succeeds.",
      action: { label: "Open Plans & billing", href: "/platform-admin/plans" },
    });
  }

  if (snapshot.totals.supportGrantsOpen > 0) {
    items.push({
      kind: "support-grants",
      severity: "attention",
      title: `${plural(snapshot.totals.supportGrantsOpen, "support grant is", "support grants are")} open`,
      why: "Staff can see into a household while a grant is open. Each one ends on its own; revoke any that are done.",
      action: { label: "Open Security", href: "/platform-admin/security" },
    });
  }

  if (settings?.storeReady && settings.environment > 0) {
    items.push({
      kind: "settings-from-vercel",
      severity: "tidy",
      title: `${plural(settings.environment, "setting still comes", "settings still come")} from Vercel`,
      why: "Saved here, a setting reaches every server within a minute with no redeploy.",
      action: { label: "Open Configuration", href: "/platform-admin/configuration" },
    });
  }

  if (settings?.storeReady && settings.stillInVercel > 0) {
    items.push({
      kind: "vercel-variables",
      severity: "tidy",
      title: `${plural(settings.stillInVercel, "Vercel variable", "Vercel variables")} can be deleted`,
      why: "They are saved here now and no longer read. Each is marked on its row.",
      action: { label: "See which", href: "/platform-admin/configuration" },
    });
  }

  if (snapshot.quietSetups > 0) {
    items.push({
      kind: "quiet-setups",
      severity: "tidy",
      title: `${plural(snapshot.quietSetups, "household was", "households were")} set up but nobody came back`,
      why: "Older than three days, with no sign-in after the day it was made. A nudge may help.",
      action: { label: "Open Households", href: "/platform-admin/households" },
    });
  }

  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => SEVERITY_ORDER[a.item.severity] - SEVERITY_ORDER[b.item.severity] || a.index - b.index)
    .map(({ item }) => item);
}


/** The page's opening sentence (rule 7): the state in words, then what needs the reader. */
export function openingSentence(items: readonly NeedItem[]): string {
  const problems = items.filter((i) => i.severity !== "tidy");
  const health = problems.length === 0 ? "All systems healthy." : problems.length === 1 ? "1 problem to fix." : `${problems.length} problems to fix.`;
  if (items.length === 0) return `${health} Nothing needs you right now.`;
  const shown = items.slice(0, 3).map((i) => i.title);
  const more = items.length - shown.length;
  const list = more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(", ");
  return `${health} ${items.length === 1 ? "One thing needs" : `${items.length} things need`} you: ${list}.`;
}

/* --------------------------------------------------------- growth & use */

export type Period = 7 | 30;
export type GrowthMetric = {
  key: "newHouseholds" | "activeHouseholds" | "activePeople" | "turns" | "homesendItems" | "remindersDelivered";
  label: string;
  /** How it is counted, in a line someone can check. */
  how: string;
  value: number;
  previous: number;
  /** One value per day of the period, oldest first, for the sparkline. */
  series: number[];
};

const sum = (points: readonly DailyPoint[], key: keyof Omit<DailyPoint, "day">) => points.reduce((s, d) => s + d[key], 0);

/** The period's figures and the period before, from the daily series and the activity windows. */
export function growth(snapshot: OverviewSnapshot, period: Period): GrowthMetric[] {
  const days = snapshot.daily;
  const current = days.slice(-period);
  const before = days.slice(-2 * period, -period);
  const active = period === 7 ? { now: snapshot.active.last7, then: snapshot.active.prev7 } : { now: snapshot.active.last30, then: snapshot.active.prev30 };
  const series = (key: keyof Omit<DailyPoint, "day">) => current.map((d) => d[key]);
  return [
    { key: "newHouseholds", label: "New households", how: "Households created", value: sum(current, "newHouseholds"), previous: sum(before, "newHouseholds"), series: series("newHouseholds") },
    { key: "activeHouseholds", label: "Active households", how: "Someone made a change or talked to HomeTalk", value: active.now.households, previous: active.then.households, series: series("activeHouseholds") },
    { key: "activePeople", label: "Active people", how: "People who made a change or talked to HomeTalk", value: active.now.people, previous: active.then.people, series: series("activePeople") },
    { key: "turns", label: "HomeTalk turns", how: "Messages people sent to HomeTalk", value: sum(current, "turns"), previous: sum(before, "turns"), series: series("turns") },
    { key: "homesendItems", label: "HomeSend items", how: "Things sent in by photo, file, email or WhatsApp", value: sum(current, "homesendItems"), previous: sum(before, "homesendItems"), series: series("homesendItems") },
    { key: "remindersDelivered", label: "Reminders delivered", how: "Sent by push, email, WhatsApp or in the app", value: sum(current, "remindersDelivered"), previous: sum(before, "remindersDelivered"), series: series("remindersDelivered") },
  ];
}

/** "+3 on the 7 days before", "Same as the 7 days before", "−2 on the 30 days before". */
export function deltaWords(value: number, previous: number, period: Period): string {
  const diff = value - previous;
  const span = `the ${period} days before`;
  if (diff === 0) return `Same as ${span}`;
  return `${diff > 0 ? "+" : "−"}${Math.abs(diff)} on ${span}`;
}

/** HomeSend's entries in the period: added as confirmed, or added and still being checked. */
export function homesendAdded(snapshot: OverviewSnapshot, period: Period): { confirmed: number; checking: number; total: number } {
  const w = period === 7 ? snapshot.homesendAdded.last7 : snapshot.homesendAdded.last30;
  return { ...w, total: w.confirmed + w.checking };
}

/** Households by plan, adding up to the total (rule 9); any difference is reported, never hidden. */
export function plansAddUp(snapshot: OverviewSnapshot): { rows: { plan: string; households: number }[]; total: number; addsUp: boolean } {
  const total = snapshot.byPlan.reduce((s, p) => s + p.households, 0);
  return { rows: snapshot.byPlan, total, addsUp: total === snapshot.totals.households };
}
