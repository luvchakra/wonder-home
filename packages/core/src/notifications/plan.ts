import { planStages, placeOutsideQuiet, presetFor, storedPriority, type ReminderPriority } from "./policies";
import type { ReminderSubject } from "./sources";
import type { QuietHours } from "./timing";

/**
 * Who hears about a subject, and when (stories 23-003 and 23-004). Pure: the
 * reconcile pass loads the household and hands it here.
 */

export type DirectoryMember = {
  id: string;
  /** Only a member who can sign in can be reminded of anything. */
  hasAccount: boolean;
  active: boolean;
  memberType: "adult" | "child" | "helper";
  isAdmin: boolean;
  isHead: boolean;
};

export type Directory = {
  members: ReadonlyMap<string, DirectoryMember>;
  responsibilities: ReadonlyMap<string, { primary: string | null; backup: string | null }>;
  guardians: ReadonlyMap<string, readonly string[]>;
};

export type ChosenRecipient = { memberId: string; role: "primary" | "backup" | "administrator" };

/**
 * One person, never a broadcast (rule: "do not send every household
 * notification to every person"). The record's own owner first; then whoever
 * holds the responsibility; for a child's school work, their guardians; then
 * the backup; and only when nobody is named, the household's Admin.
 */
export function chooseReminderRecipient(subject: ReminderSubject, directory: Directory): ChosenRecipient | null {
  const reachable = (id: string | null | undefined, allowChild = false): id is string => {
    if (!id) return false;
    const member = directory.members.get(id);
    return Boolean(member && member.active && member.hasAccount && (allowChild || member.memberType !== "child"));
  };

  for (const owner of subject.owners) if (reachable(owner, true)) return { memberId: owner, role: "primary" };
  for (const key of subject.outcomeKeys) {
    const primary = directory.responsibilities.get(key)?.primary;
    if (reachable(primary)) return { memberId: primary, role: "primary" };
  }
  if (subject.childMemberId) {
    for (const guardian of directory.guardians.get(subject.childMemberId) ?? []) {
      if (reachable(guardian)) return { memberId: guardian, role: "primary" };
    }
  }
  for (const key of subject.outcomeKeys) {
    const backup = directory.responsibilities.get(key)?.backup;
    if (reachable(backup)) return { memberId: backup, role: "backup" };
  }
  const admins = [...directory.members.values()]
    .filter((member) => member.isAdmin && reachable(member.id))
    .sort((a, b) => Number(b.isHead) - Number(a.isHead));
  return admins[0] ? { memberId: admins[0].id, role: "administrator" } : null;
}

export type RecipientSettings = {
  /** The person's chosen preset for this category, if any. */
  preset: string | null;
  /** False when they turned this category's reminders off. */
  enabled: boolean;
  quiet: QuietHours | null;
};

export type DesiredReminder = {
  recipientMemberId: string;
  recipientRole: ChosenRecipient["role"];
  threadKey: string;
  category: ReminderSubject["category"];
  sourceType: ReminderSubject["sourceType"];
  sourceId: string | null;
  reminderSeq: number;
  stageKey: string;
  reminderPolicy: string;
  scheduledFor: Date;
  earliestAt: Date;
  latestAt: Date;
  expiresAt: Date;
  title: string;
  body: string;
  priority: ReminderPriority;
  storedPriority: "high" | "normal" | "low";
  action: { action: string; target?: string };
  /** Kept in `decision_factors` so the timing can be explained later. */
  placement: string;
};

/**
 * The one reminder a subject should have right now for this person, or none.
 *
 * `closedSeq` is the highest stage the person already dealt with (acted on or
 * dismissed): those stages never come back, but a later stage still can —
 * dismissing "due in 3 days" does not silence "due today".
 */
export function planReminder(
  subject: ReminderSubject,
  recipient: ChosenRecipient,
  settings: RecipientSettings,
  closedSeq: number,
  timeZone: string,
  now: Date,
): DesiredReminder | null {
  if (!settings.enabled || now >= subject.expiresAt) return null;

  const preset = presetFor(subject.category, settings.preset);
  const stages = planStages(preset, subject.anchor, timeZone).filter((stage) => stage.seq > closedSeq);
  if (stages.length === 0) return null;

  const due = stages.filter((stage) => stage.idealAt <= now);
  const chosen = due[due.length - 1] ?? stages[0]!;
  const next = stages.find((stage) => stage.seq > chosen.seq);
  const latestAt = next && next.idealAt < subject.expiresAt ? next.idealAt : subject.expiresAt;
  const earliestAt = new Date(chosen.idealAt.getTime() - 60 * 60_000);

  // A stage already due is shown now — unless now is quiet, when it waits.
  const from = chosen.idealAt < now ? now : chosen.idealAt;
  const draft = subject.text(chosen.key, from);
  const placement = placeOutsideQuiet(
    from,
    { earliestAt: from === now ? null : earliestAt, latestAt },
    settings.quiet,
    timeZone,
    draft.priority === "high",
  );
  const scheduledFor = placement.moved === "none" ? chosen.idealAt : placement.at;
  if (scheduledFor >= subject.expiresAt) return null;

  const text = subject.text(chosen.key, scheduledFor > now ? scheduledFor : now);
  return {
    recipientMemberId: recipient.memberId,
    recipientRole: recipient.role,
    threadKey: subject.threadKey,
    category: subject.category,
    sourceType: subject.sourceType,
    sourceId: subject.sourceId,
    reminderSeq: chosen.seq,
    stageKey: chosen.key,
    reminderPolicy: `${subject.category}.${preset.key}`,
    scheduledFor,
    earliestAt: earliestAt < scheduledFor ? earliestAt : scheduledFor,
    latestAt: latestAt > scheduledFor ? latestAt : scheduledFor,
    expiresAt: subject.expiresAt,
    title: text.title,
    body: text.body,
    priority: text.priority,
    storedPriority: storedPriority(text.priority),
    action: subject.action,
    placement: placement.moved,
  };
}

