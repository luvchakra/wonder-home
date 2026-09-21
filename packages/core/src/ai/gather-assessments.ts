import type { SupabaseClient } from "@supabase/supabase-js";

import { financeAgenda } from "../finance/repository";
import { familyAgenda } from "../family/repository";
import type { HomeAssessment } from "../home/assessment";
import { homeAgenda } from "../home/repository";
import { mealAgenda } from "../meals/repository";
import { shoppingAgenda } from "../commerce/repository";
import { schoolAgenda } from "../school/repository";

/**
 * One household's full assessed state, gathered for `coordinate()` (14-007).
 *
 * Every domain already produces its own agenda for its own screen — module
 * 13's six `*Agenda()` functions, each a flat object of one or more
 * `HomeAssessment[]` fields plus a `checked` count. Nothing before this
 * merged them into the one list a specialist run needs; this is that merge,
 * and nothing else — nine known-good reads, no new domain logic.
 */
export async function householdAssessments(
  supabase: SupabaseClient,
  householdId: string,
  now: Date = new Date(),
): Promise<readonly HomeAssessment[]> {
  const [meals, finance, shopping, home, family, school] = await Promise.all([
    mealAgenda(supabase, householdId, { now }),
    financeAgenda(supabase, householdId, { now }),
    shoppingAgenda(supabase, householdId, { now }),
    homeAgenda(supabase, householdId, { now }),
    familyAgenda(supabase, householdId, { now }),
    schoolAgenda(supabase, householdId, { now }),
  ]);

  return [
    ...meals.meals,
    ...finance.bills,
    ...finance.anomalies,
    ...shopping.needed,
    ...shopping.lateOrders,
    ...home.maintenance,
    ...home.laundry,
    ...home.pets,
    ...home.services,
    ...family.events,
    ...family.gifts,
    ...family.conflicts,
    ...school.deadlines,
    ...school.messages,
  ];
}
