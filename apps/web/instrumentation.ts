import { assertConfiguration } from "@wonderhome/core/config/startup";

/**
 * Runs once when the server starts. Configuration problems stop the deployment
 * here rather than surfacing as a 500 on whichever request needs them first.
 *
 * Only the public scope is asserted: the service-role key is required by the
 * code paths that actually use it (packages/core/src/db/admin.ts), so a
 * deployment that never crosses a household boundary is not forced to hold a
 * key that bypasses RLS.
 */
export async function register() {
  assertConfiguration("public");
}
