import { CalendarHeart, MapPin } from "lucide-react";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { readInviteLink } from "@wonderhome/core/family/event-detail";
import { IconTile } from "@wonderhome/core/ui/icon-tile";

import { replyToEventAction } from "../../(auth)/event-actions";
import { AuthLayout } from "../../_components/auth-layout";
import { EventReplyForm } from "../../_components/event-reply-form";
import { visitorLocale } from "../../_lib/entry-locale";

export const metadata = { title: "You're invited", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * A family event's invite link, for someone outside the household.
 *
 * Public: the token in the address is the only credential, and all it shows
 * is the event's title, its time in the household's own timezone, its place
 * and the household's name. The reply form writes nothing itself; the server
 * matches the token again before keeping the reply. A link that is off, or
 * never existed, says only that it isn't working, never which.
 */
export default async function EventInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [locale, invited] = await Promise.all([visitorLocale(), readInviteLink(createAdminClient(), token).catch(() => null)]);
  const { t } = locale;

  if (!invited) {
    return <AuthLayout locale={locale} title={t("invite.event.gone")} lede={t("invite.event.goneLede")} offerInstall={false}>{null}</AuthLayout>;
  }

  const day = new Intl.DateTimeFormat(locale.language, { timeZone: invited.timezone, weekday: "long", day: "numeric", month: "long" }).format(invited.startsAt);
  const time = new Intl.DateTimeFormat(locale.language, { timeZone: invited.timezone, hour: "numeric", minute: "2-digit" });
  const when = `${day} · ${time.format(invited.startsAt)} – ${time.format(invited.endsAt)}`;
  const closed = invited.cancelled ? t("invite.event.cancelled") : invited.over ? t("invite.event.over") : null;

  return (
    <AuthLayout locale={locale} title={t("invite.event.title")} lede={t("invite.event.from", { household: invited.householdName })} accent={t("invite.event.quote")} offerInstall={false}>
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-[var(--wh-radius)] bg-[var(--wh-tone-people-soft)]/60 p-4">
          <IconTile icon={CalendarHeart} tone="people" />
          <div className="min-w-0 space-y-1">
            <p className="text-base font-semibold">{invited.title}</p>
            <p className="text-sm text-[var(--wh-foreground-muted)]">{when}</p>
            {invited.location ? (
              <p className="flex items-start gap-1.5 text-sm text-[var(--wh-foreground-muted)]">
                <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" /> {invited.location}
              </p>
            ) : null}
          </div>
        </div>

        {closed ? (
          <p className="rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] px-3 py-2 text-sm">{closed}</p>
        ) : (
          <EventReplyForm
            token={token}
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
      </div>
    </AuthLayout>
  );
}
