import type { InvitedEvent } from "@wonderhome/core/family/event-detail";
import { intlLocale } from "@wonderhome/core/i18n/preferences";
import type { Translate } from "@wonderhome/core/i18n/translate";
import type { InvitationCardWords } from "@wonderhome/core/ui/invitation-card";

/**
 * Everything an invitation says, in one reader's language — the page a guest
 * opens and the postcard WhatsApp shows read from the same words, so the
 * picture in the chat and the page behind it never disagree.
 *
 * Times are on the household's clock (the event's own), never the reader's
 * or the server's. An all-day event says "All day" instead of a midnight to
 * midnight that would read as a time.
 */
export function invitationWords(t: Translate, language: string, invited: InvitedEvent, now: Date = new Date()): InvitationCardWords {
  const zone = invited.timezone;
  // Written the household's way ("9 December" in India), in the reader's language.
  const locale = invited.region && /^[A-Z]{2}$/.test(invited.region) ? intlLocale({ language: language as never, region: invited.region as never }) : language;
  const year = (at: Date) => new Intl.DateTimeFormat("en", { timeZone: zone, year: "numeric" }).format(at);
  const withYear = year(invited.startsAt) !== year(now);
  const dayFormat = new Intl.DateTimeFormat(locale, { timeZone: zone, weekday: "long", day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}) });
  const timeFormat = new Intl.DateTimeFormat(locale, { timeZone: zone, hour: "numeric", minute: "2-digit" });
  const lastMoment = invited.allDay ? new Date(invited.endsAt.getTime() - 1) : invited.endsAt;
  const sameDay = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
  const oneDay = sameDay.format(invited.startsAt) === sameDay.format(lastMoment);

  const day = oneDay ? dayFormat.format(invited.startsAt) : dayFormat.formatRange(invited.startsAt, lastMoment);
  const time = invited.allDay
    ? t("invite.card.allDay")
    : oneDay
      ? invited.endsAt.getTime() > invited.startsAt.getTime()
        ? timeFormat.formatRange(invited.startsAt, invited.endsAt)
        : timeFormat.format(invited.startsAt)
      : null;

  return {
    invited: t("invite.card.invited"),
    kindLine: t(`invite.card.kind.${invited.template}`),
    title: invited.title,
    day,
    time,
    place: invited.location,
    message: invited.message,
    hosted: t("invite.card.hosted", { household: invited.householdName }),
  };
}
