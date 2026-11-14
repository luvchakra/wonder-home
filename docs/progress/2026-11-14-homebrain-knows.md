# HomeBrain knows (Nothing stuck in review, part C) — 2026-11-14

Story 14-069. The owner asked for HomeBrain, HomeSend and HomeTalk to work as one unit so that "minimum intervention is required" and "minimum info is pending for review". Part C means WonderHome works things out from the household's own records before it asks, learns from every answer, checks its own work overnight, and sets how sure it must be from the household's own accuracy.

## What was done
- **Memory resolver** (`packages/core/src/homebrain/memory-resolve.ts`). It fills in who something is for, the school, payee, category, place, area or grocery item from members' schools, past bills, saved places, groceries, Responsibilities and learned rules. It fills a gap only when exactly one answer is supported, and only at confidence 0.8 or above. Its "Why?" comes from evidence (record and rule ids). It never fills who a health document is for, and never overrides a name the content used.
- **Household rules** (`homebrain/rules.ts`, `rules-repository.ts`, table `homesend_learned_defaults`). The new kinds are sender_person, sender_area, vendor_category, phrase_item and place_alias.
  - **Safety:** a rule never crosses households, and never carries money, approval or permission. This is enforced by `safeRuleText`, the table's currency check and RLS.
  - **Mixed keys:** a key taught two different values becomes mixed and is asked again.
  - **Review picks:** these now teach a sender's kind and a payee's category.
  - **Corrections:** `learnFromCorrection` also marks `homesend_changes.corrected_at`.
- **Nightly verification** (`homebrain/verify-night.ts` and `verify-night-run.ts`, inside `sleepHousehold`).
  - **Conflicts:** it raises duplicates, date clashes, unusual amounts (the amount is never said) and senders that don't match. At most 5 a night, each raised once, each with a default.
  - **Confirmations:** it confirms Checking entries that a second, separately sent source or a kept pattern supports, and records `confirmed_basis`. It never confirms health documents.
- **A bar for each kind** (`homebrain/kind-bar.ts`, table `homebrain_kind_bars`, refreshed nightly). The limits are in `docs/agent-platform.md`.
  - **Range:** between 80% and 99%. A bar an Admin picks still overrides it, and Settings has a new "Set for each kind by WonderHome" choice.
  - **Where it applies:** HomeSend's review and auto-add use it (`loadAutomationBar`).
  - **How it bites today:** reading scores come in fixed bands, so a bar of 80–85% admits the 0.9 band, 90–95% admits only verified readings, and 97–99% admits nothing.
- **Settings → AI Assistant:** "What HomeSend has learned" shows rules of every type, and each kind's current bar sits under the bar picker. The words are in all eight languages, along with help body.13 and the FAQ.

## Verified
- **Unit tests:** `npx vitest run` on homebrain, evaluation, household and learned passed 909 of 909. The home-send and settings tests in the web app passed 16 of 16.
- **DB tests:** `scripts/test-homebrain-rules-rls.mjs` passed 6 of 6 and `test-homesend-rls.mjs` passed 75 of 75.
- **Eval:** `npm run eval -- --cases HB-15…HB-39` passed 25 of 25.
- **Typecheck:** core and web are clean. `lint:knowledge` and `lint:help-links` both pass.

## Open
- **Live migration:** `20261114231537_homebrain_household_rules.sql` timed out waiting for approval, and the SQL went to the owner to run by hand. Until it is run, nothing new is learned or stored: the app keeps working on the 14-066 behaviour.
- **Wiring after parts A and B merge:**
  - nightly conflicts into "Needs you" (`askNeedsYou` plus a handler);
  - `learnFromCorrection` in `hometalk/entry-corrections.ts` and in the correction block of `hometalk-turn.ts`;
  - `resolveGaps` in `conversation/grounding.ts`.
  Until the first of these lands, `needs-sink.ts` returns null: conflicts are only counted and entries are kept, which is every conflict's default.
- **Not yet run:** the 360 px and desktop ui-check of Settings (it needs the live migration), and the live-provider run of the HB cases.
