import {
  AlertTriangle,
  CalendarHeart,
  Clock3,
  GraduationCap,
  ListChecks,
  Utensils,
  Wallet,
} from "lucide-react";

import { listEvents } from "@wonderhome/core/family/repository";
import { listObligations } from "@wonderhome/core/finance/repository";
import { format as formatMoney } from "@wonderhome/core/finance/payments";
import { listMembers } from "@wonderhome/core/identity/households";
import { listMeals } from "@wonderhome/core/meals/repository";
import { isoDateIn } from "@wonderhome/core/context/format";
import { listSchoolItems } from "@wonderhome/core/school/repository";
import { schoolDateValue, schoolTimeWords } from "@wonderhome/core/school/times";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState, LoadingState } from "@wonderhome/core/ui/states";
import { Suspense } from "react";
import { Timeline, type TimelineItem } from "@wonderhome/core/ui/timeline";

import { AgendaRow } from "../_components/agenda-row";
import { NewEventForm } from "../_components/new-event-form";
import { householdAgenda } from "../_lib/agenda";
import { formatTime, formatToday, requireSession, type Session } from "../_lib/session";

export const metadata = { title: "Today" };
export const dynamic = "force-dynamic";

/**
 * Today (requirements §12): the day as a timeline, in three views.
 *
 * My day is what involves this person. Family is everyone's shared time.
 * Household is what the home itself needs. Items are commitments and
 * deadlines — a meal to be ready, a bill due, a class — never chores to tick.
 */
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const [{ view: requested }, session] = await Promise.all([searchParams, requireSession("/today")]);
  const { membership, view, viewer, secondary } = session;
  const timezone = membership.household.timezone;
  const now = new Date();
  const active = requested === "family" || requested === "household" ? requested : "mine";
  const isChild = view.tone === "child";

  return (
    <AppShell active="today" viewer={viewer} secondary={secondary} pathname="/today">
      <div className="space-y-5">
        <header className="wh-rise flex items-end justify-between gap-3">
          <div>
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Today</h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">{formatToday(timezone, now)}</p>
          </div>
          <PillLink href="/family" tone="quiet">
            <CalendarHeart aria-hidden className="size-3.5" /> Calendar
          </PillLink>
        </header>

        <SegmentedControl
          label="Whose day"
          active={active}
          segments={[
            { key: "mine", label: "My day", href: "/today" },
            { key: "family", label: "Family", href: "/today?view=family" },
            ...(isChild ? [] : [{ key: "household", label: "Household", href: "/today?view=household" }]),
          ]}
        />

        <Suspense fallback={<LoadingState rows={4} label="Laying out the day" />}>
          <TodayBody session={session} active={active} now={now} />
        </Suspense>

        {active === "mine" && !isChild ? (
          <Card className="flex items-center gap-3 p-4">
            <ListChecks aria-hidden className="size-5 shrink-0 text-[var(--wh-primary)]" />
            <p className="min-w-0 flex-1 text-sm text-[var(--wh-foreground-muted)]">
              Normal routines stay silent. Only what needs you appears here.
            </p>
          </Card>
        ) : null}

        <QuoteCard>Small steps today. Happier tomorrows.</QuoteCard>
      </div>
    </AppShell>
  );
}

async function TodayBody({ session, active, now }: { session: Session; active: "mine" | "family" | "household"; now: Date }) {
  const { supabase, membership, view } = session;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);
  const today = now.toISOString().slice(0, 10);

  const isChild = view.tone === "child";
  const seesMoney = view.permissions.includes("finance.view");
  const seesSchool = view.permissions.includes("school.manage") || view.permissions.includes("school.view_own");

  const [eventsR, mealsR, obligationsR, schoolItemsR, members, agendaR] = await Promise.all([
    settle(listEvents(supabase, householdId, { from: dayStart, to: dayEnd }), []),
    isChild ? ok([]) : settle(listMeals(supabase, householdId, { from: today, to: today }), []),
    seesMoney ? settle(listObligations(supabase, householdId), []) : ok([]),
    seesSchool ? settle(listSchoolItems(supabase, householdId), []) : ok([]),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    isChild ? ok(null) : settle(householdAgenda(supabase, householdId, view), null),
  ]);

  const { data: events } = eventsR;
  const { data: meals } = mealsR;
  const { data: obligations } = obligationsR;
  const { data: schoolItems } = schoolItemsR;
  const { data: agenda } = agendaR;
  // Missing data reads as "a quiet day" unless flagged separately — this is
  // the one thing that must never be silently indistinguishable from that.
  const someDataMissing = [eventsR, mealsR, obligationsR, schoolItemsR, agendaR].some((result) => result.failed);

  const nameOf = (memberId: string | null) => members.find((member) => member.id === memberId)?.displayName ?? null;
  const items: (TimelineItem & { at: Date; mine: boolean; family: boolean; household: boolean })[] = [];

  for (const event of events) {
    if (event.status === "cancelled") continue;
    const participates = event.ownerMemberId === membership.memberId || event.participants.some((p) => p.memberId === membership.memberId);
    items.push({
      key: `event.${event.id}`,
      at: event.startsAt,
      time: formatTime(timezone, event.startsAt),
      title: event.title,
      meta: `${formatTime(timezone, event.startsAt)} – ${formatTime(timezone, event.endsAt)}${nameOf(event.ownerMemberId) ? ` · ${nameOf(event.ownerMemberId)}` : ""}`,
      icon: CalendarHeart,
      tone: "people",
      state: stateFor(event.startsAt, event.endsAt, now, event.status === "happened", event.actionState),
      mine: participates || event.participants.length === 0,
      family: true,
      household: false,
      action: event.actionState && event.actionState !== "ready" ? <PillLink href="/family">Reply</PillLink> : undefined,
    });
  }

  for (const meal of meals) {
    if (meal.status === "skipped") continue;
    items.push({
      key: `meal.${meal.id}`,
      at: meal.readyBy,
      time: formatTime(timezone, meal.readyBy),
      title: `${slotLabel(meal.slot)} — ${meal.name}`,
      meta: meal.cookMemberId ? `${nameOf(meal.cookMemberId) ?? "Someone"} cooking` : "Nobody assigned yet",
      icon: Utensils,
      tone: "meals",
      state: meal.status === "eaten" || meal.status === "ready" ? "done" : meal.status === "at_risk" ? "needs_you" : stateFor(meal.readyBy, meal.readyBy, now, false, null),
      mine: meal.cookMemberId === membership.memberId || meal.cookMemberId === null,
      family: true,
      household: true,
      action: meal.status === "at_risk" ? <PillLink href="/meals">Fix</PillLink> : undefined,
    });
  }

  for (const obligation of obligations) {
    if (obligation.dueOn !== today || obligation.status === "paid" || obligation.status === "cancelled") continue;
    const at = new Date(dayEnd);
    items.push({
      key: `bill.${obligation.id}`,
      at,
      time: "Today",
      title: `${obligation.name} due`,
      meta: obligation.amountMinor !== null && obligation.currency ? formatMoney(obligation.amountMinor, obligation.currency) : "Amount not in yet",
      icon: Wallet,
      tone: "money",
      state: obligation.status === "scheduled" ? "done" : "needs_you",
      mine: obligation.responsibleMemberId === membership.memberId || obligation.responsibleMemberId === null,
      family: false,
      household: true,
      action: obligation.status === "scheduled" ? undefined : <PillLink href="/bills" tone="primary">Pay</PillLink>,
    });
  }

  const todayLocal = isoDateIn(now, timezone);
  for (const item of schoolItems) {
    // The household's own day (14-014): a timed item by its local date, an
    // all-day one by the day it names — never a time nobody gave.
    if (!item.dueAt || schoolDateValue(item, timezone) !== todayLocal) continue;
    if (item.status === "done" || item.status === "submitted" || item.status === "cancelled") continue;
    items.push({
      key: `school.${item.id}`,
      at: item.dueTimeKnown ? item.dueAt : new Date(dayEnd),
      time: schoolTimeWords(item, timezone) ?? "Today",
      title: item.title,
      meta: `${nameOf(item.childMemberId) ?? "School"}${item.subject ? ` · ${item.subject}` : ""}`,
      icon: GraduationCap,
      tone: "school",
      state: "needs_you",
      mine: item.childMemberId === membership.memberId || !isChild,
      family: true,
      household: false,
      action: <PillLink href="/school">Review</PillLink>,
    });
  }

  items.sort((a, b) => a.at.getTime() - b.at.getTime());
  const shown = items.filter((item) => (active === "mine" ? item.mine : active === "family" ? item.family : item.household));
  const householdNeeds = active === "household" && agenda ? agenda.needsYou : [];

  return (
    <>
      {someDataMissing ? (
        <Card className="flex items-center gap-3 bg-[var(--wh-attention-soft)]/60 p-3">
          <AlertTriangle aria-hidden className="size-5 shrink-0 text-[var(--wh-attention)]" />
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            WonderHome couldn’t reach part of today’s information just now. What’s shown below may be incomplete — try refreshing in a moment.
          </p>
        </Card>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState
          icon={Clock3}
          title={someDataMissing ? "Couldn't confirm your day is clear" : active === "mine" ? "Your day is clear" : active === "family" ? "Nothing on the family calendar today" : "The house is running itself today"}
          description={someDataMissing ? "Some information didn’t load, so this may not be the whole picture." : "Meaningful commitments show up here as they are planned. Routine household work never needs ticking off."}
          action={<NewEventForm householdId={householdId} label="Plan something" />}
        />
      ) : (
        <Timeline items={shown} />
      )}

      {householdNeeds.length > 0 ? (
        <section>
          <SectionHeader title="Needs a person" count={householdNeeds.length} />
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {householdNeeds.slice(0, 6).map((item) => (
                <AgendaRow key={item.subjectKey} item={item} />
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
    </>
  );
}

async function settle<T>(promise: Promise<T>, fallback: T): Promise<{ data: T; failed: boolean }> {
  try {
    return { data: await promise, failed: false };
  } catch {
    return { data: fallback, failed: true };
  }
}

async function ok<T>(data: T): Promise<{ data: T; failed: boolean }> {
  return { data, failed: false };
}

function stateFor(start: Date, end: Date, now: Date, happened: boolean, actionState: string | null): TimelineItem["state"] {
  if (happened || end < now) return "done";
  if (actionState && actionState !== "ready") return "needs_you";
  if (start <= now && end >= now) return "now";
  return "upcoming";
}

function slotLabel(slot: string): string {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}
