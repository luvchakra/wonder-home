/**
 * When a HomeTalk message was said, the way a messaging app shows it: the
 * time inside each bubble, and a date between the days (Today, Yesterday,
 * then the full date).
 *
 * Always in the household's own time zone, never the browser's or the
 * server's. The page is rendered on a server in UTC and then again in the
 * browser, and the same zone on both sides is what keeps the two identical.
 * It is also the household's clock that "Today" means.
 */

/** A zone Intl can use. A household's is validated when it is set; this only keeps a bad one from breaking the page. */
function zone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

function parts(at: Date, timeZone: string): { year: number; month: number; day: number } {
  const formatted = new Intl.DateTimeFormat("en-CA", { timeZone: zone(timeZone), year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  const [year, month, day] = formatted.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
}

/** "4:07 PM". */
export function messageTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone(timeZone), hour: "numeric", minute: "2-digit", hour12: true }).format(at);
}

/** The local day a message belongs to, as `YYYY-MM-DD`: what decides where a date divider goes. */
export function messageDay(at: Date, timeZone: string): string {
  const { year, month, day } = parts(at, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "Today", "Yesterday", else "September 7, 2026". */
export function messageDayLabel(at: Date, timeZone: string, now: Date = new Date()): string {
  const day = messageDay(at, timeZone);
  const today = messageDay(now, timeZone);
  if (day === today) return "Today";
  // Calendar arithmetic on the local date itself, so a day that is 23 or 25
  // hours long never makes yesterday look like two days ago.
  const { year, month, day: date } = parts(now, timeZone);
  const yesterday = new Date(Date.UTC(year, month - 1, date - 1));
  if (day === yesterday.toISOString().slice(0, 10)) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", { timeZone: zone(timeZone), month: "long", day: "numeric", year: "numeric" }).format(at);
}
