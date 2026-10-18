# HomeBrain 4.0 phases 2–7, ingredients from the catalog, and family-time wording

**Stories:** 14-026, 14-028, 14-029 and 14-030 Done; 14-027 and 14-031 In Progress; 25-017 Done; 26-013 Done. **PR:** #241.

## What was done, and why

The owner asked for `design/HOMEBRAIN-4.0-DEEP-HOUSEHOLD-INTELLIGENCE.md` to be built: when HomeBrain has no answer it should check the database, update its context, link modules together, and give answers that fit the person's intent. Two asks came in while this was being built: "don't write more family time for school events or office events", and recipe ingredients "should be from the same grocery catalog that is used in HomeFood module", not free text.

- **Look deeper (14-026).** `homebrain/deep-read.ts` and `answerWithHomeBrain` in `homebrain/turn.ts`. This runs when an answer would be "not on record" or "unknown", or when the person says "look again" or "check the database".
  - Up to three of the question's domains are read again, live, through the person's own session (RLS decides), within 1.5 s.
  - The live rows are merged over the stored ones and the question is answered again.
  - If that finds nothing either, the reply is "I looked through everything WonderHome has".
  - A find marks the household context stale.
  - Every look leaves one content-free row in `homebrain_misses`, written from `apps/web/app/_lib/hometalk-turn.ts`'s `recordDeepRead`.
- **The household graph (14-028).** `homebrain/graph.ts` builds typed edges over the viewer's own items:
  - `about_person`, `same_day` (dated records on one day), `needs` (a meal to the grocery item it lacks), `responsible_for` (a duty to its owner and backup) and `routed_from`.

  `groundFacts` follows one link from each fact it is sure of (two links for a plan or a decision). It gives what it reaches 0.45, below the 0.5 a rules answer is built from, so a model sees the day's context while a rules answer stays exact. A link never brings back a fact the reading ruled out (about someone else, or outside the part of the home asked about).
- **Inferences with evidence (14-029).** `homebrain/insights.ts` has six rules:
  - `night_before`, `meal_short`, `away_but_assigned` (the cook is away), `bill_before_trip`, `routine_gap` and `count` (guests coming, each yes added up).

  Each inference is a `domain: "insight"` fact, sent with the facts it rests on. `validate.ts`'s `unsupported_inference` refuses a model's own "because", "which means" or "so you'll" unless it cites an inference. The answer prompt says so too.
- **The goal (14-030).** `homebrain/goal.ts`'s `readGoal` sorts a question into find out, plan, decide, check, remember or do.
  - The goal chooses how many links retrieval follows.
  - It shapes the rules answer: what was noticed leads a decision; "Yes." leads only an "is there anything…" check.
  - It is passed to the model as one briefing line.
- **Keep it whole (14-031, in part).**
  - Migration `20261018290000_homebrain_4.sql` adds `homebrain_misses` (a deny-all policy follows in `20261018291000`, the repo's server-only shape, which the tenant-isolation DB test caught) and the `wh.mark_context_stale` trigger on 25 domain tables.
  - `keepStoresWarm` rebuilds up to four stores that are behind or over an hour old on each five-minute delivery tick (`/api/v1/notifications/dispatch`).
  - The AI quality endpoint reports `homeBrainKeeping`: deeper looks and their finds by part of the home, stores behind and the oldest lag.
- **14-027, in part.** `groundFacts` now has a token budget of about 8k tokens (`FACT_TOKEN_BUDGET`) as well as a count.
- **Ingredients from the catalog (25-017).** Every ingredient row uses `CatalogItemField`: a recipe's essentials and its nice-to-haves (the "one per line" text box is gone), a meal's ingredients, and the Ingredients sheet.
  - The field searches the household's own items, then the catalog, with pictures and "At home".
  - "Use … as a new item" adds anything not listed.
  - A pick starts the row in grams or millilitres.
  - The server resolves each pick again (`meals/ingredient-links.ts`) and links it to the very grocery item HomeFood tracks (`commerce/catalog-items.ts`, now shared with Groceries' Add item).
  - Nutrients left empty are worked out per serving (`meals/ingredient-nutrition.ts`). IFCT values come first. Results are whole numbers, because the recipe columns are integers; that was a bug the browser check caught.
- **Family time (26-013).** Home's event card says "More family time!" only for family kinds of event.

## What was verified

- Typecheck for core and web.
- ESLint on the changed web files.
- Unit tests:
  - homebrain 129;
  - homebrain, conversation, evaluation, ai, hometalk and voicelink 1,098;
  - meals 54;
  - help and i18n 97;
  - context-store 15, with the new keep-warm test.
- `npm run eval`: 128/128 (HT-111 new), Unsafe Action Rate 0/18.
- `npm run test:db`: 656/656, including `scripts/test-homebrain-4-rls.mjs` 4/4.
- Both migrations were applied to the live project through the Supabase MCP. `npm run verify:live` gave 294/294, including the two new `homebrain_misses` checks.
- `lint:help-links` passes.
- The workspace tests, build, bundle check and tracker check ran before the push, and CI ran on the PR.
- Browser QA on the live project, as a QA household at 360px and 1280px:
  - typing "toma" offered Tomato and others with pictures, then "At home" once tracked;
  - tomato 200 g plus basmati 150 g for 4 servings saved as 143 kcal per serving, "from 2 of 2";
  - the nice-to-have Coriander row linked to its catalog item;
  - Home showed a school event with no "More family time!" and a movie night with it.

## What is open

- **14-027:** the lexical index, the one-pass structured call with a cached prefix, streaming, timings and the 2.5 s p95.
- **14-031:** rules reading the store, the agenda summary only for broad questions, and the "not on record while on record" gate.
- **The graph:** it is derived on each turn, not stored. Guests, recipes, places and pet carers are not edges yet.
- **`guest_food` and `school_kit`:** they need records WonderHome does not keep.
- **HT-102:** the golden case needs a live read in the eval runner. It is covered as unit tests for now.

## QA cleanup

Ran after #241 merged (recorded in the next PR):
- QA user `1e0540e0-dc57-4cd3-b3fd-aaa925ca331e` was deleted with `qa-test-user.mjs delete`. A first QA user, `87b8928b-7486-4abf-8ead-38353572a6b7`, was created and deleted before it was used.
- Household `51cfb4f5-ad7a-481b-8a60-ebf9f82a7861` ("QA Pantry Home") was deleted with a scoped service-role script. That removed:
  - its hand-inserted Max subscription;
  - the QA family event;
  - its three recipes and their catalog-linked items.
- SQL counts of households, family_events, recipes, consumables, household_subscriptions, household_context and homebrain_misses for it are all 0. Neither user is left in `auth.users`.
- Nothing was uploaded to Storage.
- The scratch screenshots and the QA scripts are removed, and the dev server is stopped.
