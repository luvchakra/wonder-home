import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { HouseholdMember } from "../identity/households";
import { loadOnboardingFacts, type OnboardingState } from "./onboarding-repository";

/** Only `school_enrolments` is read; anything else would be a second read of rows Home already has. */
function enrolmentsOnly(rows: Record<string, unknown>[]) {
  const reads: string[] = [];
  const client = {
    from(table: string) {
      reads.push(table);
      const query = { select: () => query, eq: () => query, then: (resolve: (result: { data: unknown[]; error: null }) => unknown) => resolve({ data: table === "school_enrolments" ? rows : [], error: null }) };
      return query;
    },
  };
  return { supabase: client as unknown as SupabaseClient, reads };
}

const member = (id: string, memberType: string, extra: Partial<HouseholdMember> = {}) =>
  ({ id, displayName: id, memberType, status: "active", relationship: null, workArrangement: null, ageYears: null, occupation: null, ...extra }) as unknown as HouseholdMember;

const STATE: OnboardingState = {
  status: "in_progress" as OnboardingState["status"],
  step: "welcome" as OnboardingState["step"],
  composition: { adults: 1, children: 1, pets: 1, helpers: 2 },
  dismissed: [],
  startedAt: "2026-10-28T00:00:00.000Z",
  completedAt: null,
};

describe("setup's facts from rows Home already read (audit B7)", () => {
  it("works them out as the snapshot does, reading only the school enrolments", async () => {
    const { supabase, reads } = enrolmentsOnly([{ child_member_id: "kid", school_name: "Green Valley", grade: null, place_id: null, school_address: null, latitude: null, longitude: null, starts_at: null, ends_at: null }]);
    const facts = await loadOnboardingFacts(supabase, "h1", STATE, {
      members: Promise.resolve([member("asha", "adult"), member("kid", "child", { ageYears: 8 }), member("ravi", "helper"), member("gita", "helper"), member("old", "adult", { status: "inactive" })]),
      pets: Promise.resolve([{ id: "p1", name: "Bruno", species: "dog" }]),
      responsibilityKeys: Promise.resolve(["school_run"]),
      // Ravi works Monday twice and Wednesday: two days. Gita has no hours.
      availability: Promise.resolve([{ memberId: "ravi", dayOfWeek: 1 }, { memberId: "ravi", dayOfWeek: 1 }, { memberId: "ravi", dayOfWeek: 3 }]),
    });

    expect(reads).toEqual(["school_enrolments"]);
    expect(facts.profile.adults.map((adult) => adult.id)).toEqual(["asha"]);
    expect(facts.profile.children).toEqual([{ id: "kid", name: "kid", age: 8, school: "Green Valley" }]);
    expect(facts.profile.helpers.map((helper) => [helper.id, helper.workingDays])).toEqual([["ravi", 2], ["gita", 0]]);
    expect(facts.helpersWithHours).toBe(1);
    expect(facts.responsibilityKeys).toEqual(["school_run"]);
    expect(facts.pending.some((entry) => entry.key === "school_run")).toBe(false);
  });
});
