import { CalendarDays, CalendarOff, HandHeart, ListChecks, ShieldOff, UserPlus } from "lucide-react";

import { listMembers } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ActionRow } from "@wonderhome/core/ui/action-row";
import { Avatar } from "@wonderhome/core/ui/avatar";
import { Card } from "@wonderhome/core/ui/card";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { SegmentedControl } from "@wonderhome/core/ui/segmented-control";
import { EmptyState } from "@wonderhome/core/ui/states";

import { formatDate, requireSession } from "../_lib/session";

export const metadata = { title: "Househelper" };
export const dynamic = "force-dynamic";

type ProfileRow = { id: string; member_id: string; engagement: "regular" | "occasional" | "service"; started_on: string | null; notes: string | null };
type WindowRow = { member_id: string; day_of_week: number; start_time: string; end_time: string };
type ExceptionRow = { member_id: string; on_date: string; available: boolean; reason: string | null };
type ResponsibilityRow = { outcome_key: string; primary_member_id: string | null; backup_member_id: string | null; priority: number; playbook_items: { name: string } | { name: string }[] | null };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Househelper (requirements §17): coordinate service without surveillance.
 *
 * Overview shows who helps, when they are expected and what changes today.
 * Schedule is the weekly pattern and its exceptions. Tasks are the outcomes
 * they own — by name, never by tick — with who covers when they are away.
 * There are no productivity scores here, and there never will be.
 */
export default async function HousehelperPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, session] = await Promise.all([searchParams, requireSession("/househelper")]);
  const { supabase, membership, view, viewer, secondary } = session;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const active = tab === "schedule" || tab === "tasks" ? tab : "overview";
  const shell = { active: "more" as const, viewer, secondary, pathname: "/househelper", back: { href: "/more", label: "Back" }, title: "Househelper" };

  if (view.tone === "child") {
    return (
      <AppShell {...shell}>
        <EmptyState icon={ShieldOff} title="Not available to you" description="Househelper arrangements are for the adults in the household." />
      </AppShell>
    );
  }

  const [members, profileRows, windowRows, exceptionRows, responsibilityRows] = await Promise.all([
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    supabase.from("helper_profiles").select("id, member_id, engagement, started_on, notes").eq("household_id", householdId),
    supabase.from("member_availability").select("member_id, day_of_week, start_time, end_time").eq("household_id", householdId),
    supabase.from("availability_exceptions").select("member_id, on_date, available, reason").eq("household_id", householdId).gte("on_date", today).order("on_date"),
    supabase.from("responsibilities").select("outcome_key, primary_member_id, backup_member_id, priority, playbook_items(name)").eq("household_id", householdId),
  ]);

  const helpers = members.filter((member) => member.memberType === "helper");
  const profiles = (profileRows.data as ProfileRow[] | null) ?? [];
  const windows = (windowRows.data as WindowRow[] | null) ?? [];
  const exceptions = (exceptionRows.data as ExceptionRow[] | null) ?? [];
  const responsibilities = (responsibilityRows.data as ResponsibilityRow[] | null) ?? [];
  const nameOf = (id: string | null) => members.find((member) => member.id === id)?.displayName ?? null;
  const helperIds = new Set(helpers.map((helper) => helper.id));
  const todayDow = now.getDay();

  const expectedToday = (memberId: string) => {
    const exception = exceptions.find((e) => e.member_id === memberId && e.on_date === today);
    if (exception) return exception.available;
    return windows.some((w) => w.member_id === memberId && w.day_of_week === todayDow);
  };

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise hidden lg:block">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Househelper</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">Support that keeps home running — coordinated, never surveilled.</p>
        </header>

        <SegmentedControl
          label="Househelper view"
          active={active}
          segments={[
            { key: "overview", label: "Overview", href: "/househelper" },
            { key: "schedule", label: "Schedule", href: "/househelper?tab=schedule", count: exceptions.length },
            { key: "tasks", label: "Tasks", href: "/househelper?tab=tasks", count: responsibilities.filter((r) => r.primary_member_id && helperIds.has(r.primary_member_id)).length },
          ]}
        />

        {helpers.length === 0 ? (
          <EmptyState icon={HandHeart} tone="people" title="No househelper yet" description="Add the people who help at home. WonderHome tracks their days and who covers when they are away — nothing more." action={view.permissions.includes("members.manage") ? <PillLink href="/household/members"><UserPlus aria-hidden className="size-3.5" /> Add someone</PillLink> : null} />
        ) : null}

        {active === "overview" ? helpers.map((helper) => {
          const profile = profiles.find((p) => p.member_id === helper.id);
          const todayException = exceptions.find((e) => e.member_id === helper.id && e.on_date === today);
          const expected = expectedToday(helper.id);
          const owned = responsibilities.filter((r) => r.primary_member_id === helper.id);
          const nextAbsence = exceptions.find((e) => e.member_id === helper.id && !e.available && e.on_date > today);
          return (
            <Card key={helper.id} className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar name={helper.displayName} size="lg" badge="🤝" />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold">{helper.displayName}</p>
                  <p className="text-xs text-[var(--wh-foreground-muted)]">{profile ? `${profile.engagement} help` : "Househelper"}{profile?.started_on ? ` · since ${formatDate(timezone, new Date(profile.started_on))}` : ""}</p>
                </div>
                <Badge tone={expected ? "handled" : "neutral"}>{expected ? "Expected today" : todayException ? "Away today" : "Not today"}</Badge>
              </div>
              {todayException?.reason ? <p className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-attention-soft)] px-3 py-2 text-xs text-[var(--wh-attention)]">{todayException.reason}</p> : null}
              <div>
                <p className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">Usual days</p>
                <ul className="flex gap-1.5">
                  {DAYS.map((day, index) => {
                    const on = windows.some((w) => w.member_id === helper.id && w.day_of_week === index);
                    return <li key={day} className={`grid size-9 place-items-center rounded-full text-[0.6875rem] font-semibold ${on ? "bg-[var(--wh-primary)] text-[var(--wh-primary-foreground)]" : "bg-[var(--wh-surface-muted)] text-[var(--wh-foreground-subtle)]"}`}>{day.slice(0, 2)}</li>;
                  })}
                </ul>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--wh-foreground-subtle)] uppercase">Looks after</p>
                {owned.length === 0 ? <p className="text-sm text-[var(--wh-foreground-muted)]">No responsibilities assigned yet.</p> : (
                  <ul className="flex flex-wrap gap-1.5">
                    {owned.map((r) => <li key={r.outcome_key} className="rounded-[var(--wh-radius-pill)] bg-[var(--wh-surface-muted)] px-2.5 py-1 text-xs font-medium">{nameOfOutcome(r)}</li>)}
                  </ul>
                )}
              </div>
              {nextAbsence ? <p className="flex items-center gap-2 text-xs text-[var(--wh-foreground-muted)]"><CalendarOff aria-hidden className="size-3.5" /> Away {formatDate(timezone, new Date(nextAbsence.on_date), "long")}{nextAbsence.reason ? ` — ${nextAbsence.reason}` : ""}</p> : null}
            </Card>
          );
        }) : null}

        {active === "schedule" ? (
          <>
            <section>
              <SectionHeader title="Leave and changes" count={exceptions.length} />
              {exceptions.length === 0 ? (
                <EmptyState icon={CalendarDays} tone="people" title="No changes coming up" description="Days off and extra days appear here. Tell WonderHome — “Sunita won't be here tomorrow” — and it re-checks what she normally handles." action={<PillLink href="/ai?q=Sunita%20won%27t%20be%20here%20tomorrow.">Record leave</PillLink>} />
              ) : (
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {exceptions.map((exception) => (
                      <ActionRow key={`${exception.member_id}-${exception.on_date}`} icon={exception.available ? CalendarDays : CalendarOff} tone="people" title={`${nameOf(exception.member_id) ?? "Helper"} · ${formatDate(timezone, new Date(exception.on_date), "long")}`} meta={exception.reason ?? (exception.available ? "Extra day" : "Away")} action={<Badge tone={exception.available ? "handled" : "attention"}>{exception.available ? "Extra" : "Away"}</Badge>} />
                    ))}
                  </ul>
                </Card>
              )}
            </section>
            <section>
              <SectionHeader title="Weekly pattern" />
              <Card className="p-2">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {helpers.map((helper) => {
                    const own = windows.filter((w) => w.member_id === helper.id).sort((a, b) => a.day_of_week - b.day_of_week);
                    return <ActionRow key={helper.id} icon={CalendarDays} tone="people" title={helper.displayName} meta={own.length === 0 ? "No pattern recorded" : own.map((w) => `${DAYS[w.day_of_week]} ${w.start_time.slice(0, 5)}–${w.end_time.slice(0, 5)}`).join(" · ")} />;
                  })}
                </ul>
              </Card>
            </section>
          </>
        ) : null}

        {active === "tasks" ? (
          <>
            <Card className="flex items-start gap-3 bg-[var(--wh-primary-soft)]/50 p-4">
              <ListChecks aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--wh-primary)]" />
              <p className="text-sm text-[var(--wh-foreground-muted)]">These are outcomes, not chores to tick. Normal work needs no update from anyone; only a change — leave, something broken, an exception — needs a word.</p>
            </Card>
            {responsibilities.filter((r) => r.primary_member_id && helperIds.has(r.primary_member_id)).length === 0 ? (
              <EmptyState icon={ListChecks} title="Nothing assigned yet" description="Assign outcomes to your helper under Responsibilities, with a backup for the days they are away." action={<PillLink href="/household/responsibilities">Responsibilities</PillLink>} />
            ) : (
              <Card className="p-2">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {responsibilities.filter((r) => r.primary_member_id && helperIds.has(r.primary_member_id)).map((r) => (
                    <ActionRow key={r.outcome_key} icon={ListChecks} tone="primary" title={nameOfOutcome(r)} meta={`${nameOf(r.primary_member_id) ?? "Helper"}${r.backup_member_id ? ` · backup ${nameOf(r.backup_member_id)}` : " · no backup yet"}`} action={r.backup_member_id ? undefined : <Badge tone="attention">Needs backup</Badge>} />
                  ))}
                </ul>
              </Card>
            )}
          </>
        ) : null}

        <QuoteCard>Support that keeps home running.</QuoteCard>
      </div>
    </AppShell>
  );
}

function nameOfOutcome(row: ResponsibilityRow): string {
  const embedded = Array.isArray(row.playbook_items) ? row.playbook_items[0] : row.playbook_items;
  return embedded?.name ?? row.outcome_key.replace(/[._]/g, " ");
}
