import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { HouseholdMember } from "../identity/households";
import { buildContextItems } from "./builders";
import { applyFreshness } from "./freshness";
import { householdMemory, invalidateHouseholdContext, invalidatesContext } from "./invalidation";
import { filterForViewer, toCandidates } from "./privacy";
import { describeProvenance } from "./provenance";
import { CONTEXT_ADAPTERS, gatherHouseholdContext } from "./repository";
import { findRelevantFacts, factsForQuestion } from "./retrieval";
import { CONTEXT_DOMAINS, type ContextScope, type HouseholdContextItem } from "./types";

/**
 * The engine's own guarantees, beside the golden scenarios: every domain has
 * a read path, none of them reaches past RLS, a failed read is named rather
 * than hidden, and relevance keeps a narrow question narrow.
 */

const HOUSEHOLD = "hh-one";
const TZ = "Asia/Kolkata";
const NOW = new Date("2026-09-23T06:00:00Z");

function member(id: string, displayName: string, memberType: HouseholdMember["memberType"]): HouseholdMember {
  return {
    id,
    displayName,
    memberType,
    status: "active",
    roles: [],
    isOwner: false,
    dateOfBirth: null,
    nickname: null,
    relationship: null,
    occupation: null,
    schoolOrWorkLocation: null,
    specialOccasionLabel: null,
    specialOccasionDate: null,
    gender: null,
    notes: null,
    avatarUrl: null,
  };
}

function scope(extra: Partial<ContextScope["viewer"]> = {}): ContextScope {
  return {
    householdId: HOUSEHOLD,
    householdName: "One Home",
    timezone: TZ,
    now: NOW,
    viewer: { memberId: "m-parent", permissions: ["finance.view", "school.manage", "health.manage"], tone: "adult", guardianOf: [], ...extra },
  };
}

/**
 * A client that answers every query with an empty list, remembers which
 * tables were asked for, and fails the ones it is told to — enough to see
 * the gather's gating and its failure handling without a database.
 */
function fakeClient(failing: readonly string[] = []): { client: SupabaseClient; tables: string[]; rpcs: string[] } {
  const tables: string[] = [];
  const rpcs: string[] = [];
  const builder = (table: string): unknown => {
    const result = failing.includes(table) ? { data: null, error: { code: "XX000", message: "down" }, count: null } : { data: [], error: null, count: 0 };
    const single = failing.includes(table) ? result : { data: null, error: null, count: 0 };
    const chain: Record<string, unknown> = new Proxy(
      {},
      {
        get(_target, property) {
          if (property === "then") return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
          if (property === "single" || property === "maybeSingle") return () => Promise.resolve(single);
          return () => chain;
        },
      },
    );
    return chain;
  };
  const client = {
    from(table: string) {
      tables.push(table);
      return builder(table);
    },
    rpc(name: string) {
      rpcs.push(name);
      return builder(`rpc:${name}`);
    },
  } as unknown as SupabaseClient;
  return { client, tables, rpcs };
}

describe("coverage", () => {
  it("has an authorized read path for every domain that is not derived from the others", () => {
    const derived = new Set(["household", "attention"]);
    const covered = new Set(CONTEXT_ADAPTERS.map((adapter) => adapter.domain));
    for (const domain of CONTEXT_DOMAINS) {
      if (derived.has(domain)) continue;
      expect(covered.has(domain), `${domain} has no adapter`).toBe(true);
    }
  });

  it("gives every adapter a label a household can read", () => {
    for (const adapter of CONTEXT_ADAPTERS) expect(adapter.label.trim().length).toBeGreaterThan(2);
  });
});

describe("the RLS boundary", () => {
  const dir = __dirname;
  const sources = readdirSync(dir)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => ({ file, text: readFileSync(join(dir, file), "utf8") }));

  it("never reaches for the service-role client", () => {
    for (const { file, text } of sources) {
      expect(text, file).not.toMatch(/db\/admin|createAdminClient|SERVICE_ROLE/);
    }
  });

  it("never calls a database function directly", () => {
    for (const { file, text } of sources) expect(text, file).not.toMatch(/\.rpc\(/);
  });

  it("reads through the member's own client and nothing else", async () => {
    const { client, tables, rpcs } = fakeClient();
    await gatherHouseholdContext(client, scope());
    expect(tables.length).toBeGreaterThan(0);
    expect(rpcs.every((name) => !name.includes("admin"))).toBe(true);
  });
});

describe("gathering", () => {
  it("names a domain it could not read instead of pretending it is empty", async () => {
    const { client } = fakeClient(["obligations"]);
    const snapshot = await gatherHouseholdContext(client, scope());
    expect(snapshot.unavailable).toContain(CONTEXT_ADAPTERS.find((adapter) => adapter.domain === "bills")!.label);
  });

  it("does not read what a child may not see", async () => {
    const adult = fakeClient();
    await gatherHouseholdContext(adult.client, scope());
    const child = fakeClient();
    await gatherHouseholdContext(child.client, scope({ memberId: "m-child", tone: "child", permissions: ["school.view_own"] }));
    expect(adult.tables).toContain("obligations");
    expect(child.tables).not.toContain("obligations");
    expect(child.tables).not.toContain("outcomes");
    expect(child.tables).not.toContain("agent_runs");
    expect(child.tables.length).toBeLessThan(adult.tables.length);
  });

  it("does not read bills without the finance permission", async () => {
    const { client, tables } = fakeClient();
    await gatherHouseholdContext(client, scope({ permissions: ["school.manage"] }));
    expect(tables).not.toContain("obligations");
  });

  it("reads only the domains asked for, plus people", async () => {
    const { client, tables } = fakeClient();
    await gatherHouseholdContext(client, scope(), { domains: ["bills"] });
    expect(tables).toContain("obligations");
    expect(tables).not.toContain("consumables");
  });
});

const MEMBERS = [member("m-parent", "Ritu", "adult"), member("m-child", "Kabir", "child")];

function built(): HouseholdContextItem[] {
  return applyFreshness(
    buildContextItems(
      {
        members: MEMBERS,
        obligations: [
          { id: "b-power", name: "Electricity bill", kind: "utility", payee: "BESCOM", amountMinor: 245000, currency: "INR", dueOn: "2026-09-25", responsibleMemberId: "m-parent", status: "received", requiresReview: false },
        ],
        consumables: [
          { id: "c-milk", name: "Milk", category: "grocery", petId: null, unit: "litre", typicalQuantity: 1, daysPerUnit: 2, evidenceBasis: "member_stated", lastPurchasedOn: "2026-09-21", lastPurchasedQuantity: 2 },
          { id: "c-rice", name: "Basmati rice", category: "grocery", petId: null, unit: "kg", typicalQuantity: 5, daysPerUnit: 30, evidenceBasis: "member_stated", lastPurchasedOn: "2026-09-01", lastPurchasedQuantity: 5 },
        ],
      },
      { householdId: HOUSEHOLD, householdName: "One Home", timezone: TZ, now: NOW, viewerMemberId: "m-parent" },
    ),
    NOW,
  );
}

describe("relevance", () => {
  it("puts the thing asked about first", () => {
    const ranked = findRelevantFacts({ items: built() }, "when is the electricity bill due?");
    const bill = ranked.findIndex((fact) => fact.item.entityId === "b-power");
    const milk = ranked.findIndex((fact) => fact.item.entityId === "c-milk");
    expect(bill).toBeGreaterThanOrEqual(0);
    expect(ranked.slice(0, bill).every((fact) => fact.item.tier === 1)).toBe(true);
    expect(milk === -1 || milk > bill).toBe(true);
  });

  it("keeps an unrelated domain out of a narrow question", () => {
    const ranked = findRelevantFacts({ items: built() }, "when is the electricity bill due?");
    const milk = ranked.find((fact) => fact.item.entityId === "c-milk");
    expect(milk?.score ?? 0).toBeLessThan(ranked[0]!.score);
  });

  it("sends candidates with opaque ids, never a row id", () => {
    const candidates = factsForQuestion({ items: built() }, "what do we need from the shop?");
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(candidate.id).toMatch(/^fact-\d+$/);
      expect(candidate.text).not.toMatch(/b-power|c-milk|c-rice/);
    }
  });

  it("marks what was not asked about as not relevant rather than dropping it silently", () => {
    const candidates = toCandidates(built(), (item) => item.domain === "bills");
    expect(candidates.some((candidate) => !candidate.relevant)).toBe(true);
    expect(candidates.some((candidate) => candidate.relevant)).toBe(true);
  });
});

describe("provenance", () => {
  it("says where every fact came from, without reasoning", () => {
    for (const item of built()) {
      const lines = describeProvenance(item, TZ);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.join(" ")).not.toMatch(/because I think|reasoning|chain of thought/i);
      expect(item.source.type.length).toBeGreaterThan(0);
    }
  });
});

describe("privacy", () => {
  it("drops an item from another household even if one slipped into the list", () => {
    const foreign = { ...built()[0]!, id: "bill:x", householdId: "hh-other" };
    const { items, withheld } = filterForViewer([...built(), foreign], scope());
    expect(items.some((item) => item.householdId !== HOUSEHOLD)).toBe(false);
    expect(withheld).toContainEqual({ id: "bill:x", reason: "other_household" });
  });

  it("withholds financial facts without the finance permission", () => {
    const { items } = filterForViewer(built(), scope({ permissions: [] }));
    expect(items.some((item) => item.privacyClass === "financial")).toBe(false);
  });
});

describe("invalidation", () => {
  it("forgets a household's context after a write succeeds, and only then", async () => {
    let reads = 0;
    const read = () => householdMemory(HOUSEHOLD, "probe", async () => ++reads);
    expect(await read()).toBe(1);
    expect(await read()).toBe(1);

    const failing = invalidatesContext(async (_householdId: string) => {
      throw new Error("no");
    }, (householdId) => householdId);
    await expect(failing(HOUSEHOLD)).rejects.toThrow();
    expect(await read()).toBe(1);

    const succeeding = invalidatesContext(async (_householdId: string) => "ok", (householdId) => householdId);
    await succeeding(HOUSEHOLD);
    expect(await read()).toBe(2);
    invalidateHouseholdContext(HOUSEHOLD);
  });

  it("leaves other households' context alone", async () => {
    let reads = 0;
    const other = () => householdMemory("hh-two", "probe", async () => ++reads);
    await other();
    invalidateHouseholdContext(HOUSEHOLD);
    expect(await other()).toBe(1);
    invalidateHouseholdContext("hh-two");
  });
});
