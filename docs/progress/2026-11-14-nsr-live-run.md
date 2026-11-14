# Nothing stuck in review: the live NSR run (2026-11-14)

The final check of the HomeBrain, HomeSend and HomeTalk redesign (#545 to #552): the NSR cases end to end on a QA household on the live project, and the redesign's eval ids only.

## How it ran

- **Eval ids only:** `npm run eval -- --cases` HS-55..65, HS-80..89, NY-01..08, HT-190..195, HB-15..39, HT-01/18/72/105/122/131: **66/66 pass** (deterministic; no provider key in the session).
- **Live doors** (QA household on `wonderhome`): the product's own code against the live database: `ingestText`, `ingestWhatsAppText`, `ingestFile` followed by `addIfAllowed` (the app's one add path), `handleEmailWebhook` with a signed delivery, HomeTalk through the running app's `/conversation` route, `runNeedsYouDeadlines` and `verifyHousehold` scoped to the QA household. With no model key, the reading is the golden case's own reading (a stand-in reader); everything after the reading is live.

## Results

| Door / path | Cases | Result |
|---|---|---|
| Paste: bill, grocery, web page, advert, plumber note, unreadable | NSR-32, 30, 01, 02, 04, 05 | Pass: bill recorded as Checking, grocery confirmed, page and advert set aside "not household", plumber kept as a note, unreadable read again |
| WhatsApp text | NSR-30 shape | Pass: recorded under the member's own session |
| Photo (PNG, bill) | NSR-32 shape | Pass: recorded as Checking |
| Email, new sender and trusted | NSR-34, 35, 36 | **Fail → fixed**: every forwarded email failed before it was kept (42P10: the upsert's `on conflict (household_id, external_id)` had only a partial index to match), and the telemetry check lacked `dropped_not_allowlisted`, losing whole event batches. Migration `20261114235900_homesend_email_intake_fixes.sql` |
| HomeTalk record → undo | NSR-23 | Pass (picnic → afternoon from its name, then taken back) |
| HomeTalk plain correction | NSR-24 | Pass: moved to Sunday in place, Saturday taken back |
| HomeTalk bill | NSR-22 | **Fail → fixed**: recorded and undoable, but the reply left out "Say undo"; `add_bill` joins `UNDOABLE` (`conversation/undo-offer.ts`) |
| HomeTalk payment | NSR-26 shape | Pass: nothing paid (the QA plan refuses it) |
| Needs-you default after its deadline | NSR-09, 06 | Pass: "Looks right?" defaulted to keep Checking; resend asked of the sender, then set aside "not sent again" |
| Nightly verify | NSR-53 to 57 | Ran: 4 checked, nothing raised (the duplicate bill was never recorded, see the gap) |

## Open: a bill that matches one on record waits for ever

A pasted bill that matches an existing bill ("Update the existing bill?") is not added by record first and `deadlines.ts` `endingFor` returns `wait` for every bill, receipt and health document: no Needs-you question, no default, no ending. Reproduced on the QA household; 2 real items are in this state on live. Needs the owner's choice of the default before it is fixed (keep what's on record and set the new one aside "already on record" is the safe one; it never changes money).

## Cleanup

QA user, household and its rows deleted after the run; counts in the PR.
