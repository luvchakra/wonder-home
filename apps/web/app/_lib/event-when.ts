import type { FamilyEvent } from "@wonderhome/core/family/schedule";
import type { Translate } from "@wonderhome/core/i18n/translate";

import { formatDate, formatTime } from "./session";

/**
 * When an event is, the same way on every list it appears in: an all-day
 * event says "All day" (or its days), never a midnight that reads as a time;
 * a timed one gives its day and hours on the household's clock.
 */
export function eventWhen(event: Pick<FamilyEvent, "startsAt" | "endsAt" | "allDay">, timezone: string, t: Translate): string {
  const day = formatDate(timezone, event.startsAt, "long");
  if (event.allDay) {
    const last = new Date(event.endsAt.getTime() - 1);
    const lastDay = formatDate(timezone, last, "long");
    return lastDay === day ? `${day} · ${t("calendar.entry.allDay")}` : `${day} – ${lastDay}`;
  }
  const sameDay = formatDate(timezone, event.endsAt, "long") === day;
  const end = event.endsAt.getTime() > event.startsAt.getTime() ? ` – ${sameDay ? formatTime(timezone, event.endsAt) : `${formatDate(timezone, event.endsAt, "long")} ${formatTime(timezone, event.endsAt)}`}` : "";
  return `${day} · ${formatTime(timezone, event.startsAt)}${end}`;
}

/**
 * Who is going: the members asked to it who haven't said no, by name — never
 * the whole family by default. Nobody asked is said as such.
 */
export function eventGoing(
  event: Pick<FamilyEvent, "participants">,
  nameOf: (memberId: string) => string | null,
  t: Translate,
  language: string,
): { names: string[]; words: string } {
  const names = event.participants
    .filter((participant) => participant.response !== "no")
    .map((participant) => nameOf(participant.memberId))
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return { names, words: t("events.going.nobody") };
  const shown = names.length > 3 ? [...names.slice(0, 2), t("events.going.more", { count: names.length - 2 })] : names;
  let list: string;
  try {
    list = new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(shown);
  } catch {
    list = shown.join(", ");
  }
  return { names, words: t("events.going.with", { names: list }) };
}
