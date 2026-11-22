# Agent platform: HomeTalk, HomeBrain, HomeSend

Reference detail moved verbatim from CLAUDE.md (2026-10-24, token-economy pass); the summary rules followed on 2026-10-25 and are the next section. `CLAUDE.md` keeps only the invariants. Read this file before you change conversation, HomeBrain, HomeSend, HomePlaces, voice or evaluation code.

## Summary rules (from CLAUDE.md)

Detail: `docs/agent-platform.md`. Read it before changing conversation, HomeBrain, HomeSend, HomePlaces, voice or evaluation code. One pipeline, three real surfaces, each wired end to end.

- **HomeTalk** (`/ai`, `packages/core/src/components/ui/talk-composer.tsx`) is the one door (rule 13). Spoken and typed turns both run through `conversation/engine.ts`.
  - Every action is grounded before a proposal exists (`conversation/grounding.ts`): names via the Wave 1 resolver, dates via `conversation/temporal.ts` (code decides the day, in household time), references via `conversation/references.ts`. Still uncertain → one focused question, never a guess.
  - **Never ask what was said** (the owner, 2026-11-20, `docs/progress/2026-11-20-hometalk-understanding.md`): every day and time in the sentence is taken wherever it was said ("a reminder for tomorrow doctor appointment at 1 o'clock"). Times are read by `conversation/time-of-day.ts` ("1 o'clock", "half past 6", "7 in the evening", "noon"); with no am/pm the words around it choose the half of the day, else 7–11 is morning and 1–6 afternoon, a chosen half already past today rolls to the other, and the reply says what it took ("I took \"1 o'clock\" as 1pm"). A doctor's or other health appointment of the speaker's own said as a reminder is recorded as the appointment (`conversation/appointment-reading.ts`), whose own reminders follow `health/reminders.ts`; someone else's stays a reminder. Every appointment reading, the model's or the rules', is settled before anything is decided (`appointment-reading.ts` `settleAppointment`): its type is read from its words, dictation included ("Dr apartment" is the doctor); a non-health one ("bank appointment") is the reminder asked for with the person's words, day and time; someone else's stays a reminder. Recording an appointment books nothing with anyone (its summary says "Add your … appointment"), and it has Undo. A recording the executor cannot run is never "prepared, waiting for you": the one missing detail is asked (`engine.ts` `missingForRecording`), and an approved action that cannot run is closed as failed with its reason, never left waiting (`hometalk-turn.ts`). A request whose subject is the action itself (a reminder, one's own appointment, a health note, the shopping list, a plan) never needs a target named (`grounding.ts` `IMPLICIT_TARGET`); any other missing subject is asked by name ("Who will be away?", "Which bill is it?"), never a bare "Which one did you mean?" with nothing to pick (`intent.ts` `missingTargetQuestion`, the owner 2026-11-20: "this is bad question"). An appointment already on at the same time is said, never added twice. A question names its slot (`awaiting` `day` or `time`) and its tap answers come from that slot (`hometalk/choices.ts`); an answer completes the original request.
  - A correction replaces a pending proposal or undoes an executed write through its domain service, both kept on the record (`conversation/corrections.ts`).
  - Multi-request sentences are split (`conversation/decompose.ts`); a dependent part runs only if its earlier part happened.
  - Consent (`conversation/consent.ts`): an adult's everyday, undoable change is done at once ("Say undo to take it back"). **Record first** (the owner, 2026-11-14, plan "Nothing stuck in review", phase 2): writing information down never waits — a calendar entry (guests are written on it; nobody outside is messaged), someone else's day away, a bill, a health appointment, a reminder, a list or a note is recorded at once with Undo. A yes is asked only for actions (paying, ordering, messaging someone outside the household, booking, cancelling, deleting, sharing), for who owns a responsibility, for moving something already on the calendar (`adjust_schedule` stays consequential in the safety gate), for a name resolved at medium confidence, and for a bill or appointment while money or health is on "Wait for review". Paying and ordering always wait for a tap on screen. Child, helper and agent actions follow autonomy. An Admin's "Ask before acting" makes every act a question.
  - **Waiting actions expire** (2026-11-14, `conversation/proposal-expiry.ts`): a proposal still waiting after 24 hours gets one reminder to whoever decides it (the asker, or the grown-up a child's request went to; notification source `approval`, thread `proposal:<id>`); after 48 hours it is closed as `expired`, not done, with its approval row and notification. Nothing is ever approved automatically. The on-screen card may be approved for those 48 hours (still bound to its fingerprint); a spoken "yes" counts only within `PROPOSAL_TTL_MINUTES`. The delivery clock runs the sweep.
  - **What a channel message is** (the owner, 2026-11-22: "any kind of message should be analysed by ai and proper response should be given, all intelligence code should be in HomeBrain"). Every WhatsApp message (typed, a voice note's transcript, a file's caption) goes to one HomeBrain entry point, `homebrain/intake/channel-decide.ts` `decideChannelMessage`: the household's model (`channel-decider.ts`, same key and data-use routing as the reading) chooses a kind from a fixed list and a route — `hometalk` (greeting, thanks, small talk, question, request, correction, answer), `homesend` (something to keep) or `both` (a file or forward with words that ask, "remind me to pay this"). `checkedRoute` then holds the safety: a file, photo or forward is always kept; a typed line is never both (HomeTalk files what it is told). With no model, or one that fails, the rules in `homebrain/intake/channel-route.ts` decide, so greetings and plain questions still reach HomeTalk; they are the fallback, never the primary path. WhatsApp code only moves words in and the answer out (`homebrain/intake-boundary.test.ts`). HomeTalk in the app asks the same decision before its engine (`fileFromTalk`, skipped when the rules plainly read a greeting, question or request): something to keep is filed by `file_with_homesend` through the same HomeSend path as a WhatsApp forward; `evaluation/channel-parity.test.ts` holds the two doors to the same decision and answer. A short typed line a reading still finds nothing in is set aside and answered by HomeTalk, never left in Failed safely. "milk?" asks and never adds (`conversation/engine.ts` `asksAboutAThing`). Eval HT-310–326.
  - **Plain corrections** (2026-11-14, action `correct_entry`, `conversation/plain-corrections.ts`, `hometalk/entry-corrections.ts`): "No, it's on the 12th", "That's for Kabir, not Meera", "The amount is 1,240", in HomeTalk or on WhatsApp, first correct what HomeTalk just did in this conversation (`corrections.ts`, a plan's window keeps its part of the day); otherwise the speaker's own most recent matching HomeSend entry from the last 48 hours (a date on a bill, school or class notice or health document; a child on a school or class notice, one person of that name only; an amount on a bill) is fixed in place through the same write a Checking answer uses, with Undo ("Say undo"). A correction confirms a Checking entry and is written to `ai_corrections` (surface `homesend`, `wrong_date` / `false_entity_match` / `wrong_amount`), the learning signal HomeBrain's household rules read. It is built only by the server from the reader (understanding source `rules`), never by a model; instructions in it are ignored.
  - An add to the shopping list with no amount is added at once (the owner, 2026-11-20, "Add it at once", replacing 2026-10-26's "ask how much first"): the household's own usual step for the item, else its catalog pack, else one of the unit's own step (`grocery-actions.ts` `amountFor`), never a guess presented as fact. The reply says the amount, with Undo, and "make it 2 litres" changes it; something already on the list is said with its amount and left as it is. An amount said adds as said; a meal's ingredients keep their at-home check. Amount questions remain only where an amount itself is unclear ("How many bottles for 1 litre?", "Did you mean 2 L?").
  - A reminder is a notification to the speaker alone, held until `scheduled_for`. An add that changed nothing says "Nothing to change", never "Done".
  - Models see facts only. `withoutServerOnly` strips anything the server decides (ids, grounded dates, undo records). Replies are composed in English, the record; other languages go through `conversation/reply-language.ts`. A new action needs a `REPLY_CLASSES` entry.
  - Extend `conversation/evaluation.test.ts` when an understanding changes; never loosen it.
  - **Reply rule: structured, with emojis, cheerful** (the owner, 2026-10-26). Every reply goes out through `conversation/warmth.ts` `warmReply`, after it is validated, wherever it is sent (app, WhatsApp, Alexa text). An answer, a confirmation, a question or a preview carries an emoji for its topic (🛒 📅 ⏰ 🍽️ 🧾 🩺 🎒 📍 📥 …, a one-line everyday answer closes with 😊). Two or more things are a `- ` list, one per line; a run of three or more joined by semicolons is unfolded into `◦` lines (`unfold`); each hint ("For example …", "Or say …") sits on its own line, the first led by 💡; the Undo line has its own. Refusals, failures and the "Why?" evidence stay plain. Money, health or a child gets a neutral topic mark, never a smile. Only real emoji count (`★4.8` is not one). No model is asked for an emoji, so validation is unchanged. Speech drops them. `conversation/reply-style.test.ts` runs every golden HomeTalk reply through it; a new reply shape that breaks it is fixed in the composer, never by loosening the test.
  - **WhatsApp lays the reply out the way the app does** (the owner, 2026-11-22: "make it same as HomeTalk message formatting"). `whatsapp/hometalk.ts` `whatsappReplyText` renders from the same `conversation/reply-format.ts` `parseReply` the app's `ReplyText` uses, so both doors say the same words: `*bold*`, "• " items with a blank line between them when any item is a sentence, a link's short label kept in the sentence ("→ Meals") and each screen written once at the end ("Meals: https://…"), a map link in full where it stands. A line a model wrapped between two bullets is part of the item above it, in both doors; after the last bullet it is the closing line. A long reply drops whole items and keeps its first and closing lines. `evaluation/channel-parity.test.ts` holds the words equal.
- **HomeBrain** (`conversation/brain.ts`, `ai/model-client.ts`) gives the reasoning behind a reply. It is a real model call behind the same consent, minimisation and entitlement gates, and never decides: every downstream gate runs on its output.
  - **HomeSend is the exception: the model decides** (owner, 2026-11-22). For an item sent in, the model says what it is (free words plus the nearest kind; new kinds allowed) and which operations over the capability registry (`homebrain/intake/capabilities.ts`) it calls for, each with fields, who it is for, evidence and confidence, and at most one question (`homebrain/intake/decision.ts`). `validateDecision` then checks each operation against its capability's schema, rejects any quote not in what was sent or record id not handed over, requires an update or attach to name a record on file, turns actions (paying, ordering, messaging outside the household, booking, cancelling, deleting, sharing) into proposals waiting for a yes, keeps money and health under their own setting, never takes who a health record is for from a model (health filers aside), and caps confidence on injected content. Only accepted operations run, through the governed writes, record first with Undo. Design and order of work: `docs/design/2026-11-22-homesend-ai-decides.md`. Since 14-081 every item carries its validated decision (`understanding.decision`); today's reading is expressed as one (`decisionFromReading`). Since 14-082 the model decides a kind nobody anticipated itself (`newKind` + `operations` on the classifier tool, `decisionFromModel`): the item is kept as a household note and each accepted dated thing goes on the calendar first (`homesend/new-kind.ts`, called by the Nothing-waits runner), with Undo, confirmed above the event bar else Checking; the reply says so plainly (`newKindSentence`). Since 14-083 every decision is remembered with what people did next (`homebrain/learning/decision-memory.ts`, table `homesend_decision_memories`: kept, confirmed, answered, corrected, undone), and the household's five most similar past decisions go to the model, fenced, as worked examples; never another household's, never an amount or a person.
  - No model answer reaches a person unvalidated: `homebrain/validate.ts` refuses invented names, dates, amounts, events, health or integration claims and "I've done it" claims. Extend it when a new kind of invention appears; never route around it.
  - "Why?" is answered from evidence in `homebrain/why.ts`, never by a model.
  - **HomeBrain knows before anyone is asked** (Nothing stuck in review, phase 3, 2026-11-14). Before HomeSend or HomeTalk asks who, which school, payee, category, place, area or grocery, the memory resolver (`homebrain/memory-resolve.ts`) fills the gap from the household's own records and rules, only when exactly one answer is supported, with "Why?" from evidence (record ids and rule ids, never a model's words) and a confidence (used at 0.8 and above). It never fills who a health document is for, an amount, a date or an approval, and never overrides a name the content used. The one exception (the owner, 2026-11-20: "for health record make it configurable on admin level, so the check can be bypassed for allowed users"): for a sender an Admin put on "Who may file health records for others", it may fill who a health document is for from the one household member the document itself names (basis `named_in_document`, never a learned rule); for anyone else it still never does.
  - **Household rules** (`homebrain/rules.ts`, table `homesend_learned_defaults`): every answer, pick and correction teaches `sender_child`, `sender_person`, `sender_area`, `vendor_category`, `phrase_item` or `place_alias`. A rule never crosses households (a member value is checked against the household on write), never carries money, approval or permission (`safeRuleText`, the table's currency check, and no kind that means "may"), and a key taught two values is `mixed` and asked again. HomeTalk and WhatsApp corrections call `learnFromCorrection` (`rules-repository.ts`), which also marks `homesend_changes.corrected_at`. Admins see and forget them under Settings → AI Assistant.
  - **Verify after, not before** (`homebrain/verify-night.ts`, run in the sleep job): entries added in the last 48 hours are checked for a duplicate, a date clash, an amount unusual for the payee (never said in the question) and a sender that doesn't match a rule; at most 5 a night, each once, into the "Needs you" list (`needs-sink.ts`, source `homebrain_conflict`, one open question per HomeSend item, evidence in `prompt.why`). Answers are "Keep it" (every default) and "Remove it", which runs HomeSend's Undo on a person's tap only: a question nobody answers never removes anything (`hometalk/needs-you-answer.ts`). Checking entries a second, separately sent source or a kept recurring pattern supports are confirmed (`confirmed_basis`); health documents never are.
  - **Where the resolver is called.**
    - HomeSend's "Who is this for?" goes through `homebrain/subject-fill.ts`: the 14-066 inference first, then the resolver over every household rule (review and the eval runner). Since 2026-11-20 the resolver also reads the class a notice names (`schoolGrades` on the member), a teacher on one child's timetable or class, a subject only one child has on their timetable, and this sender's earlier notices (`homesend/sender-history.ts`). Still unsure, a school notice goes to **every child at the one school it can be placed at** (`childrenAtSchool`: the school it names, else the school of this sender's past children; two or more), each a school item and a change of the same HomeSend item, all Checking (`filledFromHistory`), undone together. A rule taught two children is still asked, never spread.
    - **Knowing instead of asking, every kind** (the owner, 2026-11-20; `homebrain/history-fill.ts` `fillFromHistory`, called by `home-send-review.ts` `prepareReview` before anything is decided, and by the eval runner). One wave reads the context (people, bills, school, places, groceries), every rule kind and the sender's history (`householdMemory`). It fills: an unknown kind from `sender_area`; a bill's or receipt's payee from one the words name or the one this sender's earlier bills all had (`payee_from_sender`); a bill's category (`vendor_category`, else its bills on record); a grocery's name (`phrase_item`); a place (`place_alias`). **Decision 3:** a bill missing its amount or day takes the payee's usual — the median of its bills and paid months on record, two or more, one currency, the same evidence the nightly `recurring` check uses — and the next such day on or after it arrived (`usualBill`, `nextOnDay`); with no history it stays blank. Anything filled from history is recorded **Checking** (`ConfirmationInput.filledFromHistory`), even over the bar. Reconciliation uses only what was read: a filled amount or day never moves or changes a record on file (eval HS-106). "Why?" lines (never the amount) are kept on the item as `understanding.filled` (`keepFilledWhy`) and shown on its Checking row. "Add this bill?" (`add-default.ts`) fills a single bill the same way. Domain reads go through `homebrain/household-records.ts`, so HomeSend still touches only its own tables (X-003).
    - HomeTalk grounding reads the household's phrase rules (`GroundingEnv.rules`), so "add atta" goes straight to the grocery the household picked before.
    - A pick from "Should I use …?" teaches `phrase_item` (`homebrain/grocery-lesson.ts`, learned after the response).
    - Plain corrections of HomeSend entries teach through `learnFromCorrection` (`hometalk/entry-corrections.ts`).
    - **Every answer teaches** (2026-11-20, `homebrain/teach-from-entry.ts`): a person's tap of "Looks right" (`homesend_check`), "Add" (`homesend_add`), "Update" (`homesend_update`) or "Keep" (`homebrain_conflict`) in Needs you runs `teachFromEntry` after the response: the sender's kind, a bill's payee category, and a school notice's child from its routed row, as a pick. A default never teaches; a health document never does. Review confirms of an event or bill with a picked person also teach `sender_person`.
    - HomeTalk's corrections of its own actions teach nothing: they have no outside sender and no source phrase, so no lesson is safe.
  - **Each kind's bar** (`homebrain/kind-bar.ts`, table `homebrain_kind_bars`, refreshed nightly): with no Admin bar, a kind's bar follows the household's own undo and correction rate over 90 days: fewer than 10 entries 95%; 50+ and no errors 80%; 20+ and under 2% 85%; under 5% 90%; under 10% 95%; under 20% 97%; else 99%. Never below 80% nor above 99%. An Admin's chosen bar overrides it ("Set for each kind by WonderHome" clears the override). Reading scores are banded (0.97, 0.9, 0.7, 0.4) and a reading must be strictly above the bar, so 80–85% admits the 0.9 band, 90–95% only verified readings, 97–99% none. The bar only chooses confirmed or Checking: paying, ordering and approving never follow from it.
  - Prompts keep a stable prefix for the provider's cache (14-027): fixed instructions first (`systemBlocksFor`, the answer's system block), then the facts (`anthropicAnswerMessages`), then what changes every turn (time, asker, problems, question). Never put a timestamp or per-turn value ahead of a cached block. A streamed call reports only timing and token counts (`onFirstToken`, `onUsage`); its draft is still read whole and validated. Each turn's `timings` carry `store`, `retrieve`, `firstToken` and `tokens`.
  - The household context is one server-only row (`household_context`, `homebrain/context-store.ts`). Never read it from a session, and never answer from a row older than the last write.
- **How HomeTalk and HomeSend work together** (routing, the life of an item, questions, confidence, failures, and the issues behind each rule): `docs/hometalk-homesend-design.md`.
- **HomeSend** (`packages/core/src/homesend/`, `ai/classify-intake.ts`, `/home-send`) is the intake. Every input enters through `homesend/ingest.ts` and ends in `IntakeUnderstanding`. A new input type is a new `ingest*` entry point, never a second pipeline.
  - Nothing reaches a domain table until a person confirms, or the household's own settings allow it. **Record first** (the owner, 2026-11-14; `homebrain/intake/record-first.ts`, `household/direct-add-repository.ts`; three choices on Settings → AI Assistant, Admins only, each reversible on its own, a read failure is the careful answer — everything waits):
    - *What "Wait for Approval" holds* (decision 1): "Only actions" (default) — a complete reading in an area on Wait for Approval is recorded anyway (confirmed above the bar, Checking below it, `confirmation.ts` `approvalScope`); a move of a record on file still waits. "Everything" is the 3 Nov behaviour.
    - *Money and health entries* (decision 2, replacing the 2026-10-26 "Add money / health entries directly" switches): two choices since 2026-11-21 (owner: "only auto approved and wait for review should be there"). "Auto approved" (`confirmed`, default) — bills, receipts and health documents go through every rule a grocery does: confirmed above the bar, Checking below it or where the existing rules say so (a photo or file, a filled blank); a Checking bill's reminders say "check before paying" (part A's `reminder.checking.money`: "Not yet confirmed — check before paying."); a health document is filed to the named person's record, with its existing visibility. "Wait for review" is the 3 Nov behaviour. The removed third choice, "Record as Checking" (`checking`, always Checking, the default 14–21 Nov), is read as "Auto approved" (`record-first.ts` `LEGACY_MONEY_HEALTH_ALIASES`), so no stored row is rewritten; `DirectAdd.checking` is no longer set by any setting. A bill is recorded, never paid.
    - *Email from new senders* (decision 5, `homesend/sender-trust.ts`): "Ask once" (default) keeps the first item from a sender nobody approved set aside (archived `new_sender`, unread, no attachment fetched) and asks the Admins "Trust this sender?" once as a `needs_you_items` row (source `sender_trust`, `senderQuestion` → `askNeedsYou`; answered through `applySenderTrustAnswer`, an Admin's tap only, a default never trusts); Trust adds it to `homesend_email_allowlist` and its held mail is read on the job queue; "Not ours" blocks it (`sender_blocked`, later mail dropped before storing); no answer sets it aside when the list's default applies after a day (`sender_not_answered`; a 48-hour sweep is the backstop; a later email asks again). "Read only senders an Admin added" is the 3 Nov behaviour. **Pre-trust** (decision 4, the owner 2026-11-20; `homesend/sender-pretrust.ts`, only on "Ask once"): an exact address the household's records know — a member's own email or a teacher's contact (`contact`), a child's school (a teacher's or past school notice's domain, or a domain named like the school: `school`), a payee (an address whose bill or receipt was recorded, or a domain named like a payee on record: `payee`) — is added to the allowlist with that `basis`, vouched for by the owner when an active adult Admin, audited `homesend.sender_pre_trusted`; webmail domains never count on their own. The senders list shows "Trusted: in your contacts / a child's school / a payee on record"; Remove sets `homesend_email_senders.pre_trust_off`, so that address is asked again and never pre-trusted. A default still never trusts. **Attachments** from a trusted sender go through the same add-on-arrival step as a photo, always Checking; mail released by a later "Trust" still has only its text read. Detail: `docs/external-providers.md`. A trusted sender's items are decided as a member's own (`trustedSender`); their content stays untrusted. Since the 14-068 follow-up a trusted sender's email is added on arrival (and when held mail is released by Trust): the app's own review and governed write run as the Admin who trusted that sender (allowlist `created_by_member_id`, still an active adult Admin; `homesend/trusted-arrival.ts`, `_lib/homesend-trusted-email.ts`, `withMemberSession`), audited with source `email:trusted_sender`; nobody to vouch → it waits for a member.
  - **Added directly, Checking below the bar** (the owner, 2026-11-03: "add the entry directly in WonderHome without asking for a review"). Where the outcome's autonomy is Pre Approved, a complete reading (nothing required missing, nobody to ask about, no duplicate, no instructions, one thing) is added at once through the same governed write a person's confirm uses (`autoApplyHomeSendItem`), audited `homesend.auto_added` with its score and source. More sure than the household's bar (95% unless an Admin picks another on Settings → AI Assistant, 60–99%, `homebrain/intake/auto-add.ts`) it is added confirmed, whatever it was read from (the owner, 2026-11-21: "why it's still waiting? it automatically add in WonderHome"; a bill, receipt or health document read from a photo or file stays Checking under "Money and health entries"; `homebrain/intake/above-bar.ts` does the same comparison for exam timetables and a document's several things); at or below it, it is added **unconfirmed** (`decideConfirmation` → `unconfirmed: true`). The state lives on HomeSend's own link row (`homesend_changes.confirmation_state`, `confidence`, `confirmed_at`, `confirmed_by_member_id`; X-003 keeps domain tables unchanged): the HomeSend inbox shows a "Checking" badge with "Looks right" beside Undo, its reminders fire as usual marked "not yet confirmed" (money: "check before paying"; `notifications/reconcile.ts` + `sources.ts` `notYetConfirmed`, decision 3 of 2026-11-14, which replaced holding them; Settings → AI Assistant → "Remind about entries still Checking" switches it back), and `confirmHomeSendEntry` moves it to confirmed (a person, audited `homesend.confirmed`; or answers that raise it over the bar). Replies say "marked Checking until it's confirmed". Wait for Approval waits only on "Everything" (decision 1, 2026-11-14). Every entry shows its score as "N% sure". The `understanding` eval gate keeps HomeSend above 95% in category and end to end; eval cases that end in an unconfirmed add are observed as `add_checking`.
  - **Nothing waits** (the owner, 2026-11-14; `docs/design/2026-11-14-nothing-stuck-in-review.md`, part A). Every item sent ends as something (`homesend/deadlines.ts` `endingFor`, pure): not household information it couldn't place (a pasted page, an ad, a newsletter: two or more web signs) is set aside at once (`not_household`); unreadable is read once more another way, then its sender is asked once to resend (default after 24 h: set aside, `not_resent`); read but of no known kind is kept as a **household note** — the HomeSend item itself, archived `kept_as_note`, words kept where they arrived (X-003), never copied into `memories`; HomeTalk finds it through `listHouseholdNotes` in its context; anything else waiting gets one question. A bill, receipt or health document waiting on the Admin's switch is part B's (recorded as Checking, decision 2), never defaulted into a note. **A match on record is asked, never left** (the owner, 2026-11-20: "update"): record first never adds a bill, receipt or health document that matches one already on record, so the step reconciles each waiting one (`homesend/matched-update.ts` `matchOnRecord`, the review's own `reconcile.ts`, at most 40 a household a pass). A newer amount or date for a bill gets "Update the existing bill?" (`homesend_update`, Update / Keep as is, asked of the sender when an Admin, else the Admins); **the default is Update**: the new amount and/or date go onto the bill through `updateObligation`, the write a person's Update uses, recorded as an `updated` HomeSend change with what it replaced (Undo) and `confirmation_state = unconfirmed` — Checking, "check before paying", reminders on — audited `homesend.matched_update`; a person's own Update is confirmed. Keep as is sets the copy aside `already_recorded`. A message saying a bill is called off is offered Cancel it / Keep as is, but its default (`keep_checking`) never cancels: the bill is kept, marked Checking, with the note `said_cancelled_kept` in the audit. The same one again (a bill or health document with nothing new) gets the duplicate question, default keep what's on record. A waiting bill that matches nothing on record, in a household whose "Money and health entries" isn't "Wait for review", is recorded now as Checking (`recordWaitingBill`: `createObligation`, an `unconfirmed` HomeSend change with Undo, audited `homesend.auto_added`, source `nothing_waits`), as record first would have done had it arrived after 14 Nov; one missing its amount or due date, or a document with several records, is left to a person. **Everything else is asked "Add this bill?"** (the owner, 2026-11-20: "record"): a waiting bill, receipt or health document that matches nothing and that record first could not add on its own — money or health set to "Wait for review", an amount or due date missing, a document with several records — gets one `homesend_add` question (Add / Set aside; a bill's goes to an Admin), and the default after 24 h is **Add** (`homesend/add-default.ts` `addWaitingItem`): recorded with what is known, each entry an `unconfirmed` HomeSend change with Undo, audited `homesend.added_checking`. A bill through `createObligation` with a missing amount or due date left blank (the Bills screen says "amount not in yet" / "no due date"; a bill with no due date has no reminder until one is set, `notifications/sources.ts`), and each bill of a document with several; a receipt's lines as purchases against the tracked item of that name or a new one, dated by the receipt or the day it was sent; a health document filed privately for the person who sent it, its file copied to health records, as a person's own Add does — only when its own words name the sender (see "Who is this for?" below). **Who may file health records for others** (the owner, 2026-11-20: "for health record make it configurable on admin level, so the check can be bypassed for allowed users"; `homebrain/intake/health-filers.ts`): Settings → AI Assistant, in "Money and health entries", an Admin ticks adults (a helper only by an explicit tick; never a child; nobody by default), stored as the `ai_autonomy` policy "Who may file health records for others" (`household/direct-add-repository.ts` `saveHealthFilers`, Admins only, audited `policy.updated`). A health document from one of them that names another household member is filed for that member at once, marked Checking, with Undo, audited `homesend.health_filed_for`, and no Needs-you question: on its own through the review (`gateHealthSubject` keeps the named person; the write goes through the server after `healthFilerWrite` checks the list and that the subject is an active adult or child of the household, since the database only lets a member file for themselves or a child they guard), or, while it waits, by the deadlines step (`healthFiledFor` → ending `file_for`, `addWaitingItem` with `healthFor`). The person who filed it may Undo it. A name matching nobody in the household is never filed for: today's question. Every other sender keeps today's rule — their own record or a child's on its own, anyone else asked "Who is this for?". **"Who is this for?" while it waits** (2026-11-20 fix; `health-filers.ts` `healthSubjectFor`): for every sender not on the list, a waiting health document is added on its own (or offered "Add", whose default adds) only when the one household member its own words name is the sender. One naming someone else, someone outside the household, several people, or nobody gets one `homesend_health_for` Needs-you row, to the sender only (the item is private to them): "It's mine" (the sender's own tap, never a default) files it privately for them as Checking; Set aside archives it. **The default after 24 h is Set aside** (`archive_reason = health_not_claimed`, restorable, migration `20261120233000`): the most conservative ending — never filed for anyone, never a household note (a note would put health detail where HomeTalk shows it to the household), closed well inside 48 h. With no sender who can answer it is set aside at once. `addWaitingItem` re-checks this itself, so an older "Add this health document?" default no longer files it under the sender. Eval HS-99, HS-120–123 (HS-120 is the unsafe class: named someone else, default fired, filed under the sender). Who can see the record is unchanged (`wh.may_see_health`: the person, their guardians, and anyone they shared with). Eval HS-100–105. A receipt with no lines, or a health document nobody in the household sent (an email), can't be added this way and waits for a person. A receipt has nothing to reconcile with; a health record is never updated or cancelled from HomeSend. Nothing is paid or deleted. Eval HS-90–99. **Every question has a default and a deadline** (decision 4): one `needs_you_items` row with closed prompt code, tap answers, `default_answer`, `default_at` (24 h after the thing was sent) and `expires_at` (48 h). The step `clock.homesend-deadlines` (`hometalk/needs-you-run.ts`) applies due defaults through the same switch a tap uses (`hometalk/needs-you-answer.ts`), audited `needs_you.defaulted`; closes the rest at 48 h; closes HomeTalk proposals still waiting after 48 h as not done; withdraws a question whose thing was settled elsewhere. A default never pays, orders, approves or undoes, and never confirms money or health: a Checking bill, purchase or health record keeps Checking with its question closed (`keep_checking`); anything else is kept as read. Settings → AI Assistant → "Apply a question's default after a day" switches it back (then questions close at 48 h with nothing done). A person acting on a Checking entry (Mark paid; editing a bill, school item, event or health record) confirms it (`changes.ts` `confirmByAction`, `how: "acted"`). **One "Needs you" list** (`hometalk/needs-you.ts`, `needs-you-repository.ts` `loadNeedsYou`): HomeSend's questions, HomeTalk proposals waiting for a yes and pending approvals, ranked by consequence then age, three shown, each with its tap answers and its default and when; at the top of `/ai` and on Home; answered through `(auth)/needs-you-actions.ts` as the member, audited `needs_you.answered`. Parts B and C add rows with `askNeedsYou` and register what their answers do with `registerNeedsYouHandler`. The HomeSend page is the send box, "Added recently" with Undo and "Set aside"; one daily summary (`notices.ts` `homesendSummaryNotices`) replaces the grouped notices. Eval HS-55–65.
  - **Confirm by evidence and action** (the owner's 2026-11-20 review, part 2; spec: the "HomeSend on Its Own" review). Supersedes the parts of "Nothing waits" above it names. **Payment proof** (`homebrain/intake/payment-proof.ts`, pure; `payment-apply.ts`): a bank, card or UPI message saying the household paid — pasted, shared, a WhatsApp forward, a forwarded email or a screenshot — is read deterministically in `ingest.ts` `understand` (from what was sent, or the reading's quotes off a picture; no model needed for text) and kept as a `receipt`-kind item with `understanding.payment` (amount, currency, payee, day, method). It is never proof when it asks for anything (pay now, approve a request, a collect request, click, a PIN or OTP, "will be debited", "is due"), when it is money coming in, or when the content tried to instruct WonderHome; links in it are never followed. The deadlines pass settles it (`settlePaymentProof`, service role; `home-send-auto.ts` asks for that household's pass at once through `_lib/homesend-settle.ts`): one open bill matching by payee (`samePayee`), a date window (due up to 25 days after, 10 before) and an agreeing amount (±1%, or no amount yet) is marked paid through `markObligationPaid`, recorded as an `updated` HomeSend change whose `previous.payment` is the `PaidBill` (Undo runs `undoBillPayment`), Checking, audited `homesend.payment_recorded`; the bill's own Checking entry is confirmed `payment_proof` (its amount is what was paid). Two equally close bills: no match. No match, or a bill whose amount disagrees: the payment is recorded on its own as a paid one-off on Bills ("Paid to …", Checking, Undo also removes its history row), and a disagreeing amount sets `payment.outcome = "conflict"`, which the nightly check asks as "unusual amount" (never saying the amount). WonderHome never pays. **More ways to confirm** (`confirmed_basis`, migration `20261120120000`): `payment_proof`; `receipt` (a receipt from the bill's payee for the same amount within 20 days, `verify-night.ts`); `marked_paid` (`confirmByAction(..., "marked_paid")` from Bills' Mark paid, a reminder's Mark paid and HomeTalk's "paid"); `due_passed` (its day passed, not corrected — `review_corrected` or `corrected_at` — and no conflict raised; never health). Before the migration is live the check refuses the new values (23514) and the entry is still confirmed, basis blank ("person" for marking paid). **At once, not at the default** (`deadlines.ts` `endingFor`): a matched bill with a newer amount or date and one candidate is `update_now` (`applyMatchedUpdate`, source `matched_at_once`, audited `by: "at_once"`); "Update the existing bill?" stays only for `reconcile.ts` `ambiguous` (two candidates) and for cancellations, which never cancel. A document with several bills, where money is recorded directly, is `add_now` (`addWaitingItem`); "Wait for review" still asks. **Unreadable**: the second read (`retry-queue.ts`, both paths) uses `ingest.ts` `strongerClassify`: a photo or PDF has its words written down first (`ai/read-words.ts`), then read by `SECOND_READ_MODEL`; text goes straight to that model (`classifyIntake(..., { stronger: true })`), all through `ai/provider-clients.ts`. After it, "send it again" (`homesend_resend`) is asked only when the sender said something in HomeTalk in the last 10 minutes (`conversation_messages`); otherwise it is set aside `unreadable`. Eval HS-111–119 (HS-114–116 unsafe: a "payment" that asks to pay, approve or carries instructions stays refused), HS-60, HS-90, NY-07 updated.
  - Told in HomeTalk about a new dated thing (`file_with_homesend`), the sentence goes through `ingestText` like a paste, never straight to a table.
  - What makes an entry complete is `homebrain/intake/completeness.ts`: per kind, required details (nothing is added on its own while one is missing) and useful ones. What the content says is taken first (`fillFromEvidence`), never guessed. **HomeSend only reports what is missing; it never words or sends a question** (the owner, 2026-10-26). **HomeTalk asks**, one question at a time, at most three per item, in the app and on WhatsApp (`hometalk/intake-questions.ts`), as its own open question (`metadata.clarify`, action `complete_homesend_item`, read by `conversation/clarify.ts`); who an item is for is asked the same way, with the household's names. The answer goes back onto the item, then HomeSend adds it (Pre Approved: confirmed above the bar, Checking below it, `addIfAllowed`) or it waits. Never an amount or health detail said back in these questions.
  - **"Looks right?" is gone by default** (the owner, 2026-11-20: "I want homesend to be as automanomous as possible. with minimum inputs required from the users"; 8 of the 9 Needs-you questions asked since 14 Nov defaulted unanswered, 1 was open; `docs/design/2026-11-14-nothing-stuck-in-review.md`, section "2026-11-20"). A Checking entry is asked about only when the nightly check finds a clash, a duplicate or an unusual amount (`homebrain_conflict`), or when a bill's or receipt's amount was read with doubt (`checking.ts` `amountInDoubt`: from a photo or file, or not in the words sent) — one `homesend_amount` question to its sender, default keep Checking, never confirmed by default. Everything else stays blank and labelled, is confirmed by evidence or a person acting on it, and is reported in the evening summary (`notices.ts` `homesendSummaryNotices`, from `SUMMARY_HOUR` 19:00 household time, to adults who sent something and Admins, counts only; HomeSend's "Today" card shows the same counts above its lines: "Added recently" with Undo and "Set aside" with Restore). The waiting item's question is retired (open rows withdrawn); "send it again?" stays only for a sender in HomeTalk right now (part 2); an incomplete bill, receipt or health document is added at once as Checking unless the Admin chose "Wait for review". HomeTalk/WhatsApp chains about anything but the amount are closed; `correct_entry` still corrects in place. Settings → AI Assistant → "Ask me to confirm entries still Checking" (off by default) brings back "Looks right?" and the 14-061 questions below. Platform admin Overview adds questions per 10 sends, the share answered by a person, confirmed without a tap by basis, and undone or corrected within 7 days. Eval NY-09–13.
  - **Checking entries are asked about until they are over the bar** (since 2026-11-20 only under the Admin's "Ask me to confirm entries still Checking") (owner, 2026-11-03; story 14-061). A reading that names something not in what was sent is never added, not even as Checking: it waits (`verify.ts` `untraced`). For one added as Checking, `homebrain/intake/checking.ts` plans at most three questions from evidence (a photo or file: confirm each key detail; a useful missing detail; else confirm the entry by name). `hometalk/checking-questions.ts` asks them one at a time, in HomeTalk and on WhatsApp, as action `check_homesend_entry`. The state is on the item (`understanding.checking`), so an answer in either channel resolves both. Answers are read deterministically, applied in place through the domain update as the member, and raise the score by each settled answer's share of the gap. Over the bar, `confirmHomeSendEntry` confirms it ("answers"); skips end in one "please check". Only the sender answers. Instructions in an answer are never applied. A check may say the reading back (amounts, dates, health detail), to the sender only, on their verified WhatsApp link (decision C). Where it shows (14-062): HomeSend's Recently handled reads "Added · checking N questions" (`questionsLeft`); the bill, school item, grocery and health record show "Checking" on their own screens (`unconfirmedEntityIds`); one grouped "N HomeSend questions waiting" notice per sender (`notifications/notices.ts` `homesendQuestionNotices`, thread `homesend:questions`) resolves as they are answered — since 2026-11-14 only before the Needs-you migration; after it, the daily summary counts them; confirming runs the reminder pass at once, so the "not yet confirmed" mark goes. The review form says "Still needed" and keeps Add off; `createNew` refuses a post without a required detail.
  - **Infer before asking; never ask twice** (owner, 2026-11-07; story 14-066). Before "Who is this for?" on a school or class notice, `homebrain/learning/learned.ts` `inferSubject` (in `prepareReview` and the eval runner) settles it from the school the notice names, what the household told HomeSend about that outside sender (`homesend_learned_defaults`, learned on a HomeTalk/WhatsApp answer or a review pick, as the member, same household only), or the one child at school. A name in the notice always wins; a sender sent for two children is `mixed` and asked again; health is never inferred; a learned default only fills who it is for, never an amount, approval or permission. Admins see and forget it on Settings → AI Assistant. Eval HS-48–52.
  - **Fewer questions** (owner, 2026-11-07; story 14-066 part 3). A moved date that plainly is one record on file (`reconcile.ts` `clearMove`: the same name, the same person, only the day changed, no second record like it) is, where the area is Pre Approved and the reading is over the bar with words of its own, moved in place through the governed update a person's "Update" uses (`confirmation.ts` `update` → `autoApplyHomeSendItem` → `reviseExisting`), recorded as an `updated` change so Undo puts the old day back; never an amount, never a cancellation, never from a photo, never Checking. Eval HS-53/54 (`update_in_place`). A photo or file in Checking gets one "Looks right?" over everything read (`checking.ts` mode `confirm_all`): a yes confirms it at 100%; a no goes on to the details, three questions at most in all; a skip ends in one "please check". When one entry is settled, the next waiting question for the same sender follows in the same reply ("📥 Next, …", `withNextWaiting`), and WhatsApp says "N quick ones" once. HomeTalk starts at most one question an hour per person on WhatsApp (`hometalk/question-cadence.ts`, counted by `cadence: "send"` on the message); a held one is said as "it'll come after the one I already asked", and waits for that answer, HomeTalk in the app, or the grouped notice.
  - A class outside school is its own kind, never school work (`activity_item`, 08-027): filed under the child's class of that name in Kids & School, the class added in the same step when missing. An event or invitation (`event`) goes on the calendar through `addFamilyEvent`. Both are recorded first (14-068 follow-up, `confirmation.ts` `RECORD_ONLY`): on "Only actions" a complete reading is added (confirmed above the kind's bar, Checking below it, reminders marked "not yet confirmed", Undo); on "Everything" it waits. Eval HS-86–89.
  - All content is untrusted: `injection.ts` fences it and ignores instructions aimed at WonderHome. Links are fetched only through `link-fetch.ts` (public addresses, DNS pinned, every redirect checked).
  - Duplicates are shown and moved dates are offered as updates, never a second copy (`reconcile.ts`). Document plans (`homebrain/intake/plan.ts`) apply only through `applyDocumentPlanAction`, and never on their own when there are two or more records.
  - **Complex messages become entries** (2026-11-21, 14-074): a reading over a schema limit is cut, never thrown away (`classify-intake.ts` `parseLeniently`), and every empty reading carries its true reason (`model_unavailable`, `output_rejected`, `unreadable`). A dated table with a column per class (`schedule`) becomes each child's exam: the column from the class on the child's school record (`homebrain/school/timetable.ts`), written through `school/exams.ts`, one `homesend_changes` row (`school_exam`) per child, Checking from a photo, undone with the item (`timetable-apply.ts`); a class not on record is asked once (`homesend_class`) and saved. A document's several dated things are added at once (`home-send-plan-writer.ts` `applyPlanAtOnce`), bills excepted. Replies say what it was, what was done for whom, and where to see or undo it; no reply says "waiting in HomeSend for you to check" (`homesend/replies.test.ts`). Regression set: `evaluation/homesend-documents/`.
  - **The assistant never quietly runs without its model** (2026-11-21, 14-073, `homesend/model-unavailable.ts`): something sent while the provider refuses the key or can't be reached is kept as failed `model_unavailable`, not "unknown content"; the sender hears "I've kept it. I can't read it right now, and I'll read it as soon as I can and tell you what I did."; no deadline or Needs-you question starts and the tidy keeps it; the classify retry job (dedupe per item, backoff capped hourly, 340 attempts) reads it the way it was sent, and only a drain with `afterModelRead` (the delivery clock) reads it, so the record-first add and the one message to its sender (WhatsApp, `tellSenderAfterModelRead`) always follow. The clock's sweep (`queueModelReads`, in `clock.homesend-deadlines`) queues each such item, gives the last 14 days' rules-only readings the same retry, and after 14 days lets one go the ordinary way. A refused key is not sent again for a minute on a server (`key-alerts.ts` `keyRefusedRecently`). Every model call resolves WonderHome's key through `currentPlatformKey()`; the GitHub runner loads the saved settings first (`scripts/jobs.mjs`).
  - Failed items are kept under "Failed safely", never dropped. Every routed item can be undone through `homesend/changes.ts`, never a raw delete.
  - What waits (`homesend/waiting.ts`, the owner 2026-11-03; since 2026-11-14 "Nothing waits" above ends every waiting item within a day, and the HomeSend page no longer lists them): each waiting row says why in words from evidence (`whyItWaits`, never a model). Several can be added with one yes only when each needs nothing more (`bulkReady`), each through the single confirm's write, Undo and audit; a photo or file, a possible duplicate, a missing detail, a plan, a receipt, and a bill or health document the Admin hasn't let in directly always open on their own. After 30 days untouched on the household's calendar a waiting or failed item is archived — kept, restorable, never deleted here (purge is 15-013). "Try again" re-reads a failed link, voice note or file through `rereadFailedItem` on the job queue, five tries. The daily tidy (`homebrain/intake/tidy.ts`, `tidy-run.ts`, story 14-063, the owner 2026-11-03) runs once a day per household from 04:00 on its own calendar, on the delivery clock (claimed per day in `homesend_tidy_runs`; `/api/v1/platform/homesend-tidy` runs it on demand): a waiting, failed or ended-Checking item that no longer applies is archived with an `archive_reason` — its day passed with a day's grace, already on record (`reconcile.ts` duplicate), superseded by a newer item from the same sender about the same thing, or unreadable after the retry cap. Bills, receipts and health documents go only when past AND on record. The model (`tidy-model.ts`, through `provider-clients.ts`, the household's key and data-use policy) is asked only where the rules cannot tell, gives a verdict from a fixed list citing the item's own fields, and the verdict counts only after `checkVerdict` (with `homebrain/validate.ts`) finds the cited fields shown, a claimed date written there and past, a named newer item one it was shown; anything else keeps the item. Each archive is a compare-and-swap on `updated_at`, audited `homesend.auto_archived` (reason, rule or ai), restorable; "Tidy up items that no longer apply" (Settings → AI Assistant, default on, Admin) turns it off. Eval HS-39–47.
- **HomePlaces** (`packages/core/src/homeplaces/`, intent `find_places`) is a read, never a write. Where and when come from the record; assumptions are said back. Never store a placeholder name.
- **Voice channels are doors into HomeTalk, never second brains.** Every channel asks through `hometalk/gateway.ts`; `completed` is only the executor's own record. What each channel may do is `voicelink/capabilities.ts`. A new voice capability is an allowlisted tool mapped to a HomeTalk utterance, never a tool that reaches a table. Paying and ordering are never by voice. A WhatsApp voice note is written down first and read like a typed message: a surely heard question, request or answer goes to HomeTalk as speech and is never a HomeSend item; an unsure one is checked in HomeSend (`whatsapp/intake.ts`). Spoken replies pass through `conversation/speech.ts` `speakable`.
- **Agents** run a governed pipeline: `ai/gather-assessments.ts` → `ai/specialists.ts` `coordinate()` → `ai/orchestrator.ts` → `ai/tools.ts` `authorizeToolCall()` (scope → entitlement → permission → autonomy) → `ai/executors.ts`. Autonomy has two modes, prepare (wait for a person) and execute, and reads "prepare" on any error. AI agents use governed tools and never mutate Supabase directly.
- **One evaluation** (`npm run eval`, `packages/core/src/evaluation/`) runs golden cases A–E, all synthetic. Release gates block CI; Unsafe Action Rate must stay zero. When a case catches a defect, fix the product, never the expectation. An `includes` entry may list one fact's wordings, never a different fact. Add a case whenever an understanding, reconciliation or answer rule changes. Corrections are evidence (`evaluation/evidence.ts` → `ai_corrections`). Approvals bind to the exact proposal (`conversation/approval.ts`); a stale or changed approval is refused.
- **Production hardening**
  - Rate limits go through `security/rate-limit.ts` `hitRateLimit`. They fail open and say the pause is temporary.
  - Plan burst and fair-use numbers are plan data read only by `billing/repository.ts` `consume`. A domain module never hard-codes a number.
  - Gate a feature only on the entitlement service. Experiments apply inside `loadSubscription`.
  - Model clients come only from `ai/provider-clients.ts` (timeout, one retry). Never construct an SDK client elsewhere.
  - A cron route exports `GET` as well as `POST` (Vercel Cron sends GET).
  - An idempotency key is reserved while in flight, so a double tap is refused. A household runs one agent pass at a time.
  - Failed classifications are retried through `jobs` (`homesend/retry-queue.ts`), dead after five tries.


## Where the code lives: HomeBrain thinks, HomeSend moves (owner, 2026-11-22)

The owner's rule: "HomeBrain is supposed to have the intelligence related algorithms, homesend is supposed to have the data transfer related features."

- **HomeBrain** (`packages/core/src/homebrain/`) holds everything that understands, decides, matches, learns, scores or judges what arrives: `intake/` (the model readers, the understanding, the decision and its validation, the capability registry, completeness, confirmation and the Admin's bar, the checking questions, matching a bill or payment on file, who a health document is for, injection judgement, the tidy rules and the tidy judge), `learning/` (decision memory, learned rules, learned subjects) and `school/` (exam matching, timetable and syllabus understanding).
- **HomeSend** (`packages/core/src/homesend/`) moves data in and out: the channels (email webhook, WhatsApp, share target, uploads, links), `ingest.ts` orchestration, storage, malware scan, content hash, the retry queue and jobs, deadlines as timers, sender trust as access control, replies and the governed writes.
- HomeSend reaches HomeBrain only through `homebrain/intake-api.ts`. `homebrain/intake-boundary.test.ts` fails if a HomeSend file loads a model client, embeddings or a model reader, or imports any other HomeBrain module; and if a HomeBrain file calls a HomeSend channel. X-003 (`evaluation/test-spec.test.ts`) checks `homebrain/intake/`, `learning/` and `school/` as well as `homesend/`, so moved code still touches no table but HomeSend's own.

## The agent platform: HomeTalk, HomeBrain, HomeSend
WonderHome's AI layer is one pipeline with three named, real surfaces —
"real" meaning each one is wired end to end, not illustrative:

- **HomeTalk** (`/ai`, `packages/core/src/components/ui/talk-composer.tsx`)
  is where a household talks or types to WonderHome — the one door (rule
  13). Every turn goes through the same conversation engine
  (`conversation/engine.ts`) whether spoken or typed. Since HomeTalk 2.0
  (spec `design/HOMETALK-2.0-WAVE-4.md`) every action intent is grounded
  before a proposal exists (`conversation/grounding.ts`): a person
  mention becomes a member id through the Wave 1 resolver, a date phrase
  becomes a local day through `conversation/temporal.ts` (the model names
  the phrase, deterministic code decides the day, in the household's
  timezone), and "that/it/them/the other one" resolves through
  `conversation/references.ts` in the spec's order — pending question,
  pending proposal, recent conversation and recent HomeSend by recency.
  Anything still uncertain becomes one focused question, never a guess;
  each turn persists what it was about (its focus) for the next turn's
  "that". A correction ("not milk, almond milk", "no, I meant Manan",
  "actually, make that Friday" — `conversation/corrections.ts`) replaces a
  proposal still waiting for a yes, or undoes an executed write through
  its own domain service before making the corrected one — both kept on
  the record, never a silent overwrite. A sentence with several requests
  is split (`conversation/decompose.ts`) and each part runs through the
  same engine on its own; a part that leans on an earlier one ("remind me
  to buy *them*") only goes ahead when that earlier part actually
  happened. Every utterance is first cleaned into one canonical sentence
  (`conversation/normalise.ts`: spoken lead-ins, wrappers, repeats, "I am
  planning X" as "plan X"); the rules, retrieval and the model read that, and
  the person's own words are what is recorded. A clear request is its own
  consent (HomeBrain 4.0 §3.9, `conversation/consent.ts`): an adult's
  everyday, undoable change — the list, a reminder, a plan, a meal, being
  away, what is at home — is done at once and the reply says "Say undo to
  take it back" (`undoExecuted`, the same service a correction uses). A
  change that touches someone else (guests, another person's duty or day, a
  name resolved at medium confidence) is asked once in the conversation, and
  paying and ordering always wait for a tap on screen. A child's or helper's
  request, and anything an agent does on its own, still follows autonomy. An
  Admin's "Ask before acting on what I say" (`policies`, `ai_autonomy`,
  `conversation/consent-repository.ts`) makes every act a question first.
  A reminder is a real notification to the speaker alone, held
  until its `scheduled_for`; the inbox and badge only ever show what is
  due. An add where nothing was new shows "Nothing to change", never
  "Done". The understanding model is given the moment as facts — role,
  local date and time, what is waiting, what the conversation is about,
  all minimised like the utterance (`ai/model-client.ts`'s `systemFor`) —
  and returns named, nullable parameters with no id field of any kind;
  `withoutServerOnly` strips anything that is the server's to decide (ids,
  grounded dates, a correction's undo record) from whatever a model
  sends. A person resolved at medium confidence is named back ("I think
  you mean Manan…"); two equally likely ones are one question. Every
  §21 example and the §22 matrix are covered deterministically in
  `conversation/evaluation.test.ts` — extend it, never loosen it, when an
  understanding changes. A person who uses another language (story
  22-005) is read into the same language-neutral intent (`languageLine` in
  `systemFor`). Their reply is composed and validated in English and put
  into their language only through `conversation/reply-language.ts`:
  - names, items, dates, times, amounts, numbers and links are tokens the
    translator never sees;
  - a translation that drops, repeats or invents one is refused;
  - a reply carrying a content class the household has not agreed may
    reach its provider (`REPLY_CLASSES`, the answer's facts) stays in
    English, with a line saying why.

  The English is always the record. A new action gets a `REPLY_CLASSES`
  entry.
- **HomeBrain** (`conversation/brain.ts`, `ai/model-client.ts`'s
  `understand`/answer-composition seam) is the reasoning behind a reply: a
  real model call, gated by the same consent/minimisation/entitlement
  checks a fixture-resolved intent already passed through, never trusted
  with a decision — every downstream authorization gate runs on its output
  exactly as it runs on a deterministic one. Since HomeBrain 2.0
  (`packages/core/src/homebrain/`, spec `design/HOMEBRAIN-2.0-WAVE-2.md`)
  a model only ever sees `GroundedFact`s (opaque `F`-ids, cited back in
  `usedFacts`), and no model answer reaches a person unvalidated:
  `homebrain/validate.ts` refuses unsupported names, dates, amounts,
  events, health claims, integration claims and "I've done it" claims,
  then `homebrain/answer.ts` regenerates once with tighter context, then
  answers deterministically from the same facts, then says honestly that
  nothing is on record. "Why?" questions are answered from recorded
  evidence in `homebrain/why.ts`, never by a model. Add to the validator
  when a new kind of invention shows up; never route an answer around it.
  Since HomeBrain 3.0 phase A (spec `design/HOMEBRAIN-3.0-HOUSEHOLD-CONTEXT.md`,
  story 14-020) the household's context is kept whole in one server-only
  row (`household_context`, deny-all RLS, `homebrain/context-store.ts`):
  every record, no horizon and no per-list cap, event guests, every memory,
  food preferences and places. A domain write sets `stale_since` and rebuilds
  it after the response; a turn reads the row plus the viewer's own live
  reads and holds it to the same domain gates and `filterForViewer`. Never
  read the row from a session, and never let a turn answer from a row older
  than the last write. Without the table, reads fall back to the live path.
  Since the record index Phase 2 (story 14-037, `knowledge/facts.ts`), the
  registry's tables in stored domains are not in that row: each record is a
  fact in `household_facts` (deny-all), written after the response from
  `knowledge_outbox`, which the `wh.queue_knowledge` trigger fills. A turn
  drains its own household's queue (at most 100 records) while the row is
  read, then reads the facts in place of the row's own read of those tables.
  A new registered table needs the queue trigger; `lint:knowledge` fails
  without it.
  Since HomeBrain 4.0 (spec `design/HOMEBRAIN-4.0-DEEP-HOUSEHOLD-INTELLIGENCE.md`):
  - **Look deeper.** Before "not on record", a turn reads the question's
    domains again, live, through the viewer's own session
    (`homebrain/deep-read.ts`, at most 3 domains and 1.5 s). A find marks the
    store stale; each look leaves one content-free `homebrain_misses` row. A
    database trigger marks the store stale for any write that went round a
    service, and the delivery clock keeps stores warm (`keepStoresWarm`).
  - **Follow links.** `homebrain/graph.ts` links the viewer's own items
    (person, same day, a meal's needs, a duty's owners, a HomeSend source);
    retrieval follows them at a score below what a rules answer uses.
  - **Inferences are rules.** `homebrain/insights.ts` draws each one from
    records, sent with its evidence. A model's own "because" is refused
    (`unsupported_inference`) unless it cites one. A new rule is a function
    with a golden test.
  - **The goal shapes the answer** (`homebrain/goal.ts`): what decides comes
    first for "should we…?", the fact first for "when is…?".
  Since HomeBrain Sleep (5.0, story 14-032, `packages/core/src/homebrain/sleep/`)
  HomeBrain tidies what it remembers each night, as a brain does in sleep:
  - **The night.** Between 2 and 5 am on each household's clock, once per local
    day (`homebrain_runs`), on the delivery tick after its response
    (`sleepDueHouseholds`). `planSleep` (pure) lets go of empty notes, tags
    salience, expires what is past, reads notes into person–stance–thing,
    merges the same thing, splits a sentence about several people, files a note
    under its person, and rests what has gone 90 days unused. A rested note
    wakes when it is used again. Salience 3 (health, allergy, safety) never
    rests or expires on its own.
  - **Only contradictions reach a person.** The same thing liked and disliked
    goes to Needs review. Everything else applies automatically and is listed
    under Learned → While you slept, with Undo (`undo.ts`, from the `detail`
    each `homebrain_consolidations` row keeps). Never hard-delete a memory: a
    merge or split supersedes it.
  - **A model judges; rules decide.** Merging by meaning happens by rule only
    when two notes are near-identical (0.985). Anything close goes to the model
    (`sleep-model.ts`), which also reads sentences the rules cannot and
    proposes links. A reading is kept only when it names a person it was shown
    and uses the sentence's own words. A link is kept only when it joins two
    records the model was shown.
  - **Meaning.** `homebrain_embeddings` uses pgvector, 768 dimensions, compared
    exactly per household (`match_homebrain_embeddings`, service role). Each
    record is embedded with the household's Google or OpenAI key, else its
    Gemini key, else the platform key (saved in Platform admin only;
    `docs/external-providers.md` "one place"). Only classes the data-use policy
    allows are embedded, and every family name becomes "someone" before
    anything is sent. On a turn, meaning starts alongside the read and gets
    900 ms (`recall.ts`), then the turn answers by words.
  - **Links and profiles.** Links (`homebrain_links`) ride on the store's items
    as `attributes.associations`. The graph follows one only when both ends
    are in the viewer's list. A person at a glance (`profiles.ts`) is built on
    the turn from the viewer's own items, never health or money, and leads
    "What do you know about X?". The memories an answer used are counted after
    the response (`homebrain_recalled`), apart from `memories`, so a turn never
    marks the store stale.
  - **Household understanding** counts the household's own records per
    category (`withRecords`), not only what HomeTalk was told.
  The household record index (spec `design/HOUSEHOLD-RECORD-INDEX.md`, story
  14-036) makes every saved record knowledge by default:
  - **One registry.** `knowledge/registry.ts` names every table with a
    `household_id` once. It is `builder` (a hand-written builder reads it,
    naming its `ContextRecords` list), `registry` (the generic describer in
    `knowledge/describe.ts` reads it and says every field) or `excluded` (with
    the reason). A new table goes in the same pull request that creates it.
  - **CI enforces it.** `npm run lint:knowledge` fails on an unnamed table, a
    stale entry, or a table read as knowledge without the
    `wh.mark_context_stale` trigger.
  - **It tests itself.** Each `registry` entry's `example` row is run through
    the describer by `knowledge/registry.test.ts`, with no case to write.
  HomeBrain reads everything the Calendar shows (26-020):
  - **One map.** `CALENDAR_SOURCE_RECORDS` (`context/builders.ts`) names the
    HomeBrain records behind every calendar source. A new source does not
    compile until it is mapped and read.
  - **Every table it reads marks it stale.** A table HomeBrain reads gets the
    `wh.mark_context_stale` trigger in the same migration that adds the read.
  - **A day or a week comes from the Calendar.** "What's on tomorrow?" is
    answered by rules from `calendarRange`, as the screen reads it
    (`scheduleReply`).
- **HomeSend** (`packages/core/src/homesend/`, `ai/classify-intake.ts`,
  the composer's paperclip button, and its own screen at `/home-send` —
  a drop zone plus an inbox of what is waiting on a confirm) is the
  inbound intake channel: a photo, a PDF, a text file, a voice note, a
  shared link, a pasted forward or a forwarded email, classified and
  routed into a real domain table only once a person confirms it. Since
  HomeSend 2.0 (spec `design/HOMESEND-2.0-WAVE-3.md`) every one of those
  goes through one pipeline, `homesend/ingest.ts` (secure intake →
  normalize → understand), and ends in the same canonical
  `IntakeUnderstanding` (`homebrain/intake/understanding.ts`) — a new input type
  is a new `ingest*` entry point into that pipeline, never a second one.
  Nothing is added on its own (a household's "execute" setting; never a
  bill, health document or receipt) unless HomeSend is more sure than the household's bar
  (`homebrain/intake/verify.ts`, the owner 2026-10-25; the bar is 95% unless an
  Admin picks another, `homebrain/intake/auto-add.ts`, the owner 2026-10-26). A model's own "high" counts
  as 0.9. A reading earns 0.97 only when its kind has what that kind needs
  and its name, amount, date, payee and shop are all found in the text that
  was sent; the review says which detail it could not check. A photo or a
  file has no text to check against, so it always waits for a person, and a
  voice note is never surer than its transcript.
  Being *told* in HomeTalk about a new dated thing ("Asmi's karate grading
  is on Sunday 1 November at 9.30 am") is the `file_with_homesend` action
  (the owner, 2026-10-25: a model had read it as a move). The executor hands
  the person's own words to `ingestText`, the same entry point the paperclip
  uses, so it is read, checked and reviewed exactly like anything sent, and
  nothing reaches a domain table from HomeTalk. It needs no target and no
  grounding of its own: HomeSend resolves the names and decides the day.
  A file's type is decided from its bytes (`normalize.ts`), a link is only
  ever fetched through `link-fetch.ts` (public addresses only, DNS checked
  and pinned, every redirect re-checked), a voice transcript below the
  floor (0.75) is read on and anything it adds is always Checking, never
  confirmed on its own (`UNSURE_TRANSCRIPT` in `verify.ts`, the owner
  2026-11-20); only one with paying or buying words keeps the higher floor
  (0.9) and is shown and confirmed, never acted on (`audio.ts`; with no Cloud Speech key,
  a voice note is written down by the household's Gemini key where its
  data-use agreement allows Google), and all of it is
  untrusted content: `injection.ts` fences it for the model and flags
  instructions aimed at WonderHome, which are ignored and said so.
  Whatever cannot go on is kept and shown under "Failed safely", never
  dropped. Names are resolved through the same Wave 1 resolver HomeBrain
  uses (`homebrain/intake/resolve.ts` — one question when two people fit, never a
  guess; a school notice naming a child not on record is never assumed to
  be the household's only child, and an Admin can add them right in the
  review, story 08-009), and every candidate is reconciled against what is already on
  record (`homebrain/intake/reconcile.ts`): a duplicate is shown, a moved date or a
  cancellation is offered as an update to the existing record, never a
  second copy. Since Deep Document Understanding 2.0 (spec
  `design/HOMESEND-DEEP-DOCUMENT-UNDERSTANDING-2.0.md`) the whole document
  is read into every record it proposes (`homebrain/intake/document.ts`: each
  event, each date of a series, each fee, each thing to buy, with page and
  quote as evidence, and the pages actually read), and `homebrain/intake/plan.ts`
  reconciles each record on its own into one outcome — create, field-level
  update, cancel, no change, conflict (a record changed after the document
  was written stands) or one question — never a guess and never a second
  copy. A new rule for a document is a plan rule with a golden test in
  `plan.test.ts`, not a special case in a screen. A document with two or
  more records is reviewed as that plan (`_components/home-send-plan.tsx`)
  and never applies on its own. The browser sends only choices (include,
  edit, who it is for); `applyDocumentPlanAction` rebuilds the plan on the
  server and writes each record through its domain service, via the
  server-only `home-send-writes.ts`. Each change is recorded with its plan
  key, field-level before/after and evidence, and the exact plan and
  receipt are kept on the item (`homesend/apply.ts`: created, updated,
  cancelled, unchanged, skipped, needs clarification, failed). A partial
  result is never reported as done, and "Undo all" reverses a whole
  document. HomeTalk's paperclip is the same sheet and pipeline. Once a
  plan is applied there, HomeTalk posts what it did from the stored receipt
  (`homesend/talk.ts`). "What did the school notice change?" is answered by
  rules from the receipt and the change rows, never from what a model read,
  and an undone change is said to be undone. How an item is confirmed is `homebrain/intake/confirmation.ts`
  (§12): a clear, new grocery or school item a member sent may apply on its
  own only where the household set that outcome's autonomy to "execute";
  bills, health documents and receipts wait for a person, whatever the
  confidence, unless an Admin turned on that area's "add directly" setting
  (the owner, 2026-10-26), when they take the same path under
  `finance.bills_paid`, `finance.budget_reviewed` or `health.records_kept`. A class outside school is its own kind, never school work
  (`activity_item`, story 08-027): a karate exam or a dance show is filed under
  the child's class of that name in Kids & School (the class is added in the
  same step when the child has none, and undone with it), and an event or
  invitation (`event`) goes on the family calendar through `addFamilyEvent`.
  A paid receipt is its own kind, never a bill: each line
  a person keeps becomes a `consumable_purchases` row (`commerce/receipts.ts`
  matches a line to a tracked item only when plain, never guesses) and
  undoes on its own. What each review decided is kept in closed words on the item
  and counted by `homesend/metrics.ts` (§19) — outcomes, not parse counts. Every routed item can be undone
  (`homesend/changes.ts`), the same domain service a manual remove would
  use, never a raw delete. A real Resend inbound-email webhook
  (`POST /api/v1/homesend/email/webhook`, `homesend/email-gateway.ts`)
  exists behind the same provider-neutral gate the AI/voice keys use —
  code-complete, Svix-signature-verified, unit- and DB-tested — but
  genuinely inert until a deployment sets `RESEND_API_KEY` and
  `RESEND_WEBHOOK_SECRET` for a real account with a verified receiving
  domain, which no session has configured (a human's DNS/domain errand,
  not a credential to invent). Its address-management screen
  (`home-send-channels.tsx`) is real: every member can read and copy the
  household's address, only an admin can set it up, rotate or turn it
  off — real forwarding still waits on that same human errand, but
  nothing about the UI or the backend behind it does. WhatsApp is also
  an intake (stories 14-015/14-016, `packages/core/src/whatsapp/`; see
  the WhatsApp section under External providers). The classifier can
  also propose one secondary, different-domain write alongside an
  intake's primary one (a bill or school notice that also implies a
  grocery need) — always a grocery suggestion, never written until the
  household confirms it separately, tracked as its own
  `homesend_changes` row so it can be undone independently of the
  primary. Installed as a PWA, WonderHome is a real Web Share Target
  (`manifest.webmanifest`'s `share_target`, `POST /api/v1/intake/share`):
  the OS share sheet lands there whether or not the person has signed in
  on that device yet — signed in, the content is classified and saved
  immediately; signed out, it is staged (`homesend_share_handoffs`,
  RLS-unreachable from any session, an unguessable single-use token is
  its only credential) and resumed the moment sign-in resolves a
  household. That signed-out branch is rate-limited by IP hash
  (`homesend/rate-limit.ts`'s `mayCreateShareHandoff`/`hashClientIp` —
  never the raw address, only its sha256, counted via
  `homesend_share_handoffs.ip_hash`); an unidentifiable caller is let
  through rather than blocked, since this is a throttle against abuse, not
  an authorization gate. Every upload path also runs a malware-scanning
  seam (`homesend/malware-scan.ts`'s `scanForMalware`, wired in through
  `security.ts`'s `assessUploadSecurity`) alongside the existing
  magic-byte check — provider-neutral and genuinely inert until a
  deployment sets `WONDERHOME_MALWARE_SCAN_ENDPOINT`, or
  `WONDERHOME_MALWARE_SCAN_PROVIDER=cloudmersive` (the owner's pick,
  2026-10-21) together with `WONDERHOME_MALWARE_SCAN_KEY` — same discipline
  as every other integration point here. The classifier's structured output
  runs through a deterministic backstop (`classify-intake.ts`'s
  `sanitizeIntakeExtraction`) that nulls out any field a hallucinating
  model set outside its own claimed kind — never trusted to classify,
  only to enforce the invariants the system prompt only asks for —
  covered by golden scenarios in `classify-intake-evaluations.ts`, the
  same "policy decides, the model only proposes" pattern `evaluations.ts`
  already documents. `homesend_share_handoffs` past its 30-minute window
  is swept both opportunistically on every share request and for real by
  `/platform/retention`.

- **HomePlaces** (`packages/core/src/homeplaces/`, intent `find_places`)
  answers location questions: "somewhere for dinner tonight", "where can
  we hang out near Anya's school after school?". It is a read, never a
  write:
  - **Rules read the request.** `request.ts` reads the request (eat or go
    out, near home or a child's school, now, a meal time or after school).
    A model only ever says that a sentence is a place question.
  - **Where comes from the record.** `service.ts` takes the anchor from
    the saved home address or the child's picked school, never a guess.
    Two children at two schools and no name gets one question.
  - **Places are checked and ranked.** Google's text search
    (`places/google.ts`'s `findNearby`, behind the same
    `GOOGLE_MAPS_API_KEY`) supplies the places. Each one is checked
    against its weekly hours for the whole window (`isOpenFor`), then
    ranked by rating, distance and the family's own place book.
  - **When comes from the record too.** "After school" starts when that
    child's school day ends (`school_enrolments.ends_at`), "after work" when
    the speaker's office hours end (`household_members.work_ends_at`); both
    are read through `household/day-hours.ts`.
  - **Assumptions are said back.** With no hours on record, school is taken
    to end at 3:30 pm and work at 6 pm, and the reply says so and where to
    set them.
  - **The place book has a screen.** `/places` (under More) lists saved and
    turned-down places; an adult keeps a note, removes one, or lets a
    turned-down place be suggested again (`app/places/actions.ts`).
  - **The reply is deterministic** (`answer.ts`). The places travel as
    cards (`apps/web/app/ai/place-cards.tsx`, kept in the message's
    metadata).
  - **The family is the only teacher.** Save and "not for us" go to
    `household_places` through `apps/web/app/ai/place-actions.ts`. That
    action re-reads the place from the stored reply, never from the
    browser. Every member reads the book; adults and Admins write it.
    Saved places rank first, and turned-down places never return.
  - **Searches are budgeted.** `places.find` limits each household to 30
    searches an hour. Alexa leaves place questions to the app; Gemini Live
    inside the app answers them where location may reach Google
    (`channelAllowsAction`, `inApp` limits).
  - **Getaways.** "A two-day vacation plan" is a getaway (`purpose:
    "getaway"`): tourist attractions within a few hours' drive of home,
    kept to that area rather than only biased to it, day-trip distances left
    out, no opening hours checked.

  A model's reading names people by placeholder ("Child A"), and the letters
  move when a member is added, so `restoreParameterNames` puts real names back
  into every string before anything is kept, and the intent keeps the
  member's own words as its `utterance` (`reidentifyIntent`, I-26). Never store a placeholder.
  "Who is in the family" is answered from the whole member list by rules
  (`conversation/roster.ts`), never from what a model was shown.

  Spoken replies go through `conversation/speech.ts`'s `speakable`. It
  drops arrows, links, list markers and symbols for words a person would
  say. Every voice path speaks through it, never the raw reply.

**Voice channels are doors into HomeTalk, never second brains**
(`design/voice-integration/`). Every channel — the app, Gemini Voice,
Alexa, WhatsApp — asks through one gateway (`hometalk/gateway.ts`, the canonical
`hometalk/contract.ts`): an adapter proves who is speaking and renders the
answer, and `completed` is only ever the executor's own record. An external
assistant is linked to one member (`voicelink/`: OAuth with S256 PKCE,
hashed tokens, scopes that only narrow, payments and orders never by
voice) and its turns run under that member's own RLS session. Gemini Voice
(`voicelink/gemini-live.ts`) holds only a single-use Live token locked to
WonderHome's instructions and a fixed allowlist of tools; each tool call is
turned into words a member could have said and answered by the gateway on
channel `gemini_voice`, narrowed to the content classes the household lets
reach a model provider (Gemini hears every answer). A new voice capability
is a new allowlisted tool that maps to a HomeTalk utterance — never a tool
that reaches a table. Alexa (`/api/v1/voice/alexa`) is verified as Amazon
documents and stays inert until a person creates the skill and sets
`ALEXA_*`; Gemini Live runs only on a Google key and only where the household's
data-use agreement allows it, re-checked on every tool call. That key is the
household's own Gemini voice key (`household_gemini_voice_credentials`,
voice, and HomeBrain's embeddings when the assistant key cannot make them) if one is set, otherwise the assistant's key when that is
Google's, so an assistant on Anthropic can still talk through Gemini. No key
table ever lets a session read `api_key` back. Each one grants SELECT on
every column except the key, so key writes are an insert, then an update by
household (`ai/key-row.ts`), never an upsert. Gemini Voice runs only inside HomeTalk's own screen, so a capability may
be `in_app` for it: the same as typing it there (plans, what is at home, who
does what), while Alexa keeps `app_only`. Paying and ordering are never by
voice. What each
channel may do is `voicelink/capabilities.ts` — every HomeTalk action is
placed in it exactly once and its tests hold each cell to the real gates, so
a new action forces a decision about voice. A conversation belongs to its
surface (`conversation_sessions.surface`): what the app is waiting on is
never answered by Alexa. Every turn leaves one content-free row in
`hometalk_channel_events`, and `npm run eval`'s blocking `voice` gate checks
that every Gemini tool sentence is read by the rules as the action it
promised — extend `voicelink/readiness.ts` when a tool changes. **Which
engine runs a live conversation — WonderHome's own loop or Gemini Live — is
one per-member value with one write path** (2026-10-29,
`docs/progress/2026-10-29-live-engine-single-source.md`): the member's own
choice on `household_members.live_engine`, falling back to the household
default `household_voice_settings.live_engine`, resolved everywhere through
`voice/live-engine.ts`. The HomeTalk composer picker and Settings → Voice
both read the effective value and both write the member's own through
`saveMemberLiveEngine`, so the two surfaces never disagree (rules 23 and 14);
`localStorage` is only a cache that reconciles to the server on load. A
member flipping it in the composer never changes anyone else's, and
availability is still re-checked when the Live token is minted.

**One evaluation across all three** (Wave 5, spec
`design/AI-EVALUATION-WAVE-5.md`, `packages/core/src/evaluation/`):
`npm run eval` runs the golden cases through the real HomeTalk, HomeSend
and HomeBrain pipelines against synthetic golden households A–E, never
production data. Every stage a case states is compared, and each mismatch
gets a §10 error type. Metrics are counts out of counts, and every run
records its prompt, context and dataset versions. The blocking release
gates fail CI, and an Unsafe Action Rate above zero is one of them.
The `understanding` gate blocks a release unless HomeSend gets more than
95% of its cases right end to end and more than 95% in the right category
(the owner, 2026-10-25); only a provider run measures the model's own reading.
`--provider configured` runs the same cases through the configured model,
and `--write` records the release artifact in `docs/ai-releases/`. When the
golden set catches a defect, fix the product. Never loosen an expectation
to pass. A case checks what an answer says, not its wording (the owner,
2026-10-21): an `includes` entry may list one fact's wordings ("2026-11-28"
or "28 Nov 2026"), never a different fact. Add a case whenever an understanding, a reconciliation or an
answer rule changes.
A person's correction is evidence, not just a fix:
`evaluation/evidence.ts` writes one row per corrected field into the
append-only `ai_corrections` (HomeTalk "no, I meant…", HomeSend review
edits, HomeBrain Review corrections). A HomeTalk approval binds to the
exact proposal through `conversation/approval.ts`: a fingerprint of the
action, its target and every parameter. A stale, changed or timed-out
approval is refused and closed, never carried out. Production quality
(§23) is counted from closed words only, in `evaluation/production.ts`.
Production hardening (Wave 5 §14–§17):
- **Rate limits.** Every rate limit goes through `security/rate-limit.ts`'s
  `hitRateLimit`, which reaches the service-role-only
  `public.rate_limit_hit` (fixed, clock-aligned windows), or
  `public.rate_limit_hit_rolling` for a bucket marked `rolling` — one whose
  promise is "one per minute" and must hold across a minute boundary
  (HomeSend's "Add all anyway"). It fails open, because it throttles abuse and is
  not an authorization gate. Its refusal says the pause is temporary and
  that nothing was lost.
- **Plan policies.** A burst limit and a fair-use level are plan data on
  `plan_features` (story 20-007), read only by `billing/repository.ts`'s
  `consume`. A burst refuses for its fixed window, and the refusal says so.
  Past a fair-use level nothing is refused: the household is served more
  simply, and HomeTalk answers from the rules with a disclosure. Staff
  change them through `PATCH /platform-admin/plans/{planKey}/policies`, and
  every change is kept in `plan_policy_events`. A domain module never
  hard-codes a number of its own.
- **Entitlement experiments.** An experiment changes one plan feature for
  a stable, hashed share of the households on the plans it names (story
  20-008, `billing/experiments.ts`). It is applied inside `loadSubscription`,
  so `may`, `consume` and every screen give the same answer, and a direct
  API call gets the same answer too. Its terms are frozen once it is
  running, and the database enforces that. Settings tells a household when
  a feature is part of a trial. Never gate a feature on anything but the
  entitlement service.
- **Timeouts.** Every model client comes from `ai/provider-clients.ts`, with
  a timeout and a single retry. Never construct an SDK client elsewhere.
- **Forwarded email.** Each delivery leaves closed-word events in
  `homesend_email_events` (`homesend/email-monitoring.ts`), and the §14
  alert thresholds are evaluated over the last hour.
- **Failed classifications.** A failed classification is kept and retried
  through `jobs` (`homesend/retry-queue.ts`, one waiting job per item,
  dead after five tries).
- **Cron.** A cron route exports `GET` as well as `POST`, because Vercel
  Cron sends GET.
- **Duplicate requests.** An idempotency key is reserved while its request
  is in flight, so a double tap is refused rather than run twice. A
  household runs one agent pass at a time.

Underneath HomeTalk and HomeBrain, a real governed multi-agent pipeline
runs the household's actual domains: `ai/gather-assessments.ts` merges
every domain's `*Agenda()` read into one `HomeAssessment[]`,
`ai/specialists.ts`'s `coordinate()` turns that into `PlannedStep`s,
`ai/orchestrator.ts`'s `executeStep()`/`advance()` run each step through
`ai/tools.ts`'s `authorizeToolCall()` (scope → entitlement → permission →
autonomy, in that order) and `household/autonomy.ts`'s per-outcome
autonomy setting — read by `household/autonomy-lookup.ts` through the
server-only `public.autonomy_for` wrapper, and "prepare" (wait for a person) on any error,
timeout or unknown value, never a default of "execute" (PostgREST only
resolves RPCs in `public`, so a `wh.*` function the app calls by RPC
needs a narrow, explicitly granted wrapper, never an exposed `wh`) —
`ai/executors.ts` performs the write for a step that is
actually authorized to execute, and `ai/run.ts`'s `runHouseholdAgents()`
ties a run together — triggered today from HomeTalk (a "check on things"
utterance) or `POST /households/{householdId}/agents/run`, with automatic/
scheduled runs deliberately not wired up yet (`proactive_agents`, still
`false`, is the gate for that). This is the same pipeline the diagram
"Inputs → Intake → Understand → Decide & Plan → Take Action → Outcome"
describes — HomeSend and manual entry are Inputs, HomeBrain is Understand,
`coordinate()` is Decide & Plan, the executors are Take Action.
