import { isoDate, silent, type HomeAssessment } from "./assessment";

/**
 * Service coordination (story 13-006).
 *
 * The acceptance criterion is precise about why this table exists: a service
 * request tracks provider, status and next action *so that unresolved
 * maintenance becomes actionable rather than informational*. A list of open
 * tickets is informational. Knowing that the technician said he would call back
 * on Tuesday and it is now Thursday is actionable, and the difference is whose
 * move it is.
 */

export const SERVICE_STATUSES = [
  "requested",
  "scheduled",
  "in_progress",
  "awaiting_parts",
  "completed",
  "cancelled",
] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export type ServiceRequest = {
  id: string;
  assetId: string | null;
  subject: string;
  providerName: string | null;
  providerContact: string | null;
  status: ServiceStatus;
  scheduledFor: Date | null;
  /** What has to happen next, in the household's words. */
  nextAction: string | null;
  /** Whose move it is. This is the field that makes the record actionable. */
  nextActionBy: "household" | "provider" | null;
  updatedAt: Date;
};

/**
 * Which statuses may follow which.
 *
 * A finished request does not reopen: the work either came back, in which case
 * it is a new request against the same asset and the history stays readable, or
 * it did not.
 */
const TRANSITIONS: Record<ServiceStatus, readonly ServiceStatus[]> = {
  requested: ["scheduled", "cancelled", "in_progress"],
  scheduled: ["in_progress", "awaiting_parts", "cancelled", "completed"],
  in_progress: ["awaiting_parts", "completed", "cancelled"],
  awaiting_parts: ["in_progress", "scheduled", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransition(from: ServiceStatus, to: ServiceStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export type TransitionResult =
  | { ok: true; request: ServiceRequest }
  | { ok: false; reason: string };

export function transition(
  request: ServiceRequest,
  to: ServiceStatus,
  update: { at: Date; nextAction?: string | null; nextActionBy?: ServiceRequest["nextActionBy"]; scheduledFor?: Date | null },
): TransitionResult {
  if (!canTransition(request.status, to)) {
    return { ok: false, reason: `A ${request.status} request cannot become ${to}.` };
  }

  const settled = to === "completed" || to === "cancelled";
  return {
    ok: true,
    request: {
      ...request,
      status: to,
      updatedAt: update.at,
      scheduledFor: update.scheduledFor !== undefined ? update.scheduledFor : request.scheduledFor,
      // A settled request has no next action by definition, and leaving a stale
      // one behind is how a closed thing keeps generating work.
      nextAction: settled ? null : (update.nextAction ?? request.nextAction),
      nextActionBy: settled ? null : (update.nextActionBy ?? request.nextActionBy),
    },
  };
}

/**
 * How long a request may sit without movement before it is worth chasing.
 *
 * Waiting on a provider gets more rope than waiting on the household, because
 * chasing a technician the same afternoon is not reasonable — and because when
 * it is the household's own move, nobody else is going to make it.
 */
export const STALL_DAYS: Record<"household" | "provider", number> = {
  household: 2,
  provider: 5,
};

export function assessServiceRequest(request: ServiceRequest, now: Date = new Date()): HomeAssessment {
  const subjectKey = `service.${request.id}`;

  if (request.status === "completed" || request.status === "cancelled") {
    return silent(subjectKey, request.subject, "This request is settled.");
  }

  // A visit due today or overdue with nothing recorded since is the household's
  // to check — a technician who never arrived is exactly the case where the app
  // knowing nothing means something went wrong.
  if (request.scheduledFor && request.scheduledFor < now && request.status === "scheduled") {
    return {
      subjectKey,
      title: request.subject,
      status: "at_risk",
      riskLevel: "medium",
      notable: true,
      reason: `${request.subject}: the visit was due and nothing has been recorded since.`,
      action: { action: "confirm_visit", target: request.id },
      dueOn: isoDate(request.scheduledFor),
    };
  }

  const owner = request.nextActionBy;
  if (!owner) {
    // An open request with nobody's name on the next step is the informational
    // state this story exists to eliminate.
    return {
      subjectKey,
      title: request.subject,
      status: "blocked",
      riskLevel: "medium",
      notable: true,
      reason: `${request.subject} is open with no next step.`,
      action: { action: "set_next_action", target: request.id },
      dueOn: null,
    };
  }

  const idleDays = (now.getTime() - request.updatedAt.getTime()) / 86_400_000;
  if (idleDays >= STALL_DAYS[owner]) {
    return {
      subjectKey,
      title: request.subject,
      status: "at_risk",
      riskLevel: owner === "household" ? "medium" : "low",
      notable: true,
      reason:
        owner === "provider"
          ? `${request.subject}: no word from ${request.providerName ?? "the provider"} for ${Math.floor(idleDays)} days.`
          : `${request.subject}: waiting on us for ${Math.floor(idleDays)} days — ${request.nextAction ?? "no action recorded"}.`,
      action:
        owner === "provider"
          ? { action: "chase_provider", target: request.id }
          : { action: "do_next_action", target: request.id },
      dueOn: null,
    };
  }

  return silent(subjectKey, request.subject, `${request.subject} is moving along.`);
}

/** Open requests, so an asset assessment can stay quiet while one is live. */
export function openRequestAssetIds(requests: readonly ServiceRequest[]): Set<string> {
  return new Set(
    requests
      .filter((request) => request.status !== "completed" && request.status !== "cancelled")
      .map((request) => request.assetId)
      .filter((assetId): assetId is string => assetId !== null),
  );
}
