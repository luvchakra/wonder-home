#!/usr/bin/env node
/**
 * HomeFood 25-006: the shared grocery catalog and USDA foods.
 *
 * Every signed-in member reads the catalog and searches it; no session writes
 * it, and a signed-out visitor sees nothing. The search ranks a name match
 * above another name's, and WonderHome's items before products. USDA foods are
 * the service role's alone: no session reads or writes them. A USDA food's
 * catalog id and its link status always agree.
 */
import assert from "node:assert/strict";
import { before, test } from "node:test";

import { asProfile, deniedForAnonymous, deniedForProfile, psql } from "./lib/db.mjs";
import { buildTestDatabase } from "./setup-test-db.mjs";

const DB = process.env.WH_TEST_DB ?? "wonderhome_grocery_catalog_test";
const options = { database: DB };
const MEMBER = "11111111-1111-4111-8111-111111111111";

let toorDal = "";

before(() => {
  buildTestDatabase(DB);
  psql(`insert into auth.users (id, email) values ('${MEMBER}', 'member@example.test');`, options);
  asProfile(MEMBER, `select wh.create_household('Sharma Home', 'Kunal');`, options);
  toorDal = psql(
    `insert into public.grocery_catalog (source, source_id, kind, name, category, subcategory, unit, aliases, licence, attribution, search_text)
     values ('wonderhome', 'toor-dal', 'item', 'Toor dal', 'Dals & pulses', 'Split dals', 'kg', '{arhar dal}', 'WonderHome curated', 'WonderHome', 'toor dal arhar dal')
     returning id;`,
    options,
  );
  psql(
    `insert into public.grocery_catalog (source, source_id, kind, name, brand, category, unit, licence, attribution, search_text)
     values ('open_food_facts', '8901000000001', 'product', 'Arhar Dal Premium', 'Example', 'Dals & pulses', 'kg', 'ODbL 1.0', 'Open Food Facts contributors', 'arhar dal premium example');
     insert into public.grocery_catalog (source, source_id, kind, name, category, unit, licence, attribution, search_text, active)
     values ('wonderhome', 'retired-thing', 'item', 'Arhar old', 'Dals & pulses', 'kg', 'WonderHome curated', 'WonderHome', 'arhar old', false);`,
    options,
  );
});

test("a member reads the catalog; nobody writes it from a session", () => {
  assert.equal(asProfile(MEMBER, `select count(*) from public.grocery_catalog;`, options), "3");
  assert.ok(deniedForProfile(MEMBER, `insert into public.grocery_catalog (source, source_id, name, category, unit, licence, attribution, search_text) values ('wonderhome', 'x', 'X', 'Other', 'kg', 'l', 'a', 'x');`, options));
  assert.ok(deniedForProfile(MEMBER, `update public.grocery_catalog set name = 'Mine';`, options));
});

test("a signed-out visitor sees nothing and cannot search", () => {
  assert.ok(deniedForAnonymous(`select count(*) from public.grocery_catalog;`, options));
  assert.ok(deniedForAnonymous(`select count(*) from public.search_grocery_catalog('dal', 5);`, options));
});

test("search ranks the name before another name, items before products, and skips inactive entries", () => {
  const names = asProfile(MEMBER, `select string_agg(name, '|') from (select name from public.search_grocery_catalog('arhar', 10)) s;`, options);
  assert.equal(names, "Arhar Dal Premium|Toor dal");
  assert.equal(asProfile(MEMBER, `select string_agg(name, '|') from public.search_grocery_catalog('toor', 10);`, options), "Toor dal");
  // Wildcards a caller sends are not wildcards.
  assert.equal(asProfile(MEMBER, `select count(*) from public.search_grocery_catalog('%%', 10);`, options), "0");
});

test("only a product names the item it is", () => {
  assert.throws(() => psql(`update public.grocery_catalog set item_id = id where id = '${toorDal}';`, options));
});

test("USDA foods are the service role's alone, and a link's catalog id and status agree", () => {
  psql(`insert into public.usda_foods (fdc_id, data_type, description, release) values (172436, 'sr_legacy', 'Pigeon peas (red gram), mature seeds, raw', 'SR Legacy 2018-04');`, options);
  assert.ok(deniedForProfile(MEMBER, `select * from public.usda_foods;`, options));
  assert.ok(deniedForProfile(MEMBER, `update public.usda_foods set link_status = 'approved';`, options));
  assert.throws(() => psql(`update public.usda_foods set link_status = 'candidate' where fdc_id = 172436;`, options));
  psql(`update public.usda_foods set catalog_id = '${toorDal}', link_status = 'candidate', match_type = 'close' where fdc_id = 172436;`, options);
  assert.equal(psql(`select link_status from public.usda_foods where catalog_id = '${toorDal}';`, options), "candidate");
});

test("the kind search puts the everyday variant first and keeps items and products apart (25-010)", () => {
  psql(
    `insert into public.grocery_catalog (source, source_id, kind, name, category, unit, common, licence, attribution, search_text)
     values ('wonderhome', 'eggs-white', 'item', 'Eggs, White', 'Eggs', 'pcs', true, 'WonderHome curated', 'WonderHome', 'eggs white eggs anda'),
            ('wonderhome', 'eggs-duck', 'item', 'Eggs, Duck', 'Eggs', 'pcs', false, 'WonderHome curated', 'WonderHome', 'eggs duck duck eggs');`,
    options,
  );
  assert.equal(asProfile(MEMBER, `select string_agg(name, '|') from public.search_grocery_catalog_kind('eggs', 10, 'item');`, options), "Eggs, White|Eggs, Duck");
  assert.equal(asProfile(MEMBER, `select count(*) from public.search_grocery_catalog_kind('eggs', 10, 'product');`, options), "0");
  assert.ok(deniedForAnonymous(`select count(*) from public.search_grocery_catalog_kind('eggs', 5, 'item');`, options));
});

test("IFCT foods are read by members, written by nobody, and only a curated item links to one (25-009)", () => {
  psql(`insert into public.ifct_foods (code, name, food_group, nutrients) values ('B021', 'Red gram, dal', 'Grain Legumes', '{"energy_kcal": 331}');`, options);
  assert.equal(asProfile(MEMBER, `select name from public.ifct_foods where code = 'B021';`, options), "Red gram, dal");
  assert.ok(deniedForProfile(MEMBER, `insert into public.ifct_foods (code, name, food_group) values ('B099', 'X', 'Y');`, options));
  assert.ok(deniedForAnonymous(`select count(*) from public.ifct_foods;`, options));
  psql(`update public.grocery_catalog set ifct_code = 'B021', ifct_match = 'exact' where id = '${toorDal}';`, options);
  // A link always says how close it is, and a packed product carries its own label.
  assert.throws(() => psql(`update public.grocery_catalog set ifct_match = null where id = '${toorDal}';`, options));
  assert.throws(() => psql(`update public.grocery_catalog set ifct_code = 'B021', ifct_match = 'close' where kind = 'product';`, options));
});
