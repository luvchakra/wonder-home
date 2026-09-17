import { addDays, daysBetween, isoDate, parseDate, silent, type HomeAssessment } from "./assessment";

/**
 * Pet care outcomes (story 13-007).
 *
 * The animal does not care whose turn it was, and neither does this module. It
 * holds the same shape as maintenance and laundry — outcome, deadline, one
 * responsible person, silence when things are fine — because a pet is a member
 * of the household with needs, not a category of chore.
 *
 * Medication is handled differently from everything else on purpose. A missed
 * grooming is an inconvenience; a missed dose is a veterinary problem, and the
 * two should never be allowed to look alike in a list.
 */

export const PET_CARE_KINDS = [
  "food",
  "litter",
  "medication",
  "vet_visit",
  "grooming",
  "exercise",
] as const;
export type PetCareKind = (typeof PET_CARE_KINDS)[number];

export type Pet = {
  id: string;
  name: string;
  species: string;
};

export type PetCareNeed = {
  id: string;
  pet: Pet;
  kind: PetCareKind;
  /** How often this comes round. Null for one-off things like an appointment. */
  intervalDays: number | null;
  lastDoneOn: string | null;
  /** Set directly for appointments, which have a date rather than a rhythm. */
  dueOn: string | null;
  responsibleMemberId: string | null;
  /** Days of supplies left, where the household tracks it. */
  supplyDaysRemaining: number | null;
};

/**
 * How far ahead each kind becomes worth acting on.
 *
 * A vet appointment needs booking time; food needs to be bought before the bowl
 * is empty, not when it is.
 */
export const PET_LEAD_DAYS: Record<PetCareKind, number> = {
  medication: 1,
  food: 3,
  litter: 3,
  vet_visit: 7,
  grooming: 5,
  exercise: 0,
};

const KIND_RISK: Record<PetCareKind, "high" | "medium" | "low"> = {
  medication: "high",
  vet_visit: "medium",
  food: "medium",
  litter: "low",
  grooming: "low",
  exercise: "low",
};

export function nextDue(need: PetCareNeed, now: Date): Date | null {
  const explicit = parseDate(need.dueOn);
  if (explicit) return explicit;

  if (need.intervalDays === null) return null;
  const last = parseDate(need.lastDoneOn);
  return addDays(last ?? now, need.intervalDays);
}

export function assessPetCare(need: PetCareNeed, now: Date = new Date()): HomeAssessment {
  const subjectKey = `pet.${need.pet.id}.${need.kind}`;
  const due = nextDue(need, now);

  // Supplies run out before a schedule says they should, and the household
  // notices the empty bag rather than the calendar.
  if (need.supplyDaysRemaining !== null && need.supplyDaysRemaining <= PET_LEAD_DAYS[need.kind]) {
    return {
      subjectKey,
      status: need.supplyDaysRemaining <= 0 ? "blocked" : "at_risk",
      riskLevel: need.supplyDaysRemaining <= 0 ? "high" : KIND_RISK[need.kind],
      notable: true,
      reason:
        need.supplyDaysRemaining <= 0
          ? `${need.pet.name} has run out of ${describeKind(need.kind)}.`
          : `${need.pet.name} has about ${need.supplyDaysRemaining} days of ${describeKind(need.kind)} left.`,
      action: { action: "order_supplies", target: need.id },
      dueOn: isoDate(addDays(now, Math.max(0, need.supplyDaysRemaining))),
    };
  }

  if (!due) return silent(subjectKey, `${need.pet.name}'s ${describeKind(need.kind)} needs nothing scheduled.`);

  const daysUntil = daysBetween(now, due);

  if (daysUntil < 0) {
    return {
      subjectKey,
      status: "missed",
      riskLevel: need.kind === "medication" ? "high" : KIND_RISK[need.kind],
      notable: true,
      reason:
        need.kind === "medication"
          ? `${need.pet.name}'s medication was due ${Math.abs(daysUntil)} days ago.`
          : `${need.pet.name}'s ${describeKind(need.kind)} was due ${Math.abs(daysUntil)} days ago.`,
      action: { action: actionFor(need.kind), target: need.id },
      dueOn: isoDate(due),
    };
  }

  if (daysUntil <= PET_LEAD_DAYS[need.kind]) {
    return {
      subjectKey,
      status: "at_risk",
      riskLevel: KIND_RISK[need.kind],
      notable: true,
      reason: `${need.pet.name}'s ${describeKind(need.kind)} is due ${daysUntil === 0 ? "today" : `in ${daysUntil} days`}.`,
      action: { action: actionFor(need.kind), target: need.id },
      dueOn: isoDate(due),
    };
  }

  return silent(subjectKey, `${need.pet.name} is looked after.`);
}

function actionFor(kind: PetCareKind): string {
  switch (kind) {
    case "vet_visit":
      return "book_appointment";
    case "food":
    case "litter":
      return "order_supplies";
    case "medication":
      return "give_medication";
    case "grooming":
      return "arrange_grooming";
    case "exercise":
      return "plan_walk";
  }
}

function describeKind(kind: PetCareKind): string {
  switch (kind) {
    case "vet_visit":
      return "vet visit";
    case "medication":
      return "medication";
    case "food":
      return "food";
    case "litter":
      return "litter";
    case "grooming":
      return "grooming";
    case "exercise":
      return "exercise";
  }
}

/** The pet needs worth showing, most urgent first, and nothing else. */
export function petAgenda(needs: readonly PetCareNeed[], now: Date = new Date()): HomeAssessment[] {
  const order = { high: 0, medium: 1, low: 2, none: 3 } as const;

  return needs
    .map((need) => assessPetCare(need, now))
    .filter((assessment) => assessment.notable)
    .sort((a, b) => order[a.riskLevel] - order[b.riskLevel] || (a.dueOn ?? "").localeCompare(b.dueOn ?? ""));
}
