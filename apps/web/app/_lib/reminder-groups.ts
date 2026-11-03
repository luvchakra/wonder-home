import type { ReminderView } from "../_components/reminder-row";

/**
 * The notification center as rows a person can scan (the owner, 2026-11-03:
 * "too many things going on in the notifications. make it crisp and useful").
 *
 * - **One row per thing to decide.** Reminders of the same kind about the
 *   same place (three "A school notice is waiting for your OK", each opening
 *   HomeSend) are one row with a count and one action. Everything HomeSend is
 *   waiting on is one row, because one visit to HomeSend answers all of it.
 * - **Sections by what the reader decides** (design rule 17): what is already
 *   late, what waits for a yes or no, and the rest of today. Within each, most
 *   pressing first, as the reminders arrive (`byUrgency`).
 *
 * Grouping never changes a reminder: each keeps its own row in the table,
 * its own state and its own recipient. A group only says them once.
 */

export type ReminderSection = "overdue" | "approve" | "today";

export const SECTION_ORDER: readonly ReminderSection[] = ["overdue", "approve", "today"];

export type ReminderGroup = {
  key: string;
  /** Every reminder the row stands for, most pressing first. */
  views: ReminderView[];
  /** The one the row speaks for: the most pressing. */
  lead: ReminderView;
  count: number;
};

/** Things that wait for a person's yes, answered on their own screen. */
const APPROVE_SOURCES = new Set(["homesend_item", "approval"]);

/** Which reminders are the same thing said again: one kind, one wording, one place to act. */
export function groupKey(view: ReminderView): string {
  if (view.sourceType === "homesend_item") return "homesend";
  return [view.sourceType ?? view.category, view.title, view.link?.href ?? ""].join("|");
}

/** Collapses alike reminders into one row each, keeping the given order (the first of each group leads). */
export function groupReminders(views: readonly ReminderView[]): ReminderGroup[] {
  const groups = new Map<string, ReminderView[]>();
  for (const view of views) {
    const key = groupKey(view);
    groups.set(key, [...(groups.get(key) ?? []), view]);
  }
  return [...groups].map(([key, members]) => ({ key, views: members, lead: members[0]!, count: members.length }));
}

/** Where a row belongs: late first, then what waits for a yes, then the rest of today. */
export function sectionOf(group: ReminderGroup): ReminderSection {
  if (group.views.some((view) => view.overdue)) return "overdue";
  if (group.lead.sourceType && APPROVE_SOURCES.has(group.lead.sourceType)) return "approve";
  return "today";
}

/** The due reminders, grouped and placed in their sections, in the order the screen shows them. */
export function sectionedGroups(views: readonly ReminderView[]): { section: ReminderSection; groups: ReminderGroup[] }[] {
  const bySection = new Map<ReminderSection, ReminderGroup[]>();
  for (const group of groupReminders(views)) {
    const section = sectionOf(group);
    bySection.set(section, [...(bySection.get(section) ?? []), group]);
  }
  return SECTION_ORDER.filter((section) => bySection.has(section)).map((section) => ({ section, groups: bySection.get(section)! }));
}

/** "Urgent" is said only where it truly is: money or health, high priority, still open. */
export function isUrgent(view: ReminderView): boolean {
  return view.open && view.priority === "high" && (view.category === "bills" || view.category === "appointments");
}

/** The words a grouped row needs, read on the server in the viewer's language. */
export type GroupWords = {
  homesendTitle: (count: number) => string;
  homesendLine: string;
  alike: (count: number) => string;
};

/**
 * One row's view (design rule 4): the name, one line with the key fact said
 * once, and a single thing to do. Marking a thing done needs that one thing,
 * so a row standing for several opens the screen that settles them instead.
 * The rest (the record's details, why it came when it did, a second way in)
 * waits behind a tap on the row (rule 21).
 */
export function rowViewOf(group: ReminderGroup, words: GroupWords): ReminderRowView {
  const { lead, count } = group;
  const homesend = group.key === "homesend";
  const single = count === 1;
  const primary: ReminderRowView["primary"] =
    single && lead.complete ? { kind: "complete", id: lead.id, label: lead.complete.label } : lead.link ? { kind: "link", ...lead.link } : null;
  return {
    key: group.key,
    ids: group.views.map((view) => view.id),
    category: lead.category,
    categoryLabel: lead.categoryLabel,
    title: homesend && !single ? words.homesendTitle(count) : lead.title,
    countLabel: !homesend && !single ? words.alike(count) : null,
    line: homesend && !single ? words.homesendLine : (lead.fact ?? lead.body),
    when: lead.when,
    urgent: group.views.some(isUrgent),
    unread: group.views.some((view) => view.unread),
    open: lead.open,
    closedAs: lead.closedAs,
    primary,
    more: {
      details: single ? lead.details : [],
      reason: single ? lead.reason : null,
      link: primary?.kind === "complete" ? lead.link : null,
      items: single ? [] : group.views.map((view) => ({ id: view.id, title: view.title, line: view.fact ?? view.body, when: view.when })),
    },
  };
}

export type ReminderRowView = {
  key: string;
  /** Every reminder the row stands for; putting it off or "Not needed" applies to each. */
  ids: string[];
  category: ReminderView["category"];
  categoryLabel: string;
  title: string;
  /** "3 like this", when the row stands for more than one of the same. */
  countLabel: string | null;
  line: string;
  when: string;
  urgent: boolean;
  unread: boolean;
  open: boolean;
  closedAs: string | null;
  /** The one thing to do. */
  primary: { kind: "complete"; id: string; label: string } | { kind: "link"; href: string; label: string } | null;
  /** Behind a tap on the row. */
  more: {
    details: readonly { label: string; value: string }[];
    reason: string | null;
    link: { href: string; label: string } | null;
    items: readonly { id: string; title: string; line: string; when: string }[];
  };
};
