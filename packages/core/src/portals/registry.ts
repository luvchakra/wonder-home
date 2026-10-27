import type { PortalAdapter } from "./adapter";

/**
 * Choosing which adapter drives a connection (story 08-033).
 *
 * A connection uses, in order: its pinned `providerId` adapter if it names one;
 * else the first registered adapter whose `matches()` claims the portal URL;
 * else the generic fallback, which claims everything. Resolution is pure — no
 * browser, no network — so it is cheap and testable.
 */
export function resolveAdapter(opts: {
  portalUrl: string;
  providerId?: string | null;
  adapters: readonly PortalAdapter[];
  fallback: PortalAdapter;
}): PortalAdapter {
  const { portalUrl, providerId, adapters, fallback } = opts;
  if (providerId) {
    const named = adapters.find((adapter) => adapter.id === providerId);
    if (named) return named;
  }
  const claimed = adapters.find((adapter) => adapter.id !== fallback.id && adapter.matches(portalUrl));
  return claimed ?? fallback;
}
