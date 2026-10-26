import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearConnectors, getConnector } from "../integrations/registry";
import type { ProviderRecord } from "../integrations/connector";
import type { IdentityMapping } from "../integrations/repository";
import type { SchoolPayload } from "./connector";
import {
  MANUAL_SCHOOL_PROVIDER,
  SCHOOL_PROVIDERS,
  createSchoolProviderConnector,
  getSchoolProvider,
  registerSchoolProviders,
  schoolConnectorFor,
  schoolProviderAvailability,
  schoolProviderCatalog,
} from "./providers";
import { syncSchool, type SchoolSyncPorts } from "./school-sync";

const LOOP_ENV = { LOOPLEARNING_USERNAME: "u", LOOPLEARNING_PASSWORD: "p" };
const DEMO_ENV = { WONDERHOME_SCHOOL_DEMO: "1" };

beforeEach(() => clearConnectors());
afterEach(() => clearConnectors());

describe("the catalog", () => {
  it("leads with the forward path, which works for any school with no setup", () => {
    expect(SCHOOL_PROVIDERS[0]?.id).toBe(MANUAL_SCHOOL_PROVIDER);
    const manual = getSchoolProvider(MANUAL_SCHOOL_PROVIDER)!;
    expect(manual.auth).toBe("manual");
    expect(manual.requiredEnv).toHaveLength(0);
    expect(schoolProviderAvailability(manual, {})).toBe("available");
  });

  it("names every portal we know of, each resolvable by id", () => {
    for (const descriptor of SCHOOL_PROVIDERS) {
      expect(getSchoolProvider(descriptor.id)).toBe(descriptor);
    }
    expect(getSchoolProvider("no-such-portal")).toBeNull();
  });

  it("never ships a live portal adapter — CLAUDE.md's bar", () => {
    // A real portal may be named and env-gated, but none is live until its
    // credentials, consent, authentication and integration tests exist.
    const realPortals = SCHOOL_PROVIDERS.filter((p) => p.auth !== "manual" && p.id !== "demo-school");
    expect(realPortals.length).toBeGreaterThan(0);
    for (const portal of realPortals) {
      expect(portal.adapterReady).toBe(false);
    }
  });
});

describe("availability gating", () => {
  it("holds a portal at needs_setup until every variable it names is set", () => {
    const loop = getSchoolProvider("loop-learning")!;
    expect(schoolProviderAvailability(loop, {})).toBe("needs_setup");
    expect(schoolProviderAvailability(loop, { LOOPLEARNING_USERNAME: "u" })).toBe("needs_setup");
    expect(schoolProviderAvailability(loop, { ...LOOP_ENV, LOOPLEARNING_PASSWORD: "  " })).toBe("needs_setup");
    expect(schoolProviderAvailability(loop, LOOP_ENV)).toBe("available");
  });

  it("marks a provider connectable only when it could actually sync", () => {
    const withLoop = schoolProviderCatalog(LOOP_ENV);
    const entry = (id: string) => withLoop.find((candidate) => candidate.id === id)!;

    // The forward path is always connectable; it needs no adapter.
    expect(entry(MANUAL_SCHOOL_PROVIDER).connectable).toBe(true);
    // Loop is now available (env set) but its adapter has not shipped, so it is
    // listed yet not connectable — no masquerading.
    expect(entry("loop-learning").availability).toBe("available");
    expect(entry("loop-learning").connectable).toBe(false);
    // The demo fixture is connectable only once its flag is set.
    expect(entry("demo-school").connectable).toBe(false);
    expect(schoolProviderCatalog(DEMO_ENV).find((e) => e.id === "demo-school")!.connectable).toBe(true);
  });
});

describe("resolving a connector", () => {
  it("returns no connector for the forward path or an unshipped portal", () => {
    expect(schoolConnectorFor(MANUAL_SCHOOL_PROVIDER, {})).toBeNull();
    expect(schoolConnectorFor("loop-learning", LOOP_ENV)).toBeNull();
    expect(schoolConnectorFor("no-such-portal", {})).toBeNull();
  });

  it("returns a school connector for a connectable provider", () => {
    const connector = schoolConnectorFor("demo-school", DEMO_ENV);
    expect(connector).not.toBeNull();
    expect(connector!.kind).toBe("school");
    expect(connector!.provider).toBe("demo-school");
    // Still a fixture: no real integration ships until CLAUDE.md's bar is met.
    expect(connector!.live).toBe(false);
  });
});

describe("registering into the shared registry", () => {
  it("registers nothing when no portal environment is set — the honest default", () => {
    expect(registerSchoolProviders({})).toEqual([]);
    expect(getConnector("school", "demo-school")).toBeNull();
    expect(getConnector("school", "loop-learning")).toBeNull();
  });

  it("registers a connectable provider and is idempotent", () => {
    expect(registerSchoolProviders(DEMO_ENV)).toEqual(["demo-school"]);
    expect(getConnector("school", "demo-school")).not.toBeNull();
    // A second call does not build a second fixture.
    expect(registerSchoolProviders(DEMO_ENV)).toEqual(["demo-school"]);
  });
});

describe("the pipeline runs through a catalog provider", () => {
  const mapping: IdentityMapping = { externalId: "child-1", memberId: "member-1" };

  const record = (externalId: string): ProviderRecord<SchoolPayload> => ({
    externalId,
    contentHash: "f".repeat(64),
    type: "assignment",
    observedAt: new Date("2026-10-26T04:00:00.000Z"),
    payload: { externalChildId: "child-1", kind: "homework", title: "Fractions sheet" },
  });

  it("translates and plans an insert from a provider's records", async () => {
    const applied: unknown[] = [];
    const ports: SchoolSyncPorts = {
      existingImports: async () => [],
      seenKeys: async () => new Set(),
      apply: async (plan) => void applied.push(plan),
      recordEvents: async () => {},
      recordOutcome: async () => ({ status: "connected", consecutiveFailures: 0, lastErrorCode: null }),
    };

    const connector = createSchoolProviderConnector(getSchoolProvider("demo-school")!, {
      env: DEMO_ENV,
      records: [record("hw-1")],
    })!;

    const report = await syncSchool({
      connector,
      connection: {
        id: "conn-1",
        householdId: "house-1",
        kind: "school",
        provider: "demo-school",
        credentialRef: null,
        scopes: ["assignments.read"],
        state: { status: "connecting", consecutiveFailures: 0, lastErrorCode: null },
      },
      mappings: [mapping],
      ports,
    });

    expect(report.ok).toBe(true);
    expect(report.inserted).toBe(1);
    expect(report.unmatched).toBe(0);
  });
});
