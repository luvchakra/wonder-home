import { isHouseholdAdmin } from "@wonderhome/core/identity/households";
import { whatsappConfigFromEnv } from "@wonderhome/core/notifications/whatsapp";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { formatWhatsAppNumber, whatsappBusinessNumber } from "@wonderhome/core/whatsapp/linking";
import { listWhatsAppLinks } from "@wonderhome/core/whatsapp/repository";
import { MessageCircle, ShieldCheck } from "lucide-react";

import { WhatsAppConnect, WhatsAppDisconnect, WhatsAppLinkedNotice } from "../../_components/whatsapp-connect";
import { formatDate, requireSession } from "../../_lib/session";

export const metadata = { title: "WhatsApp" };
export const dynamic = "force-dynamic";

/**
 * WhatsApp as a way into HomeSend (story 14-016): connect your own number,
 * see and end the link, and — for an admin — every adult's link in the
 * household. WhatsApp only ever carries things in; nothing sent there pays,
 * books or approves anything, and the page says so plainly.
 *
 * Until the deployment has a WhatsApp Business number the page says it isn't
 * set up yet and offers no button, rather than one with nothing behind it.
 */
export default async function WhatsAppSettingsPage({ searchParams }: { searchParams: Promise<{ connected?: string }> }) {
  const { connected } = await searchParams;
  const session = await requireSession("/settings/whatsapp");
  const { supabase, membership, viewer, secondary } = session;
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

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings/whatsapp" back={{ href: "/settings", label: "Back to settings" }} title="WhatsApp">
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">WhatsApp</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">
            Forward things to WonderHome from WhatsApp, and they land in {household.name}&rsquo;s HomeSend for you to check.
          </p>
        </header>

        {links === null ? (
          <Card><p className="text-sm text-[var(--wh-risk)]">Your WhatsApp link couldn&apos;t be read just now. Nothing was changed — try again in a moment.</p></Card>
        ) : mine ? (
          <section className="space-y-3">
            {connected ? <WhatsAppLinkedNotice phone={formatWhatsAppNumber(mine.phone)} /> : null}
            <SectionHeader title="Your WhatsApp" />
            <Card className="flex items-start gap-3">
              <IconTile icon={MessageCircle} tone="handled" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold tabular-nums">{formatWhatsAppNumber(mine.phone)}</p>
                <p className="mt-0.5 text-[var(--wh-foreground-muted)]">
                  Connected {formatDate(household.timezone, mine.connectedAt)}
                  {mine.lastMessageAt ? ` · last message ${formatDate(household.timezone, mine.lastMessageAt)}` : " · nothing sent yet"}
                </p>
                <div className="mt-2"><Badge tone="handled">Connected</Badge></div>
              </div>
              <WhatsAppDisconnect householdId={household.id} identityId={mine.id} whose="your number" />
            </Card>
          </section>
        ) : !businessNumber ? (
          <Card className="flex items-start gap-3">
            <IconTile icon={MessageCircle} tone="neutral" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">Not available yet</p>
              <p className="mt-0.5 text-[var(--wh-foreground-muted)]">
                WhatsApp isn&rsquo;t set up for this WonderHome yet. Once it is, you&rsquo;ll connect your number here in a minute. Until then, HomeSend takes photos, files and forwarded email.
              </p>
            </div>
          </Card>
        ) : !adult ? (
          <Card className="flex items-start gap-3">
            <IconTile icon={MessageCircle} tone="neutral" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">For the adults in the household</p>
              <p className="mt-0.5 text-[var(--wh-foreground-muted)]">Only adults can connect a WhatsApp number. You can still send things in from HomeSend in the app.</p>
            </div>
          </Card>
        ) : (
          <WhatsAppConnect
            householdId={household.id}
            businessNumber={businessNumber}
            businessNumberDisplay={formatWhatsAppNumber(businessNumber)}
            someoneElseConnected={others.length > 0}
          />
        )}

        {admin && others.length > 0 ? (
          <section className="space-y-3">
            <SectionHeader title="Others in the household" />
            <ul className="space-y-3">
              {others.map((link) => {
                const name = names.get(link.memberId) ?? "A member";
                return (
                  <li key={link.id}>
                    <Card className="flex items-start gap-3">
                      <IconTile icon={MessageCircle} tone="handled" />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-semibold">{name}</p>
                        <p className="mt-0.5 tabular-nums text-[var(--wh-foreground-muted)]">{formatWhatsAppNumber(link.phone)}</p>
                        <p className="mt-0.5 text-[var(--wh-foreground-muted)]">
                          Connected {formatDate(household.timezone, link.connectedAt)}
                          {link.lastMessageAt ? ` · last message ${formatDate(household.timezone, link.lastMessageAt)}` : " · nothing sent yet"}
                        </p>
                      </div>
                      <WhatsAppDisconnect householdId={household.id} identityId={link.id} whose={name} />
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
            <p className="font-semibold">What WhatsApp can and can&rsquo;t do</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-[var(--wh-foreground-muted)]">
              <li>Anything you send becomes a HomeSend item from you, and you decide what happens to it in the app.</li>
              <li>Nothing is paid, ordered, booked or approved from WhatsApp, whatever a message says.</li>
              <li>Each adult links their own number. A number belongs to one person, in one household.</li>
              <li>Disconnecting stops new messages at once. What was already sent stays in HomeSend.</li>
            </ul>
          </div>
        </Card>

        <QuoteCard>Send it once. Home takes it from there.</QuoteCard>
      </div>
    </AppShell>
  );
}
