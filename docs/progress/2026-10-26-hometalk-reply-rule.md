# HomeTalk's reply rule: structured, with emojis, cheerful

**Asked** (the owner, 2026-10-26, with a WhatsApp screenshot of a places answer and a long-weekend answer, neither carrying an emoji, the second one dense paragraph): "HomeTalk must structure the message properly, use emojis and make it cheerful. put this as a rule for HomeTalk. see where is the issue, investigate and fix".

## What was wrong
1. **The places answer had no 📍.** `warmReply` skips a reply that already carries an emoji, and its check was `\p{Extended_Pictographic}`, which matches `★` in "★4.8". Every place answer looked already warm. Now only a real emoji counts: `\p{Emoji_Presentation}`, or a symbol followed by U+FE0F.
2. **The long-weekend answer had no emoji.** A status answer was treated as sensitive whenever any fact it could rest on was about a child, money or health (`classesOf` in `hometalk-turn.ts`). In a family calendar that is nearly always true, so most status answers went out bare. The owner's rule only excluded *errors and refusals* about those topics. Now such an answer is led by a neutral mark for its topic (📅 🧾 🩺 🎒 📋), never closed with a smile. Refusals, failures and "Why?" stay plain, as before.
3. **The long weekends were one sentence.** The `free_window` fact (`homebrain/insights.ts`) holds every long weekend joined by semicolons, and the answer said the fact whole. `homebrain/answer.ts` now says each on its own line: `- **Sat 21 Nov to Tue 24 Nov** — Guru Nanak's Birthday (Tue 24 Nov), if Mon 23 Nov is taken off`. The fact given to models is unchanged.
4. **The same crowding elsewhere**, found by the new rule test: an event's guests ("Riya said yes; Dev said yes; Meera said maybe"). `warmth.ts` `unfold` now turns any run of three or more semicolon-joined things after a label into a `◦` line each, whoever wrote the reply, a model included. `parseReply` reads `◦` as a list item; WhatsApp shows it as is.

## Also
- Every answer is led by its topic: from the first screen it links to, else the words of its opening line. A question with no domain mark gets its topic before 🤔. Bills, health, school, places and payments now have their own marks.
- "Save the ones you like…" after places is a 💡 hint line.

## The rule
Written in `CLAUDE.md` (agent platform), `docs/agent-platform.md` (HomeTalk) and the design principles. It is enforced by `packages/core/src/conversation/reply-style.test.ts`, which runs every golden HomeTalk reply through `warmReply`. Every answer, confirmation, question and preview must carry an emoji, and no line may fold three or more things together with semicolons.

## Verified
- `npx vitest run packages/core/src apps/web`: 5,007 passed (new: the rule test, places/★, status-with-a-child, `unfold`, `longWeekendLines`, `◦` in speech).
- `npm run eval` (deterministic): 198/198, Unsafe Action Rate 0/23. HT-119's expected text moved to the new long-weekend line; the facts are the same, so this is not a gate change. No provider run: no prompt changed.
- Typecheck, ESLint on `hometalk-turn.ts`, `npm run build -w apps/web` and `check:bundle`: pass.

## Open
- Nothing needs a person. No migration.
