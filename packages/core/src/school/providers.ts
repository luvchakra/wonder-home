import type { ProviderRecord } from "../integrations/connector";
import { getConnector, registerConnector } from "../integrations/registry";
import { createFixtureSchoolConnector, SCHOOL_SCOPES, type SchoolConnector, type SchoolPayload } from "./connector";

/**
 * The school provider catalog (story 08-028).
 *
 * The connector framework (08-002) is provider-neutral: every portal WonderHome
 * could read a child's homework from implements one `SchoolConnector`, and no
 * domain module learns which portal the work came from. What was missing was the
 * list — which portals exist, how a household connects one, and which of them is
 * actually usable today. This file is that list: the "generic connector" made
 * concrete and extensible, so adding a new school portal is a catalog entry plus
 * an adapter, never a change to any domain module.
 *
 * Two honest truths this file keeps:
 *  - One option works for every school today and needs no portal at all. A
 *    parent forwards the circular, the homework photo or the class-group message
 *    to WonderHome and HomeSend files it for the right child, with nothing added
 *    until a person confirms (the `manual` provider). WonderHome never depends on
 *    a school's cooperation for a family to use it.
 *  - No portal adapter is live. `CLAUDE.md` is explicit: a provider counts as
 *    live only once its credentials, a guardian's consent, authentication and
 *    integration tests exist. Every portal here is off until its own environment
 *    variables are set, and a portal whose adapter has not shipped stays
 *    unconnectable even then — the sync endpoint answers that it is not
 *    configured rather than pretending. The product never claims a connection it
 *    does not have.
 */

/** How a household proves it may read a portal: nothing (forwarding), a sign-in, or a delegated grant. */
export type SchoolProviderAuth = "manual" | "credentials" | "oauth";

/** Whether a deployment can offer this provider right now. */
export type SchoolProviderAvailability = "available" | "needs_setup";

export type SchoolProviderDescriptor = {
  /** Registry key within the school kind, and the `provider` stored on a connection. */
  id: string;
  /** The provider's name in a household's words. A proper name is never translated. */
  label: string;
  auth: SchoolProviderAuth;
  /** One honest line about what connecting this does, for the connect screen. */
  blurb: string;
  /** Scopes the connection asks for, in the shared vocabulary. Empty for the forward path. */
  scopes: readonly string[];
  /**
   * Environment variables a deployment must set before this provider is offered.
   * Empty means always available (the forward path needs no deployment setup).
   */
  requiredEnv: readonly string[];
  /**
   * Whether a working adapter exists for this provider.
   *
   * Every real portal is `false` today: the catalog can name a portal and a
   * deployment can set its credentials, but until an adapter and its integration
   * tests ship, connecting it would sync nothing, so it stays unconnectable and
   * the endpoint says so. `CLAUDE.md` governs the flip to `true`. The demo
   * provider is `true` because it is openly a fixture — it never claims to be a
   * real school.
   */
  adapterReady: boolean;
  /** The portal's own address, when it has one. */
  portalUrl?: string;
  /**
   * How this provider's message-channel links look, when it has channels a
   * household can track (story 08-030). A channel is a continuous feed of
   * messages inside the portal — a class group, a notice board — that a parent
   * reaches at a stable URL. Declaring its shape here lets WonderHome recognise
   * a pasted link and, once the adapter ships, know what to poll.
   */
  channel?: {
    /** Hosts a channel link may use, lower-case, no scheme. */
    hosts: readonly string[];
    /** Matches the channel path and captures the channel id in group 1. */
    pathPattern: RegExp;
    /** A sample link, for the connect screen. */
    example: string;
  };
};

/** The one provider that needs no portal: forwarding to WonderHome. */
export const MANUAL_SCHOOL_PROVIDER = "manual";

/**
 * The catalog. The order is the order a household should see: the thing that
 * works for everyone first, then a development fixture, then the named portals
 * that a deployment can switch on once their adapters exist.
 */
export const SCHOOL_PROVIDERS: readonly SchoolProviderDescriptor[] = [
  {
    id: MANUAL_SCHOOL_PROVIDER,
    label: "Forward to WonderHome",
    auth: "manual",
    blurb:
      "Works for any school. Forward a circular, a homework photo or a class message and WonderHome files it for the right child — nothing is added until you confirm.",
    scopes: [],
    requiredEnv: [],
    adapterReady: false,
  },
  {
    id: "demo-school",
    label: "Demo school",
    auth: "credentials",
    blurb:
      "A sample portal with made-up homework, for trying the sync pipeline in development. Never a real child's work.",
    scopes: [SCHOOL_SCOPES.assignments],
    requiredEnv: ["WONDERHOME_SCHOOL_DEMO"],
    adapterReady: true,
  },
  {
    id: "loop-learning",
    label: "Loop Learning",
    auth: "credentials",
    blurb:
      "Reads homework, exams and notices from a Loop Learning parent account, read-only — once its adapter ships and you have connected and confirmed it.",
    scopes: [SCHOOL_SCOPES.assignments, SCHOOL_SCOPES.communications],
    requiredEnv: ["LOOPLEARNING_USERNAME", "LOOPLEARNING_PASSWORD"],
    adapterReady: false,
    portalUrl: "https://www.looplearning.com",
    channel: {
      hosts: ["looplearning.com", "www.looplearning.com"],
      pathPattern: /^\/channel\/([A-Za-z0-9_-]+)\/?$/,
      example: "https://www.looplearning.com/channel/2044541",
    },
  },
];

export function getSchoolProvider(id: string): SchoolProviderDescriptor | null {
  return SCHOOL_PROVIDERS.find((descriptor) => descriptor.id === id) ?? null;
}

/**
 * Whether a provider can be offered now.
 *
 * A provider with no required environment is always available. Any other is
 * available only once every variable it names is set and non-empty — the same
 * "off until its own variables are set" rule every external provider keeps.
 */
export function schoolProviderAvailability(
  descriptor: SchoolProviderDescriptor,
  env: Record<string, string | undefined> = process.env,
): SchoolProviderAvailability {
  if (descriptor.requiredEnv.length === 0) return "available";
  const ready = descriptor.requiredEnv.every((key) => (env[key]?.trim() ?? "") !== "");
  return ready ? "available" : "needs_setup";
}

export type SchoolProviderCatalogEntry = SchoolProviderDescriptor & {
  availability: SchoolProviderAvailability;
  /** Whether connecting this provider would actually sync, as opposed to only being listed. */
  connectable: boolean;
};

/**
 * The catalog with each provider's state for a given deployment, for the
 * connect screen and the assistant. `connectable` is the honest test: it is true
 * only for the forward path and for portals whose adapter has shipped and whose
 * environment is set — never for a portal that is merely named.
 */
export function schoolProviderCatalog(
  env: Record<string, string | undefined> = process.env,
): SchoolProviderCatalogEntry[] {
  return SCHOOL_PROVIDERS.map((descriptor) => {
    const availability = schoolProviderAvailability(descriptor, env);
    const connectable =
      descriptor.auth === "manual" || (descriptor.adapterReady && availability === "available");
    return { ...descriptor, availability, connectable };
  });
}

/**
 * The connector that syncs a portal provider, or `null` when there is nothing
 * to sync.
 *
 * `manual` has no connector: its items arrive through HomeSend, not a portal
 * poll, so there is nothing to register or run. A portal whose adapter has not
 * shipped, or whose environment is not set, also returns `null`, so the sync
 * route's "not configured" answer is reached rather than a connector that
 * pretends to work.
 *
 * A portal that is connectable still returns a fixture (`live: false`) today:
 * the seam is proven and testable end to end, but no real network adapter ships
 * until `CLAUDE.md`'s bar is met. `records` lets a test or the demo provider
 * drive the whole pipeline deterministically.
 */
export function createSchoolProviderConnector(
  descriptor: SchoolProviderDescriptor,
  options: { env?: Record<string, string | undefined>; records?: readonly ProviderRecord<SchoolPayload>[] } = {},
): SchoolConnector | null {
  const env = options.env ?? process.env;
  if (descriptor.auth === "manual") return null;
  if (!descriptor.adapterReady) return null;
  if (schoolProviderAvailability(descriptor, env) !== "available") return null;

  return createFixtureSchoolConnector({
    provider: descriptor.id,
    requiredScopes: descriptor.scopes,
    records: options.records,
  });
}

/** The connector for a provider id, or `null` when it cannot sync for this deployment. */
export function schoolConnectorFor(
  provider: string,
  env: Record<string, string | undefined> = process.env,
): SchoolConnector | null {
  const descriptor = getSchoolProvider(provider);
  return descriptor ? createSchoolProviderConnector(descriptor, { env }) : null;
}

/**
 * Register every connectable portal provider into the shared registry.
 *
 * Idempotent and safe to call at the start of a request. In a deployment with no
 * portal environment set — which is every deployment today — nothing registers,
 * `getConnector("school", …)` stays null, and the sync endpoint answers honestly
 * that no provider is configured. The manual provider is never registered: it
 * does not sync.
 *
 * Returns the ids registered, for a startup log and for tests.
 */
export function registerSchoolProviders(env: Record<string, string | undefined> = process.env): string[] {
  const registered: string[] = [];
  for (const descriptor of SCHOOL_PROVIDERS) {
    if (getConnector("school", descriptor.id)) {
      // Already registered this process; do not build a second fixture.
      registered.push(descriptor.id);
      continue;
    }
    const connector = createSchoolProviderConnector(descriptor, { env });
    if (!connector) continue;
    registerConnector(connector);
    registered.push(descriptor.id);
  }
  return registered;
}
