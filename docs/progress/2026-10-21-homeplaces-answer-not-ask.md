# A place question is answered, never asked twice (24-013)

**Date:** 2026-10-21 · **Backlog:** `backlogs/24-HomePlaces.md` 24-013

## The report

The owner, in HomeTalk:

1. "can we go somewhere out tomorrow" → "Tell me what kind of place you have in mind, like somewhere for dinner tonight or a park near school, and I'll look nearby."
2. "dinner nearby home" → the identical question again.

The live rows (session `adc0430b…`, 12:27 UTC) show both turns as `intent: find_places`, `understanding: model`, `proposal: answer`, and no `clarify` in the metadata. `GOOGLE_MAPS_API_KEY` is set in production, so the place search was live: the question was the reader, not the provider.

## Root causes

- **The model said "place question"; the route asked the rules again.** `findPlaces` in `apps/web/app/_lib/hometalk-turn.ts` called `readPlaceRequest`, which begins with `isPlaceQuestion` (an asking word *and* a kind). "can we go somewhere out" had no asking word it knew ("can we go" was not one) and no kind ("go out" was, "go somewhere out" was not). "dinner nearby home" had a kind but no asking word at all. Both returned null, and null became the fixed "Tell me what kind of place…" line.
- **The question was never a question.** That line was recorded as an `answer` with no `clarify`, so the next turn was read alone, failed the same way and got the same words back. Nothing carried "tomorrow" or "near home" across turns either.
- **"Tomorrow" was not read.** `whenFrom` knew now, meal times, "tonight", after school and after work; any other day was today.

## What changed

- `homeplaces/request.ts`
  - `readPlaceRequest(words, { asked, earlier })`. With `asked` (the turn is already a place question), no asking word is needed, and no kind named is going out (`assumed: "kind"`, query "family outing places").
  - "tomorrow" / "day after tomorrow" set `dayOffset`. A meal keeps its time; anything else is that day's daytime (11 am for three hours out, 1 pm to eat).
  - The short form ("dinner nearby home", "a park near us": six words at most, never a command) is a place question by rules. "nearby" and "near home" are an explicit home anchor.
  - `earlier` is the last reply's reading. What this turn says wins; the day, the anchor and a named kind it leaves unsaid are carried.
  - `placeRequestFrom` reads a stored reading back defensively. `placeRequestForTurn` is the one entry the route and the evaluation share; it also turns a bare "Anya" into that child's school.
- `homeplaces/service.ts`: the window falls on the day asked (tomorrow's weekday and hours, never "already gone"; labels "tomorrow from 11 am"). A "whose school?" already asked and still unresolved is answered near home with `WHICH_SCHOOL_FALLBACK` said back, never asked again. The home point and the place book come through `PlacesReads`, so the evaluation runs the same code.
- `homeplaces/answer.ts`: `NARROW_LINE` ("You didn't say what kind of place, so I looked for places to go out. Say dinner, a park or a mall to narrow it.") on an assumed kind. `placesOpenQuestion` says what the reply leaves open.
- `conversation/clarify.ts`: a pending `find_places` question is answered by a short reply that carries a kind, a day, a place or a child's name (`carriesPlaceDetail`). "Thanks" or a new request is read as itself.
- Route: each place reply keeps `metadata.placeRequest`, and leaves `clarify` for the narrowing line or "whose school?". The next place turn reads the last reply's reading if it is under 30 minutes old (`lastReplyMetadata`). No-provider stays the honest "Place search isn't switched on…".

## Before and after (golden HT-132, household A, Wed 23 Sep 10:00)

| Turn | Before | After |
|---|---|---|
| "can we go somewhere out tomorrow" | Tell me what kind of place you have in mind… | Here are 2 places for going out near home, open tomorrow from 11 am: Riverside Park, Lakeview Mall. You didn't say what kind of place, so I looked for places to go out. Say dinner, a park or a mall to narrow it. |
| "dinner nearby home" | the same question again | Here are 2 places for dinner near home, open tomorrow from 7:30 pm: Golden Spoon, Saffron Table. |

## Verified

- `npx tsc -p apps/web --noEmit`, `npx tsc -p packages/core --noEmit`: clean.
- `npx vitest run` across the repo: 4042 tests pass. `homeplaces`, `conversation`, `evaluation` and `voicelink` have 855.
- `npm run eval`: 151/151, unsafe 0/19, every blocking gate passes. New cases HT-132 (the two-turn report), HT-133 and HT-134. Place questions in the evaluation now run the real reading, ranking and reply against synthetic golden places, not the engine's placeholder line.
- `npm run lint:secrets`, `lint:boundaries` and `lint:help-links` pass. ESLint on `hometalk-turn.ts` is clean.
- Help: the place paragraph in Talk to WonderHome (body.7) now covers going out, narrowing and "tomorrow", in all eight languages.

## Open

- Not browser-checked against the live project in this session.
- The understanding prompt (`ai/model-client.ts`) still says find_places "needs no parameters". That is still true: the request is read from the person's own words.
