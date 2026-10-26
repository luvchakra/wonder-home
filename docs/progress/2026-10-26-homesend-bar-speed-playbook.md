# 2026-10-26: HomeSend bar, speed and scores; WhatsApp undo; playbook groups

PR #357 (HomeSend, WhatsApp) and the playbook PR that followed it, at the owner's requests.

## What changed and why

- **An Admin sets how sure HomeSend must be to add on its own.**
  - The bar was fixed at 95%. It is now set on Settings → AI Assistant: more than 60, 70, 80, 85, 90, 95 (default), 97 or 99%.
  - It is kept as a versioned `ai_autonomy` policy in `household/auto-add-repository.ts`. The pure helpers are in `homesend/auto-add.ts`.
  - `homesend/confirmation.ts` adds an entry on its own only when its score is above the bar and the outcome is Pre Approved. Photos, files, bills, health documents and receipts still always wait.
- **Every HomeSend entry shows its score** ("97% sure"):
  - in the review;
  - on Needs review and Recently handled rows;
  - in the "added on its own" notice.
- **HomeSend reads faster.**
  - `home_send_items` timings showed 9 s for a one-line grocery ask and 25 s for a pasted bill. Nearly all of it was one `claude-opus-5` call.
  - HomeSend now reads with `CLAUDE_INTAKE_MODEL`: `claude-sonnet-5-5` by default, movable with `WONDERHOME_AI_INTAKE_MODEL`.
  - Every reading is still checked word by word (`homesend/verify.ts`).
- **WhatsApp "undo".**
  - After "Added Milk … Say undo to take it back", replying "undo" was kept by HomeSend and "failed safely".
  - `whatsapp/hometalk.ts` now sends an undo, or a short yes or no, to HomeTalk.
- **Household playbook** on Manage Household: grouped by area (Pets, Kids, Money, Home, Household help, …), each a folded card with its count and a chevron.

## Verified

- Typecheck passes; ESLint passes on changed files; `lint:boundaries` and `lint:help-links` pass.
- Unit tests pass: HomeSend, i18n, help, AI, evaluation and WhatsApp suites.
- `npm run build -w apps/web` and `check:bundle` pass; `npm run eval` gates pass.
- `e2e/screens.spec.ts` against the live project, phone and desktop: 10/10 passed. It covers picking 85% and reading it back, and opening a playbook card.

## Open

- The speed-up is not measured live yet: the container has no model key. After the deploy, compare `updated_at - created_at` on new `home_send_items` rows against the 9 s and 25 s above.
- No live `npm run eval -- --provider configured` run was made for the intake model change. CI's understanding gate scores recorded readings.

## Cleanup

Each E2E run deletes its own household and user. After the runs: 0 `@e2e.wonderhome-test.internal` users and 0 "E2E Screens" households.
