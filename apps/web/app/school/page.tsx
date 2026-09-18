import { redirect } from "next/navigation";
import { BookOpen, CalendarDays, GraduationCap, MessageSquareText, Plug } from "lucide-react";

import { may } from "@wonderhome/core/billing/repository";
import { isHouseholdAdmin, listMembers } from "@wonderhome/core/identity/households";
import { describeSchoolHealth } from "@wonderhome/core/school/connector";
import { listCommunications, listSchoolItems, schoolAgenda } from "@wonderhome/core/school/repository";
import { listIntegrations } from "@wonderhome/core/integrations/repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ActionRow } from "@wonderhome/core/ui/action-row";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { Card } from "@wonderhome/core/ui/card";
import { MetricGrid } from "@wonderhome/core/ui/metric-card";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";

import { AgendaRow } from "../_components/agenda-row";
import { formatDate, formatTime, requireSession } from "../_lib/session";

export const metadata = { title: "Kids & School" };
export const dynamic = "force-dynamic";

/**
 * School (requirements §16): Overview, Homework and Calendar.
 *
 * Overview is the agenda — deadlines that will not fit and messages that ask
 * something. Homework is every child's live work, for a parent who wants the
 * whole picture. Guardianship is enforced underneath by RLS, so a parent sees
 * their own children and a child sees themselves.
 */
export default async function SchoolPage({ searchParams }: { searchParams: Promise<{ tab?: string; child?: string }> }) {
  const [{ tab, child }, session] = await Promise.all([searchParams, requireSession("/school")]);
  const { supabase, membership, view, viewer, secondary } = session;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;

  if (view.tone === "child") redirect("/?tab=homework");

  const entitlement = await may(supabase, householdId, "school.connector");
  const active = tab === "homework" || tab === "calendar" ? tab : "overview";
  const shell = { active: "more" as const, viewer, secondary, pathname: "/school", back: { href: "/more", label: "Back" }, title: "Kids & School" };

  if (!entitlement.allowed) {
    return (
      <AppShell {...shell}>
        <EmptyState icon={GraduationCap} tone="school" title="School is not part of this plan" description={entitlement.reason} />
      </AppShell>
    );
  }

  const [agenda, items, communications, members, integrations] = await Promise.all([
    schoolAgenda(supabase, householdId).catch(() => null),
    listSchoolItems(supabase, householdId, child ? { childMemberId: child } : {}).catch(() => []),
    listCommunications(supabase, householdId).catch(() => []),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    listIntegrations(supabase, householdId).catch(() => []),
  ]);

  // A stale portal and "no homework" must never look alike (17-004): if a
  // connected school portal is not working, the screen says so up front.
  const portalHealth =
    integrations
      .filter((integration) => integration.kind === "school")
      .map((integration) => describeSchoolHealth({ status: integration.status, lastSuccessAt: integration.lastSuccessAt }))
      .find((health) => health.tone !== "silent") ?? null;
  const admin = isHouseholdAdmin(membership);

  const children = members.filter((member) => member.memberType === "child");
  const nameOf = (id: string | null) => members.find((member) => member.id === id)?.displayName ?? "School";
  const live = items.filter((item) => item.status === "pending" || item.status === "in_progress");
  const needsYou = agenda ? agenda.deadlines.length + agenda.messages.length : 0;

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise hidden lg:block">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Kids &amp; School</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">All school info in one place — and only what needs you up front.</p>
        </header>

        {portalHealth ? (
          <Card className="flex items-start gap-3 p-4">
            <Plug aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--wh-foreground-muted)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm">{portalHealth.message}</p>
              {portalHealth.tone === "needs_action" && admin ? (
                <div className="mt-2">
                  <PillLink href="/household/integrations" tone="primary">Fix the connection</PillLink>
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}

        {children.length > 1 ? (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
            <PillLink href={`/school?tab=${active}`} tone={child ? "quiet" : "primary"}>Everyone</PillLink>
            {children.map((kid) => (
              <PillLink key={kid.id} href={`/school?tab=${active}&child=${kid.id}`} tone={child === kid.id ? "primary" : "quiet"}>{kid.displayName}</PillLink>
            ))}
          </div>
        ) : null}

        <SegmentedControl
          label="School view"
          active={active}
          segments={[
            { key: "overview", label: "Overview", href: `/school${child ? `?child=${child}` : ""}`, count: needsYou },
            { key: "homework", label: "Homework", href: `/school?tab=homework${child ? `&child=${child}` : ""}`, count: live.length },
            { key: "calendar", label: "Calendar", href: `/school?tab=calendar${child ? `&child=${child}` : ""}` },
          ]}
        />

        {active === "overview" ? (
          <>
            <MetricGrid
              metrics={[
                { label: "Need you", value: needsYou, icon: GraduationCap, tone: "attention" },
                { label: "Live work", value: live.length, icon: BookOpen, tone: "school" },
                { label: "Checked", value: agenda?.checked ?? 0, icon: MessageSquareText, tone: "handled" },
              ]}
            />
            {agenda === null ? (
              <EmptyState icon={GraduationCap} tone="school" title="School could not be loaded" description="Nothing has been changed. Try again in a moment." />
            ) : needsYou === 0 ? (
              <EmptyState
                icon={GraduationCap}
                tone="school"
                title={agenda.checked === 0 ? "Nothing from school yet" : "School is under control"}
                description={agenda.checked === 0 ? "Connect a school account or add a piece of homework, and WonderHome will keep an eye on every deadline." : "Every deadline fits in the time before it, and nothing from school is waiting on a reply."}
                action={agenda.checked === 0 ? <PillLink href="/household/integrations"><Plug aria-hidden className="size-3.5" /> Connect school</PillLink> : null}
              />
            ) : (
              <>
                {agenda.deadlines.length > 0 ? (
                  <section>
                    <SectionHeader title="Deadlines at risk" count={agenda.deadlines.length} />
                    <Card className="p-2"><ul className="divide-y divide-[var(--wh-border)]">{agenda.deadlines.map((item) => <AgendaRow key={item.subjectKey} item={item} href="/school?tab=homework" />)}</ul></Card>
                  </section>
                ) : null}
                {agenda.messages.length > 0 ? (
                  <section>
                    <SectionHeader title="From the school" count={agenda.messages.length} />
                    <Card className="p-2"><ul className="divide-y divide-[var(--wh-border)]">{agenda.messages.map((item) => <AgendaRow key={item.subjectKey} item={item} href="/school?tab=calendar" />)}</ul></Card>
                  </section>
                ) : null}
              </>
            )}
          </>
        ) : null}

        {active === "homework" ? (
          live.length === 0 ? (
            <EmptyState icon={BookOpen} tone="school" title="No live homework" description="When school sets something new — or you add it — it appears here with an honest estimate of the time it takes." />
          ) : (
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {live.map((item) => (
                  <ActionRow
                    key={item.id}
                    icon={item.kind === "exam" ? CalendarDays : BookOpen}
                    tone="school"
                    title={item.title}
                    meta={[nameOf(item.childMemberId), item.subject, item.dueAt ? `due ${formatDate(timezone, item.dueAt, "long")}` : "no due date", item.estimatedMinutes ? `~${item.estimatedMinutes} min${item.estimateSource === "inferred" ? " (estimated)" : ""}` : null].filter(Boolean).join(" · ")}
                    action={<Badge tone={item.status === "in_progress" ? "attention" : "neutral"}>{item.status === "in_progress" ? "In progress" : item.kind}</Badge>}
                  />
                ))}
              </ul>
            </Card>
          )
        ) : null}

        {active === "calendar" ? (
          <>
            <section>
              <SectionHeader title="Events & exams" />
              {items.filter((item) => (item.kind === "event" || item.kind === "exam") && item.dueAt && item.status !== "cancelled").length === 0 ? (
                <EmptyState icon={CalendarDays} tone="school" title="No school events coming up" description="Field trips, PTMs and exams appear here as the school shares them." />
              ) : (
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {items.filter((item) => (item.kind === "event" || item.kind === "exam") && item.dueAt && item.status !== "cancelled").map((item) => (
                      <ActionRow key={item.id} icon={CalendarDays} tone="school" title={item.title} meta={`${nameOf(item.childMemberId)} · ${formatDate(timezone, item.dueAt!, "long")} · ${formatTime(timezone, item.dueAt!)}`} />
                    ))}
                  </ul>
                </Card>
              )}
            </section>
            <section>
              <SectionHeader title="Teacher updates" count={communications.filter((c) => c.requiresAction).length} />
              {communications.length === 0 ? (
                <EmptyState icon={MessageSquareText} tone="school" title="No messages yet" description="Announcements and notes from school are summarised here, with the ones that need a reply on top." />
              ) : (
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {communications.slice(0, 12).map((message) => (
                      <ActionRow
                        key={message.id}
                        icon={MessageSquareText}
                        tone="school"
                        title={message.subject ?? message.summary}
                        meta={`${nameOf(message.childMemberId)} · ${formatDate(timezone, message.receivedAt, "long")}${message.actionDueAt ? ` · reply by ${formatDate(timezone, message.actionDueAt)}` : ""}`}
                        action={message.requiresAction ? <Badge tone="attention">{message.actionLabel ?? "Reply"}</Badge> : undefined}
                      />
                    ))}
                  </ul>
                </Card>
              )}
            </section>
          </>
        ) : null}

        <QuoteCard>Curious minds, brighter tomorrows.</QuoteCard>
      </div>
    </AppShell>
  );
}
