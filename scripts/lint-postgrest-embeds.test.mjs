import assert from "node:assert/strict";
import { test } from "node:test";

import {
  embedsIn,
  foreignKeysIn,
  lintSelects,
  relationshipCount,
  selectCalls,
} from "./lint-postgrest-embeds.mjs";

const SCHEMA = `
create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null
);

alter table public.households
  add constraint households_owner_member_fk
  foreign key (owner_member_id) references public.household_members(id) on delete restrict;

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade
);
`;

const keys = foreignKeysIn(SCHEMA);

test("reads both the inline and the named foreign key forms", () => {
  assert.ok(keys.some((key) => key.child === "household_members" && key.parent === "households"));
  assert.ok(
    keys.some(
      (key) => key.child === "households" && key.parent === "household_members" && key.constraint === "households_owner_member_fk",
    ),
  );
});

test("counts relationships in either direction", () => {
  assert.equal(relationshipCount(keys, "household_members", "households"), 2);
  assert.equal(relationshipCount(keys, "pets", "households"), 1);
  assert.equal(relationshipCount(keys, "pets", "household_members"), 0);
});

test("rejects the embed that took production down", () => {
  // The exact shape of the bug: two foreign keys connect these tables, so
  // PostgREST answered PGRST201 and every signed-in page returned a 500.
  const source = `
    const { data } = await supabase
      .from("household_members")
      .select("id, display_name, households(id, name), household_roles(role)")
      .eq("status", "active");
  `;

  const problems = lintSelects("packages/core/src/identity/households.ts", source, keys);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ambiguous/);
  assert.match(problems[0], /PGRST201/);
});

test("accepts the same embed once the relationship is named", () => {
  const source = `
    const { data } = await supabase
      .from("household_members")
      .select("id, households!household_members_household_id_fkey(id, name), household_roles(role)");
  `;

  assert.deepEqual(lintSelects("x.ts", source, keys), []);
});

test("leaves an unambiguous embed alone, modifiers included", () => {
  const source = `await supabase.from("pets").select("id, households!inner(id, name)");`;
  assert.deepEqual(lintSelects("x.ts", source, keys), []);
});

test("does not mistake a modifier for a constraint name", () => {
  const source = `await supabase.from("household_members").select("id, households!inner(id)");`;
  const problems = lintSelects("x.ts", source, keys);
  assert.equal(problems.length, 1, "!inner does not disambiguate anything");
});

test("finds embeds without being confused by nested columns", () => {
  const embeds = embedsIn("id, name, households!fk(id, name, owner_member_id), roles(role)");
  assert.deepEqual(
    embeds.map((embed) => [embed.table, embed.constraint]),
    [
      ["households", "fk"],
      ["roles", null],
    ],
  );
});

test("pairs a select with the from it belongs to across line breaks", () => {
  const source = `
    await supabase
      .from("household_members")
      .select(
        "id, households(id)",
      );
  `;
  assert.deepEqual(selectCalls(source), [{ table: "household_members", select: "id, households(id)" }]);
});

test("ignores a select with no embeds at all", () => {
  const source = `await supabase.from("pets").select("id, name, species");`;
  assert.deepEqual(lintSelects("x.ts", source, keys), []);
});
