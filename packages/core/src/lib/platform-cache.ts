/**
 * Platform data kept per server for a short while (CLAUDE.md "Performance":
 * platform data is cached per server with a TTL; household data never is).
 *
 * The only keys are the names below, each a platform table whose rows are
 * the same for every caller: its read policy names no household, member or
 * user (`platform-cache.test.ts` checks the migrations say so). A key takes
 * no id, so nothing household-scoped can be put here by mistake: there is
 * no argument to put a household in. A second key is a new entry below and
 * a new line in that test.
 *
 * Each entry lives in this server instance's memory only. A change made on
 * this instance clears it at once (`forgetPlatformData`); other instances
 * see it within the entry's TTL.
 */

export const PLATFORM_DATA = {
  /** Every plan's features and the running entitlement experiments, read on every gated screen. */
  plan_catalog: { tables: ["plan_features", "entitlement_experiments"], ttlMs: 60_000 },
} as const satisfies Record<string, { tables: readonly string[]; ttlMs: number }>;

export type PlatformDataKey = keyof typeof PLATFORM_DATA;

type Entry = { at: number; value: Promise<unknown> };
const kept = new Map<PlatformDataKey, Entry>();

/** What `load` hands back: the value, and whether it is complete enough to keep for everyone. */
export type Loaded<T> = { value: T; keep: boolean };

/**
 * The kept value for `key`, else `load()`'s. Concurrent callers share one
 * read. A read that fails, or says not to keep it (a partial answer), is
 * never kept, so one bad moment is not served to everyone for the TTL.
 */
export async function keptPerServer<T>(key: PlatformDataKey, load: () => Promise<Loaded<T>>, now = Date.now()): Promise<T> {
  if (!Object.hasOwn(PLATFORM_DATA, key)) throw new Error(`not platform data: ${String(key)}`);
  const hit = kept.get(key);
  if (hit && now - hit.at < PLATFORM_DATA[key].ttlMs) return hit.value as Promise<T>;

  const loading = load();
  const value = loading.then((loaded) => loaded.value);
  const entry: Entry = { at: now, value };
  kept.set(key, entry);
  loading.then(
    (loaded) => {
      if (!loaded.keep && kept.get(key) === entry) kept.delete(key);
    },
    () => {
      if (kept.get(key) === entry) kept.delete(key);
    },
  );
  return value;
}

/** Drops a kept entry on this instance, after a change to its tables. */
export function forgetPlatformData(key: PlatformDataKey): void {
  kept.delete(key);
}
