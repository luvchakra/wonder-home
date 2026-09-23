/**
 * The household context's short memory, and the one way to make it forget.
 *
 * A conversation is a burst of questions about the same home, so what was
 * read is kept for `CONTEXT_TTL_MS` rather than re-read for "and tomorrow?".
 * The other half of that bargain is that any successful change to the
 * household forgets it at once, so the next read shows the change.
 *
 * Deliberately free of domain imports: every repository that writes calls
 * `invalidateHouseholdContext`, and it must not drag the context engine in
 * after it.
 */

/** Enough for a whole conversation's worth of follow-ups, short enough that a change shows up. */
export const CONTEXT_TTL_MS = 45_000;

type CacheEntry = { at: number; value: Promise<unknown> };
const cache = new Map<string, CacheEntry>();

/** Forgets everything read about this household. Call after any successful write. */
export function invalidateHouseholdContext(householdId: string): void {
  const prefix = `${householdId}:`;
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

/** Forgets everything, for a write that does not say which household it touched. */
export function invalidateAllHouseholdContexts(): void {
  cache.clear();
}

/**
 * A repository write that forgets the household's context once it has
 * succeeded — after, never before, so a read racing the write cannot put
 * the old state back. A write that throws changed nothing and forgets
 * nothing. `householdOf` names the household from the write's own
 * arguments; null forgets every household, for the rare write that does
 * not carry one.
 */
export function invalidatesContext<A extends unknown[], R>(
  write: (...args: A) => Promise<R>,
  householdOf: (...args: A) => string | null,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const result = await write(...args);
    const householdId = householdOf(...args);
    if (householdId) invalidateHouseholdContext(householdId);
    else invalidateAllHouseholdContexts();
    return result;
  };
}

/**
 * Anything read about a household that is asked for again a moment later,
 * kept for `CONTEXT_TTL_MS`. A failed read is not kept.
 */
export function householdMemory<T>(householdId: string, key: string, load: () => Promise<T>): Promise<T> {
  const full = `${householdId}:${key}`;
  const now = Date.now();
  const hit = cache.get(full);
  if (hit && now - hit.at < CONTEXT_TTL_MS) return hit.value as Promise<T>;
  const value = load().catch((thrown) => {
    cache.delete(full);
    throw thrown;
  });
  cache.set(full, { at: now, value });
  return value;
}
