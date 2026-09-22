import { redirect } from "next/navigation";
import { BookOpen, CalendarDays, GraduationCap, MessageSquareText, Plug } from "lucide-react";

import { may } from "@wonderhome/core/billing/repository";
import type { HomeAssessment } from "@wonderhome/core/home/assessment";
import { isoDate } from "@wonderhome/core/home/assessment";
import { isHouseholdAdmin, listMembers } from "@wonderhome/core/identity/households";
import { describeSchoolHealth } from "@wonderhome/core/school/connector";
import { upcomingSchoolItems, type SchoolItem } from "@wonderhome/core/school/items";
import { listCommunications, listSchoolItems, schoolAgenda } from "@wonderhome/core/school/repository";
import { listIntegrations } from "@wonderhome/core/integrations/repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ActionRow } from "@wonderhome/core/ui/action-row";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { Card } from "@wonderhome/core/ui/card";
import {
  ExpandableMetricGrid,
  MetricDetailEmpty,
  MetricDetailList,
  MetricDetailRow,
  type ExpandableMetric,
} from "@wonderhome/core/ui/expandable-metric-card";
import { ExpandableRow } from "@wonderhome/core/ui/expandable-row";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";

import { AgendaExpandableRow } from "../_components/agenda-expandable-row";
import { AddHomeworkButton } from "../_components/school-forms";
import { SchoolItemDetail } from "../_components/school-item-controls";
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
  const childOptions = children.map((kid) => ({ id: kid.id, displayName: kid.displayName }));
  const nameOf = (id: string | null) => members.find((member) => member.id === id)?.displayName ?? "School";
  const live = items.filter((item) => item.status === "pending" || item.status === "in_progress");
  const needsYou = agenda ? agenda.deadlines.length + agenda.messages.length : 0;

  // "Coming up" previews what's ahead (exams/projects/events a month out,
  // homework/worksheets a few days out) — distinct from "Deadlines at risk",
  // which only flags what won't fit in the time left. An item already
  // flagged there is left out here rather than shown twice.
  const atRiskIds = new Set((agenda?.deadlines ?? []).map((deadline) => deadline.subjectKey));
  const upcoming = upcomingSchoolItems(items).filter((item) => !atRiskIds.has(`school.${item.id}`));

  // What each Overview count opens onto: the real deadlines/messages behind
  // "Need you", the real live pieces of work behind "Live work" — the same
  // rows the sections below already render, reused rather than a second,
  // thinner list invented for the card — and the genuine split behind
  // "Checked" (rule 9: never more of a number's story than it can prove).
  const needsYouEntries: HomeAssessment[] = agenda ? [...agenda.deadlines, ...agenda.messages] : [];
  const metrics: ExpandableMetric[] = [
    {
      label: "Need you",
      value: needsYou,
      icon: GraduationCap,
      tone: "attention",
      details:
        needsYouEntries.length === 0 ? (
          <MetricDetailEmpty>Nothing needs you right now.</MetricDetailEmpty>
        ) : (
          <div className="space-y-2.5">
            <ul className="space-y-1">
              {needsYouEntries.slice(0, 4).map((item) => (
                <AgendaExpandableRow key={item.subjectKey} item={item} timezone={timezone} />
              ))}
            </ul>
            {needsYouEntries.length > 4 ? (
              <PillLink href="/school?tab=homework" tone="quiet">
                View all {needsYouEntries.length}
              </PillLink>
            ) : null}
          </div>
        ),
    },
    {
      label: "Live work",
      value: live.length,
      icon: BookOpen,
      tone: "school",
      details:
        live.length === 0 ? (
          <MetricDetailEmpty>No live homework right now.</MetricDetailEmpty>
        ) : (
          <div className="space-y-2.5">
            <ul className="space-y-1">
              {live.slice(0, 4).map((item) => (
                <ExpandableRow
                  key={item.id}
                  summary={
                    <>
                      <IconTile icon={item.kind === "exam" ? CalendarDays : BookOpen} tone="school" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{item.title}</span>
                        <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                          {[nameOf(item.childMemberId), item.subject, item.dueAt ? `due ${formatDate(timezone, item.dueAt, "long")}` : "no due date"]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <Badge tone={item.status === "in_progress" ? "attention" : "neutral"}>
                        {item.status === "in_progress" ? "In progress" : item.kind}
                      </Badge>
                    </>
                  }
                >
                  <SchoolItemDetail item={item} householdId={householdId} kids={childOptions} timezone={timezone} editable />
                </ExpandableRow>
              ))}
            </ul>
            {live.length > 4 ? (
              <PillLink href="/school?tab=homework" tone="quiet">
                View all {live.length}
              </PillLink>
            ) : null}
          </div>
        ),
    },
    {
      label: "Checked",
      value: agenda?.checked ?? 0,
      icon: MessageSquareText,
      tone: "handled",
      details:
        !agenda || agenda.checked === 0 ? (
          <MetricDetailEmpty>Nothing evaluated yet.</MetricDetailEmpty>
        ) : (
          <MetricDetailList>
            <MetricDetailRow icon={BookOpen} tone="school" title="Homework & school items" meta={`${items.length} checked`} />
            <MetricDetailRow icon={MessageSquareText} tone="handled" title="Messages from school" meta={`${communications.length} checked`} />
          </MetricDetailList>
        ),
    },
  ];

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise flex flex-wrap items-end justify-between gap-3">
          <div className="hidden lg:block">
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Kids &amp; School</h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">All school info in one place — and only what needs you up front.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {children.length > 0 ? <AddHomeworkButton householdId={householdId} kids={children.map((kid) => ({ id: kid.id, displayName: kid.displayName }))} /> : null}
            <PillLink href="/household/integrations" tone="quiet"><Plug aria-hidden className="size-3.5" /> Connect school</PillLink>
          </div>
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
            <ExpandableMetricGrid metrics={metrics} />
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
                  <section className="space-y-3">
                    <SectionHeader title="Deadlines at risk" count={agenda.deadlines.length} />
                    {groupByDueDate(agenda.deadlines, timezone).map((group) => (
                      <div key={group.label}>
                        <h3 className="px-1 pb-1 text-[0.6875rem] font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{group.label}</h3>
                        <Card className="p-2"><ul className="divide-y divide-[var(--wh-border)]">{group.items.map((item) => <AgendaExpandableRow key={item.subjectKey} item={item} timezone={timezone} href="/school?tab=homework" />)}</ul></Card>
                      </div>
                    ))}
                  </section>
                ) : null}
                {agenda.messages.length > 0 ? (
                  <section>
                    <SectionHeader title="From the school" count={agenda.messages.length} />
                    <Card className="p-2"><ul className="divide-y divide-[var(--wh-border)]">{agenda.messages.map((item) => <AgendaExpandableRow key={item.subjectKey} item={item} timezone={timezone} href="/school?tab=calendar" />)}</ul></Card>
                  </section>
                ) : null}
              </>
            )}
            {upcoming.length > 0 ? (
              <section className="space-y-3">
                <SectionHeader title="Coming up" count={upcoming.length} />
                {groupSchoolItemsByDueDate(upcoming, timezone).map((group) => (
                  <div key={group.label}>
                    <h3 className="px-1 pb-1 text-[0.6875rem] font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{group.label}</h3>
                    <Card className="p-2">
                      <ul className="divide-y divide-[var(--wh-border)]">
                        {group.items.map((item) => (
                          <ExpandableRow
                            key={item.id}
                            summary={
                              <>
                                <IconTile icon={item.kind === "homework" || item.kind === "worksheet" ? BookOpen : CalendarDays} tone="school" />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-medium">{item.title}</span>
                                  <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                                    {[nameOf(item.childMemberId), item.subject, `due ${formatDate(timezone, item.dueAt!, "long")}`].filter(Boolean).join(" · ")}
                                  </span>
                                </span>
                                <Badge tone="neutral">{item.kind}</Badge>
                              </>
                            }
                          >
                            <SchoolItemDetail item={item} householdId={householdId} kids={childOptions} timezone={timezone} editable />
                          </ExpandableRow>
                        ))}
                      </ul>
                    </Card>
                  </div>
                ))}
              </section>
            ) : null}
          </>
        ) : null}

        {active === "homework" ? (
          live.length === 0 ? (
            <EmptyState icon={BookOpen} tone="school" title="No live homework" description="When school sets something new — or you add it — it appears here with an honest estimate of the time it takes." />
          ) : (
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {live.map((item) => (
                  <ExpandableRow
                    key={item.id}
                    summary={
                      <>
                        <IconTile icon={item.kind === "exam" ? CalendarDays : BookOpen} tone="school" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{item.title}</span>
                          <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                            {[nameOf(item.childMemberId), item.subject, item.dueAt ? `due ${formatDate(timezone, item.dueAt, "long")}` : "no due date", item.estimatedMinutes ? `~${item.estimatedMinutes} min${item.estimateSource === "inferred" ? " (estimated)" : ""}` : null].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <Badge tone={item.status === "in_progress" ? "attention" : "neutral"}>{item.status === "in_progress" ? "In progress" : item.kind}</Badge>
                      </>
                    }
                  >
                    <SchoolItemDetail item={item} householdId={householdId} kids={childOptions} timezone={timezone} editable />
                  </ExpandableRow>
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
                      <ExpandableRow
                        key={item.id}
                        summary={
                          <>
                            <IconTile icon={CalendarDays} tone="school" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium">{item.title}</span>
                              <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                                {nameOf(item.childMemberId)} · {formatDate(timezone, item.dueAt!, "long")} · {formatTime(timezone, item.dueAt!)}
                              </span>
                            </span>
                          </>
                        }
                      >
                        <SchoolItemDetail item={item} householdId={householdId} kids={childOptions} timezone={timezone} editable />
                      </ExpandableRow>
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

/**
 * "Deadlines at risk" grouped by when they're due, rather than one flat
 * list — every item here already has a real due date (`assessDeadline`
 * never marks an item without one notable), so this never invents a bucket
 * for a date that isn't there.
 */
function groupByDueDate(items: HomeAssessment[], timezone: string): { label: string; items: HomeAssessment[] }[] {
  const now = new Date();
  const today = isoDate(now);
  const tomorrow = isoDate(new Date(now.getTime() + 86_400_000));
  const sorted = [...items].sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""));

  const groups = new Map<string, HomeAssessment[]>();
  for (const item of sorted) {
    const due = item.dueOn;
    const label = !due
      ? "No date yet"
      : due < today
        ? "Overdue"
        : due === today
          ? "Today"
          : due === tomorrow
            ? "Tomorrow"
            : formatDate(timezone, new Date(`${due}T00:00:00.000Z`), "long");
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return [...groups.entries()].map(([label, groupItems]) => ({ label, items: groupItems }));
}

/**
 * Same Today/Tomorrow/date grouping as `groupByDueDate`, for the "Coming
 * up" list — a plain `SchoolItem[]` rather than `HomeAssessment[]`, and
 * every item here already has a due date and is due today or later
 * (`upcomingSchoolItems` guarantees both), so there is no "Overdue" or "No
 * date yet" bucket to account for.
 */
function groupSchoolItemsByDueDate(items: SchoolItem[], timezone: string): { label: string; items: SchoolItem[] }[] {
  const now = new Date();
  const today = isoDate(now);
  const tomorrow = isoDate(new Date(now.getTime() + 86_400_000));

  const groups = new Map<string, SchoolItem[]>();
  for (const item of items) {
    const due = isoDate(item.dueAt!);
    const label = due === today ? "Today" : due === tomorrow ? "Tomorrow" : formatDate(timezone, item.dueAt!, "long");
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return [...groups.entries()].map(([label, groupItems]) => ({ label, items: groupItems }));
}
