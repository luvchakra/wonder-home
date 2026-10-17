# HomeTalk's welcome after setup, and pets on Home

## What was done

**HomeTalk welcome.** Setup now finishes in HomeTalk. "Go to my home" on the last setup screen, or the end of Language & region when that comes after it, goes to `/ai?welcome=1`.

What the welcome does:
- **It opens once per person.** The opening is written into their HomeTalk conversation as three messages:
  - a welcome by name, who is in the household as WonderHome has it (people, pets, helpers), and what WonderHome looks after;
  - the three ways to talk (type, tap the mic, live conversation);
  - the first question.
- **It asks one question at a time:** what the family loves to eat, what someone doesn't eat, what you enjoy together, then the pets by name (or whether there are any).
- **Answers are kept as said.** Each answer becomes a learned household belief under `household.welcome.<topic>`, stored with the topic and written through `remember`, so it appears in HomeBrain Review to confirm or correct.
- **Some answers end it or keep nothing.** "Nothing" keeps nothing. "Skip" (or the word in the person's language) ends the welcome. A question back ("what can you do?") is not taken as an answer: it goes through the ordinary turn, and the welcome ends there.
- **Spoken answers go through the same path.** Typed, dictated and live answers all go through the ordinary HomeTalk turn (`hometalk-turn.ts`). A pending welcome question is answered before any model routing, so the welcome makes no model call.
- **Words and language.** Every sentence is a catalog key (`areas/welcome/*`, eight languages). The English is the message content (the record), and what the person read is kept beside it as the localized text, as for any translated reply.
- **It speaks as the page opens.** It uses the household's voice provider if there is one, otherwise the browser's voice, always through `speakable`. If the browser blocks sound before a tap, a "Hear the welcome" button appears instead.
- **Where the code lives:**
  - `packages/core/src/conversation/welcome.ts` (rules, tests);
  - `apps/web/app/_lib/hometalk-welcome.ts` (start, pending, continue);
  - `apps/web/app/ai/welcome-voice.tsx`;
  - the turn hook in `apps/web/app/_lib/hometalk-turn.ts`.

**Pets on Home.** Below "Family status", Home shows a Pets card when the household has any active pet. It reuses the Family screen's own row and `PetDetail` panel, opening in place (rule 21), read-only. "See all" links to `/family#pets`, where pets are changed.

**Help.** "HomeTalk" gains a paragraph about the welcome, and "Home and Today" one about the Pets card, both in eight languages and dated 2026-10-17.

## Verified
- `welcome.test.ts`: 9 tests, plus one skip word per language. The help and i18n tests pass (94). Typecheck and ESLint are clean.
- Browser check at 360px against the live project, with a QA household (an adult, a child, a helper, the dog Bruno):
  - the opening names everyone, Bruno and the helper;
  - "Hear the welcome" shows when headless Chromium refuses autoplay;
  - "We love paneer, dal and pasta" was remembered, and the next question followed;
  - "Nothing" kept nothing;
  - "Board games and long drives" was remembered, and Bruno was asked about by name;
  - "skip" ended the welcome;
  - opening `/ai?welcome=1` a second time added nothing;
  - both beliefs reached HomeBrain Review (`certification_items`);
  - Home showed the Pets card with Bruno;
  - no horizontal overflow.

## Still open
- The welcome is deterministic by design. Its answers are stored as said and are not parsed into per-person food preferences. A person can still say "Asmi doesn't eat mushrooms" to HomeTalk at any time.

## Clean-up
- The QA account and household were removed after the merge. The PR thread confirms it.
