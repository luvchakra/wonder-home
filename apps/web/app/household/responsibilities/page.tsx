import { ListChecks, Sparkles } from "lucide-react";
import Link from "next/link";

import { listConfigurationConflicts, listPlaybookOutcomes } from "@wonderhome/core/household/configuration-repository";
import { isHouseholdAdmin, listMembers } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";

import { AddResponsibilityButton, ResponsibilityRow } from "../../_components/responsibility-controls";
import { iconForOutcome } from "../../_lib/outcome-icons";
import { STARTER_OUTCOMES } from "../../_lib/starter-outcomes";
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
 * Responsibilities (requirements §14): outcomes, not micro-task sequences.
 * Each has an owner, a backup, a cadence and an AI involvement level. An
 * unowned outcome is shown as a gap — the most useful thing the matrix can say.
 */
export default async function ResponsibilitiesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, session] = await Promise.all([searchParams, requireSession("/household/responsibilities")]);
  const { supabase, membership, view, viewer, secondary } = session;
  const householdId = membership.household.id;
  const active = tab === "mine" || tab === "family" ? tab : "all";
  const shell = { active: "more" as const, viewer, secondary, pathname: "/household/responsibilities", back: { href: "/more", label: "Back" }, title: "Responsibilities" };

  if (view.tone === "child") {
    return (
      <AppShell {...shell}>
        <EmptyState icon={ListChecks} title="Not available to you" description="Responsibilities are set by the adults in the household." />
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
        <EmptyState icon={ListChecks} title="Responsibilities could not be loaded" description="Nothing has changed. Try again in a moment." />
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
    return renderResponsibilities({ shell, membership, active, responsibilityRows, members, conflicts, playbook, admin: isHouseholdAdmin(membership), householdId });
  } catch (thrown) {
    console.error("Responsibilities page failed to render", thrown);
    return (
      <AppShell {...shell}>
        <EmptyState icon={ListChecks} title="Responsibilities could not be loaded" description="Nothing has changed. Try again in a moment." />
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
}: {
  shell: { active: "more"; viewer: Session["viewer"]; secondary: Session["secondary"]; pathname: string; back: { href: string; label: string }; title: string };
  membership: Session["membership"];
  active: "all" | "mine" | "family";
  responsibilityRows: { data: unknown; failed: boolean };
  members: Awaited<ReturnType<typeof listMembers>>;
  conflicts: Awaited<ReturnType<typeof listConfigurationConflicts>>;
  playbook: Awaited<ReturnType<typeof listPlaybookOutcomes>>;
  admin: boolean;
  householdId: string;
}) {
  const rows = (responsibilityRows.data as Row[] | null) ?? [];
  const nameOf = (id: string | null) => members.find((member) => member.id === id)?.displayName ?? null;
  const shown = rows.filter((row) => (active === "mine" ? row.primary_member_id === membership.memberId || row.backup_member_id === membership.memberId : active === "family" ? row.primary_member_id !== membership.memberId : true));
  const gaps = rows.filter((row) => !row.primary_member_id);

  // Outcomes the household has already described, plus starters it has not —
  // minus whatever already has a responsibility, since those are edited from
  // their own row instead (story: "add" makes new entries, not duplicates).
  const alreadyAssigned = new Set(rows.map((row) => row.outcome_key));
  const addable = [
    ...playbook.map((outcome) => ({ key: outcome.key, label: outcome.name })),
    ...STARTER_OUTCOMES.filter((starter) => !playbook.some((outcome) => outcome.key === starter.key)),
  ].filter((outcome) => !alreadyAssigned.has(outcome.key));
  const memberOptions = members.map((member) => ({ id: member.id, displayName: member.displayName }));

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise flex flex-wrap items-end justify-between gap-3">
          <div className="hidden lg:block">
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Responsibilities</h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">Clear roles, less chaos. Outcomes, not checklists.</p>
          </div>
          {admin ? (
            <div className="flex flex-wrap gap-2">
              {addable.length > 0 ? (
                <AddResponsibilityButton householdId={householdId} members={memberOptions} outcomes={addable} />
              ) : null}
              <PillLink href="/ai?q=Priya%20handles%20the%20school%20run%20from%20now%20on." tone="primary">
                <Sparkles aria-hidden className="size-3.5" /> Assign with AI
              </PillLink>
            </div>
          ) : null}
        </header>

        <SegmentedControl
          label="Whose responsibilities"
          active={active}
          segments={[
            { key: "all", label: "All", href: "/household/responsibilities", count: rows.length },
            { key: "mine", label: "Mine", href: "/household/responsibilities?tab=mine", count: rows.filter((r) => r.primary_member_id === membership.memberId).length },
            { key: "family", label: "Family", href: "/household/responsibilities?tab=family" },
          ]}
        />

        {conflicts.length > 0 && active === "all" ? (
          <Card className="space-y-2 bg-[var(--wh-attention-soft)]/60 p-4">
            <div className="flex items-center gap-3">
              <Badge tone="attention">{conflicts.length} to fix</Badge>
              <p className="text-sm text-[var(--wh-foreground-muted)]">
                The household has changed since these were set. Each needs one decision.
              </p>
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
            <Badge tone="attention">{gaps.length} unowned</Badge>
            <p className="text-sm text-[var(--wh-foreground-muted)]">Some outcomes have nobody responsible. Assign them so WonderHome knows who to ask.</p>
          </Card>
        ) : null}

        {shown.length === 0 ? (
          <EmptyState icon={ListChecks} title={rows.length === 0 ? "No responsibilities defined yet" : "Nothing here"} description={rows.length === 0 ? "Start from the playbook: each outcome gets an owner, a backup and how much WonderHome may do on its own." : "Nothing matches this view."} action={admin && rows.length === 0 ? <PillLink href="/household">Set up the playbook</PillLink> : null} />
        ) : (
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {shown.map((row) => {
                const item = Array.isArray(row.playbook_items) ? row.playbook_items[0] : row.playbook_items;
                const presentation = iconForOutcome(row.outcome_key);
                const title = item?.name ?? row.outcome_key.replace(/[._]/g, " ");
                return (
                  <ResponsibilityRow
                    key={row.id}
                    card={{
                      icon: presentation.icon,
                      tone: presentation.tone,
                      title,
                      owner: nameOf(row.primary_member_id) ?? "Nobody yet",
                      backup: nameOf(row.backup_member_id),
                      frequency: cadenceLabel(item?.cadence),
                      aiMode: row.ai_mode,
                      action: !row.primary_member_id ? <Badge tone="attention">Unowned</Badge> : undefined,
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
        )}

        <section>
          <SectionHeader title="How WonderHome helps" />
          <Card className="space-y-2 text-sm text-[var(--wh-foreground-muted)]">
            <p><span className="font-semibold text-[var(--wh-foreground)]">Watches</span> — notices and tells you.</p>
            <p><span className="font-semibold text-[var(--wh-foreground)]">Prepares</span> — drafts the order or the plan and waits.</p>
            <p><span className="font-semibold text-[var(--wh-foreground)]">Asks first</span> — does the work once you say yes.</p>
            <p><span className="font-semibold text-[var(--wh-foreground)]">Handles it</span> — acts, and tells you what it did. Payments and access changes always ask.</p>
          </Card>
        </section>

        <QuoteCard>Clear roles. A smoother home.</QuoteCard>
      </div>
    </AppShell>
  );
}

function cadenceLabel(cadence: Record<string, unknown> | undefined): string | undefined {
  if (!cadence) return undefined;
  const unit = cadence.unit ?? cadence.frequency ?? cadence.every;
  return typeof unit === "string" ? unit : undefined;
}
