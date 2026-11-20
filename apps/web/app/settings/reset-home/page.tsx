import { notFound } from "next/navigation";
import { CheckCircle2, Download, ShieldAlert, Trash2 } from "lucide-react";

import { hasHealthContent } from "@wonderhome/core/household/full-export";
import { isHouseholdOwner } from "@wonderhome/core/household/reset-policy";
import { resetPreview } from "@wonderhome/core/household/reset-repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";

import { staffStepUp } from "../../_lib/platform-step-up";
import { requireSession } from "../../_lib/session";
import { resetHomeAction } from "./actions";
import { downloadedLabels, downloadLabels, resetLabels, stepUpLabels } from "./labels";
import { DownloadedNote, DownloadFullData, GoogleConfirm, ResetHomeForm } from "./reset-forms";

export const metadata = { title: "Reset home" };
export const dynamic = "force-dynamic";

/**
 * Reset home (story 15-014): the owner's way to start the home again.
 *
 * Three steps, in the order a careful person takes them: download a copy
 * (optional; the screen says whether one was made in this session), read
 * exactly what goes and what stays, then confirm with the home's name and a
 * fresh step-up. Anyone but the owner gets "not found": the screen, like the
 * Danger zone on Settings, exists only for them.
 */
export default async function ResetHomePage() {
  const session = await requireSession("/settings/reset-home");
  const { supabase, membership, viewer, secondary } = session;
  if (!isHouseholdOwner(membership)) notFound();

  const householdId = membership.household.id;
  const household = membership.household.name;
  const { t, preferences } = session.locale;
  const [preview, stepUp, healthPresent] = await Promise.all([
    resetPreview(supabase, householdId, membership.household.ownerMemberId),
    staffStepUp(),
    hasHealthContent(supabase, householdId).catch(() => true),
  ]);

  const goes = [
    preview.otherMembers > 0 ? t("resetHome.goes.members", { count: preview.otherMembers }) : null,
    preview.pendingInvitations > 0 ? t("resetHome.goes.invites", { count: preview.pendingInvitations }) : null,
    t("resetHome.goes.records"),
    t("resetHome.goes.connections"),
  ].filter((line): line is string => line !== null);
  const stays = [t("resetHome.stays.account"), t("resetHome.stays.plan"), t("resetHome.stays.audit"), t("resetHome.stays.name")];

  return (
    <AppShell
      active="more"
      viewer={viewer}
      secondary={secondary}
      pathname="/settings/reset-home"
      back={{ href: "/settings#danger-zone", label: t("settingsPage.backToSettings") }}
      title={t("resetHome.page.title")}
    >
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("resetHome.page.heading", { household })}</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("resetHome.page.lede")}</p>
        </header>

        {stepUp.method === "google" ? (
          <Card>
            <GoogleConfirm stepUp={stepUp} next="/settings/reset-home" labels={stepUpLabels(t)} language={preferences.language} />
          </Card>
        ) : null}

        <section id="download" className="scroll-mt-20">
          <SectionHeader title={t("resetHome.step1.title")} />
          <Card className="space-y-4">
            <div className="flex items-start gap-3">
              <IconTile icon={Download} tone="care" />
              <div className="min-w-0 flex-1 space-y-1.5 text-sm text-[var(--wh-foreground-muted)]">
                <p>{t("resetHome.step1.body")}</p>
                <p>{t("resetHome.download.meta")}</p>
              </div>
            </div>
            <DownloadedNote householdId={householdId} labels={downloadedLabels(t)} language={preferences.language} />
            <DownloadFullData householdId={householdId} stepUp={stepUp} next="/settings/reset-home" labels={downloadLabels(t)} language={preferences.language} googleConfirmHere={false} askHealthPassword={healthPresent} />
          </Card>
        </section>

        <section>
          <SectionHeader title={t("resetHome.step2.title")} />
          <Card className="space-y-5">
            <div className="flex items-start gap-3">
              <IconTile icon={Trash2} tone="risk" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t("resetHome.goes.title")}</p>
                <ul className="mt-1.5 list-disc space-y-1.5 ps-4 text-sm text-[var(--wh-foreground-muted)]">
                  {goes.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <IconTile icon={CheckCircle2} tone="handled" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t("resetHome.stays.title")}</p>
                <ul className="mt-1.5 list-disc space-y-1.5 ps-4 text-sm text-[var(--wh-foreground-muted)]">
                  {stays.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        </section>

        <section>
          <SectionHeader title={t("resetHome.step3.title")} />
          <Card className="space-y-4 border-[var(--wh-risk)]">
            <div className="flex items-start gap-3">
              <IconTile icon={ShieldAlert} tone="risk" />
              <p data-testid="reset-final" className="min-w-0 flex-1 text-sm font-medium">
                {t("resetHome.final", { count: preview.otherMembers, household })}
              </p>
            </div>
            <ResetHomeForm action={resetHomeAction} householdId={householdId} householdName={household} stepUp={stepUp} labels={resetLabels(t, household)} />
          </Card>
        </section>

        <QuoteCard>{t("resetHome.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
