import type { Translate } from "../i18n/translate";
import type { TimetableAdded } from "./timetable-apply";

/**
 * What WonderHome says after an exam timetable is read (2026-11-21, the owner:
 * "replies being recieved are confusing"), in this order: what it took it to
 * be; what it did (how many exam days, for whom, in which class; on WhatsApp
 * no dates, per the reply rule in `docs/external-providers.md`); the one
 * question it needs answered, if any; and where to see or undo it.
 */
export function timetableReply(added: TimetableAdded, t: Translate, options: { origin: string; dates?: (iso: string) => string }): string {
  const lines = [t("whatsapp.timetable.lead", { title: added.title ?? t("whatsapp.timetable.untitled") })];
  for (const child of added.children) {
    lines.push(
      options.dates
        ? t("whatsapp.timetable.addedDates", { count: child.count, name: child.name, column: child.column, from: options.dates(child.from), to: options.dates(child.to) })
        : t("whatsapp.timetable.added", { count: child.count, name: child.name, column: child.column }),
    );
  }
  if (added.children.length > 0 && added.checking) lines.push(t("whatsapp.timetable.checking"));
  for (const child of added.asked) lines.push(t("whatsapp.timetable.ask", { name: child.name }));
  const first = added.children[0];
  const link = first ? `${options.origin}/school?child=${first.memberId}#exams` : `${options.origin}/ai`;
  lines.push(t(first ? "whatsapp.timetable.open" : "whatsapp.timetable.answer", { link }));
  return lines.join("\n");
}
