import { BookOpen, CircleCheck, ListChecks, MessageSquareText, Plug, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";

import { assessSetup } from "@wonderhome/core/household/setup";
import { UNDERSTOOD_SHAPES } from "@wonderhome/core/household/configuration-intent";
import { listPlaybookOutcomes } from "@wonderhome/core/household/configuration-repository";
import { loadSetupFacts } from "@wonderhome/core/household/setup-repository";
import { listMembers } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { ProgressRing } from "@wonderhome/core/ui/progress-ring";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";

import {
  applyConfigurationAction,
  previewConfigurationAction,
  savePlaybookAction,
  savePolicyAction,
  saveResponsibilityAction,
} from "../../(auth)/configuration-actions";
import { PlaybookForm, PolicyForm, ResponsibilityForm, TeachForm } from "../../_components/config-forms";
import { configFormLabels, starterOutcomes } from "../../_lib/manage-labels";
import { requireSession } from "../../_lib/session";
import { localizeSetup } from "../../_lib/setup-labels";

export const metadata = { title: "Set up your household" };
export const dynamic = "force-dynamic";

/**
 * The setup wizard (story 02-001).
 *
 * It is resumable because there is nothing to resume: each step saves
 * immediately into the household's real configuration, and the next visit
 * reads that configuration to decide what is already done. No draft is kept
 * anywhere, which is what the criterion means by "not UI-only state" — and
 * it also means the wizard and the Home screen's progress card can never
 * disagree, because both read the same facts.
 *
 * Steps that do not apply to a household are absent rather than skipped.
 */
const STEPS = [
  { key: "family", icon: Users },
  { key: "responsibilities", icon: ListChecks },
  { key: "playbook", icon: BookOpen },
  { key: "policies", icon: ShieldCheck },
  { key: "connections", icon: Plug },
  { key: "teach", icon: MessageSquareText },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

export default async function SetupWizardPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const [{ step: requested }, session] = await Promise.all([
    searchParams,
    requireSession("/household/setup"),
  ]);
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const shell = {
    active: "more" as const,
    viewer,
    secondary,
    pathname: "/household/setup",
    back: { href: "/household", label: t("manage.backToManage") },
    title: t("manage.section.setup"),
  };

  if (!view.permissions.includes("household.manage")) {
    return (
      <AppShell {...shell}>
        <EmptyState
          icon={ShieldCheck}
          title={t("manage.forAdmins")}
          description={t("manage.setup.adminOnlyLede")}
        />
      </AppShell>
    );
  }

  const [facts, members, playbook] = await Promise.all([
    loadSetupFacts(supabase, membership.household).catch(() => null),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    listPlaybookOutcomes(supabase, householdId).catch(() => []),
  ]);

  // The household's own outcomes come first; the starters fill in what it has
  // not described yet, so an owner can be named before the playbook is written.
  const defined = playbook.map((outcome) => ({ key: outcome.key, label: outcome.name }));
  const assignable = [
    ...defined,
    ...starterOutcomes(t).filter((starter) => !playbook.some((outcome) => outcome.key === starter.key)),
  ];
  const formLabels = configFormLabels(t);

  const setup = facts ? localizeSetup(assessSetup(facts), t) : null;
  const active: StepKey = STEPS.some((step) => step.key === requested)
    ? (requested as StepKey)
    : "family";

  const done = (key: StepKey): boolean => {
    if (!setup) return false;
    switch (key) {
      case "family":
        return setup.steps.find((s) => s.key === "people")?.done ?? false;
      case "playbook":
        return setup.steps.find((s) => s.key === "playbook")?.done ?? false;
      case "responsibilities":
        return setup.steps.find((s) => s.key === "responsibilities")?.done ?? false;
      case "policies":
        return setup.steps.find((s) => s.key === "policies")?.done ?? false;
      case "connections":
      case "teach":
        return false;
    }
  };

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise flex items-start gap-4">
          {setup ? <ProgressRing value={setup.percent} label={t("homeScreen.setup.title")} size={72} stroke={7} /> : null}
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("manage.section.setup")}</h1>
            <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("manage.setup.lede")}</p>
          </div>
        </header>

        <SegmentedControl
          label={t("manage.setup.stepLabel")}
          active={active}
          segments={STEPS.map((step) => ({
            key: step.key,
            label: t(`manage.setup.tab.${step.key}`),
            href: `/household/setup?step=${step.key}`,
          }))}
        />

        {/* Each panel says what the step is for before asking for anything. */}
        {active === "family" ? (
          <Step
            icon={Users}
            title={t("manage.setup.family.title")}
            purpose={t("manage.setup.family.purpose")}
            done={done("family")}
            doneLabel={t("manage.setup.done")}
          >
            <div className="space-y-3">
              <p className="text-sm text-[var(--wh-foreground-muted)]">
                {t("manage.setup.people", { count: members.length })}
              </p>
              <div className="flex flex-wrap gap-2">
                {members.map((member) => (
                  <Badge key={member.id}>{member.displayName}</Badge>
                ))}
              </div>
              <PillLink href="/household/members" tone="primary">{t("family.inviteSomeone")}</PillLink>
            </div>
          </Step>
        ) : null}

        {active === "playbook" ? (
          <Step
            icon={BookOpen}
            title={t("manage.setup.playbook.title")}
            purpose={t("manage.setup.playbook.purpose")}
            done={done("playbook")}
            doneLabel={t("manage.setup.done")}
          >
            <PlaybookForm action={savePlaybookAction} householdId={householdId} existing={defined} labels={formLabels} />
          </Step>
        ) : null}

        {active === "responsibilities" ? (
          <Step
            icon={ListChecks}
            title={t("manage.setup.responsibilities.title")}
            purpose={t("manage.setup.responsibilities.purpose")}
            done={done("responsibilities")}
            doneLabel={t("manage.setup.done")}
          >
            {members.length === 0 ? (
              <EmptyState
                icon={Users}
                title={t("manage.setup.inviteFirst")}
                description={t("manage.setup.inviteFirstLede")}
                action={<PillLink href="/household/members">{t("family.inviteSomeone")}</PillLink>}
              />
            ) : (
              <ResponsibilityForm
                action={saveResponsibilityAction}
                householdId={householdId}
                members={members.map((member) => ({ id: member.id, displayName: member.displayName }))}
                outcomes={assignable}
                labels={formLabels}
              />
            )}
          </Step>
        ) : null}

        {active === "policies" ? (
          <Step
            icon={ShieldCheck}
            title={t("manage.setup.policies.title")}
            purpose={t("manage.setup.policies.purpose")}
            done={done("policies")}
            doneLabel={t("manage.setup.done")}
          >
            <PolicyForm action={savePolicyAction} householdId={householdId} labels={formLabels} />
          </Step>
        ) : null}

        {active === "connections" ? (
          <Step
            icon={Plug}
            title={t("manage.setup.connections.title")}
            purpose={t("manage.setup.connections.purpose")}
            done={false}
            doneLabel={t("manage.setup.done")}
          >
            <div className="space-y-3">
              <p className="text-sm text-[var(--wh-foreground-muted)]">{t("manage.setup.connections.none")}</p>
              <PillLink href="/household/integrations" tone="quiet">{t("manage.setup.connections.see")}</PillLink>
            </div>
          </Step>
        ) : null}

        {active === "teach" ? (
          <Step
            icon={MessageSquareText}
            title={t("manage.setup.teach.title")}
            purpose={t("manage.setup.teach.purpose")}
            done={false}
            doneLabel={t("manage.setup.done")}
          >
            <TeachForm
              preview={previewConfigurationAction}
              apply={applyConfigurationAction}
              householdId={householdId}
              shapes={[...UNDERSTOOD_SHAPES]}
              labels={formLabels}
            />
          </Step>
        ) : null}

        {setup && setup.next.length > 0 ? (
          <section>
            <SectionHeader title={t("manage.setup.worthNext")} />
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {setup.next.map((next) => (
                  <li key={next.key}>
                    <Link
                      href={next.href}
                      className="flex min-h-14 items-center gap-3 rounded-[var(--wh-radius-sm)] px-2 py-2 transition-colors hover:bg-[var(--wh-surface-muted)]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{next.title}</span>
                        <span className="block text-xs text-[var(--wh-foreground-muted)]">{next.why}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ) : null}

        <QuoteCard>{t("manage.setup.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}

function Step({
  icon,
  title,
  purpose,
  done,
  doneLabel,
  children,
}: {
  icon: typeof Users;
  title: string;
  purpose: string;
  done: boolean;
  doneLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <IconTile icon={icon} tone="primary" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            {done ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-[var(--wh-handled)]">
                <CircleCheck aria-hidden className="size-3.5" /> {doneLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-[var(--wh-foreground-muted)]">{purpose}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}
