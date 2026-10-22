# HomeEvents' one door, family moments that are shared, and Ask me about family saving what it hears

**Date:** 2026-10-22 · **Stories:** 26-018, 26-019 (HomeEvents), 04-031 (HomeTalk)

## 26-018 — Every event goes through HomeEvents' one door

The owner asked: "how are 2 entries created for same event, add per design
every event should be created via the HomeEvents module. put guard rails in
place so duplicate entries are not created from various parts of the
application."

### Root cause
- **The pair on screen.** "Bounce School Trip" is a family event (18 Oct, by
  hand). "Field trip to Bounce" is a school entry (20 Oct, from a school notice
  through HomeSend). Both predate 26-017's duplicate check (21 Oct), which
  left this pair for the owner to decide.
- **Why it can happen again.** 26-017's check was each caller's to remember.
  The Calendar sheet, Kids & School and HomeTalk asked. The REST API
  (`POST …/family`, `POST …/school`), a health appointment's calendar entry
  and HomeSend's write did not.

### Fix
- **One door.** `packages/core/src/calendar/add-event.ts`: `addFamilyEvent`
  and `addSchoolItem` are the only way anything is added. They read the
  household's entries on that local day from both tables, through the
  caller's own session, and refuse a match (`sameTitledOnDay`: the same name,
  nearly the same, or the same occasion by another name) unless `confirmed`.
- **Every caller moved:**
  - the Calendar sheet and Kids & School, through their existing Add anyway;
  - HomeTalk: "already on the calendar";
  - HomeSend: refused with the entry's name and never linked, so its undo
    cannot remove the original;
  - a health appointment: not added and not linked, so cancelling it never
    cancels someone else's entry;
  - the REST API: 409 naming the entry, `confirmDuplicate: true` to add
    anyway, and documented in the OpenAPI.
- **The guard rail.** `calendar/single-door.test.ts` fails CI when a file
  outside the door calls `createEvent`/`createSchoolItem`, or inserts into
  `family_events`/`school_items` outside their repositories. The repositories'
  own integration sync is keyed by the provider's id and is the one exception.
  Checked: the test flags all seven callers as they stood on `main`.

### Left for the owner
Their existing pair is real household data, so it was not touched.
"Field trip to Bounce" (`school_items` `a0c125d7…`) can be removed in
Kids & School, or undone in HomeSend.

## 26-019 — A family moment is shared family time

"Only one member of family is part of this event, why is it being called as
Family moment?" The Family page took the first *protected* event of any kind
as its moment, so a protected school trip with one child going led the page.
Home's version trusted the event's kind alone and never counted who was
going.

`isFamilyMoment` (`family/schedule.ts`) now decides it for both screens. A
moment must:
- be a family kind: family time, outing, birthday, gathering, travel or
  special occasion;
- not be cancelled;
- have two or more people going, or nobody named (then it is the household's).

Being protected alone never makes one. Home heads anything else by its kind
(School event, Appointment) or as "Coming up" (new key `home.nextMoment`,
eight languages), never with the family heart.

## 04-031 — Ask me about family saves what is said about someone else

"Upasana birthday is 24 June 1986", said while Manan's school hours were
asked, got "I couldn't save that just now". The conversation rows and the
database log showed two causes:
1. **Read against the wrong question.** The sentence was read only against the
   waiting question. On its second try it became a note on Manan's school
   hours.
2. **Every person note was refused.** The note failed with
   `memories_key_check`: `amafMemoryKey` put the member's full uuid in the
   key, and `memories.key` must match `^[a-z][a-z0-9_.]{1,60}$`. No note about
   a person had ever been kept.

Fix (`amaf/session.ts`, `amaf/facts.ts`, `_lib/hometalk-amaf.ts`):
- **Facts carry a `cue`** (birthday, anniversary, phone, school hours). A
  sentence naming another household member is read against those for that
  person, saved for them, and the waiting question asked again.
- **Never the wrong subject.** A sentence naming someone else is never saved
  to the question's subject ("Manan's birthday is…" while Upasana's was
  asked), and never kept as a note on it.
- **The note key fits.** It keeps 12 hex characters of the member id. A test
  holds every fact's key to the constraint.
- **"Put it back"** re-applies what the last undo took back, through the same
  service, within the hour and only if nothing was saved since.
- **Help ¶17** says both, in eight languages.

Upasana's birthday is still empty in the owner's household. Saying it again in
HomeTalk after this deploys saves it, with its own undo.

## Verified
- **Unit tests.** 1,497 across the affected modules pass, including:
  - the gateway's tests, with the Bounce pair both ways;
  - `single-door.test.ts`;
  - `isFamilyMoment`'s golden cases;
  - the interview cases for the owner's own sentence.
- **Evaluation.** `npm run eval`: 155/155, 0 unsafe actions.
- **Static checks.** Typecheck and ESLint on the changed files are clean.
- **Browser.** A production build against the live project, signed in as a QA
  household at 360px and 1280px, with a protected one-person school trip, a
  protected one-person outing and a family picnic. Family and Home both chose
  the picnic. With the picnic cancelled, Family showed its empty prompt and
  Home headed the trip "School event".

## Cleanup
The QA account, household and seeded events were deleted after the merge (see
the PR).
