import { ListChecks, Scale } from "lucide-react";
import Link from "next/link";

import { listConfigurationConflicts, listPlaybookOutcomes } from "@wonderhome/core/household/configuration-repository";
import { findImbalances, memberLoads, suggestRebalance } from "@wonderhome/core/household/workload";
import type { Translate } from "@wonderhome/core/i18n/translate";
import { isHouseholdAdmin, listMembers } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ActionRow } from "@wonderhome/core/ui/action-row";
import { Card } from "@wonderhome/core/ui/card";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";

import { AcceptRebalanceButton, AddResponsibilityButton, ResponsibilityRow } from "../../_components/responsibility-controls";
import { cadenceLabel } from "../../_lib/cadence";
import { perWeekWords, responsibilityLabels, starterOutcomes } from "../../_lib/manage-labels";
import { requireSession, type Session } from "../../_lib/session";

export const metadata = { title: "Responsibilities" };
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  outcome_key: string;
  primary_member_id: string | null;
  backup_member_id: string | null;
  ai_mode: "observe" | "prepare" | "approve" | "execute";
  priority: number;
  playbook_items: { name: string; outcome_definition: string; cadence: Record<string, unknown> } | { name: string; outcome_definition: string; cadence: Record<string, unknown> }[] | null;
};

/**
 * Groups rows by who owns them, in household-member order, with a final
 * "Unowned" group for outcomes nobody owns yet — the group the household
 * most needs to notice, so it goes last rather than getting lost among
 * named owners (design rule 17: the thing to decide first reads first, and
 * an unassigned outcome is a decision, not a record of one already made).
 */
function groupByOwner(
  rows: Row[],
  members: { id: string; displayName: string }[],
  nobodyYet: string,
): { ownerId: string | null; ownerName: string; rows: Row[] }[] {
  const byOwner = new Map<string | null, Row[]>();
  for (const row of rows) {
    const key = row.primary_member_id;
    const existing = byOwner.get(key);
    if (existing) existing.push(row);
    else byOwner.set(key, [row]);
  }

  const groups: { ownerId: string | null; ownerName: string; rows: Row[] }[] = members
    .map((member) => ({ ownerId: member.id, ownerName: member.displayName, rows: byOwner.get(member.id) ?? [] }))
    .filter((group) => group.rows.length > 0);

  const unowned = byOwner.get(null) ?? [];
  if (unowned.length > 0) groups.push({ ownerId: null, ownerName: nobodyYet, rows: unowned });

  return groups;
}

/**
 * Responsibilities (requirements §14): outcomes, not micro-task sequences.
 * Each has an owner, a backup, a cadence and an AI involvement level. An
 * unowned outcome is shown as a gap — the most useful thing the matrix can say.
 */
export default async function ResponsibilitiesPage({ searchParams }: { searchParams: Promise<{ tab?: string; outcome?: string }> }) {
  const [{ tab, outcome }, session] = await Promise.all([searchParams, requireSession("/household/responsibilities")]);
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  // A responsibility opened from elsewhere (Family status) always lands on
  // "all", whatever tab param it might otherwise carry — the outcome could
  // belong to any member, not just this viewer.
  const active = outcome ? "all" : tab === "mine" || tab === "family" ? tab : "all";
  const shell = { active: "more" as const, viewer, secondary, pathname: "/household/responsibilities", back: { href: "/more", label: t("common.back") }, title: t("nav.item.responsibilities") };

  if (view.tone === "child") {
    return (
      <AppShell {...shell}>
        <EmptyState icon={ListChecks} title={t("manage.resp.notForYou")} description={t("manage.resp.notForYouLede")} />
      </AppShell>
    );
  }

  const [members, responsibilityRows, conflicts, playbook] = await Promise.all([
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    (async () => {
      try {
        const { data, error } = await supabase
          .from("responsibilities")
          .select("id, outcome_key, primary_member_id, backup_member_id, ai_mode, priority, playbook_items(name, outcome_definition, cadence)")
          .eq("household_id", householdId)
          .order("priority");
        return { data, failed: Boolean(error) };
      } catch {
        return { data: null, failed: true };
      }
    })(),
    listConfigurationConflicts(supabase, householdId).catch(() => []),
    listPlaybookOutcomes(supabase, householdId).catch(() => []),
  ]);

  if (responsibilityRows.failed) {
    return (
      <AppShell {...shell}>
        <EmptyState icon={ListChecks} title={t("manage.resp.loadFailed")} description={t("manage.nothingChangedTryAgain")} />
      </AppShell>
    );
  }

  // Everything from here on is pure computation and JSX over data that has
  // already been fetched (no further await below) — so a defensive try/catch
  // is cheap insurance: a bug in a join's shape or in one card's rendering
  // degrades to the same honest "could not be loaded" message the query
  // failure above already gives, instead of an unhandled exception reaching
  // the platform's own bare error page (requirements §49: error is always
  // one of the three states a screen shows, never a raw crash).
  try {
    return renderResponsibilities({ shell, membership, active, responsibilityRows, members, conflicts, playbook, admin: isHouseholdAdmin(membership), householdId, openOutcomeKey: outcome ?? null, t });
  } catch (thrown) {
    console.error("Responsibilities page failed to render", thrown);
    return (
      <AppShell {...shell}>
        <EmptyState icon={ListChecks} title={t("manage.resp.loadFailed")} description={t("manage.nothingChangedTryAgain")} />
      </AppShell>
    );
  }
}

function renderResponsibilities({
  shell,
  membership,
  active,
  responsibilityRows,
  members,
  conflicts,
  playbook,
  admin,
  householdId,
  openOutcomeKey,
  t,
}: {
  t: Translate;
  shell: { active: "more"; viewer: Session["viewer"]; secondary: Session["secondary"]; pathname: string; back: { href: string; label: string }; title: string };
  membership: Session["membership"];
  active: "all" | "mine" | "family";
  responsibilityRows: { data: unknown; failed: boolean };
  members: Awaited<ReturnType<typeof listMembers>>;
  conflicts: Awaited<ReturnType<typeof listConfigurationConflicts>>;
  playbook: Awaited<ReturnType<typeof listPlaybookOutcomes>>;
  admin: boolean;
  householdId: string;
  /** Set when a link elsewhere (Family status) pointed at one specific outcome — opens its detail immediately, rather than leaving the visitor to find it in the list themselves. */
  openOutcomeKey: string | null;
}) {
  const rows = (responsibilityRows.data as Row[] | null) ?? [];
  const nameOf = (id: string | null) => members.find((member) => member.id === id)?.displayName ?? null;
  const isMine = (row: Row) => row.primary_member_id === membership.memberId || row.backup_member_id === membership.memberId;
  const shown = rows.filter((row) => (active === "mine" ? isMine(row) : active === "family" ? row.primary_member_id !== membership.memberId : true));
  const gaps = rows.filter((row) => !row.primary_member_id);

  // Outcomes the household has already described, plus starters it has not —
  // minus whatever already has a responsibility, since those are edited from
  // their own row instead (story: "add" makes new entries, not duplicates).
  const alreadyAssigned = new Set(rows.map((row) => row.outcome_key));
  const addable = [
    ...playbook.map((outcome) => ({ key: outcome.key, label: outcome.name })),
    ...starterOutcomes(t).filter((starter) => !playbook.some((outcome) => outcome.key === starter.key)),
  ].filter((outcome) => !alreadyAssigned.has(outcome.key));
  const memberOptions = members.map((member) => ({ id: member.id, displayName: member.displayName }));

  // Who carries what (story 03-008): times a week, counted from each
  // outcome's own rhythm. Only an imbalance worth a word is ever shown.
  const workloadMembers = members
    .filter((member) => member.status === "active")
    .map((member) => ({ id: member.id, displayName: member.displayName, memberType: member.memberType }));
  const workloadOutcomes = rows.map((row) => {
    const item = Array.isArray(row.playbook_items) ? row.playbook_items[0] : row.playbook_items;
    return {
      outcomeKey: row.outcome_key,
      name: item?.name ?? row.outcome_key.replace(/[._]/g, " "),
      primaryMemberId: row.primary_member_id,
      backupMemberId: row.backup_member_id,
      cadenceUnit: cadenceLabel(item?.cadence) ?? null,
    };
  });
  const suggestions = suggestRebalance(workloadMembers, workloadOutcomes);
  const imbalances = findImbalances(memberLoads(workloadMembers, workloadOutcomes));
  const titleOf = (key: string) => workloadOutcomes.find((outcome) => outcome.outcomeKey === key)?.name ?? key;
  const labels = responsibilityLabels(t);
  const nobodyYet = t("manage.resp.nobodyYet");
  const theBackup = t("manage.resp.theBackup");
  const perWeek = (value: number) => perWeekWords(value, t);

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise flex flex-wrap items-end justify-between gap-3">
          <div className="hidden lg:block">
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("nav.item.responsibilities")}</h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">{t("manage.resp.lede")}</p>
          </div>
          {admin ? (
            <div className="flex flex-wrap gap-2">
              {addable.length > 0 ? (
                <AddResponsibilityButton householdId={householdId} members={memberOptions} outcomes={addable} labels={labels} />
              ) : null}
            </div>
          ) : null}
        </header>

        <SegmentedControl
          label={t("manage.resp.whose")}
          active={active}
          segments={[
            { key: "all", label: t("manage.resp.tab.all"), href: "/household/responsibilities", count: rows.length },
            { key: "mine", label: t("manage.resp.tab.mine"), href: "/household/responsibilities?tab=mine", count: rows.filter(isMine).length },
            { key: "family", label: t("manage.resp.tab.family"), href: "/household/responsibilities?tab=family" },
          ]}
        />

        {conflicts.length > 0 && active === "all" ? (
          <Card className="space-y-2 bg-[var(--wh-attention-soft)]/60 p-4">
            <div className="flex items-center gap-3">
              <Badge tone="attention">{t("manage.resp.toFix", { count: conflicts.length })}</Badge>
              <p className="text-sm text-[var(--wh-foreground-muted)]">{t("manage.resp.conflictsLede")}</p>
            </div>
            <ul className="divide-y divide-[var(--wh-border-strong)]/40">
              {conflicts.map((conflict) => (
                <li key={conflict.id}>
                  {admin ? (
                    <Link
                      href="/household/setup?step=responsibilities"
                      className="flex min-h-14 items-center gap-3 rounded-[var(--wh-radius-sm)] px-1 py-2 transition-colors hover:bg-[var(--wh-surface)]/60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{conflict.message}</span>
                        <span className="block text-xs text-[var(--wh-foreground-muted)]">{conflict.resolution}</span>
                      </span>
                    </Link>
                  ) : (
                    <div className="flex min-h-14 items-center gap-3 px-1 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{conflict.message}</span>
                        <span className="block text-xs text-[var(--wh-foreground-muted)]">{conflict.resolution}</span>
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {gaps.length > 0 && active === "all" ? (
          <Card className="flex items-center gap-3 bg-[var(--wh-attention-soft)]/60 p-4">
            <Badge tone="attention">{t("manage.resp.unownedCount", { count: gaps.length })}</Badge>
            <p className="text-sm text-[var(--wh-foreground-muted)]">{t("manage.resp.unownedLede")}</p>
          </Card>
        ) : null}

        {active === "all" && (imbalances.length > 0 || suggestions.length > 0) ? (
          <section>
            <SectionHeader title={t("manage.resp.shareLoad")} />
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {suggestions.map((suggestion) => (
                  <ActionRow
                    key={suggestion.outcomeKey}
                    icon={Scale}
                    tone="people"
                    title={t("manage.resp.couldTake", { outcome: titleOf(suggestion.outcomeKey), name: nameOf(suggestion.toMemberId) ?? theBackup })}
                    meta={t("manage.resp.swapReason", {
                      from: nameOf(suggestion.fromMemberId) ?? "",
                      to: nameOf(suggestion.toMemberId) ?? theBackup,
                      fromLoad: perWeek(suggestion.before.from),
                      toLoad: perWeek(suggestion.before.to),
                      fromAfter: perWeek(suggestion.after.from),
                      toAfter: perWeek(suggestion.after.to),
                    })}
                    action={
                      admin ? (
                        <AcceptRebalanceButton
                          householdId={householdId}
                          outcomeKey={suggestion.outcomeKey}
                          fromMemberId={suggestion.fromMemberId}
                          toMemberId={suggestion.toMemberId}
                          toName={nameOf(suggestion.toMemberId) ?? theBackup}
                          labels={labels}
                        />
                      ) : undefined
                    }
                  />
                ))}
                {imbalances
                  .filter((imbalance) => !suggestions.some((suggestion) => suggestion.fromMemberId === imbalance.heaviest.memberId))
                  .map((imbalance) => (
                    <ActionRow
                      key={imbalance.group}
                      icon={Scale}
                      tone="people"
                      title={t("manage.resp.carriesMost", { name: imbalance.heaviest.displayName })}
                      meta={capitalise(
                        t("manage.resp.imbalance", {
                          count: imbalance.heaviest.outcomes,
                          load: perWeek(imbalance.heaviest.perWeek),
                          lightLoad: perWeek(imbalance.lightest.perWeek),
                          lightName: imbalance.lightest.displayName,
                        }),
                      )}
                    />
                  ))}
              </ul>
            </Card>
          </section>
        ) : null}

        {shown.length === 0 ? (
          <EmptyState icon={ListChecks} title={rows.length === 0 ? t("manage.resp.emptyTitle") : t("manage.resp.nothingHere")} description={rows.length === 0 ? t("manage.resp.emptyLede") : t("manage.resp.nothingMatches")} action={admin && rows.length === 0 ? <PillLink href="/household">{t("manage.resp.setUpPlaybook")}</PillLink> : null} />
        ) : (
          <div className="space-y-4">
            {groupByOwner(shown, members, nobodyYet).map((group) => (
              <div key={group.ownerId ?? "unowned"} className="space-y-2">
                <p className="px-1 text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">
                  {group.ownerName} · {group.rows.length}
                </p>
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {group.rows.map((row) => {
                      const item = Array.isArray(row.playbook_items) ? row.playbook_items[0] : row.playbook_items;
                      const title = item?.name ?? row.outcome_key.replace(/[._]/g, " ");
                      return (
                        <ResponsibilityRow
                          key={row.id}
                          outcomeKey={row.outcome_key}
                          autoOpen={row.outcome_key === openOutcomeKey}
                          labels={labels}
                          card={{
                            title,
                            owner: nameOf(row.primary_member_id) ?? nobodyYet,
                            backup: nameOf(row.backup_member_id),
                            backupLabel: nameOf(row.backup_member_id) ? t("manage.resp.backupOf", { name: nameOf(row.backup_member_id)! }) : undefined,
                            frequency: cadenceLabel(item?.cadence),
                            aiMode: row.ai_mode,
                            aiModeLabel: t(`manage.aiModeShort.${row.ai_mode}`),
                            action: !row.primary_member_id ? <Badge tone="attention">{t("manage.resp.unowned")}</Badge> : undefined,
                          }}
                          definition={item?.outcome_definition}
                          editable={admin}
                          householdId={householdId}
                          members={memberOptions}
                          initial={{
                            outcomeKey: row.outcome_key,
                            outcomeLabel: title,
                            primaryMemberId: row.primary_member_id,
                            backupMemberId: row.backup_member_id,
                            aiMode: row.ai_mode,
                            priority: row.priority,
                          }}
                        />
                      );
                    })}
                  </ul>
                </Card>
              </div>
            ))}
          </div>
        )}

        <section>
          <SectionHeader title={t("manage.resp.howMuch")} />
          <Card className="space-y-3 text-sm text-[var(--wh-foreground-muted)]">
            <p>{t("manage.resp.howMuchLede")}</p>
            <div className="space-y-2.5">
              {(["observe", "prepare", "approve", "execute"] as const).map((mode) => (
                <p key={mode}>
                  <span className="font-semibold text-[var(--wh-foreground)]">{t(`manage.aiMode.${mode}`)}</span> — {t(`manage.resp.how.${mode}`)}
                  <span className="mt-0.5 block text-xs text-[var(--wh-foreground-subtle)]">{t(`manage.resp.example.${mode}`)}</span>
                </p>
              ))}
            </div>
          </Card>
        </section>

        <QuoteCard>{t("manage.resp.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}


function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
