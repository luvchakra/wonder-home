# Kids & School: update/remove, chevron detail, and a screenshot import

## What happened

The next four items from the 14-item batch, all landing on the same
`/school` page: add homework from a screenshot (item 6), update/remove an
existing entry (item 7), a chevron with full detail on every card (item 9),
and the same add/update/remove for events and exams (item 10) — the last
three shared one implementation, since events and exams are already
`school_items` rows with `kind: "event" | "exam"`.

## What shipped

**Update and remove.** `updateSchoolItem`/`cancelSchoolItem`
(`school/repository.ts`) — the missing other half of `createSchoolItem`.
Remove is a status flip to `cancelled`, not a delete: the column already
exists (`SCHOOL_ITEM_STATUSES` already carried it, unused by any UI until
now) for exactly this, the same reasoning `retirePolicy` uses elsewhere —
provider-cancelled and household-withdrawn end up in the same place, which
is correct, since neither is live work anymore. New server actions
(`updateSchoolItemAction`, `cancelSchoolItemAction`) follow the same
`requireMembership`-then-let-RLS-narrow pattern `createSchoolItemAction`
already used, rather than an admin-only gate — school write access is
`wh.may_see_child` (admin, the child themself, or a registered guardian),
not household-admin, and the existing add control was already shown to
every adult member on that basis.

**Chevron detail, on both lists.** The Homework tab and the Calendar tab's
"Events & exams" section both went from a flat `ActionRow` to
`ExpandableRow` (the same component Family/Househelper/Home already use),
opening onto a new `SchoolItemDetail` — the edit form pre-filled, plus a
destructive-confirm "Remove" pill, mirroring `ResponsibilityRow`'s
"row opens onto its own edit form" shape. `SchoolItem` gained a `detail`
field (the column already existed, written by `createSchoolItem`, but
never read back or exposed in the type) so notes captured at creation — or
by the screenshot import below — survive being edited afterwards.

**Screenshot import.** `AddHomeworkButton`'s sheet gained an "Upload a
screenshot instead" control above the existing manual form. It never
creates a row on its own: a photo is sent to whichever AI provider the
household has configured (the same `resolveModelKey` precedence — household
key, then platform key, then none — the conversation engine already uses),
a new `extractSchoolItemFromImage` (`ai/vision-extract.ts`) reads it
through Claude, Gemini or OpenAI's own structured-output APIs depending on
which one answers, and the result — title, kind, subject, a due date only
when one was actually printed and resolvable to a real calendar date, and
notes — pre-fills the *same* manual form for the household to review and
submit. Nothing is invented: the prompt explicitly refuses to guess a date
from a bare "Friday" with no date printed anywhere, and a `readable: false`
result (or any provider failure) falls back to the same "fill in by hand"
form with a plain error, never a broken state. The image itself is never
stored — `school_documents` exists in the schema for that and stays
untouched; this reads the photo once and discards it.

## Verified

- `npm run verify` clean: typecheck, lint, migrations/embeds/boundaries/
  secrets lint, tracker/brand checks, security suite, unit tests, 239 DB/RLS
  tests, production build, 256 E2E.
- Browser-verified end to end against a live QA household (`pro` plan —
  `school.connector` is not on the default `free` plan, so a fresh QA
  household needs a subscription row before `/school` renders anything):
  added homework, expanded the row, edited its notes, saved, confirmed the
  edit persisted (`detail` column) and reloaded correctly; removed it and
  confirmed `status` flipped to `cancelled` in the live database rather
  than a hard delete.
- Screenshot import: confirmed the "no AI provider configured" fallback
  end to end — this deployment has no `WONDERHOME_AI_KEY` set and the QA
  household has no key of its own, so `resolveModelKey` correctly returns
  `none` and the sheet shows "No AI provider is set up for this household
  yet. Fill in the details below by hand, or set one up in Settings,"
  with the manual form beneath it still fully usable (confirmed a manual
  add still works right below that message). The actual `readable: true`
  extraction path — reading real text out of a photo — is implemented
  against each provider's documented vision/structured-output API and
  passes typecheck, but per CLAUDE.md ("a provider is live only once it is
  configured") it could not be exercised live in this environment, since
  no provider key is configured for this deployment.

## What's still open

- Live end-to-end verification of the actual image-reading path needs a
  configured provider key in this deployment — worth a follow-up pass once
  one exists, with a handful of real homework-sheet photos.
- The remaining items (Groceries dropdown suggestions for name/category/
  unit, Groceries chevron cards) are tracked separately.
- No backlog story number maps to this work — household-reported UI/UX
  polish and one new capability (screenshot import), not a scheduled
  story.

## Where the code lives

- `packages/core/src/school/repository.ts` — `updateSchoolItem`, `cancelSchoolItem`
- `packages/core/src/school/items.ts` — `SchoolItem.detail`
- `packages/core/src/school/connector.ts` — `detail: null` on provider-translated items
- `packages/core/src/ai/vision-extract.ts` — `extractSchoolItemFromImage`
- `apps/web/app/(auth)/school-actions.ts` — `updateSchoolItemAction`,
  `cancelSchoolItemAction`, `extractSchoolItemFromPhotoAction`
- `apps/web/app/_components/school-item-controls.tsx` — `SchoolItemDetail`
- `apps/web/app/_components/school-forms.tsx` — screenshot upload wired
  into `AddHomeworkButton`
- `apps/web/app/school/page.tsx` — `ExpandableRow` on both lists
