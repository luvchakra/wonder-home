import Link from "next/link";
import { Clock, Download, ShieldCheck, Trash2 } from "lucide-react";

import { loadDataUse } from "@wonderhome/core/ai/privacy-repository";
import { buildPersonalView } from "@wonderhome/core/identity/views";
import { listPrivacyRequests } from "@wonderhome/core/privacy/repository";
import { DELETION_GRACE_DAYS } from "@wonderhome/core/privacy/retention";
import { latestVerification } from "@wonderhome/core/security/step-up-repository";
import { checkStepUp } from "@wonderhome/core/security/step-up";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";

import {
  cancelDeletionAction,
  confirmItIsYouAction,
  requestDeletionAction,
} from "../../(auth)/privacy-actions";
import {
  CancelDeletionForm,
  ConfirmItIsYouForm,
  DeletionForm,
  ExportForm,
} from "../../_components/privacy-forms";
import { formatDate, requireSession } from "../../_lib/session";
import {
  cancelDeletionLabels,
  confirmItIsYouLabels,
  dataUseLines,
  deletionFormLabels,
  exportFormLabels,
  exportLines,
  retentionRows,
} from "../../_lib/settings-labels";

export const metadata = { title: "Privacy" };
export const dynamic = "force-dynamic";

/**
 * The Privacy Centre (story 15-007).
 *
 * Four questions a household is entitled to a straight answer to: what leaves
 * here, how long you keep it, can I have a copy, and can I make you stop.
 *
 * Everything on this page is the real answer rather than a statement of
 * intent. The retention table is the same module the code reads; the export
 * description is generated from the sections the export actually contains; and
 * the two irreversible actions are gated on a step-up this page checks rather
 * than assumes.
 */
export default async function PrivacyCentrePage() {
  const session = await requireSession("/settings/privacy");
  const { supabase, membership, viewer, secondary } = session;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const view = buildPersonalView(membership);
  const now = new Date();

  const [dataUse, requests, exportProof, deletionProof] = await Promise.all([
    loadDataUse(supabase, householdId),
    listPrivacyRequests(supabase, householdId).catch(() => []),
    latestVerification(supabase, membership.memberId, "export"),
    latestVerification(supabase, membership.memberId, "deletion"),
  ]);

  const mayExport = checkStepUp(exportProof, "export", now).ok;
  const mayDelete = checkStepUp(deletionProof, "deletion", now).ok;
  const pendingDeletion = requests.find(
    (request) => request.kind === "deletion" && (request.status === "pending" || request.status === "ready"),
  );
  const isOwner = membership.roles.includes("head");
  const { t, format, preferences } = session.locale;
  // The link keeps its own styling wherever the sentence puts it.
  const [changeBefore, changeAfter] = t("settingsPage.privacy.changeIn", { link: "{link}" }).split("{link}");

  return (
    <AppShell
      active="more"
      viewer={viewer}
      secondary={secondary}
      pathname="/settings/privacy"
      back={{ href: "/settings", label: t("settingsPage.backToSettings") }}
      title={t("settingsPage.privacy.title")}
    >
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("settingsPage.privacy.heading")}</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("settingsPage.privacy.lede")}</p>
        </header>

        <section>
          <SectionHeader title={t("settingsPage.ai.section.share")} />
          <Card className="space-y-3">
            <div className="flex items-start gap-3">
              <IconTile icon={ShieldCheck} tone="primary" />
              <ul className="min-w-0 flex-1 space-y-1.5">
                {dataUseLines(t, dataUse).map((line) => (
                  <li key={line} className="text-sm text-[var(--wh-foreground-muted)]">{line}</li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-[var(--wh-foreground-subtle)]">
              {changeBefore}
              <Link href="/settings/ai" className="font-medium text-[var(--wh-primary)] underline-offset-2 hover:underline">
                {t("settingsPage.privacy.changeInLink")}
              </Link>
              {changeAfter}
            </p>
          </Card>
        </section>

        <section>
          <SectionHeader title={t("settingsPage.privacy.section.retention")} />
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {retentionRows(t, format).map((row) => (
                <li key={row.key} className="flex items-start gap-3 px-2 py-3">
                  <IconTile icon={Clock} tone="neutral" size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{row.label}</p>
                    <p className="text-xs text-[var(--wh-foreground-muted)]">{row.because}</p>
                  </div>
                  <Badge tone={row.kept ? "handled" : "neutral"}>{row.days}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section>
          <SectionHeader title={t("settingsPage.privacy.section.export")} />
          <Card className="space-y-4">
            <div className="flex items-start gap-3">
              <IconTile icon={Download} tone="care" />
              <ul className="min-w-0 flex-1 space-y-1.5">
                {exportLines(t, view.permissions, preferences.language).map((line) => (
                  <li key={line} className="text-sm text-[var(--wh-foreground-muted)]">{line}</li>
                ))}
              </ul>
            </div>

            {mayExport ? null : (
              <ConfirmItIsYouForm
                action={confirmItIsYouAction}
                householdId={householdId}
                purpose="export"
                labels={confirmItIsYouLabels(t, "export")}
              />
            )}
            <ExportForm householdId={householdId} confirmed={mayExport} labels={exportFormLabels(t)} />
          </Card>
        </section>

        <section>
          <SectionHeader title={t("settingsPage.privacy.section.delete")} />
          <Card className="space-y-4">
            <div className="flex items-start gap-3">
              <IconTile icon={Trash2} tone="risk" />
              <div className="min-w-0 flex-1 space-y-1.5 text-sm text-[var(--wh-foreground-muted)]">
                <p>{t("settingsPage.privacy.delete.grace", { count: DELETION_GRACE_DAYS })}</p>
                <p>{t("settingsPage.privacy.delete.shared")}</p>
              </div>
            </div>

            {pendingDeletion ? (
              <div className="space-y-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-attention-soft)]/60 p-4">
                <p className="text-sm font-medium">
                  {pendingDeletion.actsAt
                    ? t("settingsPage.privacy.delete.dueOn", { date: formatDate(timezone, pendingDeletion.actsAt, "long") })
                    : t("settingsPage.privacy.delete.due")}
                </p>
                <p className="text-sm text-[var(--wh-foreground-muted)]">{t("settingsPage.privacy.delete.canStop")}</p>
                <CancelDeletionForm
                  action={cancelDeletionAction}
                  householdId={householdId}
                  requestId={pendingDeletion.id}
                  labels={cancelDeletionLabels(t)}
                />
              </div>
            ) : isOwner ? (
              <p className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2 text-sm text-[var(--wh-foreground-muted)]">
                {t("settingsPage.privacy.delete.owner")}
              </p>
            ) : (
              <>
                {mayDelete ? null : (
                  <ConfirmItIsYouForm
                    action={confirmItIsYouAction}
                    householdId={householdId}
                    purpose="deletion"
                    labels={confirmItIsYouLabels(t, "deletion")}
                  />
                )}
                <DeletionForm
                  action={requestDeletionAction}
                  householdId={householdId}
                  confirmed={mayDelete}
                  labels={deletionFormLabels(t)}
                />
              </>
            )}
          </Card>
        </section>

        {requests.length > 0 ? (
          <section>
            <SectionHeader title={t("settingsPage.privacy.section.requests")} />
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {requests.map((request) => (
                  <li key={request.id} className="flex items-center gap-3 px-2 py-3">
                    <IconTile
                      icon={request.kind === "export" ? Download : Trash2}
                      tone={request.kind === "export" ? "care" : "risk"}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {request.kind === "export" ? t("settingsPage.privacy.request.export") : t("settingsPage.privacy.request.deletion")}
                      </p>
                      <p className="text-xs text-[var(--wh-foreground-muted)]">
                        {formatDate(timezone, request.createdAt, "long")}
                        {request.refusalReason ? ` · ${request.refusalReason}` : ""}
                      </p>
                    </div>
                    <Badge tone={request.status === "cancelled" ? "neutral" : "handled"}>{t(`settingsPage.privacy.request.status.${request.status}`)}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ) : null}

        <QuoteCard>{t("settingsPage.privacy.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
