type Dated = { dueDate?: unknown; dateText?: unknown; documentDate?: unknown } | null | undefined;
type Loose = { schedule?: unknown; dueDate?: unknown; dateText?: unknown } | Record<string, unknown> | null | undefined;

/**
 * A school notice with no dated thing in it: no due day, no date words, no
 * timetable and no dated record in the document (a circular about a new
 * rule, a reading list, a thank-you note). It becomes a school note at once,
 * with a one-line summary in the reply, rather than asking "When is it?" or
 * waiting for the deadlines pass (2026-11-21). Pure.
 */
export function isUndatedSchoolNotice(item: {
  classifiedKind: string | null | undefined;
  extracted: Loose;
  understanding?: { document?: { records?: readonly unknown[] } | null } | Record<string, unknown> | null;
}): boolean {
  if (item.classifiedKind !== "school_item") return false;
  const extracted = item.extracted as { schedule?: unknown; dueDate?: unknown; dateText?: unknown } | null | undefined;
  if (!extracted || extracted.schedule) return false;
  if (dated(extracted)) return false;
  const records = ((item.understanding as { document?: { records?: readonly unknown[] } | null } | null | undefined)?.document?.records ?? []) as readonly (Dated & { record?: Dated })[];
  return !records.some((entry) => dated(entry) || dated(entry?.record));
}

function dated(value: Dated): boolean {
  if (!value) return false;
  return [value.dueDate, value.dateText].some((field) => typeof field === "string" && field.trim().length > 0);
}

/** The reply's one line about the note: the reading's own summary, else its title, on one line and short. */
export function noteSummary(summary: string | null | undefined, title: string | null | undefined): string {
  const line = (summary?.trim() || title?.trim() || "").replace(/\s+/g, " ").replace(/[.。!]+$/u, "");
  return line.length > 160 ? `${line.slice(0, 157).trimEnd()}…` : line;
}
