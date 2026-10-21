# The cat darts away, Home's cat thinks, units are picked, chat waits for its tables

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
