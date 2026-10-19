# HomeTalk answers "what does the family like?" from every record; Gemini Live never answers "what do you know" from itself

**Date:** 2026-10-19 · **Asked by:** the owner ("HomeTalk says it doesn't know about food preferences, whereas in the HomeBrain the preferences are present… HomeTalk should have full info of what's in HomeBrain")

## What was wrong

The owner asked, by Gemini Live inside HomeTalk, "Okay, what do you know about the preferences in food and family?" and was told "I don't currently have information in my records regarding the specific food preferences or interests of the family members" — while HomeBrain Review listed fourteen of them ("Asmi likes Indian food", "Manan likes home-cooked food", …).

Traced on the live project:

- **The record was whole.** `memories` held 15 learned preferences for the household, `household_context` was built at 07:31 UTC with all of them (`sections.preferences.count` 15, the document names "pasta"), and `context/repository.ts`'s `listMemories` reads `learned` and `confirmed` rows — "Needs review" on the Review screen is a tab for learned items nobody has confirmed, not a status that hides them.
- **The turn never reached WonderHome.** `hometalk_channel_events` has no `gemini_voice` event for that question and `conversation_messages` has no row for it: the two turns before it (07:53, 07:54 UTC) went through the gateway, this one did not. Gemini read "what do *you* know" as a question about its own memory — which is empty by design — and answered it itself, without calling `ask_household`. The reply in the screenshot is Gemini's wording, not any WonderHome text.
- **Typed, it would have been a home summary.** The rules read "what do you know about the preferences in food and family?" as `ask_status` scope `home` (0.82), and "who likes what?" as `set_preference` — it would have *remembered* "Who likes what" as a fact. Only a question naming one person ("what does Asmi like?") reached `conversation/likes.ts` (04-019).

## What changed

- **A family-wide likes question is read and answered by rules** (`conversation/likes.ts`, `rules.ts`, `_lib/hometalk-turn.ts`). `readLikesQuestion` returns `{ name: null }` for "what does the family / everyone / the kids like (to eat)?", "what are our / everyone's / the family's food preferences?", "what do you know / remember about … preferences?", "who likes what?", "what food preferences do you have on record?", "list everyone's food preferences", and a group word where a name would be. `composeFamilyLikes` answers from every record — what HomeTalk was told (`memories`) and the Meals screen's `food_preferences` — person by person in the household's own order, then the household's own, each unconfirmed line marked "(you told me; not confirmed yet)", a child's line carrying the `child` class and an allergy the `health` class. "What do you know about Asmi's food preferences?" now reads as Asmi's. `likesRecordsFrom` is the one mapping, shared by the route and the evaluation runner.
- **Gemini Live gets a tool for it and is told whose record it is** (`voicelink/gemini-live.ts`). `get_family_preferences` (optional `person`) becomes "What does Asmi like?" / "What does the family like?", read by the rules as `ask_status` scope `likes` — two new goldens in the blocking `voice` gate (`readiness.ts`, now 25/25) and the tool is placed in the `household_questions` capability. The system instruction now says a question about what it knows, remembers or has on record is about WonderHome's record, never its own memory, and that it must never say it has no information about the family.
- **Golden evaluation.** Household A carries two memories and a Meals-screen dislike; HT-112 is the owner's sentence, HT-113 is "Who likes what?" (and its `excludes: ["Remembered"]` holds the set_preference misreading out). `npm run eval` is 130/130.
- **Help.** Talk to WonderHome ¶13 says so in all eight languages; the section's `updated` is 2026-10-19 with new keywords.

## Verified

- `likes.test.ts` 23 (14 family phrasings, the person forms, the family answer's order, empty case and health flag), `voicelink/*` and the conversation suites: 510/510 in the touched set; `npm test` 3575 unit + 64 script tests; typecheck; `npm run lint`; `lint:help-links`, `lint:secrets`, `check:bundle`.
- `npm run eval` 130/130, unsafe actions 0/18, voice gate 25/25 Gemini tool sentences.
- **Browser, 360px, local build against the live project**, QA household "QA Guest Home": "Asha likes Italian food" → Done, remembered; "What do you know about the preferences in food and family?" → "Here's what's on record about what the family likes to eat: **Asha** — Asha likes Italian food (you told me; not confirmed yet)". No page errors.
- A real Gemini Live session was not driven from this container (it needs a microphone and the owner's Google key); the instruction and the tool are what the live path uses, and the tool sentence is held by the voice gate.

## Still open

- Gemini decides when to call a tool. The instruction and the dedicated tool make "what do you know about…" an unmistakable call, but a model that still answers from itself leaves no WonderHome record of the turn — there is nothing server-side to intercept. If the owner sees it again, the next step is a `get_family_preferences`-style tool per question family the model keeps answering itself, named in the instruction the same way.
- "What do you know about Asmi?" with no preference word still goes to HomeBrain over the facts rather than the rules' every-record list.

## Where the code lives

`packages/core/src/conversation/likes.ts` (+ test), `conversation/rules.ts`, `apps/web/app/_lib/hometalk-turn.ts`, `packages/core/src/voicelink/gemini-live.ts` (+ test), `voicelink/readiness.ts`, `voicelink/capabilities.ts`, `packages/core/src/evaluation/{households,runners,cases}.ts`, `packages/core/src/i18n/messages/areas/help/*.ts`, `packages/core/src/help/guide.ts`.

## QA cleanup

Recorded after the merge.
