import { assertConfiguration } from "@wonderhome/core/config/startup";

/**
 * Runs once when the server starts. Configuration problems stop the deployment
 * here rather than surfacing as a 500 on whichever request needs them first.
 *
 * Only the public scope is asserted: the service-role key is required by the
 * code paths that actually use it (packages/core/src/db/admin.ts), so a
 * deployment that never crosses a household boundary is not forced to hold a
 * key that bypasses RLS.
 *
 * The Household Context Store (HomeBrain 3.0) is switched on here, in every
 * Node server instance, so a domain write anywhere marks the stored context
 * behind and rebuilds it after that response (`after()`), and a HomeTalk
 * turn reads it. Without a service-role key or the table it answers null
 * and reads fall back to the live path. Imported only for Node, so the edge
 * bundle never carries it.
 */
export async function register() {
  assertConfiguration("public");
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [{ enableContextStore }, { after }] = await Promise.all([import("@wonderhome/core/homebrain/context-store"), import("next/server")]);
    enableContextStore({ schedule: (task) => after(task) });
  }
}
