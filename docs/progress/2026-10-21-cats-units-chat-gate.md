# The cat darts away and thinks, likes on dishes, Health visibility, units picked, chat waits for its tables

2026-10-21 · stories 08-026, 14-035, 17-009 follow-up, rule 20, 12-015 gate; Health visibility (below)

## What was done, and why

- **The kid cat darts away** (08-026). The owner asked: "if you try to touch the cat, it should quickly move away!"
  - A touch, or a mouse coming near, sends the companion cat to the far side of its card in 140 ms.
  - Where it goes is worked out from where it rests, so it never leaves the card. It returns after 1.5 s.
  - It stays still under reduced motion.
- **Home's cat, whole and thinking** (14-035). The owner saw "only a small portion of the cat", with "no thought bubble". They asked to "use ai to create something new on every page load".
  - On a phone the scene's cat is now drawn whole in the corner (`HeroCat`). It breathes (`wh-cat-bob`) and blinks.
  - It has a thought bubble. The platform model writes a batch per language (`home/cat-thoughts.ts`) and is sent only the language, never household data.
  - The batch is cached per server for 3 h. Every line is checked first, and a different one is picked each load. If there is no key or no batch yet, the cat uses its built-in lines.
- **Date card** (17-009 follow-up). Production has Weather on, but the owner's households never chose an area, so the card showed only the date.
  - An Admin now sees "Show the weather here: pick your area" on the card.
  - The home address is not used silently, because choosing the area is the consent for it to leave.
  - Films still wait on `TMDB_API_KEY`.
- **Units are picked, not typed**. The owner said: "make the unit a drop-down, avoid free text fields as much as possible. add in claude.md".
  - Health readings, their edits and routine readings now use `VITAL_UNITS` through `ComboboxField`, with Add new….
  - HomeSend's grocery unit uses `UNIT_CHOICES`.
  - CLAUDE.md rule 20 now says this outright.
- **Chat switches itself on** (12-015). `chatReady` checks once per server, every 5 min, whether the chat tables exist. Until they do there is no nav item, no Family icon and no page. The chat PR can therefore merge before its migration, and chat appears once the migration lands.

- **Health visibility** (21-010). The owner reported "there is no option to edit people who can see this" and "when i select people i choose, no choice is coming up".
  - Every Health create and edit sheet now has `HealthPrivacyField`.
  - "People I choose" lists the household's other members, with the person's current sharing list ticked. That list is per person (`health_consents`), so the sheet says so.
  - The person and their guardian choose; anyone else sees who chooses.
  - Saving makes the list match (`health/sharing.ts`, tested; `(auth)/health-sharing.ts`).
  - No migration was needed. Appointments still have no edit sheet (21-011).
- **Likes and dislikes on dishes** (10-016). The owner asked: "give like and dislike feature in meals and recipes entries".
  - Meals, own recipes and recipe ideas carry I like this / Not for me. Each is the person's own `food_preferences` row.
  - A tap never overwrites an allergy.
  - Each dish shows who likes it.
- **The Home cat's bubble says useful things** (14-035 follow-up). The owner asked for "useful info … appear randomly, with seamless animation … in cat language".
  - Facts on record (`home/cat-facts.ts`) are said with a "Meow!".
  - The bubble rises and fades at random moments.
  - It is placed in free space: its own row on a phone, beside the cat's head on desktop.

## Verified

- Unit tests: 1033 pass across home, health, meals, i18n, help and chat (cat-thoughts 4, cat-facts 2, health sharing 5).
- Typecheck, lint on the changed files, `lint:help-links` and the production build are clean.
- Browser, production build, QA household (live project):
  - Home bubble at 360, 412, 1024 and 1280px: it never covered the greeting or the date card, and there was no horizontal scroll.
  - Kid cat: two taps, and it stayed inside its card.
  - Meals: a like wrote the preference row; a dislike on a recipe idea was pressed.
  - Health: units offered as a list; a People I choose save wrote the reading and the consent.
  - Family header: one line at 360px.
  - `/chat` before its migration: hidden.
