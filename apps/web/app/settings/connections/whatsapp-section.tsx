import { isHouseholdAdmin } from "@wonderhome/core/identity/households";
import { whatsappConfigFromEnv } from "@wonderhome/core/notifications/whatsapp";
import { Card } from "@wonderhome/core/ui/card";
import { CollapsibleSection } from "@wonderhome/core/ui/collapsible-section";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { formatWhatsAppNumber, whatsappBusinessNumber } from "@wonderhome/core/whatsapp/linking";
import { listWhatsAppLinks } from "@wonderhome/core/whatsapp/repository";
import { MessageCircle, ShieldCheck } from "lucide-react";

import { WhatsAppConnect, WhatsAppDisconnect, WhatsAppLinkedNotice } from "../../_components/whatsapp-connect";
import { formatDate, type Session } from "../../_lib/session";
import { whatsappConnectLabels, whatsappDisconnectLabels, whatsappLinkedLabels } from "../../_lib/settings-labels";

/**
 * WhatsApp as a way into HomeSend (story 14-016), as a section of Connections: connect your own number,
 * see and end the link, and — for an admin — every adult's link in the
 * household. WhatsApp only ever carries things in; nothing sent there pays,
 * books or approves anything, and the page says so plainly.
 *
 * Until the deployment has a WhatsApp Business number the page says it isn't
 * set up yet and offers no button, rather than one with nothing behind it.
 */
export async function WhatsAppSection({ session, connected }: { session: Session; connected: boolean }) {
  const { supabase, membership } = session;
  const household = membership.household;
  const admin = isHouseholdAdmin(membership);
  const businessNumber = whatsappConfigFromEnv() ? whatsappBusinessNumber() : null;

  const [links, members] = await Promise.all([
    listWhatsAppLinks(supabase, household.id).catch(() => null),
    supabase.from("household_members").select("id, display_name").eq("household_id", household.id),
  ]);
  const names = new Map(((members.data as { id: string; display_name: string }[] | null) ?? []).map((row) => [row.id, row.display_name]));
  const mine = links?.find((link) => link.memberId === membership.memberId) ?? null;
  const others = (links ?? []).filter((link) => link.memberId !== membership.memberId);
  const adult = membership.memberType === "adult";
  const { t } = session.locale;
  const connectedLine = (connectedAt: Date, lastMessageAt: Date | null) =>
    lastMessageAt
      ? t("settingsPage.whatsapp.connectedLast", { date: formatDate(household.timezone, connectedAt), last: formatDate(household.timezone, lastMessageAt) })
      : t("settingsPage.whatsapp.connectedNothing", { date: formatDate(household.timezone, connectedAt) });

  return (
    // A collapsible card like the playbook/notifications folds (the owner, 2026-10-29): the
    // Connections page stacked several long sections. It opens on the connect callback so the
    // success notice is in view.
    <CollapsibleSection
      id="whatsapp"
      icon={MessageCircle}
      tone="handled"
      title="WhatsApp"
      intro={t("settingsPage.whatsapp.lede", { household: household.name })}
      defaultOpen={connected}
    >
        {links === null ? (
          <Card><p className="text-sm text-[var(--wh-risk)]">{t("settingsPage.whatsapp.readError")}</p></Card>
        ) : mine ? (
          <section className="space-y-3">
            {connected ? <WhatsAppLinkedNotice phone={formatWhatsAppNumber(mine.phone)} labels={whatsappLinkedLabels(t)} /> : null}
            <SectionHeader title={t("settingsPage.whatsapp.yours")} />
            <Card className="flex items-start gap-3">
              <IconTile icon={MessageCircle} tone="handled" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold tabular-nums">{formatWhatsAppNumber(mine.phone)}</p>
                <p className="mt-0.5 text-[var(--wh-foreground-muted)]">{connectedLine(mine.connectedAt, mine.lastMessageAt)}</p>
                <div className="mt-2"><Badge tone="handled">{t("settingsPage.whatsapp.connected")}</Badge></div>
              </div>
              <WhatsAppDisconnect householdId={household.id} identityId={mine.id} labels={whatsappDisconnectLabels(t, null)} />
            </Card>
          </section>
        ) : !businessNumber ? (
          <Card className="flex items-start gap-3">
            <IconTile icon={MessageCircle} tone="neutral" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">{t("settingsPage.whatsapp.unavailable")}</p>
              <p className="mt-0.5 text-[var(--wh-foreground-muted)]">{t("settingsPage.whatsapp.unavailableBody")}</p>
            </div>
          </Card>
        ) : !adult ? (
          <Card className="flex items-start gap-3">
            <IconTile icon={MessageCircle} tone="neutral" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">{t("settingsPage.whatsapp.adults")}</p>
              <p className="mt-0.5 text-[var(--wh-foreground-muted)]">{t("settingsPage.whatsapp.adultsBody")}</p>
            </div>
          </Card>
        ) : (
          <WhatsAppConnect
            householdId={household.id}
            businessNumber={businessNumber}
            businessNumberDisplay={formatWhatsAppNumber(businessNumber)}
            someoneElseConnected={others.length > 0}
            labels={whatsappConnectLabels(t)}
          />
        )}

        {admin && others.length > 0 ? (
          <section className="space-y-3">
            <SectionHeader title={t("settingsPage.whatsapp.others")} />
            <ul className="space-y-3">
              {others.map((link) => {
                const name = names.get(link.memberId) ?? t("settingsPage.aMember");
                return (
                  <li key={link.id}>
                    <Card className="flex items-start gap-3">
                      <IconTile icon={MessageCircle} tone="handled" />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-semibold">{name}</p>
                        <p className="mt-0.5 tabular-nums text-[var(--wh-foreground-muted)]">{formatWhatsAppNumber(link.phone)}</p>
                        <p className="mt-0.5 text-[var(--wh-foreground-muted)]">{connectedLine(link.connectedAt, link.lastMessageAt)}</p>
                      </div>
                      <WhatsAppDisconnect householdId={household.id} identityId={link.id} labels={whatsappDisconnectLabels(t, name)} />
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <Card className="flex items-start gap-3">
          <IconTile icon={ShieldCheck} tone="primary" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">{t("settingsPage.whatsapp.rules")}</p>
            <ul className="mt-1 list-disc space-y-1 ps-4 text-[var(--wh-foreground-muted)]">
              <li>{t("settingsPage.whatsapp.rule.item")}</li>
              <li>{t("settingsPage.whatsapp.rule.nothingPaid")}</li>
              <li>{t("settingsPage.whatsapp.rule.ownNumber")}</li>
              <li>{t("settingsPage.whatsapp.rule.disconnect")}</li>
            </ul>
          </div>
        </Card>
    </CollapsibleSection>
  );
}
