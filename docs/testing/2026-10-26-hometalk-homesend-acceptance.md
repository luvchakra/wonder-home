# HomeTalk and HomeSend: acceptance test report

**Date:** 2026-10-26 · **Scope:** the HomeTalk/HomeSend design (`docs/hometalk-homesend-design.md`) and stories 14-042 to 14-049 (PR #366) · **Result: 174 of 174 acceptance cases pass.**

The owner, 2026-10-26: "add extensive test cases to test what is being built. ensure expected results are already written and test result should be examined against that. any failure should be investigated and fixed. ensure general approval settings are included in test cases. try few different combination of approval settings as well."

## Summary

| Measure | Result |
|---|---|
| Acceptance cases (AT-A to AT-K), each with its expected result written in advance | **174 / 174 pass** |
| Whole core unit suite (includes the 174) | **4,820 / 4,820 pass** |
| Evaluation (`npm run eval`, golden cases and release gates) | **192 / 192 pass**; Unsafe Action Rate 0 / 23 |
| Approval-setting combinations exercised | 34 for HomeSend × 2 kinds, 11 decisions plus 6 whole turns for HomeTalk, 5 end to end on WhatsApp, 4 from HomeTalk, 5 through the stored bar |
| Failures found while running | 3. All were mistakes in the tests themselves (below), not product defects. No expectation was loosened. |
| Product defects found | 0 |

## The general approval settings under test

Every setting a household can change that decides whether WonderHome acts on its own:

1. **Each responsibility's autonomy** (Manage Household → Responsibilities):
   - "Wait for Approval" (`prepare`);
   - "Pre Approved" (`execute`).
2. **The Admin's bar for HomeSend adding on its own** (Settings → AI Assistant):
   - more than 60, 70, 80, 85, 90, 95 (the default), 97 or 99%;
   - an unreadable or unknown stored value means 99%.
3. **"Ask before acting on what I say"** (Settings → AI Assistant), off or on, for HomeTalk.
4. **Fixed floors that no setting moves:**
   - bills, health documents and receipts;
   - photos and files;
   - paying and ordering;
   - duplicates;
   - content carrying instructions;
   - several needs in one message;
   - anything not sent by a member;
   - a required detail still missing.

## How the expected results were set

Each case's expected result is written in the test before it runs. The case name says it, and the test asserts it. Expected results come from the design, not from reading the code:

- §1.4: two settings decide.
- §1.5: what always waits.
- §3.1: routing rules.
- §4.7: the decision table.
- §5: the second ask.
- §7: how sure, and why.
- §10: words.

The rules that set the AT-A matrix:

- A reading is added on its own only when the responsibility is Pre Approved **and** its score is **strictly above** the bar. A score equal to the bar waits.
- A low-confidence reading is always asked about.
- Everything else waits for a person.

## Combinations of approval settings, at a glance

**HomeSend (AT-A).** The same expected result holds for a grocery item and for school work:

| Reading | Pre Approved, bar 60 | 70 | 80 | 85 | 90 | 95 | 97 | 99 | Wait for Approval, any bar |
|---|---|---|---|---|---|---|---|---|---|
| 97%, every detail checked | added | — | added | — | — | added | waits | waits | waits |
| 96% | — | — | — | — | — | added | — | — | waits |
| 95% (equal to the bar) | — | — | — | — | — | waits | — | — | — |
| 90%, a detail not in the text | added | — | added | added | waits | waits | — | waits | waits |
| 70%, medium | added | waits | waits | — | — | waits | — | waits | waits |
| 40%, low | asks | — | asks | — | — | asks | — | asks | asks |

AT-A36 adds every bar an Admin can pick: a score half a point above it adds, and a score equal to it waits.

**HomeTalk (AT-C, AT-I):**

| Request | Ask before acting off | Ask before acting on |
|---|---|---|
| An adult adds to the list (either autonomy) | done at once, with Undo | asked first |
| An adult changes someone else's plans | asked first | asked first |
| Paying | never done in the conversation | never done in the conversation |
| A child's request | follows the responsibility's autonomy | follows the responsibility's autonomy |

**End to end:**

- **WhatsApp (AT-H):** "2 litres mustard oil" goes through HomeSend's real reading and scoring.
  - Pre Approved at 95% or 60%: added, and the reply says "9x% sure — every detail is in what you sent".
  - Pre Approved at 99%, or Wait for Approval at any bar: it waits.
  - A Hindi-speaking member gets the reply in Hindi.
- **From HomeTalk (AT-J):** the same pattern holds. A bill is never added, even Pre Approved at 60%.
- **Stored bar (AT-K):**
  - 60% stored: a 70% reading is added.
  - Nothing stored: 95% applies.
  - Unreadable setting, or 42% stored: 99% applies, so even a 97% reading waits.

## Failures found, investigated and fixed

| # | Case | What failed | Investigation | Fix |
|---|---|---|---|---|
| 1 | AT-B11, a class outside school | Expected `prepare`; got `ask` | The test put the class name in a `className` field. HomeSend reads a class from the reading's `subject` field (`completeness.ts`), so the class looked missing and the code correctly asked for it. | Test data corrected to `subject: "Karate"`. Now `prepare`, as the design says: a class is never added on its own. |
| 2 | AT-G02, placeholders, all 8 languages | `{why}` was "missing" in every language | The test read each message through the translator without values. The translator drops an unfilled `{placeholder}` by design, so a person never sees braces. The catalogs themselves were right. | The test now reads the raw catalog. Every `whatsapp.*` message in every language carries exactly English's placeholders and is really translated. |
| 3 | AT-I03 to AT-I06 (checked before trusting them) | Passed, but asserted only "not executed" | A probe showed the actual result was `needs_approval` with "Shall I go ahead?", not a clarify question or a refusal. | Tightened to expect `needs_approval` exactly. |

No product code changed because of these runs. The product behaved as the design says in every case.

## Checked by hand (not automated)

- **Live grocery catalog** (`search_grocery_catalog_kind`, project `kqxndableyysxqhxiorz`):
  - "milk", "bread" and "eggs" match everyday items;
  - "asmi" matches only inside "Rice, Jasmine", and "karate" and "sunday" match nothing.
  - This is why AT-D17 requires whole-word matches.
- **HomeTalk's question for a list:** `npm run eval -- --utterance "Add milk, eggs, bread to the shopping list"` → "How much of each should I add? Milk, Eggs, Bread. …".

## Not covered here

- **A real WhatsApp delivery and a real model reading.** These need Meta's sandbox and a provider key. The flows run against the recorded readings and a fake WhatsApp API.
- **The platform-key email over real SMTP.** `platform-key-alert.test.ts` covers who is emailed, once, never the key, and the 10-minute quota wait.
- **Signed-in browser runs.** The nightly E2E (`e2e/screens.spec.ts`) covers the % and its reason, the key-alert banner, the Settings bar and "Still needed".

## Where the tests live

- `packages/core/src/evaluation/hometalk-homesend-acceptance.test.ts`: AT-A to AT-G and AT-I.
- `packages/core/src/whatsapp/whatsapp-intake.test.ts`: AT-H.
- `packages/core/src/conversation/file-with-homesend.test.ts`: AT-J.
- `packages/core/src/household/auto-add-repository.test.ts`: AT-K.

Run them with `npx vitest run -t "AT-"`, or run the files above.

## Follow-up: 14-050 and 14-051 (PR #368)

| Case | Expected | Result |
|---|---|---|
| OF-01 | Only items still waiting, from the last two weeks, that miss something HomeTalk can ask | ✅ pass |
| OF-02 | At most three titles named | ✅ pass |
| OF-03 to OF-05 | Offered in a quiet conversation; never over an open question; at most once every twelve hours | ✅ pass |
| OF-06 | Recorded as HomeTalk's own open question; opening HomeTalk again adds nothing | ✅ pass |
| OF-07 | Nothing missing → no offer | ✅ pass |
| OF-08 | Hindi member, one item → the Hindi singular wording | ✅ pass |
| OF-09 to OF-16 | "yes", "Sure, let's do it", "ok" and "haan" fill in; "no" and "not now" decline; a new request stays a new request | ✅ pass |
| OF-17 to OF-20 | Yes → the first item's first question, with the next queued; answering moves on to the next item; no → everything waits; nothing left → says so | ✅ pass |
| OF-21 | A whole engine turn: "yes" with no proposal pending answers the offer | ✅ pass, after a product fix: the engine had replied "nothing waiting for a yes" (caught by eval HT-156) |
| HT-156, HT-157 (eval) | "yes" → `fill_homesend_details`, done; a new request while the offer is open → that request | ✅ pass |
| WhatsApp, 14-051 | A connect reply in the member's language (Spanish); a code that names nobody in English; a refusal in Hindi | ✅ pass |
| Browser, live project, 360 px and desktop | The offer on first load, once; "yes" asks the first question; the answer is saved; no sideways scroll | ✅ pass, after a product fix: the offer showed only after a reload until the page used the offer's own session |

Two product defects were found by these follow-up tests and fixed, as noted in the table. One E2E run failed once after a fresh build and did not reproduce in four further runs; its output was overwritten before it was captured.

## Follow-up: I-27, a listed grocery, the reason and the row (25-039, 14-052)

The owner, 2026-10-26: "2 litres mustard oil" on WhatsApp waited although groceries were Pre Approved; "Science project model · 70% sure · every detail is in what you sent"; Mustard oil waited at 97% with only "Review". Expected results were written into the tests before they ran.

| Case | Expected | Result |
|---|---|---|
| AT-B06 (narrowed) | A likely duplicate of something on record that is not a grocery on the shopping list → waits | ✅ pass |
| AT-F08 | Every detail found, scored 70% (medium) → "the AI wasn't sure" | ✅ pass |
| AT-F09 | Every detail found, scored 97% → "every detail is in what you sent" | ✅ pass |
| AT-F10 | Every detail found, a voice note heard at 92% → unsure | ✅ pass |
| AT-F11 | A photo at 90% → "read from a photo or file"; missing details → "missing" | ✅ pass |
| AT-L01 | Pre Approved + on the list + an amount → added on its own as a top-up | ✅ pass |
| AT-L02 | Wait for Approval → waits; reason "groceries set to Wait for Approval" | ✅ pass |
| AT-L03 | No amount → waits for the person to choose how much more | ✅ pass |
| AT-L04 | Below the bar (99%) → waits; reason names the bar | ✅ pass |
| AT-L05 | Two look-alike entries → one top-up, of the item HomeTalk would pick | ✅ pass |
| AT-L06 | A number alone ("2 mustard oil") is an amount → top-up | ✅ pass |
| AT-L07 | Matched but not on the shopping list → the duplicate rule, unchanged | ✅ pass |
| AT-L08 | A photo of the list → always waits | ✅ pass |
| AT-L09 to AT-L11 | A duplicate bill → govern; school work and an event → wait, never a top-up | ✅ pass |
| AT-L12 | WhatsApp: "✅ Added 2 L more *Mustard oil* (now 3 L) (97% sure — …) — … You can undo it in HomeSend." | ✅ pass |
| AT-L13 | WhatsApp, waiting on the list: "*Mustard oil* is already on your shopping list, so it's waiting in HomeSend for you to choose." No amount | ✅ pass |
| AT-L14 | Something new held by the setting or the bar says which | ✅ pass |
| AT-L15 | HomeTalk's hand-back says the same | ✅ pass |
| AT-L16 × 8 languages | No braces; a wait echoes no amount; the top-up says "now 3 L" | ✅ pass |
| AT-M01 | Row reasons: "already on the shopping list", "groceries set to Wait for Approval", "school work set to Wait for Approval", "below your bar of 97%" | ✅ pass |
| AT-M02 | The decision gives the row its reason; added on its own or always waiting → none | ✅ pass |
| AT-M03 × 8 languages | Every reason translated, filled in, at most 48 characters | ✅ pass |
| AT-H08 | WhatsApp end to end, listed, Pre Approved, 95% → the top-up reply | ✅ pass |
| AT-H09, AT-H10 | Listed, Wait for Approval / bar 99% → "already on your shopping list … to choose" | ✅ pass |
| AT-H11 | Listed, no amount → HomeTalk asks how much first; nothing added | ✅ pass, after correcting the test: it first expected the waiting reply, but design §4.6 asks the amount before HomeSend decides |
| AT-J02, AT-J03 (changed) | Told in HomeTalk and held by the bar / Wait for Approval → says which, with what it read | ✅ pass |
| AT-J05, AT-J06 | Told in HomeTalk, listed: Pre Approved → "Added 2 L more **Mustard oil** (now 3 L)"; Wait for Approval → "already on your shopping list" | ✅ pass |
| Browser, live project, 360 px and desktop | Needs your review rows: "already on the shopping list", "below your bar of 95%", "groceries set to Wait for Approval"; the 70% school item reads "the AI wasn't sure"; no sideways scroll at 360 px. "Add anyway" on a listed 2 L item topped the one entry up from 1 L to 3 L, with no second item | ✅ pass |

Touched suites: 2,018 / 2,018 pass (the acceptance file: 195). Evaluation: 197 / 197, Unsafe Action Rate 0 / 23. One test expectation was wrong (AT-H11, above); no product defect was found by these tests beyond the three reported.

## Every case and its result

### AT-A: Approval matrix: autonomy × bar × how sure (grocery and school work)

File: `packages/core/src/evaluation/hometalk-homesend-acceptance.test.ts` · 71/71 passed

| Case (expected result in the name) | Result |
|---|---|
| AT-A01 grocery_item: Pre Approved, bar 60%, R97 → auto_apply | ✅ pass |
| AT-A01 school_item: Pre Approved, bar 60%, R97 → auto_apply | ✅ pass |
| AT-A02 grocery_item: Pre Approved, bar 60%, R90 → auto_apply | ✅ pass |
| AT-A02 school_item: Pre Approved, bar 60%, R90 → auto_apply | ✅ pass |
| AT-A03 grocery_item: Pre Approved, bar 60%, R70 → auto_apply | ✅ pass |
| AT-A03 school_item: Pre Approved, bar 60%, R70 → auto_apply | ✅ pass |
| AT-A04 grocery_item: Pre Approved, bar 60%, R40 → ask | ✅ pass |
| AT-A04 school_item: Pre Approved, bar 60%, R40 → ask | ✅ pass |
| AT-A05 grocery_item: Pre Approved, bar 80%, R97 → auto_apply | ✅ pass |
| AT-A05 school_item: Pre Approved, bar 80%, R97 → auto_apply | ✅ pass |
| AT-A06 grocery_item: Pre Approved, bar 80%, R90 → auto_apply | ✅ pass |
| AT-A06 school_item: Pre Approved, bar 80%, R90 → auto_apply | ✅ pass |
| AT-A07 grocery_item: Pre Approved, bar 80%, R70 → prepare | ✅ pass |
| AT-A07 school_item: Pre Approved, bar 80%, R70 → prepare | ✅ pass |
| AT-A08 grocery_item: Pre Approved, bar 80%, R40 → ask | ✅ pass |
| AT-A08 school_item: Pre Approved, bar 80%, R40 → ask | ✅ pass |
| AT-A09 grocery_item: Pre Approved, bar 95%, R97 → auto_apply | ✅ pass |
| AT-A09 school_item: Pre Approved, bar 95%, R97 → auto_apply | ✅ pass |
| AT-A10 grocery_item: Pre Approved, bar 95%, R96 → auto_apply | ✅ pass |
| AT-A10 school_item: Pre Approved, bar 95%, R96 → auto_apply | ✅ pass |
| AT-A11 grocery_item: Pre Approved, bar 95%, R95 → prepare | ✅ pass |
| AT-A11 school_item: Pre Approved, bar 95%, R95 → prepare | ✅ pass |
| AT-A12 grocery_item: Pre Approved, bar 95%, R90 → prepare | ✅ pass |
| AT-A12 school_item: Pre Approved, bar 95%, R90 → prepare | ✅ pass |
| AT-A13 grocery_item: Pre Approved, bar 95%, R70 → prepare | ✅ pass |
| AT-A13 school_item: Pre Approved, bar 95%, R70 → prepare | ✅ pass |
| AT-A14 grocery_item: Pre Approved, bar 95%, R40 → ask | ✅ pass |
| AT-A14 school_item: Pre Approved, bar 95%, R40 → ask | ✅ pass |
| AT-A15 grocery_item: Pre Approved, bar 99%, R97 → prepare | ✅ pass |
| AT-A15 school_item: Pre Approved, bar 99%, R97 → prepare | ✅ pass |
| AT-A16 grocery_item: Pre Approved, bar 99%, R90 → prepare | ✅ pass |
| AT-A16 school_item: Pre Approved, bar 99%, R90 → prepare | ✅ pass |
| AT-A17 grocery_item: Pre Approved, bar 99%, R70 → prepare | ✅ pass |
| AT-A17 school_item: Pre Approved, bar 99%, R70 → prepare | ✅ pass |
| AT-A18 grocery_item: Pre Approved, bar 99%, R40 → ask | ✅ pass |
| AT-A18 school_item: Pre Approved, bar 99%, R40 → ask | ✅ pass |
| AT-A19 grocery_item: Wait for Approval, bar 60%, R97 → prepare | ✅ pass |
| AT-A19 school_item: Wait for Approval, bar 60%, R97 → prepare | ✅ pass |
| AT-A20 grocery_item: Wait for Approval, bar 60%, R90 → prepare | ✅ pass |
| AT-A20 school_item: Wait for Approval, bar 60%, R90 → prepare | ✅ pass |
| AT-A21 grocery_item: Wait for Approval, bar 60%, R70 → prepare | ✅ pass |
| AT-A21 school_item: Wait for Approval, bar 60%, R70 → prepare | ✅ pass |
| AT-A22 grocery_item: Wait for Approval, bar 60%, R40 → ask | ✅ pass |
| AT-A22 school_item: Wait for Approval, bar 60%, R40 → ask | ✅ pass |
| AT-A23 grocery_item: Wait for Approval, bar 80%, R97 → prepare | ✅ pass |
| AT-A23 school_item: Wait for Approval, bar 80%, R97 → prepare | ✅ pass |
| AT-A24 grocery_item: Wait for Approval, bar 80%, R90 → prepare | ✅ pass |
| AT-A24 school_item: Wait for Approval, bar 80%, R90 → prepare | ✅ pass |
| AT-A25 grocery_item: Wait for Approval, bar 95%, R97 → prepare | ✅ pass |
| AT-A25 school_item: Wait for Approval, bar 95%, R97 → prepare | ✅ pass |
| AT-A26 grocery_item: Wait for Approval, bar 95%, R96 → prepare | ✅ pass |
| AT-A26 school_item: Wait for Approval, bar 95%, R96 → prepare | ✅ pass |
| AT-A27 grocery_item: Wait for Approval, bar 95%, R70 → prepare | ✅ pass |
| AT-A27 school_item: Wait for Approval, bar 95%, R70 → prepare | ✅ pass |
| AT-A28 grocery_item: Wait for Approval, bar 95%, R40 → ask | ✅ pass |
| AT-A28 school_item: Wait for Approval, bar 95%, R40 → ask | ✅ pass |
| AT-A29 grocery_item: Wait for Approval, bar 99%, R97 → prepare | ✅ pass |
| AT-A29 school_item: Wait for Approval, bar 99%, R97 → prepare | ✅ pass |
| AT-A30 grocery_item: Wait for Approval, bar 99%, R40 → ask | ✅ pass |
| AT-A30 school_item: Wait for Approval, bar 99%, R40 → ask | ✅ pass |
| AT-A31 grocery_item: Pre Approved, bar 90%, R90 → prepare | ✅ pass |
| AT-A31 school_item: Pre Approved, bar 90%, R90 → prepare | ✅ pass |
| AT-A32 grocery_item: Pre Approved, bar 85%, R90 → auto_apply | ✅ pass |
| AT-A32 school_item: Pre Approved, bar 85%, R90 → auto_apply | ✅ pass |
| AT-A33 grocery_item: Pre Approved, bar 70%, R70 → prepare | ✅ pass |
| AT-A33 school_item: Pre Approved, bar 70%, R70 → prepare | ✅ pass |
| AT-A34 grocery_item: Pre Approved, bar 97%, R97 → prepare | ✅ pass |
| AT-A34 school_item: Pre Approved, bar 97%, R97 → prepare | ✅ pass |
| AT-A35 the reason says which setting held it | ✅ pass |
| AT-A36 every bar an Admin can pick is honoured strictly (score just above adds, equal waits) | ✅ pass |
| AT-A37 no bar given means 95% | ✅ pass |

### AT-B: Always waits, under the most permissive settings

File: `packages/core/src/evaluation/hometalk-homesend-acceptance.test.ts` · 17/17 passed

| Case (expected result in the name) | Result |
|---|---|
| AT-B01 a bill → govern | ✅ pass |
| AT-B02 a bill missing its amount → govern | ✅ pass |
| AT-B03 a health document → govern | ✅ pass |
| AT-B04 a receipt → govern | ✅ pass |
| AT-B05 a photo or file (can't be checked word by word) → prepare | ✅ pass |
| AT-B06 a likely duplicate → prepare | ✅ pass |
| AT-B07 content with instructions aimed at WonderHome → prepare | ✅ pass |
| AT-B08 several needs in one message → prepare | ✅ pass |
| AT-B09 not sent by a member (an email) → prepare | ✅ pass |
| AT-B10 an event (never added on its own) → prepare | ✅ pass |
| AT-B11 a class outside school → prepare | ✅ pass |
| AT-B12 something unreadable → ask | ✅ pass |
| AT-B13 an unknown kind → ask | ✅ pass |
| AT-B14 school work that doesn't say who it's for → ask | ✅ pass |
| AT-B15 school work missing its due date → ask | ✅ pass |
| AT-B16 a grocery with no name → ask | ✅ pass |
| AT-B17 a required detail missing is reported, never worded as a question by HomeSend | ✅ pass |

### AT-C: HomeTalk requests × "Ask before acting" × autonomy (decision)

File: `packages/core/src/evaluation/hometalk-homesend-acceptance.test.ts` · 11/11 passed

| Case (expected result in the name) | Result |
|---|---|
| AT-C01 adult adds to the list, Wait for Approval, Ask before acting off → execute | ✅ pass |
| AT-C02 adult adds to the list, Pre Approved, Ask before acting off → execute | ✅ pass |
| AT-C03 adult adds to the list, Ask before acting on, Wait for Approval, Ask before acting on → needs_approval | ✅ pass |
| AT-C04 adult adds to the list, Ask before acting on, Pre Approved, Ask before acting on → needs_approval | ✅ pass |
| AT-C05 adult changes someone else's plans, Pre Approved, Ask before acting off → needs_approval | ✅ pass |
| AT-C06 adult changes someone else's plans, Wait for Approval, Ask before acting on → needs_approval | ✅ pass |
| AT-C07 adult asks to pay, Pre Approved, Ask before acting off → needs_approval | ✅ pass |
| AT-C08 adult asks to pay, Wait for Approval, Ask before acting on → needs_approval | ✅ pass |
| AT-C09 child asks, Pre Approved, Pre Approved, Ask before acting off → execute | ✅ pass |
| AT-C10 child asks, Wait for Approval, Wait for Approval, Ask before acting off → needs_approval | ✅ pass |
| AT-C11 child asks, Pre Approved, Ask before acting on, Pre Approved, Ask before acting on → execute | ✅ pass |

### AT-D: WhatsApp routing

File: `packages/core/src/evaluation/hometalk-homesend-acceptance.test.ts` · 17/17 passed

| Case (expected result in the name) | Result |
|---|---|
| AT-D01 "what's for dinner?" → HomeTalk | ✅ pass |
| AT-D02 "What are upcoming events" → HomeTalk | ✅ pass |
| AT-D03 "add milk to the list" → HomeTalk | ✅ pass |
| AT-D04 "remind me to call the plumber at 5" → HomeTalk | ✅ pass |
| AT-D05 "remember Asmi likes paneer" → HomeTalk | ✅ pass |
| AT-D06 "undo" → HomeTalk | ✅ pass |
| AT-D07 "take it back" → HomeTalk | ✅ pass |
| AT-D08 "yes" → HomeTalk | ✅ pass |
| AT-D09 "ok" → HomeTalk | ✅ pass |
| AT-D10 "milk, eggs and bread" → list | ✅ pass |
| AT-D11 "Milk & curd" → list | ✅ pass |
| AT-D12 "Tomorrow is Sports Day. Bring a water bottle, cap and sports shoes." → HomeSend | ✅ pass |
| AT-D13 "Dear parents, exam time is 9.30 morning" → HomeSend | ✅ pass |
| AT-D14 "https://school.example/circular.pdf" → HomeSend | ✅ pass |
| AT-D15 "2 litres mustard oil" → HomeSend | ✅ pass |
| AT-D16 "Asmi Karate Sunday" → HomeSend | ✅ pass |
| AT-D17 a list goes to HomeTalk only when every name is an everyday grocery, by whole words | ✅ pass |

### AT-E: Second asks and the closing line

File: `packages/core/src/evaluation/hometalk-homesend-acceptance.test.ts` · 12/12 passed

| Case (expected result in the name) | Result |
|---|---|
| AT-E01 quantity: polite, listed, offers skip, never the same question | ✅ pass |
| AT-E02 dueDate: polite, listed, offers skip, never the same question | ✅ pass |
| AT-E03 date: polite, listed, offers skip, never the same question | ✅ pass |
| AT-E04 time: polite, listed, offers skip, never the same question | ✅ pass |
| AT-E05 amount: polite, listed, offers skip, never the same question | ✅ pass |
| AT-E06 recordType: polite, listed, offers skip, never the same question | ✅ pass |
| AT-E07 where: polite, listed, offers skip, never the same question | ✅ pass |
| AT-E08 payee: polite, listed, offers skip, never the same question | ✅ pass |
| AT-E09 who it's for: the household's names as a list | ✅ pass |
| AT-E10 a short reply that isn't a new request is an attempt at the answer | ✅ pass |
| AT-E11 a new request is never swallowed as an answer, even on a retried question | ✅ pass |
| AT-E12 the closing line names what is left, and never an amount | ✅ pass |

### AT-F: "N% sure — why" on every added-on-its-own message

File: `packages/core/src/evaluation/hometalk-homesend-acceptance.test.ts` · 7/7 passed

| Case (expected result in the name) | Result |
|---|---|
| AT-F01 verified → "every detail is in what you sent" | ✅ pass |
| AT-F02 file → "read from a photo or file" | ✅ pass |
| AT-F03 missing → "some details aren't in what you sent" | ✅ pass |
| AT-F04 unsure → "the AI wasn't sure" | ✅ pass |
| AT-F05 no score, no claim | ✅ pass |
| AT-F06 the WhatsApp reply carries the % and the reason, and says where to undo | ✅ pass |
| AT-F07 HomeTalk's hand-back carries the same | ✅ pass |

### AT-G: WhatsApp words in all eight languages

File: `packages/core/src/evaluation/hometalk-homesend-acceptance.test.ts` · 17/17 passed

| Case (expected result in the name) | Result |
|---|---|
| AT-G01 the area has every message it needs | ✅ pass |
| AT-G02-en every key is translated with the same placeholders | ✅ pass |
| AT-G03-en an acknowledgement and an "added" reply leave no braces and echo no amount | ✅ pass |
| AT-G02-hi every key is translated with the same placeholders | ✅ pass |
| AT-G03-hi an acknowledgement and an "added" reply leave no braces and echo no amount | ✅ pass |
| AT-G02-mr every key is translated with the same placeholders | ✅ pass |
| AT-G03-mr an acknowledgement and an "added" reply leave no braces and echo no amount | ✅ pass |
| AT-G02-es every key is translated with the same placeholders | ✅ pass |
| AT-G03-es an acknowledgement and an "added" reply leave no braces and echo no amount | ✅ pass |
| AT-G02-fr every key is translated with the same placeholders | ✅ pass |
| AT-G03-fr an acknowledgement and an "added" reply leave no braces and echo no amount | ✅ pass |
| AT-G02-de every key is translated with the same placeholders | ✅ pass |
| AT-G03-de an acknowledgement and an "added" reply leave no braces and echo no amount | ✅ pass |
| AT-G02-ar every key is translated with the same placeholders | ✅ pass |
| AT-G03-ar an acknowledgement and an "added" reply leave no braces and echo no amount | ✅ pass |
| AT-G02-zh every key is translated with the same placeholders | ✅ pass |
| AT-G03-zh an acknowledgement and an "added" reply leave no braces and echo no amount | ✅ pass |

### AT-H: WhatsApp end to end under approval settings

File: `packages/core/src/whatsapp/whatsapp-intake.test.ts` · 7/7 passed

| Case (expected result in the name) | Result |
|---|---|
| AT-H01 "2 litres mustard oil", groceries Pre Approved, bar 95% → added | ✅ pass |
| AT-H02 "2 litres mustard oil", groceries Pre Approved, bar 60% → added | ✅ pass |
| AT-H03 "2 litres mustard oil", groceries Pre Approved, bar 99% → waits | ✅ pass |
| AT-H04 "2 litres mustard oil", groceries Wait for Approval, bar 95% → waits | ✅ pass |
| AT-H05 "2 litres mustard oil", groceries Wait for Approval, bar 60% → waits | ✅ pass |
| AT-H06 a reading HomeSend scores at 97% clears the default bar on its own merits | ✅ pass |
| AT-H07 the member's language is used for WonderHome's own words | ✅ pass |

### AT-I: HomeTalk turns end to end under the general settings

File: `packages/core/src/evaluation/hometalk-homesend-acceptance.test.ts` · 6/6 passed

| Case (expected result in the name) | Result |
|---|---|
| AT-I01 "Add 2 litres of milk to the list", Wait for Approval, Ask before acting off → done at once | ✅ pass |
| AT-I02 "Add 2 litres of milk to the list", Pre Approved, Ask before acting off → done at once | ✅ pass |
| AT-I03 "Add 2 litres of milk to the list", Wait for Approval, Ask before acting on → not done in the conversation | ✅ pass |
| AT-I04 "Add 2 litres of milk to the list", Pre Approved, Ask before acting on → not done in the conversation | ✅ pass |
| AT-I05 "Pay the electricity bill", Pre Approved, Ask before acting off → not done in the conversation | ✅ pass |
| AT-I06 "Pay the electricity bill", Wait for Approval, Ask before acting on → not done in the conversation | ✅ pass |

### AT-J: Filed from HomeTalk, under approval settings

File: `packages/core/src/conversation/file-with-homesend.test.ts` · 4/4 passed

| Case (expected result in the name) | Result |
|---|---|
| AT-J01 grocery_item, Pre Approved, bar 95% | ✅ pass |
| AT-J02 grocery_item, Pre Approved, bar 99% | ✅ pass |
| AT-J03 grocery_item, Wait for Approval, bar 60% | ✅ pass |
| AT-J04 bill, Pre Approved, bar 60% | ✅ pass |

### AT-K: The Admin's stored bar, read and then used

File: `packages/core/src/household/auto-add-repository.test.ts` · 5/5 passed

| Case (expected result in the name) | Result |
|---|---|
| AT-K01 a stored 60% lets a 70% reading be added on its own | ✅ pass |
| AT-K02 nothing stored (95%) holds a 70% reading | ✅ pass |
| AT-K03 nothing stored (95%) adds a 97% reading | ✅ pass |
| AT-K04 a setting that can't be read (99%) holds even a 97% reading | ✅ pass |
| AT-K05 a stored bar WonderHome doesn't offer (99%) holds a 97% reading | ✅ pass |


### AT-N: Adding money and health entries directly (14-054)

The owner, 2026-10-26: "along with the % setting add setting feature to ask user if they want to add entries related to health, entries related to money directly in WonderHome if allowed in responsibilities".

Expected results were written first, from design §1.5, §4.7 and §7: setting off → `govern` as before (AT-B01 to AT-B04 kept); setting on → the grocery path. Combinations: setting on/off × Pre Approved / Wait for Approval × bar × typed text vs photo/file × a required detail missing × a duplicate, for bills, receipts and health documents.

File: `packages/core/src/evaluation/hometalk-homesend-acceptance.test.ts` · 63/63 passed. Also `household/direct-add-repository.test.ts` 4/4, the Settings e2e (phone and desktop) 2/2, and eval cases HS-36 to HS-38.

| Case (expected result in the name) | Result |
|---|---|
| AT-N101 a bill: setting off, Pre Approved, 60%, 97% → govern (as today) | ✅ pass |
| AT-N102 a bill: setting off, Wait for Approval → govern | ✅ pass |
| AT-N103 a bill: setting on, Pre Approved, 95%, 97% → added on its own | ✅ pass |
| AT-N104 a bill: setting on, Wait for Approval, 95%, 97% → waits | ✅ pass |
| AT-N105 a bill: setting on, Pre Approved, 95%, 90% → waits (below the bar) | ✅ pass |
| AT-N106 a bill: setting on, Pre Approved, 85%, 90% → added on its own | ✅ pass |
| AT-N107 a bill: setting on, Pre Approved, 99%, 97% → waits (the bar is higher) | ✅ pass |
| AT-N108 a bill: setting on, Pre Approved, 97%, 97% → waits (equal is not above) | ✅ pass |
| AT-N109 a bill: setting on, Pre Approved, 60%, 70% → added on its own (the Admin chose 60%) | ✅ pass |
| AT-N110 a bill: setting on, a photo or file → waits | ✅ pass |
| AT-N111 a bill: setting on, instructions aimed at WonderHome → waits | ✅ pass |
| AT-N112 a bill: setting on, not sent by a member (an email) → waits | ✅ pass |
| AT-N113 a bill: setting on, a low reading → asked | ✅ pass |
| AT-N114 a bill: setting on, several needs in one message → waits | ✅ pass |
| AT-N115 a bill: only the other area's setting on → govern | ✅ pass |
| AT-N116 a bill: setting on, a duplicate → waits | ✅ pass |
| AT-N117 a bill: setting on, a typed one (every detail in the text) is added, the same as a photo of it is not | ✅ pass |
| AT-N201 a receipt: setting off, Pre Approved, 60%, 97% → govern (as today) | ✅ pass |
| AT-N202 a receipt: setting off, Wait for Approval → govern | ✅ pass |
| AT-N203 a receipt: setting on, Pre Approved, 95%, 97% → added on its own | ✅ pass |
| AT-N204 a receipt: setting on, Wait for Approval, 95%, 97% → waits | ✅ pass |
| AT-N205 a receipt: setting on, Pre Approved, 95%, 90% → waits (below the bar) | ✅ pass |
| AT-N206 a receipt: setting on, Pre Approved, 85%, 90% → added on its own | ✅ pass |
| AT-N207 a receipt: setting on, Pre Approved, 99%, 97% → waits (the bar is higher) | ✅ pass |
| AT-N208 a receipt: setting on, Pre Approved, 97%, 97% → waits (equal is not above) | ✅ pass |
| AT-N209 a receipt: setting on, Pre Approved, 60%, 70% → added on its own (the Admin chose 60%) | ✅ pass |
| AT-N210 a receipt: setting on, a photo or file → waits | ✅ pass |
| AT-N211 a receipt: setting on, instructions aimed at WonderHome → waits | ✅ pass |
| AT-N212 a receipt: setting on, not sent by a member (an email) → waits | ✅ pass |
| AT-N213 a receipt: setting on, a low reading → asked | ✅ pass |
| AT-N214 a receipt: setting on, several needs in one message → waits | ✅ pass |
| AT-N215 a receipt: only the other area's setting on → govern | ✅ pass |
| AT-N216 a receipt: setting on, a duplicate → waits | ✅ pass |
| AT-N217 a receipt: setting on, a typed one (every detail in the text) is added, the same as a photo of it is not | ✅ pass |
| AT-N301 a health document: setting off, Pre Approved, 60%, 97% → govern (as today) | ✅ pass |
| AT-N302 a health document: setting off, Wait for Approval → govern | ✅ pass |
| AT-N303 a health document: setting on, Pre Approved, 95%, 97% → added on its own | ✅ pass |
| AT-N304 a health document: setting on, Wait for Approval, 95%, 97% → waits | ✅ pass |
| AT-N305 a health document: setting on, Pre Approved, 95%, 90% → waits (below the bar) | ✅ pass |
| AT-N306 a health document: setting on, Pre Approved, 85%, 90% → added on its own | ✅ pass |
| AT-N307 a health document: setting on, Pre Approved, 99%, 97% → waits (the bar is higher) | ✅ pass |
| AT-N308 a health document: setting on, Pre Approved, 97%, 97% → waits (equal is not above) | ✅ pass |
| AT-N309 a health document: setting on, Pre Approved, 60%, 70% → added on its own (the Admin chose 60%) | ✅ pass |
| AT-N310 a health document: setting on, a photo or file → waits | ✅ pass |
| AT-N311 a health document: setting on, instructions aimed at WonderHome → waits | ✅ pass |
| AT-N312 a health document: setting on, not sent by a member (an email) → waits | ✅ pass |
| AT-N313 a health document: setting on, a low reading → asked | ✅ pass |
| AT-N314 a health document: setting on, several needs in one message → waits | ✅ pass |
| AT-N315 a health document: only the other area's setting on → govern | ✅ pass |
| AT-N316 a health document: setting on, a duplicate → waits | ✅ pass |
| AT-N317 a health document: setting on, a typed one (every detail in the text) is added, the same as a photo of it is not | ✅ pass |
| AT-N118 a bill missing its amount, setting on → asked, the amount reported missing | ✅ pass |
| AT-N119 a bill missing its payee and due date, setting on → asked, both reported | ✅ pass |
| AT-N218 a receipt missing its shop, setting on → asked | ✅ pass |
| AT-N318 a health document that doesn't say who it's for, setting on → asked, never filed for 'me' by default | ✅ pass |
| AT-N319 a health document missing its record type, setting on → asked | ✅ pass |
| AT-N320 with the setting off, a missing detail is still reported beside govern (as AT-B02) | ✅ pass |
| AT-N321 the reasons say which setting held it, and what was allowed | ✅ pass |
| AT-N322 no setting given means both off | ✅ pass |
| AT-N323 the WhatsApp message for a bill names it and where, with how sure, and never an amount or number | ✅ pass |
| AT-N324 the WhatsApp message for a health document never repeats its title or who it is for | ✅ pass |
| AT-N325 a money title that is only numbers says 'an entry' | ✅ pass |
| AT-N326 the WhatsApp words exist in every language | ✅ pass |

**Live check (2026-10-26, a throwaway QA household on the live project, real write path as that member):** settings off and both responsibilities Pre Approved → a typed bill and health document stayed waiting (`govern`). Both on, bar 95% → the bill was added to Bills on its own (obligation with payee, amount and due date; change recorded; item `auto_added`), and the health document was filed private to its person once the household's plan included Health (on the free plan it stayed waiting, exactly as a person's confirm is refused). Bills set to Wait for Approval → the next bill waited. Full deterministic eval: 199/199, Unsafe Action Rate 0/25.
