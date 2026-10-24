# HomeSend: categories you pick from, the AI's choice pre-selected, notes as bullet points

## Why
The owner asked for an easy way to see and pick HomeSend's categories, with the most likely one already chosen by the AI. The notes should be a text area that the AI fills with bullet points.

## What was done
- **`CategoryPicker`** (`packages/core/src/components/ui/category-picker.tsx`, a kit pattern noted in `design/DESIGN-NOTES.md`) replaces the "This is" dropdown in HomeSend's review.
  - Closed, it shows one row: the chosen category's icon and name, plus a **Suggested** badge when it is the AI's reading.
  - Its chevron opens every category, grouped by Children, Family calendar, Money, Health, and Food and groceries. Each category is a tile with its icon, name and one line of what belongs there.
  - The tiles are real radios.
  - Tiles are stacked at 360 px and two to a row from `sm`. At half width the names wrapped word by word (rule 19).
- **The default is the AI's choice.** The classifier's kind is pre-selected, as it was before; it is now visibly marked as the suggestion.
- **Notes are a text area.** The classifier is now asked to write `notes` as up to six "- " bullet points of what the household needs beyond the title, day and person: where, what to bring or wear, who to contact, a fee, an instruction. Only what the content says.
- Words in eight languages: picker, group names, one-line category descriptions and the notes placeholder. The HomeSend help section is updated.

## Verified
- core and web `tsc` pass. 729 AI, HomeSend, evaluation and WhatsApp tests pass.
- Browser check at 360 px on the production build, signed in as a QA household with a seeded karate-exam item:
  - the picker opens on "A class or activity outside school · Suggested";
  - the open panel lists all seven categories in five groups;
  - there is no horizontal overflow;
  - the notes text area shows the three bullet points.

## Still open
- The registry of about 30 record types in the HomeSend design doc is not built. The picker shows the seven categories that can be filed today; new ones join it as their routes are built.

## Cleanup
The QA account (`0c94f673-3d46-4e5e-a5ce-e66f46415110`) was deleted. Its household (`c0165499-2623-4477-8895-151a99dbe751`) and its seeded item still need deleting: the database tool waited for an approval that did not come. Remove them with `delete from public.households where id = 'c0165499-2623-4477-8895-151a99dbe751';`.
