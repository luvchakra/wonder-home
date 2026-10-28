import type { SupabaseClient } from "@supabase/supabase-js";

import { may } from "@wonderhome/core/billing/repository";
import type { Consumable } from "@wonderhome/core/commerce/consumables";
import { shoppingAgenda } from "@wonderhome/core/commerce/repository";
import type { FamilyEvent } from "@wonderhome/core/family/schedule";
import { familyAgenda } from "@wonderhome/core/family/repository";
import { financeAgenda } from "@wonderhome/core/finance/repository";
import type { Obligation } from "@wonderhome/core/finance/payments";
import type { HomeAssessment } from "@wonderhome/core/home/assessment";
import { homeAgenda } from "@wonderhome/core/home/repository";
import type { PersonalView } from "@wonderhome/core/identity/views";
import type { Meal } from "@wonderhome/core/meals/meals";
import { mealAgenda } from "@wonderhome/core/meals/repository";
import type { SchoolItem } from "@wonderhome/core/school/items";
import { schoolAgenda } from "@wonderhome/core/school/repository";

/**
 * Everything across the household that currently needs a person, gathered
 * for the Home screen — and, just as importantly, everything that did not.
 *
 * Each domain is read only if this member may see it and the plan includes
 * it, and each is isolated: one domain failing to load costs the screen that
 * domain's rows, never the whole page. The rows themselves come from the
 * domain engines; nothing here composes its own reason for showing something.
 */
export type DomainSummary = {
  key: "home" | "school" | "shopping" | "meals" | "bills" | "family";
  label: string;
  href: string;
  needs: HomeAssessment[];
  /** Subjects the domain evaluated; the difference from `needs` is what it handled quietly. */
  checked: number;
  failed: boolean;
};

export type HouseholdAgenda = {
  domains: DomainSummary[];
  needsYou: HomeAssessment[];
  handled: { key: string; title: string; meta?: string }[];
  checked: number;
};

/**
 * Rows a screen reads anyway, handed to the agenda so one request reads each
 * table once (performance audit B4). Each is the same promise the screen
 * awaits; the agenda keeps the rows its own read would have returned, so
 * every count, "N of M checked" included, is unchanged. `events` is a
 * `listEvents` read from now or earlier and `meals` a `listMeals` read from
 * today (UTC) or earlier, neither with an upper bound; the rest are whole
 * reads. Only pass one the agenda reads for this person (`agendaReads`).
 */
export type AgendaRows = {
  events?: Promise<FamilyEvent[]>;
  meals?: Promise<Meal[]>;
  obligations?: Promise<Obligation[]>;
  schoolItems?: Promise<SchoolItem[]>;
  consumables?: Promise<Consumable[]>;
};

/** Which of those tables `householdAgenda` reads for this person, so a screen shares only those. */
export function agendaReads(view: PersonalView): Record<keyof AgendaRows, boolean> {
  const permitted = (permission: string) => view.permissions.includes(permission as never);
  const adult = view.tone !== "child";
  return {
    events: true,
    meals: adult,
    consumables: adult,
    obligations: permitted("finance.view"),
    schoolItems: permitted("school.manage") || permitted("school.view_own"),
  };
}

const RISK_ORDER: Record<HomeAssessment["riskLevel"], number> = { high: 0, medium: 1, low: 2, none: 3 };

export async function householdAgenda(supabase: SupabaseClient, householdId: string, view: PersonalView, rows: AgendaRows = {}): Promise<HouseholdAgenda> {
  const permitted = (permission: string) => view.permissions.includes(permission as never);
  const readers: Array<() => Promise<DomainSummary | null>> = [];

  if (view.tone !== "child") {
    readers.push(() => summarize("home", "Home & upkeep", "/household/home", async () => {
      const agenda = await homeAgenda(supabase, householdId);
      return { needs: [...agenda.maintenance, ...agenda.services, ...agenda.laundry, ...agenda.pets], checked: agenda.checked };
    }));
  }

  if (permitted("school.manage") || permitted("school.view_own")) {
    readers.push(() => gated(supabase, householdId, "school.connector", () => summarize("school", "School", "/school", async () => {
      const agenda = await schoolAgenda(supabase, householdId, { items: await rows.schoolItems });
      return { needs: [...agenda.deadlines, ...agenda.messages], checked: agenda.checked };
    })));
  }

  if (view.tone !== "child") {
    readers.push(() => gated(supabase, householdId, "groceries.core", () => summarize("shopping", "Groceries", "/groceries", async () => {
      const agenda = await shoppingAgenda(supabase, householdId, { consumables: await rows.consumables });
      return { needs: [...agenda.needed, ...agenda.lateOrders], checked: agenda.checked };
    })));
    readers.push(() => gated(supabase, householdId, "meals.planning", () => summarize("meals", "Meals", "/meals", async () => {
      const agenda = await mealAgenda(supabase, householdId, { meals: await rows.meals });
      return { needs: agenda.meals, checked: agenda.checked };
    })));
  }

  if (permitted("finance.view")) {
    readers.push(() => gated(supabase, householdId, "finance.bills", () => summarize("bills", "Bills", "/bills", async () => {
      const agenda = await financeAgenda(supabase, householdId, { obligations: await rows.obligations });
      return { needs: [...agenda.bills, ...agenda.anomalies], checked: agenda.checked };
    })));
  }

  readers.push(() => gated(supabase, householdId, "family.events", () => summarize("family", "Family time", "/family", async () => {
    const agenda = await familyAgenda(supabase, householdId, { events: await rows.events });
    return { needs: [...agenda.events, ...agenda.gifts, ...agenda.conflicts], checked: agenda.checked };
  })));

  const domains = (await Promise.all(readers.map((read) => read()))).filter((domain): domain is DomainSummary => domain !== null);
  return fromDomains(domains);
}

/**
 * The same agenda with only some domains in it — a linked voice assistant
 * hears only the domains its scopes open (voice phase 2).
 */
export function narrowAgenda(agenda: HouseholdAgenda, keep: (key: DomainSummary["key"]) => boolean): HouseholdAgenda {
  return fromDomains(agenda.domains.filter((domain) => keep(domain.key)));
}

function fromDomains(domains: DomainSummary[]): HouseholdAgenda {
  const needsYou = domains
    .flatMap((domain) => domain.needs)
    .sort((a, b) => RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel] || (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));

  const handled = domains
    .filter((domain) => !domain.failed && domain.checked > 0 && domain.checked - domain.needs.length > 0)
    .map((domain) => {
      const quiet = domain.checked - domain.needs.length;
      return {
        key: domain.key,
        title: domain.label,
        meta: `${quiet} of ${domain.checked} checked, nothing needed`,
      };
    });

  return { domains, needsYou, handled, checked: domains.reduce((total, domain) => total + domain.checked, 0) };
}

async function summarize(
  key: DomainSummary["key"],
  label: string,
  href: string,
  read: () => Promise<{ needs: HomeAssessment[]; checked: number }>,
): Promise<DomainSummary> {
  try {
    const { needs, checked } = await read();
    return { key, label, href, needs, checked, failed: false };
  } catch {
    return { key, label, href, needs: [], checked: 0, failed: true };
  }
}

/**
 * Skips a domain the plan does not include, so nothing is promised the plan
 * cannot keep. The domain's own read starts alongside the plan check rather
 * than after it: it is the household's own rows through its own access rules,
 * so reading them early exposes nothing, and a refused domain's answer is
 * simply never shown.
 */
async function gated(
  supabase: SupabaseClient,
  householdId: string,
  feature: string,
  read: () => Promise<DomainSummary>,
): Promise<DomainSummary | null> {
  const [decision, summary] = await Promise.all([
    may(supabase, householdId, feature).catch(() => null),
    read(),
  ]);
  return decision?.allowed ? summary : null;
}
