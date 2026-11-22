# Needs you moves from Home to Notifications; a newer proposal supersedes the older

Owner, 2026-11-22: "put these on notifications, instead of home page" (screenshot 11:32 PM IST: the Needs you card on Home with two "HomeTalk is waiting for a yes: Move morning walk to 5:50 am / 5:20 am").

## What changed
- **Off Home, onto Notifications.** `_screens/home-dashboard.tsx` no longer renders `NeedsYou`. `/notifications` renders the same component at the top, from the same reader (`loadNeedsYou`), read in the page's one `Promise.all` wave (bounded in the repository: 100 questions, 10 proposals, 10 approvals; three shown). HomeTalk keeps it at the top. A child's or helper's request already under "Waiting for your OK" with its own Approve/Decline is left off the list there (rule 14). The lede counts the items.
- **The bell counts it.** `countNeedsYou` (`hometalk/needs-you-repository.ts`, head-only counts with the same filters) is added to the unread reminders in `_lib/session.ts` `countUnread`, in the shell's existing wave.
- **4a — two proposals for the same routine.** Bug. `recordProposal` wrote each proposal without looking at older ones, so "to 5:50 am" and, 35 s later, "to 5:20 am" (same session, `adjust_schedule`, `outcome_key` "morning walk") both waited. New `conversation/proposal-supersede.ts`: after a proposal is recorded, an older one still waiting in the same conversation for the same one-field edit (`adjust_schedule`, `assign_responsibility`) of the same entity is closed as `expired` with `result.reason = "superseded"` and `supersededBy`, its approval row expired and any reminder resolved — never done, never approved. Payments, orders and new entries never supersede each other; a referral (a child's request waiting on a grown-up) is never closed. No migration: `expired` is an existing status.
- **4b — why "move the morning walk" asked for a yes.** Deliberate, kept. `conversation/consent.ts` `CONFIRM` holds `adjust_schedule` (moving something already on the calendar) and `assign_responsibility`; the 2026-11-14 record-first note and `docs/agent-platform.md` say it "stays consequential in the evaluation's safety gate, so it was not loosened" (eval cases expect `needs_approval`, e.g. "Move it to Friday"). It moves an existing event and re-checks what depended on the old time, unlike recording a new one.
- Docs: CLAUDE.md, `docs/agent-platform.md`, `docs/notifications.md`, `docs/design/2026-11-14-nothing-stuck-in-review.md`. Help: Home (`today-and-home` body 9) and Notifications (body 16) in all eight languages, HomeSend body 9's "on Home" corrected, both sections dated 2026-11-22.

## Verified
- Typecheck clean; ESLint clean on the changed web files; `lint:help-links`, `check:bundle` and `npm run build -w apps/web` pass.
- Vitest: `proposal-supersede.test.ts` (8 new), help, needs-you, consent, proposal-expiry, i18n, engine, reply-style, page-variant, cache-headers, client-writes — all pass.
- `ui-check` against a production build on the live project with a QA household holding two seeded proposals: at 360 px and 1280 px Home has no Needs you card; `/notifications` shows "Needs you 2", both rows with "If nobody answers by …, it won't be done." and Open in HomeTalk; bell "Notifications, 2 unread"; no horizontal overflow. `supersedeOlderProposals` run against that household closed the 5:50 one as `expired`/`superseded`; the bell then read 1.
- Cleanup ran: the QA household (`42bd11fe-…`), its session and actions, and the QA user (`a4b6ed0f-…`) are deleted (counts 0).

## Open / needs a person
- The owner's two live proposals (household `91ade341-…`) were read only, not changed. They expire on their own after 48 h; SQL to supersede the older one now was given to the coordinator.
