import { describe, expect, it } from "vitest";

import { buildContextItems } from "../context/builders";
import { mergeRecords } from "../context/repository";
import type { ContextRecords } from "../context/builders";
import type { HouseholdMember } from "../identity/households";
import { describeWords, describeRow, registryItems } from "./describe";
import { KNOWLEDGE_REGISTRY, REGISTRY_EXAMPLE_MEMBERS, REGISTRY_READ } from "./registry";
// @ts-expect-error -- a plain .mjs script, tested from here.
import { lintKnowledge } from "../../../../scripts/lint-knowledge-registry.mjs";

/**
 * Generated from the registry itself: every table the household record index
 * reads is tested from its own example row, so a new table is tested without
 * anyone writing a case for it (design/HOUSEHOLD-RECORD-INDEX.md §5).
 */

const TZ = "Asia/Kolkata";
const NOW = new Date("2026-10-23T14:58:00Z");
const NAMES = new Map<string, string>([
  [REGISTRY_EXAMPLE_MEMBERS.child, "Asmi"],
  [REGISTRY_EXAMPLE_MEMBERS.adult, "Kunal"],
]);
const context = { householdId: "hh", words: describeWords(TZ, NAMES), today: "2026-10-23", nowIso: NOW.toISOString() };

describe.each(REGISTRY_READ.map((spec) => [spec.table, spec] as const))("%s becomes a HomeBrain fact", (_table, spec) => {
  const item = describeRow(spec, spec.example, context);

  it("describes its example row", () => {
    expect(item).not.toBeNull();
    expect(item!.domain).toBe(spec.domain);
    expect(item!.source.type).toBe(spec.table);
  });

  it("says it in words, with nothing missing showing through", () => {
    expect(item!.summary.length).toBeGreaterThan(10);
    expect(item!.summary).not.toMatch(/\b(?:undefined|null|NaN|\[object Object\])\b/);
    expect(item!.summary).not.toMatch(/\s{2,}|\s[.,;]/);
    expect(item!.aliases).toContain(item!.attributes.title);
  });

  it("keeps its privacy and the people it is about", () => {
    expect(item!.privacyClass).toBe(spec.privacy);
    if (spec.privacy === "health") expect(item!.healthScope).toBeDefined();
    for (const subject of item!.subjectMemberIds) expect(NAMES.has(subject)).toBe(true);
    for (const subject of spec.subjects(spec.example)) if (typeof subject === "string") expect(item!.summary).toContain(NAMES.get(subject)!);
  });
});

describe("the registry", () => {
  it("names every generic table with a bounded read", () => {
    for (const spec of REGISTRY_READ) expect(spec.limit, spec.table).toBeLessThanOrEqual(500);
  });

  it("gives every excluded table a reason", () => {
    for (const [table, spec] of Object.entries(KNOWLEDGE_REGISTRY)) if (spec.covered === "excluded") expect(spec.reason.length, table).toBeGreaterThan(15);
  });

  it("reads FamilyChat, credentials and live location never", () => {
    for (const table of ["chat_messages", "household_ai_credentials", "member_locations", "instamart_tokens", "event_invite_links"] as const) expect(KNOWLEDGE_REGISTRY[table].covered).toBe("excluded");
  });
});

describe("registry rows reach the household's facts", () => {
  const asmi: HouseholdMember = {
    id: REGISTRY_EXAMPLE_MEMBERS.child, displayName: "Asmi", memberType: "child", status: "active", roles: [], isOwner: false, dateOfBirth: null, nickname: null,
    relationship: null, occupation: null, schoolOrWorkLocation: null, specialOccasionLabel: null, specialOccasionDate: null, gender: null, notes: null, avatarUrl: null,
  };

  it("through the same builder every other fact goes through", () => {
    const items = buildContextItems(
      { members: [asmi], registry: { child_goals: [KNOWLEDGE_REGISTRY.child_goals.example], school_teachers: [KNOWLEDGE_REGISTRY.school_teachers.example] } },
      { householdId: "hh", householdName: "Home", timezone: TZ, now: NOW, viewerMemberId: asmi.id, limitLists: false },
    );
    expect(items.find((item) => item.source.type === "child_goals")?.summary).toContain('Asmi has the goal "Practise piano 20 minutes"');
    expect(items.find((item) => item.source.type === "school_teachers")?.summary).toContain("Mrs Iyer is Asmi's class teacher");
  });

  it("keeps each adapter's tables when records are merged", () => {
    const records: ContextRecords = {};
    mergeRecords(records, { registry: { budgets: [] } });
    mergeRecords(records, { registry: { child_goals: [] }, pets: [] });
    expect(Object.keys(records.registry ?? {}).sort()).toEqual(["budgets", "child_goals"]);
    expect(records.pets).toEqual([]);
  });

  it("marks past things as history and keeps future ones current", () => {
    const [past] = registryItems({ consumable_purchases: [KNOWLEDGE_REGISTRY.consumable_purchases.example] }, { householdId: "hh", timezone: TZ, now: NOW, names: NAMES });
    const [ahead] = registryItems({ gift_plans: [KNOWLEDGE_REGISTRY.gift_plans.example] }, { householdId: "hh", timezone: TZ, now: NOW, names: NAMES });
    expect(past!.freshness).toBe("historical");
    expect(ahead!.freshness).toBe("current");
    expect(ahead!.attributes.date).toBe("2026-11-14");
  });
});

describe("the coverage lint", () => {
  const registry = `export const KNOWLEDGE_REGISTRY = {\n  pets: { covered: "builder", records: "pets" },\n  jobs: { covered: "excluded", reason: "queue" },\n} as const;`;
  const trigger = (names: string) => `do $t$ declare name text; begin foreach name in array array[${names}] loop execute format('create trigger x after insert on public.%I for each row execute function wh.mark_context_stale()', name); end loop; end; $t$;`;

  it("fails a new household table no one named", () => {
    const problems = lintKnowledge([["1.sql", "create table public.pets (id uuid, household_id uuid);\ncreate table public.jobs (household_id uuid);\ncreate table public.piano_lessons (id uuid, household_id uuid);"], ["2.sql", trigger("'pets'")]], registry);
    expect(problems).toEqual([expect.stringContaining("piano_lessons: holds household records but is not in knowledge/registry.ts")]);
  });

  it("fails a table read as knowledge without the stale trigger", () => {
    const problems = lintKnowledge([["1.sql", "create table public.pets (id uuid, household_id uuid);\ncreate table public.jobs (household_id uuid);"]], registry);
    expect(problems).toEqual([expect.stringContaining("pets: read as knowledge (builder) but has no wh.mark_context_stale trigger")]);
  });

  it("passes when every table is named and triggered, and ignores platform tables", () => {
    const problems = lintKnowledge([["1.sql", "create table public.pets (id uuid, household_id uuid);\ncreate table public.jobs (household_id uuid);\ncreate table public.plans (key text);"], ["2.sql", trigger("'pets'")]], registry);
    expect(problems).toEqual([]);
  });
});
