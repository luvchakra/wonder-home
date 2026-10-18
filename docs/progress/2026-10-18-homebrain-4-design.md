# HomeBrain 4.0 designed; push keys live

**Date:** 2026-10-18 · **Spec:** `design/HOMEBRAIN-4.0-DEEP-HOUSEHOLD-INTELLIGENCE.md` · **Stories:** 14-024 to 14-031

## Why

Two Gemini Live conversations the owner sent from the phone (22:29 and 22:35 IST):

- **"Okay, so. Okay, who are the family members in this household?"** was answered "I couldn't find the specific list of family members". Asked "can you check the WonderHome database?", HomeTalk said the same again.
  - The roster rule is anchored and did not match the spoken lead-in or "in this household" (checked: `isRosterQuestion` is false for both).
  - The `people` facts are background to a deterministic answer.
  - Nothing in HomeBrain can look again.
- **"I am planning a movie night on Friday this week"** got "That needs your OK on the screen, please type it".
  - `plan_event` is `app_only` for Gemini voice (`voicelink/capabilities.ts`, `planning_changes`).
  - Typed, it becomes a proposal waiting for a yes.
  - The owner: "it should just understand user intent and do what is asked during conversation, no separate okay required".

## What was decided (proposed to the owner)

HomeBrain 4.0, in eight phases. Each is one PR, written to be built from the spec alone:

- **0. Hearing it right:** normalise the utterance first, so every rule reads the canonical sentence, and widen the roster rule.
- **1. Do what was asked:** conversational consent. Everyday reversible changes run at once, with an undo by voice or chip. Others' duties and guests are confirmed in the conversation. Only payments, orders and access go to the screen. Gemini in the app gets the same policy.
- **2. Look deeper:** a targeted live read before "not on record", then the store is repaired. Misses are counted.
- **3. One pass over the store:** this was 3.0 phase B.
- **4. The household graph:** typed links across every module.
- **5. Inferences:** cross-module heads-ups by rules, with evidence and a validator guard.
- **6. Answers shaped by the goal.**
- **7. Keep it whole:** this was 3.0 phases C and D.

14-021 to 14-023 are marked Deferred and folded into 14-027 and 14-031. The owner's decisions are spec §7. The proposed defaults stand unless changed.

## Also in this session

- **Push notifications are live** (story 23-015).
  - A VAPID key pair was generated and set on Vercel (production): `WONDERHOME_VAPID_PUBLIC_KEY`, `WONDERHOME_VAPID_PRIVATE_KEY` (sensitive) and `WONDERHOME_VAPID_SUBJECT`.
  - `CRON_SECRET` was rotated, because the old value was write-only and could not be copied. The same value was stored in Supabase Vault as `cron_secret`.
  - Verified: the 16:55 UTC dispatch tick returned 200 (`households: 0, delivered: 0`) after the deploy of #238. The tick before it, against the old deployment, got 401 as expected.
  - The local copy of the secrets was deleted.
- **#238 QA cleanup.**
  - The QA account `8332605d…` was deleted with `qa-test-user.mjs`.
  - The QA household `b1e8eb18…` was deleted by a scoped service-role script, after checking its only member was the QA member. Its meals and recipes counted 0 afterwards.
  - The QA scratch files were removed, and no dev server is running.

## Verified

This is a design-only change: tracker check and help links. No code changed.

## Open

- The owner's answers to spec §7. Then 14-024 and 14-025, which are independent and both Next.
