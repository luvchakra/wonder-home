import type { HomeAssessment } from "../home/assessment";
import { isoDate } from "../home/assessment";

/**
 * School communications and documents (stories 08-006, 08-007).
 *
 * A school sends a great deal that is not addressed to any particular family.
 * The product rule is the same as everywhere else: something arriving is not a
 * reason to interrupt anyone. What earns a place in front of a parent is the
 * subset that asks the household to do something, and this module's job is to
 * find that subset and state what the something is.
 *
 * What is kept is a summary, never the original. School mail routinely names
 * other people's children, and a household's inbox is not a place to accumulate
 * them.
 */

export type SchoolCommunication = {
  id: string;
  childMemberId: string | null;
  receivedAt: Date;
  subject: string | null;
  summary: string;
  requiresAction: boolean;
  actionLabel: string | null;
  actionDueAt: Date | null;
};

/** Phrases that reliably mean a school wants something back from a family. */
const ASK_MARKERS = [
  "consent",
  "permission",
  "sign",
  "signature",
  "confirm",
  "rsvp",
  "reply",
  "return",
  "bring",
  "pay",
  "fee",
  "deadline",
  "by friday",
  "by monday",
];

export type Classification = {
  requiresAction: boolean;
  /** What the household has to do, in a few words, or null when nothing. */
  actionLabel: string | null;
  reason: string;
};

/**
 * Whether a message asks anything of the household (08-007).
 *
 * Deliberately conservative in one direction only: an explicit due date or an
 * unmistakable ask counts, and everything else is filed. A newsletter promoted
 * to an action teaches a family to ignore the ones that matter, which costs
 * more than a missed newsletter ever could.
 */
export function classify(input: {
  subject?: string | null;
  body: string;
  dueAt?: Date | null;
}): Classification {
  const text = `${input.subject ?? ""} ${input.body}`.toLowerCase();
  const marker = ASK_MARKERS.find((candidate) => text.includes(candidate));

  if (input.dueAt) {
    return {
      requiresAction: true,
      actionLabel: marker ? labelFor(marker) : "Respond to the school",
      reason: "The school gave a date.",
    };
  }

  if (marker) {
    return {
      requiresAction: true,
      actionLabel: labelFor(marker),
      reason: `The message asks the household to ${marker}.`,
    };
  }

  return { requiresAction: false, actionLabel: null, reason: "Nothing is being asked of the household." };
}

function labelFor(marker: string): string {
  switch (marker) {
    case "consent":
    case "permission":
    case "sign":
    case "signature":
      return "Give permission";
    case "pay":
    case "fee":
      return "Pay the school";
    case "rsvp":
    case "reply":
    case "confirm":
      return "Reply to the school";
    case "bring":
    case "return":
      return "Send something in";
    default:
      return "Respond to the school";
  }
}

/** How long before a school deadline the household should hear about it. */
export const SCHOOL_ACTION_LEAD_DAYS = 3;

/**
 * Whether a communication needs somebody now.
 *
 * A message that asks for something next month is filed until it is nearly due;
 * the same message the day before is the most important thing on the screen.
 */
export function assessCommunication(
  communication: SchoolCommunication,
  now: Date = new Date(),
): HomeAssessment {
  const subjectKey = `school_message.${communication.id}`;
  const title = communication.subject ?? "A message from school";

  if (!communication.requiresAction) {
    return {
      subjectKey,
      title,
      status: "on_track",
      riskLevel: "none",
      notable: false,
      reason: communication.summary,
      action: null,
      dueOn: null,
    };
  }

  if (!communication.actionDueAt) {
    return {
      subjectKey,
      title,
      status: "pending",
      riskLevel: "low",
      notable: true,
      reason: communication.summary,
      action: { action: "school_respond", target: communication.id },
      dueOn: null,
    };
  }

  const daysUntil = Math.floor(
    (communication.actionDueAt.getTime() - now.getTime()) / 86_400_000,
  );

  if (daysUntil < 0) {
    return {
      subjectKey,
      title,
      status: "missed",
      riskLevel: "high",
      notable: true,
      reason: `${communication.summary} The school's date has passed.`,
      action: { action: "school_respond", target: communication.id },
      dueOn: isoDate(communication.actionDueAt),
    };
  }

  if (daysUntil <= SCHOOL_ACTION_LEAD_DAYS) {
    return {
      subjectKey,
      title,
      status: "at_risk",
      riskLevel: daysUntil === 0 ? "high" : "medium",
      notable: true,
      reason: `${communication.summary} Due ${daysUntil === 0 ? "today" : `in ${daysUntil} days`}.`,
      action: { action: "school_respond", target: communication.id },
      dueOn: isoDate(communication.actionDueAt),
    };
  }

  return {
    subjectKey,
    title,
    status: "pending",
    riskLevel: "none",
    notable: false,
    reason: communication.summary,
    action: null,
    dueOn: isoDate(communication.actionDueAt),
  };
}

export type SchoolDocument = {
  id: string;
  childMemberId: string;
  title: string;
  storagePath: string;
  source: "uploaded" | "provider" | "generated";
  createdAt: Date;
};

export type DocumentAccess =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Whether this caller may open a child's school document (08-006).
 *
 * Guardianship, not household membership. Everyone in a house can see that a
 * child has homework; a worksheet with a teacher's comments on it is narrower,
 * and the same rule is enforced again by RLS so that an API mistake is not the
 * only thing standing in the way.
 */
export function mayOpenDocument(input: {
  document: Pick<SchoolDocument, "childMemberId">;
  callerMemberId: string;
  guardianOf: readonly string[];
  isAdministrator: boolean;
}): DocumentAccess {
  if (input.callerMemberId === input.document.childMemberId) return { allowed: true };
  if (input.guardianOf.includes(input.document.childMemberId)) return { allowed: true };
  if (input.isAdministrator) return { allowed: true };

  return {
    allowed: false,
    // Says nothing about whether the document exists: a refusal that confirms
    // the file is a refusal that leaked something.
    reason: "This is not yours to open.",
  };
}
