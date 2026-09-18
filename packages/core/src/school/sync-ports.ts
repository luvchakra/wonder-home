import type { SupabaseClient } from "@supabase/supabase-js";

import type { Connection } from "../integrations/repository";
import { recordEvent, recordSyncOutcome, seenKeys } from "../integrations/repository";
import { applySchoolItemsSyncPlan, listImportedSchoolItems } from "./repository";
import type { SchoolSyncPorts } from "./school-sync";

/**
 * The real ports for a school sync, over the household's own RLS-scoped
 * client. Split from school-sync.ts so the pure orchestrator never imports
 * the database layer — the same separation calendar-sync.ts and
 * email-sync.ts keep inline, made an explicit module here because
 * repository.ts already imports school-sync.ts's types and a same-file
 * database import would have made the two modules depend on each other.
 */
export function schoolSyncPorts(supabase: SupabaseClient, connection: Connection): SchoolSyncPorts {
  return {
    existingImports: () => listImportedSchoolItems(supabase, connection.id),
    seenKeys: (records) => seenKeys(supabase, connection.id, records),
    apply: (plan) =>
      applySchoolItemsSyncPlan(supabase, { householdId: connection.householdId, integrationId: connection.id, plan }),
    async recordEvents(entries) {
      for (const entry of entries) {
        await recordEvent(supabase, {
          householdId: connection.householdId,
          integrationId: connection.id,
          record: entry.record,
          status: entry.status,
        });
      }
    },
    recordOutcome: (outcome) => recordSyncOutcome(supabase, connection.id, connection.state, outcome),
  };
}
