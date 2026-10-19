# How the family is related: Relationships on Members & roles (01-013)

**Date:** 2026-10-19 · **Asked by:** the owner ("add a section to define relationships … Kunal is father of Asmi … Upasana is wife of Kunal … keep it simple, keep it drop down based, and think of any other possibility")

## What was built

- **The section.** Manage Household → Members & roles has a Relationships card right under Family. Each line reads "**Kunal** is father of **Asmi**". Adding or changing a line opens a sheet with three dropdowns (who · how · to whom), and "is" and "of" sit fixed between them.
  - The relation dropdown lists 32 kinds: parents and children, spouses and partners, siblings, grandparents and grandchildren, uncles and aunts, nephews and nieces, cousins, in-laws, guardian and ward.
  - "Something else…" takes the household's own word, such as godmother (rule 20).
  - An Admin adds, changes (pencil) and removes (bin) lines; both icons carry accessible labels. Everyone else reads them with a note that an Admin can change them.
- **The possibilities thought through:**
  - **One line per pair; the other way round is said, not stored.** Under each line: "So Asmi is Kunal's daughter." It is worded from the related person's gender where it is recorded, neutral ("child", "sibling") where it is not, and not guessed where a language has no neutral word (uncle/aunt, in-laws).
  - **Impossible lines are refused, with the reason and the names:**
    - the same person twice;
    - a pair already related, either way round ("Upasana and Kunal are already related. Change that line instead.");
    - a parent, grandparent or parent-in-law younger than the person ("Asmi is younger than Upasana, so that relationship can't be right.");
    - a househelper, or someone not in the family.
  - **Suggestions, never assumptions.** A child's guardians are offered as their parents (worded from the guardian's gender), and children as siblings, elder first. An Admin adds one with a tap; WonderHome writes none on its own. A pair already related is never offered.
  - **Family details.** Each person's details show what they are to the others: "Father of Asmi · Husband of Upasana", "Daughter of Kunal". The line is read in Family's existing parallel wave.
  - **HomeTalk and HomeBrain know it.** "Who is Asmi's father?", "How is Upasana related to Manan?", "Who are Manan's grandparents?", "How is the family related?" and "Does Asmi have a brother?" are answered by rules from every line, both ways round (`conversation/relations.ts`).
    - A missing line is said to be missing, with where an Admin adds it; it is never guessed from guardians.
    - HomeBrain gets one people fact per line ("Kunal is Asmi's father, and Asmi is Kunal's daughter."). Child-class lines go through the model gate like every child fact.
- **Data.** `member_relationships`, migration `20261019140000_member_relationships.sql`, applied live:
  - one row per unordered pair (unique on `least/greatest`), a self-relation check, and a 1–40 character relation;
  - a trigger that keeps both people as this household's active family (adult or child);
  - set-based RLS: `x in (select wh.member_households())` to read, `wh.admin_households()` to write;
  - FK indexes on every member column.

  Writes go through `identity/relationships.ts` (`saveRelationship`/`removeRelationship`, wrapped in `invalidatesContext`). The server re-runs `checkRelationship` before writing, so the database and the sheet agree.

## Verified

- **Unit:** `identity/relationships.test.ts` 11 (reverse wording, checks, suggestions, sentences) and `conversation/relations.test.ts` (readings, the rule never reading "who is …" as a fact to remember, answers both ways round, missing lines). `npm test` 3601 + 64.
- **Database:** `scripts/test-member-relationships-rls.mjs` 7/7 covers the Admin writes, every member reads, an adult or outsider can't write, no helper or outsider row, one row per pair either way, change and remove, and the length check. `test:db` 674/674; the per-row-policy guard passes.
- **Live:** applied through the Supabase MCP, and `verify:live` 305/305 with two new checks (the table landed, and anonymous reads nothing).
- **Eval:** golden household A carries genders and three lines. HT-114 ("Who is Asmi's father?"), HT-115 ("How is Kunal related to Upasana?", answered from a line written the other way) and HT-116 ("Who is Manan's father?", missing, never guessed). 133/133, unsafe 0/18, voice 25/25.
- **Gates:** typecheck, lint, security 12/12, secret lint, bundle, help links, production build.
- **Browser** (360px and 1280px, local build against the live project, QA household with an Admin, a second adult, two children with genders and birth dates, and guardian links):
  - a suggestion added with one tap;
  - "Upasana is wife of Kunal" added through the sheet, showing "So Kunal is Upasana's husband.";
  - "Asmi is mother of Upasana" refused, naming Asmi as the younger, and "Kunal is husband of Upasana" refused as an existing pair;
  - "godmother" typed, then changed to mother ("So Manan is Upasana's son."), then removed;
  - the Family details lines read as above;
  - HomeTalk's three answers came from the lines;
  - no horizontal scroll and no page errors.
  - The browser run caught one real defect, fixed before commit: the age refusal named the two people the wrong way round, and its unit test had encoded the same mistake.

## Still open

- Relationships aren't used anywhere else yet, for example to choose who a child's reminder escalates to. Guardianship stays the authority there.
- The roster ("Who is in the family?") still shows each member's own "Family calls me" label, not the relationship lines. "How is the family related?" is the question that lists them.

## Where the code lives

- `supabase/migrations/20261019140000_member_relationships.sql` and `scripts/test-member-relationships-rls.mjs`
- `packages/core/src/identity/relationships.ts` (+ test) and `packages/core/src/conversation/relations.ts` (+ test)
- `conversation/rules.ts`, plus `context/builders.ts` and `context/repository.ts` for the people facts
- `evaluation/{households,cases,runners}.ts`
- `apps/web/app/(auth)/relationship-actions.ts`, `apps/web/app/household/members/relationships.tsx` and `page.tsx`, `apps/web/app/_lib/relationship-words.ts`
- `apps/web/app/_components/member-detail.tsx` and `apps/web/app/family/page.tsx`
- `apps/web/app/_lib/hometalk-turn.ts`
- the eight `household` and `help` catalogs, `help/guide.ts`, and `scripts/verify-live-project.mjs`

## Follow-up: a father shown as his children's sibling

The owner's report, 2026-10-19: Kunal's details in Family read "Siblings: Older sibling of Asmi Chakraborty, Manan". `siblingOrder` (`identity/households.ts`) gave anyone with a birth date a sibling line against the children — an adult included. It now applies only to a child, compares only active children, and leaves out a child the Relationships call something other than a sibling (a cousin, say). Tests: `households.test.ts` 16 (an adult never has siblings; a removed child and a cousin are left out; a recorded brother still counts). Browser at 360px on a QA family (an adult and two children, all with birth dates): no Siblings line for the adult, "Older sibling of Manan" for Asmi, "Younger sibling of Asmi" for Manan.

## QA cleanup

Ran after #248 merged (2026-10-19): QA account `0468c2b9-77f1-4e97-8a9b-3af7983f5588` and household `18e8069b-3c4b-4c56-9f5c-c5aafd3c1b62` ("QA Relations Home", with its relationship rows and guardian links) deleted. Confirmed by SQL: 0 households, members, relationship rows, guardian links, messages and auth users left for those ids; screenshots and helper scripts removed. The sibling follow-up's QA account `b152f9b4-fd48-4aa0-a2ee-dda849cf2fbb` and household `f1142f7f-c8b0-4428-93cf-86502b3bf703` were deleted after #249 merged; SQL found 0 households, members and auth users left for them.
