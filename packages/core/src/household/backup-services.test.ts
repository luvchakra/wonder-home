import { describe, expect, it } from "vitest";

import { coverKey, coverSubject, planBackupCoverage, type BackupService } from "./backup-services";

const ASHA = "helper-asha";
const RAVI = "helper-ravi";

const responsibilities = [
  { outcomeKey: "home.cleaning", outcomeName: "Clean home", primaryMemberId: ASHA, backupMemberId: null, priority: 1 },
  { outcomeKey: "home.laundry", outcomeName: "Laundry done", primaryMemberId: ASHA, backupMemberId: "adult-priya", priority: 2 },
  { outcomeKey: "meals.dinner", outcomeName: "Dinner ready", primaryMemberId: ASHA, backupMemberId: null, priority: 3 },
  { outcomeKey: "home.garden", outcomeName: "Garden watered", primaryMemberId: RAVI, backupMemberId: null, priority: 1 },
];

const service = (over: Partial<BackupService> = {}): BackupService => ({
  id: "svc-1",
  name: "Sparkle Cleaning",
  contact: "+91 98000 00000",
  covers: ["home.cleaning"],
  notes: null,
  active: true,
  ...over,
});

describe("backup cover while a helper is away (story 07-008)", () => {
  it("lists only what an absence leaves uncovered — a member's backup is handled, and handled is silent", () => {
    const items = planBackupCoverage({
      absences: [{ memberId: ASHA, onDate: "2026-09-30", reason: null }],
      responsibilities,
      services: [service()],
      arranged: new Set(),
    });
    expect(items.map((item) => [item.outcomeKey, item.state])).toEqual([
      ["home.cleaning", "service_available"],
      ["meals.dinner", "nobody"],
    ]);
    expect(items[0]?.services.map((entry) => entry.name)).toEqual(["Sparkle Cleaning"]);
  });

  it("looks only at the absent helper's own outcomes", () => {
    const items = planBackupCoverage({
      absences: [{ memberId: RAVI, onDate: "2026-09-30", reason: "Festival" }],
      responsibilities,
      services: [service()],
      arranged: new Set(),
    });
    expect(items.map((item) => item.outcomeKey)).toEqual(["home.garden"]);
    expect(items[0]?.state).toBe("nobody");
  });

  it("says a day is arranged once a cover request stands, and never suggests a retired service", () => {
    const items = planBackupCoverage({
      absences: [
        { memberId: ASHA, onDate: "2026-10-02", reason: null },
        { memberId: ASHA, onDate: "2026-09-30", reason: null },
      ],
      responsibilities,
      services: [service(), service({ id: "svc-2", name: "Old Cleaners", active: false })],
      arranged: new Set([coverKey("home.cleaning", "2026-09-30")]),
    });
    const cleaning = items.filter((item) => item.outcomeKey === "home.cleaning");
    expect(cleaning.map((item) => [item.date, item.state])).toEqual([
      ["2026-09-30", "arranged"],
      ["2026-10-02", "service_available"],
    ]);
    expect(cleaning[1]?.services.map((entry) => entry.name)).toEqual(["Sparkle Cleaning"]);
  });

  it("is quiet when nothing is away", () => {
    expect(planBackupCoverage({ absences: [], responsibilities, services: [service()], arranged: new Set() })).toEqual([]);
  });

  it("words a cover request plainly, within the service-request subject limit", () => {
    expect(coverSubject("Clean home", "2026-09-30")).toBe("Cover clean home on 2026-09-30");
    expect(coverSubject("x".repeat(300), "2026-09-30").length).toBeLessThanOrEqual(160);
  });
});
