/**
 * The hot reads PERF-15 prices (docs/performance-budgets.md). Each is the SQL
 * shape PostgREST builds for a repository read, run as a signed-in member.
 * `:household` is replaced with the measured household. `indexed` lists
 * relations that must be reached by index, never a sequential scan. `known`
 * says why a relation that should be indexed is not yet; remove the line, and
 * list the relation in `indexed`, when the index lands.
 */
export const QUERIES = [
  {
    id: "family.upcoming-events", // familyAgenda / listEvents({ from: now }) with participants
    indexed: [],
    known: "family_events is sequentially scanned: its only household index is partial (status in proposed/planned/confirmed) and listEvents does not filter on status. PERF follow-up.",
    sql: `select e.id, e.title, e.starts_at, e.ends_at,
            (select coalesce(json_agg(p), '[]') from (select member_id, response, required from public.event_participants p where p.event_id = e.id) p)
          from public.family_events e
          where e.household_id = :household and e.ends_at >= now()
          order by e.starts_at`,
  },
  {
    id: "calendar.day-events", // calendar day view: one day window
    indexed: [],
    known: "Same as family.upcoming-events: the window index is partial and the read has no status filter.",
    sql: `select e.id, e.title, e.starts_at, e.ends_at
          from public.family_events e
          where e.household_id = :household and e.ends_at >= date_trunc('day', now()) and e.starts_at <= date_trunc('day', now()) + interval '1 day'
          order by e.starts_at`,
  },
  {
    id: "meals.upcoming", // mealAgenda / listMeals({ from: today }) with ingredient needs
    indexed: ["meals"],
    sql: `select m.id, m.name, m.slot, m.on_date, m.ready_by, m.status,
            (select coalesce(json_agg(n), '[]') from (select name, quantity, unit, essential, status from public.meal_ingredient_needs n where n.meal_id = m.id) n)
          from public.meals m
          where m.household_id = :household and m.on_date >= current_date
          order by m.ready_by`,
  },
  {
    id: "family.gift-plans", // familyAgenda gift_plans read
    indexed: [],
    known: "gift_plans_open_idx is partial (open statuses) and the read has no status filter.",
    sql: `select id, recipient, needed_by, status from public.gift_plans where household_id = :household`,
  },
  {
    id: "home.setup-counts", // the one RPC the home screen uses for its counts
    indexed: [],
    sql: `select public.household_setup_counts(:household::uuid)`,
  },
];
