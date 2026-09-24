import { CircleCheck, Clock3, CircleX } from "lucide-react";

import { loadBillingTerms } from "@wonderhome/core/billing/account";
import { listPlans } from "@wonderhome/core/billing/repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ButtonLink } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";

import { RefreshWhileWaiting } from "../../../_components/refresh-while-waiting";
import { formatDate, requireSession } from "../../../_lib/session";

export const metadata = { title: "Payment" };
export const dynamic = "force-dynamic";

/**
 * Where a provider sends the household back (story 20-010).
 *
 * Coming back is not proof of paying: the plan changes only when the
 * provider's verified webhook says so (spec §8). So this page reads the
 * household's latest checkout and subscription and says what is true — done,
 * still being confirmed, or nothing taken.
 */
export default async function PaymentConfirmedPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const [{ checkout }, session] = await Promise.all([searchParams, requireSession("/settings/plan/confirmed")]);
  const { supabase, membership, viewer, secondary } = session;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;

  const [plans, terms, { data: intentRow }] = await Promise.all([
    listPlans(supabase).catch(() => []),
    loadBillingTerms(supabase, householdId).catch(() => null),
    supabase.from("billing_intents").select("plan_key, status").eq("household_id", householdId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const intent = intentRow as { plan_key: string; status: string } | null;
  const wanted = plans.find((plan) => plan.key === intent?.plan_key)?.name ?? "your new plan";
  const done = Boolean(intent && (intent.status === "completed" || (terms?.planKey === intent.plan_key && terms?.provider)));
  const cancelled = checkout === "cancelled";

  const state = cancelled
    ? { icon: CircleX, tone: "neutral" as const, title: "No payment was taken", body: "You left the payment page before paying. Your plan is as it was." }
    : done
      ? {
          icon: CircleCheck,
          tone: "handled" as const,
          title: `You're on ${wanted}`,
          body: terms?.periodEnd
            ? `The payment is confirmed. ${wanted} renews on ${formatDate(timezone, terms.periodEnd, "long")}.`
            : "The payment is confirmed, and everything in the plan is ready to use.",
        }
      : {
          icon: Clock3,
          tone: "attention" as const,
          title: "Confirming your payment…",
          body: `We're waiting for the payment provider to confirm it — usually under a minute. You can leave this page: ${wanted} starts on its own once it's confirmed, and nothing is charged twice.`,
        };

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings/plan" back={{ href: "/settings/plan", label: "Back to your plan" }} title="Payment">
      <div className="space-y-6">
        {!cancelled && !done ? <RefreshWhileWaiting /> : null}
        <Card className="flex flex-col items-center gap-3 p-8 text-center" >
          <IconTile icon={state.icon} tone={state.tone} size="lg" />
          <h1 className="text-2xl font-bold tracking-tight" role="status">{state.title}</h1>
          <p className="max-w-md text-sm text-[var(--wh-foreground-muted)]">{state.body}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <ButtonLink href="/settings/plan">Back to your plan</ButtonLink>
            {done ? <ButtonLink href="/settings/plan/billing" variant="secondary">See the receipt</ButtonLink> : null}
          </div>
        </Card>
        <QuoteCard>Less mental load. More family time.</QuoteCard>
      </div>
    </AppShell>
  );
}
