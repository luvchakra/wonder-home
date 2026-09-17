import { describe, expect, it } from "vitest";

import { assessPetCare, nextDue, petAgenda, type PetCareNeed } from "./pets";

const NOW = new Date("2026-09-17T09:00:00.000Z");
const cat = { id: "mishti", name: "Mishti", species: "cat" };

const need = (over: Partial<PetCareNeed> = {}): PetCareNeed => ({
  id: "mishti-food",
  pet: cat,
  kind: "food",
  intervalDays: 30,
  lastDoneOn: "2026-09-10",
  dueOn: null,
  responsibleMemberId: null,
  supplyDaysRemaining: null,
  ...over,
});

describe("when pet care falls due", () => {
  it("counts from the last time for anything with a rhythm", () => {
    expect(nextDue(need(), NOW)?.toISOString().slice(0, 10)).toBe("2026-10-10");
  });

  it("uses the date itself for an appointment", () => {
    const appointment = need({ kind: "vet_visit", intervalDays: null, dueOn: "2026-09-20" });

    expect(nextDue(appointment, NOW)?.toISOString().slice(0, 10)).toBe("2026-09-20");
  });
});

describe("what a pet needs", () => {
  it("says nothing when the animal is looked after", () => {
    expect(assessPetCare(need(), NOW).notable).toBe(false);
  });

  it("orders supplies before the bowl is empty, not when it is", () => {
    const assessment = assessPetCare(need({ supplyDaysRemaining: 2 }), NOW);

    expect(assessment.status).toBe("at_risk");
    expect(assessment.action).toEqual({ action: "order_supplies", target: "mishti-food" });
  });

  it("names the pet and the kind of care, not the row id", () => {
    expect(assessPetCare(need({ supplyDaysRemaining: 2 }), NOW).title).toBe("Mishti · food");
  });

  it("treats having run out as blocking", () => {
    const assessment = assessPetCare(need({ supplyDaysRemaining: 0 }), NOW);

    expect(assessment.status).toBe("blocked");
    expect(assessment.riskLevel).toBe("high");
  });

  it("gives a vet appointment enough notice to actually book it", () => {
    const assessment = assessPetCare(
      need({ kind: "vet_visit", intervalDays: null, dueOn: "2026-09-22" }),
      NOW,
    );

    expect(assessment.action).toEqual({ action: "book_appointment", target: "mishti-food" });
  });

  it("never lets a missed dose look like a missed grooming", () => {
    const medication = assessPetCare(
      need({ id: "mishti-med", kind: "medication", intervalDays: 1, lastDoneOn: "2026-09-15" }),
      NOW,
    );
    const grooming = assessPetCare(
      need({ id: "mishti-groom", kind: "grooming", intervalDays: 30, lastDoneOn: "2026-08-01" }),
      NOW,
    );

    expect(medication.riskLevel).toBe("high");
    expect(grooming.riskLevel).toBe("low");
    expect(medication.status).toBe("missed");
  });
});

describe("the pet agenda", () => {
  it("shows what needs doing, most urgent first, and nothing else", () => {
    const agenda = petAgenda(
      [
        need(),
        need({ id: "mishti-med", kind: "medication", intervalDays: 1, lastDoneOn: "2026-09-15" }),
        need({ id: "mishti-litter", kind: "litter", intervalDays: 7, lastDoneOn: "2026-09-12" }),
      ],
      NOW,
    );

    expect(agenda.map((entry) => entry.subjectKey)).toEqual(["pet.mishti.medication", "pet.mishti.litter"]);
  });
});
