import { CircleCheck, CloudRain, PawPrint, Shirt, Wrench } from "lucide-react";

import type { HomeAssessment } from "@wonderhome/core/home/assessment";
import { homeAgenda } from "@wonderhome/core/home/repository";
import { isHouseholdAdmin } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import {
  ExpandableMetricGrid,
  MetricDetailEmpty,
  type ExpandableMetric,
} from "@wonderhome/core/ui/expandable-metric-card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState, ErrorState } from "@wonderhome/core/ui/states";

import { AddAssetButton, RaiseServiceRequestButton } from "../../_components/home-forms";
import { AgendaExpandableRow } from "../../_components/agenda-expandable-row";
import { requireSession } from "../../_lib/session";

export const metadata = { title: "Home & Upkeep" };
export const dynamic = "force-dynamic";

/**
 * What a metric card's chevron opens onto: the real assessments behind its
 * count, reusing the exact rows the sections below already render (never a
 * second, thinner list invented for the panel) — capped at 4 with a plain
 * note for the rest, since "view all" is this same page, not another one.
 */
function agendaDetail(items: readonly HomeAssessment[], timezone: string, emptyText: string) {
  if (items.length === 0) return <MetricDetailEmpty>{emptyText}</MetricDetailEmpty>;
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {items.slice(0, 4).map((item) => (
          <AgendaExpandableRow key={item.subjectKey} item={item} timezone={timezone} />
        ))}
      </ul>
      {items.length > 4 ? (
        <p className="px-1 text-xs text-[var(--wh-foreground-subtle)]">+{items.length - 4} more below</p>
      ) : null}
    </div>
  );
}

/**
 * Home & upkeep (module 13). The screen shows what needs a person and
 * nothing else — no inventory, no progress bars. When the house is working,
 * this page says so in one line, and that is the intended state most days.
 */
export default async function HomeUpkeepPage() {
  const session = await requireSession("/household/home");
  const { supabase, membership, view, viewer, secondary } = session;
  const shell = { active: "more" as const, viewer, secondary, pathname: "/household/home", back: { href: "/more", label: "Back" }, title: "Home & Upkeep" };

  if (view.tone === "child") {
    return (
      <AppShell {...shell}>
        <EmptyState icon={Wrench} tone="home" title="Not available to you" description="Home upkeep is for the adults in the household." />
      </AppShell>
    );
  }

  let agenda;
  try {
    agenda = await homeAgenda(supabase, membership.household.id);
  } catch {
    return (
      <AppShell {...shell}>
        <ErrorState title="Upkeep could not be loaded" retryHref="/household/home" />
      </AppShell>
    );
  }

  const sections = [
    { title: "Maintenance", items: agenda.maintenance },
    { title: "Service requests", items: agenda.services },
    { title: "Laundry", items: agenda.laundry },
    { title: "Pets", items: agenda.pets },
  ].filter((section) => section.items.length > 0);
  const needsYou = sections.reduce((total, section) => total + section.items.length, 0);
  const handledCount = Math.max(0, agenda.checked - needsYou);
  const admin = isHouseholdAdmin(membership);
  const timezone = membership.household.timezone;
  const needsYouItems = sections.flatMap((section) => section.items);
  const weatherChangesPlans =
    agenda.weather.status === "ready" && (!agenda.weather.drying.outdoorViable || agenda.weather.drying.hoursMultiplier > 1);

  const metrics: ExpandableMetric[] = [
    {
      label: "Need you",
      value: needsYou,
      icon: <IconTile icon={Wrench} tone="attention" size="sm" />,
      details: agendaDetail(needsYouItems, timezone, "Nothing needs you right now."),
    },
    {
      label: "Handled",
      value: handledCount,
      icon: <IconTile icon={CircleCheck} tone="handled" size="sm" />,
      details: (
        <MetricDetailEmpty>
          {handledCount === 0
            ? "Nothing checked yet — add an asset or raise a request to get started."
            : `${handledCount} of ${agenda.checked} things WonderHome checked need nothing from you.`}
        </MetricDetailEmpty>
      ),
    },
    {
      label: "Laundry",
      value: agenda.laundry.length,
      icon: <IconTile icon={Shirt} tone="care" size="sm" />,
      details: agendaDetail(agenda.laundry, timezone, "Laundry is caught up."),
    },
    {
      label: "Pets",
      value: agenda.pets.length,
      icon: <IconTile icon={PawPrint} tone="care" size="sm" />,
      details: agendaDetail(agenda.pets, timezone, "Nothing pet-related needs you."),
    },
  ];

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise flex flex-wrap items-end justify-between gap-3">
          <div className="hidden lg:block">
            <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Home &amp; upkeep</h1>
            <p className="text-sm text-[var(--wh-foreground-muted)]">What {membership.household.name} needs to deal with. Everything else is handled.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {admin ? <AddAssetButton householdId={membership.household.id} /> : null}
            <RaiseServiceRequestButton householdId={membership.household.id} />
          </div>
        </header>

        <ExpandableMetricGrid pairs metrics={metrics} />

        {/* Weather speaks only when it changes a decision (story 17-007): a
            fine day, an outage or weather switched off says nothing here. */}
        {weatherChangesPlans ? (
          <Card className="flex items-start gap-3 p-4">
            <IconTile icon={CloudRain} tone="money" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium break-words">Weather{agenda.weather.place ? ` in ${agenda.weather.place}` : ""}</p>
              <p className="text-sm text-[var(--wh-foreground-muted)]">{agenda.weather.drying.reason}{agenda.laundry.length > 0 ? " Laundry below is planned around it." : ""}</p>
            </div>
          </Card>
        ) : null}

        {sections.length === 0 ? (
          <EmptyState
            icon={CircleCheck}
            tone="handled"
            title="All quiet — nothing needs you right now"
            description={agenda.checked === 0 ? "Add an appliance or raise a request above, or tell WonderHome about the house — either way, it keeps an eye on it from here." : "Everything is serviced, stocked and on schedule. WonderHome will say something when that changes."}
          />
        ) : (
          sections.map((section) => (
            <section key={section.title}>
              <SectionHeader title={section.title} count={section.items.length} />
              <Card className="p-2">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {section.items.map((item) => (
                    <AgendaExpandableRow key={item.subjectKey} item={item} timezone={timezone} />
                  ))}
                </ul>
              </Card>
            </section>
          ))
        )}

        <QuoteCard>A calm home today, a brighter tomorrow.</QuoteCard>
      </div>
    </AppShell>
  );
}
