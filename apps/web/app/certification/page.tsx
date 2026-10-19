import { BadgeCheck, CircleCheck, Clock, History, Pencil, Sparkles, TriangleAlert, XCircle } from "lucide-react";

import {
  alertsFor,
  CERTIFICATION_CATEGORIES,
  certificationHealth,
  summarize,
  withRecords,
  type CertificationAlert,
  type CertificationHistoryEntry,
  type CertificationItem as Item,
  type ReviewDecision,
} from "@wonderhome/core/household/certification";
import { loadUnderstandingRecords } from "@wonderhome/core/household/setup-repository";
import { isHouseholdAdmin } from "@wonderhome/core/identity/households";
import type { Translate } from "@wonderhome/core/i18n/translate";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { CertificationItem } from "@wonderhome/core/ui/certification-item";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { MetricGrid } from "@wonderhome/core/ui/metric-card";
import { ProgressRing } from "@wonderhome/core/ui/progress-ring";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";

import { SleepSection, type SleepChange, type SleepView } from "./sleep-section";
import { AddBeliefButton, BulkReviewList, CertificationControls } from "../_components/certification-controls";
import { bulkReviewLabels, certificationControlLabels, certificationItemLabels, reviewCategoryWords, reviewReason } from "../_lib/review-labels";
import { formatDate, formatTime, requireSession } from "../_lib/session";

export const metadata = { title: "HomeBrain" };
export const dynamic = "force-dynamic";

/** The alert's one-word action, as the badge — so "Needs review" says which kind of look. */
const alertActionWords = (action: CertificationAlert["action"], t: Translate) => t(`review.alert.${action}`);

/** One glyph and tone per decision, wherever history shows one (rule 4). */
const DECISION_ICON: Record<ReviewDecision, typeof CircleCheck> = {
  confirmed: CircleCheck,
  corrected: Pencil,
  removed: XCircle,
  deferred: Clock,
};
const DECISION_TONE: Record<ReviewDecision, IconTone> = {
  confirmed: "handled",
  corrected: "attention",
  removed: "neutral",
  deferred: "neutral",
};

/**
 * How sure WonderHome is, in words (rule 9: never a percentage nobody can
 * explain) — from where a belief came from and whether the family has
 * confirmed it, which is all the certainty there really is.
 */
function confidenceFor(sourceType: Item["sourceType"], status: Item["status"], t: Translate): string {
  if (status === "confirmed") return t("review.confidence.confirmed");
  return t(`review.confidence.${sourceType}`);
}

/**
 * Household Certification (requirements §22): what WonderHome believes, where
 * each belief came from, and the controls to confirm, correct or remove it.
 * The percentage is confirmed over live — arithmetic, never a model's opinion
 * of itself.
 */
export default async function CertificationPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, session] = await Promise.all([searchParams, requireSession("/certification")]);
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const active = tab === "confirmed" || tab === "learned" || tab === "review" || tab === "history" ? tab : "review";
  const shell = { active: "more" as const, viewer, secondary, pathname: "/certification", back: { href: "/more", label: t("common.back") }, title: t("nav.item.certification") };

  const admin = isHouseholdAdmin(membership);
  const sleepWanted = active === "learned" && admin;
  const [{ data }, { data: historyRows }, records, sleep] = await Promise.all([
    supabase
      .from("certification_items")
      .select("id, category, claim, source_type, source_detail, status, risk_level, last_reviewed_at, created_at")
      .eq("household_id", householdId)
      .order("risk_level")
      .order("created_at", { ascending: false }),
    active === "history"
      ? supabase
          .from("certification_reviews")
          .select("id, decision, previous_value, new_value, created_at, household_members(display_name)")
          .eq("household_id", householdId)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: null }),
    // The household's own records, counted in the same wave (`withRecords`).
    loadUnderstandingRecords(supabase, membership.household),
    // What HomeBrain did overnight (HomeBrain Sleep): Admins, on the Learned tab.
    sleepWanted ? readSleepView(supabase, householdId) : Promise.resolve(null),
  ]);

  const history: CertificationHistoryEntry[] = ((historyRows as Record<string, unknown>[] | null) ?? []).map((row) => {
    const reviewer = row.household_members as { display_name: string } | { display_name: string }[] | null;
    const reviewerName = (Array.isArray(reviewer) ? reviewer[0]?.display_name : reviewer?.display_name) ?? t("review.someone");
    const previous = row.previous_value as { claim?: string } | null;
    const next = row.new_value as { claim?: string } | null;
    return {
      id: row.id as string,
      reviewerName,
      decision: row.decision as ReviewDecision,
      claim: next?.claim ?? previous?.claim ?? "",
      previousClaim: row.decision === "corrected" ? (previous?.claim ?? null) : null,
      reviewedAt: new Date(row.created_at as string),
    };
  });

  const learnedAt = new Map(((data as Record<string, unknown>[] | null) ?? []).map((row) => [row.id as string, new Date(row.created_at as string)]));
  const items: Item[] = ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
    id: row.id as string,
    category: row.category as Item["category"],
    claim: row.claim as string,
    sourceType: row.source_type as Item["sourceType"],
    sourceDetail: (row.source_detail as string | null) ?? null,
    status: row.status as Item["status"],
    riskLevel: row.risk_level as Item["riskLevel"],
    lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at as string) : null,
  }));

  const now = new Date();
  const summary = summarize(items, now);
  // How much of the household HomeBrain holds: what was said, and what the family keeps on its own screens.
  const understood = withRecords(summary, records);
  const understoodTotal = understood.confirmed + understood.learned + understood.needsReview;
  const health = certificationHealth(items, now);
  const alerts = alertsFor(items, now, 50);
  const alertIds = new Set(alerts.map((alert) => alert.itemId));
  const live = items.filter((item) => item.status !== "removed" && item.status !== "corrected");
  const shown = active === "review" ? live.filter((item) => alertIds.has(item.id)) : active === "confirmed" ? live.filter((item) => item.status === "confirmed" && !alertIds.has(item.id)) : live.filter((item) => item.status === "learned" && !alertIds.has(item.id));
  const canReview = view.tone !== "child";
  const itemLabels = certificationItemLabels(t);
  const controlLabels = certificationControlLabels(t);
  const bulkLabels = bulkReviewLabels(t);
  // The explanation `certificationHealth` writes, from the same counts, in the reader's words.
  const highRiskNeedsReview = health.byRisk.high.needsReview + health.byRisk.critical.needsReview;
  const healthExplanation =
    health.byRisk.critical.needsReview > 0
      ? t("review.health.highRiskCritical", { count: highRiskNeedsReview, critical: health.byRisk.critical.needsReview })
      : t("review.health.highRisk", { count: highRiskNeedsReview });

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise flex flex-wrap items-end justify-between gap-3">
          <div className="hidden lg:block">
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("nav.item.certification")}</h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">{t("review.lede")}</p>
          </div>
          {canReview ? <AddBeliefButton householdId={householdId} labels={controlLabels} /> : null}
        </header>

        <Card className="flex items-center gap-5 p-5">
          <ProgressRing value={understood.understanding} label={t("review.ringLabel")} />
          <div className="min-w-0">
            <p className="text-base font-semibold">
              {understood.understanding >= 80 ? t("review.understands.well") : understood.understanding >= 40 ? t("review.understands.partly") : t("review.understands.little")}
            </p>
            <p className="text-sm text-[var(--wh-foreground-muted)]">{t("review.confirmedCount", { confirmed: understood.confirmed, count: understoodTotal })}</p>
            {health.highRiskGapExists ? (
              <p className="mt-1 text-sm font-medium text-[var(--wh-attention)]">{healthExplanation}</p>
            ) : null}
          </div>
        </Card>

        <MetricGrid
          metrics={[
            { label: t("review.metric.confirmed"), value: summary.confirmed, icon: CircleCheck, tone: "handled", href: "/certification?tab=confirmed" },
            { label: t("review.metric.learned"), value: summary.learned, icon: Sparkles, tone: "ai", href: "/certification?tab=learned" },
            { label: t("review.metric.needReview"), value: summary.needsReview, icon: TriangleAlert, tone: "attention", href: "/certification?tab=review" },
          ]}
        />

        <SegmentedControl
          label={t("review.view")}
          active={active}
          segments={[
            { key: "review", label: t("review.tab.review"), href: "/certification?tab=review", count: summary.needsReview },
            { key: "learned", label: t("review.tab.learned"), href: "/certification?tab=learned" },
            { key: "confirmed", label: t("review.tab.confirmed"), href: "/certification?tab=confirmed" },
            { key: "history", label: t("review.tab.history"), href: "/certification?tab=history" },
          ]}
        />

        {active === "history" ? (
          // Who decided what, and when (story 05-007) — the same append-only
          // trail reviewCertificationAction already writes, read back rather
          // than a second record of the same decision.
          history.length === 0 ? (
            <EmptyState
              icon={History}
              tone="ai"
              title={t("review.history.emptyTitle")}
              description={t("review.history.emptyLede")}
            />
          ) : (
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {history.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 px-2 py-2.5">
                    <IconTile icon={DECISION_ICON[entry.decision]} tone={DECISION_TONE[entry.decision]} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {entry.reviewerName} · {t(`review.decision.${entry.decision}`)}
                      </p>
                      <p className="text-xs text-[var(--wh-foreground-muted)]">
                        {entry.previousClaim ? (
                          <>
                            &ldquo;{entry.previousClaim}&rdquo; → &ldquo;{entry.claim}&rdquo;
                          </>
                        ) : (
                          <>&ldquo;{entry.claim}&rdquo;</>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-right text-xs text-[var(--wh-foreground-subtle)]">
                      {formatDate(timezone, entry.reviewedAt)}
                      <br />
                      {formatTime(timezone, entry.reviewedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )
        ) : (
          <>
            {sleep ? <SleepSection view={sleep} t={t} householdId={householdId} when={(at) => `${formatDate(timezone, at)} · ${formatTime(timezone, at)}`} /> : null}
            <SectionHeader title={t("review.knows")} />
            {shown.length === 0 ? (
              <EmptyState
                icon={BadgeCheck}
                tone="ai"
                title={live.length === 0 ? t("review.empty.nothingTitle") : active === "review" ? t("review.empty.caughtUpTitle") : t("review.empty.hereTitle")}
                description={live.length === 0 ? t("review.empty.nothingLede") : active === "review" ? t("review.empty.caughtUpLede") : t("review.empty.hereLede")}
                action={live.length === 0 && canReview ? <AddBeliefButton householdId={householdId} labels={controlLabels} /> : null}
              />
            ) : (
              <Card className="p-2">
                <BulkReviewList
                  householdId={householdId}
                  labels={bulkLabels}
                  selectable={canReview}
                  rows={shown.map((item) => {
                    const alert = alerts.find((a) => a.itemId === item.id);
                    const sourceLabel = `${t(`review.source.${item.sourceType}`)}${item.sourceDetail ? ` (${item.sourceDetail})` : ""}`;
                    return {
                      id: item.id,
                      claim: item.claim,
                      meta: `${sourceLabel} · ${reviewCategoryWords(item.category, t)}`,
                      node: (
                        <CertificationItem
                          claim={item.claim}
                          status={alert ? "needs_review" : item.status}
                          badgeLabel={alert ? alertActionWords(alert.action, t) : undefined}
                          sourceLabel={sourceLabel}
                          category={reviewCategoryWords(item.category, t)}
                          risk={item.riskLevel}
                          lastReviewed={item.lastReviewedAt ? `${formatDate(timezone, item.lastReviewedAt, "long")} · ${formatTime(timezone, item.lastReviewedAt)}` : null}
                          learnedAt={learnedAt.get(item.id) ? formatDate(timezone, learnedAt.get(item.id)!, "long") : null}
                          confidence={confidenceFor(item.sourceType, item.status, t)}
                          reason={alert ? reviewReason(item, now, t) : undefined}
                          controls={canReview ? <CertificationControls householdId={householdId} itemId={item.id} labels={controlLabels} /> : undefined}
                          labels={itemLabels}
                        />
                      ),
                    };
                  })}
                />
              </Card>
            )}

            <section>
              <SectionHeader title={t("review.understanding")} />
              <Card className="p-2">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {CERTIFICATION_CATEGORIES.map((category) => {
                    const counts = understood.byCategory[category];
                    return (
                      <li key={category} className="flex items-center gap-3 px-2 py-2.5 text-sm">
                        <CircleCheck aria-hidden className={`size-4 ${counts.total > 0 && counts.confirmed === counts.total ? "text-[var(--wh-handled)]" : "text-[var(--wh-foreground-subtle)]"}`} />
                        <span className="flex-1">{reviewCategoryWords(category, t)}</span>
                        <span className="text-xs text-[var(--wh-foreground-muted)] tabular-nums">{counts.confirmed}/{counts.total}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          </>
        )}

        <QuoteCard>{t("review.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}

/** The night's line, what it changed in the last month (not undone), and its links — through the Admin's own session (RLS: Admins read these). */
async function readSleepView(supabase: Awaited<ReturnType<typeof requireSession>>["supabase"], householdId: string): Promise<SleepView | null> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [runs, changes, links, linkCount] = await Promise.all([
    supabase.from("homebrain_runs").select("finished_at, counts").eq("household_id", householdId).eq("outcome", "done").order("local_date", { ascending: false }).limit(1),
    supabase
      .from("homebrain_consolidations")
      .select("id, kind, statement, memory_ids, detail, created_at")
      .eq("household_id", householdId)
      .is("undone_at", null)
      .in("kind", ["merged", "split", "expired", "reattributed", "rested"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase.from("homebrain_links").select("reason").eq("household_id", householdId).order("created_at", { ascending: false }).limit(5),
    supabase.from("homebrain_links").select("id", { count: "exact", head: true }).eq("household_id", householdId),
  ]);
  // No tables yet (the migration has not reached this database): nothing to show.
  if (runs.error && changes.error) return null;
  const last = ((runs.data ?? []) as { finished_at: string | null; counts: Record<string, number> }[])[0];
  return {
    lastSlept: last?.finished_at ? new Date(last.finished_at) : null,
    counts: last?.counts ?? {},
    changes: ((changes.data ?? []) as { id: string; kind: SleepChange["kind"]; statement: string; memory_ids: string[]; detail: { reason?: string } | null; created_at: string }[]).map((row) => ({
      id: row.id,
      kind: row.kind,
      statement: row.statement,
      count: row.memory_ids.length,
      reason: row.detail?.reason ?? null,
      at: new Date(row.created_at),
    })),
    links: { total: linkCount.count ?? 0, examples: ((links.data ?? []) as { reason: string }[]).map((row) => row.reason) },
  };
}
