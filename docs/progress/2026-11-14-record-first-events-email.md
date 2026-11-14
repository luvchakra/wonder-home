# Record first, the two follow-ups: events and classes, trusted email on arrival (story 14-068)

**Date:** 2026-11-14 · **Owner's ask:** "think of redesign of HomeBrain, HomeSend and HomeTalk as a cohesive unit so that minimum intervention is required to input information in the app, ensure its not stuck in review", then "implement", "implement and run test cases", "run only specific test cases not full test cases". Plan "Nothing stuck in review", part B (#550) left two items open; this closes them.

## What changed

1. **Events and classes are recorded first.** `event` and `activity_item` had no automatic outcome in HomeSend, so they always waited. They now have one (`confirmation.ts` `AUTO_APPLY_OUTCOMES`, keys `calendar.family_events` and `kids.activities`, which no responsibility owns) and are `RECORD_ONLY`: the household's "What “Wait for Approval” holds" choice alone decides. On "Only actions" (the default) a complete reading is put on the family calendar (`addFamilyEvent`) or under the child's class in Kids & School (the class added in the same step when missing), confirmed above the kind's bar and Checking below it or from a photo or file, through the same governed write, change row, audit and Undo as a person's Add (`home-send-auto.ts`). On "Everything" it waits, as on 3 Nov. Every earlier rule still applies first: the day (event) and who and which class (activity) are required, a possible duplicate or a moved date is offered, not applied, someone outside the household waits unless trusted, instructions inside it hold it. Checking questions were already planned for both kinds (`checking.ts`).
2. **A Checking calendar entry reminds**, marked "not yet confirmed" (`notifications/reconcile.ts`, same as school items; held again when an Admin switched decision 3 back).
3. **A trusted sender's email is added on arrival** (`homesend/trusted-arrival.ts`, `apps/web/app/_lib/homesend-trusted-email.ts`). Before, it was decided as a member's own item only when a member opened or cleared HomeSend. Now, once the webhook has read it (after the response, through `after`), or the job queue has read mail released by "Trust", it runs the app's own review and governed write **as the Admin who trusted that sender** (the allowlist row's `created_by_member_id`, still an active adult Admin; `identity/active-admin.ts`), under that Admin's own session and RLS, by the same `withMemberSession` WhatsApp uses. No new service-role write: a member-less write was not needed, and was judged less safe than a real member's session. The item itself stays the email's (`created_by_member_id` null), so it is decided as a trusted sender's item, never as the Admin's words; the change is audited under the Admin with source `email:trusted_sender`; Checking questions go to that Admin. Nobody to vouch (an allowlist row from before attribution, or that member left or is no longer Admin) → the email waits for a member, as before. "Read only senders an Admin added" (the 3 Nov behaviour) never adds on its own. Attachments (files) still wait for a member to open HomeSend.
4. Help (HomeSend, 8 languages): "What you send" names events and classes, and says a trusted sender's email is added as it arrives, under the Admin who trusted it. HomeSend's "added on its own" notice no longer says a Checking entry's reminders wait (decision 3 replaced that).

## Verified

Only this change's tests, as the owner asked:

- Unit, the touched folders (`homesend`, `notifications`, `evaluation`, `hometalk`, `identity`, `i18n`, `help`): **1677/1677**, including new `confirmation.test.ts` (events/classes on each choice), `unconfirmed-hold.test.ts` (Checking event reminder), `trusted-arrival.test.ts` (who vouches), `email-webhook.test.ts` (added after the response; held mail never), and the X-003 gate (HomeSend touches no other table; the Admin check lives in `identity`).
- Eval by id (deterministic): HS-86–89 (new), HS-20/21/28 (events and classes, unchanged), HS-80–85: **13/13**.
- Typecheck (core and web), ESLint on the changed app files, `lint:service-role`, `lint:boundaries`, `lint:secrets`, `lint:help-links`, `security`, `npm run build -w apps/web`.
- No migration, no screen changed (no Playwright spec), no DB test needed.
- Not run here: the live provider run by id (no provider key in this session); a live email delivery (Resend is a deployment's own setup).

## Open

- The calendar screen doesn't label an event "Checking"; HomeSend's Added recently does, and editing the event confirms it (`confirmByAction`).
- Email attachments from a trusted sender are not added on arrival.
- No QA data was created.
