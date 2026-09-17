import { log } from "../observability/logger";
import { publicEnv, serverEnv } from "./env";
import { flags } from "./flags";

/**
 * Fail-fast startup validation (story 00-010).
 *
 * Missing configuration should stop a deployment, not surface later as a 500 on
 * whichever request happens to need it first. The summary that gets logged
 * names which variables are present — never their values.
 */
/**
 * "public" validates what every deployment needs. "privileged" additionally
 * requires the service-role key, and is asserted only by code paths that
 * genuinely use it — a web deployment that never crosses a household boundary
 * should not be forced to hold a key that bypasses RLS.
 */
export type StartupScope = "public" | "privileged";

export function assertConfiguration(scope: StartupScope): void {
  const problems: string[] = [];

  try {
    publicEnv();
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }

  if (scope === "privileged") {
    try {
      serverEnv();
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }

  let resolvedFlags: Record<string, boolean> = {};
  try {
    resolvedFlags = flags();
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }

  if (problems.length > 0) {
    throw new Error(problems.join("\n\n"));
  }

  log.info("configuration validated", { scope, flags: resolvedFlags, allow: ["flags", "scope"] });
}
