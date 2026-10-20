# Ask me about family (AMAF) ships — 04-030

2026-10-21

## What it is
"Ask me about my family", typed or tapped as a chip in HomeTalk, starts a short interview. It asks one question at a time, decided by rules (`packages/core/src/amaf/`), about what the household doesn't have yet: allergies, birthdays and anniversaries, school, class and hours, diet, address, work, relationships, phones, activities, duty owners, helper days, pets and their vet, likes and dislikes, and bills.
- **Where answers go.** Each answer goes through its own module's service under the person's own session (`apps/web/app/_lib/hometalk-amaf.ts`), the same way the screen would save it.
- **The record.** Each answer is recorded in `amaf_answers`, which powers undo and says where a fact came from.
- **Disagreements.** An answer that disagrees with what's on record is said back with the record's source, and nothing changes until the person decides.
- **Answers it can't use.** One it can't place is kept as a note. An unclear answer is asked once more, then kept as a note.
- **Who can use it.** Adults only, in the app only. Skip, stop and undo all work, and a mode line shows the section and how many questions are left.

## Fixed while shipping
- **A name that is nobody in the family.** "Zoya is allergic to peanuts" was read as an allergy to "zoya peanuts" for no one. Now the person's words are kept as a note (`readAllergies` returns `unknown`), with a test.
- **"Do you pay a electricity bill?"** The English question is reworded so it needs no article.

## Verified
- **Tests and gates.**
  - Unit tests 3,925 (amaf 26 assertions groups); eval gates pass (unsafe 0/19).
  - Typecheck, lint on changed files, bundle check, help links and tracker check all pass.
- **On the live database** (local production build, 360px): the birthday and address were saved to Family and Home, a twice-unclear diet answer was kept as a note, Stop counted 3 learned, the mode line read "12 questions left" with Skip and Stop, and there was no overflow.
- **The table** `amaf_answers` was already live (owner's SQL).

## Help
Talk to WonderHome, ¶17, in all eight languages, using each language's own chip label; search keywords added.

## Open
- Undo after an answer kept as a note names the last saved section rather than the note. It is honest but could be clearer.
- No golden eval cases yet. AMAF is rules-only and covered by unit tests.

## Cleanup
The QA user and household for this check were removed after the merge (see the PR).
