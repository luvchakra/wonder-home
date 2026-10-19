import type { SupabaseClient } from "@supabase/supabase-js";

import type { SetupFacts } from "./setup";

const COUNT_KEYS = [
  "members",
  "children",
  "childrenWithBirthdays",
  "childrenWithGuardians",
  "helpers",
  "helperAvailabilityWindows",
  "responsibilities",
  "playbookItems",
  "policies",
  "homeAssets",
  "pets",
  "obligations",
  "foodPreferences",
  "recipes",
  "schoolEnrolments",
  "familyEvents",
] as const;

/**
 * The facts behind the setup percentage, read as counts.
 *
 * One call, `public.household_setup_counts`: every count in one statement,
 * taken through the member's own row-level security (the function is
 * security invoker), so nothing is counted that the member could not read.
 * Where that function is not there yet, it falls back to one head-only count
 * per domain. A domain that fails to answer counts as empty: a stale number
 * beats a screen that will not load.
 */
export async function loadSetupFacts(
  supabase: SupabaseClient,
  household: { id: string; name: string; timezone: string },
): Promise<SetupFacts> {
  try {
    const { data, error } = await supabase.rpc("household_setup_counts", { p_household_id: household.id });
    if (!error && data && typeof data === "object") {
      const counts = data as Record<string, unknown>;
      const facts = { householdName: household.name, timezone: household.timezone } as SetupFacts;
      for (const key of COUNT_KEYS) {
        const value = Number(counts[key] ?? 0);
        facts[key] = Number.isFinite(value) ? value : 0;
      }
      return facts;
    }
  } catch {
    // Fall back to the per-domain counts below.
  }
  return loadSetupFactsByDomain(supabase, household);
}

async function loadSetupFactsByDomain(
  supabase: SupabaseClient,
  household: { id: string; name: string; timezone: string },
): Promise<SetupFacts> {
  const count = async (table: string, refine?: (q: CountQuery) => CountQuery): Promise<number> => {
    try {
      // The builder's generic types grow with every filter and the compiler
      // gives up ("excessively deep"); a count needs none of that precision.
      let query = supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("household_id", household.id) as unknown as CountQuery;
      if (refine) query = refine(query);
      const { count: found } = await query;
      return found ?? 0;
    } catch {
      return 0;
    }
  };

  const [
    members,
    children,
    childrenWithBirthdays,
    childrenWithGuardians,
    helpers,
    helperAvailabilityWindows,
    responsibilities,
    playbookItems,
    policies,
    homeAssets,
    pets,
    obligations,
    foodPreferences,
    recipes,
    schoolEnrolments,
    familyEvents,
  ] = await Promise.all([
    count("household_members", (q) => q.eq("status", "active")),
    count("household_members", (q) => q.eq("status", "active").eq("member_type", "child")),
    count("household_members", (q) => q.eq("status", "active").eq("member_type", "child").not("date_of_birth", "is", null)),
    distinctChildrenWithGuardians(supabase, household.id),
    count("household_members", (q) => q.eq("status", "active").eq("member_type", "helper")),
    count("member_availability"),
    count("responsibilities"),
    count("playbook_items", (q) => q.eq("active", true)),
    count("policies", (q) => q.eq("active", true)),
    count("home_assets", (q) => q.eq("status", "active")),
    count("pets"),
    count("obligations", (q) => q.neq("status", "cancelled")),
    count("food_preferences"),
    count("recipes"),
    count("school_enrolments", (q) => q.eq("active", true)),
    count("family_events", (q) => q.neq("status", "cancelled")),
  ]);

  return {
    householdName: household.name,
    timezone: household.timezone,
    members,
    children,
    childrenWithBirthdays,
    childrenWithGuardians,
    helpers,
    helperAvailabilityWindows,
    responsibilities,
    playbookItems,
    policies,
    homeAssets,
    pets,
    obligations,
    foodPreferences,
    recipes,
    schoolEnrolments,
    familyEvents,
  };
}

type CountQuery = PromiseLike<{ count: number | null }> & {
  eq(column: string, value: unknown): CountQuery;
  neq(column: string, value: unknown): CountQuery;
  not(column: string, operator: string, value: unknown): CountQuery;
};

/** How many distinct children have at least one guardian named. */
async function distinctChildrenWithGuardians(supabase: SupabaseClient, householdId: string): Promise<number> {
  try {
    const { data } = await supabase.from("member_guardians").select("child_member_id").eq("household_id", householdId);
    return new Set(((data as { child_member_id: string }[] | null) ?? []).map((row) => row.child_member_id)).size;
  } catch {
    return 0;
  }
}
