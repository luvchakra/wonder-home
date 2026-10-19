import type { Metadata } from "next";
import { ExternalLink, MapPin } from "lucide-react";
import Link from "next/link";
import { cache } from "react";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { readInviteLink } from "@wonderhome/core/family/event-detail";
import { mapsLinkFor } from "@wonderhome/core/places/event-place";
import { translatorFor } from "@wonderhome/core/i18n/translate";
import { DocumentLocale } from "@wonderhome/core/shell/document-locale";
import { Wordmark } from "@wonderhome/core/ui/brand";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { InvitationCard } from "@wonderhome/core/ui/invitation-card";
import { LeafDecor } from "@wonderhome/core/ui/leaf-decor";

import { replyToEventAction } from "../../(auth)/event-actions";
import { AuthLayout } from "../../_components/auth-layout";
import { EventReplyForm } from "../../_components/event-reply-form";
import { visitorLocale } from "../../_lib/entry-locale";
import { invitationWords } from "../../_lib/invitation-words";

export const dynamic = "force-dynamic";

/** One read per request, shared by the page and its share-card metadata. */
const invitation = cache(async (token: string) => readInviteLink(createAdminClient(), token).catch(() => null));

/**
 * What a chat app shows when the link is sent: the invitation as a large
 * postcard (`opengraph-image.tsx`, beside this file) with the event's own
 * title and when/where as its text, in the household's language — a link
 * preview has no reader to ask. A link that is off shows nothing about the
 * event at all.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const invited = await invitation(token);
  const base: Metadata = { robots: { index: false, follow: false } };
  if (!invited) return { ...base, title: "Invitation" };
  const t = await translatorFor(invited.language);
  const words = invitationWords(t, invited.language, invited);
  const title = `${words.invited} ${invited.title}`;
  const description = [words.day, words.time, words.place].filter(Boolean).join(" · ");
  return {
    ...base,
    title: { absolute: title },
    description,
    openGraph: { type: "website", title, description, siteName: "WonderHome" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * The guest's name the household picked when it shared this link
 * (`/e/<token>?to=Priya`), filled into "Your name". Only a name: control
 * characters dropped, spaces collapsed, cut to the form's 80 characters.
 */
function guestNameFrom(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const name = (raw ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return name || null;
}

/**
 * A family event's invite link, for someone outside the household: the
 * decorated invitation (story 26-009), then the reply.
 *
 * Public: the token in the address is the only credential, and all it shows
 * is the event's title, its time in the household's own timezone, its place,
 * the household's name and the line they wrote for guests — never the
 * event's notes. The reply form writes nothing itself; the server matches
 * the token again before keeping the reply. A link that is off, or never
 * existed, says only that it isn't working, never which.
 */
export default async function EventInvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ to?: string | string[] }> }) {
  const [{ token }, { to }] = await Promise.all([params, searchParams]);
  const guestName = guestNameFrom(to);
  const [locale, invited] = await Promise.all([visitorLocale(), invitation(token)]);
  const { t } = locale;

  if (!invited) {
    return <AuthLayout locale={locale} title={t("invite.event.gone")} lede={t("invite.event.goneLede")} offerInstall={false}>{null}</AuthLayout>;
  }

  const words = invitationWords(t, locale.language, invited);
  const closed = invited.cancelled ? t("invite.event.cancelled") : invited.over ? t("invite.event.over") : null;
  // A place picked from Google Maps opens there, so a guest can find the way; a typed one ("Home") has no link.
  const directions = closed ? null : mapsLinkFor(invited);

  return (
    <main className="relative min-h-dvh overflow-x-clip bg-[var(--wh-background)]">
      <DocumentLocale language={locale.language} dir={locale.dir} />
      <LeafDecor corner="top-right" size={190} opacity={0.22} />
      <LeafDecor corner="bottom-left" size={160} opacity={0.18} />
      <div className="relative mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-6 sm:py-10">
        <Link href="/" aria-label={t("entry.layout.homeLink")} className="self-start">
          <Wordmark size={26} />
        </Link>

        <h1 className="sr-only">{`${words.invited} ${invited.title}`}</h1>
        <InvitationCard template={invited.template} words={words} />

        {directions ? (
          <a
            href={directions}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-start gap-3 rounded-[var(--wh-radius-lg)] bg-[var(--wh-surface)] p-4 shadow-[var(--wh-shadow-sm)] focus-visible:outline-2 focus-visible:outline-[var(--wh-primary)]"
          >
            <IconTile icon={MapPin} tone="home" size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium break-words">{invited.location}</span>
              {invited.locationAddress ? <span className="block text-xs break-words text-[var(--wh-foreground-muted)]">{invited.locationAddress}</span> : null}
              <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[var(--wh-primary)]">
                {t("places.openInMaps")} <ExternalLink aria-hidden className="size-3" />
              </span>
            </span>
          </a>
        ) : null}

        <Card className="space-y-4 p-5">
          {closed ? (
            <p className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2 text-sm">{closed}</p>
          ) : (
            <EventReplyForm
              token={token}
              guestName={guestName}
              action={replyToEventAction}
              labels={{
                name: t("invite.event.name"),
                question: t("invite.event.question"),
                yes: t("events.answer.yes"),
                maybe: t("events.answer.maybe"),
                no: t("events.answer.no"),
                partySize: t("invite.event.partySize"),
                note: t("invite.event.note"),
                send: t("invite.event.send"),
                sending: t("invite.event.sending"),
                sent: { yes: t("invite.event.sent.yes", { name: "{name}" }), no: t("invite.event.sent.no", { name: "{name}" }), maybe: t("invite.event.sent.maybe", { name: "{name}" }) },
                change: t("invite.event.change"),
                privacy: t("invite.event.privacy"),
              }}
            />
          )}
        </Card>
        <p className="text-center text-sm text-[var(--wh-foreground-muted)]">{t("invite.event.quote")}</p>
      </div>
    </main>
  );
}
