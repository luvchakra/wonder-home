import { REMINDER_POLICIES, planStages, placeOutsideQuiet, presetFor, storedPriority, withLearnedTime, type ReminderPriority } from "./policies";
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
  /**
   * When this person usually acts on this kind of reminder, in minutes after
   * local midnight — only when they asked WonderHome to learn it, chose no
   * timing of their own, and there is enough evidence (story 23-012).
   */
  learnedMinute?: number | null;
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
  /** Whether this is the policy's last reminder for the thing. */
  finalStage: boolean;
  /** "learned" only when a learned time actually moved this reminder. */
  timing: "policy" | "learned";
  /** The records a grouped reminder stands for. */
  items?: readonly string[];
  /** Who the backup is standing in for, when this is an escalation. */
  escalatedFrom?: string;
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

  const policyPreset = presetFor(subject.category, settings.preset);
  const learnedPreset =
    settings.learnedMinute != null && REMINDER_POLICIES[subject.category].learnsTiming
      ? withLearnedTime(policyPreset, settings.learnedMinute)
      : null;
  const preset = learnedPreset ?? policyPreset;
  const allStages = planStages(preset, subject.anchor, timeZone);
  const stages = allStages.filter((stage) => stage.seq > closedSeq);
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
    finalStage: chosen.seq === allStages.length,
    // Only claim the learned time when it is the stage that moved (spec §23).
    timing: learnedPreset && chosen.key === preset.stages[0]?.key && chosen.seq === 1 ? "learned" : "policy",
    ...(subject.items ? { items: subject.items } : {}),
  };
}

/**
 * The responsibility's backup, when there is one who is not already the
 * person being reminded (spec §20).
 */
export function backupFor(subject: ReminderSubject, directory: Directory, primaryId: string): string | null {
  for (const key of subject.outcomeKeys) {
    const backup = directory.responsibilities.get(key)?.backup;
    if (!backup || backup === primaryId) continue;
    const member = directory.members.get(backup);
    if (member && member.active && member.hasAccount && member.memberType !== "child") return backup;
  }
  return null;
}

/**
 * The one reminder a backup gets when the responsible person has not dealt
 * with the last reminder (story 23-010).
 *
 * Only for a policy that escalates, only once the primary's final reminder
 * has been out for the policy's wait, and only ever one: a backup who has
 * dismissed it (`closedSeq`) is not asked again. The backup's own quiet hours
 * and settings still apply.
 */
export function planEscalation(
  primary: DesiredReminder,
  backupId: string,
  primaryName: string,
  settings: RecipientSettings,
  closedSeq: number,
  timeZone: string,
  now: Date,
): DesiredReminder | null {
  if (!settings.enabled || closedSeq >= primary.reminderSeq || now >= primary.expiresAt) return null;
  const placement = placeOutsideQuiet(now, { earliestAt: null, latestAt: primary.expiresAt }, settings.quiet, timeZone, primary.priority === "high");
  const scheduledFor = placement.moved === "none" ? now : placement.at;
  if (scheduledFor >= primary.expiresAt) return null;
  return {
    ...primary,
    recipientMemberId: backupId,
    recipientRole: "backup",
    scheduledFor,
    earliestAt: scheduledFor,
    latestAt: primary.expiresAt,
    body: `${primary.body} ${primaryName} has not marked it done yet.`,
    placement: placement.moved,
    timing: "policy",
    escalatedFrom: primary.recipientMemberId,
  };
}

/**
 * Whether the primary's reminder has gone unanswered long enough for the
 * backup to hear about it: it is the policy's last reminder, it reached them,
 * and nobody has acted, dismissed or snoozed it since.
 */
export function isUnanswered(
  primary: DesiredReminder,
  open: { reminder_seq: number; status: string; delivered_at: string | null; snooze_count: number } | undefined,
  now: Date,
): boolean {
  const escalation = REMINDER_POLICIES[primary.category].escalation;
  if (!escalation || !primary.finalStage || !open) return false;
  if (open.reminder_seq !== primary.reminderSeq || (open.status !== "delivered" && open.status !== "seen")) return false;
  if (!open.delivered_at) return false;
  return now.getTime() - new Date(open.delivered_at).getTime() >= escalation.afterMinutes * 60_000;
}

