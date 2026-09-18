import { BookOpen, Bot, ChevronRight, Cog, ListChecks, Plug, ShieldCheck, Users } from "lucide-react";

import { assessSetup } from "@wonderhome/core/household/setup";
import { loadSetupFacts } from "@wonderhome/core/household/setup-repository";
import { listIntegrations } from "@wonderhome/core/integrations/repository";
import { AUTONOMY_DESCRIPTIONS, type AutonomyMode } from "@wonderhome/core/household/autonomy";
import Link from "next/link";

import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SetupProgressCard } from "@wonderhome/core/ui/setup-progress";
import { EmptyState } from "@wonderhome/core/ui/states";

import { requireSession } from "../_lib/session";

export const metadata = { title: "Manage household" };
export const dynamic = "force-dynamic";

type PlaybookRow = { id: string; name: string; outcome_definition: string; active: boolean };
type PolicyRow = { id: string; category: string; name: string; active: boolean };
type ResponsibilityRow = { ai_mode: AutonomyMode };

/**
 * Manage Household (requirements §21), for the Head of Family and
 * administrators: members, responsibilities, the playbook, policies, AI
 * autonomy, integrations and house settings — each with a live count so the
 * screen tells you the state of things before you tap in.
 */
export default async function ManageHouseholdPage() {
  const session = await requireSession("/household");
  const { supabase, membership, view, viewer, secondary } = session;
  const householdId = membership.household.id;
  const shell = { active: "more" as const, viewer, secondary, pathname: "/household", back: { href: "/more", label: "Back" }, title: "Manage household" };

  if (!view.permissions.includes("household.manage")) {
    return (
      <AppShell {...shell}>
        <EmptyState icon={ShieldCheck} title="For the Head of Family and administrators" description="Ask them if something about the household needs changing." />
      </AppShell>
    );
  }

  const [{ count: memberCount }, playbook, policies, responsibilities, integrations, setupFacts] = await Promise.all([
    supabase.from("household_members").select("id", { count: "exact", head: true }).eq("household_id", householdId).eq("status", "active"),
    supabase.from("playbook_items").select("id, name, outcome_definition, active").eq("household_id", householdId).order("name"),
    supabase.from("policies").select("id, category, name, active").eq("household_id", householdId).eq("active", true).order("category"),
    supabase.from("responsibilities").select("ai_mode").eq("household_id", householdId),
    listIntegrations(supabase, householdId).catch(() => []),
    loadSetupFacts(supabase, membership.household).catch(() => null),
  ]);
  const setup = setupFacts ? assessSetup(setupFacts) : null;

  const items = (playbook.data as PlaybookRow[] | null) ?? [];
  const rules = (policies.data as PolicyRow[] | null) ?? [];
  const modes = ((responsibilities.data as ResponsibilityRow[] | null) ?? []).map((row) => row.ai_mode);
  const modeCounts = (["observe", "prepare", "approve", "execute"] as const).map((mode) => ({ mode, count: modes.filter((m) => m === mode).length }));
  const attention = integrations.filter((integration) => integration.needsAttention).length;

  const sections: { href: string; icon: typeof Users; tone: IconTone; title: string; meta: string; badge?: { label: string; tone: "attention" | "handled" | "neutral" } }[] = [
    { href: "/household/members", icon: Users, tone: "people", title: "Members & roles", meta: `${memberCount ?? 0} active · roles, permissions, privacy scopes` },
    { href: "/household/responsibilities", icon: ListChecks, tone: "primary", title: "Responsibilities", meta: `${modes.length} outcomes · owners, backups and outcomes` },
    { href: "#playbook", icon: BookOpen, tone: "home", title: "Household playbook", meta: `${items.filter((i) => i.active).length} routines and operating rules` },
    { href: "#policies", icon: ShieldCheck, tone: "money", title: "Policies", meta: `${rules.length} active · spending, approval, notifications, privacy` },
    { href: "#autonomy", icon: Bot, tone: "ai", title: "AI autonomy", meta: "Suggest · Prepare · Ask approval · Execute" },
    { href: "/household/integrations", icon: Plug, tone: "care", title: "Integrations", meta: `${integrations.length} connected · school, calendar, email, shopping, weather, payments`, badge: attention > 0 ? { label: `${attention} need you`, tone: "attention" } : undefined },
    { href: "/settings", icon: Cog, tone: "neutral", title: "House settings", meta: `${membership.household.name} · ${membership.household.timezone}` },
  ];

  return (
    <AppShell {...shell}>
      <div className="space-y-6">
        <header className="wh-rise hidden lg:block">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Manage household</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{membership.household.name} — who does what, how the home runs, and how much WonderHome may do on its own.</p>
        </header>

        {setup ? <SetupProgressCard assessment={setup} variant="full" /> : null}

        <Card className="p-2">
          <ul className="divide-y divide-[var(--wh-border)]">
            {sections.map((section) => (
              <li key={section.title}>
                <Link href={section.href} className="flex min-h-14 items-center gap-3 rounded-[var(--wh-radius-sm)] px-2 py-2.5 transition-colors hover:bg-[var(--wh-surface-muted)]">
                  <IconTile icon={section.icon} tone={section.tone} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{section.title}</span>
                    <span className="block truncate text-xs text-[var(--wh-foreground-subtle)]">{section.meta}</span>
                  </span>
                  {section.badge ? <Badge tone={section.badge.tone}>{section.badge.label}</Badge> : null}
                  <ChevronRight aria-hidden className="size-4 text-[var(--wh-foreground-subtle)]" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <section id="playbook">
          <SectionHeader title="Household playbook" count={items.length} />
          {items.length === 0 ? (
            <EmptyState icon={BookOpen} tone="home" title="No playbook yet" description="The playbook is the desired state of the home in your own words — “laundry ready by Sunday evening”, not the steps. WonderHome plans around it." />
          ) : (
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {items.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 px-2 py-3">
                    <IconTile icon={BookOpen} tone="home" size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-[var(--wh-foreground-muted)]">{item.outcome_definition}</p>
                    </div>
                    {!item.active ? <Badge>paused</Badge> : null}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        <section id="policies">
          <SectionHeader title="Policies" count={rules.length} />
          {rules.length === 0 ? (
            <EmptyState icon={ShieldCheck} tone="money" title="No policies set" description="Spending limits, who approves what, quiet hours and privacy scopes. Until set, WonderHome asks before anything consequential." />
          ) : (
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {rules.map((rule) => (
                  <li key={rule.id} className="flex items-center gap-3 px-2 py-3">
                    <IconTile icon={ShieldCheck} tone="money" size="sm" />
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{rule.name}</p>
                    <Badge>{rule.category.replace(/_/g, " ")}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        <section id="autonomy">
          <SectionHeader title="AI autonomy" />
          <div className="grid gap-2 sm:grid-cols-2">
            {modeCounts.map(({ mode, count }) => (
              <Card key={mode} className="flex items-start gap-3 p-3.5">
                <IconTile icon={Bot} tone={mode === "execute" ? "ai" : mode === "approve" ? "primary" : mode === "prepare" ? "home" : "neutral"} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold capitalize">{mode === "approve" ? "Ask approval" : mode === "execute" ? "Execute" : mode === "prepare" ? "Prepare" : "Suggest"}</p>
                  <p className="text-xs text-[var(--wh-foreground-muted)]">{AUTONOMY_DESCRIPTIONS[mode]}</p>
                </div>
                <Badge tone={count > 0 ? "handled" : "neutral"}>{count}</Badge>
              </Card>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--wh-foreground-subtle)]">Set per responsibility. Payments, permission changes and deletions always need a person, whatever the setting.</p>
        </section>

        <QuoteCard>A home that knows how it likes to run.</QuoteCard>
      </div>
    </AppShell>
  );
}
