import { redirect } from "next/navigation";

import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { listMemberships } from "@wonderhome/core/identity/households";
import { schoolAgenda } from "@wonderhome/core/school/repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Alert } from "@wonderhome/core/ui/alert";
import { Card } from "@wonderhome/core/ui/card";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { StatChips } from "@wonderhome/core/ui/stat-chips";

import { AgendaRow } from "../../_components/agenda-row";

/**
 * School (module 08).
 *
 * Deadlines that will not fit, and school messages that ask something. Not a
 * homework list: a child's whole term of work belongs to the child, and putting
 * it in front of a parent every day is the mental load this product removes.
 */
export const metadata = { title: "School" };
export const dynamic = "force-dynamic";

export default async function SchoolPage() {
  const supabase = await createClient();
  const memberships = await listMemberships(supabase);
  if (memberships.length === 0) redirect("/welcome");

  const membership = memberships[0]!;
  const entitlement = await may(supabase, membership.household.id, "school.connector");

  if (!entitlement.allowed) {
    return (
      <AppShell active="more">
        <div className="space-y-4">
          <Header householdName={membership.household.name} />
          <Card className="space-y-1 p-5">
            <p className="text-sm font-semibold">Not part of this plan</p>
            <p className="text-sm text-[var(--wh-foreground-muted)]">{entitlement.reason}</p>
          </Card>
        </div>
      </AppShell>
    );
  }

  let agenda;
  try {
    agenda = await schoolAgenda(supabase, membership.household.id);
  } catch {
    return (
      <AppShell active="more">
        <div className="space-y-4">
          <Header householdName={membership.household.name} />
          <Alert tone="risk">
            School work could not be loaded. Nothing has been changed.
          </Alert>
        </div>
      </AppShell>
    );
  }

  const needsYou = agenda.deadlines.length + agenda.messages.length;

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
              value: [...agenda.deadlines, ...agenda.messages].filter((item) => item.riskLevel === "high")
                .length,
              tone: "info",
            },
          ]}
        />

        {needsYou === 0 ? (
          <Card className="space-y-1 p-5 text-center">
            <p className="text-sm font-semibold">School is under control</p>
            <p className="text-sm text-[var(--wh-foreground-muted)]">
              {agenda.checked === 0
                ? "Connect a school account or add a piece of homework, and WonderHome will keep an eye on the deadlines."
                : "Every deadline fits in the time before it, and nothing from school is waiting on a reply."}
            </p>
          </Card>
        ) : (
          <>
            {agenda.deadlines.length > 0 ? (
              <section>
                <SectionHeader title="Deadlines at risk" count={agenda.deadlines.length} />
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {agenda.deadlines.map((item) => (
                      <AgendaRow key={item.subjectKey} item={item} />
                    ))}
                  </ul>
                </Card>
              </section>
            ) : null}

            {agenda.messages.length > 0 ? (
              <section>
                <SectionHeader title="From the school" count={agenda.messages.length} />
                <Card className="p-2">
                  <ul className="divide-y divide-[var(--wh-border)]">
                    {agenda.messages.map((item) => (
                      <AgendaRow key={item.subjectKey} item={item} />
                    ))}
                  </ul>
                </Card>
              </section>
            ) : null}
          </>
        )}

        <QuoteCard>Curious minds, brighter tomorrows.</QuoteCard>
      </div>
    </AppShell>
  );
}

function Header({ householdName }: { householdName: string }) {
  return (
    <header className="space-y-1">
      <h1 className="text-[1.375rem] font-semibold tracking-tight">School</h1>
      <p className="text-sm text-[var(--wh-foreground-muted)]">
        What {householdName} needs to deal with. The rest is the children&apos;s own.
      </p>
    </header>
  );
}
