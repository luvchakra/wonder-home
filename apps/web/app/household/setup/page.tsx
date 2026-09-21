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
import { STARTER_OUTCOMES } from "../../_lib/starter-outcomes";
import { requireSession } from "../../_lib/session";

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
  { key: "family", label: "Family", icon: Users },
  { key: "playbook", label: "Playbook", icon: BookOpen },
  { key: "responsibilities", label: "Who does what", icon: ListChecks },
  { key: "policies", label: "Policies", icon: ShieldCheck },
  { key: "connections", label: "Connections", icon: Plug },
  { key: "teach", label: "Just tell me", icon: MessageSquareText },
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
  const { supabase, membership, view, viewer, secondary } = session;
  const householdId = membership.household.id;
  const shell = {
    active: "more" as const,
    viewer,
    secondary,
    pathname: "/household/setup",
    back: { href: "/household", label: "Back to manage household" },
    title: "Set up your household",
  };

  if (!view.permissions.includes("household.manage")) {
    return (
      <AppShell {...shell}>
        <EmptyState
          icon={ShieldCheck}
          title="For Admins"
          description="Setting up how the household runs is theirs to do. Ask them if something needs changing."
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
    ...STARTER_OUTCOMES.filter((starter) => !playbook.some((outcome) => outcome.key === starter.key)),
  ];

  const setup = facts ? assessSetup(facts) : null;
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
          {setup ? <ProgressRing value={setup.percent} label="Household setup" size={72} stroke={7} /> : null}
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Set up your household</h1>
            <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">
              Each step saves as you go, so you can stop anywhere and pick it up later. Nothing is
              lost between visits.
            </p>
          </div>
        </header>

        <SegmentedControl
          label="Setup step"
          active={active}
          segments={STEPS.map((step) => ({
            key: step.key,
            label: step.label,
            href: `/household/setup?step=${step.key}`,
          }))}
        />

        {/* Each panel says what the step is for before asking for anything. */}
        {active === "family" ? (
          <Step
            icon={Users}
            title="Who lives here"
            purpose="Everyone gets their own view, and nothing is asked of the wrong person. Children get age-appropriate access; a househelper is never asked to update chores."
            done={done("family")}
          >
            <div className="space-y-3">
              <p className="text-sm text-[var(--wh-foreground-muted)]">
                {members.length === 1
                  ? "Just you so far."
                  : `${members.length} people in this household.`}
              </p>
              <div className="flex flex-wrap gap-2">
                {members.map((member) => (
                  <Badge key={member.id}>{member.displayName}</Badge>
                ))}
              </div>
              <PillLink href="/household/members" tone="primary">Invite someone</PillLink>
            </div>
          </Step>
        ) : null}

        {active === "playbook" ? (
          <Step
            icon={BookOpen}
            title="How the home should run"
            purpose="Describe the state you want rather than the steps to get there. WonderHome plans around it, stays silent while it is on track, and speaks up when it is at risk."
            done={done("playbook")}
          >
            <PlaybookForm action={savePlaybookAction} householdId={householdId} existing={defined} />
          </Step>
        ) : null}

        {active === "responsibilities" ? (
          <Step
            icon={ListChecks}
            title="Who looks after what"
            purpose="An outcome with an owner has somebody to ask. One without is a gap — and showing you the gap is the most useful thing this does."
            done={done("responsibilities")}
          >
            {members.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Invite somebody first"
                description="An outcome needs a person to own it."
                action={<PillLink href="/household/members">Invite someone</PillLink>}
              />
            ) : (
              <ResponsibilityForm
                action={saveResponsibilityAction}
                householdId={householdId}
                members={members.map((member) => ({ id: member.id, displayName: member.displayName }))}
                outcomes={assignable}
              />
            )}
          </Step>
        ) : null}

        {active === "policies" ? (
          <Step
            icon={ShieldCheck}
            title="Your household's rules"
            purpose="Spending limits, privacy, quiet hours. Policies are versioned and checked on the server every time, so neither a screen nor the assistant can go around one. Until you set them, WonderHome asks before anything consequential."
            done={done("policies")}
          >
            <PolicyForm action={savePolicyAction} householdId={householdId} />
          </Step>
        ) : null}

        {active === "connections" ? (
          <Step
            icon={Plug}
            title="Connected accounts"
            purpose="Calendars, school portals, mail and shopping."
            done={false}
          >
            <div className="space-y-3">
              <p className="text-sm text-[var(--wh-foreground-muted)]">
                No provider is live yet. A provider counts as live only once its credentials, consent
                flow and integration tests exist — so rather than offer a button that goes nowhere,
                WonderHome says so and works from what you tell it.
              </p>
              <PillLink href="/household/integrations" tone="quiet">See what is connected</PillLink>
            </div>
          </Step>
        ) : null}

        {active === "teach" ? (
          <Step
            icon={MessageSquareText}
            title="Or just say it"
            purpose="The same configuration, reached in a sentence. WonderHome reads it back and spells out what it would mean before anything is saved — and if it did not follow you, it asks rather than guesses."
            done={false}
          >
            <TeachForm
              preview={previewConfigurationAction}
              apply={applyConfigurationAction}
              householdId={householdId}
              shapes={[...UNDERSTOOD_SHAPES]}
            />
          </Step>
        ) : null}

        {setup && setup.next.length > 0 ? (
          <section>
            <SectionHeader title="Worth doing next" />
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

        <QuoteCard>A home that runs itself, because you told it how.</QuoteCard>
      </div>
    </AppShell>
  );
}

function Step({
  icon,
  title,
  purpose,
  done,
  children,
}: {
  icon: typeof Users;
  title: string;
  purpose: string;
  done: boolean;
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
                <CircleCheck aria-hidden className="size-3.5" /> Done
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
