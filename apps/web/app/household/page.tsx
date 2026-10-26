import { Baby, Bell, BellRing, BookOpen, Bot, ChevronDown, ChevronRight, Cog, FileClock, GraduationCap, HandHelping, House, ListChecks, MapPin, PawPrint, Plug, ShieldCheck, Shirt, ShoppingBasket, Users, UtensilsCrossed, Wallet, Wand2, type LucideIcon } from "lucide-react";

import { loadHouseholdAddress } from "@wonderhome/core/household/address";
import { assessSetup } from "@wonderhome/core/household/setup";
import { loadSetupFacts } from "@wonderhome/core/household/setup-repository";
import { listIntegrations } from "@wonderhome/core/integrations/repository";
import { asAutonomyMode, type AutonomyMode } from "@wonderhome/core/household/autonomy";
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
import { groupByArea } from "../_lib/responsibility-groups";
import { requireSession } from "../_lib/session";
import { localizeSetup, setupProgressLabels } from "../_lib/setup-labels";

export const metadata = { title: "Manage Household" };
export const dynamic = "force-dynamic";

type PlaybookRow = { id: string; outcome_key: string; name: string; outcome_definition: string; operating_window: { startHour?: number; endHour?: number } | null; escalation: { afterHours?: number } | null; active: boolean };
/** Each playbook area's tile: its own icon, in its domain's colour (principle 3). */
const AREA_TILE: Record<string, { icon: LucideIcon; tone: IconTone }> = {
  pets: { icon: PawPrint, tone: "care" },
  kids: { icon: Baby, tone: "school" },
  school: { icon: GraduationCap, tone: "school" },
  finance: { icon: Wallet, tone: "money" },
  home: { icon: House, tone: "home" },
  household: { icon: HandHelping, tone: "people" },
  groceries: { icon: ShoppingBasket, tone: "meals" },
  meals: { icon: UtensilsCrossed, tone: "meals" },
  laundry: { icon: Shirt, tone: "home" },
};

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

  const [{ count: memberCount }, playbook, policies, responsibilities, integrations, setupFacts, address] = await Promise.all([
    supabase.from("household_members").select("id", { count: "exact", head: true }).eq("household_id", householdId).eq("status", "active"),
    supabase.from("playbook_items").select("id, outcome_key, name, outcome_definition, operating_window, escalation, active").eq("household_id", householdId).order("name"),
    supabase.from("policies").select("id, category, name, active, rule").eq("household_id", householdId).eq("active", true).order("category"),
    supabase.from("responsibilities").select("ai_mode").eq("household_id", householdId),
    listIntegrations(supabase, householdId).catch(() => []),
    loadSetupFacts(supabase, membership.household).catch(() => null),
    loadHouseholdAddress(supabase, householdId).catch(() => null),
  ]);
  const setup = setupFacts ? localizeSetup(assessSetup(setupFacts), t) : null;
  const controlLabels = playbookControlLabels(t);

  const items = (playbook.data as PlaybookRow[] | null) ?? [];
  const playbookOptions = items.map((item) => ({ key: item.outcome_key, label: item.name }));
  const rules = (policies.data as PolicyRow[] | null) ?? [];
  const modes = ((responsibilities.data as ResponsibilityRow[] | null) ?? []).map((row) => asAutonomyMode(row.ai_mode));
  const modeCounts = (["prepare", "execute"] as const).map((mode) => ({ mode, count: modes.filter((m) => m === mode).length }));
  const attention = integrations.filter((integration) => integration.needsAttention).length;

  type SectionLink = { href: string; icon: typeof Users; tone: IconTone; title: string; meta: string; badge?: { label: string; tone: "attention" | "handled" | "neutral" } };
  const link = {
    setup: { href: "/household/setup", icon: Wand2, tone: "primary", title: t("manage.section.setup"), meta: t("manage.section.setupMeta") },
    address: { href: "/household/address", icon: MapPin, tone: "home", title: t("manage.section.address"), meta: address?.formattedAddress ?? t("manage.section.addressMeta") },
    members: { href: "/household/members", icon: Users, tone: "people", title: t("manage.section.members"), meta: t("manage.section.membersMeta", { count: memberCount ?? 0 }) },
    settings: { href: "/settings", icon: Cog, tone: "neutral", title: t("manage.section.houseSettings"), meta: `${membership.household.name} · ${membership.household.timezone}` },
    responsibilities: { href: "/household/responsibilities", icon: ListChecks, tone: "primary", title: t("nav.item.responsibilities"), meta: t("manage.section.responsibilitiesMeta", { count: modes.length }) },
    playbook: { href: "#playbook", icon: BookOpen, tone: "home", title: t("manage.section.playbook"), meta: t("manage.section.playbookMeta", { count: items.filter((i) => i.active).length }) },
    policies: { href: "#policies", icon: ShieldCheck, tone: "money", title: t("manage.section.policies"), meta: t("manage.section.policiesMeta", { count: rules.length }) },
    autonomy: { href: "#autonomy", icon: Bot, tone: "ai", title: t("manage.section.autonomy"), meta: (["prepare", "execute"] as const).map((mode) => t(`manage.mode.${mode}`)).join(" · ") },
    notifications: { href: "/household/notifications", icon: Bell, tone: "attention", title: t("manage.section.notifications"), meta: t("manage.section.notificationsMeta") },
    delivery: { href: "/household/delivery", icon: BellRing, tone: "attention", title: t("manage.section.delivery"), meta: t("manage.section.deliveryMeta") },
    integrations: { href: "/household/integrations", icon: Plug, tone: "care", title: t("manage.section.integrations"), meta: t("manage.section.integrationsMeta", { count: integrations.length }), badge: attention > 0 ? { label: t("manage.section.needYou", { count: attention }), tone: "attention" } : undefined },
    activity: { href: "/household/activity", icon: FileClock, tone: "neutral", title: t("manage.section.activity"), meta: t("manage.section.activityMeta") },
  } satisfies Record<string, SectionLink>;
  // Grouped by what the reader is deciding (principle 17, the owner 2026-10-26). "How the home runs" lists
  // the sections below in the order they appear. The setup card above already opens the walk-through, so its
  // row shows only when that card can't (principle 14).
  const groups: { id: string; title: string; links: SectionLink[] }[] = [
    { id: "household", title: t("manage.group.household"), links: [...(setup ? [] : [link.setup]), link.members, link.address, link.settings] },
    { id: "running", title: t("manage.group.running"), links: [link.responsibilities, link.playbook, link.policies, link.autonomy] },
    { id: "notifications", title: t("manage.group.notifications"), links: [link.notifications, link.delivery] },
    { id: "records", title: t("manage.group.records"), links: [link.integrations, link.activity] },
  ];

  return (
    <AppShell {...shell}>
      <div className="space-y-6">
        <header className="wh-rise hidden lg:block">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("nav.item.manage")}</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{t("manage.lede", { household: membership.household.name })}</p>
        </header>

        {setup ? <SetupProgressCard assessment={setup} variant="full" labels={setupProgressLabels(setup, t)} /> : null}

        {groups.map((group) => (
          <section key={group.id} id={`manage-${group.id}`}>
            <SectionHeader title={group.title} />
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {group.links.map((section) => (
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
          </section>
        ))}

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
            // Grouped by area, each a folded card (the owner, 2026-10-26): 28 outcomes in one list was a wall.
            <div className="space-y-2">
              {groupByArea(items, t)
                .sort((a, b) => a.ownerName.localeCompare(b.ownerName))
                .map((group) => {
                  const tile = AREA_TILE[group.area] ?? { icon: BookOpen, tone: "home" as IconTone };
                  return (
                    <details key={group.area} className="group rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)]">
                      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden">
                        <IconTile icon={tile.icon} tone={tile.tone} size="sm" />
                        <span className="min-w-0 flex-1 text-sm font-semibold break-words">
                          {group.ownerName} <span className="font-normal whitespace-nowrap text-[var(--wh-foreground-subtle)]">· {group.rows.length}</span>
                        </span>
                        <ChevronDown aria-hidden className="size-4 shrink-0 text-[var(--wh-foreground-subtle)] transition-transform group-open:rotate-180" />
                      </summary>
                      <ul className="divide-y divide-[var(--wh-border)] border-t border-[var(--wh-border)] px-1">
                        {group.rows.map((item) => (
                          <li key={item.id} className="flex items-start gap-3 px-2 py-3">
                            <IconTile icon={tile.icon} tone={tile.tone} size="sm" />
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
                    </details>
                  );
                })}
            </div>
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
                  <li key={rule.id} className="flex items-center gap-3 px-2 py-3">
                    <IconTile icon={ShieldCheck} tone="money" size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium break-words">{rule.name}</p>
                      <Badge className="mt-1">{policyCategoryWords(rule.category, t)}</Badge>
                    </div>
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
                <IconTile icon={Bot} tone={mode === "execute" ? "ai" : "primary"} size="sm" />
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
