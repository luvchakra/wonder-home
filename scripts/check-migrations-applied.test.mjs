import assert from "node:assert/strict";
import { test } from "node:test";

import { baseName, missingFromHistory } from "./check-migrations-applied.mjs";

test("baseName strips the timestamp and extension", () => {
  assert.equal(baseName("20261020200000_food_preferences_diet.sql"), "food_preferences_diet");
  assert.equal(baseName("food_preferences_diet"), "food_preferences_diet");
});

test("files match history by base name, whatever version the history stamped", () => {
  const files = ["20261020200000_food_preferences_diet", "20261021070000_chat_reactions"];
  assert.deepEqual(missingFromHistory(files, ["20261020200000_food_preferences_diet"]), ["20261021070000_chat_reactions"]);
  assert.deepEqual(missingFromHistory(files, ["food_preferences_diet", "chat_reactions"]), []);
});
