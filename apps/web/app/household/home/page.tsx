import { CircleCheck, PawPrint, Shirt, Wrench } from "lucide-react";

import { homeAgenda } from "@wonderhome/core/home/repository";
import { isHouseholdAdmin } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { MetricGrid } from "@wonderhome/core/ui/metric-card";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState, ErrorState } from "@wonderhome/core/ui/states";

import { AgendaRow } from "../../_components/agenda-row";
import { AddAssetButton, RaiseServiceRequestButton } from "../../_components/home-forms";
import { requireSession } from "../../_lib/session";

export const metadata = { title: "Home & Upkeep" };
export const dynamic = "force-dynamic";

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
  const admin = isHouseholdAdmin(membership);

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

        <MetricGrid
          metrics={[
            { label: "Needs you", value: needsYou, icon: Wrench, tone: "attention" },
            { label: "On track", value: Math.max(0, agenda.checked - needsYou), icon: CircleCheck, tone: "handled" },
            { label: "Laundry", value: agenda.laundry.length, icon: Shirt, tone: "care" },
            { label: "Pets", value: agenda.pets.length, icon: PawPrint, tone: "care" },
          ]}
        />

        {sections.length === 0 ? (
          <EmptyState
            icon={CircleCheck}
            tone="handled"
            title="Nothing needs you"
            description={agenda.checked === 0 ? "Add an appliance or raise a request above, or tell WonderHome about the house — either way, it keeps an eye on it from here." : "Everything is serviced, stocked and on schedule. WonderHome will say something when that changes."}
          />
        ) : (
          sections.map((section) => (
            <section key={section.title}>
              <SectionHeader title={section.title} count={section.items.length} />
              <Card className="p-2">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {section.items.map((item) => <AgendaRow key={item.subjectKey} item={item} href="/household/home" />)}
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
