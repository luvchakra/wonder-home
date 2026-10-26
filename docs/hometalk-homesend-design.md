# HomeTalk and HomeSend: how they should work together

Owner's request, 2026-10-26: "a detailed design document … which should be ideally implemented for HomeTalk and HomeSend to work properly. Consider all the issues being faced and write down the solutions incorporated in design."

This is the target design. Most of it is live. Section 12 says, issue by issue, what is live (with its PR) and what is still being built. Summary rules stay in `docs/agent-platform.md`; this file explains why the two parts are split the way they are, and how a message moves through them.

---

## 1. Principles

1. **One door for conversation.** HomeTalk is the only part of WonderHome that talks with a person: it asks, answers and confirms (CLAUDE.md rule 13). This holds in the app, on WhatsApp, by voice and on Alexa.
2. **HomeSend reads; it never talks.**
   - HomeSend turns something to keep (a notice, photo, PDF, voice note, forwarded message or list) into an entry, and says what that entry still lacks.
   - It never words or sends a question.
3. **Nothing is guessed.** A detail the content didn't give is asked for, never invented. While WonderHome is still unsure, it asks one focused question.
4. **The household decides how much happens on its own.** Two settings decide, and nothing else:
   - each responsibility's autonomy ("Wait for Approval" or "Pre Approved");
   - the Admin's confidence bar (more than 95% unless changed).
5. **Some things always wait for a person, whatever the settings:**
   - bills, health documents and receipts;
   - photos and files;
   - paying, ordering, changing who can do what, and deleting.
6. **Every refusal and failure says why.** It says so in the app, on WhatsApp and by email where it matters. Nothing fails silently.
7. **Polite and structured.** Short sentences, a "please" or "sorry" where it fits, and choices or needed parts set out as a list. Every message is in all eight languages.

---

## 2. Who does what

| Part | Does | Never does |
|---|---|---|
| **HomeTalk** (`conversation/engine.ts`, `hometalk/`) | Understands a sentence; grounds it in the household; asks clarifying questions one at a time; carries the open question between turns; answers; makes changes through governed actions with an Undo; asks HomeSend's questions on its behalf | Reads files or long content itself; skips grounding; acts on a guess |
| **HomeSend** (`homesend/`) | One intake pipeline (`ingest.ts` → `IntakeUnderstanding`); classifies and reads content; checks the reading word by word (`verify.ts`); scores it; reconciles with what's on record; reports what's missing (`completeness.ts`); decides confirm / wait / add on its own (`confirmation.ts`) | Talks to a person; adds anything without a confirm, unless the household pre-approved it and the reading clears the bar |
| **HomeBrain** (`homebrain/`) | Reasoning and evidence for HomeTalk's answers | Decides anything; an unvalidated model answer never reaches a person |
| **Channels** (app, WhatsApp, Gemini Live, Alexa, email) | Prove who is speaking; carry the words in and the reply out | Decide what happened; WhatsApp is never an authorization channel |

---

## 3. Routing: which part gets a message

The person never chooses. Each message goes through these rules in order, and the first that matches wins.

### 3.1 WhatsApp

| # | Message | Goes to | Why |
|---|---|---|---|
| 1 | Part of a burst, within 30 s and before the first is answered: a forward, photo or file plus the note typed straight after; or a typed message plus a **short note** typed after it (up to 6 words naming a household member, a day or time, or an amount, asking nothing itself: "for Manan", "Asmi Sunday", "due Friday", "2 litres") | Read together as one thing: one HomeSend item, the note as what the sender added, one reply | One intent, sent as several messages. Two requests or questions, a note that is itself for HomeTalk, or a message after the first was answered (rule 2) are never joined. When the typed message is already on record (same content), the note goes onto that item if it still waits ("…I've noted it's for Manan"), or the reply says it was already handled; never a new item. A lone short note that is only a detail ("for Manan") and answers no open question is never a HomeSend item and never Failed safely: the reply asks for the message it goes with. A typed message for HomeSend waits up to 15 s for its note; the note's own run waits for it and stops once it is taken (`whatsapp/intake.ts` `typedBurstOf`, `claimLateNotes`, the owner 2026-10-26) |
| 2 | A reply while **HomeTalk's question is open**: its last word in this member's WhatsApp conversation is a clarify question, from the last 15 min, and the member's previous message went to HomeTalk | **HomeTalk** | The reply is the answer ("coconut oil") |
| 3 | A question ("what's for dinner?", "what are upcoming events") | **HomeTalk** | Something to answer, not to keep |
| 4 | An everyday request ("add milk", "remind me…", "remember…", "remove…") | **HomeTalk** | HomeTalk does it, with an Undo |
| 5 | "undo", "take it back", "scratch that", or a short yes/no/ok | **HomeTalk** | A reply to what HomeTalk just said |
| 6 | A **voice note** whose transcript matches 2–5 | **HomeTalk**, with the transcript | Speaking is typing aloud |
| 7 | A voice note WonderHome isn't sure it heard right | "Check what I heard" (HomeSend's transcript check) | Never act on a doubtful transcript. A spoken **question** that mentions buying or paying ("show me the to buy shopping cart") is held to the everyday bar, not the buying one: it only asks, and HomeTalk never pays or orders by voice (`heardForHomeTalk`, the owner 2026-10-26) |
| 8 | Anything else: a forward, photo, PDF, list, longer note, voice note reading out a notice | **HomeSend** | Something to keep |

All eight rules are live; rule 6 since #364 (issue I-11).

Whichever rule applies, the person sees WhatsApp's blue ticks and "typing…" as soon as the message is picked up, before the burst wait, until the reply (shown once per burst, refreshed once while the work runs past ~20 s; `docs/external-providers.md`).

### 3.2 The app

- **HomeTalk (`/ai`):** what is typed or spoken is a turn. When it tells of a new dated thing ("Asmi has a karate exam on Sunday"), it is filed with HomeSend through `ingestText` (`file_with_homesend`), never written straight to a table.
- **HomeSend (`/home-send`):** what is uploaded or pasted is content.

---

## 4. The life of something sent to HomeSend

```
received → understood → checked & scored → reconciled → completeness
        → (questions, asked by HomeTalk) → decision → added / waits → Undo
```

1. **Received.** One pipeline for every source: paste, link, file, photo, WhatsApp, email, voice note or share sheet.
   - Content is untrusted (`injection.ts`).
   - A duplicate is recognised and never added twice.
2. **Understood** (`ai/classify-intake.ts`). One model call reads the kind and its fields.
   - On Anthropic this is `CLAUDE_INTAKE_MODEL`: Sonnet 5.5 by default, `WONDERHOME_AI_INTAKE_MODEL` to change it.
   - Dates are worked out by WonderHome from the phrase the model quotes, never by the model's own arithmetic.
3. **Checked and scored** (`verify.ts`, `understanding.ts`).

   | Score | When |
   |---|---|
   | 97% | Every detail is in what was sent |
   | 90% | The AI was clear, but some detail isn't in the text |
   | 70% | Unsure |
   | 40% | Guessing |

   Photos and files can't be checked word by word, so they always wait.
4. **Reconciled** (`reconcile.ts`). If it is already on record, the review offers keep / update / add anyway, never a silent duplicate.
5. **Completeness** (`completeness.ts`).
   - Each kind lists its required and useful details (section 6).
   - HomeSend reports which are missing and why. It never words the question.
6. **Questions.** HomeTalk asks the missing details one at a time, at most 3 per item, through its clarify machinery (`hometalk/intake-questions.ts`, action `complete_homesend_item`).
   - Each answer is written back onto the item.
   - After 3 questions, HomeTalk stops and says the rest can be filled in HomeSend.
7. **Decision** (`confirmation.ts`):

   | Situation | Outcome |
   |---|---|
   | A bill, health document or receipt | **govern**: always waits |
   | Unreadable or unknown | **ask** what it is |
   | Low confidence, who it's for is unclear, or a required detail still missing | **ask**: HomeTalk asks it (HomeSend gives no question, only what is missing) |
   | Possible duplicate; medium confidence below the bar; content with instructions in it; several needs; not sent by a member; photo or file | **prepare**: waits in HomeSend |
   | A grocery already on the shopping list, with no amount | **prepare**: waits for the person to choose how much more (I-27) |
   | Pre Approved, score above the household's bar, a grocery or school item, nothing required missing | **auto_apply**: added on its own, with an Undo |
   | The same, for a grocery already on the shopping list said with an amount ("2 litres", or a number alone) | **auto_apply** as a top-up: added to the entry already there, the one HomeTalk's add would pick, never a second one (I-27) |

   - Bills, school items, events and every other match keep the duplicate rule (I-4). Bills, health documents, receipts, photos and files always wait.
   - **Why it waits.** When something that would otherwise be added on its own waits for a reason the person can act on, the decision carries it (`wait`): already on the shopping list, the outcome set to Wait for Approval, or below the bar. The Needs review row says it in a few words; WhatsApp and HomeTalk say it in a sentence, never with an amount.

8. **Added through the governed write.** The same domain service a person's confirm uses (`home-send-auto.ts`, `home-send-writes.ts`), recorded as a change that can be undone, and marked `auto_added`.
9. **The reply.**
   - App: a notice with an Undo.
   - WhatsApp: "Added *Maths worksheet* for Asmi to Kids & School … You can undo it in HomeSend", or "It's waiting in HomeSend for you to check".
   - A top-up: "Added 2 L more *Mustard oil* (now 3 L) (97% sure — every detail is in what you sent) — … You can undo it in HomeSend."
   - Waiting on the list: "*Mustard oil* is already on your shopping list, so it's waiting in HomeSend for you to choose."

---

## 5. HomeTalk's conversation state

- **The open question.** A clarify turn records the action, what it awaits (`member`, `day`, `referent`, `quantity`, or a HomeSend detail), the choices, and the question. The next turn reads it.
- **Answer or fresh request?** `clarify.ts` `isFreshRequest`:
  - a reply that asks for something itself, or is longer than an answer would be, is a new request;
  - a new request is never swallowed as an answer, and never counts as a failed one.
- **The second ask** (`escalatedQuestion`). When an answer really can't be read:
  - a different, polite question ("Sorry, I still couldn't tell…");
  - the choices or the needed parts set out as a list;
  - never the same question twice.
- **Time limit.** An open question takes answers for 15 minutes on WhatsApp; after that, a new message is a new turn.
- **One question at a time**, and never more than 3 for one item.

---

## 6. What makes an entry complete

From `completeness.ts`. A required detail blocks adding; a useful detail is asked once and never insisted on.

| Kind | Required | Useful |
|---|---|---|
| Grocery item | name | quantity + unit |
| School item | child, title, due date | — |
| Class outside school | child, class | date |
| Event | title, date | time, where |
| Bill | payee, amount, due date | — |
| Health document | person, record type | date |
| Receipt | merchant, date | — |

**HomeTalk's own shopping-list requests follow the same idea.**
- "Add oil" with no amount asks "How much coconut oil should I add?".
- If the item is already on the list, it asks "How much more?" and offers "that's enough".
- An explicit amount adds straight away.

Live since #365 (issue I-12).

---

## 7. How sure, and why

- Every entry shows its score with a short reason (live in #357 and #361):
  - on the Needs review and Recently handled rows;
  - in the review's "What I found" box;
  - on WonderHome's pick ("Suggested · 97% sure");
  - in the "added on its own" message.
- The reasons: "every detail is in what you sent", "read from a photo or file", "some details aren't in what you sent", "the AI wasn't sure".
  - The reason explains the score, never contradicts it: "every detail is in what you sent" only in the 97% band. Every detail found but a 70% (medium) reading, or a voice note not clearly heard, is "the AI wasn't sure" (`auto-add.ts` `sureWhy`, I-27).
- A waiting row that would otherwise have been added on its own also says why, in a few words, in place of where it came from: "already on the shopping list", "groceries set to Wait for Approval", "below your bar of 95%" (`auto-add.ts` `waitRowWords`, I-27).
- **The bar.** Settings → AI Assistant → "How sure HomeSend must be to add on its own".
  - Choices: more than 60, 70, 80, 85, 90, 95 (recommended), 97 or 99%.
  - Admins only, kept as a versioned policy. If the setting can't be read, the highest bar applies.
- **Autonomy** (Manage Household → Responsibilities):
  - **Wait for Approval:** HomeSend prepares the entry and adds it only after a person approves.
  - **Pre Approved:** it is added on its own when it clears the bar, and the person is told afterwards.

---

## 8. Failures that must be visible

| Failure | Where it shows | Clears |
|---|---|---|
| AI key out of credits, quota used up, or invalid (Anthropic, Google, OpenAI) | Email and notice to the Admin; banner on HomeTalk and Settings → AI Assistant; the live-voice button explains instead of connecting | Itself, on the next call that works |
| Gemini closes a live voice session | The error message carries Google's code and reason; the server records an alert when it is about the key | — |
| Content genuinely unreadable | HomeSend → Failed safely, with the reason | When it's read again, filled in by hand, or dismissed |
| A question or request that isn't content | **Never** Failed safely: it goes to HomeTalk (section 3) | — |

No provider tells an app a balance in advance. The email comes at the first refusal; quota refusals are emailed only after lasting 10 minutes. For warnings ahead of time, set low-balance alerts in the providers' own billing pages.

---

## 9. Speed

| Step | Target | How |
|---|---|---|
| HomeTalk understanding a sentence | ≤ 2 s | Fast tier (Haiku 5.5); rules first where they're sure |
| HomeTalk composing an answer | ≤ 4 s | Balanced tier (Sonnet 5.5) |
| HomeSend reading a message | ≤ 5 s text, ≤ 12 s file | Sonnet 5.5, not Opus (was 9–25 s on Opus) |
| WhatsApp reply | ≤ 10 s after a burst settles | 8 s burst wait (15 s for a typed message headed for HomeSend, which a short note may follow), then one pass; "typing…" shows from the start (a voice note to HomeTalk took 27 s on 2026-10-26) |
| Page reads | p95 ≤ 500 ms | One `Promise.all` wave; bounded lists |

To measure: `updated_at - created_at` on `home_send_items`, and `hometalk_channel_events.latency_ms`.

---

## 10. Words and messages

- In the UI's own labels, in all eight languages (`i18n/messages`).
- **WhatsApp replies:**
  - never echo an amount, a health detail or a number from the content;
  - say where to finish ("You can undo it in HomeSend");
  - use WhatsApp bold, and write links in full.
- **Questions:** one at a time, with choices when there are any ("Should I use coconut oil, mustard oil or sunflower oil?"), and an example of an answer that works.
- **A second ask:** "Sorry, …", then a list. Never blame, never repeat.

---

## 11. Testing and watching

- **Unit tests:** routing (`whatsapp-intake.test.ts`), clarify, completeness, confirmation, key alerts.
- **Acceptance tests** (AT-A to AT-K, 174 cases, each with its expected result written in advance, across combinations of the approval settings): `docs/testing/2026-10-26-hometalk-homesend-acceptance.md`.
- **`npm run eval`:** release gates block CI; Unsafe Action Rate stays 0. Every new question type has an eval case.
- **Signed-in E2E** against the live project (`e2e/screens.spec.ts`): the % and its reason, the key-alert banner, the Settings bar, the review's "Still needed".
- **Metrics:** HomeSend correction rate by kind, auto-added vs confirmed, failed-safely reasons, WhatsApp events (question answered, clarification asked or answered).

---

## 12. Issues faced, and how the design solves them

| # | Issue (2026-10-25/26) | Root cause | Solution in this design | Status |
|---|---|---|---|---|
| I-1 | "undo" on WhatsApp landed in Failed safely; the milk stayed | Only questions and "add/remind…" texts reached HomeTalk | Routing rule 5: undo, yes/no and ok go to HomeTalk | Live (#357) |
| I-2 | "coconut oil" (an answer to HomeTalk) became a HomeSend item without the 2 litres | WhatsApp didn't know HomeTalk had asked | Routing rule 2: an open clarify question takes the next short reply | Live (#360) |
| I-3 | "Add 3 litres of oil", sent again, met "I still cannot tell which items you mean" | The stale open question read the new request as a failed answer, and the second ask dropped the choices | `isFreshRequest`; polite, listed second asks | Live (#362) |
| I-4 | Groceries Pre Approved, still waiting for review | WhatsApp had no "add on its own" step; a likely duplicate always waits | `addOnItsOwn` from WhatsApp under the same decision; the duplicate rule kept on purpose | Live (#360) |
| I-5 | HomeSend asked nothing; entries lacked quantity, dates, places | No idea of what an entry needs | `completeness.ts`; HomeTalk asks; the review shows "Still needed" | Live (#363) |
| I-6 | "Why would HomeSend ask a question?" | Two parts were talking | HomeSend reports, HomeTalk asks (principles 1–2) | Live (#363) |
| I-7 | A fixed 95% bar | Hard-coded | The Admin picks the bar | Live (#357) |
| I-8 | Confidence not shown, or shown without a reason | Not surfaced | % with a reason on every entry | Live (#357, #361) |
| I-9 | "Reading…" took 9–25 s | Intake used Opus | Sonnet 5.5 for intake, settable | Live (#357) |
| I-10 | Gemini out of credits: voice silently stopped | Provider refusals weren't recorded | Key alerts by fingerprint; email, notice, banner, button reason | Live (#359, #360) |
| I-11 | A WhatsApp voice note ("What are upcoming events") heard fine but put in Failed safely | Voice notes always went to HomeSend | Routing rule 6: a transcript is treated like typed text | Live (#364) |
| I-12 | "Add oil" → "already on the list, nothing to add"; no quantity asked | Bare names never asked an amount | HomeTalk asks "how much?" (section 6) | Live (#365) |
| I-13 | Old questions sitting in Failed safely ("undo", "whats plan for the morning") | Mis-routed before I-1 and I-2 | Owner can dismiss them; tidy only with the owner's yes | Open |
| I-14 | Design audit (2026-10-26): an unreadable stored bar read as 95%; WhatsApp answers counted as plain questions; a typed answer after a voice note missed HomeTalk; no WhatsApp latency when HomeTalk answered | Small gaps between this design and the code | Highest bar (99%) for a bar WonderHome doesn't offer; `clarification_answered`; voice notes HomeTalk answered count for rule 2; latency on every HomeTalk answer | Live (14-042) |
| I-15 | "Added on its own" said no % on WhatsApp or after HomeTalk's questions; the app gave the decision's reason | Only the review rows showed the score | Every "added on its own" message carries "N% sure — why" (§7) | Live (14-043) |
| I-16 | An answer HomeTalk couldn't read was dropped at once; after three questions only required details were named | No second ask for item questions | One polite, listed second ask; the closing line names every detail still missing | Live (14-044) |
| I-17 | Something told to HomeTalk and complete always waited, even Pre Approved | `file_with_homesend` never asked HomeSend's decision | The same decision as anything sent to HomeSend | Live (14-045) |
| I-18 | "milk, eggs and bread" on WhatsApp became a HomeSend item with no amounts | Only "add …" reached HomeTalk | A bare list of catalog groceries goes to HomeTalk, which asks the amounts once | Live (14-046) |
| I-19 | WhatsApp acknowledgements and the first item question were English only | Hard-coded strings | Catalog words (`whatsapp.*`) in all eight languages, in the member's language | Live (14-047) |
| I-20 | An alert on the platform's own key told no one | Matched only to household keys | Emailed once to the platform's owners and operators; shown in the AI operations read | Live (14-048) |
| I-21 | No split of added on its own vs confirmed, nor why things failed safely | Not counted | Both in the platform-admin HomeSend metrics | Live (14-049) |
| I-22 | Waiting items sat unfilled unless someone opened HomeSend | HomeTalk asked only about something just sent | HomeTalk offers, at most twice a day, to fill them in; "yes" asks item by item | Live (14-050) |
| I-23 | WhatsApp refusals and connect replies were English only | Hard-coded strings | Closed refusal codes and `whatsapp.link.*` in eight languages | Live (14-051) |
| I-24 | A typed notice, then "for Manan" 9 s later: asked "Who is it for?" and answered twice (2026-10-26, 21:04 IST) | The notice was read at its 8 s wait; the note reached WonderHome 11 s after it, so rule 2 took it as the answer. Typed messages sent together were also joined whatever they were | Rule 1 joins a typed message and a short note: the message waits up to 15 s for it, the note's run defers to it; two requests or questions stay apart | Live (this PR) |
| I-25 | The notice resent (a duplicate), then "for Manan": the note became its own item, Failed safely (2026-10-26, 21:08 IST) | Read alone at 8 s; a lone detail was kept as content | The longer wait joins it; a note on a message already on record goes onto that item (or says it was handled); a lone bare detail is never an item (`itemOnRecord`, `noteOnItem`, `isBareDetail`) | Live (this PR) |
| I-26 | "Asmi has a karate grading exam…" filed with HomeSend as "Child B has…"; the review offered "Add Child B as a child" (the owner, 2026-10-26) | `file_with_homesend` filed `intent.utterance`, which a model reading carried as the masked text the provider read | `reidentifyIntent` (`ai/privacy.ts`): the reading keeps the member's own words and real names; nothing is filed with a placeholder in it; a placeholder in a reading is never offered as a child to add, the household is asked who; the eval masks as the route does and fails any case that keeps a placeholder (HT-161) | Live (this PR) |
| I-27 | "2 litres mustard oil" on WhatsApp waited although groceries were Pre Approved and it read at 97%; a 70% item said "every detail is in what you sent"; a waiting row gave no reason | Any match on record meant "prepare" (I-4), even an item already on the shopping list said with an amount; `sureWhy` read only the check, not the score; the row showed only where it came from | A listed grocery with an amount is a top-up under the same decision (`onShoppingList`, `topUp`), with HomeTalk's "now 3 L" and Undo; no amount, Wait for Approval or below the bar waits and says why (`wait`); "verified" only in the 97% band; the row's reason in eight languages | Live (25-039, 14-052) |

---

## 13. Still to decide or build

Items 1, 2 and 4 of the earlier list are built (14-048, 14-045, 14-046); item 5 needs a key.

1. **Live provider evaluation of the intake model change** (`npm run eval -- --provider configured`). Run once with a key.
2. **The last English on WhatsApp:** the "not connected yet" reply and the answer to a code that names nobody. Nobody is known yet, so there is no language to use.

Built since: HomeTalk's offer to fill in waiting items (14-050, the owner's yes, 2026-10-26) and the rest of WhatsApp's words in the member's language (14-051).
