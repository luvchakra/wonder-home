import type { NeedsSink } from "./verify-night-run";

/**
 * Where the nightly check's conflicts go: the household's one "Needs you"
 * list (Nothing stuck in review, part A). Null while that list isn't
 * available: conflicts are then counted in the night's run, not raised, and
 * the entries stay as they are (keeping them is every conflict's default).
 */
export function defaultNeedsSink(): NeedsSink | null {
  return null;
}
