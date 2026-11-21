import { FileText, History, Inbox, Paperclip, Receipt, Wallet } from "lucide-react";

import { listAuditEventsFor } from "@wonderhome/core/api/audit";
import { may } from "@wonderhome/core/billing/repository";
import { listBillAttachments } from "@wonderhome/core/finance/bill-attachments";
import { isPaidWith, isPartRow, type PaymentPart } from "@wonderhome/core/finance/part-payment";
import { listObligations } from "@wonderhome/core/finance/repository";
import { getHomeSendItem } from "@wonderhome/core/homesend/repository";
import type { TranslationKey } from "@wonderhome/core/i18n/translate";
import { isHouseholdAdmin, listMembers } from "@wonderhome/core/identity/households";
import { format as formatMoney } from "@wonderhome/core/finance/payments";
import { describeAuditEvent } from "@wonderhome/core/security/sensitive-actions";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState } from "@wonderhome/core/ui/states";

import { billKindName } from "../../_lib/bill-form-labels";
import { formatDate, requireSession } from "../../_lib/session";
import { AttachBillFile, RemoveBillFile, type BillFileLabels } from "./bill-files";

export const metadata = { title: "Bill" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** HomeSend's channel words, the same ones its inbox uses. */
const SOURCE_KEY: Record<string, TranslationKey> = {
  manual_upload: "homesend.source.manualUpload",
  pasted_text: "homesend.source.pastedText",
  link: "homesend.source.link",
  audio_note: "homesend.source.audioNote",
  email: "homesend.source.email",
  email_attachment: "homesend.source.emailAttachment",
  whatsapp: "homesend.source.whatsapp",
  whatsapp_media: "homesend.source.whatsappMedia",
  school_channel: "homesend.source.schoolChannel",
};

type HistoryRow = { period_label: string; amount_minor: number; currency: string; paid_on: string | null; owner_member_id: string | null; paid_with?: string | null; due_minor?: number | null; parts?: unknown };

/**
 * A bill's full record (11-021, rule 21): the bill, every payment and who
 * made it, where it came from (with what was sent), its files, and — for an
 * Admin, who can read the trail — what changed and by whom. Reads in one wave.
 */
export default async function BillRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, requireSession("/bills")]);
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const admin = isHouseholdAdmin(membership);
  const shell = { active: "more" as const, viewer, secondary, pathname: "/bills", back: { href: "/bills", label: t("nav.item.bills") } };
  const missing = (
    <AppShell {...shell} title={t("nav.item.bills")}>
      <EmptyState icon={Wallet} tone="money" title={t("bills.record.missing")} description={t("bills.record.missingLede")} />
    </AppShell>
  );
  if (!UUID.test(id) || !view.permissions.includes("finance.view")) return missing;

  const [entitlement, bills, members, historyRows, files, trail, item] = await Promise.all([
    may(supabase, householdId, "finance.bills"),
    listObligations(supabase, householdId, { id }).catch(() => []),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    // `*`: the part-payment columns (11-019) when they exist.
    supabase.from("obligation_history").select("*").eq("household_id", householdId).eq("obligation_id", id).order("period_label", { ascending: false }).limit(60),
    listBillAttachments(supabase, householdId, id).catch(() => []),
    admin ? listAuditEventsFor(supabase, householdId, id).catch(() => []) : Promise.resolve([]),
    // Where it came from: the HomeSend item that added it, if one did.
    (async () => {
      const { data } = await supabase.from("homesend_changes").select("intake_id").eq("household_id", householdId).eq("entity_id", id).eq("domain", "bill").order("created_at", { ascending: true }).limit(1).maybeSingle();
      const intakeId = (data as { intake_id: string | null } | null)?.intake_id;
      return intakeId ? getHomeSendItem(supabase, householdId, intakeId).catch(() => null) : null;
    })().catch(() => null),
  ]);
  const bill = bills[0];
  if (!entitlement.allowed || !bill) return missing;

  const nameOf = (memberId: string | null) => (memberId ? (members.find((member) => member.id === memberId)?.displayName ?? null) : null);
  const day = (iso: string | null) => (iso ? formatDate(timezone, new Date(iso.length === 10 ? `${iso}T00:00:00.000Z` : iso), "long") : null);
  const history = ((historyRows.data ?? []) as HistoryRow[]);
  const sourceDoc =
    item && item.filePath && item.securityStatus !== "rejected"
      ? ((await supabase.storage.from("home-send").createSignedUrl(item.filePath, 300)).data?.signedUrl ?? null)
      : null;
  const fileLabels: BillFileLabels = {
    attach: t("bills.record.attach"),
    attaching: t("bills.record.attaching"),
    save: t("bills.record.attachSave"),
    remove: t("bills.record.removeFile"),
    failed: t("bills.markPaid.failed"),
  };
  const facts: [string, string | null][] = [
    [t("bills.fact.kind"), billKindName(t, bill.kind)],
    [t("bills.fact.status"), t(`bills.status.${bill.status}`)],
    [t("bills.fact.payee"), bill.payee],
    [t("bills.fact.owner"), nameOf(bill.responsibleMemberId)],
    [t("bills.fact.due"), day(bill.dueOn)],
    [t("bills.fact.amount"), bill.amountMinor !== null && bill.currency ? formatMoney(bill.amountMinor, bill.currency) : t("bills.amountNotIn")],
  ];

  return (
    <AppShell {...shell} title={bill.name}>
      <div className="space-y-5">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight break-words sm:text-3xl">{bill.name}</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{t("bills.record.lede")}</p>
        </header>

        <Card className="p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {facts.map(([label, value]) =>
              value ? (
                <div key={label}>
                  <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{label}</dt>
                  <dd className="text-sm break-words">{value}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </Card>

        <section>
          <SectionHeader title={t("bills.record.payments")} count={history.length} />
          <Card className="p-2">
            {history.length === 0 ? (
              <p className="p-3 text-sm text-[var(--wh-foreground-muted)]">{t("bills.record.paymentsEmpty")}</p>
            ) : (
              <ul className="divide-y divide-[var(--wh-border)]">
                {history.map((row) => {
                  const parts = Array.isArray(row.parts) ? (row.parts as PaymentPart[]) : [];
                  const how = isPaidWith(row.paid_with) ? t(`bills.paidWith.${row.paid_with}` as const) : null;
                  return (
                    <li key={row.period_label} className="flex items-start gap-3 p-3">
                      <IconTile icon={Receipt} tone="money" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">
                          {row.period_label} · {formatMoney(Number(row.amount_minor), row.currency)}
                          {isPartRow(row) ? ` · ${t("bills.partOfBill", { amount: formatMoney(Number(row.due_minor), row.currency) })}` : ""}
                        </span>
                        <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                          {[row.paid_on ? t("bills.record.paidOn", { date: day(row.paid_on)! }) : null, how, nameOf(row.owner_member_id)].filter(Boolean).join(" · ")}
                        </span>
                        {parts.length > 1 ? (
                          <ul className="mt-1 space-y-0.5 text-xs text-[var(--wh-foreground-muted)]">
                            {parts.map((part, n) => (
                              <li key={n}>
                                {t("bills.record.part", { amount: formatMoney(part.amountMinor, row.currency), date: day(part.paidOn) ?? "" })}
                                {part.paidWith && isPaidWith(part.paidWith) ? ` · ${t(`bills.paidWith.${part.paidWith}` as const)}` : ""}
                                {nameOf(part.memberId) ? ` · ${nameOf(part.memberId)}` : ""}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>

        <section>
          <SectionHeader title={t("bills.record.source")} />
          <Card className="flex items-start gap-3 p-4">
            <IconTile icon={Inbox} tone="money" />
            <div className="min-w-0 flex-1 space-y-1 text-sm">
              {item ? (
                <>
                  <p className="font-medium">{SOURCE_KEY[item.source] ? t(SOURCE_KEY[item.source]!) : t("homesend.source.something")}</p>
                  <p className="text-xs break-words text-[var(--wh-foreground-subtle)]">
                    {[item.subject, item.senderAddress, day(item.createdAt), nameOf(item.createdByMemberId)].filter(Boolean).join(" · ")}
                  </p>
                  {sourceDoc ? (
                    <PillLink href={sourceDoc} tone="quiet" target="_blank" rel="noopener noreferrer">
                      {t("bills.record.openSent")}
                    </PillLink>
                  ) : null}
                </>
              ) : (
                <p>{t("bills.record.byHand")}</p>
              )}
            </div>
          </Card>
        </section>

        <section>
          <SectionHeader title={t("bills.record.files")} count={files.length} />
          <Card className="space-y-3 p-3">
            {files.length === 0 ? <p className="px-1 text-sm text-[var(--wh-foreground-muted)]">{t("bills.record.filesEmpty")}</p> : null}
            {files.length > 0 ? (
              <ul className="divide-y divide-[var(--wh-border)]">
                {files.map((file) => (
                  <li key={file.id} className="flex items-center gap-3 py-2">
                    <IconTile icon={file.contentType === "application/pdf" ? FileText : Paperclip} tone="money" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium break-words">{file.filename ?? t("bills.record.file")}</span>
                      <span className="block text-xs text-[var(--wh-foreground-subtle)]">{[day(file.createdAt), nameOf(file.uploadedByMemberId)].filter(Boolean).join(" · ")}</span>
                    </span>
                    {file.url ? (
                      <PillLink href={file.url} tone="quiet" target="_blank" rel="noopener noreferrer">
                        {t("bills.record.openFile")}
                      </PillLink>
                    ) : null}
                    {admin ? <RemoveBillFile householdId={householdId} obligationId={bill.id} attachmentId={file.id} labels={fileLabels} /> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {admin ? <AttachBillFile householdId={householdId} obligationId={bill.id} labels={fileLabels} /> : null}
          </Card>
        </section>

        {admin ? (
          <section>
            <SectionHeader title={t("bills.record.changes")} count={trail.length} />
            <Card className="p-2">
              {trail.length === 0 ? (
                <p className="p-3 text-sm text-[var(--wh-foreground-muted)]">{t("bills.record.changesEmpty")}</p>
              ) : (
                <ul className="divide-y divide-[var(--wh-border)]">
                  {trail.map((event) => {
                    const described = describeAuditEvent(event.eventType, event.metadata);
                    return (
                      <li key={event.id} className="flex items-start gap-3 p-3">
                        <IconTile icon={History} tone="money" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{described.title}</span>
                          <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                            {[nameOf(event.actorMemberId) ?? "WonderHome", day(event.createdAt), described.detail].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </section>
        ) : null}

        <QuoteCard>{t("bills.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
