import { ChevronRight, House, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";

import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { operationsSummary } from "@wonderhome/core/platform/admin";
import { planBreakdown, type PlanCount } from "@wonderhome/core/platform/directory";
import { MetricGrid } from "@wonderhome/core/ui/metric-card";

import { platformOwner, platformStaff } from "../../_lib/platform-staff";
import { PageBody, PageTitle, Panel } from "../_ui/page-title";

export const dynamic = "force-dynamic";
export const metadata = { title: "Households & people · Platform admin", robots: { index: false, follow: false } };

/**
 * Totals for every staff member; the lists behind them (account-level only,
 * never household content) for the platform owner alone, each view audited
 * (owner, 2026-11-07). Free includes households with no plan record yet, so
 * the plans add up to the households.
 */
export default async function PlatformHouseholdsPage() {
  const staff = await platformStaff("operations.read");
  if (!staff) return null; // the layout has already answered 404
  const owner = await platformOwner();
  const admin = adminClientFor(adminGrant.platformAdmin(staff, "count households and people"));

  const [summary, plans] = await Promise.all([operationsSummary(admin), owner ? planBreakdown(admin, owner) : Promise.resolve<PlanCount[] | null>(null)]);
  const link = (href: string) => (owner ? href : undefined);

  return (
    <PageBody>
      <PageTitle
        title="Households & people"
        subtitle={
          owner
            ? "How many families use WonderHome and on which plan. Tap a number to see who is behind it: account details only (plan, size, dates, sign-in email). A family's own content is never shown."
            : "How many families use WonderHome, and on which plan. Totals only: nothing here opens a household."
        }
      />
      <MetricGrid
        metrics={[
          { label: "Households", value: summary.households, icon: House, tone: "home", href: link("/platform-admin/households/all") },
          { label: "People", value: summary.members, icon: Users, tone: "people", href: link("/platform-admin/households/people") },
          { label: "Open support grants", value: summary.activeSupportGrants, icon: ShieldCheck, tone: "health", href: link("/platform-admin/households/grants") },
        ]}
      />
      {plans ? (
        <Panel title="By plan" description={`Households on each plan today; together they make the ${summary.households}.`}>
          <ul className="space-y-1">
            {plans.map((plan) => (
              <li key={plan.key}>
                <Link href={`/platform-admin/households/all?plan=${plan.key}`} className="flex min-h-11 items-center justify-between gap-3 rounded-[var(--wh-radius-sm)] px-2 text-sm hover:bg-[var(--wh-primary-soft)]">
                  <span className="min-w-0 break-words">
                    <span className="font-semibold">{plan.name}</span>
                    {plan.noRecord > 0 ? <span className="block text-[var(--wh-foreground-muted)]">{plan.noRecord} of these have no plan record yet, so they are on Free</span> : null}
                  </span>
                  <span className="flex items-center gap-1 tabular-nums">{plan.count}<ChevronRight aria-hidden className="size-4 text-[var(--wh-foreground-subtle)]" /></span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </PageBody>
  );
}
