# Notes fields grow with their text

Owner request: the school item's "Notes (optional)" was a one-line input that cut long text off.

## Done
- New shared `TextareaField` (`@wonderhome/core/ui/textarea-field`): same label, border, radius, padding and focus as `Field`; 2 rows when empty; grows with content via CSS `field-sizing: content`, with a `useAutoGrow` fallback (resize on input) where the browser lacks it; `max-height: 40vh` then scrolls, so Save stays reachable. Newlines are kept; a counter appears only past 90% of `maxLength`.
- Server unchanged: school `detail` is `z.string().trim().max(2000)` (trim only touches the ends, inner newlines survive). Limits not loosened.
- Replaced the single-line Notes `Field` with `TextareaField` in: school item add (`school-forms.tsx`) and edit (`school-item-controls.tsx`); health issues, records, vitals, appointments, checkups, fitness (goals and sessions), measurement routines; pet add and profile; backup-service forms (`maxLength` 300 kept). Names, titles and subjects stay single-line. The calendar event form and the school activity and exam sheets already used textareas.
- Help guide: no change (it does not describe this field).

## Verified
- `npx vitest run packages/core/src/components/ui/textarea-field.test.tsx`: 7 pass (textarea, label, value and onChange, maxLength and counter, hint/error wiring, fallback sizing).
- `tsc --noEmit -p apps/web` and ESLint on changed files: clean.
- Chromium at 360 px on a standalone page with the same CSS: grew to its content, `scrollWidth` 360 (no horizontal overflow), Save below it.

## Open
- No `.env.local` here, so no signed-in `ui-check.mjs` of the real sheet. Owner check: open a school item, confirm all Notes text shows and grows as you type, Save works.
