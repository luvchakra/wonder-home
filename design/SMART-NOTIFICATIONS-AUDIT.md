# Smart notifications: audit of what exists, and the plan

This is Phase 1 of `Smart_Notification_System_Master_Implementation.md` (2026-09-24, with a 12-screen mockup). It records the notification system as it stood before that work began, and the decision taken on each gap. The stories are module 23 in `backlogs/23-Smart-Notifications.md`.

## What exists (2026-09-24)

| Area | What exists | Where |
|---|---|---|
| **Tables** | `notifications`: one recipient; type `action/decision/risk/completion`; priority `low/normal/high/critical`; `thread_key`; `title`/`body`; `action` jsonb; `outcome_id`; status `generated → delivered → seen → acted → resolved → expired`; `decision_factors`; `scheduled_for`; and the `delivered_at/seen_at/acted_at/resolved_at` timestamps. The partial unique index `notifications_one_open_per_thread` allows one open row per recipient per thread. A trigger keeps the recipient inside the household. | `20260917022411_actionable_notifications.sql` |
| | `notification_events`: append-only; closed event types including `sent`/`delivery_failed`; channel `in_app/push/email/whatsapp`. | same, plus `20260927130000` |
| | `notification_preferences`: per member and channel; `enabled`; quiet hours as whole hours 0–23; `target` (WhatsApp is E.164-checked). | same, plus `20260921080000` |
| **RLS** | Only the recipient can read or update their own notifications; not even a Head of Family can read someone else's. There is no INSERT policy, so only the server creates notifications. Only the member writes their own preferences; an Admin can read them. | |
| **Engine** | `decide.ts`: silence gates (AI can handle it, completion, low-risk change, nothing to do, nobody can act), then recipient (primary → backup → administrator), type, and time (urgent now, otherwise wait out quiet hours). `decideEscalation` and `shouldAutoResolve` are pure functions. | `packages/core/src/notifications/` |
| **Create / deliver** | `createNotification` reads the open thread, then updates it or inserts a row. A new row that is due now goes out through `deliverNotification` on the member's live channels, leaving `sent`/`delivery_failed` events. | `create.ts`, `deliver.ts`, `channels.ts`, `whatsapp.ts` |
| **Callers** | Health appointment and measurement sweeps (daily cron), health checkups overdue (AI tool), AI approvals (`ai/run.ts`), and HomeTalk `set_reminder` (a direct insert, scheduled in the household time zone). | `health/reminders.ts`, `health/routine-reminders.ts`, `ai/executors.ts`, `ai/run.ts`, `conversation/executor.ts` |
| **UI** | `/notifications`: the member's due rows, with tabs All / Action / Decision / Updates, grouped by day, and one "Done"/"Got it" button. The shell badge is a dot. `/settings/notifications` edits each channel's enabled flag, target and quiet hours. | `apps/web/app/notifications/page.tsx`, `settings/notifications` |
| **Cron** | Daily only (Hobby tier): retention, health sweeps, job drain. | `vercel.json`, `api/v1/platform/retention` |

## Gaps, and the decision on each

| # | Gap | Decision |
|---|---|---|
| 1 | Quiet hours are evaluated in **UTC** (`decide.ts`, `channels.ts`), and the health sweeps use UTC day keys. | Every time decision takes the household's time zone. Quiet hours gain minutes (10:30 PM). |
| 2 | `decideEscalation` and `shouldAutoResolve` are never called, and `outcome_id` is never set. | Each notification references its source (`source_type`/`source_id`). A reconcile pass cancels any reminder whose source is done, and escalation runs within a policy's maximum reminder count. |
| 3 | `priority` is never set, and the `critical` mapping in `create.ts` can never happen. | Priority is a policy decision (High/Medium/Low), written on the row. |
| 4 | `delivered`/`seen` are never written. | The feed marks rows seen when a person opens them. `delivered` is stamped when a row becomes due and is shown. |
| 5 | A deferred or scheduled row never gets out-of-app delivery. | Unchanged in this module and documented: in-app delivery works at any precision because a row appears once `scheduled_for` passes. Push and WhatsApp for future rows need a finer trigger than the daily cron. |
| 6 | HomeTalk reminders bypass the engine. | They gain a category and a source, and the same snooze, dismiss and quiet-hours rules. |
| 7 | The household quiet-hours `policies` row is written but never read. | Read as the default for members who have not set their own. |
| 8 | There is no snooze, remind-later, digest, category, per-domain preference or API. | Built: categories, snooze presets, custom reminders, per-category reminder presets, a digest, and a member view. |
| 9 | `presentationFor` splits thread keys on `.`, but keys use `:`, so health reminders show the Home icon. | Presentation comes from `category`, not from parsing a key. |
| 10 | Only the member's in-app quiet hours are used for timing, and guardians or approvers get none. | The recipient's own settings are read for every recipient. |
| 11 | `openThreadKeys` is always `[]`. | Deduplication is the thread key plus the open-per-thread index. Reconcile reads what is open. |
| 12 | `notifications_update_own` has no column restriction, so a recipient can rewrite a row's title or body. | A guard trigger lets a recipient change only state: status, its timestamps, and a forward-only snooze. |
| 13 | Only a daily cron exists. | Reminders are reconciled when a member opens the app (throttled per household) as well as daily, so a change in household state is re-evaluated without a finer cron. |

## Architectural rules kept

- **One notification center.** Manage → Notifications is the notification center, and its settings stay under Settings & Profile → Notifications. No second notification product is added.
- **No copied domain records.** A notification points at its source; a bill's amount and due date are read from `obligations` when they are shown.
- **Deterministic first.** Policies are data (`notifications/policies.ts`), and the engine works with no AI. HomeBrain may add a digest over the same facts, but never an authority it does not have.
- **Actions use domain services.** "Mark paid", "Mark done" and similar actions go through the same domain services the domain's own screen uses. The notification then resolves because its source changed.
