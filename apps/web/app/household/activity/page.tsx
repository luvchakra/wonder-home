import {
  Bot,
  FileClock,
  KeyRound,
  Link2,
  ListChecks,
  Mail,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";

import { listAuditEvents } from "@wonderhome/core/api/audit";
import { listMembers } from "@wonderhome/core/identity/households";
import { describeAuditEvent } from "@wonderhome/core/security/sensitive-actions";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { EmptyState } from "@wonderhome/core/ui/states";

import { formatDate, formatTime, requireSession } from "../../_lib/session";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

/**
 * The household's activity trail (story 15-006).
 *
 * Who changed what, and when — in sentences about people rather than table
 * names. An administrator reading "responsibility.updated on 4f2b" has a log
 * line; one reading "Who looks after something changed · laundry.ready" has
 * an answer.
 *
 * Nothing here is filtered on the client. RLS restricts the table to
 * administrators, and the rows were redacted on the way in, so what reaches
 * this page is already everything this person may see and nothing more.
 */
const PRESENTATION: Record<string, { icon: ComponentType<{ className?: string }>; tone: IconTone }> = {
  household: { icon: Users, tone: "people" },
  member: { icon: UserRound, tone: "people" },
  invitation: { icon: Mail, tone: "care" },
  child: { icon: Users, tone: "school" },
  playbook: { icon: ListChecks, tone: "home" },
  responsibility: { icon: ListChecks, tone: "primary" },
  policy: { icon: ShieldCheck, tone: "primary" },
  integration: { icon: Link2, tone: "care" },
  ai: { icon: Bot, tone: "ai" },
  privacy: { icon: KeyRound, tone: "neutral" },
  support: { icon: ShieldCheck, tone: "attention" },
};

export default async function ActivityPage() {
  const session = await requireSession("/household/activity");
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;

  const shell = {
    active: "more" as const,
    viewer,
    secondary,
    pathname: "/household/activity",
    back: { href: "/household", label: t("manage.backToManage") },
    title: t("manage.section.activity"),
  };

  if (!view.permissions.includes("household.manage")) {
    return (
      <AppShell {...shell}>
        <EmptyState
          icon={FileClock}
          title={t("manage.forAdmins")}
          description={t("manage.activity.adminOnlyLede")}
        />
      </AppShell>
    );
  }

  const [events, members] = await Promise.all([
    listAuditEvents(supabase, householdId, 100).catch(() => []),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
  ]);

  const nameOf = (id: string | null) =>
    id ? (members.find((member) => member.id === id)?.displayName ?? t("manage.activity.somebodyGone")) : "WonderHome";

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("manage.section.activity")}</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("manage.activity.lede")}</p>
        </header>

        {events.length === 0 ? (
          <EmptyState
            icon={FileClock}
            title={t("manage.activity.emptyTitle")}
            description={t("manage.activity.emptyLede")}
          />
        ) : (
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {events.map((event) => {
                const described = describeAuditEvent(event.eventType, event.metadata);
                const prefix = event.eventType.split(".")[0] ?? "";
                const presentation = PRESENTATION[prefix] ?? { icon: FileClock, tone: "neutral" as IconTone };
                const at = new Date(event.createdAt);

                return (
                  <li key={event.id} className="flex items-start gap-3 px-2 py-3">
                    <IconTile icon={presentation.icon} tone={presentation.tone} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{described.title}</p>
                      <p className="text-xs text-[var(--wh-foreground-muted)]">
                        {nameOf(event.actorMemberId)}
                        {described.detail ? ` · ${described.detail}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-right text-[0.6875rem] text-[var(--wh-foreground-subtle)]">
                      <span className="block">{formatDate(timezone, at)}</span>
                      <span className="block tabular-nums">{formatTime(timezone, at)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <Card className="space-y-2 p-4 text-sm text-[var(--wh-foreground-muted)]">
          <p className="font-semibold text-[var(--wh-foreground)]">{t("manage.activity.notHere")}</p>
          <p>{t("manage.activity.notHereBody")}</p>
        </Card>

        <QuoteCard>{t("manage.activity.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
