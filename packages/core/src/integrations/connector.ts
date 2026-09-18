/**
 * The connector contract (story 17-001).
 *
 * Every external provider — a school portal, a grocer, a calendar, a payment
 * processor — implements this one shape. The point is not tidiness: it is that
 * replacing a provider must not change a single line of domain logic. A module
 * asks for "the school connector" and receives canonical WonderHome objects; it
 * never learns which portal they came from.
 *
 * `CLAUDE.md` governs the rest: no connector is live until credentials,
 * consent, authentication and integration tests exist. Until then a connector
 * is a fixture, and it says so.
 */

export const CONNECTOR_KINDS = [
  "school",
  "commerce",
  "calendar",
  "email",
  "messaging",
  "weather",
  "smart_home",
  "payment",
] as const;
export type ConnectorKind = (typeof CONNECTOR_KINDS)[number];

export const CONNECTOR_STATUSES = [
  "not_connected",
  "connecting",
  "connected",
  "degraded",
  "error",
  "revoked",
] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

/**
 * One item as a provider sent it, before it becomes anything canonical.
 *
 * `externalId` is what makes an import idempotent, and `contentHash` is what
 * distinguishes "we have seen this" from "this changed". Keeping both means a
 * re-sync reconciles rather than duplicates.
 */
export type ProviderRecord<T> = {
  externalId: string;
  contentHash: string;
  /** What the provider says this is, in its own vocabulary. */
  type: string;
  observedAt: Date;
  payload: T;
};

export type ConnectorError = {
  /** Stable and loggable — never the provider's prose, which changes. */
  code:
    | "unauthorized"
    | "revoked"
    | "rate_limited"
    | "unavailable"
    | "timeout"
    | "malformed"
    | "not_configured";
  /** Whether trying again later could succeed. */
  retryable: boolean;
  /** Safe to show a household; never contains provider payloads or credentials. */
  message: string;
  retryAfterSeconds?: number;
};

/**
 * The result of a sync.
 *
 * Partial success is a first-class outcome rather than an exception. A provider
 * that returns nine items and fails on the tenth has given us nine real items,
 * and throwing them away would make a flaky portal look like an empty one.
 */
export type SyncResult<T> = {
  records: ProviderRecord<T>[];
  /** Failures that did not stop the rest. The sync is `degraded`, not failed. */
  partialFailures: ConnectorError[];
  /** Where to resume, when the provider supports it. */
  cursor?: string | null;
  completedAt: Date;
};

export type HealthReport = {
  status: ConnectorStatus;
  checkedAt: Date;
  detail: string;
  error?: ConnectorError;
};

export type ConnectorContext = {
  householdId: string;
  /** Where the credential lives. The connector resolves it; nothing else sees it. */
  credentialRef: string | null;
  scopes: readonly string[];
  /** Resume point from the last successful sync. */
  cursor?: string | null;
};

export type Connector<T = unknown> = {
  readonly provider: string;
  readonly kind: ConnectorKind;
  /** What this connector needs permission to do, in the provider's terms. */
  readonly requiredScopes: readonly string[];
  /**
   * Whether this is a real integration or a fixture.
   *
   * A fixture connector is never reported to a household as connected, so the
   * product cannot imply a link that does not exist.
   */
  readonly live: boolean;

  health(context: ConnectorContext): Promise<HealthReport>;
  sync(context: ConnectorContext): Promise<SyncResult<T>>;
  /** Give up access. Must succeed even if the provider is unreachable. */
  revoke(context: ConnectorContext): Promise<{ revoked: boolean; detail: string }>;
};

/**
 * How a sync outcome moves a connection's recorded status.
 *
 * One failure is weather; several in a row is a problem. The threshold exists
 * so a household is not told an integration is broken because a portal was slow
 * once — and is told before they discover it themselves.
 */
export const FAILURES_BEFORE_ERROR = 3;

export type ConnectionState = {
  status: ConnectorStatus;
  consecutiveFailures: number;
  lastErrorCode: string | null;
};

export function applySyncOutcome(
  state: ConnectionState,
  outcome: { ok: true; partialFailures: readonly ConnectorError[] } | { ok: false; error: ConnectorError },
): ConnectionState {
  if (outcome.ok) {
    return {
      // Partial failures keep the connection usable but honest about it.
      status: outcome.partialFailures.length > 0 ? "degraded" : "connected",
      consecutiveFailures: 0,
      lastErrorCode: outcome.partialFailures[0]?.code ?? null,
    };
  }

  // Losing access is not a transient failure and must not wait for a threshold:
  // continuing to try would look like an outage when it is a permission change.
  if (outcome.error.code === "revoked" || outcome.error.code === "unauthorized") {
    return { status: "revoked", consecutiveFailures: 0, lastErrorCode: outcome.error.code };
  }

  const consecutiveFailures = state.consecutiveFailures + 1;
  return {
    status: consecutiveFailures >= FAILURES_BEFORE_ERROR ? "error" : "degraded",
    consecutiveFailures,
    lastErrorCode: outcome.error.code,
  };
}

/**
 * Whether a household should be told about a connector's state.
 *
 * The same discipline as everywhere else: an outage WonderHome is still
 * retrying through is not the family's problem. Losing access is, because only
 * a person can grant it again.
 */
export function connectionNeedsAttention(state: ConnectionState): boolean {
  return state.status === "revoked" || state.status === "error";
}

/**
 * How long to wait before trying again.
 *
 * A provider that asked for a specific delay gets it — ignoring `Retry-After`
 * is how a rate limit becomes a ban.
 */
export function retryDelaySeconds(error: ConnectorError, attempt: number): number | null {
  if (!error.retryable) return null;
  if (error.retryAfterSeconds !== undefined) return error.retryAfterSeconds;

  const base = Math.min(2 ** Math.max(0, attempt) * 30, 3600);
  return base;
}

/**
 * Which incoming records are new work.
 *
 * Deduplication is by provider identity within a household, never by content
 * alone: two children can be set the same worksheet, and two households can buy
 * the same thing on the same day.
 */
export function newRecords<T>(
  records: readonly ProviderRecord<T>[],
  seen: ReadonlySet<string>,
): ProviderRecord<T>[] {
  return records.filter((record) => !seen.has(dedupeKey(record)));
}

export function dedupeKey<T>(record: ProviderRecord<T>): string {
  return `${record.externalId}:${record.contentHash}`;
}

const KNOWN_CODES = new Set<ConnectorError["code"]>([
  "unauthorized",
  "revoked",
  "rate_limited",
  "unavailable",
  "timeout",
  "malformed",
  "not_configured",
]);

/**
 * Anything a connector throws becomes a contract error.
 *
 * An adapter that throws its SDK's own exception has not told us anything
 * safe to show a household, so it is treated as the provider being
 * unavailable — and its message is never passed on, because provider prose
 * can carry a token or another detail that should not reach a screen.
 */
export function toConnectorError(thrown: unknown): ConnectorError {
  if (
    typeof thrown === "object" &&
    thrown !== null &&
    "code" in thrown &&
    KNOWN_CODES.has((thrown as { code: ConnectorError["code"] }).code) &&
    typeof (thrown as { retryable?: unknown }).retryable === "boolean" &&
    typeof (thrown as { message?: unknown }).message === "string"
  ) {
    return thrown as ConnectorError;
  }

  return { code: "unavailable", retryable: true, message: "The provider did not answer." };
}

/** What a household may be told a connector is doing, with no provider detail. */
export function describeStatus(status: ConnectorStatus): string {
  switch (status) {
    case "not_connected":
      return "Not connected";
    case "connecting":
      return "Connecting";
    case "connected":
      return "Working";
    case "degraded":
      return "Working, with some problems";
    case "error":
      return "Not working";
    case "revoked":
      return "Access needs granting again";
  }
}
