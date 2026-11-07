import { notFound } from "next/navigation";

import { loadPlanSnapshots } from "@wonderhome/core/billing/plan-edit";
import { platformCan } from "@wonderhome/core/platform/admin";
import { translatorFor } from "@wonderhome/core/i18n/translate";
import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";

import { platformStaff } from "../../_lib/platform-staff";
import { PlanEditor } from "./plan-editor";
import { PageBody, PageTitle, Panel } from "../_ui/page-title";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plans & billing · Platform admin", robots: { index: false, follow: false } };

type Experiment = { key: string; feature_key: string; description: string; plan_keys: string[]; treatment_percent: number; active?: boolean };

/** Every plan's prices and features, and the running experiments. Prices are ours (docs/external-providers.md). */
export default async function PlatformPlansPage() {
  const staff = await platformStaff("subscription.manage");
  if (!staff) notFound();
  const admin = adminClientFor(adminGrant.platformAdmin(staff, "show plans, prices and experiments"));

  const t = await translatorFor("en");
  const canEdit = platformCan(staff, "plans.edit");
  const [plans, experiments] = await Promise.all([loadPlanSnapshots(admin), admin.from("entitlement_experiments").select("*").limit(50)]);
  // The member plan list's own words, so the preview reads exactly as they do.
  const words = {
    early: t("settingsPage.plan.earlyAccess"),
    perMonth: t("settingsPage.plan.perMonth", { price: "{price}" }),
    perYear: t("settingsPage.plan.perYear", { price: "{price}" }),
    saveNote: t("settingsPage.plan.saveNote", { perMonth: "{perMonth}", percent: "{percent}" }),
  };

  return (
    <PageBody>
      <PageTitle
        title="Plans & billing"
        subtitle={canEdit ? "Each plan is shown as members see it. Edit it in place; a household moves to a paid plan only after a verified payment." : "Each plan as members see it. Only the platform owner can change a plan."}
      />
      <Panel title="Plans" description="The same card members see under Settings → Your plan.">
        <div className="space-y-3">
          {plans.map((plan) => (
            <PlanEditor key={plan.key} plan={plan} words={words} canEdit={canEdit} />
          ))}
        </div>
      </Panel>
      <Panel title="Experiments" description="A share of households on a plan trying a feature differently.">
        {((experiments.data ?? []) as Experiment[]).length === 0 ? (
          <p className="text-sm text-[var(--wh-foreground-muted)]">No experiment is running.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {((experiments.data ?? []) as Experiment[]).map((experiment) => (
              <li key={experiment.key}>
                <p className="font-semibold break-words">{experiment.key}</p>
                <p className="text-[var(--wh-foreground-muted)]">
                  {experiment.description} {experiment.treatment_percent}% of {experiment.plan_keys.join(", ")} · {experiment.feature_key}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PageBody>
  );
}
