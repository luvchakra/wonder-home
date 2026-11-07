import { House, ShieldCheck, Users } from "lucide-react";

import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { operationsSummary } from "@wonderhome/core/platform/admin";
import { MetricGrid } from "@wonderhome/core/ui/metric-card";

import { platformStaff } from "../../_lib/platform-staff";
import { PageBody, PageTitle, Panel } from "../_ui/page-title";

export const dynamic = "force-dynamic";
export const metadata = { title: "Households & people · Platform admin", robots: { index: false, follow: false } };

/**
 * Totals only (owner, 2026-11-07: "read-only aggregate by default, no
 * household content"). A count cannot become a window into one family; looking
 * at one household needs a time-boxed support grant, which is its own audited step.
 */
export default async function PlatformHouseholdsPage() {
  const staff = await platformStaff("operations.read");
  if (!staff) return null; // the layout has already answered 404
  const admin = adminClientFor(adminGrant.platformAdmin(staff, "count households and people"));

  const [summary, plans] = await Promise.all([operationsSummary(admin), admin.from("plans").select("key, name").order("sort_order").limit(20)]);
  const planRows = (plans.data ?? []) as { key: string; name: string }[];
  const byPlan = await Promise.all(
    planRows.map(async (plan) => ({
      ...plan,
      count: (await admin.from("household_subscriptions").select("household_id", { count: "exact", head: true }).eq("plan_key", plan.key)).count ?? 0,
    })),
  );

  return (
    <PageBody>
      <PageTitle title="Households & people" subtitle="How many families use WonderHome, and on which plan. Totals only: nothing here opens a household." />
      <MetricGrid
        metrics={[
          { label: "Households", value: summary.households, icon: House, tone: "home" },
          { label: "People", value: summary.members, icon: Users, tone: "people" },
          { label: "Open support grants", value: summary.activeSupportGrants, icon: ShieldCheck, tone: "health" },
        ]}
      />
      <Panel title="By plan" description="Households on each plan today.">
        <ul className="space-y-2">
          {byPlan.map((plan) => (
            <li key={plan.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 break-words font-semibold">{plan.name}</span>
              <span className="tabular-nums">{plan.count}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </PageBody>
  );
}
