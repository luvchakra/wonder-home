import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * Contract-level regression for the agent autonomy RPC boundary.
 *
 * The application calls public.autonomy_for through PostgREST. The canonical
 * implementation stays in wh.autonomy_for; the public function is only a
 * guarded wrapper. Keep this test independent of a live Supabase project so
 * CI cannot silently lose the contract again.
 */
test("autonomy RPC is exposed as a narrow public wrapper", async () => {
  const fs = await import("node:fs/promises");
  const migration = await fs.readFile(
    "supabase/migrations/20260923164300_expose_autonomy_lookup_rpc.sql",
    "utf8",
  );

  assert.match(migration, /create or replace function public\.autonomy_for\s*\(/);
  assert.match(migration, /wh\.is_member\(p_household_id\)/);
  assert.match(migration, /return wh\.autonomy_for\(p_household_id, p_outcome_key\)/);
  assert.match(migration, /revoke all on function public\.autonomy_for\(uuid, text\) from public, anon/);
  assert.match(migration, /grant execute on function public\.autonomy_for\(uuid, text\) to authenticated/);
  assert.match(migration, /notify pgrst, 'reload schema'/);
});
