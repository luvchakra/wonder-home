/**
 * What the understanding model is told about the moment (Wave 4 §17): a
 * role, the household's own date and time, what is waiting, and what the
 * conversation was just about. One builder, used by the conversation route
 * and by the evaluation runner, so a provider is evaluated on exactly what
 * it is given in production.
 */

/** The speaker's role, in words — never a name or an id. */
export function roleWords(member: { memberType: string; roles: readonly string[] }): string {
  if (member.memberType === "child") return "a child of the household";
  if (member.memberType === "helper") return "a helper who works for the household";
  return member.roles.includes("head") || member.roles.includes("administrator") ? "an adult who runs the household" : "an adult of the household";
}

/** "Wednesday 23 September 2026, 18:10 (Asia/Kolkata)" — the household's own clock. */
export function localDateTime(now: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone }).formatToParts(now);
    const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
    return `${part("weekday")} ${part("day")} ${part("month")} ${part("year")}, ${part("hour")}:${part("minute")} (${timezone})`;
  } catch {
    return now.toISOString();
  }
}

/** What is waiting on the person, in the words the model is given. */
export function pendingWords(waiting: { question: string } | { summary: string } | null): string | null {
  if (!waiting) return null;
  return "question" in waiting ? `a question: "${waiting.question}"` : `a yes or no on "${waiting.summary}"`;
}
