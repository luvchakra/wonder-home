# HomeSend: confirmed above the bar, whatever it was read from (14-075)

**Why.** The owner resent an exam timetable photo on WhatsApp (read 90% sure, his bar "More than 85%") and got "marked Checking until it's confirmed, so its reminders wait". His words: "why it's still waiting? it automatically add in WonderHome". The owner's rule of 2026-11-21 replaces the photo-or-file part of the 2026-11-03 rule.

**What changed.**
- `homesend/confirmation.ts`: a photo or file no longer forces Checking. Above the Admin's bar an entry is confirmed, with Undo; below it, Checking. Only money and health read from a photo or file stay Checking, under "Money and health entries" (unchanged; the owner has been asked whether to extend it).
- `homesend/above-bar.ts` (new): the same bar comparison for paths that don't run `decideConfirmation`: exam timetables (`timetable-apply.ts` `addTimetable`, also after "Which class is X in?") and a document's several things (`apps/web/app/(auth)/home-send-plan-writer.ts` `applyPlanAtOnce`, where a fee read from a photo stays Checking).
- Replies: a confirmed add says what, for whom and how to undo it, with no percentage and no "read from a photo or file" (`whatsapp/intake.ts` `addedReply`, `hometalk/intake-questions.ts` `handedBackText`). A Checking add keeps one short reason ("90% sure") and says its reminders still come, marked "not yet confirmed" (`whatsapp.addedChecking`, `addedForChecking`, `addedMoreChecking`, `whatsapp.timetable.checking`, eight languages). "so its reminders wait" is gone: reminders are held only when an Admin turned "Remind about entries still Checking" off.
- Words: help `home-send.body.4` and `body.20` in all eight languages; CLAUDE.md HomeSend clause; `docs/agent-platform.md`; `docs/design/2026-11-14-nothing-stuck-in-review.md`. The Settings card for "How sure HomeSend must be to add on its own" already said this (photos, files and voice notes too) and points to "Money and health entries"; unchanged.

**Tests that followed the changed owner rule** (not a lowered gate; Unsafe Action Rate stays zero): AT-B05 and AT-L08 (`evaluation/hometalk-homesend-acceptance.test.ts`), "adds directly, marked Checking…" and "everything that holds an add holds a move" (`homesend/confirmation.test.ts`), and the reply literals that carried "(97% sure — …)" on a confirmed add or "so its reminders wait".

**Verified.** `npx vitest run` over `packages/core/src/{homesend,hometalk,whatsapp,conversation,evaluation,i18n}`: all pass. Typecheck and lint on changed files. No live model read here (no model key in the container).

**Open.** Not verified live with a real photo. Money and health from a photo or file still Checking pending the owner's answer.
