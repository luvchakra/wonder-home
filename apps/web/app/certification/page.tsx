import { BadgeCheck, CircleCheck, Clock, History, Pencil, Sparkles, TriangleAlert, XCircle } from "lucide-react";

import {
  alertsFor,
  CERTIFICATION_CATEGORIES,
  DECISION_LABEL,
  summarize,
  type CertificationAlert,
  type CertificationHistoryEntry,
  type CertificationItem as Item,
  type ReviewDecision,
} from "@wonderhome/core/household/certification";
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
import { formatDate, formatTime, requireSession } from "../_lib/session";

export const metadata = { title: "Household Certification" };
export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<(typeof CERTIFICATION_CATEGORIES)[number], string> = {
  family_roles: "Family & roles",
  home_routines: "Home routines",
  education: "Education",
  finance: "Finance",
  lifestyle: "Lifestyle preferences",
  safety: "Safety",
};

/** The alert's one-word action, as the badge — so "Needs review" says which kind of look. */
const ALERT_ACTION_LABEL: Record<CertificationAlert["action"], string> = {
  fix: "Needs fixing",
  confirm: "Confirm this",
  review: "Needs review",
  set_up: "Set this up",
};

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

const SOURCE_LABEL: Record<Item["sourceType"], string> = {
  setup: "setup",
  conversation: "something you said",
  integration: "a connected account",
  observed: "a pattern WonderHome noticed",
};

/**
 * Household Certification (requirements §22): what WonderHome believes, where
 * each belief came from, and the controls to confirm, correct or remove it.
 * The percentage is confirmed over live — arithmetic, never a model's opinion
 * of itself.
 */
export default async function CertificationPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, session] = await Promise.all([searchParams, requireSession("/certification")]);
  const { supabase, membership, view, viewer, secondary } = session;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const active = tab === "confirmed" || tab === "learned" || tab === "review" || tab === "history" ? tab : "review";
  const shell = { active: "more" as const, viewer, secondary, pathname: "/certification", back: { href: "/more", label: "Back" }, title: "Certification" };

  const [{ data }, { data: historyRows }] = await Promise.all([
    supabase
      .from("certification_items")
      .select("id, category, claim, source_type, source_detail, status, risk_level, last_reviewed_at")
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
    const reviewerName = (Array.isArray(reviewer) ? reviewer[0]?.display_name : reviewer?.display_name) ?? "Someone";
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
  const alerts = alertsFor(items, now, 50);
  const alertIds = new Set(alerts.map((alert) => alert.itemId));
  const live = items.filter((item) => item.status !== "removed" && item.status !== "corrected");
  const shown = active === "review" ? live.filter((item) => alertIds.has(item.id)) : active === "confirmed" ? live.filter((item) => item.status === "confirmed" && !alertIds.has(item.id)) : live.filter((item) => item.status === "learned" && !alertIds.has(item.id));
  const canReview = view.tone !== "child";

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise flex flex-wrap items-end justify-between gap-3">
          <div className="hidden lg:block">
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Household Certification</h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">What WonderHome understands about your home — and where each belief came from.</p>
          </div>
          {canReview ? <AddBeliefButton householdId={householdId} /> : null}
        </header>

        <Card className="flex items-center gap-5 p-5">
          <ProgressRing value={summary.understanding} label="How much of the household WonderHome has confirmed" />
          <div className="min-w-0">
            <p className="text-base font-semibold">WonderHome understands your household {summary.understanding >= 80 ? "well" : summary.understanding >= 40 ? "partly" : "a little"}</p>
            <p className="text-sm text-[var(--wh-foreground-muted)]">{summary.confirmed} of {live.length} beliefs confirmed by the family. Nothing here is a guess about confidence — it is a count.</p>
          </div>
        </Card>

        <MetricGrid
          metrics={[
            { label: "Confirmed", value: summary.confirmed, icon: CircleCheck, tone: "handled", href: "/certification?tab=confirmed" },
            { label: "Learned", value: summary.learned, icon: Sparkles, tone: "ai", href: "/certification?tab=learned" },
            { label: "Need review", value: summary.needsReview, icon: TriangleAlert, tone: "attention", href: "/certification?tab=review" },
          ]}
        />

        <SegmentedControl
          label="Certification view"
          active={active}
          segments={[
            { key: "review", label: "Needs review", href: "/certification?tab=review", count: summary.needsReview },
            { key: "learned", label: "Learned", href: "/certification?tab=learned" },
            { key: "confirmed", label: "Confirmed", href: "/certification?tab=confirmed" },
            { key: "history", label: "History", href: "/certification?tab=history" },
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
              title="Nothing reviewed yet"
              description="Every confirm, correction or removal will show up here, with who did it and when."
            />
          ) : (
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {history.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 px-2 py-2.5">
                    <IconTile icon={DECISION_ICON[entry.decision]} tone={DECISION_TONE[entry.decision]} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {entry.reviewerName} · {DECISION_LABEL[entry.decision]}
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
            {shown.length === 0 ? (
              <EmptyState
                icon={BadgeCheck}
                tone="ai"
                title={live.length === 0 ? "WonderHome has nothing recorded yet" : active === "review" ? "Nothing needs your review" : "Nothing here yet"}
                description={live.length === 0 ? "As you set things up and talk to WonderHome, what it learns appears here for you to confirm or correct." : active === "review" ? "Every belief has been checked recently enough for how much it matters." : "Beliefs move here as they are learned and confirmed."}
                action={live.length === 0 && canReview ? <AddBeliefButton householdId={householdId} /> : null}
              />
            ) : (
              <Card className="p-2">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {shown.map((item) => {
                    const alert = alerts.find((a) => a.itemId === item.id);
                    return (
                      <CertificationItem
                        key={item.id}
                        claim={item.claim}
                        status={alert ? "needs_review" : item.status}
                        badgeLabel={alert ? ALERT_ACTION_LABEL[alert.action] : undefined}
                        source={`${SOURCE_LABEL[item.sourceType]}${item.sourceDetail ? ` (${item.sourceDetail})` : ""} · ${CATEGORY_LABEL[item.category]}${alert ? ` · ${alert.reason}` : ""}`}
                        risk={item.riskLevel}
                        controls={canReview ? <CertificationControls householdId={householdId} itemId={item.id} /> : undefined}
                      />
                    );
                  })}
                </ul>
              </Card>
            )}

            <section>
              <SectionHeader title="Household understanding" />
              <Card className="p-2">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {CERTIFICATION_CATEGORIES.map((category) => {
                    const counts = summary.byCategory[category];
                    return (
                      <li key={category} className="flex items-center gap-3 px-2 py-2.5 text-sm">
                        <CircleCheck aria-hidden className={`size-4 ${counts.total > 0 && counts.confirmed === counts.total ? "text-[var(--wh-handled)]" : "text-[var(--wh-foreground-subtle)]"}`} />
                        <span className="flex-1">{CATEGORY_LABEL[category]}</span>
                        <span className="text-xs text-[var(--wh-foreground-muted)] tabular-nums">{counts.confirmed}/{counts.total}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          </>
        )}

        <QuoteCard>Your home, understood — and corrected by you.</QuoteCard>
      </div>
    </AppShell>
  );
}
