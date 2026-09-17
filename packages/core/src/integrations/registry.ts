import {
  type Connector,
  type ConnectorContext,
  type ConnectorError,
  type ConnectorKind,
  type ProviderRecord,
  type SyncResult,
} from "./connector";

/**
 * Which connectors exist, and the fixtures that stand in for them (17-001).
 *
 * A registry rather than imports scattered through domain modules: a module
 * asks for "a school connector for this household" and gets whichever one is
 * configured, so swapping a provider is a registration change.
 *
 * Nothing here is live. `CLAUDE.md` is explicit that a provider counts as live
 * only once credentials, consent, authentication and integration tests are
 * configured, so every connector registered today reports `live: false` and the
 * product never claims a connection it does not have.
 */

const registry = new Map<string, Connector<unknown>>();

export function registerConnector<T>(connector: Connector<T>): void {
  registry.set(`${connector.kind}:${connector.provider}`, connector as Connector<unknown>);
}

export function getConnector(kind: ConnectorKind, provider: string): Connector<unknown> | null {
  return registry.get(`${kind}:${provider}`) ?? null;
}

export function connectorsOfKind(kind: ConnectorKind): Connector<unknown>[] {
  return [...registry.values()].filter((connector) => connector.kind === kind);
}

/** Only for tests: the registry is module state and tests must not leak into each other. */
export function clearConnectors(): void {
  registry.clear();
}

export type FixtureOptions<T> = {
  provider: string;
  kind: ConnectorKind;
  requiredScopes?: readonly string[];
  records?: readonly ProviderRecord<T>[];
  /** Simulated provider trouble, so failure paths are testable without a network. */
  failWith?: ConnectorError;
  partialFailures?: readonly ConnectorError[];
};

/**
 * A connector that returns exactly what it was given.
 *
 * Every failure mode the contract defines is reachable from here, which is what
 * lets the domain modules be tested against outages, rate limits and partial
 * syncs without pretending to have a provider.
 */
export function createFixtureConnector<T>(options: FixtureOptions<T>): Connector<T> {
  const records = options.records ?? [];
  const partialFailures = options.partialFailures ?? [];

  return {
    provider: options.provider,
    kind: options.kind,
    requiredScopes: options.requiredScopes ?? [],
    live: false,

    async health() {
      if (options.failWith) {
        return {
          status: options.failWith.retryable ? "degraded" : "error",
          checkedAt: new Date(),
          detail: options.failWith.message,
          error: options.failWith,
        };
      }
      return {
        status: "connected",
        checkedAt: new Date(),
        detail: "Fixture connector; no real provider is configured.",
      };
    },

    async sync(context: ConnectorContext): Promise<SyncResult<T>> {
      if (options.failWith) throw options.failWith;

      const missing = (options.requiredScopes ?? []).filter(
        (scope) => !context.scopes.includes(scope),
      );
      if (missing.length > 0) {
        // A scope the household never granted is not an outage, and retrying
        // will not fix it.
        const error: ConnectorError = {
          code: "unauthorized",
          retryable: false,
          message: `This connection is missing permission: ${missing.join(", ")}.`,
        };
        throw error;
      }

      return {
        records: [...records],
        partialFailures: [...partialFailures],
        cursor: null,
        completedAt: new Date(),
      };
    },

    async revoke() {
      // Revocation must work even when the provider does not answer: the
      // household's decision to disconnect cannot depend on a third party.
      return { revoked: true, detail: "Fixture connector revoked locally." };
    },
  };
}

/** A stable hash for a provider payload, so a change is detectable without a copy. */
export async function contentHash(payload: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
