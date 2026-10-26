# HomeSend: bills, receipts and health documents may be added directly (14-054)

**Asked:** the owner, 2026-10-26: "along with the % setting add setting feature to ask user if they want to add entries related to health, entries related to money directly in WonderHome if allowed in responsibilities". This deliberately changes the CLAUDE.md HomeSend invariant ("bills, health documents and receipts always wait"); the line now describes the opt-in.

## What was done
- **Two Admin switches** on Settings → AI Assistant, right under "How sure HomeSend must be to add on its own": "Add money entries directly" (bills, receipts) and "Add health entries directly" (health documents). Off by default; versioned `policies` rows (category `ai_autonomy`) in `household/direct-add-repository.ts` (outside `homesend/`, X-003); anything but a stored `true`, or a failed read, is off. One editor each (rule 23), the kit's `Switch` like "Ask before acting".
- **`decideConfirmation`** (`homesend/confirmation.ts`): with the matching setting on, a bill, receipt or health document is no longer `govern`; it takes the grocery path under its responsibility (`finance.bills_paid`, `finance.budget_reviewed`, `health.records_kept`, added to `AUTO_APPLY_OUTCOMES`), the bar and every other rule. Still waiting or asked: photos and files, duplicates (a receipt by its own same-shop-day-total check), injected instructions, several needs, not sent by a member, a missing required detail, a health document that doesn't name its person. Off, nothing changes.
- **The governed write** (`home-send-auto.ts`): bills and health documents through `createNew` (the person's confirm), receipts through `recordReceipt`, now shared with the receipt confirm (`home-send-writes.ts`). Marked `auto_added`, recorded as undoable changes; a receipt's lines are undone together. A bill is an obligation, never a payment; a health record is private to its person under the same plan check and self-or-guardian RLS. If the write is refused, the review never says it was added.
- **Messages:** WhatsApp drops every number from a bill's or receipt's title and says "a health record" for a health document, naming nobody; the app shows the notice with Undo.
- **Responsibilities:** new starter outcomes "Monthly budget check" and "Health records kept" (Health area, its own icon), so a household can set them to Pre Approved.
- **Words:** settings, WhatsApp, starters and help (HomeSend, Health, "Which model powers the assistant") in all eight languages.

## Verified
- Acceptance AT-N, 63 cases (setting × autonomy × bar × typed/file × missing detail × duplicate, for each kind) plus AT-B01–B04 kept for setting off; `direct-add-repository.test.ts` 4/4; homesend, whatsapp, evaluation, i18n and help suites green.
- Eval HS-36 to HS-38; full deterministic eval 199/199, Unsafe Action Rate 0/25. No provider key in this container, so no provider run.
- e2e "Settings → AI Assistant" specs (phone and desktop) pass against the live project.
- Live write path with a throwaway QA household (results in `docs/testing/2026-10-26-hometalk-homesend-acceptance.md`, AT-N).
- Typecheck and lint clean.

## Open / needs a person
- Most bills and reports arrive as a PDF or photo, and those still always wait, so the switch helps mainly typed or forwarded text. Changing the photo/file rule is the owner's call.
- QA cleanup: see the PR thread for the household and account ids and whether they were removed.

## Where
`packages/core/src/homesend/{auto-add,confirmation}.ts`, `packages/core/src/household/direct-add-repository.ts`, `apps/web/app/(auth)/{home-send-auto,home-send-review,home-send-writes,home-send-actions,consent-actions}.ts`, `apps/web/app/_components/direct-add-switch.tsx`, `apps/web/app/settings/ai/page.tsx`.
