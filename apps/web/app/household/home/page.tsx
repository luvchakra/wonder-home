import { redirect } from "next/navigation";

import { createClient } from "@wonderhome/core/db/server";
import type { HomeAssessment } from "@wonderhome/core/home/assessment";
import { homeAgenda } from "@wonderhome/core/home/repository";
import { listMemberships } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Alert } from "@wonderhome/core/ui/alert";
import { Card, CardHeader, CardTitle } from "@wonderhome/core/ui/card";

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
        <Header householdName={membership.household.name} />
        <Alert tone="risk">
          Something went wrong reading the household&apos;s upkeep. Nothing has been changed.
        </Alert>
      </AppShell>
    );
  }

  const sections = [
    { title: "Maintenance", items: agenda.maintenance },
    { title: "Service requests", items: agenda.services },
    { title: "Laundry", items: agenda.laundry },
    { title: "Pets", items: agenda.pets },
  ].filter((section) => section.items.length > 0);

  return (
    <AppShell active="more">
      <div className="space-y-4">
        <Header householdName={membership.household.name} />

        {sections.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Nothing needs you</CardTitle>
            </CardHeader>
            <p className="text-sm text-[var(--wh-foreground-muted)]">
              Everything is serviced, stocked and on schedule. WonderHome will say something when
              that changes.
            </p>
          </Card>
        ) : (
          sections.map((section) => (
            <Card key={section.title}>
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
              </CardHeader>
              <ul className="divide-y divide-[var(--wh-border)]">
                {section.items.map((item) => (
                  <AgendaRow key={item.subjectKey} item={item} />
                ))}
              </ul>
            </Card>
          ))
        )}
      </div>
    </AppShell>
  );
}

function Header({ householdName }: { householdName: string }) {
  return (
    <header className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">Home &amp; upkeep</h1>
      <p className="text-sm text-[var(--wh-foreground-muted)]">
        What {householdName} needs to deal with. Everything else is handled.
      </p>
    </header>
  );
}

const RISK_LABEL: Record<HomeAssessment["riskLevel"], string> = {
  high: "Needs attention",
  medium: "Soon",
  low: "Worth knowing",
  none: "",
};

function AgendaRow({ item }: { item: HomeAssessment }) {
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="space-y-0.5">
        <p className="text-sm">{item.reason}</p>
        {item.action ? (
          <p className="text-xs text-[var(--wh-foreground-subtle)]">
            {describeAction(item.action.action)}
            {item.dueOn ? ` · due ${item.dueOn}` : ""}
          </p>
        ) : null}
      </div>
      {item.riskLevel !== "none" ? (
        <span className="shrink-0 rounded-full bg-[var(--wh-surface-muted)] px-2 py-0.5 text-xs text-[var(--wh-foreground-muted)]">
          {RISK_LABEL[item.riskLevel]}
        </span>
      ) : null}
    </li>
  );
}

/** The action in the family's words rather than the engine's. */
function describeAction(action: string): string {
  switch (action) {
    case "book_service":
      return "Book a service";
    case "review_coverage":
      return "Check the warranty";
    case "claim_cover":
      return "Claim under warranty";
    case "chase_provider":
      return "Chase the provider";
    case "do_next_action":
      return "Waiting on us";
    case "set_next_action":
      return "Decide the next step";
    case "confirm_visit":
      return "Confirm the visit happened";
    case "start_now":
      return "Start it now";
    case "dry_indoors":
      return "Dry it indoors";
    case "find_cover":
      return "Find someone to cover";
    case "find_alternative":
      return "Find something else";
    case "order_supplies":
      return "Order supplies";
    case "book_appointment":
      return "Book an appointment";
    case "give_medication":
      return "Give the medication";
    case "arrange_grooming":
      return "Arrange grooming";
    case "plan_walk":
      return "Plan a walk";
    default:
      return action.replace(/_/g, " ");
  }
}
