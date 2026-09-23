import type { SupabaseClient } from "@supabase/supabase-js";

import type { HomeAssessment } from "../home/assessment";
import { listMembers } from "../identity/households";
import {
  healthAppointmentsAgenda,
  healthCheckupsAgenda,
  healthFitnessGoalsAgenda,
  healthFitnessSessionsAgenda,
  healthIssuesAgenda,
  healthRecordsAgenda,
  healthRoutinesAgenda,
  healthVitalsAgenda,
} from "./agenda";
import { listAppointments } from "./appointments";
import { listCheckups } from "./checkups";
import { listFitnessGoals, listFitnessSessions } from "./fitness";
import { listIssues } from "./issues";
import { listRoutines } from "./measurement-routines";
import { listRecords } from "./records";
import { listVitals } from "./vitals";

/**
 * Health joining `gather-assessments.ts`'s fan-out (story 21-006) — the same
 * shape every other domain's own `*Agenda()` already has
 * (`financeAgenda`/`schoolAgenda`: `(supabase, householdId, { now })`), so a
 * notable health item reaches `coordinate()` exactly like a bill or a school
 * deadline, no separate orchestration path for health.
 *
 * Every read goes through the caller's own RLS-scoped client: nothing here
 * decides who may see what — `wh.may_see_health()` already did, the same
 * backstop the `/health` screen relies on. The specialist pipeline only ever
 * uses this for internal planning (a notification's own text is composed
 * separately), so — unlike the `/health` screen, which reads the household's
 * real timezone — the "when" wording in a merged assessment's `reason` is
 * read in UTC; a small, deliberate simplification for a read nothing shows
 * to a person verbatim.
 */
export type HealthDomainAgenda = {
  needsAttention: HomeAssessment[];
  comingUp: HomeAssessment[];
  monitoring: HomeAssessment[];
  recent: HomeAssessment[];
};

export async function healthAgenda(
  supabase: SupabaseClient,
  householdId: string,
  options: { now?: Date } = {},
): Promise<HealthDomainAgenda> {
  const now = options.now ?? new Date();

  const [members, appointments, issues, checkups, records, vitals, routines, fitnessGoals, fitnessSessions] = await Promise.all([
    listMembers(supabase, householdId, null).catch(() => []),
    listAppointments(supabase, householdId).catch(() => []),
    listIssues(supabase, householdId).catch(() => []),
    listCheckups(supabase, householdId).catch(() => []),
    listRecords(supabase, householdId).catch(() => []),
    listVitals(supabase, householdId).catch(() => []),
    listRoutines(supabase, householdId).catch(() => []),
    listFitnessGoals(supabase, householdId, { statuses: ["active", "dismissed"] }).catch(() => []),
    listFitnessSessions(supabase, householdId, { statuses: ["active", "archived"] }).catch(() => []),
  ]);

  const nameOf = (memberId: string) => members.find((member) => member.id === memberId)?.displayName ?? "Someone";

  const appointmentsAgenda = healthAppointmentsAgenda(appointments, nameOf, "UTC");
  const issuesAgenda = healthIssuesAgenda(issues, nameOf);
  const checkupsAgenda = healthCheckupsAgenda(checkups, nameOf, now);
  const recordsAgenda = healthRecordsAgenda(records, nameOf);
  const vitalsAgenda = healthVitalsAgenda(vitals, nameOf);
  const routinesAgenda = healthRoutinesAgenda(routines, nameOf, now);
  const fitnessGoalsAgenda = healthFitnessGoalsAgenda(fitnessGoals, nameOf);
  const fitnessSessionsAgenda = healthFitnessSessionsAgenda(fitnessSessions, nameOf);

  return {
    needsAttention: [...appointmentsAgenda.needsAttention, ...issuesAgenda.needsAttention, ...checkupsAgenda.needsAttention, ...routinesAgenda.needsAttention],
    comingUp: [...appointmentsAgenda.comingUp, ...checkupsAgenda.comingUp, ...routinesAgenda.comingUp],
    monitoring: issuesAgenda.monitoring,
    recent: [
      ...appointmentsAgenda.recent,
      ...issuesAgenda.recent,
      ...checkupsAgenda.recent,
      ...recordsAgenda,
      ...vitalsAgenda,
      ...routinesAgenda.recent,
      ...fitnessGoalsAgenda,
      ...fitnessSessionsAgenda,
    ],
  };
}
