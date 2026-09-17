import { redirect } from "next/navigation";

import { createClient } from "@wonderhome/core/db/server";
import { homeAgenda } from "@wonderhome/core/home/repository";
import { listMemberships } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Alert } from "@wonderhome/core/ui/alert";
import { Card } from "@wonderhome/core/ui/card";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { StatChips } from "@wonderhome/core/ui/stat-chips";

import { AgendaRow } from "../../_components/agenda-row";

/**
 * Home & upkeep (module 13).
 *
 * The screen shows what needs a person and nothing else — no inventory, no
 * progress bars, no list of everything the household owns. When the house is
 * working, this page says so in one line, and that is the intended state most
 * days rather than an empty-state apology.
 */
export const metadata = { title: "Home & upkeep" };
export const dynamic = "force-dynamic";

export default async function HomeUpkeepPage() {
  const supabase = await createClient();
  const memberships = await listMemberships(supabase);

  // Not signed in, or signed in with no household: the same redirect either way,
  // because a page that explains what it would have shown is a disclosure.
  if (memberships.length === 0) redirect("/welcome");

  const membership = memberships[0]!;

  let agenda;
  try {
    agenda = await homeAgenda(supabase, membership.household.id);
  } catch {
    return (
      <AppShell active="more">
        <div className="space-y-4">
          <Header householdName={membership.household.name} />
          <Alert tone="risk">
            Something went wrong reading the household&apos;s upkeep. Nothing has been changed.
          </Alert>
        </div>
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

  return (
    <AppShell active="more">
      <div className="space-y-5">
        <Header householdName={membership.household.name} />

        <StatChips
          stats={[
            { label: "Needs you", value: needsYou, tone: "attention" },
            { label: "On track", value: Math.max(0, agenda.checked - needsYou), tone: "handled" },
            {
              label: "Urgent",
              value: sections
                .flatMap((section) => section.items)
                .filter((item) => item.riskLevel === "high").length,
              tone: "info",
            },
          ]}
        />

        {sections.length === 0 ? (
          <Card className="space-y-1 p-5 text-center">
            <p className="text-sm font-semibold">Nothing needs you</p>
            <p className="text-sm text-[var(--wh-foreground-muted)]">
              {agenda.checked === 0
                ? "Add an appliance, a pet or something that has to be clean by a deadline, and WonderHome will keep an eye on it."
                : "Everything is serviced, stocked and on schedule. WonderHome will say something when that changes."}
            </p>
          </Card>
        ) : (
          sections.map((section) => (
            <section key={section.title}>
              <SectionHeader title={section.title} count={section.items.length} />
              <Card className="p-2">
                <ul className="divide-y divide-[var(--wh-border)]">
                  {section.items.map((item) => (
                    <AgendaRow key={item.subjectKey} item={item} />
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

function Header({ householdName }: { householdName: string }) {
  return (
    <header className="space-y-1">
      <h1 className="text-[1.375rem] font-semibold tracking-tight">Home &amp; upkeep</h1>
      <p className="text-sm text-[var(--wh-foreground-muted)]">
        What {householdName} needs to deal with. Everything else is handled.
      </p>
    </header>
  );
}
