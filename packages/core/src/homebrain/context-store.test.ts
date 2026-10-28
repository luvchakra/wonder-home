import { describe, expect, it } from "vitest";

import type { FamilyEvent } from "../family/schedule";
import type { HouseholdMember } from "../identity/households";
import { gatherHouseholdContext, loadHouseholdContext, setContextStoreReader, type ContextSnapshot } from "../context/repository";
import { STORE_MAX_BYTES, buildStoreItems, fitToCap, keepStoresWarm, storeIsCurrent, storeIsOnlyAged, storedItemsForViewer } from "./context-store";
import type { ContextScope, ContextViewer, HouseholdContextItem } from "../context/types";

const HOUSEHOLD = "h0000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-18T06:30:00Z");
const SCOPE = { householdId: HOUSEHOLD, householdName: "Sharma Home", timezone: "Asia/Kolkata", now: NOW };

function member(id: string, displayName: string, memberType: HouseholdMember["memberType"]): HouseholdMember {
  return {
    id, displayName, memberType, status: "active", roles: memberType === "adult" ? ["head"] : [memberType], isOwner: false, dateOfBirth: null, nickname: null,
    relationship: null, occupation: null, schoolOrWorkLocation: null, specialOccasionLabel: null, specialOccasionDate: null, gender: null, notes: null, avatarUrl: null,
  } as HouseholdMember;
}

const MEMBERS = [member("m-kunal", "Kunal Sharma", "adult"), member("m-upasana", "Upasana Sharma", "adult"), member("m-asmi", "Asmi", "child")];

const birthday: FamilyEvent = {
  id: "e-birthday", title: "Asmi's birthday party", kind: "birthday", startsAt: new Date("2026-12-09T11:30:00Z"), endsAt: new Date("2026-12-09T14:30:00Z"),
  protected: false, ownerMemberId: "m-upasana", status: "planned", actionState: null, actionDueAt: null,
  participants: [{ memberId: "m-asmi", response: "yes", required: true }, { memberId: "m-upasana", response: "yes", required: true }],
};

describe("the store is whole (HomeBrain 3.0 phase A)", () => {
  const items = buildStoreItems(
    {
      members: MEMBERS,
      events: [birthday],
      eventGuests: [
        { eventId: "e-birthday", name: "Riya", response: "yes", partySize: 3, note: null },
        { eventId: "e-birthday", name: "Dev", response: "maybe", partySize: 1, note: null },
      ],
      memories: Array.from({ length: 40 }, (_, index) => ({ id: `mem-${index}`, scope: "household" as const, memberId: null, category: "routine", key: `routine.thing${index}`, value: `thing ${index}`, status: "learned" })),
      foodPreferences: [{ id: "fp-1", memberId: "m-upasana", kind: "preference", subject: "Italian food" }],
      places: [{ id: "p-1", placeId: "gp-1", name: "Cafe Goodluck", address: "FC Road, Pune", kind: "cafe", location: null, mapsUri: null, status: "saved", note: "Kids love the bun maska" }],
      address: { formattedAddress: "12 Lane 5, Koregaon Park, Pune", placeId: null, location: null },
    },
    [],
    SCOPE,
  );
  const byId = (id: string) => items.find((item) => item.id === id);

  it("says who is coming to an event two months out, by name, with a count", () => {
    const event = byId("event:e-birthday")!;
    expect(event.summary).toContain("Asmi's birthday party");
    expect(event.summary).toContain("with Asmi, Upasana Sharma");
    expect(event.summary).toContain("Riya (3 people) said yes");
    expect(event.summary).toContain("Dev said maybe");
    expect(event.summary).toContain("3 coming so far");
    expect(event.aliases).toEqual(expect.arrayContaining(["Riya", "Dev"]));
    expect(event.freshness).toBe("current");
  });

  it("keeps every memory, not the first twenty-four", () => {
    expect(items.filter((item) => item.entityType === "memory")).toHaveLength(40);
  });

  it("holds the Meals screen's food preferences, the place book and home", () => {
    expect(byId("food_preference:fp-1")!.summary).toBe("Upasana Sharma likes Italian food (from the Meals screen).");
    expect(byId("place:p-1")!.summary).toContain("Cafe Goodluck (cafe) is a place the family saved, at FC Road, Pune; note: Kids love the bun maska.");
    expect(byId(`home_address:${HOUSEHOLD}`)!.summary).toBe("Home is at 12 Lane 5, Koregaon Park, Pune.");
    expect(byId(`home_address:${HOUSEHOLD}`)!.privacyClass).toBe("location");
  });

  it("an allergy is health, which only a member who may read health is given", () => {
    const allergy = buildStoreItems({ members: MEMBERS, foodPreferences: [{ id: "fp-2", memberId: "m-asmi", kind: "allergy", subject: "peanuts" }] }, [], SCOPE).find((item) => item.id === "food_preference:fp-2")!;
    expect(allergy.privacyClass).toBe("health");
  });
});

describe("when the stored context can be read as it is", () => {
  const built = new Date("2026-10-18T06:00:00Z");

  it("is current with no write since its build began", () => {
    expect(storeIsCurrent({ builtAt: built, staleSince: null }, NOW, "Asia/Kolkata")).toBe(true);
    expect(storeIsCurrent({ builtAt: built, staleSince: new Date("2026-10-18T05:59:00Z") }, NOW, "Asia/Kolkata")).toBe(true);
  });

  it("is behind when a write landed after the build began reading", () => {
    expect(storeIsCurrent({ builtAt: built, staleSince: new Date("2026-10-18T06:00:01Z") }, NOW, "Asia/Kolkata")).toBe(false);
    expect(storeIsCurrent({ builtAt: built, staleSince: built }, NOW, "Asia/Kolkata")).toBe(false);
  });

  it("is behind after an hour, and on the household's next day", () => {
    expect(storeIsCurrent({ builtAt: new Date("2026-10-18T05:00:00Z"), staleSince: null }, NOW, "Asia/Kolkata")).toBe(false);
    // 18:20 UTC on the 17th is 23:50 in Kolkata; 18:40 UTC is 00:10 on the 18th.
    expect(storeIsCurrent({ builtAt: new Date("2026-10-17T18:20:00Z"), staleSince: null }, new Date("2026-10-17T18:40:00Z"), "Asia/Kolkata")).toBe(false);
  });

  // Audit B5: only a row behind by age alone may answer while it is rebuilt after the response.
  it("may answer while rebuilt only when behind by age alone", () => {
    expect(storeIsOnlyAged({ builtAt: new Date("2026-10-18T05:00:00Z"), staleSince: null }, NOW, "Asia/Kolkata")).toBe(true);
    expect(storeIsOnlyAged({ builtAt: new Date("2026-10-18T05:00:00Z"), staleSince: new Date("2026-10-18T04:59:00Z") }, NOW, "Asia/Kolkata")).toBe(true);
  });

  it("never answers when current, when a write marked it, or when built on an earlier day", () => {
    expect(storeIsOnlyAged({ builtAt: built, staleSince: null }, NOW, "Asia/Kolkata")).toBe(false);
    expect(storeIsOnlyAged({ builtAt: new Date("2026-10-18T05:00:00Z"), staleSince: new Date("2026-10-18T05:30:00Z") }, NOW, "Asia/Kolkata")).toBe(false);
    expect(storeIsOnlyAged({ builtAt: built, staleSince: new Date("2026-10-18T06:00:01Z") }, NOW, "Asia/Kolkata")).toBe(false);
    expect(storeIsOnlyAged({ builtAt: new Date("2026-10-17T18:20:00Z"), staleSince: null }, new Date("2026-10-17T18:40:00Z"), "Asia/Kolkata")).toBe(false);
  });
});

function item(id: string, extra: Partial<HouseholdContextItem> = {}): HouseholdContextItem {
  return {
    id, householdId: HOUSEHOLD, domain: "calendar", entityType: "event", entityId: id, subjectMemberIds: [], summary: id, need: "", attributes: {},
    source: { type: "t", sourceId: id, capturedAt: null }, evidence: [], confidence: 1, confirmed: true, privacyClass: "general",
    validFrom: null, validUntil: null, freshnessAt: "2026-10-01T00:00:00.000Z", freshness: "current", tier: 2, aliases: [], relatedEntityIds: [], authority: 3, ...extra,
  };
}

describe("the size cap lets history go first", () => {
  it("drops historical items, oldest first, before anything current", () => {
    const padding = "x".repeat(400);
    const items = [
      ...Array.from({ length: 10 }, (_, index) => item(`old-${index}`, { freshness: "historical", freshnessAt: `2026-0${(index % 9) + 1}-01T00:00:00.000Z`, summary: padding })),
      ...Array.from({ length: 4 }, (_, index) => item(`now-${index}`, { summary: padding })),
    ];
    const all = JSON.stringify(items).length;
    const { items: kept, json } = fitToCap(items, all - 1500);
    expect(json.length).toBeLessThanOrEqual(all - 1500);
    expect(kept.filter((entry) => entry.id.startsWith("now-"))).toHaveLength(4);
    expect(kept.length).toBeLessThan(items.length);
  });

  it("leaves a household under the cap untouched", () => {
    const items = [item("a"), item("b")];
    expect(fitToCap(items, STORE_MAX_BYTES).items).toEqual(items);
  });
});

const adult: ContextViewer = { memberId: "m-kunal", permissions: ["finance.view", "school.manage", "health.manage"], tone: "adult", guardianOf: ["m-asmi"] };
const child: ContextViewer = { memberId: "m-asmi", permissions: ["school.view_own"], tone: "child", guardianOf: [] };

describe("a viewer's gates over stored items", () => {
  const stored = [
    item("household:h", { domain: "household", entityType: "household" }),
    item("bill:1", { domain: "bills", entityType: "bill", privacyClass: "financial" }),
    item("meal:1", { domain: "meals", entityType: "meal" }),
    item("school_item:asmi", { domain: "school", entityType: "school_item", subjectMemberIds: ["m-asmi"] }),
    item("school_item:manan", { domain: "school", entityType: "school_item", subjectMemberIds: ["m-manan"] }),
    item("school_communication:1", { domain: "school", entityType: "school_communication", subjectMemberIds: ["m-asmi"] }),
    item("member:m-kunal", { domain: "people", entityType: "member" }),
    item("event:1"),
  ];

  it("an adult sees the household's records; people and the household come from the live read", () => {
    expect(storedItemsForViewer(stored, adult, null).map((entry) => entry.id)).toEqual(["bill:1", "meal:1", "school_item:asmi", "school_item:manan", "school_communication:1", "event:1"]);
  });

  it("a child sees her own school items, no bills, no meals, no school notes", () => {
    expect(storedItemsForViewer(stored, child, null).map((entry) => entry.id)).toEqual(["school_item:asmi", "event:1"]);
  });

  it("only the domains a caller asked for", () => {
    expect(storedItemsForViewer(stored, adult, new Set(["meals"])).map((entry) => entry.id)).toEqual(["meal:1"]);
  });
});

describe("loadHouseholdContext and the store", () => {
  const scope: ContextScope = { ...SCOPE, viewer: adult };
  const snapshot: ContextSnapshot = { scope, items: [item("event:from-store")], unavailable: [], withheld: [], heldForAdults: 0, gatheredAt: NOW };

  it("answers from the store when one is registered", async () => {
    setContextStoreReader(async () => snapshot);
    try {
      expect((await loadHouseholdContext({} as never, scope)).items.map((entry) => entry.id)).toEqual(["event:from-store"]);
    } finally {
      setContextStoreReader(null);
    }
  });

  it("reads live when the store has nothing to say", async () => {
    setContextStoreReader(async () => null);
    try {
      // A client whose every read fails: the live path still answers, naming what it could not read.
      const failing = { from: () => { throw new Error("no database"); } } as never;
      const live = await loadHouseholdContext(failing, { ...scope, householdId: "h-live" }, { domains: ["meals"] });
      expect(live.items.some((entry) => entry.entityType === "household")).toBe(true);
      expect(live.unavailable).toContain("meals");
      expect(gatherHouseholdContext).toBeTypeOf("function");
    } finally {
      setContextStoreReader(null);
    }
  });
});

describe("keeping the stores warm (HomeBrain 4.0 §3.8, story 14-031)", () => {
  it("rebuilds only stores that are behind or over an hour old, a few per tick, oldest first", async () => {
    const now = new Date("2026-10-18T10:00:00Z");
    const rows = [
      { household_id: "old", built_at: "2026-10-18T08:30:00Z", stale_since: null },
      { household_id: "marked", built_at: "2026-10-18T09:50:00Z", stale_since: "2026-10-18T09:55:00Z" },
      { household_id: "fresh", built_at: "2026-10-18T09:55:00Z", stale_since: "2026-10-18T09:00:00Z" },
    ];
    const asked: string[] = [];
    const chain = (result: unknown) => {
      const query: Record<string, unknown> = {};
      for (const method of ["select", "gte", "order", "limit", "eq"]) query[method] = () => query;
      query.maybeSingle = async () => result;
      query.then = (resolve: (value: unknown) => unknown) => resolve(result);
      return query;
    };
    const admin = {
      from: (table: string) => {
        if (table === "household_context") return chain({ data: rows, error: null });
        return {
          select: () => ({
            eq: (_column: string, id: string) => {
              asked.push(id);
              return { maybeSingle: async () => ({ data: null, error: null }) };
            },
          }),
        };
      },
    } as unknown as Parameters<typeof keepStoresWarm>[0];
    await keepStoresWarm(admin, now, 4);
    expect(asked).toEqual(["old", "marked"]);
  });
});
