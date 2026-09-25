import { BookOpen, Bot, ChevronRight, Cog, FileClock, ListChecks, Plug, ShieldCheck, Users, Wand2 } from "lucide-react";

import { assessSetup } from "@wonderhome/core/household/setup";
import { loadSetupFacts } from "@wonderhome/core/household/setup-repository";
import { listIntegrations } from "@wonderhome/core/integrations/repository";
import type { AutonomyMode } from "@wonderhome/core/household/autonomy";
import Link from "next/link";

import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SetupProgressCard } from "@wonderhome/core/ui/setup-progress";
import { EmptyState } from "@wonderhome/core/ui/states";

import { PlaybookRowControls, PolicyRowControls } from "../_components/playbook-controls";
import { playbookControlLabels, policyCategoryWords } from "../_lib/manage-labels";
import { requireSession } from "../_lib/session";
import { localizeSetup, setupProgressLabels } from "../_lib/setup-labels";

export const metadata = { title: "Manage Household" };
export const dynamic = "force-dynamic";

type PlaybookRow = { id: string; outcome_key: string; name: string; outcome_definition: string; operating_window: { startHour?: number; endHour?: number } | null; escalation: { afterHours?: number } | null; active: boolean };
type PolicyRow = { id: string; category: string; name: string; active: boolean; rule: { limitMinor?: number; note?: string; condition?: { kind: "member_type"; memberType: string } | { kind: "hour_range"; startHour: number; endHour: number } } | null };
type ResponsibilityRow = { ai_mode: AutonomyMode };

/**
 * Manage Household (requirements §21), for Admins: members, responsibilities,
 * the playbook, policies, AI autonomy, integrations and house settings — each
 * with a live count so the screen tells you the state of things before you
 * tap in.
 */
export default async function ManageHouseholdPage() {
  const session = await requireSession("/household");
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const shell = { active: "more" as const, viewer, secondary, pathname: "/household", back: { href: "/more", label: t("common.back") }, title: t("nav.item.manage") };

  if (!view.permissions.includes("household.manage")) {
    return (
      <AppShell {...shell}>
        <EmptyState icon={ShieldCheck} title={t("manage.forAdmins")} description={t("manage.forAdminsLede")} />
      </AppShell>
    );
  }

  const [{ count: memberCount }, playbook, policies, responsibilities, integrations, setupFacts] = await Promise.all([
    supabase.from("household_members").select("id", { count: "exact", head: true }).eq("household_id", householdId).eq("status", "active"),
    supabase.from("playbook_items").select("id, outcome_key, name, outcome_definition, operating_window, escalation, active").eq("household_id", householdId).order("name"),
    supabase.from("policies").select("id, category, name, active, rule").eq("household_id", householdId).eq("active", true).order("category"),
    supabase.from("responsibilities").select("ai_mode").eq("household_id", householdId),
    listIntegrations(supabase, householdId).catch(() => []),
    loadSetupFacts(supabase, membership.household).catch(() => null),
  ]);
  const setup = setupFacts ? localizeSetup(assessSetup(setupFacts), t) : null;
  const controlLabels = playbookControlLabels(t);

  const items = (playbook.data as PlaybookRow[] | null) ?? [];
  const playbookOptions = items.map((item) => ({ key: item.outcome_key, label: item.name }));
  const rules = (policies.data as PolicyRow[] | null) ?? [];
  const modes = ((responsibilities.data as ResponsibilityRow[] | null) ?? []).map((row) => row.ai_mode);
  const modeCounts = (["observe", "prepare", "approve", "execute"] as const).map((mode) => ({ mode, count: modes.filter((m) => m === mode).length }));
  const attention = integrations.filter((integration) => integration.needsAttention).length;

  const sections: { href: string; icon: typeof Users; tone: IconTone; title: string; meta: string; badge?: { label: string; tone: "attention" | "handled" | "neutral" } }[] = [
    { href: "/household/setup", icon: Wand2, tone: "primary", title: t("manage.section.setup"), meta: t("manage.section.setupMeta") },
    { href: "/household/members", icon: Users, tone: "people", title: t("manage.section.members"), meta: t("manage.section.membersMeta", { count: memberCount ?? 0 }) },
    { href: "/household/responsibilities", icon: ListChecks, tone: "primary", title: t("nav.item.responsibilities"), meta: t("manage.section.responsibilitiesMeta", { count: modes.length }) },
    { href: "#playbook", icon: BookOpen, tone: "home", title: t("manage.section.playbook"), meta: t("manage.section.playbookMeta", { count: items.filter((i) => i.active).length }) },
    { href: "/household/activity", icon: FileClock, tone: "neutral", title: t("manage.section.activity"), meta: t("manage.section.activityMeta") },
    { href: "#policies", icon: ShieldCheck, tone: "money", title: t("manage.section.policies"), meta: t("manage.section.policiesMeta", { count: rules.length }) },
    { href: "#autonomy", icon: Bot, tone: "ai", title: t("manage.section.autonomy"), meta: (["observe", "prepare", "approve", "execute"] as const).map((mode) => t(`manage.mode.${mode}`)).join(" · ") },
    { href: "/household/integrations", icon: Plug, tone: "care", title: t("manage.section.integrations"), meta: t("manage.section.integrationsMeta", { count: integrations.length }), badge: attention > 0 ? { label: t("manage.section.needYou", { count: attention }), tone: "attention" } : undefined },
    { href: "/settings", icon: Cog, tone: "neutral", title: t("manage.section.houseSettings"), meta: `${membership.household.name} · ${membership.household.timezone}` },
  ];

  return (
    <AppShell {...shell}>
      <div className="space-y-6">
        <header className="wh-rise hidden lg:block">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("nav.item.manage")}</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{t("manage.lede", { household: membership.household.name })}</p>
        </header>

        {setup ? <SetupProgressCard assessment={setup} variant="full" labels={setupProgressLabels(setup, t)} /> : null}

        <Card className="p-2">
          <ul className="divide-y divide-[var(--wh-border)]">
            {sections.map((section) => (
              <li key={section.href}>
                <Link href={section.href} className="flex min-h-14 items-center gap-3 rounded-[var(--wh-radius-sm)] px-2 py-2.5 transition-colors hover:bg-[var(--wh-surface-muted)]">
                  <IconTile icon={section.icon} tone={section.tone} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{section.title}</span>
                    <span className="block text-xs text-[var(--wh-foreground-subtle)]">{section.meta}</span>
                  </span>
                  {section.badge ? <Badge tone={section.badge.tone}>{section.badge.label}</Badge> : null}
                  <ChevronRight aria-hidden className="size-4 text-[var(--wh-foreground-subtle)]" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <section id="playbook">
          <SectionHeader title={t("manage.section.playbook")} count={items.length} />
          {items.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              tone="home"
              title={t("manage.playbook.emptyTitle")}
              description={t("manage.playbook.emptyLede")}
              action={<PillLink href="/household/setup?step=playbook" tone="primary">{t("manage.playbook.write")}</PillLink>}
            />
          ) : (
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {items.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-start gap-3 px-2 py-3">
                    <IconTile icon={BookOpen} tone="home" size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.name}{!item.active ? <Badge className="ms-2">{t("manage.playbook.paused")}</Badge> : null}</p>
                      <p className="text-xs text-[var(--wh-foreground-muted)]">{item.outcome_definition}</p>
                    </div>
                    <PlaybookRowControls
                      householdId={householdId}
                      active={item.active}
                      existing={playbookOptions}
                      labels={controlLabels}
                      item={{
                        outcomeKey: item.outcome_key,
                        name: item.name,
                        outcomeDefinition: item.outcome_definition,
                        startHour: item.operating_window?.startHour ?? null,
                        endHour: item.operating_window?.endHour ?? null,
                        escalateAfterHours: item.escalation?.afterHours ?? null,
                      }}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        <section id="policies">
          <SectionHeader title={t("manage.section.policies")} count={rules.length} />
          {rules.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              tone="money"
              title={t("manage.policies.emptyTitle")}
              description={t("manage.policies.emptyLede")}
              action={<PillLink href="/household/setup?step=policies" tone="primary">{t("manage.policies.set")}</PillLink>}
            />
          ) : (
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {rules.map((rule) => (
                  <li key={rule.id} className="flex flex-wrap items-center gap-3 px-2 py-3">
                    <IconTile icon={ShieldCheck} tone="money" size="sm" />
                    <p className="min-w-0 flex-1 text-sm font-medium">{rule.name}</p>
                    <Badge>{policyCategoryWords(rule.category, t)}</Badge>
                    <PolicyRowControls
                      householdId={householdId}
                      policyId={rule.id}
                      labels={controlLabels}
                      policy={{
                        category: rule.category,
                        name: rule.name,
                        limitMinor: rule.rule?.limitMinor ?? null,
                        note: rule.rule?.note ?? null,
                        conditionMemberType: rule.rule?.condition?.kind === "member_type" ? rule.rule.condition.memberType : null,
                        conditionStartHour: rule.rule?.condition?.kind === "hour_range" ? rule.rule.condition.startHour : null,
                        conditionEndHour: rule.rule?.condition?.kind === "hour_range" ? rule.rule.condition.endHour : null,
                      }}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        <section id="autonomy">
          <SectionHeader title={t("manage.section.autonomy")} />
          <div className="grid gap-2 sm:grid-cols-2">
            {modeCounts.map(({ mode, count }) => (
              <Card key={mode} className="flex items-start gap-3 p-3.5">
                <IconTile icon={Bot} tone={mode === "execute" ? "ai" : mode === "approve" ? "primary" : mode === "prepare" ? "home" : "neutral"} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t(`manage.mode.${mode}`)}</p>
                  <p className="text-xs text-[var(--wh-foreground-muted)]">{t(`manage.modeDescription.${mode}`)}</p>
                </div>
                <Badge tone={count > 0 ? "handled" : "neutral"}>{count}</Badge>
              </Card>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--wh-foreground-subtle)]">{t("manage.autonomy.note")}</p>
        </section>

        <QuoteCard>{t("manage.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
