import Link from "next/link";
import { Clock, Download, ShieldCheck, Trash2 } from "lucide-react";

import { describeDataUse } from "@wonderhome/core/ai/privacy";
import { loadDataUse } from "@wonderhome/core/ai/privacy-repository";
import { buildPersonalView } from "@wonderhome/core/identity/views";
import { describeExport } from "@wonderhome/core/privacy/export";
import { listPrivacyRequests } from "@wonderhome/core/privacy/repository";
import { DELETION_GRACE_DAYS, describeDays, retentionSchedule } from "@wonderhome/core/privacy/retention";
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

  return (
    <AppShell
      active="more"
      viewer={viewer}
      secondary={secondary}
      pathname="/settings/privacy"
      back={{ href: "/settings", label: "Back to settings" }}
      title="Privacy"
    >
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Your privacy</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">
            What leaves this house, how long we keep things, and how to take your data with you or have it
            removed.
          </p>
        </header>

        <section>
          <SectionHeader title="What the assistant may share" />
          <Card className="space-y-3">
            <div className="flex items-start gap-3">
              <IconTile icon={ShieldCheck} tone="primary" />
              <ul className="min-w-0 flex-1 space-y-1.5">
                {describeDataUse(dataUse).map((line) => (
                  <li key={line} className="text-sm text-[var(--wh-foreground-muted)]">{line}</li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-[var(--wh-foreground-subtle)]">
              An Admin changes this in{" "}
              <Link href="/settings/ai" className="font-medium text-[var(--wh-primary)] underline-offset-2 hover:underline">
                Settings → AI Assistant
              </Link>
              .
            </p>
          </Card>
        </section>

        <section>
          <SectionHeader title="How long we keep things" />
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {retentionSchedule().map(({ key, rule }) => (
                <li key={key} className="flex items-start gap-3 px-2 py-3">
                  <IconTile icon={Clock} tone="neutral" size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{rule.label}</p>
                    <p className="text-xs text-[var(--wh-foreground-muted)]">{rule.because}</p>
                  </div>
                  <Badge tone={rule.days === null ? "handled" : "neutral"}>{describeDays(rule.days)}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section>
          <SectionHeader title="Take a copy with you" />
          <Card className="space-y-4">
            <div className="flex items-start gap-3">
              <IconTile icon={Download} tone="care" />
              <ul className="min-w-0 flex-1 space-y-1.5">
                {describeExport(view.permissions).map((line) => (
                  <li key={line} className="text-sm text-[var(--wh-foreground-muted)]">{line}</li>
                ))}
              </ul>
            </div>

            {mayExport ? null : (
              <ConfirmItIsYouForm
                action={confirmItIsYouAction}
                householdId={householdId}
                purpose="export"
                what="before sending you a copy of your data"
              />
            )}
            <ExportForm householdId={householdId} confirmed={mayExport} />
          </Card>
        </section>

        <section>
          <SectionHeader title="Have your data deleted" />
          <Card className="space-y-4">
            <div className="flex items-start gap-3">
              <IconTile icon={Trash2} tone="risk" />
              <div className="min-w-0 flex-1 space-y-1.5 text-sm text-[var(--wh-foreground-muted)]">
                <p>
                  Nothing is deleted the moment you ask. You get {DELETION_GRACE_DAYS} days to change your
                  mind, and you can call it off at any point in them.
                </p>
                <p>
                  What the household agreed together — the playbook, the rules, what was paid — stays, because
                  it belongs to everyone who lives here. What is yours goes.
                </p>
              </div>
            </div>

            {pendingDeletion ? (
              <div className="space-y-3 rounded-[var(--wh-radius-sm)] bg-[var(--wh-attention-soft)]/60 p-4">
                <p className="text-sm font-medium">
                  Your data is due to be deleted
                  {pendingDeletion.actsAt ? ` on ${formatDate(timezone, pendingDeletion.actsAt, "long")}` : ""}.
                </p>
                <p className="text-sm text-[var(--wh-foreground-muted)]">
                  You can stop this until then, and nothing will have been removed.
                </p>
                <CancelDeletionForm
                  action={cancelDeletionAction}
                  householdId={householdId}
                  requestId={pendingDeletion.id}
                />
              </div>
            ) : isOwner ? (
              <p className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2 text-sm text-[var(--wh-foreground-muted)]">
                You are this household&rsquo;s owner. Deleting your data would leave the household without anyone to
                run it, so hand that role to another adult first — then this will be here.
              </p>
            ) : (
              <>
                {mayDelete ? null : (
                  <ConfirmItIsYouForm
                    action={confirmItIsYouAction}
                    householdId={householdId}
                    purpose="deletion"
                    what="before starting anything this serious"
                  />
                )}
                <DeletionForm
                  action={requestDeletionAction}
                  householdId={householdId}
                  confirmed={mayDelete}
                />
              </>
            )}
          </Card>
        </section>

        {requests.length > 0 ? (
          <section>
            <SectionHeader title="What you have asked for" />
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
                        {request.kind === "export" ? "A copy of your data" : "Deletion of your data"}
                      </p>
                      <p className="text-xs text-[var(--wh-foreground-muted)]">
                        {formatDate(timezone, request.createdAt, "long")}
                        {request.refusalReason ? ` · ${request.refusalReason}` : ""}
                      </p>
                    </div>
                    <Badge tone={request.status === "cancelled" ? "neutral" : "handled"}>{request.status}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ) : null}

        <QuoteCard>Your home. Your data. Your call.</QuoteCard>
      </div>
    </AppShell>
  );
}
