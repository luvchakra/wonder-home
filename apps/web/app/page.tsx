import { redirect } from "next/navigation";

import { createClient } from "@wonderhome/core/db/server";
import { homeAgenda, type HomeAgenda } from "@wonderhome/core/home/repository";
import { ageBandFor, parseDateOfBirth } from "@wonderhome/core/identity/age";
import { listMemberships } from "@wonderhome/core/identity/households";
import { buildPersonalView } from "@wonderhome/core/identity/views";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { NavRow } from "@wonderhome/core/ui/action-row";
import type { IconTone } from "@wonderhome/core/ui/icon-tile";
import { Button, ButtonLink } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { StatChips } from "@wonderhome/core/ui/stat-chips";
import {
  CalendarHeart,
  GraduationCap,
  House,
  ListChecks,
  Plug,
  Settings2,
  Users,
  Wallet,
} from "lucide-react";
import type { ComponentType } from "react";

import { signOut } from "./(auth)/actions";
import { AgendaRow } from "./_components/agenda-row";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <SignedOutHome />;

  const memberships = await listMemberships(supabase);
  if (memberships.length === 0) redirect("/welcome");

  const membership = memberships[0]!;

  const { data: memberRow } = await supabase
    .from("household_members")
    .select("date_of_birth")
    .eq("id", membership.memberId)
    .maybeSingle();

  // The view is assembled server-side: a section this member may not see is
  // absent from what reaches the browser, not hidden once it gets there.
  const view = buildPersonalView(
    membership,
    ageBandFor(parseDateOfBirth(memberRow?.date_of_birth as string | null)),
  );

  // A failure to read the home domain must not take the whole screen down: the
  // greeting and the way into the rest of the app still work without it.
  let agenda: HomeAgenda | null = null;
  try {
    agenda = await homeAgenda(supabase, membership.household.id);
  } catch {
    agenda = null;
  }

  const needsYou = agenda
    ? [...agenda.maintenance, ...agenda.services, ...agenda.laundry, ...agenda.pets]
    : [];

  return (
    <AppShell active="home">
      <div className="space-y-5">
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-[1.375rem] font-semibold tracking-tight">
              {view.tone === "child" ? `Hi ${view.displayName}!` : `Good day, ${view.displayName}`}
            </h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">
              {today(membership.household.timezone)}
            </p>
            <p className="text-xs text-[var(--wh-foreground-subtle)]">
              {view.householdName} · {view.roleLabel}
            </p>
          </div>
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-[var(--wh-radius-pill)] bg-[var(--wh-primary-soft)] text-sm font-semibold text-[var(--wh-primary)]"
          >
            {view.displayName.slice(0, 1).toUpperCase()}
          </span>
        </header>

        {agenda ? (
          <StatChips
            stats={[
              { label: "Needs you", value: needsYou.length, tone: "attention" },
              // Everything WonderHome looked at and found nothing to say about.
              // That silence is the product working, so it is worth counting.
              { label: "On track", value: agenda.checked - needsYou.length, tone: "handled" },
              {
                label: "Urgent",
                value: needsYou.filter((item) => item.riskLevel === "high").length,
                tone: "info",
              },
            ]}
          />
        ) : null}

        <section>
          <SectionHeader
            title="Needs your attention"
            count={needsYou.length}
            action={
              needsYou.length > 0 ? (
                <PillLink href="/household/home" tone="quiet">
                  View all
                </PillLink>
              ) : null
            }
          />
          <Card className="p-2">
            {needsYou.length === 0 ? (
              <p className="px-2 py-4 text-sm text-[var(--wh-foreground-muted)]">
                Nothing is waiting on you. WonderHome will say something when that changes.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--wh-border)]">
                {needsYou.slice(0, 4).map((item) => (
                  <AgendaRow key={item.subjectKey} item={item} />
                ))}
              </ul>
            )}
          </Card>
        </section>

        {view.sections.length > 0 ? (
          <section>
            <SectionHeader title="Your areas" />
            <Card className="p-2">
              <ul>
                {view.sections.map((section) => (
                  <NavRow
                    key={section.key}
                    href={section.href}
                    icon={AREA_PRESENTATION[section.key]?.icon ?? House}
                    tone={AREA_PRESENTATION[section.key]?.tone ?? "primary"}
                    title={section.label}
                    meta={section.purpose}
                  />
                ))}
              </ul>
            </Card>
          </section>
        ) : null}

        <QuoteCard>Small steps today, happier tomorrows.</QuoteCard>

        <form action={signOut}>
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </div>
    </AppShell>
  );
}

/**
 * One icon and one colour per area, matching the tiles used across the rest of
 * the product. An area whose key is not listed falls back to the house rather
 * than rendering nothing, since a new section should never break this screen.
 */
const AREA_PRESENTATION: Record<
  string,
  { icon: ComponentType<{ className?: string }>; tone: IconTone }
> = {
  school: { icon: GraduationCap, tone: "school" },
  school_all: { icon: GraduationCap, tone: "school" },
  bills: { icon: Wallet, tone: "money" },
  responsibilities: { icon: ListChecks, tone: "primary" },
  members: { icon: Users, tone: "people" },
  manage: { icon: Settings2, tone: "primary" },
  integrations: { icon: Plug, tone: "home" },
  family_time: { icon: CalendarHeart, tone: "care" },
};

/** The date as the household reads it, in the household's own time zone. */
function today(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: timezone,
    }).format(new Date());
  } catch {
    // A household with an unrecognised zone still gets a date, just not theirs.
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date());
  }
}

function SignedOutHome() {
  return (
    <AppShell active="home">
      <div className="space-y-5">
        <header className="space-y-1">
          <h1 className="text-[1.75rem] font-semibold tracking-tight">WonderHome</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            Happier homes. Brighter tomorrows.
          </p>
        </header>

        <Card className="space-y-4 p-5">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold tracking-tight text-balance">
              Less mental load. More family time.
            </h2>
            <p className="text-sm text-[var(--wh-foreground-muted)]">
              WonderHome manages household outcomes quietly and asks you only when a decision
              genuinely needs a person.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <ButtonLink href="/sign-up" className="w-full">
              Get started
            </ButtonLink>
            <ButtonLink href="/sign-in" variant="quiet" className="w-full">
              I already have an account
            </ButtonLink>
          </div>
        </Card>

        <ul className="grid grid-cols-4 gap-2 text-center text-[0.6875rem] text-[var(--wh-foreground-subtle)]">
          {["Plan", "Coordinate", "Simplify", "Together"].map((word) => (
            <li key={word}>{word}</li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
