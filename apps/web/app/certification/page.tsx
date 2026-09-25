import { BadgeCheck, CircleCheck, Clock, History, Pencil, Sparkles, TriangleAlert, XCircle } from "lucide-react";

import {
  alertsFor,
  CERTIFICATION_CATEGORIES,
  certificationHealth,
  summarize,
  type CertificationAlert,
  type CertificationHistoryEntry,
  type CertificationItem as Item,
  type ReviewDecision,
} from "@wonderhome/core/household/certification";
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

import { AddBeliefButton, CertificationControls } from "../_components/certification-controls";
import { certificationControlLabels, certificationItemLabels, reviewCategoryWords, reviewReason } from "../_lib/review-labels";
import { formatDate, formatTime, requireSession } from "../_lib/session";

export const metadata = { title: "HomeBrain Review" };
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

  const [{ data }, { data: historyRows }] = await Promise.all([
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
  const health = certificationHealth(items, now);
  const alerts = alertsFor(items, now, 50);
  const alertIds = new Set(alerts.map((alert) => alert.itemId));
  const live = items.filter((item) => item.status !== "removed" && item.status !== "corrected");
  const shown = active === "review" ? live.filter((item) => alertIds.has(item.id)) : active === "confirmed" ? live.filter((item) => item.status === "confirmed" && !alertIds.has(item.id)) : live.filter((item) => item.status === "learned" && !alertIds.has(item.id));
  const canReview = view.tone !== "child";
  const itemLabels = certificationItemLabels(t);
  const controlLabels = certificationControlLabels(t);
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
          <ProgressRing value={summary.understanding} label={t("review.ringLabel")} />
          <div className="min-w-0">
            <p className="text-base font-semibold">
              {summary.understanding >= 80 ? t("review.understands.well") : summary.understanding >= 40 ? t("review.understands.partly") : t("review.understands.little")}
            </p>
            <p className="text-sm text-[var(--wh-foreground-muted)]">{t("review.confirmedCount", { confirmed: summary.confirmed, count: live.length })}</p>
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
                <ul className="divide-y divide-[var(--wh-border)]">
                  {shown.map((item) => {
                    const alert = alerts.find((a) => a.itemId === item.id);
                    const sourceLabel = `${t(`review.source.${item.sourceType}`)}${item.sourceDetail ? ` (${item.sourceDetail})` : ""}`;
                    return (
                      <CertificationItem
                        key={item.id}
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
                    );
                  })}
                </ul>
              </Card>
            )}

            <section>
              <SectionHeader title={t("review.understanding")} />
              <Card className="p-2">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {CERTIFICATION_CATEGORIES.map((category) => {
                    const counts = summary.byCategory[category];
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
