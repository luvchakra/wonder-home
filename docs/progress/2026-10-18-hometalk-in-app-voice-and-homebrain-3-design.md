# HomeTalk: voice in the app is HomeTalk, getaways and likes answered from the record (04-019, 24-008), and the HomeBrain 3.0 design

**Date:** 2026-10-18 · **Stories:** 04-019 and 24-008 (Done) · **Design:** `design/HOMEBRAIN-3.0-HOUSEHOLD-CONTEXT.md` (awaiting the owner)

## What the owner reported

1. Gemini Live, inside HomeTalk, said "I cannot suggest vacation plans from this voice assistant. You can do that in the WonderHome app." It *is* the WonderHome app.
2. It should be able to suggest a two-day vacation plan.
3. "Upasana likes Italian food" was "Remembered", and minutes later HomeTalk had "no records of Upasana's food preferences".
4. Asmi's birthday event has guests on it; HomeTalk said there were no details or guests. The owner asked for a design: the whole household in HomeTalk's context, fast, answered by a model that correlates it.

## What was built

- **Voice in the app is HomeTalk.** A Gemini Live tool call carries `inApp` channel limits (`voicelink/scopes.ts`: `channelAllowsAction`, `channelRefusal`). Its refusal is "That needs your OK on screen, which I can't give by voice. Type it here in HomeTalk…", never "the WonderHome app". Gemini's instructions say it is HomeTalk's own voice inside WonderHome, and to pass any suggestion question (places, days out, getaways, vacations) to `ask_household` rather than decline. A place question is answered by Gemini Live where the household lets location reach Google (capability `places` is `consent` for Gemini; Alexa stays `app_only`). Spoken approvals keep the strict gate.
- **Getaways** (`homeplaces/request.ts`, `service.ts`, `answer.ts`, `places/google.ts`). "Can you suggest a two-day vacation plan?" is a getaway: tourist attractions within a few hours' drive of home, searched *within* that area (`locationRestriction`, strict `includedType`), day-trip distances left out, no opening hours checked, distance barely counted in the ranking. Tried from Pune: Mahabaleshwar, Louisa Point, Naneghat, the Wai hills. Golden HT-88.
- **Likes from the record** (`conversation/likes.ts`). "What does Upasana like in food?" (either phrasing) is read by rules and answered from every record about her: what HomeTalk was told, with "(you told me; not confirmed yet)" where nobody confirmed it, and the Meals screen's preferences. A statement about two people is said for the one asked. The spoken "no records" answer came from the model's budgeted subset and the agenda fallback — see the design.
- **The design.** `design/HOMEBRAIN-3.0-HOUSEHOLD-CONTEXT.md`: why the three reports are one design limit (a 7-day horizon and per-list caps, event guests never read into context, context rebuilt from ~20 reads per turn with a 45 s in-memory cache, two or three model calls in series); the Household Context Store (one warm row per household, no caps or horizons, rebuilt by jobs on each write); question-sized retrieval with connected records; one-pass answering with a cached prefix and streaming; one answer source; targets (typed p95 2.5 s to first token); four PR-sized phases; the owner's decisions.

## Verified

- Tests: `likes.test.ts` (12), getaway request tests, in-app voice tests; voicelink, homeplaces, conversation and evaluation suites pass (728). Typecheck, lint and help links pass.
- `npm run eval`: 118/118, unsafe 0/17, voice gate 23/23.
- Browser, 360px, QA household with a home address in Pune: the getaway reply listed real destinations as cards; both likes phrasings answered from the remembered fact.

## Needs a person

- The owner's go-ahead on the HomeBrain 3.0 design, and §7's decisions (fact budget, staleness).

## Where the code lives

`packages/core/src/voicelink/{scopes,gemini-live,capabilities}.ts`, `packages/core/src/homeplaces/{request,service,answer}.ts`, `packages/core/src/places/{provider,google}.ts`, `packages/core/src/conversation/{likes,rules}.ts`, `apps/web/app/_lib/hometalk-turn.ts`, `apps/web/app/api/v1/households/[householdId]/voice/gemini/tool/route.ts`. Help: HomeTalk, paragraph 12, in eight languages.

## QA cleanup

Recorded after the merge.
